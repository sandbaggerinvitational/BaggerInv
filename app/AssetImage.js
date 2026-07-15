"use client";

import { useEffect, useState } from "react";

export default function AssetImage({
  src,
  alt,
  className = "",
  fallbackClassName = "",
  fallback = "TSI",
  loading = "lazy",
}) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (failed) {
    return (
      <div
        className={fallbackClassName}
        aria-label={`${alt} image unavailable`}
        role="img"
      >
        {fallback}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
}
