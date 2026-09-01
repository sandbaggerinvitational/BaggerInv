export const SITE_URL = "https://baggerinv.com";
export const SITE_NAME = "The Sandbagger Invitational";
export const DEFAULT_DESCRIPTION =
  "The official home of the Sandbagger Invitational. Live scoring, tournament history, player records, ratings, analytics, and more.";
export const DEFAULT_SOCIAL_IMAGE = "/images/home-page-hero.webp";

const SITE_NAME_SUFFIX = /\s*[|·]\s*(?:The\s+)?Sandbagger Invitational\s*$/i;

export function publicPageTitle(value = SITE_NAME) {
  const title = String(value || "").trim();
  if (!title || title.toLowerCase() === SITE_NAME.toLowerCase()) return SITE_NAME;
  const pageTitle = title.replace(SITE_NAME_SUFFIX, "").trim();
  return pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME;
}

export function absoluteUrl(path = "/") {
  return new URL(path, `${SITE_URL}/`).toString();
}

export function pageMetadata({
  title = SITE_NAME,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image = DEFAULT_SOCIAL_IMAGE,
  type = "website",
}) {
  const canonical = absoluteUrl(path);
  const socialImage = absoluteUrl(image);
  const resolvedTitle = publicPageTitle(title);

  return {
    title: { absolute: resolvedTitle },
    description,
    alternates: { canonical },
    openGraph: {
      type,
      locale: "en_US",
      siteName: SITE_NAME,
      title: resolvedTitle,
      description,
      url: canonical,
      images: [
        {
          url: socialImage,
          alt: SITE_NAME,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      images: [socialImage],
    },
  };
}

export function privatePageMetadata(title) {
  return {
    title: { absolute: String(title || "The Bagger").trim() || "The Bagger" },
    alternates: { canonical: null },
    openGraph: null,
    twitter: null,
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    },
  };
}
