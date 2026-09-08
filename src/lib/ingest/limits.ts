/** PRD §7 — Phase 1 ingestion limits, in one place so the UI and the server agree. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_PAGES = 100;
export const MAX_PASTED_CHARS = 200_000;
export const MIN_PLAN_CHARS = 40;

export type PlanMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "text/plain"
  | "text/markdown"
  | "image/jpeg"
  | "image/png";

/** The complete accepted set. Anything not listed here is rejected server-side. */
export const ACCEPTED_MIME_TYPES: readonly PlanMimeType[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/jpeg",
  "image/png",
];

/** Extensions offered to the file picker. Convenience only — never trusted. */
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".jpg", ".jpeg", ".png"] as const;

export const ACCEPT_ATTRIBUTE = [...ACCEPTED_MIME_TYPES, ...ACCEPTED_EXTENSIONS].join(",");

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Canonical extension for a stored object; never taken from the filename. */
export const EXTENSION_FOR_MIME: Record<PlanMimeType, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Strips any directory component a browser may have sent. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "plan";
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "plan";
}
