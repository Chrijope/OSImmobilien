import { edgeFehlerMitGrund } from "@/lib/edgeFehler";

/** Die Edge Function, die seit dem 23.09.2026 sperrt und entsperrt. */
export const KUNDENPORTAL_SPERRE_FUNCTION = "kundenportal-sperre";

/**
 * Antwort des Servers, schon auf das reduziert, was der Bildschirm braucht.
 * `meta` ist der neue Stand der Zusatzdaten am Kontakt, damit der
 * Zwischenspeicher ohne zweiten Ladevorgang stimmt. `warnung` heißt: Die
 * Sperre steht, aber an der Anmeldung ist etwas nicht durchgegangen.
 */
export type SperrErgebnis =
  | { ok: true; meta: Record<string, unknown> | null; warnung?: string }
  | { ok: false; grund: string };

interface Meldung {
  title: string;
  description?: string;
  variant?: "destructive";
}

interface Abhaengigkeiten {
  /** Setzt die Sperre auf dem Server und wartet auf dessen Antwort. */
  sperreSetzen: (gesperrt: boolean) => Promise<SperrErgebnis>;
  /** Der Toast der Seite. */
  melden: (meldung: Meldung) => void;
  /** Holt nach einem Fehlschlag den gespeicherten Stand neu. */
  neuLaden: () => void;
}

/** Macht aus der Rohmeldung des Servers einen Satz für den Schirm. */
export function lesbarerSperrGrund(roh: string): string {
  if (/not authorized|permission denied|42501/i.test(roh)) return "Keine Berechtigung für diesen Kontakt";
  if (/failed to fetch|failed to send|network|load failed/i.test(roh)) return "Keine Verbindung zum Server";
  return roh.trim().replace(/\.$/, "") || "Unbekannter Fehler";
}

type Aufruf = (
  name: string,
  optionen: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: unknown }>;

const standardAufruf: Aufruf = async (name, optionen) => {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase.functions.invoke(name, optionen);
};

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return !!wert && typeof wert === "object" && !Array.isArray(wert);
}

/**
 * Sperrt oder entsperrt das Portal über die Edge Function
 * `kundenportal-sperre`. Sie prüft das Recht (Admin, Inhaber, zuständiger
 * Vertriebspartner), hält die Sperre in der Datenbank fest und sperrt die
 * Anmeldung des Kunden. Ein Fehlschlag kommt mit dem Grund aus der Antwort
 * zurück, auch wenn die Function noch nicht ausgerollt ist.
 */
export async function portalSperreAmServer(
  kontaktId: string,
  gesperrt: boolean,
  aufrufen: Aufruf = standardAufruf,
): Promise<SperrErgebnis> {
  let antwort: { data: unknown; error: unknown };
  try {
    antwort = await aufrufen(KUNDENPORTAL_SPERRE_FUNCTION, { body: { kontaktId, gesperrt } });
  } catch (e) {
    return { ok: false, grund: e instanceof Error ? e.message : String(e) };
  }

  if (antwort.error) {
    const mitGrund = await edgeFehlerMitGrund(antwort.error, { functionName: KUNDENPORTAL_SPERRE_FUNCTION });
    const text = (mitGrund as { message?: unknown } | null)?.message;
    return { ok: false, grund: typeof text === "string" && text.trim() ? text : String(mitGrund) };
  }

  const daten = istObjekt(antwort.data) ? antwort.data : null;
  if (!daten || daten.ok !== true) {
    const grund = typeof daten?.error === "string" ? daten.error : "Unerwartete Antwort vom Server";
    return { ok: false, grund };
  }

  const anmeldungFehler = Number(daten.anmeldungFehler) || 0;
  const warnung = anmeldungFehler > 0
    ? gesperrt
      ? "Die Anmeldung des Kunden ließ sich nicht sperren. Er sieht nach dem Anmelden nur den Sperrhinweis. Versuch es später noch einmal über Entsperren und Sperren."
      : "Die Anmeldung des Kunden ist noch gesperrt. Bitte sperre und entsperre das Portal gleich noch einmal."
    : undefined;

  return { ok: true, meta: istObjekt(daten.meta) ? daten.meta : null, warnung };
}

/**
 * Sperrt oder entsperrt das Kundenportal und meldet das Ergebnis erst, wenn
 * der Server geantwortet hat.
 *
 * Bis zum 23.09.2026 wurde der neue Stand sofort angezeigt und „Portal
 * gesperrt“ gemeldet, der Schreibvorgang lief ohne Warten hinterher. Schlug
 * er fehl, stand der Fehler nur in der Konsole: Das CRM zeigte „Gesperrt“,
 * der Kunde kam aber weiter hinein. Jetzt ändert sich die Anzeige erst mit
 * der Antwort, und ein Fehlschlag kommt als Fehler-Toast mit Grund. Danach
 * wird der gespeicherte Stand neu geladen, damit nichts Falsches stehen bleibt.
 *
 * Seit dem 23.09.2026 geht der Weg nicht mehr über `merge_kontakt_meta`,
 * sondern über die Edge Function (`portalSperreAmServer`). Erst damit wirkt
 * die Sperre auch auf dem Server.
 *
 * Rückgabe: `true`, wenn der neue Stand gespeichert ist. Aktivität und
 * Neuzeichnen übernimmt der Aufrufer.
 */
export async function schaltePortalSperre(
  gesperrt: boolean,
  { sperreSetzen, melden, neuLaden }: Abhaengigkeiten,
): Promise<boolean> {
  let ergebnis: SperrErgebnis;
  try {
    ergebnis = await sperreSetzen(gesperrt);
  } catch (e) {
    ergebnis = { ok: false, grund: e instanceof Error ? e.message : String(e) };
  }

  if (ergebnis.ok === false) {
    melden({
      title: gesperrt ? "Portal wurde nicht gesperrt" : "Portal wurde nicht entsperrt",
      description: `Grund: ${lesbarerSperrGrund(ergebnis.grund)}. Angezeigt ist wieder der gespeicherte Stand.`,
      variant: "destructive",
    });
    neuLaden();
    return false;
  }

  if (ergebnis.warnung) {
    melden({
      title: gesperrt ? "Portal gesperrt, Anmeldung noch offen" : "Portal entsperrt, Anmeldung noch gesperrt",
      description: ergebnis.warnung,
      variant: "destructive",
    });
    return true;
  }

  melden(gesperrt
    ? { title: "Portal gesperrt", description: "Der Kunde hat keinen Zugriff mehr auf das Kundenportal." }
    : { title: "Portal entsperrt ✓", description: "Der Kunde kann wieder auf das Kundenportal zugreifen." });
  return true;
}
