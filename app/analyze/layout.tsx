import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analyze Your Contract",
  description:
    "Upload or paste your freelance contract. Our AI will scan it for risky clauses, explain them in plain English, and suggest what to negotiate.",
  alternates: {
    canonical: "/analyze",
  },
  openGraph: {
    title: "Analyze Your Contract — Contract Redliner",
    description:
      "Upload a PDF or paste your contract text. Instant AI risk analysis — free to start.",
    url: "/analyze",
  },
};

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
