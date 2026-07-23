import { SITE_NAME } from "../lib/seo";

export default function manifest() {
  return {
    name: SITE_NAME,
    short_name: "SBI",
    description: "The official home of the Sandbagger Invitational.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f3ea",
    theme_color: "#0b3529",
    icons: [
      {
        src: "/images/sandbagger-logo.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
