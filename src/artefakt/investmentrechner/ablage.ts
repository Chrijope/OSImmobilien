/*
 * Ablage der eigenständigen Fassung: nur im Browser (localStorage). Gelesen
 * wird über `eingabeAusJson`, dieselbe Prüfung wie bei gespeicherten
 * Berechnungen im CRM. Damit lesen sich auch Stände der früheren
 * Artefaktfassung mit `garageMiete` und `garagePreis` (siehe dort).
 */
import golden from "@/lib/investmentrechner/rechenkern.golden.json";
import { eingabeAusJson } from "@/lib/investmentBerechnungenStore";
import { standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";

/** Derselbe Schlüssel wie in der früheren Fassung, damit vorhandene Eingaben bleiben. */
const SCHLUESSEL = "investmentrechner-eingabe-v1";

/**
 * Die Beispielzahlen beim ersten Öffnen: der Golden-Fall „standard“ mit
 * Objektangaben, Zinsbindung, zweitem Darlehen und
 * einer Garage, wie in der früheren Fassung. Die Garage steht jetzt in den
 * Feldern des CRM: Miete getrennt, Preis als „davon“ im Kaufpreis.
 */
export const BEISPIEL_EINGABE: InvestmentEingabe = {
  ...standardEingabe,
  ...(golden as unknown as { standard: { input: Partial<InvestmentEingabe> } }).standard.input,
  clientName: "Beispielkunde",
  propertyTitle: "Beispielobjekt, WE 4",
  address: "Musterstraße 12, 04109 Leipzig",
  propertyType: "Eigentumswohnung",
  area: 68,
  rooms: 2,
  constructionYear: 1998,
  seniorFixedRateYears: 5,
  secondLoanAmount: 0,
  bankgespraechAktiv: false,
  // Die Golden-Werte rechnen mit 3,57 % Makler. Das Feld ist im Rechner nicht mehr bedienbar
  // (Eingabebereiche.tsx), stand aber unsichtbar in den Kaufnebenkosten (Gegencheck Einhauser, 29.10.2026).
  brokerRate: 0,
  garagePrice: 15000,
  monthlyGarageRent: 60,
};

export function eingabeLaden(): InvestmentEingabe | null {
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    // Ohne die Beispielzahlen darunter: Sonst stünde die Garage des Beispiels in jedem alten Stand.
    return roh ? eingabeAusJson(JSON.parse(roh)) : null;
  } catch {
    return null;
  }
}

export function eingabeSpeichern(eingabe: InvestmentEingabe): void {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(eingabe));
  } catch {
    /* gesperrt, etwa im privaten Fenster */
  }
}

export function eingabeLoeschen(): void {
  try {
    localStorage.removeItem(SCHLUESSEL);
  } catch {
    /* gesperrt */
  }
}

export function namenLaden(): string {
  try {
    return localStorage.getItem(`${SCHLUESSEL}-partner`) ?? "";
  } catch {
    return "";
  }
}

export function namenSpeichern(name: string): void {
  try {
    localStorage.setItem(`${SCHLUESSEL}-partner`, name);
  } catch {
    /* gesperrt */
  }
}
