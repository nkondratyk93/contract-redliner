import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog — Contract Tips for Freelancers",
  description:
    "Practical guides on freelance contracts, negotiation tactics, and how to protect yourself from risky clauses. Written for freelancers, by freelancers.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog — Contract Tips for Freelancers | Contract Redliner",
    description:
      "Practical guides on freelance contracts, negotiation, and protecting your work.",
    url: "/blog",
  },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Contract Redliner
          </Link>
          <nav className="flex items-center gap-4 text-sm text-gray-600">
            <Link href="/analyze" className="hover:text-gray-900">Analyze</Link>
            <Link href="/blog" className="text-gray-900 font-medium">Blog</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-12">
            <Badge variant="secondary" className="mb-3">Freelancer Resources</Badge>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">
              Contract tips & guides
            </h1>
            <p className="text-gray-600 text-lg">
              Practical advice on protecting yourself, negotiating better deals,
              and spotting the clauses that can cost you.
            </p>
          </div>

          {posts.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg font-medium mb-2">First post coming soon</p>
              <p className="text-sm">
                We&apos;re writing guides on the most common freelance contract traps.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {posts.map((post) => (
                <article key={post.slug} className="group border-b pb-10 last:border-0">
                  <Link href={`/blog/${post.slug}`}>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {post.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                      {post.title}
                    </h2>
                    <p className="text-gray-600 mb-4 leading-relaxed">
                      {post.description}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      {post.date && (
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4" />
                          {new Date(post.date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {post.readingTime}
                      </span>
                      {post.author && <span>by {post.author}</span>}
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t bg-white py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Contract Redliner. Not legal advice.
          </p>
          <nav className="flex gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-900">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
