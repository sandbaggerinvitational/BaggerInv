"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultAssets } from "../lib/asset-paths";

function inferredFallback(src) {
  const value = String(src ?? "");

  if (value.includes("/images/players/")) {
    return defaultAssets.player;
  }

  if (value.includes("/images/teams/logos/")) {
    return defaultAssets.teamLogo;
  }

  if (value.includes("/images/courses/logos/")) {
    return defaultAssets.courseLogo;
  }

  if (value.includes("/images/courses/hero/")) {
    return defaultAssets.courseHero;
  }

  if (value.includes("/images/tournaments/hero/")) {
    return defaultAssets.tournamentHero;
  }

  return null;
}

export default function AssetImage({
  src,
  alt,
  className = "",
  fallbackClassName = "",
  fallback = "TSI",
  fallbackSrc,
  inferFallback = true,
  loading = "lazy",
}) {
  const automaticFallback = useMemo(
    () => fallbackSrc || (inferFallback ? inferredFallback(src) : null),
    [fallbackSrc, inferFallback, src]
  );

  const [currentSrc, setCurrentSrc] = useState(
    src || automaticFallback || null
  );
  const [failed, setFailed] = useState(
    !src && !automaticFallback
  );
  const [usedFallback, setUsedFallback] = useState(!src);

  useEffect(() => {
    setCurrentSrc(src || automaticFallback || null);
    setFailed(!src && !automaticFallback);
    setUsedFallback(!src);
  }, [src, automaticFallback]);

  function handleError() {
    if (!usedFallback && automaticFallback) {
      setCurrentSrc(automaticFallback);
      setUsedFallback(true);
      return;
    }

    setFailed(true);
  }

  if (failed || !currentSrc) {
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
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={handleError}
    />
  );
}
