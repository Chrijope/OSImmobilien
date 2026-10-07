import { supabase } from "@/integrations/supabase/client";
import { compressForUpload } from "@/lib/imageCompression";
import { getObjektMedienUrl, validateUploadFile, extractStoragePath } from "@/lib/storage";

/**
 * Ein Foto zum Objekt eines Investments hochladen.
 *
 * Es gibt bewusst keinen neuen Speicherbereich. Das Bild ist ein Immobilien-
 * foto wie jedes andere und liegt deshalb im vorhandenen Bereich
 * "objekt-medien" unter dem Präfix "objektfotos/", genau dort, wo auch die
 * Bilder der Objekte aus dem eigenen Bestand und die Exposés liegen. Damit
 * gelten die vorhandenen Zugriffsregeln unverändert:
 *
 *   Schreiben  nur interne Rollen (`is_internal_role`), also unter anderem
 *              Admin, Inhaber, Vertriebsleiter und Vertriebspartner.
 *   Lesen      offen, wie bei allen Objektfotos und Exposés. So sieht der
 *              Kunde sein Bild im Portal, ohne dass ihm ein zusätzliches Recht
 *              eingeräumt werden muss.
 *
 * Deshalb ist für diese Erweiterung keine Migration nötig. Wer kein Bild
 * hochladen darf, bekommt vom Speicher eine Ablehnung, und die wird unten in
 * einen verständlichen Satz übersetzt statt in eine englische Fehlermeldung.
 */

const BEREICH = "objekt-medien";

/** Grenzen und erlaubte Formate kommen aus der gemeinsamen Prüfung in `storage`. */
export const ERLAUBTE_BILD_FORMATE = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export interface BildUploadErgebnis {
  ok: boolean;
  /** Fertige Adresse des Bildes, nur bei Erfolg. */
  url?: string;
  /** Verständlicher Satz für die Oberfläche, nur bei Misserfolg. */
  fehler?: string;
}

/** Endung aus dem Dateinamen, mit brauchbarem Rückfall. */
function endung(name: string, rueckfall: string): string {
  const teil = name.split(".").pop();
  if (!teil || teil.length > 5 || teil.includes("/")) return rueckfall;
  return teil.toLowerCase();
}

/**
 * Lädt ein Bild hoch und liefert seine Adresse.
 *
 * Wirft nie. Jeder Fehlerfall kommt als Satz zurück, den die Oberfläche direkt
 * anzeigen kann: zu groß, falsches Format, keine Berechtigung, Verbindung weg.
 */
export async function ladeObjektBildHoch(
  investmentId: string,
  datei: File,
): Promise<BildUploadErgebnis> {
  if (!investmentId) return { ok: false, fehler: "Kein Investment ausgewählt." };
  if (!datei) return { ok: false, fehler: "Keine Datei ausgewählt." };

  /*
   * Erst prüfen, dann arbeiten.
   *
   * Die gemeinsame Prüfung kennt die Grenze von zehn Megabyte und die
   * erlaubten Formate. Ein PDF, das jemand versehentlich auswählt, scheitert
   * hier mit einem klaren Satz und nicht erst beim Hochladen.
   */
  const geprueft = validateUploadFile(datei, "image");
  if (!geprueft.ok) {
    return {
      ok: false,
      fehler: /Dateityp/.test(geprueft.error || "")
        ? "Bitte ein Bild auswählen, etwa JPG, PNG oder WEBP."
        : geprueft.error || "Die Datei konnte nicht verwendet werden.",
    };
  }

  /*
   * Verkleinern, damit ein Foto vom Telefon nicht mit acht Megabyte im Portal
   * landet. Schlägt das fehl, etwa bei einem ungewöhnlichen Format, wird das
   * Original genommen. Ein Bild, das etwas groß ist, ist besser als keines.
   */
  let hochzuladen: File = datei;
  try {
    const { compressed } = await compressForUpload(datei, "standard");
    if (compressed && compressed.size > 0) hochzuladen = compressed;
  } catch {
    hochzuladen = datei;
  }

  const pfad = [
    "objektfotos/investment",
    investmentId,
    `${Date.now()}_${Math.random().toString(36).slice(2)}.${endung(hochzuladen.name, "webp")}`,
  ].join("/");

  try {
    const { error } = await supabase.storage
      .from(BEREICH)
      .upload(pfad, hochzuladen, { contentType: hochzuladen.type || "image/jpeg", upsert: false });

    if (error) {
      const meldung = (error.message || "").toLowerCase();
      if (meldung.includes("row-level security") || meldung.includes("permission") || meldung.includes("unauthorized")) {
        return { ok: false, fehler: "Für das Hochladen von Bildern fehlt die Berechtigung." };
      }
      if (meldung.includes("payload") || meldung.includes("too large") || meldung.includes("size")) {
        return { ok: false, fehler: "Das Bild ist zu groß. Bitte ein kleineres wählen." };
      }
      return { ok: false, fehler: "Das Bild konnte nicht gespeichert werden. Bitte erneut versuchen." };
    }

    return { ok: true, url: getObjektMedienUrl(pfad) };
  } catch {
    // Verbindung weg, Fenster geschlossen, Zeitüberschreitung.
    return { ok: false, fehler: "Keine Verbindung zum Speicher. Bitte erneut versuchen." };
  }
}

/**
 * Entfernt ein zuvor hochgeladenes Bild aus dem Speicher.
 *
 * Nur für Bilder, die zu einem Investment gehören. Ein Bild aus dem eigenen
 * Bestand wird hier nie gelöscht, auch nicht versehentlich: Der Pfad muss mit
 * "objektfotos/investment/" beginnen, sonst passiert nichts.
 *
 * Scheitert das Löschen, ist das kein Grund, den Vorgang abzubrechen. Der
 * Verweis am Investment ist dann bereits weg, im Speicher bleibt eine
 * verwaiste Datei zurück. Das ist die harmlosere Hälfte des Problems.
 */
export async function loescheObjektBild(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const pfad = extractStoragePath(url, BEREICH);
  if (!pfad || !pfad.startsWith("objektfotos/investment/")) return;
  try {
    await supabase.storage.from(BEREICH).remove([pfad]);
  } catch {
    /* Ein verwaistes Bild im Speicher darf den Nutzer nicht aufhalten. */
  }
}
