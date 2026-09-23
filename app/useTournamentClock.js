"use client";
import { useEffect, useState } from "react";

export default function useTournamentClock(initialNow = "") {
  const [anchor] = useState(() => Date.now());
  const read = () => {
    const initial = Date.parse(initialNow);
    return new Date(Number.isFinite(initial) ? initial + Date.now() - anchor : Date.now());
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    let timer;
    const update = () => {
      window.clearTimeout(timer);
      const current = read();
      setNow(current);
      timer = window.setTimeout(update, 60000 - current.getTime() % 60000 + 1);
    };
    update();
    const visible = () => { if (document.visibilityState === "visible") update(); };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", visible); };
  }, [initialNow, anchor]);
  return now;
}
