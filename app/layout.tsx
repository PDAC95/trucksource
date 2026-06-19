import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

// Decorative neon display faces (self-hosted, woff2/otf from private/fonts → committed
// app/fonts). Display/signage ONLY — never body. Exposed as CSS vars; @theme maps them
// to font-neon-shine / font-modern-neon / font-godsown utilities.
const neonShine = localFont({
  src: "./fonts/neon-shine.woff2",
  variable: "--ff-neonshine",
  display: "swap",
});

const modernNeon = localFont({
  src: "./fonts/modern-neon.woff2",
  variable: "--ff-modernneon",
  display: "swap",
});

const godsown = localFont({
  src: "./fonts/godsown.otf",
  variable: "--ff-godsown",
  display: "swap",
});

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
      className={`dark ${display.variable} ${body.variable} ${geistMono.variable} ${neonShine.variable} ${modernNeon.variable} ${godsown.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
