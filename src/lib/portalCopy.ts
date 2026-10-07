import i18n from "@/i18n";
import { fortschrittsRang, istEndzustand } from "@/lib/pipelineStufen";

/**
 * Übersetzungslayer für das Kundenportal („Wohlfühl-Flow").
 *
 * Zweck: Die internen `pipelineStufe`-Werte in eine freundliche, persönliche
 * Concierge-Sprache übersetzen. Wird in Portal-Komponenten verwendet
 * (z. B. PortalProgressBar, PortalStepCard, „Was kommt als Nächstes?"-Card).
 *
 * Single source of truth – leicht änderbar, ohne Datenmodell oder
 * Pipeline-Logik anzufassen.
 */

export type PortalStepKey =
  | "kontaktaufnahme"
  | "erstgespraech"
  | "beratungsgespraech"
  | "selbstauskunft"
  | "objektauswahl"
  | "reservierung"
  | "bonitaetsunterlagen"
  | "finanzierung"
  | "notar"
  | "faelligkeit"
  | "fertig";

export interface PortalStep {
  key: PortalStepKey;
  /** Kurzer, ruhiger Schritt-Titel für die Progress-Anzeige */
  label: string;
  /** Freundlicher 1-Satz-Hinweis, was als Nächstes ansteht */
  next: string;
}

/**
 * Zuordnung der Portal-Schritte zu den internen Pipelinestufen.
 *
 * Die Reihenfolge der Schritte wird NICHT mehr von Hand gepflegt, sondern aus
 * `FORTSCHRITT_STUFEN` (pipelineStufen.ts) abgeleitet. Vorher stand hier eine
 * Kopie mit der alten Reihenfolge (Bonität vor Objektauswahl), und das Portal
 * zeigte dem Kunden einen anderen Ablauf als das Kundenprofil.
 */
const STEP_ZU_STUFE: Record<PortalStepKey, string> = {
  kontaktaufnahme: "neuer_lead",
  erstgespraech: "erstgespraech_geplant",
  beratungsgespraech: "beratungsgespraech",
  selbstauskunft: "selbstauskunft",
  objektauswahl: "objektauswahl",
  reservierung: "reservierung",
  bonitaetsunterlagen: "bonitaetsunterlagen",
  finanzierung: "finanzierung",
  notar: "notar",
  faelligkeit: "faelligkeit",
  fertig: "abgeschlossen",
};

/**
 * Kanonische Reihenfolge der Schritte im Kundenportal, sortiert nach dem Rang
 * der zugehörigen Pipelinestufe. Labels/Next-Texte werden zur Laufzeit via
 * i18n übersetzt (DE/EN).
 */
const STEP_KEYS: PortalStepKey[] = (Object.keys(STEP_ZU_STUFE) as PortalStepKey[]).sort(
  (a, b) => fortschrittsRang(STEP_ZU_STUFE[a]) - fortschrittsRang(STEP_ZU_STUFE[b]),
);

function buildStep(key: PortalStepKey): PortalStep {
  const t = i18n.t.bind(i18n);
  return {
    key,
    label: t(`portal.steps.${key}_label`),
    next: t(`portal.steps.${key}_next`),
  };
}

export const PORTAL_STEPS: PortalStep[] = new Proxy([] as PortalStep[], {
  get(_t, prop) {
    const arr = STEP_KEYS.map(buildStep);
    return (arr as any)[prop];
  },
});

/** Akzeptiert beliebige Schreibweisen (auch alte Aliase) und mappt sauber. */
function normalize(stufe?: string | null): PortalStepKey {
  if (!stufe) return "kontaktaufnahme";
  const s = String(stufe).toLowerCase().trim();
  if (s.startsWith("kontakt")) return "kontaktaufnahme";
  if (s.startsWith("erst") || s === "eg_noshow") return "erstgespraech";
  if (s.startsWith("berat") || s === "bg_noshow") return "beratungsgespraech";
  if (s.startsWith("selbst")) return "selbstauskunft";
  if (s.startsWith("bonit")) return "bonitaetsunterlagen";
  if (s.startsWith("clos")) return "objektauswahl";
  if (s.startsWith("objekt")) return "objektauswahl";
  // Manuelle Follow-Up-Stufe nach der Objektvorstellung: fuer den Kunden
  // ist das weiterhin die Objektauswahl-Phase.
  if (s === "follow_up_objekt") return "objektauswahl";
  if (s.startsWith("reserv")) return "reservierung";
  if (s.startsWith("finanz")) return "finanzierung";
  if (s.startsWith("notar")) return "notar";
  if (s.startsWith("faellig") || s.startsWith("fällig")) return "faelligkeit";
  // "abrechnung" und "abgeschlossen" sind fuer den Kunden dasselbe: Der Kauf
  // ist durch, offen ist nur noch Internes. Beide zeigen den Zielschritt.
  if (s.startsWith("fertig") || s.startsWith("eigent") || s.startsWith("abrechn") || s.startsWith("abgeschl") || s === "abschluss") return "fertig";
  // Fallback: unbekannte Stufe → ruhig „Kennenlernen"
  return "kontaktaufnahme";
}

export function getPortalStep(stufe?: string | null): PortalStep {
  const key = normalize(stufe);
  return buildStep(key);
}

export function getPortalStepIndex(stufe?: string | null): number {
  const key = normalize(stufe);
  return Math.max(0, STEP_KEYS.indexOf(key));
}

/** Freundlicher 1-Satz-Hinweis, was als Nächstes ansteht. */
export function getNextStepSentence(stufe?: string | null): string {
  return getPortalStep(stufe).next;
}

/** Persönlicher Gruß – tageszeitabhängig, formelle Sie-Anrede. */
export function getPortalGreeting(vorname?: string | null): string {
  const t = i18n.t.bind(i18n);
  const h = new Date().getHours();
  const greet =
    h < 11
      ? t("portal.header.greeting_morning")
      : h < 18
      ? t("portal.header.greeting_day")
      : t("portal.header.greeting_evening");
  return vorname ? `${greet}, ${vorname}` : greet;
}

/**
 * Bezeichnung eines Investments für Kundentexte: Objekt und Wohnung, mit Komma
 * getrennt. Eine nackte Nummer bekommt „Wohnung“ davor.
 *
 * Vorher stand dort „Weitlstraße 138, 80995 München – 80“. Der Gedankenstrich
 * gehört nicht in Kundentexte, und „80“ allein sagt dem Kunden nichts.
 */
export function investmentBezeichnung(objekt?: string | null, wohnung?: string | null): string {
  const o = String(objekt || "").trim();
  let w = String(wohnung || "").trim();
  if (w && /^\d/.test(w)) w = `${i18n.t("portal.common.apartment", "Wohnung")} ${w}`;
  return [o, w].filter(Boolean).join(", ");
}

interface InvestmentMitStufe {
  objekt?: string | null;
  meta?: { pipelineStufe?: string | null } | null;
}

/**
 * Die Pipeline-Stufe, nach der sich die Begrüßung im Portal richtet.
 *
 * Maßgeblich ist das am weitesten fortgeschrittene laufende Investment. Vorher
 * nahm die Übersicht einfach das zuletzt angelegte. Lag die Weitlstraße schon
 * in der Reservierung und kam danach ein frisches Investment dazu, hieß es
 * „Wir suchen aktuell deine passende Wohnung aus“.
 *
 * Beendete Vorgänge (verloren, archiviert, Bestandsimport) zählen nicht. Ein
 * leeres Investment ohne Objekt verliert bei gleichem Rang gegen eines mit
 * Objekt, und ein weiter fortgeschrittenes gewinnt ohnehin. Gibt es kein
 * laufendes Investment, gilt die Stufe am Kontakt.
 */
export function massgeblichePipelineStufe(
  investments: InvestmentMitStufe[] | null | undefined,
  kontaktStufe?: string | null,
): string {
  const fallback = kontaktStufe || "erstgespraech_geplant";
  const kandidaten = (investments || [])
    .map((inv) => ({
      stufe: inv?.meta?.pipelineStufe || kontaktStufe || "",
      mitObjekt: !!String(inv?.objekt || "").trim(),
    }))
    .filter((k) => k.stufe && !istEndzustand(k.stufe));
  // Ein abgeschlossener Kauf ist kein laufender Vorgang. Er zählt nur, wenn es
  // sonst nichts gibt, sonst hieße es bei jedem Zweitkauf „du bist Eigentümer“.
  const laufend = kandidaten.filter((k) => !IST_ABGESCHLOSSEN.has(k.stufe));
  const auswahl = laufend.length > 0 ? laufend : kandidaten;

  let beste: { stufe: string; rang: number; mitObjekt: boolean } | null = null;
  for (const k of auswahl) {
    const rang = fortschrittsRang(k.stufe);
    if (!beste || rang > beste.rang || (rang === beste.rang && k.mitObjekt && !beste.mitObjekt)) {
      beste = { ...k, rang };
    }
  }
  return beste?.stufe || fallback;
}

const IST_ABGESCHLOSSEN = new Set(["abrechnung", "abgeschlossen"]);

/**
 * Die Phasen-Kästchen auf der Investment-Detailseite. Jedes trägt die
 * Kennung `section-<schlüssel>` (siehe PIPELINE_STEPS in KundeInvestments).
 */
export type PortalAbschnitt =
  | "erstgespraech"
  | "objektauswahl"
  | "reservierung"
  | "bonitaetsunterlagen"
  | "finanzierung"
  | "notar"
  | "faelligkeit";

/**
 * In welches Phasen-Kästchen der Knopf im „Als Nächstes"-Kasten springt.
 *
 * Läuft bewusst über dasselbe `normalize` wie der Satz im Kasten, damit Text
 * und Sprungziel nie auseinanderlaufen. Die Selbstauskunft hat kein eigenes
 * Kästchen, sie steht als erste Zeile unter Bonität. Die Stufen vor der
 * Selbstauskunft landen im Kästchen Erstgespräch, das die Seite in diesen
 * Stufen als aktuelle Phase zeigt. `null` heißt: kein Ziel im Investment.
 */
export function getNextStepAbschnitt(stufe?: string | null): PortalAbschnitt | null {
  switch (normalize(stufe)) {
    case "kontaktaufnahme":
    case "erstgespraech":
    case "beratungsgespraech":
      return "erstgespraech";
    case "selbstauskunft":
    case "bonitaetsunterlagen":
      return "bonitaetsunterlagen";
    case "objektauswahl":
      return "objektauswahl";
    case "reservierung":
      return "reservierung";
    case "finanzierung":
      return "finanzierung";
    case "notar":
      return "notar";
    case "faelligkeit":
      return "faelligkeit";
    case "fertig":
      return null;
  }
}

/** DOM-Kennung eines Phasen-Kästchens auf der Investment-Detailseite. */
export function portalAbschnittId(abschnitt: string): string {
  return `section-${abschnitt}`;
}

/**
 * Tiefenlink auf ein Phasen-Kästchen eines bestimmten Investments. Die
 * Detailseite scrollt nach dem Laden dorthin und hebt das Kästchen hervor.
 */
export function investmentAbschnittRoute(investmentId: string, abschnitt: string): string {
  const q = new URLSearchParams({ tab: "moreimmo", inv: investmentId, highlight: abschnitt });
  return `/kunde/investments?${q.toString()}`;
}

/** Wohin der „Als Nächstes"-Banner verlinken soll, je nach Pipeline-Stufe. */
export function getNextStepRoute(stufe?: string | null): string {
  const key = normalize(stufe);
  switch (key) {
    case "bonitaetsunterlagen":
      return "/kunde/kundenordner";
    case "selbstauskunft":
    case "objektauswahl":
    case "reservierung":
    case "finanzierung":
    case "notar":
    case "faelligkeit":
      return "/kunde/investments";
    case "fertig":
      return "/kunde/empfehlungen";
    default:
      return "/kunde/stammdaten";
  }
}