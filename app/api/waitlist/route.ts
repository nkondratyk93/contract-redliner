import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, source } = body as { email?: string; source?: string };

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const { error } = await supabaseServer
    .from("contract_redliner_waitlist")
    .insert({ email: trimmed, source: source ?? "landing" });

  if (error) {
    // Unique violation = already signed up
    if (error.code === "23505") {
      return NextResponse.json(
        { message: "You're already on the waitlist! We'll be in touch." },
        { status: 200 }
      );
    }
    console.error("[waitlist] Supabase error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { message: "You're on the list! We'll notify you at launch." },
    { status: 201 }
  );
}
