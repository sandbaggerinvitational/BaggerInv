import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  absoluteUrl,
} from "../lib/seo.js";

export default function manifest() {
  return {
    id: "/",
    name: SITE_NAME,
    short_name: "SBI",
    lang: "en-US",
    dir: "ltr",
    description: DEFAULT_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#f7f3ea",
    theme_color: "#0b3529",
    categories: ["sports", "lifestyle"],
    shortcuts: [
      {
        name: "My Match",
        short_name: "My Match",
        description: "Open your current SBI match.",
        url: "/my-match?source=shortcut",
        icons: [{ src: absoluteUrl("/icon-192.png"), sizes: "192x192" }],
      },
      {
        name: "Tournament",
        short_name: "Tournament",
        description: "Open live tournament coverage.",
        url: "/live?source=shortcut",
        icons: [{ src: absoluteUrl("/icon-192.png"), sizes: "192x192" }],
      },
      {
        name: "Leaderboards",
        short_name: "Leaders",
        description: "View the live SBI leaderboards.",
        url: "/live?view=leaderboards&source=shortcut",
        icons: [{ src: absoluteUrl("/icon-192.png"), sizes: "192x192" }],
      },
    ],
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
      {
        src: absoluteUrl("/icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
