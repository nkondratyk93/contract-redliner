import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Contract Redliner
          </Link>
        </div>
      </header>

      <main className="flex-1 py-12 px-4">
        <article className="max-w-3xl mx-auto prose prose-gray">
          <h1>Privacy Policy</h1>
          <p className="text-sm text-gray-500">
            Last updated: March 26, 2026
          </p>

          <h2>Introduction</h2>
          <p>
            Contract Redliner (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates the
            Contract Redliner web application. This Privacy Policy explains how
            we collect, use, and protect your information when you use our
            service.
          </p>

          <h2>Information We Collect</h2>
          <h3>Contract Text</h3>
          <p>
            When you submit a contract for analysis, we temporarily process the
            text to generate your analysis. Contract data is not stored
            long-term. Analysis results are stored with anonymous identifiers
            only — we do not associate them with personal information.
          </p>
          <h3>Usage Data</h3>
          <p>
            We collect anonymous usage data such as page views, feature usage,
            and general analytics to improve the service. This data cannot be
            used to identify individual users.
          </p>

          <h2>How We Use Your Information</h2>
          <ul>
            <li>To provide contract analysis services</li>
            <li>To improve and optimize our service</li>
            <li>To monitor usage patterns and prevent abuse</li>
          </ul>

          <h2>Third-Party Services</h2>
          <p>
            We use Anthropic&apos;s Claude AI API to analyze contract text. When
            you submit a contract, the text is sent to Anthropic for processing.
            Anthropic&apos;s use of this data is governed by their privacy policy
            and data processing agreements. We encourage you to review{" "}
            <a
              href="https://www.anthropic.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Anthropic&apos;s Privacy Policy
            </a>
            .
          </p>
          <p>
            We use Supabase for data storage. Supabase&apos;s use of data is
            governed by their privacy policy and terms of service.
          </p>

          <h2>Data Retention</h2>
          <p>
            Contract text is processed in real-time and is not stored long-term.
            Analysis results are retained for 90 days, or until account
            deletion, whichever comes first. We may retain anonymized, aggregated data for
            service improvement purposes.
          </p>

          <h2>Data Security</h2>
          <p>
            We implement reasonable technical and organizational measures to
            protect your data. However, no method of transmission over the
            Internet is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h2>Your Rights</h2>
          <p>
            You have the right to request access to, correction of, or deletion
            of your personal data. To exercise these rights, please contact us
            at the email below.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify
            you of any changes by posting the new Privacy Policy on this page
            and updating the &quot;Last updated&quot; date.
          </p>

          <h2>Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact
            us at privacy@contractredliner.kolya.app.
          </p>
        </article>
      </main>

      <footer className="border-t bg-white py-6 px-4 mt-auto">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Contract Redliner</p>
          <nav className="flex gap-6">
            <Link href="/privacy" className="hover:text-gray-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-gray-900">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
