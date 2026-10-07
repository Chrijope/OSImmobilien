/**
 * Belegung und Vormerkung eines ganzen Hauses (Globalobjekt) im Browser:
 * Meldungen, Anzeige und die Frage, ob der Knopf erscheinen darf.
 *
 * Die Regeln stehen in `supabase/functions/_shared/objekt-belegung.ts`,
 * dieselbe Datei lesen die Edge Functions. Entschieden wird in der Datenbank
 * (`vormerke_objekt`, `reserviere_objekt_nach_unterschrift`), hier steht nur,
 * was die Oberfläche daraus macht. Ein ausgeblendeter Knopf ist keine
 * Zugriffskontrolle.
 *
 * Bewusst ohne Abhängigkeit vom `objekteStore`: Der Store liest diese Datei,
 * nicht umgekehrt. Deshalb ist der Objekttyp hier ein eigener, schmaler Typ,
 * den `ObjektData` erfüllt.
 */
import { cacheGet } from "@/lib/dataCache";
import {
  angebotsBelegung,
  belegungsAnzeige,
  type AnzeigeEinheit,
  type BelegungsAnzeige,
  type BelegungsEinheit,
  type BelegungsKontext,
  type ObjektBelegung,
} from "@/lib/einheitBelegung";
import { uhrzeit, VORMERKUNG_MINUTEN } from "@/lib/einheitVormerkung";
import {
  hausBelegt,
  hausBelegungLesen,
  hausFremdVorgemerkt,
  hausFuerKundeVorgemerkt,
  type HausBelegung,
  type HausStand,
} from "../../supabase/functions/_shared/objekt-belegung";
import { istGlobalobjekt } from "../../supabase/functions/_shared/globalobjekt";
import { hausGesamtStand, type HausGesamtStand } from "../../supabase/functions/_shared/haus-stand";

export { hausBelegt, hausBelegungLesen, hausFremdVorgemerkt, hausFuerKundeVorgemerkt, type HausBelegung, type HausStand };

/** Name der Migration, für Hinweise an Admin und Inhaber. */
export const OBJEKT_RESERVIERUNG_MIGRATION = "20260923152000_globalobjekt_reservierung.sql";

/** Der Hinweis, solange die Migration fehlt. Nur Admin und Inhaber sehen ihn. */
export const OBJEKT_RESERVIERUNG_MIGRATION_HINWEIS = "Migration Globalobjekt-Reservierung noch nicht ausgeführt";

/** Was diese Datei von einem Objekt liest. `ObjektData` erfüllt es. */
export interface HausFelder {
  globalObjekt?: boolean;
  /** Fehlt, solange die Migration nicht gelaufen ist. */
  belegung?: HausBelegung;
  belegungKundeId?: string;
  belegungKundeName?: string;
  belegungAm?: string;
  belegungVon?: string;
  vorgemerktBis?: string;
  vorgemerktKundeId?: string;
  vorgemerktKundeName?: string;
  vorgemerktVon?: string;
  vorgemerktBeraterName?: string;
  wohnungen?: BelegungsEinheit[];
  wohnungenNichtImAngebot?: BelegungsEinheit[];
}

/**
 * Ist die Migration für dieses Objekt gelaufen?
 *
 * Die Spalte `belegung` ist nach der Migration nie leer (Vorgabe „frei“). Der
 * Zwischenspeicher lädt `objekte` mit `select *`; fehlt die Spalte, fehlt auch
 * das Feld am Objekt. So entscheidet jedes Objekt für sich, ohne eigene
 * Abfrage.
 */
export function hausReservierungFreigeschaltet(o: Pick<HausFelder, "belegung"> | null | undefined): boolean {
  return !!o && o.belegung !== undefined;
}

/**
 * Wie viele Einheiten das Haus hat, für die Reservierungsvereinbarung.
 *
 * Gezählt wird an den Einheiten selbst: `wohnungen` plus die in der
 * Angebotssicht ausgeblendeten `wohnungenNichtImAngebot`. Die „Anzahl
 * Einheiten“ aus der Objektanlage (`wohneinheitenGesamt`) taugt dafür nicht,
 * sie wird gar nicht gespeichert (Befund 3 des Entwurfs vom 23.09.2026).
 */
export function anzahlEinheiten(o: Pick<HausFelder, "wohnungen" | "wohnungenNichtImAngebot"> | null | undefined): number {
  if (!o) return 0;
  return (o.wohnungen?.length ?? 0) + (o.wohnungenNichtImAngebot?.length ?? 0);
}

/**
 * Der Gesamtstand des Hauses nach `hausGesamtStand` (Option A vom 05.10.2026):
 * Belegung am Haus plus der Status aller Einheiten, auch der nicht
 * angebotenen und der aus Investagon ohne Kunde im CRM.
 */
export function hausGesamtStandVon(o: HausFelder): HausGesamtStand {
  const einheiten = [...(o.wohnungen || []), ...(o.wohnungenNichtImAngebot || [])];
  return hausGesamtStand({ belegung: o.belegung, einheitenStatus: einheiten.map((w) => w.status) });
}

/**
 * Ist das Haus nur deshalb nicht verfügbar, weil schon Einheiten reserviert
 * oder verkauft sind, während die Belegung am Haus noch „frei“ sagt?
 * Dann steht ein Hinweis statt des Knopfs. Sonst `null`.
 */
export function hausTeilweiseHinweis(o: HausFelder): string | null {
  if (!istGlobalobjekt(o) || hausBelegungLesen(o.belegung) !== "frei") return null;
  if (hausGesamtStandVon(o) === "frei") return null;
  const einheiten = [...(o.wohnungen || []), ...(o.wohnungenNichtImAngebot || [])];
  const belegt = einheiten.filter((w) => hausGesamtStand({ einheitenStatus: [w.status] }) !== "frei").length;
  return belegt === 1
    ? `1 von ${einheiten.length} Einheiten ist reserviert oder verkauft. Das Haus ist deshalb nicht verfügbar.`
    : `${belegt} von ${einheiten.length} Einheiten sind reserviert oder verkauft. Das Haus ist deshalb nicht verfügbar.`;
}

/** Der Stand des Hauses für die gemeinsamen Regeln. */
export function hausStand(o: HausFelder): HausStand {
  return {
    belegung: o.belegung ?? null,
    kundeId: o.belegungKundeId ?? null,
    vorgemerktBis: o.vorgemerktBis ?? null,
    vorgemerktKundeId: o.vorgemerktKundeId ?? null,
  };
}

/** Der Name zu einer Nutzerkennung aus den Profilen, leer, wenn unbekannt. */
function profilName(kennung?: string): string | undefined {
  if (!kennung) return undefined;
  try {
    const p = (cacheGet("profiles") as Array<{ id: string; name?: string | null }>).find((x) => x.id === kennung);
    const name = (p?.name || "").trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Das Haus als eine „Einheit“ für `belegungsAnzeige`.
 *
 * So gelten für das Haus dieselben Sichtbarkeitsregeln wie für eine Einheit:
 * Kunde und Partner sehen Admin, Inhaber und Vertriebsleitung immer, alle
 * anderen nur beim eigenen Kunden (`belegungVon` ist die Kennung dessen, der
 * reserviert hat). Der Partnername kommt aus den Profilen, denn am Haus steht
 * nur die Kennung.
 */
export function hausAlsAnzeigeEinheit(o: HausFelder): AnzeigeEinheit {
  return {
    status: hausBelegungLesen(o.belegung),
    kundeId: o.belegungKundeId,
    kundeName: o.belegungKundeName ?? null,
    reserviertAm: o.belegungAm ?? null,
    reserviertVon: o.belegungVon ?? null,
    beraterName: profilName(o.belegungVon),
    vorgemerktBis: o.vorgemerktBis ?? null,
    vorgemerktKundeId: o.vorgemerktKundeId ?? null,
    vorgemerktKundeName: o.vorgemerktKundeName ?? null,
    vorgemerktBeraterName: o.vorgemerktBeraterName ?? null,
  };
}

/** Kunde, Partner und Datum am Haus, für diesen Nutzer. Siehe `belegungsAnzeige`. */
export function hausBelegungsAnzeige(
  o: HausFelder,
  ctx: BelegungsKontext | undefined,
  jetzt: Date = new Date(),
): BelegungsAnzeige {
  return belegungsAnzeige(hausAlsAnzeigeEinheit(o), ctx, jetzt);
}

/**
 * Die Belegung eines Objekts in der Objektübersicht.
 *
 * Bei einem Globalobjekt zählt zuerst das Haus: Ist es reserviert oder
 * verkauft, ist das Objekt belegt und trägt den Aufdruck, auch wenn seine
 * Einheiten einzeln noch „frei“ heißen. Sonst gilt die Belegung der Einheiten
 * wie bisher. Seit dem 05.10.2026 gilt ein Globalobjekt auch dann als
 * belegt, wenn das Haus noch „frei“ heißt, aber schon eine Einheit
 * reserviert oder verkauft ist (`hausGesamtStandVon`).
 */
export function uebersichtsBelegung(o: HausFelder): ObjektBelegung {
  const einheiten = angebotsBelegung(o.wohnungen || [], o.wohnungenNichtImAngebot || []);
  if (!istGlobalobjekt(o)) return einheiten;
  const haus = hausBelegungLesen(o.belegung);
  if (haus === "frei") {
    if (einheiten.vollBelegt || hausGesamtStandVon(o) === "frei") return einheiten;
    return { ...einheiten, vollBelegt: true, aufdruck: "Teilweise reserviert" };
  }
  return { ...einheiten, vollBelegt: true, aufdruck: haus === "verkauft" ? "Verkauft" : "Reserviert" };
}

/** Wie der Knopf „Haus für Kunden reservieren“ gerade steht. */
export type HausKnopfStand =
  /** Kein Globalobjekt oder keine Reservierungsrolle: nichts anzeigen. */
  | "keiner"
  /** Die Migration fehlt: kein Knopf. */
  | "ohne_migration"
  /** Reserviert oder verkauft: statt des Knopfs steht die Belegung da. */
  | "belegt"
  /** Haus frei, aber Einheiten belegt: Knopf gesperrt, `hausTeilweiseHinweis` daneben. */
  | "teilweise"
  /** Für einen anderen Kunden vorgemerkt: „vorgemerkt bis HH:MM“. */
  | "vorgemerkt"
  | "reservierbar";

export function hausKnopfStand(
  o: HausFelder,
  opt: { darfReservieren: boolean; kundeId?: string | null; jetzt?: Date },
): HausKnopfStand {
  if (!istGlobalobjekt(o) || !opt.darfReservieren) return "keiner";
  if (!hausReservierungFreigeschaltet(o)) return "ohne_migration";
  const stand = hausStand(o);
  if (hausBelegt(stand)) return "belegt";
  if (hausTeilweiseHinweis(o)) return "teilweise";
  if (hausFremdVorgemerkt(stand, opt.kundeId, opt.jetzt ?? new Date())) return "vorgemerkt";
  return "reservierbar";
}

/* ────────────────────────────────────────────────────────────────────────
 * Die Antwort von `vormerke_objekt`
 * ──────────────────────────────────────────────────────────────────────── */

export type ObjektVormerkGrund =
  | "vorgemerkt"
  | "vergeben"
  | "vorgemerkt_von_anderem"
  | "keine_berechtigung"
  | "kein_globalobjekt"
  | "exklusiv"
  | "nicht_gefunden"
  /** Die Datenbankfunktion fehlt, die Migration ist noch nicht gelaufen. */
  | "ohne_migration"
  /** Netz, Server oder eine unerwartete Antwort. */
  | "fehler";

export interface ObjektVormerkErgebnis {
  ok: boolean;
  grund: ObjektVormerkGrund;
  vorgemerktBis?: string;
  beraterName?: string;
  fehlerText?: string;
}

const BEKANNTE_GRUENDE: ObjektVormerkGrund[] = [
  "vorgemerkt", "vergeben", "vorgemerkt_von_anderem", "keine_berechtigung",
  "kein_globalobjekt", "exklusiv", "nicht_gefunden",
];

function textOderLeer(wert: unknown): string | undefined {
  return typeof wert === "string" && wert.trim() ? wert.trim() : undefined;
}

/**
 * Die Antwort der Datenbankfunktion lesen. Was nicht wie eine bekannte
 * Antwort aussieht, gilt als Fehler und NIE als Erfolg.
 */
export function objektVormerkErgebnisLesen(data: unknown): ObjektVormerkErgebnis {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const grund = String(d.grund ?? "") as ObjektVormerkGrund;
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

/**
 * Die Meldung zu einer abgelehnten Vormerkung des Hauses, in Du-Form.
 *
 * `technik` heißt: Der Nutzer ist Admin oder Inhaber und bekommt beim Fehlen
 * der Migration deren Namen genannt. Alle anderen lesen nur, dass die
 * Reservierung eines ganzen Hauses noch nicht freigeschaltet ist.
 */
export function objektVormerkMeldung(
  e: ObjektVormerkErgebnis,
  opt: { technik?: boolean } = {},
): { titel: string; text: string } {
  const nichtsRaus = "Es ist nichts an den Kunden hinausgegangen.";
  switch (e.grund) {
    case "vergeben":
      return {
        titel: "Dieses Haus ist gerade vergeben",
        text: `Das Haus ist inzwischen reserviert oder verkauft. ${nichtsRaus}`,
      };
    case "vorgemerkt_von_anderem": {
      const bis = uhrzeit(e.vorgemerktBis);
      const von = e.beraterName ? ` von ${e.beraterName}` : "";
      return {
        titel: bis ? `Dieses Haus ist vorgemerkt bis ${bis} Uhr` : "Dieses Haus ist gerade vorgemerkt",
        text: `Für einen anderen Kunden ist gerade eine Reservierungsvereinbarung${von} unterwegs. `
          + `Die Vormerkung gilt ${VORMERKUNG_MINUTEN} Minuten${bis ? ` und endet um ${bis} Uhr` : ""}. `
          + `Danach kannst du es erneut versuchen. ${nichtsRaus}`,
      };
    }
    case "keine_berechtigung":
      return {
        titel: "Reservierung nicht möglich",
        text: `Für diesen Kunden darfst du das Haus nicht vormerken. Reservieren dürfen Admin, Inhaber, Vertriebsleitung und Vertriebspartner, Partner nur für ihre eigenen Kunden. ${nichtsRaus}`,
      };
    case "kein_globalobjekt":
      return {
        titel: "Kein Globalobjekt",
        text: `Als Ganzes reserviert wird nur ein Globalobjekt. Dieses Objekt wird in Einheiten verkauft, reserviere dort die einzelne Wohnung. ${nichtsRaus}`,
      };
    case "exklusiv":
      return {
        titel: "Objekt exklusiv vergeben",
        text: `Dieses Objekt ist exklusiv anderen Partnern zugewiesen. ${nichtsRaus}`,
      };
    case "nicht_gefunden":
      return {
        titel: "Objekt nicht gefunden",
        text: `Das Objekt oder der Kunde ist nicht mehr auffindbar. Bitte lade die Seite neu. ${nichtsRaus}`,
      };
    case "ohne_migration":
      return opt.technik
        ? {
          titel: OBJEKT_RESERVIERUNG_MIGRATION_HINWEIS,
          text: `Solange ${OBJEKT_RESERVIERUNG_MIGRATION} nicht gelaufen ist, kann niemand das Haus festhalten, obwohl die Vereinbarung genau das verspricht. Deshalb geht keine Reservierung eines Globalobjekts hinaus. ${nichtsRaus}`,
        }
        : {
          titel: "Reservierung des ganzen Hauses noch nicht freigeschaltet",
          text: `Die Reservierung eines ganzen Hauses ist technisch noch nicht freigeschaltet. Bitte wende dich an die Geschäftsleitung. ${nichtsRaus}`,
        };
    case "fehler":
      return {
        titel: "Vormerkung fehlgeschlagen",
        text: `Das Haus konnte nicht vorgemerkt werden${e.fehlerText ? ` (${e.fehlerText})` : ""}. Bitte versuche es gleich noch einmal. ${nichtsRaus}`,
      };
    default:
      return { titel: "Vorgemerkt", text: "" };
  }
}
