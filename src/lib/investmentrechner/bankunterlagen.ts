/**
 * Unterlagen fürs Bankgespräch, seit dem 11.10.2026: Haushaltsrechnung und
 * Vermögensaufstellung des Kunden (Abgleich mit dem Excel-Tool von immocation).
 *
 * Beide liegen in der Eingabe (`haushalt`, `vermoegen`) und damit im JSON der
 * gespeicherten Berechnung, ohne Migration. Neue Rate, Miete und nicht
 * umlagefähige Bewirtschaftung der Wohnung kommen automatisch aus dem
 * Ergebnis des Rechenkerns, sie werden nicht abgetippt.
 *
 * Vorbefüllt wird aus der Selbstauskunft des Investments (`bankunterlagenAusSa`),
 * jeder übernommene Posten trägt dann seinen Herkunftssatz.
 *
 * Rein und ohne Datenzugriff.
 */

import { num } from "@/lib/kundenkontextHelper";
import type {
  Bankunterlagenposten,
  Haushaltsrechnung,
  InvestmentErgebnis,
  Vermoegensaufstellung,
} from "./rechenkern";
import { monateErstesJahr } from "./rechenkern";

const leer = (bezeichnung: string): Bankunterlagenposten => ({ bezeichnung, betrag: 0 });

/** Die Zeilen eines leeren Formulars. */
export const HAUSHALT_VORLAGE: Haushaltsrechnung = {
  einkuenfte: ["Nettoeinkommen Person 1", "Nettoeinkommen Person 2", "Kindergeld", "Sonstige Einkünfte"].map(leer),
  ausgaben: ["Miete und Nebenkosten (eigene Wohnung)", "Lebenshaltung", "Versicherungen", "Bestehende Kreditraten"].map(leer),
};

export const VERMOEGEN_VORLAGE: Vermoegensaufstellung = {
  werte: ["Bank- und Sparguthaben", "Wertpapiere / Depot", "Bestehende Immobilien (Verkehrswert)"].map(leer),
  verbindlichkeiten: ["Bestehende Immobiliendarlehen", "Ratenkredite"].map(leer),
};

/** Ein leeres Formular zeigt die Vorlage, damit man gleich eintragen kann. */
export function haushaltMitVorlage(h: Haushaltsrechnung | undefined): Haushaltsrechnung {
  return h && (h.einkuenfte.length > 0 || h.ausgaben.length > 0) ? h : HAUSHALT_VORLAGE;
}

export function vermoegenMitVorlage(v: Vermoegensaufstellung | undefined): Vermoegensaufstellung {
  return v && (v.werte.length > 0 || v.verbindlichkeiten.length > 0) ? v : VERMOEGEN_VORLAGE;
}

const summe = (liste: readonly Bankunterlagenposten[]) => liste.reduce((s, p) => s + (Number.isFinite(p.betrag) ? p.betrag : 0), 0);

export interface HaushaltErgebnis {
  einkuenfteMonat: number;
  ausgabenMonat: number;
  /** Einkünfte minus Ausgaben, vor dem Investment. */
  ueberschussVorMonat: number;
  /** Aus dem Rechenkern, erstes Jahr je Monat. */
  mieteMonat: number;
  rateMonat: number;
  bewirtschaftungMonat: number;
  steuerwirkungMonat: number;
  /** Vorher plus Miete minus Rate und Bewirtschaftung, ohne Steuer, wie Banken meist rechnen. */
  ueberschussNachMonat: number;
  /** Dasselbe mit der Steuerwirkung des ersten Jahres. */
  ueberschussNachMitSteuerMonat: number;
}

/**
 * Haushaltsüberschuss vor und nach dem Investment, je Monat (je Jahr mal 12).
 *
 * Rate ist die Kreditrate des ersten Monats (`monthlyDebtService`), also ohne
 * Sondertilgung. Bewirtschaftung sind die nicht umlagefähigen Kosten plus die
 * Zuführung zur Rücklage, Miete die Kaltmiete nach Leerstand.
 */
export function haushaltsrechnung(
  haushalt: Haushaltsrechnung,
  result: Pick<InvestmentErgebnis, "monthlyDebtService" | "years">,
): HaushaltErgebnis {
  const einkuenfteMonat = summe(haushalt.einkuenfte);
  const ausgabenMonat = summe(haushalt.ausgaben);
  const ueberschussVorMonat = einkuenfteMonat - ausgabenMonat;
  const erstes = result.years[0];
  const mieteMonat = erstes ? erstes.effectiveRent / monateErstesJahr(result) : 0;
  const bewirtschaftungMonat = erstes ? (erstes.operatingCosts + erstes.reserveContribution) / monateErstesJahr(result) : 0;
  const steuerwirkungMonat = erstes ? erstes.taxEffect / monateErstesJahr(result) : 0;
  const rateMonat = result.monthlyDebtService;
  const ueberschussNachMonat = ueberschussVorMonat + mieteMonat - rateMonat - bewirtschaftungMonat;
  return {
    einkuenfteMonat,
    ausgabenMonat,
    ueberschussVorMonat,
    mieteMonat,
    rateMonat,
    bewirtschaftungMonat,
    steuerwirkungMonat,
    ueberschussNachMonat,
    ueberschussNachMitSteuerMonat: ueberschussNachMonat + steuerwirkungMonat,
  };
}

export interface VermoegenErgebnis {
  werte: number;
  davonVerpfaendet: number;
  verbindlichkeiten: number;
  /** Vermögenswerte minus Verbindlichkeiten. */
  differenz: number;
  /** Mit der neuen Wohnung (Kaufpreis) und den neuen Darlehen. */
  differenzNachKauf: number;
  kaufpreis: number;
  neueDarlehen: number;
}

export function vermoegensaufstellung(
  vermoegen: Vermoegensaufstellung,
  result: Pick<InvestmentErgebnis, "kaufpreisGesamt" | "totalDebt">,
): VermoegenErgebnis {
  const werte = summe(vermoegen.werte);
  const verbindlichkeiten = summe(vermoegen.verbindlichkeiten);
  const differenz = werte - verbindlichkeiten;
  return {
    werte,
    davonVerpfaendet: summe(vermoegen.werte.filter((p) => p.verpfaendet)),
    verbindlichkeiten,
    differenz,
    differenzNachKauf: differenz + result.kaufpreisGesamt - result.totalDebt,
    kaufpreis: result.kaufpreisGesamt,
    neueDarlehen: result.totalDebt,
  };
}

type Roh = Record<string, unknown>;
const obj = (wert: unknown): Roh => (wert && typeof wert === "object" ? (wert as Roh) : {});
const liste = (wert: unknown): Roh[] => (Array.isArray(wert) ? wert.map(obj) : []);
const text = (wert: unknown) => (typeof wert === "string" ? wert.trim() : "");

/**
 * Haushaltsrechnung und Vermögensaufstellung aus einer Selbstauskunft
 * (Aufbau `SelbstauskunftData`, Person 2 in `person2Data`, wenn `person2`).
 * Übernommen wird nur, was dort mit Betrag steht; Beträge der Selbstauskunft
 * sind Monatswerte. `null`, wenn sie nichts davon enthält.
 */
export function bankunterlagenAusSa(
  sa: unknown,
  herkunft = "Aus der Selbstauskunft",
): { haushalt: Haushaltsrechnung; vermoegen: Vermoegensaufstellung } | null {
  const p1 = obj(sa);
  if (Object.keys(p1).length === 0) return null;
  const personen = p1.person2 === true ? [p1, obj(p1.person2Data)] : [p1];
  const beide = (lesen: (p: Roh) => unknown) => personen.reduce((s, p) => s + num(lesen(p)), 0);
  const posten = (bezeichnung: string, betrag: number, extra: Partial<Bankunterlagenposten> = {}): Bankunterlagenposten[] =>
    betrag > 0 ? [{ bezeichnung, betrag, herkunft, ...extra }] : [];

  const einkuenfte = [
    ...personen.flatMap((p, i) => posten(`Nettoeinkommen Person ${i + 1}`, num(obj(p.einkommen).netto))),
    ...posten("Einkünfte aus Selbstständigkeit", beide((p) => obj(p.einkommen).gewerbe)),
    ...posten("Mieteinnahmen bestehender Immobilien", beide((p) => obj(p.einkommen).miet)),
    ...posten("Renten", beide((p) => obj(p.einkommen).rente)),
    ...posten("Zinsen und Kapitalerträge", beide((p) => obj(p.einkommen).zinsen)),
    ...posten("Kindergeld", beide((p) => obj(p.einkommen).kindergeld)),
    ...posten("Sonstige Einkünfte", beide((p) => obj(p.einkommen).sonstige)),
  ];
  const ausgaben = [
    ...posten("Kaltmiete eigene Wohnung", beide((p) => p.mieteWarm)),
    ...posten("Nebenkosten eigene Wohnung", beide((p) => p.nebenkosten)),
    ...posten("Lebenshaltung", beide((p) => p.lebenshaltungskosten)),
    ...posten("Private Krankenversicherung", beide((p) => p.privateKV)),
    ...posten(
      "Versicherungen und Vorsorge",
      beide((p) => num(p.versicherungsbeitraege) + num(p.versBU) + num(p.versRiester) + num(p.versAV) + num(p.versWeitere)),
    ),
    ...posten("Unterhalt", beide((p) => p.unterhalt)),
    ...posten("Kfz-Kosten", beide((p) => p.kfzKosten)),
    ...posten("Bestehende Kreditraten", beide((p) => liste(p.kredite).reduce((s, k) => s + num(k.rate), 0))),
    ...posten("Sonstige Ausgaben", beide((p) => p.sonstigeAusgaben)),
  ];
  const werte = personen.flatMap((p) => [
    ...liste(p.vermoegenswerte).flatMap((v) =>
      posten([text(v.art), text(v.institut)].filter(Boolean).join(", ") || "Vermögenswert", num(v.betrag)),
    ),
    ...liste(p.immobilien).flatMap((im) =>
      posten([text(im.art) || "Immobilie", text(im.adresse)].filter(Boolean).join(", "), num(im.marktwert)),
    ),
  ]);
  const verbindlichkeiten = personen.flatMap((p) =>
    liste(p.kredite).flatMap((k) => posten([text(k.art) || "Kredit", text(k.bank)].filter(Boolean).join(", "), num(k.restschuld))),
  );
  if (einkuenfte.length + ausgaben.length + werte.length + verbindlichkeiten.length === 0) return null;
  return { haushalt: { einkuenfte, ausgaben }, vermoegen: { werte, verbindlichkeiten } };
}

type Bankunterlagen = { haushalt: Haushaltsrechnung; vermoegen: Vermoegensaufstellung };

/** Von Hand eingetragen: ohne Herkunftssatz und mit Betrag. Leere Vorlagezeilen zählen nicht. */
const istManuell = (p: Bankunterlagenposten) => !p.herkunft && p.betrag !== 0;
const alleListen = (u: Bankunterlagen) => [u.haushalt.einkuenfte, u.haushalt.ausgaben, u.vermoegen.werte, u.vermoegen.verbindlichkeiten];

/** Stehen von Hand eingetragene oder geänderte Werte in Haushalt oder Vermögen? */
export function hatManuelleBankunterlagen(u: Bankunterlagen): boolean {
  return alleListen(u).some((liste) => liste.some(istManuell));
}

/**
 * Neue Werte aus der Selbstauskunft übernehmen, seit dem 11.10.2026.
 *
 * `ueberschreiben`: die Selbstauskunft ersetzt alles. Sonst bleiben von Hand
 * eingetragene oder geänderte Posten stehen (wie „eigen“ in herkunft.ts):
 * Ein Posten der Selbstauskunft mit derselben Bezeichnung fällt dann weg,
 * zusätzliche Handposten kommen ans Ende.
 */
export function bankunterlagenZusammenfuehren(bisher: Bankunterlagen, neu: Bankunterlagen, ueberschreiben: boolean): Bankunterlagen {
  if (ueberschreiben) return neu;
  const name = (p: Bankunterlagenposten) => p.bezeichnung.trim().toLowerCase();
  const liste = (alt: Bankunterlagenposten[], frisch: Bankunterlagenposten[]) => {
    const manuell = alt.filter(istManuell);
    const ersetzt = frisch.map((p) => manuell.find((m) => name(m) === name(p)) ?? p);
    return [...ersetzt, ...manuell.filter((m) => !ersetzt.includes(m))];
  };
  return {
    haushalt: { einkuenfte: liste(bisher.haushalt.einkuenfte, neu.haushalt.einkuenfte), ausgaben: liste(bisher.haushalt.ausgaben, neu.haushalt.ausgaben) },
    vermoegen: {
      werte: liste(bisher.vermoegen.werte, neu.vermoegen.werte),
      verbindlichkeiten: liste(bisher.vermoegen.verbindlichkeiten, neu.vermoegen.verbindlichkeiten),
    },
  };
}
