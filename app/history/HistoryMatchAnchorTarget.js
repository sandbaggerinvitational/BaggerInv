"use client";

import { useEffect } from "react";

const canonicalMatchAnchor = /^match-[A-Za-z0-9._:-]+$/;

function currentMatchAnchor() {
  try {
    const anchor = decodeURIComponent(window.location.hash.slice(1));
    return canonicalMatchAnchor.test(anchor) ? anchor : "";
  } catch {
    return "";
  }
}

export default function HistoryMatchAnchorTarget({ enabled = false }) {
  useEffect(() => {
    if (!enabled) return undefined;

    const reveal = () => {
      const anchor = currentMatchAnchor();
      if (!anchor) return;
      document.getElementById(anchor)?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    };

    const frame = window.requestAnimationFrame(reveal);
    window.addEventListener("hashchange", reveal);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", reveal);
    };
  }, [enabled]);

  return null;
}
