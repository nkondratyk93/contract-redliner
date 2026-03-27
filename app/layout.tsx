import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://contractredliner.kolya.app"
).trim();

const OG_IMAGE = `${APP_URL}/api/og`;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Contract Redliner — AI Contract Review for Freelancers",
    template: "%s | Contract Redliner",
  },
  description:
    "AI-powered contract review for freelancers. Upload your contract, get instant risk analysis, plain-English explanations, and negotiation suggestions. Free to start.",
  keywords: [
    "AI contract review",
    "freelance contract",
    "contract risk analysis",
    "AI legal tool",
    "contract redliner",
    "freelancer contract review",
    "contract checker",
  ],
  authors: [{ name: "Contract Redliner" }],
  creator: "Contract Redliner",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "Contract Redliner",
    title: "Contract Redliner — AI Contract Review for Freelancers",
    description:
      "Spot risky clauses in 60 seconds. AI flags IP grabs, non-competes, and hidden traps — then tells you exactly what to negotiate. Free to start.",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Contract Redliner — AI Contract Review for Freelancers",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contract Redliner — AI Contract Review for Freelancers",
    description:
      "Spot risky clauses in 60 seconds. AI flags IP grabs, non-competes, and hidden traps. Free to start.",
    images: [OG_IMAGE],
    creator: "@contractredliner",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: APP_URL,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Contract Redliner",
  url: APP_URL,
  description:
    "AI-powered contract review tool for freelancers. Upload a contract and get instant risk analysis, plain-English explanations, and negotiation suggestions.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: [
    {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      name: "Free tier — 1 contract/month",
    },
    {
      "@type": "Offer",
      price: "19",
      priceCurrency: "USD",
      name: "Starter — 10 contracts/month",
    },
    {
      "@type": "Offer",
      price: "49",
      priceCurrency: "USD",
      name: "Pro — Unlimited contracts",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
