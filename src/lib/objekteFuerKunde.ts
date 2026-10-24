/**
 * „Für Kunde“ auf der Seite Objekte (seit 24.10.2026).
 *
 * Im Kundenprofil gibt es die Passung zum Finanzierungsrahmen schon, in den
 * Empfehlungen und unter „Objektauswahl vergrößern“. Wer aber auf der Seite
 * Objekte sucht, sah bisher nicht, was zu einem bestimmten Kunden passt.
 * Hier wird dieselbe Rechnung wiederverwendet (`empfehlungsKandidaten`,
 * `objektListe`), damit Profil und Objektseite nie Verschiedenes sagen.
 */
import { calculateFinanzierbarkeitFromSaData, findSaDataForInvestment } from "./finanzierbarkeitUtils";
import { empfehlungsKandidaten, finanzierungsrahmen, objektListe, type Rahmen } from "./einheitEmpfehlung";
import type { ObjektData } from "./objekteStore";
import type { ZugangsNutzer } from "./objektZugang";

export interface KundeMitRahmen {
  investmentId: string;
  kundeId: string;
  name: string;
  rahmen: Rahmen;
}

interface KontaktKurz { id: string; vorname?: string; nachname?: string }
interface InvestmentKurz { id: string; kontaktId: string; nummer?: number }

/**
 * Die Kunden zur Auswahl: jedes Investment eines sichtbaren Kontakts, für das
 * die Selbstauskunft einen Rahmen ergibt. Ohne Rahmen gäbe es nichts
 * Passendes, deshalb fehlen solche Investments in der Auswahl.
 */
export function kundenMitRahmen(
  kontakte: KontaktKurz[],
  investments: InvestmentKurz[],
  rahmenFuer: (investmentId: string) => Rahmen | null = rahmenAusSelbstauskunft,
): KundeMitRahmen[] {
  const nachId = new Map(kontakte.map((k) => [k.id, k]));
  const jeKunde = new Map<string, number>();
  for (const inv of investments) if (nachId.has(inv.kontaktId)) jeKunde.set(inv.kontaktId, (jeKunde.get(inv.kontaktId) || 0) + 1);
  const ergebnis: KundeMitRahmen[] = [];
  for (const inv of investments) {
    const k = nachId.get(inv.kontaktId);
    if (!k) continue;
    const rahmen = rahmenFuer(inv.id);
    if (!rahmen) continue;
    const name = `${k.vorname || ""} ${k.nachname || ""}`.trim() || "Ohne Namen";
    // Mehrere Investments desselben Kunden auseinanderhalten.
    const zusatz = (jeKunde.get(inv.kontaktId) || 0) > 1 && inv.nummer != null ? ` (Investment ${inv.nummer})` : "";
    ergebnis.push({ investmentId: inv.id, kundeId: k.id, name: name + zusatz, rahmen });
  }
  return ergebnis.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function rahmenAusSelbstauskunft(investmentId: string): Rahmen | null {
  const sa = findSaDataForInvestment(investmentId);
  if (!sa) return null;
  const fin = calculateFinanzierbarkeitFromSaData(sa);
  return finanzierungsrahmen(fin?.minRahmen || 0, fin?.maxRahmen || 0);
}

/** Je Objekt die Zahl der freien Einheiten, die in den Rahmen des Kunden passen. */
export function passendeJeObjekt(
  objekte: ObjektData[],
  opt: { nutzer: ZugangsNutzer; kundeId: string; rahmen: Rahmen },
): Map<string, number> {
  const kandidaten = empfehlungsKandidaten(objekte, {
    nutzer: opt.nutzer, kundeId: opt.kundeId, rahmen: opt.rahmen, wohnort: null, objektKoordinate: () => null,
  });
  return new Map(objektListe(kandidaten, objekte).map((e) => [e.objektId, e.anzahlPassend]));
}
