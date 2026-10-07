/**
 * Vormerkung einer Einheit im Browser: Meldungen, Anzeige und die Ampel der
 * Investments.
 *
 * Die Regeln selbst stehen in
 * `supabase/functions/_shared/einheit-vormerkung.ts`, dieselbe Datei lesen die
 * Edge Functions. Entschieden wird in der Datenbank (`vormerke_einheit`), hier
 * steht nur, was die Oberfläche daraus macht. Ein ausgeblendeter Knopf ist
 * keine Zugriffskontrolle.
 *
 * Bewusst ohne Store-Abhängigkeiten außer dem Zwischenspeicher, weil der
 * `objekteStore` diese Datei liest. Die Ampel der Investments steht deshalb
 * in `reservierungStart.ts`.
 */
import { cacheGet } from "@/lib/dataCache";
import {
  VORMERKUNG_MINUTEN,
  einheitBelegt,
  funktionFehlt,
  kundeGesetzt,
  vormerkenMoeglich,
  vormerkungAktiv,
  vormerkungFuerAnderen,
  type EinheitStand,
} from "../../supabase/functions/_shared/einheit-vormerkung";

export {
  VORMERKUNG_MINUTEN,
  einheitBelegt,
  kundeGesetzt,
  vormerkenMoeglich,
  vormerkungAktiv,
  vormerkungFuerAnderen,
  type EinheitStand,
};

/** Name der Migration, für Hinweise an Admin und Inhaber. */
export const VORMERKUNG_MIGRATION = "20260923150000_reservierung_vormerkung.sql";

/** Der Hinweis, solange die Migration fehlt. Nur Admin und Inhaber sehen ihn. */
export const VORMERKUNG_MIGRATION_HINWEIS = "Migration Vormerkung noch nicht ausgeführt";

/** Was `vormerke_einheit` antwortet, dazu die zwei Fälle aus dem Browser. */
export type VormerkGrund =
  | "vorgemerkt"
  | "vergeben"
  | "vorgemerkt_von_anderem"
  | "keine_berechtigung"
  | "globalobjekt"
  | "exklusiv"
  | "nicht_gefunden"
  /** Die Datenbankfunktion fehlt, die Migration ist noch nicht gelaufen. */
  | "ohne_migration"
  /** Netz, Server oder eine unerwartete Antwort. */
  | "fehler";

export interface VormerkErgebnis {
  ok: boolean;
  grund: VormerkGrund;
  vorgemerktBis?: string;
  beraterName?: string;
  /** Technischer Grund bei „fehler“, fürs Protokoll und die Meldung. */
  fehlerText?: string;
}

const BEKANNTE_GRUENDE: VormerkGrund[] = [
  "vorgemerkt", "vergeben", "vorgemerkt_von_anderem", "keine_berechtigung",
  "globalobjekt", "exklusiv", "nicht_gefunden",
];

function textOderLeer(wert: unknown): string | undefined {
  return typeof wert === "string" && wert.trim() ? wert.trim() : undefined;
}

/**
 * Die Antwort der Datenbankfunktion lesen.
 *
 * Sie kommt als jsonb. Alles, was nicht wie eine bekannte Antwort aussieht,
 * gilt als Fehler und NICHT als Erfolg: Im Zweifel geht keine Vereinbarung
 * hinaus.
 */
export function vormerkErgebnisLesen(data: unknown): VormerkErgebnis {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const grund = String(d.grund ?? "") as VormerkGrund;
  if (!BEKANNTE_GRUENDE.includes(grund)) {
    return { ok: false, grund: "fehler", fehlerText: `Unerwartete Antwort: ${JSON.stringify(data)}` };
  }
  return {
    ok: d.ok === true && grund === "vorgemerkt",
    grund,
    vorgemerktBis: textOderLeer(d.vorgemerkt_bis),
    beraterName: textOderLeer(d.vorgemerkt_berater_name),
  };
}

/** Fehlt die Datenbankfunktion, weil die Migration noch nicht gelaufen ist? */
export function vormerkFunktionFehlt(fehler: unknown): boolean {
  return funktionFehlt(fehler);
}

/** „14:35“ aus einem Zeitpunkt, in deutscher Zeit. Leer bei Unsinn. */
export function uhrzeit(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
}

/**
 * Die Meldung zu einer abgelehnten Vormerkung, in Du-Form und ohne Technik.
 *
 * Wichtig ist der letzte Satz: Bei jeder Ablehnung geht nichts hinaus. So
 * weiß der Partner, dass er den Kunden nicht erst beruhigen muss.
 */
export function vormerkMeldung(e: VormerkErgebnis): { titel: string; text: string } {
  const nichtsRaus = "Es ist nichts an den Kunden hinausgegangen.";
  switch (e.grund) {
    case "vergeben":
      return {
        titel: "Diese Einheit ist gerade vergeben",
        text: `Die Einheit ist inzwischen reserviert oder verkauft. ${nichtsRaus}`,
      };
    case "vorgemerkt_von_anderem": {
      const bis = uhrzeit(e.vorgemerktBis);
      const von = e.beraterName ? ` von ${e.beraterName}` : "";
      return {
        titel: bis ? `Diese Einheit ist vorgemerkt bis ${bis} Uhr` : "Diese Einheit ist gerade vorgemerkt",
        text: `Für einen anderen Kunden ist gerade eine Reservierungsvereinbarung${von} unterwegs. `
          + `Die Vormerkung gilt ${VORMERKUNG_MINUTEN} Minuten${bis ? ` und endet um ${bis} Uhr` : ""}. `
          + `Danach kannst du es erneut versuchen. ${nichtsRaus}`,
      };
    }
    case "keine_berechtigung":
      return {
        titel: "Reservierung nicht möglich",
        text: `Für diesen Kunden darfst du keine Einheit vormerken. Reservieren dürfen Admin, Inhaber, Vertriebsleitung und Vertriebspartner, Partner nur für ihre eigenen Kunden. ${nichtsRaus}`,
      };
    case "globalobjekt":
      return {
        titel: "Einheit eines Globalobjekts",
        text: `Bei einem Globalobjekt wird nur das ganze Haus reserviert, nie eine einzelne Einheit. ${nichtsRaus}`,
      };
    case "exklusiv":
      return {
        titel: "Einheit exklusiv vergeben",
        text: `Diese Einheit oder dieses Objekt ist exklusiv anderen Partnern zugewiesen. ${nichtsRaus}`,
      };
    case "nicht_gefunden":
      return {
        titel: "Einheit nicht gefunden",
        text: `Die Einheit oder der Kunde ist nicht mehr auffindbar. Bitte lade die Seite neu. ${nichtsRaus}`,
      };
    case "fehler":
      return {
        titel: "Vormerkung fehlgeschlagen",
        text: `Die Einheit konnte nicht vorgemerkt werden${e.fehlerText ? ` (${e.fehlerText})` : ""}. Bitte versuche es gleich noch einmal. ${nichtsRaus}`,
      };
    default:
      return { titel: "Vorgemerkt", text: "" };
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Anzeige an einer Einheit
 * ──────────────────────────────────────────────────────────────────────── */

/** Die Felder einer Wohnung, die hier gelesen werden. Genügt `ObjektWohnung`. */
export interface WohnungMitVormerkung {
  status?: string | null;
  kundeId?: string | null;
  vorgemerktBis?: string;
  vorgemerktKundeId?: string;
  vorgemerktKundeName?: string;
  vorgemerktBeraterName?: string;
}

function standAus(w: WohnungMitVormerkung): EinheitStand {
  return {
    status: w.status,
    kundeId: w.kundeId,
    vorgemerktBis: w.vorgemerktBis,
    vorgemerktKundeId: w.vorgemerktKundeId,
  };
}

/**
 * Ist an dieser Einheit gerade eine Vormerkung, die den Knopf ersetzt?
 *
 * `kontaktId` ist der Kunde, für den gerade reserviert werden soll, falls die
 * Seite ihn schon kennt (etwa über `?empfehlung=`). Eine Vormerkung für genau
 * diesen Kunden blockiert nicht: Der Versand an ihn darf wiederholt werden.
 */
export function vormerkungBlockiert(
  w: WohnungMitVormerkung,
  kontaktId?: string | null,
  jetzt: Date = new Date(),
): boolean {
  return vormerkungFuerAnderen(standAus(w), kontaktId, jetzt);
}

/** „vorgemerkt bis 14:35“, leer ohne laufende Vormerkung. */
export function vormerkungKurztext(w: WohnungMitVormerkung, jetzt: Date = new Date()): string {
  if (!vormerkungAktiv(standAus(w), jetzt)) return "";
  const bis = uhrzeit(w.vorgemerktBis);
  return bis ? `vorgemerkt bis ${bis}` : "vorgemerkt";
}

/**
 * Kennt der Zwischenspeicher die neuen Spalten schon?
 *
 * Der Zwischenspeicher lädt `wohnungen` mit `select *`. Nach der Migration
 * steht in jeder Zeile der Schlüssel `vorgemerkt_bis`, auch wenn er leer ist.
 * `undefined` heißt: Es ist noch keine Zeile geladen, also weiß man es nicht.
 */
export function vormerkungSpaltenVorhanden(): boolean | undefined {
  try {
    const zeilen = cacheGet<Record<string, unknown>>("wohnungen");
    if (!zeilen || zeilen.length === 0) return undefined;
    return Object.prototype.hasOwnProperty.call(zeilen[0], "vorgemerkt_bis");
  } catch {
    return undefined;
  }
}
