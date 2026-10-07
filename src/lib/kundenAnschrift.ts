import {
  eigeneSaDataFuerInvestmentRow,
  getInvestmentSaSortTimestamp,
  type InvestmentZeileMitSa,
} from "@/lib/saQuelle";

/**
 * Wo wohnt der Kunde? Fuer die Kundenpunkte auf der Marketingkarte.
 *
 * Der Kontakt ist massgeblich, wie in `wohnortAus` und im
 * Selbstauskunftsformular, das die Anschrift beim Oeffnen aus dem Kontakt
 * uebernimmt. Steht am Kontakt weder PLZ noch Ort, gilt die Anschrift aus der
 * neuesten eigenen Selbstauskunft eines seiner Investments. Bis zum
 * 05.10.2026 fehlten diese Kunden auf der Karte, obwohl die Anschrift in der
 * Selbstauskunft stand.
 *
 * Nur eigene Selbstauskuenfte zaehlen (`eigeneSaDataFuerInvestmentRow`), eine
 * noch unbestaetigte Vorbelegung aus einem anderen Investment nicht.
 */
export interface KundenAnschrift {
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  quelle: "kontakt" | "selbstauskunft";
}

type AnschriftFelder = { strasse?: unknown; hausnummer?: unknown; plz?: unknown; ort?: unknown };

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function ausFeldern(f: AnschriftFelder, quelle: KundenAnschrift["quelle"]): KundenAnschrift | null {
  const a = { strasse: text(f.strasse), hausnummer: text(f.hausnummer), plz: text(f.plz), ort: text(f.ort), quelle };
  return a.plz || a.ort ? a : null;
}

export function kundenAnschrift(
  kontakt: AnschriftFelder,
  investments: InvestmentZeileMitSa[],
): KundenAnschrift | null {
  const amKontakt = ausFeldern(kontakt, "kontakt");
  if (amKontakt) return amKontakt;
  const mitSa = [...investments].sort((a, b) => getInvestmentSaSortTimestamp(b) - getInvestmentSaSortTimestamp(a));
  for (const inv of mitSa) {
    const sa = eigeneSaDataFuerInvestmentRow(inv);
    const anschrift = sa ? ausFeldern(sa as AnschriftFelder, "selbstauskunft") : null;
    if (anschrift) return anschrift;
  }
  return null;
}

/** Die Anschrift als eine Zeile, so wie sie nachgeschlagen und am Kontakt vermerkt wird. */
export function anschriftZeile(a: KundenAnschrift): string {
  return [a.strasse, a.hausnummer, a.plz, a.ort].filter(Boolean).join(" ");
}
