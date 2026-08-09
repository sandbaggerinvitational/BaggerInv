"use client";

import { useEffect, useState } from "react";

export default function DeferredHomeContent({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 500));
    const cancel = window.cancelIdleCallback || window.clearTimeout;
    const task = schedule(() => setReady(true), { timeout: 1200 });
    return () => cancel(task);
  }, []);

  return ready ? children : null;
}
