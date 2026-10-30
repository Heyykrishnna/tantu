import type { ReactNode } from "react";

const shapes = {
  tasks: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12 2.3 2.3 4.7-4.8" />
    </>
  ),
  pages: (
    <>
      <path d="M6 3.5h8l4 4V20H6z" />
      <path d="M14 3.5V8h4M9 12h6M9 16h6" />
    </>
  ),
  activity: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  settings: (
    <>
      <path d="m9 4 1-2h4l1 2 2 1 2 .2 2 3-1 2v3l1 2-2 3-2 .2-2 1-1 2h-4l-1-2-2-1-2-.2-2-3 1-2v-3l-1-2 2-3L7 5z" />
      <circle cx="12" cy="11.5" r="3" />
    </>
  ),
  operations: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 9v11m4-7h5m-5 3h3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  down: <path d="m7 10 5 5 5-5" />,
  right: <path d="m10 6 6 6-6 6" />,
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </>
  ),
  moon: <path d="M20 15a8.5 8.5 0 0 1-11-11 8.5 8.5 0 1 0 11 11Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  logout: (
    <>
      <path d="M10 4H5v16h5m5-12 4 4-4 4m-6-4h10" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
      <path d="m8.5 11.5 2.5 2.5 4.5-5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 10h18m-13 4h1m3 0h1m3 0h1m-9 3h1m3 0h1" />
    </>
  ),
  flag: <path d="M5 21V4c5-4 9 4 14 0v10c-5 4-9-4-14 0" />,
  file: (
    <>
      <path d="m8 13 6-6a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L12 3a3 3 0 0 1 4 0m-9 13 8-8" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 6 8 7 8-7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 4v6h-6M4 20v-6h6" />
      <path d="M5.2 8a8 8 0 0 1 13.5-3L20 7M4 17l1.3 2A8 8 0 0 0 18.8 16" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15m-8 4v7m4-7v7" />
    </>
  ),
  history: (
    <>
      <path d="M3 4v6h6" />
      <path d="M4 10a8 8 0 1 1 0 5m8-8v5l3 2" />
    </>
  ),
  folder: <path d="M3 19V5h6l2 3h10v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  external: <path d="M8 5h11v11M19 5 5 19" />,
  circle: <circle cx="12" cy="12" r="8" />,
  layers: (
    <>
      <path d="m12 3 10 6-10 6L2 9zm-9 11 9 5 9-5M3 18l9 5 9-5" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  capture: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
    </>
  ),
  promise: (
    <>
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  decision: (
    <>
      <path d="m9 12 2 2 4-4" />
      <path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="5" r="3" />
      <circle cx="5" cy="19" r="3" />
      <circle cx="19" cy="19" r="3" />
      <path d="M7.5 17 10 7.5m6.5 9.5L14 7.5" />
    </>
  ),
  plan: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M8 14h4M8 18h6" />
    </>
  ),
  kit: (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </>
  ),
  brain: (
    <>
      <path d="M12 2a4.5 4.5 0 0 0-4.5 4.5c0 .7.16 1.37.45 1.97A4.5 4.5 0 0 0 4.5 13a4.5 4.5 0 0 0 3 4.24V18a3 3 0 0 0 6 0v-.76A4.5 4.5 0 0 0 16.5 13a4.5 4.5 0 0 0-3.45-4.53c.29-.6.45-1.27.45-1.97A4.5 4.5 0 0 0 12 2z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof shapes;

export function Icon({
  name,
  className = "size-4.5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {shapes[name]}
    </svg>
  );
}
