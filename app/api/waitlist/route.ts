import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const {
    email,
    source,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    referrer,
  } = body as {
    email?: string;
    source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    referrer?: string;
  };

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

  // Build insert payload — only include UTM fields if present (keep rows clean)
  const insertPayload: Record<string, string> = {
    email: trimmed,
    source: source ?? "landing",
  };
  if (utm_source) insertPayload.utm_source = utm_source;
  if (utm_medium) insertPayload.utm_medium = utm_medium;
  if (utm_campaign) insertPayload.utm_campaign = utm_campaign;
  if (utm_content) insertPayload.utm_content = utm_content;
  if (referrer) insertPayload.referrer = referrer;

  const { error } = await supabaseServer
    .from("contract_redliner_waitlist")
    .insert(insertPayload);

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
