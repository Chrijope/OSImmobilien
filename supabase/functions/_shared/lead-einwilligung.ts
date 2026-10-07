/**
 * Die Einwilligung, die ein oeffentliches Lead-Formular mitschickt.
 *
 * Eine Einwilligung, von der nur ein Haken uebrig bleibt, ist im Streitfall
 * nichts wert. Nachweisbar ist sie erst mit dem Zeitpunkt und dem Wortlaut, den
 * die Person tatsaechlich gelesen hat. Der Wortlaut wird deshalb mitgeschickt
 * und mitgespeichert, nicht nur seine Fassungsnummer: Ein spaeter geaenderter
 * Text darf nicht rueckwirkend zu dem werden, dem jemand zugestimmt hat.
 *
 * Absichtlich getrennt: Pflicht und Werbung sind zwei Einwilligungen. Die eine
 * traegt die Auswertung und die Kontaktaufnahme, die andere die darueber
 * hinausgehende werbliche Ansprache. Sie in einen Haken zu packen, macht beide
 * angreifbar.
 *
 * Getestet von `src/lib/leadEinwilligung.test.ts`.
 */

/** Was am Kontakt gespeichert wird. */
export interface EinwilligungVermerk {
  /** Zeitpunkt der Erteilung in ISO-Form. */
  erteiltAm: string;
  /** Fassung des Textes, siehe `src/lib/leadEinwilligung.ts`. */
  version: string;
  /** Der Text, den die Person gelesen hat, im Wortlaut. */
  wortlaut: string;
  /** Freiwillige Werbeeinwilligung, nur vorhanden wenn ausdruecklich erteilt. */
  werbung?: {
    erteiltAm: string;
    version: string;
    wortlaut: string;
  };
}

const MAX_WORTLAUT = 2000;

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim().slice(0, MAX_WORTLAUT) : "";
}

function zeitpunkt(wert: unknown, jetzt: string): string {
  if (typeof wert !== "string" || !wert.trim()) return jetzt;
  const d = new Date(wert.trim());
  // Ein unbrauchbarer Zeitstempel aus dem Browser darf den Vermerk nicht
  // verderben. Dann zaehlt der Eingang auf dem Server.
  return Number.isNaN(d.getTime()) ? jetzt : d.toISOString();
}

/**
 * Liest das Feld `dsgvo_consent` aus dem Rumpf und macht daraus einen Vermerk.
 *
 * Bewusst nachsichtig, weil nicht jeder Zulieferer dasselbe schickt:
 *
 *   - ein Objekt mit `erteilt`, `version`, `text`, `am` (der Regelfall aus dem
 *     eigenen Formular),
 *   - ein blosses `true` (aeltere Zulieferer und Zapier),
 *   - gar nichts (Meta Lead Ads und alles, was seine Einwilligung woanders
 *     einholt). Dann gibt es keinen Vermerk, und der Lead geht trotzdem durch.
 *     Ein fehlender Haken darf keinen Lead verschlucken, sonst faellt die
 *     Aenderung allen bestehenden Wegen auf die Fuesse.
 */
export function leseEinwilligung(
  roh: unknown,
  jetzt: string = new Date().toISOString(),
): EinwilligungVermerk | null {
  if (roh === true) {
    return { erteiltAm: jetzt, version: "", wortlaut: "" };
  }
  if (!roh || typeof roh !== "object") return null;

  const o = roh as Record<string, unknown>;
  // `erteilt` fehlt bei Zulieferern, die nur Version und Text schicken. Dann
  // gilt das Vorhandensein des Objekts als Zustimmung.
  const erteilt = o.erteilt === undefined ? true : o.erteilt === true;
  if (!erteilt) return null;

  const vermerk: EinwilligungVermerk = {
    erteiltAm: zeitpunkt(o.am, jetzt),
    version: text(o.version),
    wortlaut: text(o.text),
  };

  const w = o.werbung;
  if (w && typeof w === "object") {
    const wo = w as Record<string, unknown>;
    if (wo.erteilt === true) {
      vermerk.werbung = {
        erteiltAm: zeitpunkt(wo.am, vermerk.erteiltAm),
        version: text(wo.version),
        wortlaut: text(wo.text),
      };
    }
  }

  return vermerk;
}

/**
 * Die Fassungen der Handbuch-Seite, die der Server annimmt (Befund HB-007).
 * Sie muessen mit `src/lib/leadEinwilligung.ts` uebereinstimmen, das prueft
 * `src/lib/leadEinwilligung.test.ts`.
 */
export const HANDBUCH_FASSUNGEN = {
  konfigurator: ["2026-09-handbuch-v1", "2026-09-handbuch-v1-en"],
  selbstauskunft: ["2026-09-handbuch-sa-v1", "2026-09-handbuch-sa-v1-en"],
} as const;

/**
 * Auf den beiden Wegen der Handbuch-Seite ist die Einwilligung Pflicht, und
 * zwar auf dem Server: Der Haken im Browser allein haelt einen selbst gebauten
 * Aufruf nicht auf. Verlangt wird ausdruecklich `erteilt: true`, eine Fassung
 * dieses Weges und ein Wortlaut. Die Nachsicht von `leseEinwilligung` fuer
 * Meta Lead Ads und Zapier gilt hier bewusst nicht.
 */
export function handbuchEinwilligungGueltig(
  roh: unknown,
  weg: keyof typeof HANDBUCH_FASSUNGEN,
): boolean {
  if (!roh || typeof roh !== "object") return false;
  const o = roh as Record<string, unknown>;
  if (o.erteilt !== true) return false;
  const version = typeof o.version === "string" ? o.version.trim() : "";
  if (!(HANDBUCH_FASSUNGEN[weg] as readonly string[]).includes(version)) return false;
  return typeof o.text === "string" && o.text.trim().length > 0;
}
