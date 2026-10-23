// One consistent line-icon set (24px grid, 1.6 stroke). Each icon maps to a
// navigation destination or an action; no decorative icons.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      {children}
    </svg>
  );
}

export const IconOverview = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
  </Base>
);
export const IconPlan = (p: P) => (
  <Base {...p}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
    <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
  </Base>
);
export const IconRadar = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 12 18 6" />
    <circle cx="16.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
  </Base>
);
export const IconResearch = (p: P) => (
  <Base {...p}>
    <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h6" />
    <path d="M9 8h6M9 11.5h3" />
    <circle cx="16.5" cy="15.5" r="3" />
    <path d="m18.7 17.7 2 2" />
  </Base>
);
export const IconPortfolio = (p: P) => (
  <Base {...p}>
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z" />
    <path d="M15 3.9A8.5 8.5 0 0 1 20.1 9H15z" />
  </Base>
);
export const IconWatch = (p: P) => (
  <Base {...p}>
    <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" />
  </Base>
);
export const IconWatchFilled = (p: P) => (
  <Base {...p} fill="currentColor">
    <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" />
  </Base>
);
export const IconSettings = (p: P) => (
  <Base {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Base>
);
export const IconRefresh = (p: P) => (
  <Base {...p}>
    <path d="M19.5 11A7.5 7.5 0 0 0 6 6.7L4.5 8.5" />
    <path d="M4.5 4.5v4h4" />
    <path d="M4.5 13A7.5 7.5 0 0 0 18 17.3l1.5-1.8" />
    <path d="M19.5 19.5v-4h-4" />
  </Base>
);
export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Base>
);
export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);
export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
export const IconChevronRight = (p: P) => (
  <Base {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Base>
);
export const IconChevronDown = (p: P) => (
  <Base {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Base>
);
export const IconUpload = (p: P) => (
  <Base {...p}>
    <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" />
    <path d="M4.5 15v3A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
  </Base>
);
export const IconAlert = (p: P) => (
  <Base {...p}>
    <path d="M12 4 3.5 19h17z" />
    <path d="M12 10v4M12 16.5v.5" />
  </Base>
);
export const IconInfo = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8v.5" />
  </Base>
);
export const IconCompare = (p: P) => (
  <Base {...p}>
    <path d="M4 18 9 11l4 4 7-9" />
    <path d="M4 14l5-3" strokeDasharray="2 2.5" />
  </Base>
);
export const IconArrowUpRight = (p: P) => (
  <Base {...p}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Base>
);
export const IconLogout = (p: P) => (
  <Base {...p}>
    <path d="M14 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h8" />
    <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
  </Base>
);
export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5" />
  </Base>
);
export const IconFilter = (p: P) => (
  <Base {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Base>
);
export const IconBell = (p: P) => (
  <Base {...p}>
    <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Base>
);
