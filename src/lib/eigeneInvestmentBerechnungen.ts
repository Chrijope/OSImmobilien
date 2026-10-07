/**
 * Berechnungs-Helper für „Eigene Investments" im Kundenportal:
 *  - Steuer-Cockpit (Anlage V Schätzung)
 *  - Tilgungsplan (Annuität, Sondertilgung)
 *  - Cashflow-Forecast über Jahre
 *
 * Reine Funktionen, keine UI / keine DB.
 *
 * Grundsatz: In die STEUERrechnung fließen keine stillen Schätzwerte oder
 * Pauschalannahmen ein. Fehlt eine Angabe (Gebäudeanteil, Baujahr,
 * Verwaltungsanteil des Hausgelds, Steuersatz, Kaufnebenkosten), wird der
 * betroffene Posten nicht gerechnet, als "Angabe fehlt" ausgewiesen und das
 * Gesamtergebnis über `fehlendeAngaben` als unvollständig gekennzeichnet.
 * Sichtbare, vom Nutzer einstellbare Szenario-Annahmen (Forecast) sind erlaubt.
 */

import { berechneSteuerersparnis } from "@/lib/steuerHelper";
import { linearerAfaSatz, sonderabschreibung7b, SONDER_7B_JAHRE, SONDER_7B_SATZ } from "@/lib/afaSaetze";

export type ExternesInvestment = {
  id: string;
  bezeichnung: string;
  kaufpreis: number;
  kaufdatum: string | null;
  baujahr: number | null;
  /** Wohnflaeche in m², wird fuer die Grenzen der Sonder-AfA nach § 7b EStG gebraucht. */
  wohnflaeche?: number | null;
  nebenkosten: number;
  darlehenssumme: number;
  /** Eingetragene Restschuld. null = nicht eingetragen, siehe `aktuelleRestschuld`. */
  offene_tilgung: number | null;
  zinssatz: number;          // % p.a.
  monatliche_rate: number;
  mieteinnahmen_kalt: number;
  hausgeld: number;
  ruecklagen: number;
  dokumente?: any[];
  meta?: any;
  /* Anlage-V-Spalten (Stufe 2). Optional, weil die Migration
   * 20260818100000_anlage_v_felder_externe_investments noch nicht gelaufen
   * sein kann; dann liegen die Werte in meta.anlageV (siehe leseAnlageV). */
  gebaeude_anteil_prozent?: number | null;
  afa_satz_prozent?: number | null;
  grundsteuer_jahr?: number | null;
  versicherung_jahr?: number | null;
  verwaltungskosten_jahr?: number | null;
  hausgeld_nicht_umlage_monat?: number | null;
  umlagen_monat?: number | null;
  miteigentumsanteil_prozent?: number | null;
};

/* ───────── Anlage-V-Angaben (Stufe 2) ───────── */

export interface AnlageVWerte {
  /** Anteil des Gebaeudes an den Anschaffungskosten in % (Kaufpreisaufteilung). */
  gebaeudeAnteilProzent: number | null;
  /** Manuell erfasster AfA-Satz in %. */
  afaSatzProzent: number | null;
  grundsteuerJahr: number | null;
  versicherungJahr: number | null;
  verwaltungskostenJahr: number | null;
  /** Nicht umlagefaehiger Hausgeld-Anteil in Euro je Monat, ohne Ruecklagenzufuehrung. */
  hausgeldNichtUmlageMonat: number | null;
  /** Vereinnahmte Nebenkosten-Vorauszahlungen des Mieters in Euro je Monat. */
  umlagenMonat: number | null;
  miteigentumsanteilProzent: number | null;
}

const ANLAGE_V_SPALTEN: { feld: keyof AnlageVWerte; spalte: string }[] = [
  { feld: "gebaeudeAnteilProzent", spalte: "gebaeude_anteil_prozent" },
  { feld: "afaSatzProzent", spalte: "afa_satz_prozent" },
  { feld: "grundsteuerJahr", spalte: "grundsteuer_jahr" },
  { feld: "versicherungJahr", spalte: "versicherung_jahr" },
  { feld: "verwaltungskostenJahr", spalte: "verwaltungskosten_jahr" },
  { feld: "hausgeldNichtUmlageMonat", spalte: "hausgeld_nicht_umlage_monat" },
  { feld: "umlagenMonat", spalte: "umlagen_monat" },
  { feld: "miteigentumsanteilProzent", spalte: "miteigentumsanteil_prozent" },
];

function alsZahlOderNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Liest die Anlage-V-Angaben eines Investments. Bevorzugt wird die echte
 * Tabellenspalte; solange die Migration nicht gelaufen ist, kommen die Werte
 * aus meta.anlageV (gleiche Schluessel, Uebergangspfad beim Speichern).
 * NULL bedeutet ueberall "Angabe fehlt", nie 0.
 */
export function leseAnlageV(inv: ExternesInvestment): AnlageVWerte {
  const meta = (inv.meta?.anlageV || {}) as Record<string, unknown>;
  const roh = inv as unknown as Record<string, unknown>;
  const erg = {} as AnlageVWerte;
  for (const { feld, spalte } of ANLAGE_V_SPALTEN) {
    const spaltenWert = alsZahlOderNull(roh[spalte]);
    erg[feld] = spaltenWert != null ? spaltenWert : alsZahlOderNull(meta[spalte]);
  }
  return erg;
}

/* ───────── Bodenwert und Hausgeld-Verwaltungsanteil: ein Wert ─────────
 * Frueher standen Bodenwert-Anteil und Verwaltungsanteil als Prozent in
 * meta.steuerCockpit und daneben Gebaeudeanteil und Euro-Betrag in den
 * Steuerangaben des Bearbeiten-Dialogs. Seit dem 25.09.2026 gilt nur noch der
 * Dialogwert; die Prozentfelder oben im Cockpit sind eine andere Schreibweise
 * desselben Werts. Die Umrechnungen stehen hier an einer Stelle. */

/** Rundung, damit Hin- und Rueckweg dieselbe Eingabe zeigen. */
const runde = (v: number, stellen: number) => Math.round(v * 10 ** stellen) / 10 ** stellen;

function prozentOderNull(v: unknown): number | null {
  const n = alsZahlOderNull(v);
  return n != null && n >= 0 && n <= 100 ? n : null;
}

/** Gebaeudeanteil = 100 minus Bodenwert-Anteil. null bei fehlender oder unzulaessiger Angabe. */
export function gebaeudeAnteilAusBodenwert(bodenwertProzent: unknown): number | null {
  const b = prozentOderNull(bodenwertProzent);
  return b == null ? null : runde(100 - b, 4);
}

/** Bodenwert-Anteil = 100 minus Gebaeudeanteil, fuer die Anzeige im Cockpit. */
export function bodenwertAusGebaeudeAnteil(gebaeudeProzent: unknown): number | null {
  const g = prozentOderNull(gebaeudeProzent);
  return g == null ? null : runde(100 - g, 4);
}

/**
 * Nicht umlagefaehiger Hausgeld-Anteil in Euro je Monat aus dem
 * Verwaltungsanteil in Prozent. Geht nur mit einem Gesamthausgeld je Monat;
 * ohne dieses gibt es keine Grundlage und das Ergebnis ist null.
 */
export function hausgeldEuroAusProzent(prozent: unknown, hausgeldMonat: unknown): number | null {
  const p = prozentOderNull(prozent);
  const gesamt = alsZahlOderNull(hausgeldMonat);
  if (p == null || gesamt == null || gesamt <= 0) return null;
  return runde(gesamt * (p / 100), 2);
}

/** Verwaltungsanteil in Prozent aus dem Euro-Betrag, fuer die Anzeige im Cockpit. */
export function hausgeldProzentAusEuro(euro: unknown, hausgeldMonat: unknown): number | null {
  const e = alsZahlOderNull(euro);
  const gesamt = alsZahlOderNull(hausgeldMonat);
  if (e == null || gesamt == null || gesamt <= 0) return null;
  return runde((e / gesamt) * 100, 2);
}

export interface CockpitWerte {
  /** Gebaeudeanteil in %, der Wert aus dem Bearbeiten-Dialog. */
  gebaeudeAnteilProzent: number | null;
  /** Derselbe Wert als Bodenwert-Anteil (100 minus Gebaeudeanteil). */
  bodenwertAnteil: number | null;
  /** Nicht umlagefaehiger Hausgeld-Anteil in Euro je Monat, der Wert aus dem Dialog. */
  hausgeldNichtUmlageMonat: number | null;
  /** Derselbe Wert als Prozent des Gesamthausgelds, null ohne Gesamthausgeld. */
  hausgeldNichtUmlageProzent: number | null;
}

/**
 * Die Werte, mit denen Steuer-Cockpit, Cashflow-Forecast und die Jahresliste
 * im Steuer-Reiter rechnen. Es gilt der Dialogwert. Nur solange er leer ist
 * und ein Altwert aus meta.steuerCockpit vorliegt, gilt der umgerechnete
 * Altwert. Das deckt die Zeit ab, bis die einmalige Uebernahme beim Laden
 * (`altwerteZuAenderung`) gespeichert ist; danach sind die Altwerte entfernt.
 */
export function cockpitWerte(inv: ExternesInvestment): CockpitWerte {
  const av = leseAnlageV(inv);
  const alt = (inv.meta?.steuerCockpit || {}) as Record<string, unknown>;
  const gebaeude = av.gebaeudeAnteilProzent ?? gebaeudeAnteilAusBodenwert(alt.bodenwertAnteil);
  const euro = av.hausgeldNichtUmlageMonat ?? hausgeldEuroAusProzent(alt.hausgeldNichtUmlagefaehig, inv.hausgeld);
  return {
    gebaeudeAnteilProzent: gebaeude,
    bodenwertAnteil: bodenwertAusGebaeudeAnteil(gebaeude),
    hausgeldNichtUmlageMonat: euro,
    hausgeldNichtUmlageProzent: hausgeldProzentAusEuro(euro, inv.hausgeld),
  };
}

/**
 * Vermietete Monate eines Kalenderjahres, abgeleitet aus der ersten
 * Mieteinnahme (meta.erste_miete). Ohne Angabe werden 12 Monate angesetzt und
 * das als Annahme gekennzeichnet, damit die Oberflaeche einen Hinweis zeigt.
 */
export function vermieteteMonate(
  ersteMiete: string | null | undefined,
  jahr: number,
): { monate: number; angenommen: boolean } {
  if (!ersteMiete) return { monate: 12, angenommen: true };
  const d = new Date(ersteMiete);
  if (Number.isNaN(d.getTime())) return { monate: 12, angenommen: true };
  if (d.getFullYear() > jahr) return { monate: 0, angenommen: false };
  if (d.getFullYear() === jahr) return { monate: 12 - d.getMonth(), angenommen: false };
  return { monate: 12, angenommen: false };
}

/** Dokumenttypen, die als Erhaltungsaufwand-Beleg gelten. */
export const ERHALTUNG_TYP_REGEX = /(reparatur|erhaltung|handwerker|sanierung)/i;

/**
 * Erhaltungsaufwand aus den Dokument-Belegen: Es zaehlen nur Belege mit
 * erfasstem Betrag (kein Schaetzwert fuer Belege ohne Betrag) und passendem
 * Typ oder gesetzter steuer_relevant-Markierung. Mit `jahr` zaehlen nur
 * Belege, deren Belegdatum in dieses Kalenderjahr faellt.
 */
export function erhaltungsaufwandAusBelegen(
  dokumente: Array<Record<string, unknown>> | null | undefined,
  jahr?: number | null,
): { summe: number; anzahl: number } {
  let summe = 0;
  let anzahl = 0;
  for (const d of dokumente || []) {
    const betrag = Number(d?.betrag);
    if (!Number.isFinite(betrag) || betrag <= 0) continue;
    const relevant = d?.steuer_relevant === true || ERHALTUNG_TYP_REGEX.test(String(d?.typ || ""));
    if (!relevant) continue;
    if (jahr != null) {
      const datum = new Date(String(d?.datum || ""));
      if (Number.isNaN(datum.getTime()) || datum.getFullYear() !== jahr) continue;
    }
    summe += betrag;
    anzahl += 1;
  }
  return { summe, anzahl };
}

/* ───────── Steuer-Cockpit ───────── */

export interface SteuerInput {
  /** Bodenwert-Anteil in %. null/undefined = Angabe fehlt, dann keine AfA. */
  bodenwertAnteil: number | null;
  /**
   * Verwaltungsanteil des Hausgelds in % (nicht umlagefaehig, OHNE die
   * Zufuehrung zur Instandhaltungsruecklage, die ist nicht abziehbar).
   * null/undefined = Angabe fehlt, dann wird der Posten nicht angesetzt.
   */
  hausgeldNichtUmlagefaehig: number | null;
  sonderAfA7b: boolean;
  erhaltungsaufwandJahr: number;
  /** Grenzsteuersatz in %. null/undefined = Angabe fehlt, kein Steuereffekt. */
  grenzsteuersatz: number | null;
  /** zu versteuerndes Einkommen fuer die Differenzmethode. undefiniert = flache Rechnung, 0 ist eine Angabe. */
  zvE?: number;
  verheiratet?: boolean;
  /** Kalenderjahr der Betrachtung, default aktuelles Jahr (fuer Tests und Rueckblicke). */
  betrachtungsjahr?: number;
}

/**
 * Fester Schluessel je Posten. Die Oberflaeche ordnet darueber jeder Zeile
 * das Feld zu, aus dem sie rechnet (Stift im Steuer-Cockpit), statt am
 * Beschriftungstext zu haengen.
 */
export type SteuerPostenSchluessel =
  | "miete" | "umlagen" | "schuldzinsen" | "afa" | "sonderafa"
  | "hausgeld_nicht_umlage" | "hausgeld_umlagefaehig"
  | "grundsteuer" | "versicherung" | "verwaltung" | "erhaltung";

export interface SteuerPosten {
  label: string;
  betrag: number;
  typ: "einnahme" | "ausgabe";
  /** true = Angabe fehlt, der Posten wurde nicht gerechnet */
  fehlt?: boolean;
  schluessel?: SteuerPostenSchluessel;
}

export interface SteuerErgebnis {
  /** Summe aller Einnahmen (Miete plus Umlagen), ggf. anteilig. */
  einnahmenJahr: number;
  /** Mieteinnahmen des Jahres (Kaltmiete mal vermietete Monate), ggf. anteilig. */
  mietEinnahmenJahr: number;
  /** Vereinnahmte Umlagen des Jahres, 0 wenn nicht erfasst. */
  umlagenJahr: number;
  schuldzinsenJahr: number;
  afaJahr: number;
  sonderAfaJahr: number;
  hausgeldAbsetzbarJahr: number;
  /** Umlagefaehiger Hausgeld-Anteil als Werbungskosten, 0 wenn nicht bestimmbar. */
  hausgeldUmlagefaehigJahr: number;
  grundsteuerJahr: number;
  versicherungJahr: number;
  verwaltungskostenJahr: number;
  erhaltungsaufwandJahr: number;
  werbungskostenSumme: number;
  ueberschussVerlust: number;       // negativ = Verlust = Steuerersparnis
  steuerEffekt: number;             // €, negativ wenn Ersparnis
  posten: SteuerPosten[];
  /** angesetzte Kaufnebenkosten. 0, wenn keine erfasst sind (kein Pauschalansatz). */
  nebenkosten: number;
  /** true, wenn Kaufnebenkosten erfasst sind und in der AfA-Grundlage stecken */
  nebenkostenErfasst: boolean;
  /** AfA-Bemessungsgrundlage = (Kaufpreis + erfasste Nebenkosten) x Gebaeudeanteil, 0 wenn nicht berechenbar */
  afaBemessungsgrundlage: number;
  /** tatsaechlicher Steuersatz auf das Ergebnis in % (Differenzmethode) */
  effektiverSatzP: number;
  /** true, wenn ohne zvE flach mit dem Grenzsteuersatz gerechnet wurde */
  steuerEffektGeschaetzt: boolean;
  /** true, wenn weder zvE noch Steuersatz vorliegen und deshalb kein Steuereffekt berechnet wurde */
  steuerEffektFehlt: boolean;
  /** verwendeter linearer AfA-Satz in % (§ 7 Abs. 4 EStG), 0 wenn nicht bestimmbar */
  afaSatzP: number;
  /** Rechtsgrundlage des linearen Satzes, z. B. "§ 7 Abs. 4 Satz 1 Nr. 2 a EStG" */
  afaParagraf: string;
  /** angesetzte AfA-Monate im Betrachtungsjahr (§ 7 Abs. 1 Satz 4 EStG), sonst 12 */
  afaMonate: number;
  /** Erlaeuterung, warum die Sonder-AfA § 7b ggf. nicht oder gekuerzt angesetzt wurde */
  sonderAfaHinweis: string;
  /** angesetzte vermietete Monate des Betrachtungsjahres */
  vermieteteMonate: number;
  /** true, wenn die 12 Monate mangels erster Mieteinnahme nur angenommen sind */
  vermieteteMonateAngenommen: boolean;
  /** Miteigentumsanteil in %, mit dem alle Posten skaliert sind (ohne Angabe 100) */
  miteigentumsanteilP: number;
  /** fehlende Angaben, wegen derer das Ergebnis unvollstaendig ist */
  fehlendeAngaben: string[];
}

/** Schuldzinsen Jahr 1 ≈ Restschuld × Zinssatz; danach sinkend. Hier: erstes volles Jahr. */
export function schuldzinsenJahr(restschuld: number, zinsP: number): number {
  if (!restschuld || !zinsP) return 0;
  return restschuld * (zinsP / 100);
}

/**
 * Linearer AfA-Satz nach § 7 Abs. 4 EStG, abhaengig vom Baujahr:
 * 2,5 % vor 1925, 2 % von 1925 bis 2022, 3 % ab Fertigstellung 2023.
 * Delegiert an die zentrale AfA-Bibliothek, die vorher hier liegende
 * Kopie kannte die 3-Prozent-Regel nicht.
 */
export function afaSatz(baujahr: number | null): number {
  return linearerAfaSatz(baujahr).satz;
}

export function berechneSteuer(inv: ExternesInvestment, input: SteuerInput): SteuerErgebnis {
  const fehlendeAngaben: string[] = [];
  const anlageV = leseAnlageV(inv);
  const betrachtungsjahr = input.betrachtungsjahr ?? new Date().getFullYear();

  // Einnahmen: Monatswerte mal vermietete Monate des Betrachtungsjahres.
  // Ohne erfasste erste Mieteinnahme werden 12 Monate angenommen und das als
  // Annahme gekennzeichnet (Hinweis in der Oberflaeche).
  const monateInfo = vermieteteMonate(inv.meta?.erste_miete, betrachtungsjahr);
  const monate = monateInfo.monate;
  const mietEinnahmenJahr = (inv.mieteinnahmen_kalt || 0) * monate;

  // Umlagen (Nebenkosten-Vorauszahlungen des Mieters) sind steuerlich
  // Einnahmen. Ohne Angabe wird der Posten nicht angesetzt (kein Schaetzwert).
  const umlagenErfasst = anlageV.umlagenMonat != null;
  const umlagenJahr = umlagenErfasst ? anlageV.umlagenMonat! * monate : 0;
  if (!umlagenErfasst) {
    fehlendeAngaben.push("Vereinnahmte Umlagen fehlen (Nebenkosten-Vorauszahlungen des Mieters eintragen), Einnahme nicht angesetzt");
  }

  const restschuld = inv.offene_tilgung || inv.darlehenssumme || 0;
  const schuldzinsen = schuldzinsenJahr(restschuld, inv.zinssatz || 0);

  // AfA-Bemessungsgrundlage nach § 7 EStG: Anschaffungskosten sind Kaufpreis PLUS
  // Kaufnebenkosten (Grunderwerbsteuer, Notar, Makler). Es fliessen nur ERFASSTE
  // Nebenkosten ein, ein Pauschalansatz (frueher 10,5 %) findet nicht mehr statt.
  const kaufpreis = Number(inv.kaufpreis || 0);
  const nebenkostenErfasst = Number(inv.nebenkosten || 0) > 0;
  const nebenkosten = nebenkostenErfasst ? Number(inv.nebenkosten) : 0;
  if (!nebenkostenErfasst && kaufpreis > 0) {
    fehlendeAngaben.push("Kaufnebenkosten nicht erfasst, die AfA-Grundlage enthält nur den Kaufpreis");
  }
  const anschaffungskosten = kaufpreis + nebenkosten;

  // Gebaeudeanteil: bevorzugt die direkte Angabe aus den Steuerangaben
  // (Kaufpreisaufteilung), sonst 100 minus Bodenwert-Anteil aus dem Cockpit.
  // Ohne beides wird KEINE AfA gerechnet (frueher 80-%-Pauschale).
  const bodenP = input.bodenwertAnteil;
  const gebaeudeAnteilP = anlageV.gebaeudeAnteilProzent != null
    ? anlageV.gebaeudeAnteilProzent
    : (bodenP != null && isFinite(Number(bodenP)) ? 100 - Number(bodenP) : null);
  const gebaeudeAnteilFehlt = gebaeudeAnteilP == null;
  if (gebaeudeAnteilFehlt) {
    fehlendeAngaben.push("Gebäudeanteil fehlt (in den Steuerangaben oder als Bodenwert-Anteil eintragen), AfA nicht berechnet");
  }

  // AfA-Satz: bevorzugt der manuell erfasste Satz, sonst nach Baujahr
  // (§ 7 Abs. 4 EStG). Ohne beides keine AfA (frueher 2-%-Regelsatz).
  const satzManuell = anlageV.afaSatzProzent != null && anlageV.afaSatzProzent > 0;
  const baujahrFehlt = !inv.baujahr;
  const satzFehlt = !satzManuell && baujahrFehlt;
  if (satzFehlt) {
    fehlendeAngaben.push("Baujahr und AfA-Satz fehlen, der Satz nach § 7 Abs. 4 EStG ist nicht bestimmbar, AfA nicht berechnet");
  }
  const afaBerechenbar = !gebaeudeAnteilFehlt && !satzFehlt && anschaffungskosten > 0;
  const gesetzlich = baujahrFehlt ? null : linearerAfaSatz(inv.baujahr);
  const afaP = satzManuell ? anlageV.afaSatzProzent! : (gesetzlich?.satz ?? 0);
  const afaParagraf = satzManuell ? "AfA-Satz aus den Steuerangaben" : (gesetzlich?.paragraf ?? "");
  const gebaeudeAnteil = afaBerechenbar
    ? Math.max(0, anschaffungskosten * (Number(gebaeudeAnteilP) / 100))
    : 0;

  // § 7 Abs. 1 Satz 4 EStG: im Anschaffungsjahr wird die AfA nur zeitanteilig
  // ab dem Monat der Anschaffung gewaehrt (Kauf im Juli = 6/12).
  let afaMonate = 12;
  const kaufdatum = inv.kaufdatum ? new Date(inv.kaufdatum) : null;
  const kaufdatumGueltig = !!kaufdatum && !Number.isNaN(kaufdatum.getTime());
  if (kaufdatumGueltig && kaufdatum!.getFullYear() === betrachtungsjahr) {
    afaMonate = 12 - kaufdatum!.getMonth();
  }
  const afaJahr = afaBerechenbar ? gebaeudeAnteil * (afaP / 100) * (afaMonate / 12) : 0;

  // Sonder-AfA § 7b EStG: 5 % p.a., aber nur in den ersten vier Jahren und nur
  // innerhalb der Kostengrenzen. Ohne pruefbare Grundlagen wird sie
  // konservativ NICHT angesetzt statt unbegrenzt weiterzulaufen.
  let sonderAfaJahr = 0;
  let sonderAfaHinweis = "";
  let sonder7bJahr = 0;
  if (input.sonderAfA7b) {
    const startJahr = kaufdatumGueltig ? kaufdatum!.getFullYear() : (inv.baujahr || 0);
    if (!afaBerechenbar) {
      sonderAfaHinweis =
        "Sonder-AfA nach § 7b EStG nicht angesetzt: Die AfA-Grundlage ist unvollständig (Gebäudeanteil oder Baujahr fehlt).";
    } else if (!startJahr) {
      sonderAfaHinweis =
        "Sonder-AfA nach § 7b EStG nicht angesetzt: Ohne Kaufdatum oder Baujahr laesst sich der Vierjahreszeitraum nicht pruefen.";
    } else if (betrachtungsjahr - startJahr + 1 > SONDER_7B_JAHRE) {
      sonderAfaHinweis = `Sonder-AfA nach § 7b EStG nicht angesetzt: Der Foerderzeitraum von ${SONDER_7B_JAHRE} Jahren ist abgelaufen.`;
    } else if (betrachtungsjahr < startJahr) {
      sonderAfaHinweis = "Sonder-AfA nach § 7b EStG nicht angesetzt: Anschaffung liegt nach dem Betrachtungsjahr.";
    } else {
      const wohnflaeche = Number(inv.wohnflaeche || inv.meta?.wohnflaeche || 0);
      const erg7b = sonderabschreibung7b(gebaeudeAnteil, wohnflaeche);
      if (erg7b.moeglich) {
        sonderAfaJahr = erg7b.betragProJahr;
        sonder7bJahr = betrachtungsjahr - startJahr + 1;
        if (erg7b.bemessungsgrundlage < gebaeudeAnteil) sonderAfaHinweis = erg7b.hinweis;
      } else {
        sonderAfaHinweis = `Sonder-AfA nach § 7b EStG nicht angesetzt: ${erg7b.hinweis}.`;
      }
    }
  }

  // Hausgeld: Der nicht umlagefaehige Anteil (Verwaltung usw., OHNE die nicht
  // abziehbare Ruecklagenzufuehrung) ist Werbungskosten. Der umlagefaehige
  // Rest (Hausgeld minus nicht umlagefaehiger Anteil) ist ebenfalls
  // Werbungskosten und steht den vereinnahmten Umlagen gegenueber. Beides wird
  // nur gerechnet, wenn der nicht umlagefaehige Anteil aktiv angegeben ist:
  // bevorzugt in Euro je Monat (Steuerangaben), sonst als Prozentsatz aus dem
  // Cockpit. Ohne Angabe bleibt beides auf "Angabe fehlt" (keine Pauschale).
  const hgP = input.hausgeldNichtUmlagefaehig;
  const hgPWert = hgP != null && isFinite(Number(hgP)) ? Number(hgP) : null;
  const hausgeldMonat = inv.hausgeld || 0;
  const hausgeldRelevant = hausgeldMonat > 0;
  const nichtUmlageEuroDirekt = anlageV.hausgeldNichtUmlageMonat != null;
  const nichtUmlageMonat = nichtUmlageEuroDirekt
    ? anlageV.hausgeldNichtUmlageMonat!
    : (hgPWert != null ? hausgeldMonat * (hgPWert / 100) : null);
  const hausgeldAngabeFehlt = nichtUmlageMonat == null;
  const hausgeldAbsetzbar = hausgeldRelevant && nichtUmlageMonat != null ? nichtUmlageMonat * 12 : 0;
  // Durchlaufender Posten: Die umlagefaehigen Kosten werden nur angesetzt,
  // wenn auch die vereinnahmten Umlagen als Einnahme erfasst sind. Sonst
  // wuerde der Verlust einseitig aufgeblaeht.
  const hausgeldUmlagefaehig = hausgeldRelevant && nichtUmlageMonat != null && umlagenErfasst
    ? Math.max(0, (hausgeldMonat - nichtUmlageMonat) * 12)
    : 0;
  if (hausgeldAngabeFehlt && hausgeldRelevant) {
    fehlendeAngaben.push("Verwaltungsanteil des Hausgelds fehlt (Euro je Monat in den Steuerangaben oder Prozentsatz eintragen), Hausgeld-Posten nicht angesetzt");
  }

  // Grundsteuer, Versicherung und Verwaltungskosten sind Werbungskosten,
  // sofern erfasst. Ohne Angabe bleibt der Posten auf "Angabe fehlt".
  const grundsteuerErfasst = anlageV.grundsteuerJahr != null;
  const grundsteuer = grundsteuerErfasst ? anlageV.grundsteuerJahr! : 0;
  if (!grundsteuerErfasst) {
    fehlendeAngaben.push("Grundsteuer fehlt, Posten nicht angesetzt");
  }
  const versicherungErfasst = anlageV.versicherungJahr != null;
  const versicherung = versicherungErfasst ? anlageV.versicherungJahr! : 0;
  if (!versicherungErfasst) {
    fehlendeAngaben.push("Versicherung fehlt, Posten nicht angesetzt");
  }
  const verwaltungErfasst = anlageV.verwaltungskostenJahr != null;
  const verwaltung = verwaltungErfasst ? anlageV.verwaltungskostenJahr! : 0;
  if (!verwaltungErfasst) {
    fehlendeAngaben.push("Verwaltungskosten fehlen, Posten nicht angesetzt");
  }

  const erhaltung = input.erhaltungsaufwandJahr || 0;
  const einnahmenJahr = mietEinnahmenJahr + umlagenJahr;
  const werbungskostenSumme = schuldzinsen + afaJahr + sonderAfaJahr
    + hausgeldAbsetzbar + hausgeldUmlagefaehig
    + grundsteuer + versicherung + verwaltung + erhaltung;

  // Miteigentumsanteil: skaliert Einnahmen und Werbungskosten gleichermassen.
  // Ohne Angabe wird mit 100 % gerechnet (das ganze Objekt), das ist keine
  // Schaetzung, sondern der Normalfall; die Skalierung wird am Ergebnis
  // gekennzeichnet (miteigentumsanteilP).
  const miteigentumsanteilP = anlageV.miteigentumsanteilProzent != null
    ? anlageV.miteigentumsanteilProzent
    : 100;
  const f = Math.max(0, miteigentumsanteilP) / 100;

  const ueberschussVerlust = (einnahmenJahr - werbungskostenSumme) * f;

  // Steuereffekt:
  //  1) zvE vorhanden → Differenzmethode ESt(zvE) - ESt(zvE - Verlust), § 32a EStG
  //  2) nur ein aktiv gesetzter Grenzsteuersatz → flache Rechnung, als Schaetzwert markiert
  //  3) weder noch → KEIN Steuereffekt (kein 42-%-Fallback), Angabe fehlt
  // Vorzeichen: negativ = Ersparnis, positiv = Mehrsteuer.
  // null/undefined heißt: Angabe fehlt. 0 ist eine Angabe (zvE 0 oder Satz 0).
  const zvE = input.zvE != null && isFinite(Number(input.zvE)) && Number(input.zvE) >= 0 ? Number(input.zvE) : null;
  const satzVorhanden = input.grenzsteuersatz != null
    && isFinite(Number(input.grenzsteuersatz))
    && Number(input.grenzsteuersatz) >= 0;
  let steuerEffekt = 0;
  let effektiverSatzP = 0;
  let steuerEffektGeschaetzt = true;
  let steuerEffektFehlt = false;
  if (zvE !== null) {
    const minderung = -ueberschussVerlust; // Verlust > 0, Ueberschuss < 0
    const diff = berechneSteuerersparnis(zvE, minderung, !!input.verheiratet);
    steuerEffekt = -diff.ersparnis;
    effektiverSatzP = Math.abs(diff.effektiverSatzP);
    steuerEffektGeschaetzt = false;
  } else if (satzVorhanden) {
    steuerEffekt = ueberschussVerlust * (Number(input.grenzsteuersatz) / 100);
    effektiverSatzP = Number(input.grenzsteuersatz);
    steuerEffektGeschaetzt = true;
  } else {
    steuerEffektFehlt = true;
    fehlendeAngaben.push("Steuersatz fehlt (Grenzsteuersatz eintragen oder Selbstauskunft ausfüllen), Steuereffekt nicht berechnet");
  }

  const afaAnteiligText = afaMonate < 12 ? `, ${afaMonate}/12 anteilig` : "";
  // Prozente mit Komma, wie in jeder deutschen Aufstellung (vorher „2.33 %“).
  const prozentDe = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  const postenRoh: SteuerPosten[] = [
    { label: `Mieteinnahmen (Kaltmiete × ${monate} Monate) · § 21 EStG`, betrag: mietEinnahmenJahr, typ: "einnahme", schluessel: "miete" },
    umlagenErfasst
      ? { label: `Vereinnahmte Umlagen (× ${monate} Monate) · § 21 EStG`, betrag: umlagenJahr, typ: "einnahme", schluessel: "umlagen" }
      : { label: "Vereinnahmte Umlagen · § 21 EStG: Angabe fehlt", betrag: 0, typ: "einnahme", fehlt: true, schluessel: "umlagen" },
    { label: "Schuldzinsen · § 9 Abs. 1 Nr. 1 EStG", betrag: schuldzinsen, typ: "ausgabe", schluessel: "schuldzinsen" },
    afaBerechenbar
      ? { label: `AfA Gebäude ${prozentDe(afaP)} % von ${Math.round(gebaeudeAnteil).toLocaleString("de-DE")} € · ${satzManuell ? afaParagraf : "§ 7 Abs. 4 EStG"}${afaAnteiligText}`, betrag: afaJahr, typ: "ausgabe", schluessel: "afa" }
      : { label: "AfA Gebäude · § 7 Abs. 4 EStG: Angabe fehlt (Gebäudeanteil, Baujahr oder AfA-Satz)", betrag: 0, typ: "ausgabe", fehlt: true, schluessel: "afa" },
    ...(sonderAfaJahr > 0
      ? [{ label: `Sonder-AfA ${SONDER_7B_SATZ} % · § 7b EStG (Jahr ${sonder7bJahr} von ${SONDER_7B_JAHRE})`, betrag: sonderAfaJahr, typ: "ausgabe" as const, schluessel: "sonderafa" as const }]
      : []),
    ...(hausgeldRelevant
      ? [hausgeldAngabeFehlt
          ? { label: "Hausgeld nicht umlagefähiger Anteil: Angabe fehlt (Rücklagenzuführung ist nicht abziehbar)", betrag: 0, typ: "ausgabe" as const, fehlt: true, schluessel: "hausgeld_nicht_umlage" as const }
          : nichtUmlageEuroDirekt
            ? { label: "Hausgeld nicht umlagefähiger Anteil (ohne Rücklagenzuführung)", betrag: hausgeldAbsetzbar, typ: "ausgabe" as const, schluessel: "hausgeld_nicht_umlage" as const }
            : { label: `Hausgeld Verwaltungsanteil ${prozentDe(Number(hgPWert))} % (ohne Rücklagenzuführung)`, betrag: hausgeldAbsetzbar, typ: "ausgabe" as const, schluessel: "hausgeld_nicht_umlage" as const }]
      : []),
    ...(hausgeldRelevant && !hausgeldAngabeFehlt
      ? [umlagenErfasst
          ? { label: "Umlagefähige Betriebskosten (Hausgeld abzüglich nicht umlagefähiger Anteil)", betrag: hausgeldUmlagefaehig, typ: "ausgabe" as const, schluessel: "hausgeld_umlagefaehig" as const }
          : { label: "Umlagefähige Betriebskosten: nicht angesetzt, weil die vereinnahmten Umlagen fehlen", betrag: 0, typ: "ausgabe" as const, fehlt: true, schluessel: "hausgeld_umlagefaehig" as const }]
      : []),
    grundsteuerErfasst
      ? { label: "Grundsteuer · § 9 Abs. 1 EStG", betrag: grundsteuer, typ: "ausgabe", schluessel: "grundsteuer" }
      : { label: "Grundsteuer: Angabe fehlt", betrag: 0, typ: "ausgabe", fehlt: true, schluessel: "grundsteuer" },
    versicherungErfasst
      ? { label: "Versicherung (Gebäude und Haftpflicht)", betrag: versicherung, typ: "ausgabe", schluessel: "versicherung" }
      : { label: "Versicherung: Angabe fehlt", betrag: 0, typ: "ausgabe", fehlt: true, schluessel: "versicherung" },
    verwaltungErfasst
      ? { label: "Verwaltungskosten (Verwaltervergütung, Kontoführung)", betrag: verwaltung, typ: "ausgabe", schluessel: "verwaltung" }
      : { label: "Verwaltungskosten: Angabe fehlt", betrag: 0, typ: "ausgabe", fehlt: true, schluessel: "verwaltung" },
    { label: "Erhaltungsaufwand (Summe erfasster Belege) · § 9 EStG", betrag: erhaltung, typ: "ausgabe", schluessel: "erhaltung" },
  ];
  // Miteigentumsanteil: alle Posten anteilig, gekennzeichnet ueber miteigentumsanteilP.
  const posten = f === 1
    ? postenRoh
    : postenRoh.map(p => (p.fehlt ? p : { ...p, betrag: p.betrag * f }));

  return {
    einnahmenJahr: einnahmenJahr * f,
    mietEinnahmenJahr: mietEinnahmenJahr * f,
    umlagenJahr: umlagenJahr * f,
    schuldzinsenJahr: schuldzinsen * f,
    afaJahr: afaJahr * f,
    sonderAfaJahr: sonderAfaJahr * f,
    hausgeldAbsetzbarJahr: hausgeldAbsetzbar * f,
    hausgeldUmlagefaehigJahr: hausgeldUmlagefaehig * f,
    grundsteuerJahr: grundsteuer * f,
    versicherungJahr: versicherung * f,
    verwaltungskostenJahr: verwaltung * f,
    erhaltungsaufwandJahr: erhaltung * f,
    werbungskostenSumme: werbungskostenSumme * f,
    ueberschussVerlust, steuerEffekt, posten,
    nebenkosten, nebenkostenErfasst, afaBemessungsgrundlage: gebaeudeAnteil,
    effektiverSatzP, steuerEffektGeschaetzt, steuerEffektFehlt,
    afaSatzP: afaBerechenbar ? afaP : (satzFehlt ? 0 : afaP),
    afaParagraf, afaMonate,
    sonderAfaHinweis,
    vermieteteMonate: monate,
    vermieteteMonateAngenommen: monateInfo.angenommen,
    miteigentumsanteilP,
    fehlendeAngaben,
  };
}

/* ───────── Tilgungsplan ───────── */

export interface TilgungsRow {
  jahr: number;
  zinsen: number;
  tilgung: number;
  sondertilgung: number;
  restschuld: number;
  kumZins: number;
  kumTilgung: number;
}

export function berechneTilgungsplan(
  startRest: number,
  zinsP: number,
  jahresAnnuitaet: number,
  sondertilgungJahr: number = 0,
  maxJahre: number = 40,
): TilgungsRow[] {
  const rows: TilgungsRow[] = [];
  let rest = startRest;
  let kumZ = 0, kumT = 0;
  for (let j = 1; j <= maxJahre && rest > 0.01; j++) {
    const zinsen = rest * (zinsP / 100);
    let tilgung = Math.min(jahresAnnuitaet - zinsen, rest);
    if (tilgung < 0) tilgung = 0;
    const sond = Math.min(sondertilgungJahr, Math.max(0, rest - tilgung));
    rest = Math.max(0, rest - tilgung - sond);
    kumZ += zinsen; kumT += tilgung + sond;
    rows.push({ jahr: j, zinsen, tilgung, sondertilgung: sond, restschuld: rest, kumZins: kumZ, kumTilgung: kumT });
  }
  return rows;
}

/**
 * Jährliche Annuität (Zins plus Tilgung) eines Darlehens.
 *
 * Vorrang hat die eingetragene Monatsrate. Fehlt sie, wird die Annuität aus
 * Darlehen, Zins und anfänglicher Tilgung gebildet, so wie die Bank sie
 * anfangs festlegt. Ohne beides gibt es keine Annuität (0).
 */
export function jahresAnnuitaet(inv: Pick<ExternesInvestment, "monatliche_rate" | "darlehenssumme" | "zinssatz" | "meta">): number {
  const rate = Number(inv.monatliche_rate) || 0;
  if (rate > 0) return rate * 12;
  const darlehen = Number(inv.darlehenssumme) || 0;
  const zins = Number(inv.zinssatz) || 0;
  const tilgung = Number(inv.meta?.anfangstilgung) || 0;
  if (darlehen <= 0 || tilgung <= 0) return 0;
  return darlehen * ((zins + tilgung) / 100);
}

/** Ab wann das Darlehen läuft: Kaufpreisfälligkeit (Auszahlung), sonst Kaufdatum. */
function darlehensBeginn(inv: Pick<ExternesInvestment, "kaufdatum" | "meta">): Date | null {
  const roh = inv.meta?.kaufpreis_faelligkeit || inv.kaufdatum;
  if (!roh) return null;
  const d = new Date(roh);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Die heute offene Restschuld eines Darlehens.
 *
 * Vorher zeigte das Portal bei „Offene Tilgung“ nur das Formularfeld. Blieb es
 * leer, stand dort 0,00 €, obwohl der Tilgungsplan darunter mit der vollen
 * Darlehenssumme rechnete. Jetzt kommt die Zahl aus derselben Rechnung wie
 * der Tilgungsplan (`berechneTilgungsplan`), fortgeschrieben vom Beginn des
 * Darlehens bis zum Stichtag. Innerhalb eines Jahres wird zwischen den beiden
 * Jahreswerten des Plans anteilig nach Monaten verteilt.
 *
 * Reihenfolge:
 * 1. Eine eingetragene Restschuld gilt, auch 0 (abbezahlt).
 * 2. Ohne Darlehen gibt es keine Restschuld (null = Angabe fehlt).
 * 3. Ohne Beginn oder ohne Annuität bleibt es bei der Darlehenssumme, denn
 *    ohne diese Angaben lässt sich nichts fortschreiben.
 */
export function aktuelleRestschuld(
  inv: Pick<ExternesInvestment, "offene_tilgung" | "darlehenssumme" | "zinssatz" | "monatliche_rate" | "kaufdatum" | "meta">,
  stichtag: Date = new Date(),
): number | null {
  if (inv.offene_tilgung != null && Number.isFinite(Number(inv.offene_tilgung))) {
    return Number(inv.offene_tilgung);
  }
  const darlehen = Number(inv.darlehenssumme) || 0;
  if (darlehen <= 0) return null;

  const beginn = darlehensBeginn(inv);
  const annuitaet = jahresAnnuitaet(inv);
  if (!beginn || annuitaet <= 0) return darlehen;

  const monate =
    (stichtag.getFullYear() - beginn.getFullYear()) * 12 +
    (stichtag.getMonth() - beginn.getMonth()) -
    (stichtag.getDate() < beginn.getDate() ? 1 : 0);
  if (monate <= 0) return darlehen;

  const volleJahre = Math.floor(monate / 12);
  const restMonate = monate % 12;
  const sondertilgung = Math.max(0, Number(inv.meta?.sondertilgung_jahr) || 0);
  const plan = berechneTilgungsplan(darlehen, Number(inv.zinssatz) || 0, annuitaet, sondertilgung, volleJahre + 1);
  // Der Plan endet bei Volltilgung, fehlende Jahre bedeuten Restschuld 0.
  const restNach = (jahre: number) => (jahre === 0 ? darlehen : plan[jahre - 1]?.restschuld ?? 0);
  const vorher = restNach(volleJahre);
  const nachher = restNach(volleJahre + 1);
  return Math.max(0, vorher - (vorher - nachher) * (restMonate / 12));
}

/* ───────── Cashflow-Forecast ─────────
 * Szenario-Rechnung: Die Annahmen (Steigerungen, Anschlusszins, Steuersatz)
 * sind fuer den Nutzer sichtbar und einstellbar. Aber auch hier gilt: Ohne
 * Gebaeudeanteil und Baujahr keine AfA im Steuereffekt, ohne Steuersatz kein
 * Steuereffekt, keine Pauschal-Nebenkosten. */

export interface ForecastInput {
  jahre: number;                  // 10 / 20 / 30
  mietsteigerungP: number;        // % p.a.
  hausgeldSteigerungP: number;    // % p.a.
  anschlussZinsAufschlag: number; // % p.a. nach Zinsbindung
  /** Steuersatz in %. 0 oder nicht gesetzt = kein Steuereffekt im Forecast. */
  steuersatz: number;
  /** Bodenwert-Anteil in %. null = Angabe fehlt, dann keine AfA im Steuereffekt. */
  bodenwertAnteil: number | null;
  /** Verwaltungsanteil des Hausgelds in %. null = Angabe fehlt, dann 0. */
  hausgeldNichtUmlagefaehigP: number | null;
  /** Sondertilgung pro Jahr in EUR. Ohne Angabe wird meta.sondertilgung_jahr genutzt. */
  sondertilgungJahr?: number;
}

export interface ForecastRow {
  jahr: number;
  miete: number;
  /** tatsaechlich gezahlte Annuitaet (nach Volltilgung 0) */
  rate: number;
  sondertilgung: number;
  hausgeld: number;
  ruecklagen: number;
  steuerEffekt: number;
  cashflow: number;
  restschuld: number;
}

export function berechneForecast(inv: ExternesInvestment, input: ForecastInput): ForecastRow[] {
  const rows: ForecastRow[] = [];
  let miete = inv.mieteinnahmen_kalt || 0;
  let hausgeld = inv.hausgeld || 0;
  const ruecklagen = inv.ruecklagen || 0;
  // Startwert und Annuitaet wie im Tilgungsplan, damit beide dieselbe
  // Restschuld zeigen.
  let restschuld = aktuelleRestschuld(inv) ?? 0;
  const jahresRate = jahresAnnuitaet(inv);
  let zinsP = inv.zinssatz || 0;
  const zinsbindungBis = inv.meta?.zinsbindung_bis ? new Date(inv.meta.zinsbindung_bis) : null;
  const startJahr = new Date().getFullYear();

  // Gleiche AfA-Regeln wie im Steuer-Cockpit: nur erfasste Nebenkosten, AfA nur
  // mit Gebaeudeanteil UND Baujahr (§ 7 Abs. 4 EStG), sonst 0 statt Pauschale.
  const nebenkosten = Number(inv.nebenkosten || 0) > 0 ? Number(inv.nebenkosten) : 0;
  const afaBerechenbar = input.bodenwertAnteil != null
    && isFinite(Number(input.bodenwertAnteil))
    && !!inv.baujahr;
  const gebaeudeAnteil = afaBerechenbar
    ? Math.max(0, (Number(inv.kaufpreis || 0) + nebenkosten) * (1 - Number(input.bodenwertAnteil) / 100))
    : 0;
  const afaJahr = afaBerechenbar ? gebaeudeAnteil * (afaSatz(inv.baujahr) / 100) : 0;
  const hausgeldVerwP = input.hausgeldNichtUmlagefaehigP != null && isFinite(Number(input.hausgeldNichtUmlagefaehigP))
    ? Number(input.hausgeldNichtUmlagefaehigP)
    : 0;
  const steuersatzP = Number(input.steuersatz) > 0 ? Number(input.steuersatz) : 0;
  const sondertilgungJahr = Math.max(
    0,
    input.sondertilgungJahr ?? (Number(inv.meta?.sondertilgung_jahr) || 0),
  );

  for (let j = 1; j <= input.jahre; j++) {
    const aktJahr = startJahr + j - 1;
    if (zinsbindungBis && aktJahr > zinsbindungBis.getFullYear()) {
      zinsP = (inv.zinssatz || 0) + input.anschlussZinsAufschlag;
    }
    // Gleiche Logik wie im Tilgungsplan: Zinsen auf die Restschuld, Tilgung
    // hoechstens bis zur Restschuld, dazu die Sondertilgung. Nach Volltilgung
    // wird keine Annuitaet mehr gezahlt und abgezogen.
    const zinsenJahr = restschuld * (zinsP / 100);
    const tilgungJahr = Math.min(Math.max(0, jahresRate - zinsenJahr), restschuld);
    const sondertilgung = Math.min(sondertilgungJahr, Math.max(0, restschuld - tilgungJahr));
    const rateGezahlt = restschuld > 0 ? Math.min(jahresRate, zinsenJahr + tilgungJahr) : 0;
    restschuld = Math.max(0, restschuld - tilgungJahr - sondertilgung);

    const mieteJahr = miete * 12;
    const hausgeldJahr = hausgeld * 12;
    const ruecklagenJahr = ruecklagen * 12;

    const ueberschuss = mieteJahr - zinsenJahr - afaJahr - hausgeldJahr * (hausgeldVerwP / 100);
    const steuerEffekt = steuersatzP > 0 ? -ueberschuss * (steuersatzP / 100) : 0; // Verlust → positiv für Kunde

    const cashflow = mieteJahr - rateGezahlt - sondertilgung - hausgeldJahr - ruecklagenJahr + steuerEffekt;

    rows.push({
      jahr: aktJahr,
      miete: mieteJahr, rate: rateGezahlt, sondertilgung, hausgeld: hausgeldJahr,
      ruecklagen: ruecklagenJahr, steuerEffekt, cashflow, restschuld,
    });

    miete *= 1 + input.mietsteigerungP / 100;
    hausgeld *= 1 + input.hausgeldSteigerungP / 100;
  }
  return rows;
}

/* ───────── Reinvest-Trigger ───────── */

export function monateSeitLetztemKauf(inv: ExternesInvestment): number | null {
  const d = inv.kaufdatum || inv.meta?.uebergabe;
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const ms = Date.now() - dt.getTime();
  return Math.floor(ms / (30.44 * 24 * 3600 * 1000));
}
