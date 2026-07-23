import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "../lib/seo.js";

export default function manifest() {
  return {
    id: SITE_URL,
    name: SITE_NAME,
    short_name: "SBI",
    description: DEFAULT_DESCRIPTION,
    start_url: SITE_URL,
    scope: `${SITE_URL}/`,
    display: "standalone",
    background_color: "#f7f3ea",
    theme_color: "#0b3529",
    icons: [
      {
        src: absoluteUrl("/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: absoluteUrl("/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
