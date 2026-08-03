import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://schema-shield.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SchemaShield | Evidence-first schema change preflight",
  description:
    "Replay deterministic schema-change cases and inspect evidence from a separately verified DataHub OSS roundtrip.",
  robots: { follow: true, index: true },
  openGraph: {
    title: "SchemaShield | Evidence-first schema change preflight",
    description:
      "Catch breaking schema changes before downstream models, dashboards, and ML systems fail.",
    images: [
      {
        alt: "SchemaShield protecting a data catalog and downstream consumers",
        height: 945,
        url: "/schema-shield-preview.png",
        width: 1680,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Catch breaking schema changes before downstream models, dashboards, and ML systems fail.",
    images: ["/schema-shield-preview.png"],
    title: "SchemaShield | Evidence-first schema change preflight",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
