export const SITE_URL = "https://baggerinv.com";
export const SITE_NAME = "The Sandbagger Invitational";
export const DEFAULT_DESCRIPTION =
  "The official home of the Sandbagger Invitational—live match results, tournament history, player records, analytics, and the Tournament Guide.";
export const DEFAULT_SOCIAL_IMAGE = "/images/home-page-hero.webp";

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

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type,
      locale: "en_US",
      siteName: SITE_NAME,
      title,
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
      title,
      description,
      images: [socialImage],
    },
  };
}

export function privatePageMetadata(title) {
  return {
    title,
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    },
  };
}
