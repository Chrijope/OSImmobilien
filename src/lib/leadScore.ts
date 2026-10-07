// Lead Score: bewertet Bonitäts- und Abschluss-Potenzial eines Leads
// auf Basis der ausgefüllten Selbstauskunft. Reine Berechnungs-Funktion.

import { berechneImmobilienvermoegen } from "./immobilienvermoegen";

export interface LeadScoreBreakdownItem {
  key: string;
  label: string;
  score: number;
  max: number;
  detail?: string;
}

export type LeadScoreKlasse = "A" | "B" | "C" | "D";

export interface LeadScoreResult {
  total: number;
  klasse: LeadScoreKlasse;
  klasseLabel: string;
  breakdown: LeadScoreBreakdownItem[];
  hasSA: boolean;
}

const parseDE = (v: any): number => {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
};

const sumEinkommen = (e: any): number => {
  if (!e) return 0;
  return (
    parseDE(e.netto) + parseDE(e.gewerbe) + parseDE(e.miet) +
    parseDE(e.zinsen) + parseDE(e.rente) + parseDE(e.kindergeld) +
    parseDE(e.sonstige)
  );
};

const sumAusgaben = (sa: any): number => {
  if (!sa) return 0;
  return (
    parseDE(sa.mieteWarm) + parseDE(sa.lebenshaltungskosten) +
    parseDE(sa.privateKV) + parseDE(sa.versicherungsbeitraege) +
    parseDE(sa.sonstigeAusgaben)
  );
};

const sumKreditraten = (kredite: any[]): number => {
  if (!Array.isArray(kredite)) return 0;
  return kredite.reduce((s, k) => s + parseDE(k?.rate), 0);
};

const sumVermoegen = (vw: any[]): number => {
  if (!Array.isArray(vw)) return 0;
  return vw.reduce((s, v) => s + parseDE(v?.betrag), 0);
};

const computeAge = (geburtsdatum?: string): number | null => {
  if (!geburtsdatum) return null;
  // Accept both ISO and dd.mm.yyyy
  let d: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(geburtsdatum)) d = new Date(geburtsdatum);
  else if (/^\d{2}\.\d{2}\.\d{4}/.test(geburtsdatum)) {
    const [dd, mm, yy] = geburtsdatum.split(".");
    d = new Date(`${yy}-${mm}-${dd}`);
  }
  if (!d || isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
};

const REQUIRED_FIELDS = [
  "vorname", "nachname", "geburtsdatum", "strasse", "plz", "ort",
  "telefon", "email", "familienstand", "beschaeftigungsart",
];

function dataQuality(sa: any): number {
  if (!sa) return 0;
  let filled = 0;
  for (const f of REQUIRED_FIELDS) {
    if (sa[f] && String(sa[f]).trim() !== "") filled++;
  }
  // Plus: at least one income, one expense entry, vermoegenswerte
  if (sumEinkommen(sa.einkommen) > 0) filled++;
  if (sumAusgaben(sa) > 0) filled++;
  if (sumVermoegen(sa.vermoegenswerte) > 0) filled++;
  const total = REQUIRED_FIELDS.length + 3;
  return filled / total;
}

export function hasFilledSelbstauskunft(saData: any): boolean {
  if (!saData) return false;
  // Heuristic: filled when name + at least one income field present, or marked abgeschlossen
  if (saData.abgeschlossen === true) return true;
  const hasIdentity = !!(saData.vorname && saData.nachname);
  const hasIncome = sumEinkommen(saData.einkommen) > 0;
  return hasIdentity && hasIncome;
}

export function computeLeadScore(saData: any): LeadScoreResult {
  const breakdown: LeadScoreBreakdownItem[] = [];
  const hasSA = hasFilledSelbstauskunft(saData);

  if (!hasSA) {
    return {
      total: 0,
      klasse: "D",
      klasseLabel: "Selbstauskunft erforderlich",
      breakdown: [],
      hasSA: false,
    };
  }

  const p2 = saData.person2 ? saData.person2Data : null;

  // 1. Haushaltsnetto (max 30)
  const netto = sumEinkommen(saData.einkommen) + (p2 ? sumEinkommen(p2.einkommen) : 0);
  let nettoScore = 0;
  if (netto >= 9000) nettoScore = 30;
  else if (netto >= 6000) nettoScore = 26;
  else if (netto >= 4000) nettoScore = 20;
  else if (netto >= 2500) nettoScore = 10;
  breakdown.push({
    key: "netto", label: "Haushaltsnetto", score: nettoScore, max: 30,
    detail: `${netto.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} € / Monat`,
  });

  // 2. Frei verfügbar (max 25)
  const ausgaben = sumAusgaben(saData) + (p2 ? sumAusgaben(p2) : 0);
  const kreditraten = sumKreditraten(saData.kredite) + (p2 ? sumKreditraten(p2.kredite) : 0);
  const frei = netto - ausgaben - kreditraten;
  let freiScore = 0;
  if (frei >= 3000) freiScore = 25;
  else if (frei >= 1500) freiScore = 22;
  else if (frei >= 500) freiScore = 15;
  else if (frei >= 0) freiScore = 8;
  breakdown.push({
    key: "frei", label: "Frei verfügbar", score: freiScore, max: 25,
    detail: `${frei.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} € / Monat`,
  });

  // 3. Eigenkapital / Vermögen (max 15)
  //
  // Bemessungsgrundlage sind liquide Mittel UND das Nettoimmobilienvermögen
  // (Verkehrswert abzüglich Restschuld). Vorher zählten nur die liquiden
  // Werte, wodurch ausgerechnet die vermögendsten Kontakte hier mit null
  // bewertet wurden: Das Formular der Selbstauskunft lässt bei der
  // Vermögensart "Immobilien" gar keinen Betrag zu, der Marktwert steht in
  // einem eigenen Block.
  //
  // Bewusst kein eigenes Kriterium: Die Skala ergibt genau 100 Punkte
  // (30 + 25 + 15 + 10 + 10 + 5 + 5), ein zusätzlicher Posten würde jede
  // bestehende Bewertung verschieben. Für die Frage "wie interessant ist
  // dieser Kontakt" ist Vermögen ohnehin Vermögen. Ob er die Nebenkosten bar
  // aufbringen kann, beantwortet die Finanzierbarkeit, und die rechnet
  // weiterhin bewusst nur mit liquiden Mitteln.
  const liquideMittel = sumVermoegen(saData.vermoegenswerte) + (p2 ? sumVermoegen(p2.vermoegenswerte) : 0);
  const immoVermoegen = berechneImmobilienvermoegen(saData);
  const immoNetto = Math.max(0, immoVermoegen.netto);
  const vermoegen = liquideMittel + immoNetto;
  let vermoegenScore = 0;
  if (vermoegen >= 75000) vermoegenScore = 15;
  else if (vermoegen >= 30000) vermoegenScore = 10;
  else if (vermoegen >= 10000) vermoegenScore = 5;
  const alsEuro = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
  breakdown.push({
    key: "vermoegen", label: "Eigenkapital / Vermögen", score: vermoegenScore, max: 15,
    // Beides getrennt ausweisen, damit erkennbar bleibt, wie viel davon
    // wirklich verfügbar ist und wie viel in Immobilien gebunden ist.
    detail: immoVermoegen.vorhanden
      ? `${alsEuro(liquideMittel)} liquide, ${alsEuro(immoNetto)} Immobilien netto`
      : alsEuro(liquideMittel),
  });

  // 4. Schuldenquote (max 10)
  const quote = netto > 0 ? kreditraten / netto : 1;
  let quoteScore = 0;
  if (quote < 0.20) quoteScore = 10;
  else if (quote < 0.35) quoteScore = 6;
  else if (quote < 0.50) quoteScore = 3;
  breakdown.push({
    key: "quote", label: "Schuldenquote", score: quoteScore, max: 10,
    detail: netto > 0 ? `${(quote * 100).toFixed(0)} % des Nettos` : "–",
  });

  // 5. Beruf / Stabilität (max 10) – Mittelwert beider Personen
  const berufScore = (sa: any): number => {
    if (!sa) return 0;
    const art = String(sa.beschaeftigungsart || "").toLowerCase();
    const seitStr = sa.anstellung?.angestelltSeit || sa.selbstaendigkeit?.selbstaendigSeit || "";
    let jahre = 0;
    if (seitStr) {
      const yr = parseInt(String(seitStr).slice(0, 4), 10);
      if (!isNaN(yr)) jahre = new Date().getFullYear() - yr;
    }
    const probezeit = String(sa.anstellung?.probezeit || "").toLowerCase() === "ja";
    if (probezeit) return 3;
    if (art.includes("beamt")) return jahre >= 3 ? 10 : 8;
    if (art.includes("angestellt") || art.includes("arbeit")) return jahre >= 3 ? 10 : 7;
    if (art.includes("selbst") || art.includes("freiberuf")) return jahre >= 3 ? 8 : 4;
    if (art.includes("rent") || art.includes("pension")) return 7;
    if (art.includes("befrist")) return 4;
    return 2;
  };
  const berufScoreVal = p2
    ? Math.round((berufScore(saData) + berufScore(p2)) / 2)
    : berufScore(saData);
  breakdown.push({
    key: "beruf", label: "Beruf / Stabilität", score: berufScoreVal, max: 10,
    detail: saData.beschaeftigungsart || "–",
  });

  // 6. Alter & Familie (max 5)
  const alter = computeAge(saData.geburtsdatum);
  let alterScore = 1;
  if (alter !== null) {
    if (alter >= 30 && alter <= 50) alterScore = 5;
    else if (alter >= 25 && alter <= 55) alterScore = 3;
  }
  breakdown.push({
    key: "alter", label: "Alter / Lebensphase", score: alterScore, max: 5,
    detail: alter !== null ? `${alter} Jahre` : "–",
  });

  // 7. Datenqualität (max 5)
  const dq = dataQuality(saData);
  const dqScore = Math.round(dq * 5);
  breakdown.push({
    key: "dq", label: "Datenqualität", score: dqScore, max: 5,
    detail: `${Math.round(dq * 100)} % der Pflichtfelder`,
  });

  const total = breakdown.reduce((s, b) => s + b.score, 0);
  let klasse: LeadScoreKlasse = "D";
  let klasseLabel = "D-Lead · Bonität kritisch";
  if (total >= 80) { klasse = "A"; klasseLabel = "A-Lead · Hot"; }
  else if (total >= 60) { klasse = "B"; klasseLabel = "B-Lead · Solide"; }
  else if (total >= 40) { klasse = "C"; klasseLabel = "C-Lead · Mit Vorbehalten"; }

  return { total, klasse, klasseLabel, breakdown, hasSA: true };
}

export function leadScoreColor(klasse: LeadScoreKlasse): { ring: string; bg: string; text: string; badge: string } {
  switch (klasse) {
    case "A": return { ring: "stroke-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-600", badge: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" };
    case "B": return { ring: "stroke-yellow-500", bg: "bg-yellow-500/10", text: "text-yellow-600", badge: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" };
    case "C": return { ring: "stroke-orange-500", bg: "bg-orange-500/10", text: "text-orange-600", badge: "bg-orange-500/15 text-orange-700 border-orange-500/30" };
    case "D": return { ring: "stroke-red-500", bg: "bg-red-500/10", text: "text-red-600", badge: "bg-red-500/15 text-red-700 border-red-500/30" };
  }
}