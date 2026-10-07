/**
 * Zentrale Upload-Limit-Validierung.
 * Nutzung:
 *   const err = validateUploadFile(file, "image");
 *   if (err) return; // Toast wurde bereits gezeigt
 */
import { toast } from "sonner";

export type UploadKind = "image" | "pdf" | "video" | "document" | "generic";

const LIMITS_MB: Record<UploadKind, number> = {
  image: 10,
  pdf: 25,
  document: 25,
  video: 200,
  generic: 50,
};

const ALLOWED_PREFIXES: Partial<Record<UploadKind, string[]>> = {
  image: ["image/"],
  pdf: ["application/pdf"],
  video: ["video/"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-excel",
    "text/",
    "image/",
  ],
};

/**
 * Validiert Dateigröße und (optional) MIME-Type. Zeigt Toast bei Fehler.
 * @returns null wenn OK, sonst Fehlermeldung als String.
 */
export function validateUploadFile(
  file: File | null | undefined,
  kind: UploadKind = "generic",
  options?: { silent?: boolean },
): string | null {
  if (!file) return "Keine Datei ausgewählt";

  const maxBytes = LIMITS_MB[kind] * 1024 * 1024;
  if (file.size > maxBytes) {
    const msg = `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${LIMITS_MB[kind]} MB.`;
    if (!options?.silent) toast.error(msg);
    return msg;
  }

  const allowed = ALLOWED_PREFIXES[kind];
  if (allowed && file.type) {
    const ok = allowed.some((p) => file.type.startsWith(p));
    if (!ok) {
      const msg = `Dateityp nicht erlaubt: ${file.type || "unbekannt"}`;
      if (!options?.silent) toast.error(msg);
      return msg;
    }
  }

  return null;
}

/** Validiert mehrere Files; gibt nur die gültigen zurück, Fehler werden gemeldet. */
export function filterValidUploads(
  files: FileList | File[] | null | undefined,
  kind: UploadKind = "generic",
): File[] {
  if (!files) return [];
  const arr = Array.from(files);
  return arr.filter((f) => validateUploadFile(f, kind) === null);
}

export const UPLOAD_LIMITS_MB = LIMITS_MB;