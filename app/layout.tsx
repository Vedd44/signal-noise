import { Analytics } from "@/components/Analytics";
import type { Metadata, Viewport } from "next";

import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  SOCIAL_DESCRIPTION,
  SOCIAL_TITLE
} from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "technology",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: `${SITE_URL}/`
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: SOCIAL_TITLE,
    description: SOCIAL_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/`,
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Signal > Noise editorial briefing preview"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: SOCIAL_TITLE,
    description: SOCIAL_DESCRIPTION,
    images: ["/twitter-image"]
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" }
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }]
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#25241f" }
  ]
};


export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><a className="skip-link" href="#main-content">Skip to content</a>{children}<Analytics /></body>
    </html>
  );
}
