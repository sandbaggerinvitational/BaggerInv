import "./globals.css";
import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  pageMetadata,
} from "../lib/seo";

const homeMetadata = pageMetadata({
  title: SITE_NAME,
  description: DEFAULT_DESCRIPTION,
  path: "/",
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  category: "sports",
  keywords: [
    "Sandbagger Invitational",
    "golf tournament",
    "match play",
    "golf results",
    "golf statistics",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  ...homeMetadata,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  icons: {
    icon: [
      {
        url: absoluteUrl("/favicon.ico"),
        sizes: "any",
      },
      {
        url: absoluteUrl("/favicon-16x16.png"),
        type: "image/png",
        sizes: "16x16",
      },
      {
        url: absoluteUrl("/favicon-32x32.png"),
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: absoluteUrl("/icon.png"),
        type: "image/png",
        sizes: "1024x1024",
      },
    ],
    shortcut: absoluteUrl("/favicon.ico"),
    apple: {
      url: absoluteUrl("/apple-icon.png"),
      type: "image/png",
      sizes: "180x180",
    },
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
