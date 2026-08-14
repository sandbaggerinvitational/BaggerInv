"use client";

import { useId, useRef } from "react";
import Sheet from "./Sheet";
import styles from "./alert-sheet.module.css";

export default function AlertSheet({
  open,
  onClose,
  title,
  body,
  primaryLabel = "Continue",
  cancelLabel = "Cancel",
  onPrimary,
  tone = "warning",
}) {
  const titleId = useId();
  const cancelRef = useRef(null);
  return <Sheet open={open} onClose={onClose} placement="bottom" role="alertdialog" labelledBy={titleId} initialFocusRef={cancelRef}>{({ close }) =>
    <div className={styles.content} data-tone={tone}>
      <span>Confirm</span>
      <h2 id={titleId}>{title}</h2>
      {body ? <p>{body}</p> : null}
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" onClick={() => close()}>{cancelLabel}</button>
        <button type="button" data-primary="true" onClick={() => close(onPrimary)}>{primaryLabel}</button>
      </div>
    </div>}
  </Sheet>;
}
