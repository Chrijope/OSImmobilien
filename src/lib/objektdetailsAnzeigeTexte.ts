import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte der Objektdetails (Verwaltung, Gemeinschaftseigentum, Sanierungen)
 * in Deutsch und Englisch. Kundensprache, Etappe 3: Die Kundenansicht zeigt
 * sie in der Sprache des Kunden, das CRM ruft ohne Sprache und bleibt
 * deutsch.
 *
 * Was Mitarbeiter von Hand pflegen (Name des Verwalters, Maßnahmen,
 * Gemeinschaftseigentum als Freitext) und Werte aus Investagon (Heizung,
 * Merkmale) bleiben, wie sie sind.
 */
export interface ObjektdetailsTexte {
  keineAngaben: string;
  verwaltungWeg: string;
  verwaltungWegSev: string;
  vermerkBautraeger: string;
  sanierungenUeberschrift: string;
  rundumVerwaltung: (wert: string) => string;
  hausgeldGesamt: (betrag: string) => string;
  einheiten: (n: number, zahl: string) => string;
  etagen: (n: number, zahl: string) => string;
  heizung: (art: string) => string;
  keinAufzug: string;
  aufzug: string;
  aufzugMit: (wert: string) => string;
  stellplaetze: (n: number, zahl: string) => string;
  grundstueck: (zahl: string) => string;
  miteigentumsanteil: (anteil: string) => string;
  neubau: string;
  neubauJahr: (jahr: number) => string;
  zuletzt: (jahr: number) => string;
  geplant: (jahr: number) => string;
  laufBautraeger: string;
  ohneJahresangabe: string;
  jahreSatz: (jahre: number[]) => string;
  massnahmenNichtGenannt: string;
  undWeitere: (n: number) => string;
}

export const OBJEKTDETAILS_TEXTE: ZweiSprachen<ObjektdetailsTexte> = {
  de: {
    keineAngaben: "Keine Angaben vom Bauträger",
    verwaltungWeg: "WEG-Verwaltung",
    verwaltungWegSev: "WEG- und SEV-Verwaltung",
    vermerkBautraeger: "aus den Angaben des Bauträgers",
    sanierungenUeberschrift: "Sanierungen und Maßnahmen",
    rundumVerwaltung: (wert) => `360°-Verwaltung ${wert}`,
    hausgeldGesamt: (betrag) => `Hausgeld gesamt ${betrag} je Monat`,
    einheiten: (n, zahl) => (n === 1 ? "1 Einheit" : `${zahl} Einheiten`),
    etagen: (n, zahl) => (n === 1 ? "1 Etage" : `${zahl} Etagen`),
    heizung: (art) => `Heizung ${art}`,
    keinAufzug: "kein Aufzug",
    aufzug: "Aufzug",
    aufzugMit: (wert) => `Aufzug ${wert}`,
    stellplaetze: (n, zahl) => (n === 1 ? "1 Stellplatz" : `${zahl} Stellplätze`),
    grundstueck: (zahl) => `Grundstück ${zahl} m²`,
    miteigentumsanteil: (anteil) => `Miteigentumsanteil ${anteil}`,
    neubau: "Neubau",
    neubauJahr: (jahr) => `Neubau ${jahr}`,
    zuletzt: (jahr) => `Zuletzt ${jahr}`,
    geplant: (jahr) => `Geplant ${jahr}`,
    laufBautraeger: "Laut Bauträger",
    ohneJahresangabe: "Ohne Jahresangabe",
    jahreSatz: (jahre) => `${jahre.length > 1 ? "Sanierungsjahre" : "Sanierungsjahr"} ${jahre.join(", ")} laut Objektdaten`,
    massnahmenNichtGenannt: "Maßnahmen nicht genannt",
    undWeitere: (n) => ` und ${n} weitere`,
  },
  en: {
    keineAngaben: "No details from the developer",
    verwaltungWeg: "WEG management (owners’ association)",
    verwaltungWegSev: "WEG and SEV management (owners’ association and rental management)",
    vermerkBautraeger: "based on the developer’s information",
    sanierungenUeberschrift: "Renovations and works",
    rundumVerwaltung: (wert) => `360° management: ${wert}`,
    hausgeldGesamt: (betrag) => `Total service charge (Hausgeld) ${betrag} per month`,
    einheiten: (n, zahl) => (n === 1 ? "1 unit" : `${zahl} units`),
    etagen: (n, zahl) => (n === 1 ? "1 floor" : `${zahl} floors`),
    heizung: (art) => `Heating: ${art}`,
    keinAufzug: "no lift",
    aufzug: "Lift",
    aufzugMit: (wert) => `Lift: ${wert}`,
    stellplaetze: (n, zahl) => (n === 1 ? "1 parking space" : `${zahl} parking spaces`),
    grundstueck: (zahl) => `Plot ${zahl} m²`,
    miteigentumsanteil: (anteil) => `Co-ownership share ${anteil}`,
    neubau: "New build",
    neubauJahr: (jahr) => `New build ${jahr}`,
    zuletzt: (jahr) => `Most recent ${jahr}`,
    geplant: (jahr) => `Planned ${jahr}`,
    laufBautraeger: "According to the developer",
    ohneJahresangabe: "No year given",
    jahreSatz: (jahre) => `${jahre.length > 1 ? "Renovation years" : "Renovation year"} ${jahre.join(", ")} according to the property data`,
    massnahmenNichtGenannt: "works not specified",
    undWeitere: (n) => ` and ${n} more`,
  },
};
