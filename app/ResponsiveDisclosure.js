"use client";

import { useEffect, useRef } from "react";

// Native keyboard/touch disclosure. Viewport defaults change only on crossing
// the breakpoint, never on ordinary rerenders (which would discard user choice).
export default function ResponsiveDisclosure({ desktopOpen = false, children, ...props }) {
  const element = useRef(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const applyDefault = () => { if (element.current) element.current.open = !media.matches && desktopOpen; };
    applyDefault();
    media.addEventListener("change", applyDefault);
    return () => media.removeEventListener("change", applyDefault);
  }, [desktopOpen]);
  return <details {...props} ref={element}>{children}</details>;
}
