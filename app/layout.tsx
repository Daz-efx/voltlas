import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "What the world pays for electricity, gas, transport fuels and energy commodities — from free official sources, updated weekly.";

export const metadata: Metadata = {
  metadataBase: new URL("https://voltlas.com"),
  alternates: { canonical: "/" },
  title: {
    default: "Voltlas — global energy, fuel & commodity prices",
    template: "%s · Voltlas",
  },
  description: DESCRIPTION,
  applicationName: "Voltlas",
  keywords: [
    "electricity prices",
    "natural gas prices",
    "gasoline prices",
    "diesel prices",
    "energy prices by country",
    "crude oil price",
  ],
  openGraph: {
    type: "website",
    siteName: "Voltlas",
    title: "Voltlas — global energy, fuel & commodity prices",
    description: DESCRIPTION,
    url: "https://voltlas.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Voltlas — global energy, fuel & commodity prices",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<Analytics /></body>
    </html>
  );
}
