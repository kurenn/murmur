// icons.tsx — the inline stroke-icon set, ported 1:1 from design/theme.jsx MMIcon.
// 24×24 viewBox, stroke-width ~1.6, round caps/joins, currentColor.

import type { ReactNode } from "react";

export interface IconProps {
  size?: number;
  /** stroke width */
  sw?: number;
  fill?: string;
}

function svg(paths: ReactNode, { size = 18, sw = 1.6, fill = "none" }: IconProps = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  );
}

export type IconName =
  | "mic"
  | "check"
  | "sparkle"
  | "command"
  | "clock"
  | "globe"
  | "sliders"
  | "chevron"
  | "chip"
  | "bolt"
  | "keyboard"
  | "search"
  | "waveDot"
  | "shield";

export const Icons: Record<IconName, (p?: IconProps) => ReactNode> = {
  mic: (p) =>
    svg(
      <>
        <rect x="9" y="2.5" width="6" height="12" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
      </>,
      p,
    ),
  check: (p) => svg(<path d="M5 12.5l4.5 4.5L19 7" />, { sw: 2, ...p }),
  sparkle: (p) => svg(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />, p),
  command: (p) =>
    svg(<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />, p),
  clock: (p) =>
    svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>,
      p,
    ),
  globe: (p) =>
    svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z" />
      </>,
      p,
    ),
  sliders: (p) =>
    svg(
      <>
        <path d="M5 8h9M18 8h1M5 16h1M10 16h9" />
        <circle cx="16" cy="8" r="2" />
        <circle cx="8" cy="16" r="2" />
      </>,
      p,
    ),
  chevron: (p) => svg(<path d="M6 9l6 6 6-6" />, { sw: 1.8, ...p }),
  chip: (p) =>
    svg(
      <>
        <rect x="6" y="6" width="12" height="12" rx="2.5" />
        <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
      </>,
      p,
    ),
  bolt: (p) => svg(<path d="M13 2L4 14h7l-1 8 9-12h-7z" />, p),
  keyboard: (p) =>
    svg(
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M16.5 13h.01M9 13h6" />
      </>,
      p,
    ),
  search: (p) =>
    svg(
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4-4" />
      </>,
      p,
    ),
  waveDot: (p) => svg(<path d="M4 12h2M9 7v10M14 4v16M19 9v6M22 12h0" />, p),
  shield: (p) => svg(<path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6z" />, p),
};
