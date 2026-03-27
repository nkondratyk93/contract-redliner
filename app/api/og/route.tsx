import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "AI Contract Review for Freelancers";
  const subtitle = searchParams.get("subtitle") || "Spot risky clauses in 60 seconds. No lawyer required.";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
          padding: "60px 72px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Logo / brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "auto" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.15)",
              borderRadius: "12px",
              padding: "10px 20px",
              color: "white",
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "-0.5px",
            }}
          >
            Contract Redliner
          </div>
        </div>

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.15)",
              borderRadius: "8px",
              padding: "8px 16px",
              color: "rgba(255,255,255,0.9)",
              fontSize: "18px",
              fontWeight: 600,
              width: "fit-content",
            }}
          >
            AI-Powered · Free to Start
          </div>

          <div
            style={{
              color: "white",
              fontSize: "64px",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-2px",
              maxWidth: "900px",
            }}
          >
            {title}
          </div>

          <div
            style={{
              color: "rgba(255,255,255,0.8)",
              fontSize: "28px",
              fontWeight: 400,
              lineHeight: 1.4,
              maxWidth: "700px",
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "60px",
            paddingTop: "32px",
            borderTop: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "18px" }}>
            contractredliner.kolya.app
          </div>
          <div
            style={{
              display: "flex",
              gap: "16px",
            }}
          >
            {["Free tier", "60 seconds", "No lawyer needed"].map((tag) => (
              <div
                key={tag}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: "20px",
                  padding: "6px 16px",
                  color: "white",
                  fontSize: "16px",
                  fontWeight: 500,
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
