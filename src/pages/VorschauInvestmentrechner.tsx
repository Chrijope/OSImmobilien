import { useState } from "react";
import { InvestmentrechnerInhalt } from "@/components/investmentrechner/InvestmentrechnerInhalt";
import golden from "@/lib/investmentrechner/rechenkern.golden.json";
import { standardKaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";

/*
 * Lokale Vorschau der Etappen vom 11.10.2026 (Anschlusszins, Sondertilgungen,
 * zweites Bankdarlehen, Ampel, Haushaltsrechnung, Vermögensaufstellung,
 * Bankgespräch-PDF). Nur im Entwicklungsmodus erreichbar (siehe
 * vorschauRouten.ts), ohne Anmeldung und ohne Datenbank: Speichern und KI
 * melden „In der Vorschau nicht verfügbar“. Alles Neue trägt das Etikett NEU.
 *
 * Die Zahlen sind der Vergleichsfall „standard“ aus rechenkern.golden.json
 * plus Beispielwerte für die neuen Felder. Kein echter Kunde.
 */

/** Eine erfundene Selbstauskunft im Aufbau von `SelbstauskunftData`. */
export const BEISPIEL_SELBSTAUSKUNFT = {
  person2: false,
  einkommen: { netto: "4.150", gewerbe: "", miet: "", zinsen: "35", rente: "", kindergeld: "0", sonstige: "" },
  mieteWarm: "980",
  nebenkosten: "220",
  lebenshaltungskosten: "1.100",
  privateKV: "0",
  versicherungsbeitraege: "120",
  versBU: "85",
  kfzKosten: "260",
  sonstigeAusgaben: "150",
  kredite: [{ art: "Ratenkredit", bank: "Hausbank", rate: "180", restschuld: "6.400" }],
  vermoegenswerte: [
    { art: "Bank- & Sparguthaben", institut: "Sparkasse", betrag: "48.000" },
    { art: "Wertpapiere / Depot", institut: "Onlinebroker", betrag: "22.500" },
  ],
};

/** Dieselbe Selbstauskunft mit neuerem Stand: mehr Netto, ein Kredit weniger. Zeigt „Neu aus Selbstauskunft laden“. */
export const BEISPIEL_SELBSTAUSKUNFT_NEU = {
  ...BEISPIEL_SELBSTAUSKUNFT,
  einkommen: { ...BEISPIEL_SELBSTAUSKUNFT.einkommen, netto: "4.400" },
  kredite: [],
};

export const VORSCHAU_EINGABE: InvestmentEingabe = {
  ...standardEingabe,
  ...(golden as unknown as { standard: { input: Partial<InvestmentEingabe> } }).standard.input,
  clientName: "Max Muster (Beispiel)",
  propertyTitle: "Beispielobjekt, WE 4",
  address: "Musterstraße 12, 04109 Leipzig",
  propertyType: "Eigentumswohnung",
  area: 68,
  rooms: 2,
  constructionYear: 1998,
  // Neu: Anschlusszins nach fünf Jahren, eine Sondertilgung, ein zweites Darlehen.
  seniorFixedRateYears: 5,
  seniorFollowUpRate: 5.5,
  specialRepayments: [{ jahr: 2029, betrag: 10000 }],
  secondLoanAmount: 40000,
  secondInterestRate: 3.2,
  secondRepaymentRate: 3,
  secondFixedRateYears: 15,
  // Schalter an, Haushalt und Vermögen leer: Der verbundene Beispielkunde füllt sie beim Öffnen selbst.
  bankgespraechAktiv: true,
};

export default function VorschauInvestmentrechner() {
  const [neuereSa, setNeuereSa] = useState(false);
  return (
    <div className="min-h-screen bg-background p-4 md:p-6" data-lg="seite">
      <div
        className="mb-4 rounded-lg border-2 border-dashed border-[#e5007d] bg-[#e5007d]/5 p-3 text-sm"
        data-testid="vorschau-banner"
      >
        <strong>Lokale Vorschau, nur auf diesem Rechner.</strong> Ohne Anmeldung und ohne Datenbank: Speichern, Laden und
        KI sind hier nicht verfügbar, alles bleibt in diesem Fenster. Das Etikett <span className="neu-etikett">NEU</span>{" "}
        zeigt, was sich ändert. Beispielzahlen, kein echter Kunde.
        <br />
        Oben rechts der Schalter <strong>„Bankgespräch &amp; Bankunterlagen“</strong> (hier an). Ein Beispielkunde mit
        Selbstauskunft ist verbunden, Haushalt und Vermögen füllen sich deshalb selbst (Bereich „Bankunterlagen“). Die
        Ampel-Schwellen bearbeitest du in der Karte „Ampel“ der Analyse.{" "}
        <button type="button" className="underline" onClick={() => setNeuereSa((v) => !v)} data-testid="vorschau-neuere-sa">
          {neuereSa ? "Wieder die erste Selbstauskunft" : "Neuere Selbstauskunft des Kunden simulieren"}
        </button>
      </div>
      <InvestmentrechnerInhalt
        vorbelegung={{ eingabe: VORSCHAU_EINGABE, knk: standardKaufnebenkostenauswahl }}
        vorschau={{
          selbstauskunft: neuereSa ? BEISPIEL_SELBSTAUSKUNFT_NEU : BEISPIEL_SELBSTAUSKUNFT,
          stand: neuereSa ? "2" : "1",
        }}
      />
    </div>
  );
}
