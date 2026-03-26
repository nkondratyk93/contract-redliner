import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Contract Redliner — AI Contract Review for Freelancers",
  description:
    "AI-powered contract review for freelancers. Upload your contract, get instant risk analysis, plain-English explanations, and negotiation suggestions.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://contractredliner.kolya.app"
  ),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
