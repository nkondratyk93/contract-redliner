import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, MessageSquareText, Handshake, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Shield,
    title: "Spot Risky Clauses",
    description:
      "AI scans every line for IP grabs, non-competes, unlimited revisions, and other freelancer traps.",
  },
  {
    icon: MessageSquareText,
    title: "Plain English Explanations",
    description:
      "No legalese. Every flagged clause gets a clear explanation of what it actually means for you.",
  },
  {
    icon: Handshake,
    title: "Negotiate Back",
    description:
      "Get suggested rewrites and talking points so you can push back with confidence.",
  },
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "Try it out",
    features: ["1 contract/month", "Basic risk flags", "Overall risk score"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "/mo",
    description: "For active freelancers",
    features: [
      "10 contracts/month",
      "Full clause analysis",
      "Plain English explanations",
      "Negotiation tips",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "For agencies & power users",
    features: [
      "Unlimited contracts",
      "Redline suggestions",
      "Clause templates library",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: false,
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Contract Redliner
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/analyze"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Analyze
            </Link>
            <Link
              href="/analyze"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <Badge variant="secondary" className="mb-4">
            AI-Powered Contract Review
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-6">
            Review any freelance contract in 60 seconds
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            AI spots risky clauses, explains them in plain English, and suggests
            fixes. No lawyer required.
          </p>
          <Link
            href="/analyze"
            className={cn(buttonVariants({ size: "lg" }), "text-base px-8")}
          >
            Analyze My Contract Free
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature) => (
              <Card key={feature.title} className="text-center">
                <CardHeader>
                  <div className="mx-auto mb-4 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <feature.icon className="w-6 h-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-gray-900">
            Simple pricing
          </h2>
          <p className="text-center text-gray-600 mb-12">
            Start free. Upgrade when you need more.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {tiers.map((tier) => (
              <Card
                key={tier.name}
                className={
                  tier.highlighted
                    ? "border-blue-600 border-2 relative"
                    : undefined
                }
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge>Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                  <CardDescription>{tier.description}</CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold text-gray-900">
                      {tier.price}
                    </span>
                    <span className="text-gray-500">{tier.period}</span>
                  </div>
                  <ul className="pt-6 space-y-3">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2 text-sm text-gray-600"
                      >
                        <Check className="w-4 h-4 text-blue-600 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-6">
                    <Link
                      href="/analyze"
                      className={cn(
                        buttonVariants({
                          variant: tier.highlighted ? "default" : "outline",
                        }),
                        "w-full"
                      )}
                    >
                      {tier.cta}
                    </Link>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white py-8 px-4 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Contract Redliner. Not legal
            advice.
          </p>
          <nav className="flex gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-gray-900">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-gray-900">
              Terms of Service
            </Link>
          </nav>
        </div>
        <p className="text-xs text-gray-400 text-center mt-4 max-w-2xl mx-auto">
          This tool provides general information only. It is not legal advice and
          does not create an attorney-client relationship. Consult a qualified
          attorney for legal matters.
        </p>
      </footer>
    </div>
  );
}
