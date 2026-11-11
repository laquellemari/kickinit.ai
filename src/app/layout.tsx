import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "kickinit.ai: plans, without the planning",
  description: "An AI concierge that finds, holds and pays for experiences, for you or as a gift, with PayPal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Jost:wght@300;400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
