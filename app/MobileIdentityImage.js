"use client";

import { useEffect, useState } from "react";

function initials(name) {
  return String(name || "SBI")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SBI";
}

export default function MobileIdentityImage({
  sources = [],
  name,
  alt = "",
  className = "",
  fallbackClassName = "",
}) {
  const validSources = sources.filter(Boolean);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [sources.join("|")]);

  if (!validSources[index]) {
    return (
      <span
        className={fallbackClassName}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : "true"}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={validSources[index]}
      alt={alt}
      width="48"
      height="48"
      loading="eager"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

