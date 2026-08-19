"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultAssets, optimizedAssetUrl } from "../../lib/asset-paths";

function responsiveSet(source, widths, quality) {
  if (!String(source || "").startsWith("/")) return "";
  return widths.map((width) => `${optimizedAssetUrl(source, width, quality)} ${width}w`).join(", ");
}

export default function AnnualGuideHeroMedia({ image, mobileImage, alt, className = "", imageClassName = "" }) {
  const [useFallback, setUseFallback] = useState(false);
  useEffect(() => setUseFallback(false), [image, mobileImage]);
  const desktop = useFallback ? defaultAssets.tournamentHero : image || defaultAssets.tournamentHero;
  const mobile = useFallback ? defaultAssets.tournamentHero : mobileImage || desktop;
  const desktopSet = useMemo(() => responsiveSet(desktop, [640, 1080], 72), [desktop]);
  const mobileSet = useMemo(() => responsiveSet(mobile, [384, 640], 72), [mobile]);

  return <picture className={className}>
    {mobileSet ? <source media="(max-width: 560px)" srcSet={mobileSet} sizes="100vw" /> : null}
    <img
      src={optimizedAssetUrl(desktop, 1080, 72)}
      srcSet={desktopSet || undefined}
      sizes="(max-width: 560px) 100vw, min(100vw, 1320px)"
      alt={alt}
      className={imageClassName}
      width={1320}
      height={520}
      loading="eager"
      decoding="async"
      fetchPriority="high"
      onError={() => { if (!useFallback) setUseFallback(true); }}
    />
  </picture>;
}
