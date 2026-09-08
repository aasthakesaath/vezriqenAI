import { describe, expect, it } from "vitest";
import { sniffMimeType, validateUpload, isProbablyText } from "@/lib/ingest/validate";
import { ACCEPTED_MIME_TYPES, MAX_FILE_BYTES } from "@/lib/ingest/limits";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const TEXT = new TextEncoder().encode("# My plan\n\nStudy for the SAT.\n");
/** A tiny ELF binary — the classic "renamed executable" upload. */
const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00]);

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("content sniffing", () => {
  it("identifies each accepted format from its leading bytes", () => {
    expect(sniffMimeType(PDF)).toBe("application/pdf");
    expect(sniffMimeType(PNG)).toBe("image/png");
    expect(sniffMimeType(JPEG)).toBe("image/jpeg");
    expect(sniffMimeType(DOCX)).toBe(DOCX_MIME);
    expect(sniffMimeType(TEXT)).toBe("text/plain");
  });

  it("does not mistake a binary for text", () => {
    expect(isProbablyText(ELF)).toBe(false);
    expect(sniffMimeType(ELF)).toBeNull();
  });
});

describe("server-side upload validation (PRD §7, §23)", () => {
  it("accepts every format the PRD lists", () => {
    const cases: Array<[Uint8Array, string]> = [
      [PDF, "application/pdf"],
      [DOCX, DOCX_MIME],
      [TEXT, "text/plain"],
      [TEXT, "text/markdown"],
      [JPEG, "image/jpeg"],
      [PNG, "image/png"],
    ];
    for (const [bytes, declared] of cases) {
      const result = validateUpload({ bytes, declaredMimeType: declared });
      expect(result.ok, `${declared} should be accepted`).toBe(true);
    }
    // The accepted list and the PRD list are the same length — nothing extra.
    expect(ACCEPTED_MIME_TYPES).toHaveLength(6);
  });

  it("keeps the markdown label when markdown is declared", () => {
    const result = validateUpload({ bytes: TEXT, declaredMimeType: "text/markdown" });
    expect(result.ok && result.mimeType).toBe("text/markdown");
  });

  it("tolerates a charset parameter on the declared type", () => {
    const result = validateUpload({ bytes: TEXT, declaredMimeType: "text/plain; charset=utf-8" });
    expect(result.ok).toBe(true);
  });

  // This is the one that matters: the browser's Content-Type is a claim, and a
  // renamed binary makes that claim convincingly.
  it("rejects an executable renamed to .pdf and declared as application/pdf", () => {
    const result = validateUpload({
      bytes: ELF,
      declaredMimeType: "application/pdf",
      filename: "plan.pdf",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("unsupported_type");
  });

  it("rejects a PNG masquerading as a PDF", () => {
    const result = validateUpload({ bytes: PNG, declaredMimeType: "application/pdf" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("content_mismatch");
  });

  it("rejects a type outside the accepted set even when the bytes are readable", () => {
    const result = validateUpload({ bytes: TEXT, declaredMimeType: "text/html" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("unsupported_type");
  });

  it("rejects an empty file", () => {
    const result = validateUpload({ bytes: new Uint8Array(), declaredMimeType: "application/pdf" });
    expect(result.ok === false && result.code).toBe("empty");
  });

  it("enforces the 25 MB limit from PRD §7", () => {
    const oversize = new Uint8Array(MAX_FILE_BYTES + 1);
    oversize.set(PDF, 0);
    const result = validateUpload({ bytes: oversize, declaredMimeType: "application/pdf" });
    expect(result.ok === false && result.code).toBe("too_large");
    expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
  });
});
