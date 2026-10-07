/**
 * Englische Anzeige für die Texte, die NICHT aus den Bausteinen selbst kommen:
 * Rechenkern (`scoringEngine.ts`), Objekttypen (`objekttypen.ts`) und
 * Bundesländer (`grunderwerbsteuer.ts`).
 *
 * Warum eine Zuordnung und kein Umschreiben dort: Die deutschen Texte des
 * Rechenkerns gehen teils ins CRM (Kategorie als `finanzierbarkeit`, der
 * Schnappschuss im Kundenprofil). Sie bleiben deshalb, wie sie sind. Die
 * englische Seite holt sich ihre Fassung hier, nach Kennung, wo es eine gibt
 * (Kategorie, Objekttyp, Bundesland), sonst nach dem deutschen Wortlaut, der
 * im Rechenkern fest steht (Ampel, Stärken, Steuerhinweise).
 *
 * Fehlt eine Zuordnung, bleibt der deutsche Text stehen, statt dass eine
 * leere Stelle erscheint. Der Test `analyseRechenkernTexte.test.ts` rechnet
 * viele Eingaben durch und meldet jeden deutschen Text ohne Gegenstück, so
 * fällt eine Änderung im Rechenkern sofort auf.
 */
import type { ScoreResult } from "@/lib/scoringEngine";
import type { ObjekttypId } from "@/lib/objekttypen";
import type { Sprache } from "@/lib/seitenSprache";

/* ── Kategorie, nach Kennung ─────────────────────────────────── */

export const KATEGORIEN_EN: Record<ScoreResult["category"], { label: string; beschreibung: string }> = {
  sehr_gut: {
    label: "Very well suited",
    beschreibung:
      "Congratulations! Your financial starting position is excellent for a property investment. You can now take the decisive step.",
  },
  gut: {
    label: "Well suited",
    beschreibung:
      "You bring a good starting position. Thousands of investors with similar circumstances have already invested successfully in property.",
  },
  grundsaetzlich: {
    label: "Suitable in principle",
    beschreibung:
      "The basic requirements are in place! With the right strategy and choice of property, a successful investment is possible.",
  },
  eingeschraenkt: {
    label: "Suitable to a limited extent",
    beschreibung:
      "There are a few challenges at the moment, but with targeted preparation we can find a solution together.",
  },
  nicht_geeignet: {
    label: "Not suitable at present",
    beschreibung:
      "Based on your current details, a property investment is difficult to realise at the moment. We'll show you which steps are needed.",
  },
};

/** Der Rechenkern hat für „ohne Einkommen“ eine eigene Beschreibung zur Kategorie `nicht_geeignet`. */
export const OHNE_EINKOMMEN_BESCHREIBUNG_EN =
  "Thank you for your interest in a property investment. Unfortunately, property financing is not possible at present, as banks generally require a stable, regular income.";

/**
 * Überschrift und Beschreibung der Einordnung in der Seitensprache.
 * Auf Deutsch genau das, was der Rechenkern liefert.
 */
export function kategorieAnzeige(
  result: Pick<ScoreResult, "category" | "categoryLabel" | "categoryDescription">,
  sprache: Sprache,
  ohneEinkommen = false,
): { label: string; beschreibung: string } {
  if (sprache !== "en") return { label: result.categoryLabel, beschreibung: result.categoryDescription };
  const en = KATEGORIEN_EN[result.category];
  if (!en) return { label: result.categoryLabel, beschreibung: result.categoryDescription };
  return {
    label: en.label,
    beschreibung: ohneEinkommen ? OHNE_EINKOMMEN_BESCHREIBUNG_EN : en.beschreibung,
  };
}

/* ── Ampel, Stärken, Steuerhinweise, nach deutschem Wortlaut ─── */

/**
 * Deutscher Wortlaut aus `scoringEngine.ts` → Englisch. Die deutschen
 * Schlüssel stehen hier wörtlich, auch mit ihren Gedankenstrichen: Sie sind
 * nur Schlüssel und werden nie angezeigt.
 */
export const RECHENKERN_EN: Readonly<Record<string, string>> = {
  // Ampel, Überschriften
  "Einkommen": "Income",
  "Berufliche Stabilität": "Job stability",
  "Eigenkapital": "Equity",
  "Monatlicher Cashflow": "Monthly cash flow",
  "Bonität": "Creditworthiness",
  "Liquiditätsreserve": "Cash reserve",
  "Steuerlicher Hebel": "Tax leverage",
  // Ampel, Einzelheiten
  "Dein Einkommen bietet eine solide Basis": "Your income provides a solid basis",
  "Einkommen ausreichend, aber begrenzt": "Income sufficient, but limited",
  "Einkommen für Immobilienfinanzierung zu niedrig": "Income too low for property financing",
  "Stabile berufliche Situation – ideal für Finanzierung": "Stable job situation, ideal for financing",
  "Prüfung durch Bank empfohlen": "Review by the bank recommended",
  "Berufliche Situation muss stabilisiert werden": "Your job situation needs to become more stable",
  "Ausreichend Eigenkapital vorhanden": "Sufficient equity available",
  "Eigenkapital knapp – höhere Zinsen möglich": "Equity is tight, higher interest rates possible",
  "100%-Finanzierung möglich – Konditionen angepasst": "100% financing possible, with adjusted terms",
  "Eigenkapital für Kaufnebenkosten empfohlen (Alter > 40)":
    "Equity for the incidental purchase costs recommended (age over 40)",
  "Guter monatlicher Überschuss": "Good monthly surplus",
  "Cashflow ausreichend – Puffer begrenzt": "Cash flow sufficient, limited buffer",
  "Monatlicher Spielraum zu gering": "Too little monthly headroom",
  "Niedrige bestehende Kreditbelastung": "Low existing loan burden",
  "Bestehende Kredite – Bank prüft genauer": "Existing loans, the bank will look more closely",
  "Hohe Kreditbelastung – Finanzierung erschwert": "High loan burden makes financing harder",
  "Solide Rücklage vorhanden": "Solid reserve in place",
  "Reserve aufbauen empfohlen": "Building up a reserve is recommended",
  "Rücklage dringend aufbauen": "Build up a reserve urgently",
  "Durch Eintragung des Freibetrags auf der Lohnsteuerkarte erhältst du sofort mehr Netto vom Brutto – steuerlicher Vorteil immer gegeben.":
    "By having a tax allowance (Freibetrag) registered for your wage tax, you get more net pay from your gross salary straight away. There is always a tax advantage.",
  // Stärken
  "Überdurchschnittliches Einkommen – starke Basis für Finanzierung":
    "Above-average income, a strong basis for financing",
  "Sehr stabile Einkommenssituation – bevorzugt von Banken": "Very stable income situation, preferred by banks",
  "Solides Eigenkapital – bessere Zinskonditionen möglich": "Solid equity, better interest terms possible",
  "Guter monatlicher Cashflow – geringe Zuzahlung nötig": "Good monthly cash flow, only a small top-up needed",
  "Gute Bonitätsindikatoren – erleichterte Kreditvergabe": "Good creditworthiness indicators, easier lending",
  "Erfahrung mit Anlagen und Immobilien, Du weißt worauf es ankommt":
    "Experience with investments and property, you know what matters",
  "Beamtenstatus – bevorzugte Kreditkonditionen und niedrigste Zinsen":
    "Civil servant status (Beamter), preferential loan terms and the lowest interest rates",
  "Verheiratet – gemeinsame Veranlagung bietet steuerliche Vorteile":
    "Married, joint tax assessment offers tax advantages",
  // Steuerhinweise
  "Bei Deinem Einkommensniveau wirkt die Abschreibung besonders stark. Der lineare Satz liegt je nach Fertigstellung bei 2, 2,5 oder 3 Prozent pro Jahr.":
    "At your income level, building depreciation (AfA) has a particularly strong effect. The linear rate is 2, 2.5 or 3 percent a year, depending on the year of completion.",
  "Auch in Deiner Einkommensklasse profitierst du von steuerlichen Abschreibungen bei Immobilien.":
    "In your income bracket, too, you benefit from tax depreciation on property.",
  "Als Selbstständige(r) kannst du ggf. zusätzliche Abzugsmöglichkeiten bei gewerblichen Immobilien nutzen.":
    "If you're self-employed, you may be able to use additional deductions for commercial property.",
  "Denkmalimmobilien bieten mit §7i/§7h EStG besonders hohe Abschreibungsmöglichkeiten.":
    "Listed buildings (Denkmalimmobilien) offer particularly high depreciation under Sections 7i and 7h EStG.",
  "Wird eine Immobilie im Privatvermögen erst nach mehr als zehn Jahren verkauft, bleibt ein Veräußerungsgewinn nach § 23 EStG steuerfrei.":
    "If a property held as private assets (Privatvermögen) is sold only after more than ten years, the capital gain is tax-free under Section 23 EStG.",
  "Hinweis: Die steuerlichen Angaben dienen nur der Orientierung. Eine individuelle Beratung durch einen Steuerberater ist empfehlenswert.":
    "Note: the tax information is for guidance only. Individual advice from a tax consultant (Steuerberater) is recommended.",
};

/** Texte mit einer Zahl darin, die sich nicht wörtlich zuordnen lassen. */
const RECHENKERN_MUSTER_EN: { muster: RegExp; en: (m: RegExpMatchArray) => string }[] = [
  {
    muster: /^Erfahrung mit (\d+) Immobilie\(n\), das kennt die Bank gern$/,
    en: (m) => `Experience with ${m[1]} ${m[1] === "1" ? "property" : "properties"}, which banks like to see`,
  },
];

/** Englische Fassung eines Rechenkern-Textes, oder `null`, wenn es keine gibt. */
export function rechenkernEn(text: string): string | null {
  if (Object.prototype.hasOwnProperty.call(RECHENKERN_EN, text)) return RECHENKERN_EN[text];
  for (const { muster, en } of RECHENKERN_MUSTER_EN) {
    const treffer = text.match(muster);
    if (treffer) return en(treffer);
  }
  return null;
}

/** Ein Rechenkern-Text in der Seitensprache. Ohne Zuordnung bleibt er deutsch. */
export function rechenkernText(text: string, sprache: Sprache): string {
  if (sprache !== "en") return text;
  return rechenkernEn(text) ?? text;
}

/* ── Objekttypen, nach Kennung ───────────────────────────────── */

export interface ObjekttypTexte {
  name: string;
  kurz: string;
  passtWenn: string;
  afaHinweis: string;
}

export const OBJEKTTYPEN_EN: Record<ObjekttypId, ObjekttypTexte> = {
  sanierter_altbau: {
    name: "Renovated period building",
    kurz: "Existing property with completed renovation in an established location.",
    passtWenn:
      "The strongest tax lever. A remaining useful life appraisal (Restnutzungsdauergutachten) allows higher depreciation rates, and the higher your personal tax rate, the greater the effect.",
    afaHinweis:
      "4 percent with a property-specific remaining useful life appraisal. Without an appraisal, 2 percent applies.",
  },
  neubau: {
    name: "New build",
    kurz: "First occupancy with warranty and little need for maintenance.",
    passtWenn:
      "Little effort and long-term peace of mind. In addition to linear depreciation of 3 percent, special depreciation (Section 7b EStG) applies in the first four years if the conditions are met.",
    afaHinweis: "3 percent for completion from 2023 under Section 7(4) EStG.",
  },
  wg_konzept: {
    name: "Flat-share concept",
    kurz: "Letting room by room, considerably higher rental income.",
    passtWenn:
      "When the monthly surplus is the priority. The rental yield is noticeably higher, in exchange for more administration and ongoing maintenance expenses (Erhaltungsaufwand).",
    afaHinweis: "3 percent, or more for renovated existing buildings with an appraisal.",
  },
};

/** Die Texte eines Objekttyps in der Seitensprache. */
export function objekttypAnzeige(typ: { id: ObjekttypId } & ObjekttypTexte, sprache: Sprache): ObjekttypTexte {
  if (sprache === "en" && OBJEKTTYPEN_EN[typ.id]) return OBJEKTTYPEN_EN[typ.id];
  return { name: typ.name, kurz: typ.kurz, passtWenn: typ.passtWenn, afaHinweis: typ.afaHinweis };
}

/* ── Bundesländer, nach Kennung ──────────────────────────────── */

/** Nur die Namen, die sich im Englischen unterscheiden. Die übrigen bleiben. */
export const BUNDESLAND_NAMEN_EN: Readonly<Record<string, string>> = {
  by: "Bavaria",
  he: "Hesse",
  mv: "Mecklenburg-Western Pomerania",
  ni: "Lower Saxony",
  nw: "North Rhine-Westphalia",
  rp: "Rhineland-Palatinate",
  sn: "Saxony",
  st: "Saxony-Anhalt",
  th: "Thuringia",
};

export function bundeslandName(bl: { id: string; name: string }, sprache: Sprache): string {
  return sprache === "en" ? BUNDESLAND_NAMEN_EN[bl.id] ?? bl.name : bl.name;
}
