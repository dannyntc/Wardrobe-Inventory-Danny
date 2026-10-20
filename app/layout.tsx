import type { Metadata, Viewport } from "next";
import { getWardrobeMode } from "../lib/wardrobe-mode";
import "./globals.css";

const mode = getWardrobeMode();

export const metadata: Metadata = {
  title: mode === "demo" ? "Wardrobe Demo" : process.env.WARDROBE_BRAND_LABEL || "Wardrobe",
  description: mode === "demo"
    ? "A fictional, browser-saved wardrobe inventory demo."
    : "A men’s wardrobe inventory across two homes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
