import Link from "next/link";

export default function TermsPage() {
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
          <h1>Terms of Service</h1>
          <p className="text-sm text-gray-500">
            Last updated: March 26, 2026
          </p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 not-prose mb-8">
            <p className="font-semibold text-yellow-900">
              IMPORTANT DISCLAIMER: NOT LEGAL ADVICE
            </p>
            <p className="text-sm text-yellow-800 mt-1">
              Contract Redliner is an informational tool only. It does NOT
              provide legal advice, and its analysis should NOT be treated as a
              substitute for consultation with a qualified attorney. Use of this
              service does not create an attorney-client relationship.
            </p>
          </div>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using Contract Redliner (&quot;the Service&quot;), you agree
            to be bound by these Terms of Service. If you do not agree to these
            terms, do not use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Contract Redliner is an AI-powered tool that analyzes contract text
            and highlights potentially risky clauses for freelancers. The Service
            uses artificial intelligence to provide general informational
            analysis only.
          </p>

          <h2>3. Not Legal Advice</h2>
          <p>
            THE SERVICE DOES NOT PROVIDE LEGAL ADVICE. The analysis, suggestions,
            and information provided by Contract Redliner are for general
            informational purposes only and should not be relied upon as legal
            advice. You should always consult with a qualified attorney before
            making legal decisions or signing contracts. The Service does not
            create an attorney-client relationship between you and Contract
            Redliner or any of its operators.
          </p>

          <h2>4. User Responsibilities</h2>
          <ul>
            <li>
              You are responsible for ensuring you have the right to submit any
              contract text for analysis.
            </li>
            <li>
              You acknowledge that AI analysis may contain errors or omissions.
            </li>
            <li>
              You agree not to use the Service for any unlawful purpose.
            </li>
            <li>
              You agree not to attempt to reverse-engineer, decompile, or
              otherwise tamper with the Service.
            </li>
          </ul>

          <h2>5. Intellectual Property</h2>
          <p>
            The Service, including its design, features, and content (excluding
            user-submitted contract text), is the property of Contract Redliner.
            You retain all rights to your contract text. We claim no ownership
            over any contracts you submit for analysis.
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CONTRACT
            REDLINER, ITS OPERATORS, AFFILIATES, AND SERVICE PROVIDERS SHALL NOT
            BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
            PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul>
            <li>Loss of profits, revenue, or business opportunities</li>
            <li>
              Damages resulting from reliance on any analysis or information
              provided by the Service
            </li>
            <li>
              Damages resulting from errors, omissions, or inaccuracies in the
              AI analysis
            </li>
            <li>
              Any legal consequences arising from decisions made based on the
              Service&apos;s output
            </li>
          </ul>
          <p>
            IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID FOR
            THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
          </p>

          <h2>7. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
            WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT
            LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
            PURPOSE, ACCURACY, OR NON-INFRINGEMENT.
          </p>

          <h2>8. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Contract Redliner and its
            operators from any claims, damages, or expenses arising from your
            use of the Service or your violation of these Terms.
          </p>

          <h2>9. Modifications to Service</h2>
          <p>
            We reserve the right to modify, suspend, or discontinue the Service
            at any time without notice. We shall not be liable to you or any
            third party for any modification, suspension, or discontinuation.
          </p>

          <h2>10. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the
            Service after changes constitutes acceptance of the updated Terms.
          </p>

          <h2>11. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with
            applicable law, without regard to conflict of law principles.
          </p>

          <h2>12. Contact</h2>
          <p>
            For questions about these Terms, contact us at
            legal@contractredliner.kolya.app.
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
