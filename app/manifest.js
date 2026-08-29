import { DEFAULT_DESCRIPTION } from "../lib/seo.js";

export default function manifest() {
  return {
    id: "/",
    name: "The Bagger",
    short_name: "The Bagger",
    lang: "en-US",
    dir: "ltr",
    description: DEFAULT_DESCRIPTION,
    start_url: "/home",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#092f25",
    theme_color: "#0b3529",
    categories: ["sports", "lifestyle"],
    shortcuts: [
      {
        name: "My Match",
        short_name: "My Match",
        description: "Open your current SBI match.",
        url: "/my-match?source=shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Tournament",
        short_name: "Tournament",
        description: "Open live tournament coverage.",
        url: "/app/tournament?source=shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Leaderboards",
        short_name: "Leaders",
        description: "View the live SBI leaderboards.",
        url: "/app/leaderboards?source=shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
