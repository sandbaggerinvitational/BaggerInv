import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  pageMetadata,
} from "../lib/seo";
import PwaFoundation from "./PwaFoundation";
import ParticipantIdentity from "./ParticipantIdentity";
import PwaLaunchSplash from "./PwaLaunchSplash";
import { Suspense } from "react";

const homeMetadata = pageMetadata({
  title: SITE_NAME,
  description: DEFAULT_DESCRIPTION,
  path: "/",
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "The Bagger",
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
        url: "/favicon.ico",
        sizes: "any",
      },
      {
        url: "/favicon-16x16.png",
        type: "image/png",
        sizes: "16x16",
      },
      {
        url: "/favicon-32x32.png",
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: "/icon.png",
        type: "image/png",
        sizes: "1024x1024",
      },
    ],
    shortcut: "/favicon.ico",
    apple: {
      url: "/apple-touch-icon.png",
      type: "image/png",
      sizes: "180x180",
    },
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Bagger",
    startupImage: [
      {
        url: "/splash/iphone-1170x2532.png",
        media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/iphone-1179x2556.png",
        media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/iphone-1290x2796.png",
        media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/iphone-1320x2868.png",
        media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
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

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#0b3529",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;var key="sbi-pwa-launch-seen";if(standalone&&!window.sessionStorage.getItem(key)){window.sessionStorage.setItem(key,"1");document.documentElement.classList.add("pwa-cold-launch");}}catch(error){}})();` }} />
      </head>
      <body>
        <PwaLaunchSplash />
        {children}
        <Analytics />
        <PwaFoundation />
        <Suspense fallback={null}>
          <ParticipantIdentity />
        </Suspense>
      </body>
    </html>
  );
}
