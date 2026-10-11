import { Link } from "react-router-dom";
import { InvestmentrechnerInhalt } from "@/components/investmentrechner/InvestmentrechnerInhalt";
import golden from "@/lib/investmentrechner/rechenkern.golden.json";
import { bankunterlagenAusSa } from "@/lib/investmentrechner/bankunterlagen";
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

const unterlagen = bankunterlagenAusSa(BEISPIEL_SELBSTAUSKUNFT, "Aus der Selbstauskunft (Beispiel der Vorschau)");

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
  haushalt: unterlagen?.haushalt ?? standardEingabe.haushalt,
  vermoegen: {
    werte: (unterlagen?.vermoegen.werte ?? []).map((p, i) => (i === 1 ? { ...p, verpfaendet: true } : p)),
    verbindlichkeiten: unterlagen?.vermoegen.verbindlichkeiten ?? [],
  },
};

export default function VorschauInvestmentrechner({ erweitert = false }: { erweitert?: boolean }) {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6" data-lg="seite">
      <div
        className="mb-4 rounded-lg border-2 border-dashed border-[#e5007d] bg-[#e5007d]/5 p-3 text-sm"
        data-testid="vorschau-banner"
      >
        <strong>Lokale Vorschau, nur auf diesem Rechner.</strong> Ohne Anmeldung und ohne Datenbank: Speichern, Laden und
        KI sind hier nicht verfügbar, alles bleibt in diesem Fenster. Das Etikett <span className="neu-etikett">NEU</span>{" "}
        zeigt, was sich ändert. Beispielzahlen, kein echter Kunde.
        <span className="ml-2 inline-flex gap-3">
          <Link className="underline" to="/vorschau/investmentrechner">
            Investmentkalkulation
          </Link>
          <Link className="underline" to="/vorschau/investmentrechner-plus">
            Investmentkalkulation Plus (mit Bankgespräch und Bankunterlagen)
          </Link>
        </span>
      </div>
      <InvestmentrechnerInhalt
        key={erweitert ? "plus" : "normal"}
        vorbelegung={{ eingabe: VORSCHAU_EINGABE, knk: standardKaufnebenkostenauswahl }}
        erweitert={erweitert}
        vorschau={{ selbstauskunft: BEISPIEL_SELBSTAUSKUNFT }}
      />
    </div>
  );
}
