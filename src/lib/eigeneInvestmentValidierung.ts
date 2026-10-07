/**
 * Validierung des Formulars "Eigene Investments" (Kundenportal).
 *
 * Reine Funktionen, keine UI. Grundsatz aus Stufe 1 und 2 der
 * Kundenportal-Sanierung: Leere Felder bleiben leer (NULL), es wird nichts
 * still auf 0 gesetzt. Harte Fehler (negative Betraege, Prozent ausserhalb
 * 0 bis 100, unlesbare Zahlen) blockieren das Speichern. Warnungen
 * (unplausibles Baujahr, Kaufdatum in der Zukunft, Zinssatz ueber 15 %,
 * offene Tilgung ueber der Darlehenssumme, Kaufpreis 0) erlauben das
 * Speichern nach ausdruecklicher Bestaetigung.
 *
 * Die Meldungen sieht der Kunde im Formular, deshalb kommen sie in der
 * Anzeigesprache des Portals (`i18n.t`, Schluessel unter
 * `portal.cards.eigene.validierung`).
 */
import i18n from "@/i18n";
import { SPRACH_LOCALE } from "@/lib/sprachFormat";
import { portalSprache } from "@/i18n/portalSprache";

export type PruefStufe = "fehler" | "warnung";

export interface PruefErgebnis {
  fehler: string[];
  warnungen: string[];
  /** Feldname aus dem Formular → schwerste Stufe, fuer die rote Markierung. */
  felder: Record<string, PruefStufe>;
}

/** String-Formularwerte, Schluessel wie im Formularzustand des Tabs. */
export type EigenesInvestmentForm = Record<string, string>;

/**
 * Feldnamen in der Anzeigesprache. Als Funktion mit festen Schluesseln, damit
 * die Uebersetzung erst beim Pruefen gilt und der Schluesseltest sie findet.
 */
function feldNamen(): Record<string, string> {
  const t = i18n.t.bind(i18n);
  return {
    kaufpreis: t("portal.cards.eigene.validierung.feld_kaufpreis"),
    nebenkosten: t("portal.cards.eigene.validierung.feld_nebenkosten"),
    darlehenssumme: t("portal.cards.eigene.validierung.feld_darlehenssumme"),
    offene_tilgung: t("portal.cards.eigene.validierung.feld_offene_tilgung"),
    monatliche_rate: t("portal.cards.eigene.validierung.feld_monatliche_rate"),
    sondertilgung_jahr: t("portal.cards.eigene.validierung.feld_sondertilgung_jahr"),
    mieteinnahmen_kalt: t("portal.cards.eigene.validierung.feld_kaltmiete"),
    mieteinnahmen_warm: t("portal.cards.eigene.validierung.feld_warmmiete"),
    hausgeld: t("portal.cards.eigene.validierung.feld_hausgeld"),
    ruecklagen: t("portal.cards.eigene.validierung.feld_ruecklagen"),
    eigenanteil_manuell: t("portal.cards.eigene.validierung.feld_eigenanteil"),
    wohnflaeche: t("portal.cards.eigene.validierung.feld_wohnflaeche"),
    grundsteuer_jahr: t("portal.cards.eigene.validierung.feld_grundsteuer_jahr"),
    versicherung_jahr: t("portal.cards.eigene.validierung.feld_versicherung_jahr"),
    verwaltungskosten_jahr: t("portal.cards.eigene.validierung.feld_verwaltungskosten_jahr"),
    hausgeld_nicht_umlage_monat: t("portal.cards.eigene.validierung.feld_hausgeld_nicht_umlage_monat"),
    umlagen_monat: t("portal.cards.eigene.validierung.feld_umlagen_monat"),
    anfangstilgung: t("portal.cards.eigene.validierung.feld_anfangstilgung"),
    gebaeude_anteil_prozent: t("portal.cards.eigene.validierung.feld_gebaeude_anteil"),
    afa_satz_prozent: t("portal.cards.eigene.validierung.feld_afa_satz"),
    miteigentumsanteil_prozent: t("portal.cards.eigene.validierung.feld_miteigentumsanteil"),
    zinssatz: t("portal.cards.eigene.validierung.feld_zinssatz"),
  };
}

/** Euro-Felder: duerfen leer sein, muessen sonst Zahlen >= 0 sein. */
const GELD_FELDER: string[] = [
  "kaufpreis",
  "nebenkosten",
  "darlehenssumme",
  "offene_tilgung",
  "monatliche_rate",
  "sondertilgung_jahr",
  "mieteinnahmen_kalt",
  "mieteinnahmen_warm",
  "hausgeld",
  "ruecklagen",
  "eigenanteil_manuell",
  "wohnflaeche",
  "grundsteuer_jahr",
  "versicherung_jahr",
  "verwaltungskosten_jahr",
  "hausgeld_nicht_umlage_monat",
  "umlagen_monat",
];

/** Prozent-Felder: duerfen leer sein, muessen sonst zwischen 0 und 100 liegen. */
const PROZENT_FELDER: string[] = [
  "anfangstilgung",
  "gebaeude_anteil_prozent",
  "afa_satz_prozent",
  "miteigentumsanteil_prozent",
];

/** Leerer String → null, sonst Zahl (NaN, wenn unlesbar). */
export function zahlOderNull(wert: string | undefined | null): number | null {
  const v = (wert ?? "").trim();
  if (!v) return null;
  return Number(v.replace(",", "."));
}

export function validiereEigenesInvestment(
  form: EigenesInvestmentForm,
  heute: Date = new Date(),
): PruefErgebnis {
  const fehler: string[] = [];
  const warnungen: string[] = [];
  const felder: Record<string, PruefStufe> = {};
  const t = i18n.t.bind(i18n);
  const namen = feldNamen();
  const zahlAnzeige = (n: number) =>
    n.toLocaleString(SPRACH_LOCALE[portalSprache()], { maximumFractionDigits: 3 });

  const merke = (key: string, stufe: PruefStufe) => {
    if (felder[key] !== "fehler") felder[key] = stufe;
  };
  const fehlerMelden = (key: string, text: string) => {
    fehler.push(text);
    merke(key, "fehler");
  };
  const warnen = (key: string, text: string) => {
    warnungen.push(text);
    merke(key, "warnung");
  };

  for (const key of GELD_FELDER) {
    const n = zahlOderNull(form[key]);
    if (n === null) continue;
    if (!Number.isFinite(n)) fehlerMelden(key, t("portal.cards.eigene.validierung.keine_zahl", { feld: namen[key] }));
    else if (n < 0) fehlerMelden(key, t("portal.cards.eigene.validierung.negativ", { feld: namen[key] }));
  }

  for (const key of PROZENT_FELDER) {
    const n = zahlOderNull(form[key]);
    if (n === null) continue;
    if (!Number.isFinite(n)) fehlerMelden(key, t("portal.cards.eigene.validierung.keine_zahl", { feld: namen[key] }));
    else if (n < 0 || n > 100) fehlerMelden(key, t("portal.cards.eigene.validierung.prozent_bereich", { feld: namen[key] }));
  }

  // Zinssatz: negativ ist ein harter Fehler, ueber 15 % nur eine Warnung.
  const zins = zahlOderNull(form.zinssatz);
  if (zins !== null) {
    if (!Number.isFinite(zins)) fehlerMelden("zinssatz", t("portal.cards.eigene.validierung.keine_zahl", { feld: namen.zinssatz }));
    else if (zins < 0) fehlerMelden("zinssatz", t("portal.cards.eigene.validierung.negativ", { feld: namen.zinssatz }));
    else if (zins > 15) warnen("zinssatz", t("portal.cards.eigene.validierung.zins_hoch", { zins: zahlAnzeige(zins) }));
  }

  // Kaufpreis: wenn angegeben, sollte er groesser als 0 sein.
  const kaufpreis = zahlOderNull(form.kaufpreis);
  if (kaufpreis !== null && Number.isFinite(kaufpreis) && kaufpreis === 0) {
    warnen("kaufpreis", t("portal.cards.eigene.validierung.kaufpreis_null"));
  }

  // Baujahr: plausibel zwischen 1800 und dem aktuellen Jahr.
  const baujahrRoh = (form.baujahr ?? "").trim();
  if (baujahrRoh) {
    const baujahr = Number(baujahrRoh);
    const aktuellesJahr = heute.getFullYear();
    if (!Number.isFinite(baujahr) || !Number.isInteger(baujahr)) {
      fehlerMelden("baujahr", t("portal.cards.eigene.validierung.baujahr_ungueltig"));
    } else if (baujahr < 1800 || baujahr > aktuellesJahr) {
      warnen("baujahr", t("portal.cards.eigene.validierung.baujahr_unplausibel", { baujahr, jahr: aktuellesJahr }));
    }
  }

  // Kaufdatum: nicht in der Zukunft.
  const kaufdatumRoh = (form.kaufdatum ?? "").trim();
  if (kaufdatumRoh) {
    const kaufdatum = new Date(kaufdatumRoh);
    if (Number.isNaN(kaufdatum.getTime())) {
      fehlerMelden("kaufdatum", t("portal.cards.eigene.validierung.kaufdatum_ungueltig"));
    } else if (kaufdatum.getTime() > heute.getTime()) {
      warnen("kaufdatum", t("portal.cards.eigene.validierung.kaufdatum_zukunft"));
    }
  }

  // Offene Tilgung sollte die Darlehenssumme nicht uebersteigen.
  const darlehen = zahlOderNull(form.darlehenssumme);
  const offen = zahlOderNull(form.offene_tilgung);
  if (
    darlehen !== null && offen !== null &&
    Number.isFinite(darlehen) && Number.isFinite(offen) &&
    darlehen >= 0 && offen >= 0 && offen > darlehen
  ) {
    warnen("offene_tilgung", t("portal.cards.eigene.validierung.tilgung_hoeher"));
  }

  return { fehler, warnungen, felder };
}
