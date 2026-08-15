const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export default function GuideDirectoryIcon({ name }) {
  if (name === "schedule") return <svg {...common}><path d="M7 3v3M17 3v3M4 9h16"/><rect x="4" y="5" width="16" height="16" rx="3"/><path d="m9 14 2 2 4-4"/></svg>;
  if (name === "courses") return <svg {...common}><path d="M6 21V4m0 1h10l-2.4 3L16 11H6"/><path d="M4 21h8"/></svg>;
  if (name === "rules") return <svg {...common}><path d="M6 3h10a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2Z"/><path d="M6 18a2 2 0 0 1 2-2h10M10 8h5M10 11h5"/></svg>;
  if (name === "dining") return <svg {...common}><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M15 3v18M15 3c3 1.5 4 4 4 7h-4"/></svg>;
  if (name === "local") return <svg {...common}><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>;
  return <svg {...common}><path d="M7.2 3.5h2.1l1.1 4-1.8 1.5a14 14 0 0 0 6.4 6.4l1.5-1.8 4 1.1v2.1a3.7 3.7 0 0 1-4 3.7A16.2 16.2 0 0 1 3.5 7.5a3.7 3.7 0 0 1 3.7-4Z"/></svg>;
}
