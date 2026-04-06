import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Signal > Noise",
  description:
    "A clean, editorial feed of high-signal stories across AI, media, and digital strategy."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
