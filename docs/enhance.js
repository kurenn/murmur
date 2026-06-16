/* ============================================================
   enhance.js — premium-scroll experiment (additive layer).
     · Lenis            → buttery inertial scrolling
     · GSAP ScrollTrigger → each section reveals as a scene
     · Three.js         → a gentle painted backdrop in the dark sections
   Everything here is guarded: if a library is missing, WebGL is
   unavailable, or the user prefers reduced motion, the base page is
   left untouched and still works.
   ============================================================ */
(function () {
  'use strict';

  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var Lenis = window.Lenis;
  var THREE = window.THREE;
  var HAS_GSAP = !!(gsap && ScrollTrigger);

  /* ── 1 · Lenis smooth scroll ──────────────────────────────── */
  var lenis = null;
  if (Lenis && !REDUCE) {
    try {
      lenis = new Lenis({
        lerp: 0.085,          // inertia — lower = smoother/longer glide
        wheelMultiplier: 0.95,
        smoothWheel: true,
        touchMultiplier: 1.4
      });
      if (HAS_GSAP) {
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
        gsap.ticker.lagSmoothing(0);
      } else {
        (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
      }
      // route in-page anchor jumps through Lenis
      document.querySelectorAll('a[href^="#"]').forEach(function (a) {
        a.addEventListener('click', function (e) {
          var id = a.getAttribute('href');
          if (!id || id.length < 2) return;
          var target = document.querySelector(id);
          if (!target) return;
          e.preventDefault();
          lenis.scrollTo(target, { offset: -68, duration: 1.15 });
        });
      });
    } catch (err) { lenis = null; }
  }

  /* ── 2 · GSAP ScrollTrigger — cinematic reveals ───────────── */
  if (HAS_GSAP && !REDUCE) {
    gsap.registerPlugin(ScrollTrigger);
    var root = document.documentElement;
    root.classList.add('enhanced');

    var EASE = 'power3.out';

    // Hero entrance — staggered text, then the pill fades up.
    var heroText = ['.hero__eyebrow', '.hero__h1', '.hero__sub', '.hero__cluster']
      .map(function (s) { return document.querySelector(s); }).filter(Boolean);
    var heroWidget = document.querySelector('.hero__widget');
    gsap.set(heroText, { opacity: 0, y: 30 });
    if (heroWidget) gsap.set(heroWidget, { opacity: 0 });
    var intro = gsap.timeline({ delay: 0.12 });
    intro.to(heroText, { opacity: 1, y: 0, duration: 1.0, ease: EASE, stagger: 0.11 });
    if (heroWidget) intro.to(heroWidget, { opacity: 1, duration: 1.1, ease: 'power2.out' }, '-=0.5');

    // Every .reveal block enters as a scene: its children cascade in.
    gsap.utils.toArray('.reveal').forEach(function (block) {
      var kids = block.children.length ? Array.prototype.slice.call(block.children) : [block];
      gsap.from(kids, {
        opacity: 0, y: 40, scale: 0.985, duration: 1.0, ease: EASE, stagger: 0.09,
        scrollTrigger: { trigger: block, start: 'top 80%', once: true }
      });
    });

    // Gentle parallax — hero pill drifts as you leave the hero…
    if (heroWidget) {
      gsap.to(heroWidget, {
        yPercent: 16, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
      });
    }
    // …and the app windows get a touch of depth.
    gsap.utils.toArray('.shot-frame').forEach(function (frame) {
      gsap.fromTo(frame, { yPercent: 5 }, {
        yPercent: -5, ease: 'none',
        scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    // Recompute trigger positions once fonts + the scaled mockups settle.
    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
    setTimeout(function () { ScrollTrigger.refresh(); }, 800);
  }

  /* ── 3 · Three.js painted backdrop (dark sections only) ───── */
  if (THREE && !document.documentElement.classList.contains('no-paint')) {
    var FRAG = [
      'precision highp float;',
      'uniform float uTime; uniform vec2 uRes; uniform vec3 uA; uniform vec3 uB; uniform float uI;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }',
      'float noise(vec2 p){ vec2 i=floor(p), f=fract(p);',
      '  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));',
      '  vec2 u=f*f*(3.-2.*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }',
      'float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=.5; } return v; }',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / uRes.xy;',
      '  vec2 p = (uv - .5) * vec2(uRes.x/uRes.y, 1.) * 2.4;',
      '  float t = uTime*0.045;',
      '  vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2,-t)));',          // domain warp → painterly flow
      '  vec2 r = vec2(fbm(p + 3.*q + vec2(1.7,9.2) + .15*t), fbm(p + 3.*q + vec2(8.3,2.8) - .12*t));',
      '  float f = fbm(p + 3.4*r);',
      '  vec3 col = mix(uA, uB, clamp(f*1.5, 0., 1.));',
      '  float brush = smoothstep(0.18, 0.92, f) * (0.55 + 0.7*r.x);',
      '  float vig = smoothstep(1.15, 0.32, length(uv-0.5)*1.45);',           // fade toward edges
      '  gl_FragColor = vec4(col, brush * uI * vig);',
      '}'
    ].join('\n');
    var VERT = 'void main(){ gl_Position = vec4(position, 1.0); }';

    var paints = [];
    function makePaint(section, colA, colB, intensity) {
      if (!section) return;
      var renderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false });
      } catch (e) { return; } // no WebGL → skip silently
      var holder = document.createElement('div');
      holder.className = 'paint-bg';
      section.insertBefore(holder, section.firstChild);

      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(0x000000, 0);
      holder.appendChild(renderer.domElement);

      var scene = new THREE.Scene();
      var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      var uniforms = {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uA: { value: new THREE.Color(colA[0], colA[1], colA[2]) },
        uB: { value: new THREE.Color(colB[0], colB[1], colB[2]) },
        uI: { value: intensity }
      };
      var mat = new THREE.ShaderMaterial({
        uniforms: uniforms, vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, depthTest: false, depthWrite: false
      });
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      scene.add(mesh);

      function resize() {
        var w = section.clientWidth, h = section.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        uniforms.uRes.value.set(w * dpr, h * dpr);
      }
      resize();
      if (window.ResizeObserver) new ResizeObserver(resize).observe(section);
      window.addEventListener('resize', resize);

      var inst = { uniforms: uniforms, render: function () { renderer.render(scene, camera); } };
      paints.push(inst);
      return inst;
    }

    // Deep blue → violet wash; gentle on the dark hero and closing bookend.
    makePaint(document.querySelector('.hero'),    [0.20, 0.36, 0.86], [0.44, 0.28, 0.74], 0.20);
    makePaint(document.querySelector('.closing'), [0.20, 0.36, 0.86], [0.42, 0.30, 0.72], 0.17);

    if (paints.length) {
      function frame(t) {
        for (var i = 0; i < paints.length; i++) { paints[i].uniforms.uTime.value = t; paints[i].render(); }
      }
      if (REDUCE) {
        frame(8.0); // one painterly still frame, no motion
      } else if (HAS_GSAP) {
        gsap.ticker.add(function () { frame(gsap.ticker.time); });
      } else {
        (function loop(ms) { frame(ms / 1000); requestAnimationFrame(loop); })(0);
      }
    }
  }
})();
