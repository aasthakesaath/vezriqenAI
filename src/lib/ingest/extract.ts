import "server-only";

import { MAX_PAGES, type PlanMimeType } from "./limits";

export type ExtractionResult =
  | { ok: true; text: string; pageCount: number | null; needsVision: false }
  /** Images carry no extractable text; the multimodal model reads them at
   *  extraction time instead (PRD §22). Not a failure. */
  | { ok: true; text: null; pageCount: null; needsVision: true }
  | { ok: false; reason: string; pageCount: number | null };

/** Collapses the runs of whitespace PDF extraction leaves behind. */
function tidy(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(bytes);
    const pageCount = pdf.numPages;

    // Check the page budget before pulling text out of a 500-page document.
    if (pageCount > MAX_PAGES) {
      return {
        ok: false,
        reason: `That document is ${pageCount} pages. The limit is ${MAX_PAGES}.`,
        pageCount,
      };
    }

    const { text } = await extractText(pdf, { mergePages: true });
    const merged = tidy(Array.isArray(text) ? text.join("\n\n") : text);

    if (merged.length === 0) {
      // A scanned PDF is images in a PDF wrapper. Say so plainly rather than
      // storing an empty plan and letting extraction quietly find nothing.
      return {
        ok: false,
        reason:
          "We couldn't read any text from that PDF. If it's a scan, upload it as a JPG or PNG instead and Vezri will read the image.",
        pageCount,
      };
    }

    return { ok: true, text: merged, pageCount, needsVision: false };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? `Couldn't read that PDF: ${error.message}` : "Couldn't read that PDF.",
      pageCount: null,
    };
  }
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  try {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    });
    const text = tidy(value);
    if (text.length === 0) {
      return { ok: false, reason: "That Word document has no readable text.", pageCount: null };
    }
    return { ok: true, text, pageCount: null, needsVision: false };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Couldn't read that Word document: ${error.message}`
          : "Couldn't read that Word document.",
      pageCount: null,
    };
  }
}

function extractPlainText(bytes: Uint8Array): ExtractionResult {
  try {
    const text = tidy(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (text.length === 0) return { ok: false, reason: "That file is empty.", pageCount: null };
    return { ok: true, text, pageCount: null, needsVision: false };
  } catch {
    return { ok: false, reason: "That file isn't valid UTF-8 text.", pageCount: null };
  }
}

/**
 * Pulls plain text out of an accepted plan document.
 *
 * The mimeType must already have been resolved by validateUpload — this
 * function trusts it, and is never handed a browser-declared type.
 */
export async function extractPlanText(
  bytes: Uint8Array,
  mimeType: PlanMimeType,
): Promise<ExtractionResult> {
  switch (mimeType) {
    case "application/pdf":
      return extractPdf(bytes);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(bytes);
    case "text/plain":
    case "text/markdown":
      return extractPlainText(bytes);
    case "image/jpeg":
    case "image/png":
      return { ok: true, text: null, pageCount: null, needsVision: true };
  }
}
