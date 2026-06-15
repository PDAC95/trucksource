import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
  fallback: ["Arial Narrow", "Roboto Condensed", "sans-serif"],
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://trucksource.vercel.app"),
  title: {
    default: "OG Truck Parts — Real Parts. Real Sellers.",
    template: "%s | OG Truck Parts",
  },
  description:
    "Real Parts. Real Sellers. North-American heavy-truck parts marketplace.",
  openGraph: {
    title: "OG Truck Parts",
    description: "Real Parts. Real Sellers.",
    siteName: "OG Truck Parts",
    type: "website",
    // images omitted — app/opengraph-image.png (Plan 04) auto-injects via file convention
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0d111b", // navy base; matches --background first paint + mobile chrome
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${display.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
