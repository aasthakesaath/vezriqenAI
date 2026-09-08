import {
  ACCEPTED_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_PAGES,
  type PlanMimeType,
  humanFileSize,
} from "./limits";

export type ValidationFailure = {
  ok: false;
  /** Machine-readable so the API can map to a status code without string matching. */
  code: "empty" | "too_large" | "unsupported_type" | "content_mismatch" | "too_many_pages";
  message: string;
};

export type ValidationSuccess = { ok: true; mimeType: PlanMimeType };
export type ValidationResult = ValidationSuccess | ValidationFailure;

function fail(code: ValidationFailure["code"], message: string): ValidationFailure {
  return { ok: false, code, message };
}

/**
 * Identifies a file by its leading bytes.
 *
 * The browser-supplied Content-Type is a claim, not evidence: renaming
 * payload.exe to plan.pdf sets it to application/pdf. Sniffing the real bytes
 * is what PRD §23's "validate file types" actually requires, so a declared type
 * is only accepted when the content agrees with it.
 *
 * Returns null when the bytes match none of the accepted formats.
 */
export function sniffMimeType(bytes: Uint8Array): PlanMimeType | null {
  if (bytes.length >= 4) {
    // %PDF
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return "application/pdf";
    }
    // PK.. — ZIP container; DOCX is the only ZIP we accept.
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    // \xFF\xD8\xFF — JPEG SOI
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  }
  // \x89PNG\r\n\x1a\n
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return isProbablyText(bytes) ? "text/plain" : null;
}

/**
 * Treats the buffer as text if a decode round-trips and it holds no NUL and few
 * control characters. Binary formats we do not accept fail this quickly.
 */
export function isProbablyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (sample.includes(0x00)) return false;

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    return false;
  }

  let control = 0;
  for (const char of decoded) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x09 || (code > 0x0d && code < 0x20)) control += 1;
  }
  return control / decoded.length < 0.05;
}

/** text/markdown and text/plain are the same bytes; treat them as one family. */
function sameFamily(declared: string, sniffed: PlanMimeType): boolean {
  const textLike = ["text/plain", "text/markdown"];
  if (textLike.includes(declared) && textLike.includes(sniffed)) return true;
  return declared === sniffed;
}

export function validateUpload(input: {
  bytes: Uint8Array;
  declaredMimeType: string;
  filename?: string;
}): ValidationResult {
  const { bytes, declaredMimeType } = input;

  if (bytes.length === 0) return fail("empty", "That file is empty.");

  if (bytes.length > MAX_FILE_BYTES) {
    return fail(
      "too_large",
      `That file is ${humanFileSize(bytes.length)}. The limit is ${humanFileSize(MAX_FILE_BYTES)}.`,
    );
  }

  const normalisedDeclared = declaredMimeType.split(";")[0]!.trim().toLowerCase();
  const sniffed = sniffMimeType(bytes);

  if (!sniffed) {
    return fail(
      "unsupported_type",
      "That file type isn't supported. Upload a PDF, Word document, text or Markdown file, or a JPG/PNG screenshot.",
    );
  }

  if (!ACCEPTED_MIME_TYPES.includes(normalisedDeclared as PlanMimeType)) {
    return fail(
      "unsupported_type",
      "That file type isn't supported. Upload a PDF, Word document, text or Markdown file, or a JPG/PNG screenshot.",
    );
  }

  if (!sameFamily(normalisedDeclared, sniffed)) {
    return fail(
      "content_mismatch",
      `That file says it is ${normalisedDeclared} but its contents are not. Upload the original file.`,
    );
  }

  // Markdown is text/plain on the wire; keep the caller's more specific label.
  const resolved: PlanMimeType =
    normalisedDeclared === "text/markdown" && sniffed === "text/plain"
      ? "text/markdown"
      : sniffed;

  return { ok: true, mimeType: resolved };
}

export function validatePageCount(pages: number | null | undefined): ValidationResult | null {
  if (pages == null) return null;
  if (pages > MAX_PAGES) {
    return fail(
      "too_many_pages",
      `That document is ${pages} pages. The limit is ${MAX_PAGES}. Upload the section that holds the plan.`,
    );
  }
  return null;
}
