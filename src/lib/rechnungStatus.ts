import type { Bewerber } from "./bewerbungStore";

export type RechnungZahlStatus = "nicht_erstellt" | "offen" | "ueberfaellig" | "bezahlt";

/** Fälligkeit = ErstelltAm + N Tage (Zahlungsziel 14 Tage) */
export const ZAHLUNGSZIEL_TAGE = 14;

export function berechneFaelligAm(erstelltAm: string): string {
  if (!erstelltAm) return "";
  const d = new Date(erstelltAm);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + ZAHLUNGSZIEL_TAGE);
  return d.toISOString();
}

export function getRechnungZahlStatus(b: Bewerber): RechnungZahlStatus {
  if (!b.rechnungNr || !b.rechnungErstelltAm) return "nicht_erstellt";
  if (b.rechnungBezahltAm) return "bezahlt";
  const faellig = b.rechnungFaelligAm || berechneFaelligAm(b.rechnungErstelltAm);
  if (faellig && new Date(faellig).getTime() < Date.now()) return "ueberfaellig";
  return "offen";
}

export const ZAHL_STATUS_LABEL: Record<RechnungZahlStatus, string> = {
  nicht_erstellt: "–",
  offen: "Offen",
  ueberfaellig: "Überfällig",
  bezahlt: "Bezahlt",
};

/** Tailwind-Badge-Klassen pro Status */
export const ZAHL_STATUS_BADGE: Record<RechnungZahlStatus, string> = {
  nicht_erstellt: "bg-muted text-muted-foreground",
  offen: "bg-yellow-500 text-white",
  ueberfaellig: "bg-red-500 text-white",
  bezahlt: "bg-green-500 text-white",
};

/** Tage bis zur Fälligkeit (negativ wenn überfällig) */
export function tageBisFaellig(b: Bewerber): number | null {
  const faellig = b.rechnungFaelligAm || berechneFaelligAm(b.rechnungErstelltAm || "");
  if (!faellig) return null;
  const diffMs = new Date(faellig).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}