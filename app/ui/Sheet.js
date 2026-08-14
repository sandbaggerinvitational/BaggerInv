"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./sheet.module.css";

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

export default function Sheet({
  open,
  onClose,
  children,
  placement = "bottom",
  label,
  labelledBy,
  role = "dialog",
  closeOnBackdrop = true,
  panelClassName = "",
  layerClassName = "",
  initialFocusRef,
}) {
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const previousOverflowRef = useRef("");
  const historyRef = useRef(null);
  const afterCloseRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const id = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("participant-overlay-open");
    const background = document.querySelector("[data-participant-app-shell]") || document.querySelector(".pwa-app-scene");
    const previousInert = background?.inert;
    if (background) background.inert = true;

    const currentUrl = window.location.href;
    const previousState = window.history.state;
    const marker = `sbi-sheet-${id}`;
    historyRef.current = { marker, previousState, currentUrl };
    window.history.pushState({ ...(previousState || {}), __sbiSheet: marker }, "");

    const focusPanel = () => {
      const target = initialFocusRef?.current || panelRef.current?.querySelector(FOCUSABLE) || panelRef.current;
      target?.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusPanel);
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (window.history.state?.__sbiSheet === marker) window.history.back();
        else onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(panelRef.current?.querySelectorAll(FOCUSABLE) || [])];
      if (!focusable.length) { event.preventDefault(); panelRef.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const onPopState = () => {
      const afterClose = afterCloseRef.current;
      afterCloseRef.current = null;
      onCloseRef.current?.();
      if (afterClose) window.requestAnimationFrame(afterClose);
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState, { once: true });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
      if (background) background.inert = previousInert || false;
      document.body.style.overflow = previousOverflowRef.current;
      document.body.classList.remove("participant-overlay-open");
      const record = historyRef.current;
      if (record && window.location.href === record.currentUrl && window.history.state?.__sbiSheet === record.marker) {
        window.history.replaceState(record.previousState, "", record.currentUrl);
      }
      returnFocusRef.current?.focus?.({ preventScroll: true });
      historyRef.current = null;
    };
  }, [id, initialFocusRef, open]);

  if (!open || typeof document === "undefined") return null;
  const requestClose = (afterClose) => {
    afterCloseRef.current = typeof afterClose === "function" ? afterClose : null;
    const record = historyRef.current;
    if (record && window.history.state?.__sbiSheet === record.marker) window.history.back();
    else {
      onCloseRef.current?.();
      afterCloseRef.current?.();
      afterCloseRef.current = null;
    }
  };

  return createPortal(<div className={`${styles.layer} ${layerClassName}`.trim()} data-placement={placement}>
    <button className={styles.backdrop} type="button" tabIndex={-1} aria-label="Close" onClick={closeOnBackdrop ? requestClose : undefined} />
    <section
      ref={panelRef}
      className={`${styles.panel} ${panelClassName}`.trim()}
      role={role}
      aria-modal="true"
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={-1}
    >{typeof children === "function" ? children({ close: requestClose }) : children}</section>
  </div>, document.body);
}
