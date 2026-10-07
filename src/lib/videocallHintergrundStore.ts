import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "./currentUser";

/**
 * Eigene Hintergrundbilder fuer den Videoraum.
 *
 * Die Bilder liegen im privaten Bucket `videocall-hintergruende`, jeder
 * Nutzer ausschliesslich in seinem eigenen Verzeichnis `<userId>/…` (RLS,
 * siehe Migration `20260827180000_videocall_hintergruende.sql`). Solange die
 * Migration nicht gelaufen ist, gibt es den Bucket nicht: Alles hier faellt
 * dann weich zurueck und meldet `bucketFehlt`, damit die Oberflaeche einen
 * Hinweis zeigen kann, statt abzustuerzen.
 */

const BUCKET = "videocall-hintergruende";
/** Breiter muss ein Hintergrund nicht sein, das spart Speicher und Ladezeit. */
export const MAX_BREITE = 1920;
const ERLAUBTE_TYPEN = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export interface HintergrundBild {
  /** Pfad im Bucket, zugleich der Wert in der gespeicherten Wahl. */
  pfad: string;
  name: string;
}

export interface HintergrundListe {
  bilder: HintergrundBild[];
  /** Der Bucket existiert nicht, die Migration ist noch nicht gelaufen. */
  bucketFehlt: boolean;
}

/** Sieht der Fehler nach einem fehlenden Bucket aus? */
function istBucketFehler(fehler: { message?: string; statusCode?: string | number } | null): boolean {
  const text = (fehler?.message ?? "").toLowerCase();
  return text.includes("bucket not found") || text.includes("not found");
}

export async function listeHintergrundBilder(): Promise<HintergrundListe> {
  const userId = getCurrentUserId();
  if (!userId) return { bilder: [], bucketFehlt: false };
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
    limit: 50,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) {
    console.warn("Hintergrundbilder nicht lesbar:", error);
    return { bilder: [], bucketFehlt: istBucketFehler(error) };
  }
  return {
    bilder: (data ?? [])
      .filter((e) => e.name && !e.name.startsWith("."))
      .map((e) => ({ pfad: `${userId}/${e.name}`, name: e.name })),
    bucketFehlt: false,
  };
}

/**
 * Signierte Adresse zu einem Bild. Der Bucket ist privat, eine feste URL gibt
 * es deshalb nicht. Sechs Stunden reichen fuer jedes Gespraech.
 */
export async function hintergrundBildUrl(pfad: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pfad, 60 * 60 * 6);
  if (error || !data?.signedUrl) {
    console.warn("Signierte Adresse fehlgeschlagen:", error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Ein Bild clientseitig auf hoechstens `MAX_BREITE` Pixel Breite bringen und
 * als JPEG neu packen. Ein 12-MB-Handyfoto wird so zu ein paar hundert
 * Kilobyte, ohne dass man es dem Hintergrund ansieht.
 */
export async function verkleinereHintergrundBild(datei: File): Promise<Blob> {
  const bitmap = await createImageBitmap(datei);
  try {
    const faktor = Math.min(1, MAX_BREITE / bitmap.width);
    const b = Math.max(1, Math.round(bitmap.width * faktor));
    const h = Math.max(1, Math.round(bitmap.height * faktor));
    const flaeche = document.createElement("canvas");
    flaeche.width = b;
    flaeche.height = h;
    const stift = flaeche.getContext("2d");
    if (!stift) return datei;
    stift.drawImage(bitmap, 0, 0, b, h);
    const blob = await new Promise<Blob | null>((fertig) => flaeche.toBlob(fertig, "image/jpeg", 0.85));
    return blob ?? datei;
  } finally {
    bitmap.close();
  }
}

export interface UploadErgebnis {
  bild: HintergrundBild | null;
  bucketFehlt: boolean;
  fehler: string | null;
}

export async function ladeHintergrundBildHoch(datei: File): Promise<UploadErgebnis> {
  const userId = getCurrentUserId();
  if (!userId) return { bild: null, bucketFehlt: false, fehler: "Nicht angemeldet." };
  if (!ERLAUBTE_TYPEN.includes(datei.type)) {
    return { bild: null, bucketFehlt: false, fehler: "Bitte ein Bild als JPEG, PNG oder WebP auswählen." };
  }

  let blob: Blob;
  try {
    blob = await verkleinereHintergrundBild(datei);
  } catch (fehler) {
    console.warn("Bild konnte nicht verkleinert werden:", fehler);
    return { bild: null, bucketFehlt: false, fehler: "Das Bild konnte nicht gelesen werden." };
  }

  // Sprechender, aber sicherer Name: Zeitstempel plus entschaerfter Original-
  // name, Endung fest auf .jpg, weil neu als JPEG gepackt wurde.
  const basis = datei.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 40) || "hintergrund";
  const name = `${Date.now()}-${basis}.jpg`;
  const pfad = `${userId}/${name}`;

  const { error } = await supabase.storage.from(BUCKET).upload(pfad, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) {
    console.warn("Hintergrund-Upload fehlgeschlagen:", error);
    return {
      bild: null,
      bucketFehlt: istBucketFehler(error),
      fehler: istBucketFehler(error)
        ? "Der Speicher für Hintergrundbilder ist noch nicht eingerichtet."
        : "Das Bild konnte nicht hochgeladen werden.",
    };
  }
  return { bild: { pfad, name }, bucketFehlt: false, fehler: null };
}

export async function loescheHintergrundBild(pfad: string): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).remove([pfad]);
  if (error) {
    console.warn("Hintergrundbild konnte nicht gelöscht werden:", error);
    return false;
  }
  return true;
}
