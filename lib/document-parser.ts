/**
 * Document text extraction — PDF and DOCX.
 * PDF: pdf-parse (pure JS, Vercel-compatible)
 * DOCX: mammoth (no LibreOffice dependency)
 * Max file: 10MB. Max extracted text: 50,000 chars.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_LENGTH = 50_000;

export type FileType = "pdf" | "docx" | "txt";

export function detectFileType(filename: string, mimeType?: string): FileType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (lower.endsWith(".txt") || mimeType === "text/plain") return "txt";
  return null;
}

export async function extractText(
  buffer: Buffer,
  fileType: FileType,
  filename: string
): Promise<string> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is 10MB (got ${(buffer.length / 1_048_576).toFixed(1)}MB).`);
  }

  let text: string;

  switch (fileType) {
    case "pdf": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      text = (data.text ?? "").trim();
      if (!text) {
        throw new Error(
          `Could not extract text from "${filename}". ` +
            "This may be a scanned/image PDF. Try copying the text and pasting it instead."
        );
      }
      break;
    }
    case "docx": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = (result.value ?? "").trim();
      if (!text) {
        throw new Error(`Could not extract text from "${filename}". The DOCX file may be empty or corrupted.`);
      }
      break;
    }
    case "txt": {
      text = buffer.toString("utf-8").trim();
      if (!text) {
        throw new Error(`The file "${filename}" appears to be empty.`);
      }
      break;
    }
  }

  return text.slice(0, MAX_TEXT_LENGTH);
}
