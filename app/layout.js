import "./globals.css";
import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  pageMetadata,
} from "../lib/seo";

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
  ...pageMetadata({
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    path: "/",
  }),
  icons: {
    icon: "/images/sandbagger-logo.png",
    apple: "/images/sandbagger-logo.png",
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
