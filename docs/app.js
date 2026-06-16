/* ============================================================
   Murmur — landing page behavior
   1. Sticky nav frosts (and flips dark→light) once past the hero.
   2. The dictation pill widget loops idle→…→done forever.
   3. The two app mockups are rendered at 900×620 and scaled to fit.
   ============================================================ */
(function () {
  'use strict';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1 · sticky nav frosting ──────────────────────────────── */
  var nav = document.querySelector('[data-nav]');
  if (nav) {
    var onScroll = function () {
      var frost = window.scrollY > window.innerHeight * 0.82;
      nav.classList.toggle('nav--frosted', frost);
      nav.setAttribute('data-theme', frost ? 'light' : 'dark');
    };
    var raf = 0;
    window.addEventListener('scroll', function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(onScroll);
    }, { passive: true });
    onScroll();
  }

  /* ── 2 · looping dictation pill ───────────────────────────── */
  var ORDER = ['idle', 'listening', 'transcribing', 'polishing', 'done'];
  var DURS = [1500, 2700, 1500, 1400, 2400];

  function glyph(cls, inner) { return '<span class="' + cls + '">' + inner + '</span>'; }
  function meta(text, extra) { return '<span class="pill__meta ' + (extra || '') + '">' + text + '</span>'; }
  function ico(id, s) { return '<svg width="' + s + '" height="' + s + '"><use href="#' + id + '"/></svg>'; }

  function livedot() {
    return '<span class="livedot">' +
      '<span class="livedot__ring" style="animation:mm-ring 1.8s ease-out 0s infinite"></span>' +
      '<span class="livedot__ring" style="animation:mm-ring 1.8s ease-out .9s infinite"></span>' +
      '<span class="livedot__core"></span></span>';
  }
  function waveform(bars) {
    var s = '<div class="wf">';
    for (var i = 0; i < bars; i++) {
      var base = 0.26 + ((Math.sin(i * 1.7) + 1) / 2) * 0.42;
      var dur = 0.62 + ((Math.cos(i * 0.9) + 1) / 2) * 0.62;
      var delay = (i * 0.067) % 1.0;
      s += '<span style="--b:' + base.toFixed(3) + ';transform:scaleY(' + base.toFixed(3) +
        ');animation:mm-wf ' + dur.toFixed(2) + 's ease-in-out ' + delay.toFixed(2) + 's infinite"></span>';
    }
    return s + '</div>';
  }
  function dots() {
    return '<span class="dots">' +
      '<span style="animation:mm-dot 1.1s ease-in-out 0s infinite"></span>' +
      '<span style="animation:mm-dot 1.1s ease-in-out .16s infinite"></span>' +
      '<span style="animation:mm-dot 1.1s ease-in-out .32s infinite"></span></span>';
  }

  function buildPill(state) {
    switch (state) {
      case 'listening':
        return glyph('pill__glyph', livedot()) + waveform(22) + meta('0:04', 'pill__meta--accent');
      case 'transcribing':
        return glyph('pill__glyph', '<span class="spinner"></span>') +
          '<span class="pill__center pill__center--label" style="color:var(--ink-soft)">Transcribing' + dots() + '</span>' +
          meta('whisper', '');
      case 'polishing':
        return glyph('pill__glyph', '<span class="glyph-polish">' + ico('i-sparkle', 16) + '</span>') +
          '<span class="pill__center pill__center--label" style="color:var(--accent)">Polishing' + dots() + '</span>' +
          meta('auto-edit', '');
      case 'done':
        return glyph('pill__glyph', '<span class="glyph-done">' + ico('i-check', 16) + '</span>') +
          '<span class="pill__center pill__center--done">Inserted</span>' +
          meta('32 wds', '');
      default: // idle
        return glyph('pill__glyph pill__glyph--idle', ico('i-mic', 17)) +
          '<span class="pill__center pill__center--idle">Hold to talk</span>' +
          meta('⌥ Space', '');
    }
  }

  function startPill(el) {
    var width = parseInt(el.getAttribute('data-width'), 10) || 320;
    el.style.width = width + 'px';
    if (reduceMotion) { el.innerHTML = buildPill('done'); return; }
    var idx = 0;
    el.innerHTML = buildPill(ORDER[idx]);
    (function tick() {
      setTimeout(function () {
        idx = (idx + 1) % ORDER.length;
        el.innerHTML = buildPill(ORDER[idx]);
        tick();
      }, DURS[idx]);
    })();
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-pill]'), startPill);

  /* ── 3 · scale the 900×620 app mockups to their column ────── */
  var DW = 900, DH = 620;
  function fitOne(frame) {
    var win = frame.querySelector('.shot-window');
    if (!win) return;
    var scale = Math.min(1, frame.clientWidth / DW);
    win.style.transform = 'scale(' + scale + ')';
    frame.style.height = Math.round(DH * scale) + 'px';
  }
  function fitAll() { Array.prototype.forEach.call(document.querySelectorAll('[data-fit]'), fitOne); }
  fitAll();
  window.addEventListener('resize', fitAll);
  window.addEventListener('load', fitAll);
  if (window.ResizeObserver) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-fit]'), function (frame) {
      new ResizeObserver(function () { fitOne(frame); }).observe(frame);
    });
  }
})();
