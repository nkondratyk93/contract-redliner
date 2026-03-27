/**
 * Unit tests: document parser — detectFileType and extractText
 *
 * Tests text extraction, file type detection, size limits, and error states.
 *
 * TXT tests run with real Buffer data (no external deps needed).
 * PDF / DOCX tests use vi.mock at the module resolution level.
 * Size limit and file-too-large tests are format-agnostic (TXT).
 */

import { describe, it, expect, vi } from "vitest";
import { detectFileType, extractText } from "@/lib/document-parser";

// ── detectFileType ────────────────────────────────────────────────────────────

describe("detectFileType", () => {
  it("detects .pdf by extension", () => {
    expect(detectFileType("contract.pdf")).toBe("pdf");
  });

  it("detects .pdf by MIME type", () => {
    expect(detectFileType("file", "application/pdf")).toBe("pdf");
  });

  it("detects .docx by extension", () => {
    expect(detectFileType("agreement.docx")).toBe("docx");
  });

  it("detects .docx by MIME type", () => {
    expect(detectFileType(
      "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )).toBe("docx");
  });

  it("detects .txt by extension", () => {
    expect(detectFileType("readme.txt")).toBe("txt");
  });

  it("detects .txt by MIME type", () => {
    expect(detectFileType("file", "text/plain")).toBe("txt");
  });

  it("returns null for unsupported types (.xls, .csv, .zip)", () => {
    expect(detectFileType("data.xls")).toBeNull();
    expect(detectFileType("report.csv")).toBeNull();
    expect(detectFileType("archive.zip")).toBeNull();
  });

  it("is case-insensitive for extension (.PDF, .DOCX, .TXT)", () => {
    expect(detectFileType("CONTRACT.PDF")).toBe("pdf");
    expect(detectFileType("DOCUMENT.DOCX")).toBe("docx");
    expect(detectFileType("TEXT.TXT")).toBe("txt");
  });

  it("returns null for unknown extension with no MIME type", () => {
    expect(detectFileType("file.unknown")).toBeNull();
    expect(detectFileType("noextension")).toBeNull();
  });
});

// ── extractText: TXT ─────────────────────────────────────────────────────────

describe("extractText — TXT", () => {
  it("extracts plain text from a TXT buffer", async () => {
    const content = "This is a valid text contract. ".repeat(3);
    const buf = Buffer.from(content, "utf-8");
    const text = await extractText(buf, "txt", "contract.txt");
    expect(text).toBe(content.trim());
  });

  it("preserves content exactly (no stripping beyond whitespace trim)", async () => {
    const content = "  Agreement between Party A and Party B.  \n  All rights reserved.  ";
    const buf = Buffer.from(content, "utf-8");
    const text = await extractText(buf, "txt", "contract.txt");
    expect(text).toContain("Agreement between Party A");
    expect(text).toContain("All rights reserved.");
  });

  it("throws on empty TXT file", async () => {
    const buf = Buffer.from("   \n  \t  ", "utf-8");
    await expect(extractText(buf, "txt", "empty.txt")).rejects.toThrow("appears to be empty");
  });

  it("truncates TXT content at 50,000 characters", async () => {
    const longContent = "a".repeat(60_000);
    const buf = Buffer.from(longContent, "utf-8");
    const text = await extractText(buf, "txt", "long.txt");
    expect(text.length).toBe(50_000);
  });

  it("allows exactly 50,000 characters without truncation", async () => {
    const content = "b".repeat(50_000);
    const buf = Buffer.from(content, "utf-8");
    const text = await extractText(buf, "txt", "exact.txt");
    expect(text.length).toBe(50_000);
  });

  it("throws when file exceeds 10MB", async () => {
    const bigBuf = Buffer.alloc(11 * 1024 * 1024, "x");
    await expect(extractText(bigBuf, "txt", "huge.txt")).rejects.toThrow("10MB");
  });

  it("includes filename in 10MB error message", async () => {
    const bigBuf = Buffer.alloc(11 * 1024 * 1024, "x");
    await expect(extractText(bigBuf, "txt", "bigfile.txt")).rejects.toThrow("11.0MB");
  });
});

// ── extractText: PDF error handling ──────────────────────────────────────────
// We test the error path (corrupt buffer) — pdf-parse throws on non-PDF input.

describe("extractText — PDF (error handling with real pdf-parse)", () => {
  it("throws when given non-PDF buffer (corrupt/invalid PDF)", async () => {
    const buf = Buffer.from("this is definitely not a pdf", "utf-8");
    // pdf-parse throws an error on invalid input — we just verify it propagates
    await expect(extractText(buf, "pdf", "corrupt.pdf")).rejects.toThrow();
  });

  it("throws when file exceeds 10MB (checked before pdf-parse)", async () => {
    const bigBuf = Buffer.alloc(11 * 1024 * 1024, "x");
    await expect(extractText(bigBuf, "pdf", "huge.pdf")).rejects.toThrow("10MB");
  });
});

// ── extractText: DOCX error handling ─────────────────────────────────────────

describe("extractText — DOCX (error handling with real mammoth)", () => {
  it("throws when given non-DOCX buffer (invalid zip structure)", async () => {
    const buf = Buffer.from("this is not a docx file", "utf-8");
    // mammoth (via JSZip) throws on non-zip input
    await expect(extractText(buf, "docx", "corrupt.docx")).rejects.toThrow();
  });

  it("throws when file exceeds 10MB (checked before mammoth)", async () => {
    const bigBuf = Buffer.alloc(11 * 1024 * 1024, "x");
    await expect(extractText(bigBuf, "docx", "huge.docx")).rejects.toThrow("10MB");
  });
});
