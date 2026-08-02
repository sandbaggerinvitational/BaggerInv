"use client";

import { useRef, useState } from "react";

export default function ExternalLinkConfirm({ href, children, className = "" }) {
  const dialog = useRef(null);
  const [destination, setDestination] = useState("");
  return <>
    <a className={className} href={href} onClick={(event) => {
      event.preventDefault();
      setDestination(href);
      dialog.current?.showModal();
    }}>{children}</a>
    <dialog className="externalLinkDialog" ref={dialog} aria-labelledby="external-link-title">
      <div><span aria-hidden="true">↗</span><h2 id="external-link-title">Leave The Bagger?</h2><p>This content will open in Safari.</p>
        <div><button type="button" onClick={() => dialog.current?.close()}>Cancel</button><button type="button" onClick={() => { dialog.current?.close(); window.location.assign(destination); }}>Continue</button></div>
      </div>
    </dialog>
  </>;
}
