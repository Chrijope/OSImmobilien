/**
 * Der Versand einer Objekteinreichung.
 *
 * WARUM NICHT MEHR DIREKT IN DIE TABELLE
 *
 * Bis zum 18.09.2026 schrieb das Formular unter /objekt-akquise selbst in
 * `objekt_einreichungen`. Die Richtlinie "Oeffentliche Einreichungen
 * erstellen" liess das jedem zu, angemeldet oder nicht, ohne jede Bremse. Ein
 * Skript konnte damit beliebig viele erfundene Einreichungen anlegen, samt
 * erfundener Eigentuemerdaten.
 *
 * Abfliessen kann dabei nichts, die Angaben traegt der Einreicher selbst ein.
 * Es geht um die Gegenrichtung: Muell, den hinterher ein Mensch aussortieren
 * muss.
 *
 * Deshalb laeuft der Versand jetzt ueber die Edge Function
 * `submit-objekt-einreichung`. Sie traegt beides: den Honigtopf und das
 * Kontingent je Anschluss, mit derselben Postgres-Funktion, die auch
 * `submit-lead` benutzt.
 *
 * Solange die Function noch nicht ausgerollt ist, meldet der Versand einen
 * Fehler und das Formular sagt es. Es stuerzt nicht ab.
 */
import { supabase } from "@/integrations/supabase/client";

/** Die Function, die die Einreichung entgegennimmt. */
export const EINREICHUNG_FUNCTION = "submit-objekt-einreichung";

export interface EinreichungAntwort {
  ok: boolean;
  /** Die Meldung der Datenbank, unveraendert. Das Formular liest sie aus. */
  fehler?: string;
  /** Das Kontingent je Anschluss ist erschoepft. */
  zuVieleAnfragen?: boolean;
  /**
   * Die Function selbst hat nicht geantwortet, etwa weil sie noch nicht
   * ausgerollt ist oder das Netz streikt. Dann steht in `fehler` bereits ein
   * Satz, den ein Einreicher lesen kann, und keine technische Meldung.
   */
  nichtErreichbar?: boolean;
}

/** Was der Einreicher liest, wenn der Versand gerade nicht geht. */
export const VERSAND_GESTOERT =
  "Der Versand ist im Moment leider nicht möglich. Bitte versuche es später noch einmal oder melde dich direkt bei uns.";

/** Was der Einreicher liest, wenn der Bild-Upload gerade nicht geht. */
export const UPLOAD_GESTOERT =
  "Der Bild-Upload ist gerade nicht möglich. Du kannst das Formular trotzdem absenden, wir fragen Bilder dann bei dir an.";

/** Liest den Status aus dem Fehlerobjekt von `functions.invoke`, wenn er da ist. */
function status(fehler: unknown): number | null {
  const kontext = (fehler as { context?: { status?: number } } | null)?.context;
  return typeof kontext?.status === "number" ? kontext.status : null;
}

/**
 * Schickt eine Einreichung ab.
 *
 * @param zeile      Die Spalten der Einreichung, so wie sie das Formular baut.
 * @param honigtopf  Das unsichtbare Feld. Es muss leer sein. Ist es gefuellt,
 *                   nimmt die Function die Eingabe freundlich an und wirft sie
 *                   weg, ohne dem Absender etwas davon zu sagen.
 */
export async function sendeObjektEinreichung(
  zeile: Record<string, unknown>,
  honigtopf = "",
): Promise<EinreichungAntwort> {
  try {
    const { data, error } = await supabase.functions.invoke(EINREICHUNG_FUNCTION, {
      body: { zeile, hp: honigtopf },
    });
    if (error) {
      if (status(error) === 429) {
        return {
          ok: false,
          zuVieleAnfragen: true,
          fehler: "Zu viele Einreichungen in kurzer Zeit. Bitte versuche es später noch einmal.",
        };
      }
      /* Alles andere aus dieser Ecke ist nichts, womit ein Einreicher etwas
         anfangen koennte: Netzfehler, eine noch nicht ausgerollte Function,
         ein abgewiesener Koerper. Er bekommt deshalb einen Satz und keine
         technische Meldung. Fehler aus der Datenbank kommen den anderen Weg,
         als `ok: false` im Koerper, und behalten ihren Wortlaut. */
      console.error("[Objekteinreichung] Function nicht erreichbar:", error);
      return { ok: false, nichtErreichbar: true, fehler: VERSAND_GESTOERT };
    }
    const antwort = (data || {}) as { ok?: boolean; fehler?: string };
    if (antwort.ok) return { ok: true };
    return { ok: false, fehler: antwort.fehler || "Der Versand hat nicht geklappt." };
  } catch (e) {
    console.error("[Objekteinreichung] Versand fehlgeschlagen:", e);
    return { ok: false, nichtErreichbar: true, fehler: VERSAND_GESTOERT };
  }
}

/**
 * Laedt ein Bild der Einreichung hoch, mit oder ohne Anmeldung.
 *
 * Seit dem 04.10.2026 nicht mehr direkt in den Speicher, sondern ueber
 * dieselbe Function. Sie nimmt nur Bilder bis 15 MB an, legt sie im Ordner
 * der Anmeldung ab und vergibt den Dateinamen selbst. Rueckgabe ist die
 * oeffentliche Adresse; bei einem Fehler wirft sie mit einem Satz, den ein
 * Einreicher lesen kann.
 */
/** Die Typen, die die Function annimmt. Gleich im Dateidialog des Formulars. */
export const EINREICHUNG_BILDTYPEN = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif";
/** Hoechstgroesse je Datei, wie in der Function. */
export const EINREICHUNG_MAX_MB = 15;
export async function ladeEinreichungsDateiHoch(datei: File): Promise<string> {
  const formular = new FormData();
  formular.append("datei", datei, datei.name);
  const { data, error } = await supabase.functions.invoke(EINREICHUNG_FUNCTION, { body: formular });
  const antwort = (data || {}) as { ok?: boolean; url?: string; fehler?: string };
  if (!error && antwort.ok && antwort.url) return antwort.url;
  if (status(error) === 429) throw new Error("Zu viele Dateien in kurzer Zeit. Bitte versuche es später noch einmal.");
  if (status(error) === 413) throw new Error(`Die Datei ist zu groß (höchstens ${EINREICHUNG_MAX_MB} MB).`);
  if (status(error) === 415) throw new Error("Bitte nur Bilder hochladen (JPEG, PNG, WebP, GIF oder HEIC).");
  console.error("[Objekteinreichung] Upload fehlgeschlagen:", error || antwort.fehler);
  throw new Error(UPLOAD_GESTOERT);
}
