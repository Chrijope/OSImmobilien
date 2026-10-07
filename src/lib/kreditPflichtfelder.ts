import { kreditArt } from "./finanzierbarkeitUtils";

/**
 * Welche Angaben zu einem Kredit in der Selbstauskunft Pflicht sind.
 *
 * Die eine Stelle für diese Regel (Vorgabe der Finanzierung und Entscheidung
 * Christian vom 28.09.2026). Formular, Weiter-Knopf und Absenden lesen alle
 * von hier, für Person 1 und Person 2 gleich. Ändert die Finanzierung ihre
 * Vorgabe, wird nur die Tabelle unten angepasst.
 *
 *   P  Pflicht: Weiter und Absenden gehen erst, wenn das Feld ausgefüllt ist.
 *   o  freiwillig: das Feld steht da, muss aber nicht ausgefüllt sein.
 *   -  passt nicht zu dieser Kreditart: das Feld wird nicht angezeigt.
 *
 * Die Regel greift beim Ausfüllen, also für neue und gerade laufende
 * Selbstauskünfte, wie beim Jahresbrutto. Schon abgeschickte werden beim
 * Laden nicht erneut geprüft, erst beim nächsten Absenden.
 */
export type KreditFeld =
  | "rate"
  | "restschuld"
  | "restschuldPer"
  | "laufzeitEnde"
  | "bank"
  | "ursprung"
  | "zinssatz"
  | "zinsart"
  | "vertragsbeginn"
  | "zinsbindungBis"
  | "zweck"
  | "sondertilgung"
  | "kreditnehmer"
  | "immobilie";

export type KreditFeldStufe = "P" | "o" | "-";

/** Ein Kredit, wie das Formular ihn speichert (nur die hier gebrauchten Felder). */
export type KreditEintrag = { art?: string; kategorie?: string } & Partial<Record<KreditFeld, string>>;

const P = "P" as const;
const o = "o" as const;
const _ = "-" as const;

/**
 * Was für alle Arten gleich ist: Rate, Restschuld und ihr Stichtag sind immer
 * Pflicht, der Kreditnehmer auch (er erscheint nur, wenn es eine Person 2
 * gibt). Laufzeitende ist Pflicht außer bei Dispo und Kreditkarte.
 */
const grund = (laufzeitEnde: KreditFeldStufe) => ({ rate: P, restschuld: P, restschuldPer: P, laufzeitEnde, kreditnehmer: P });

/** Zinsart und Sondertilgung gibt es nur bei den Immobiliendarlehen. */
const ohneImmoFelder = { zinsart: _, sondertilgung: _ };

/**
 * Die Tabelle Kreditart × Feld. Schlüssel sind die Werte aus `KREDIT_AUSWAHL`.
 * Spalten der Bank-Ergänzung: Bank, Ursprung, Zins, Vertragsbeginn,
 * Zinsbindung bis, Zweck, Gehört zu Immobilie, dazu Zinsart und Sondertilgung.
 */
export const KREDIT_FELDREGELN: Readonly<Record<string, Readonly<Record<KreditFeld, KreditFeldStufe>>>> = {
  immobilienkredit: { ...grund(P), bank: P, ursprung: P, zinssatz: P, vertragsbeginn: P, zinsbindungBis: P, zweck: P, immobilie: P, zinsart: P, sondertilgung: o },
  bauspardarlehen:  { ...grund(P), bank: P, ursprung: P, zinssatz: P, vertragsbeginn: P, zinsbindungBis: _, zweck: P, immobilie: o, zinsart: P, sondertilgung: _ },
  kfz_finanzierung: { ...grund(P), ...ohneImmoFelder, bank: P, ursprung: P, zinssatz: o, vertragsbeginn: P, zinsbindungBis: _, zweck: _, immobilie: _ },
  kfz_leasing:      { ...grund(P), ...ohneImmoFelder, bank: P, ursprung: _, zinssatz: _, vertragsbeginn: P, zinsbindungBis: _, zweck: _, immobilie: _ },
  ratenkredit:      { ...grund(P), ...ohneImmoFelder, bank: P, ursprung: P, zinssatz: o, vertragsbeginn: P, zinsbindungBis: _, zweck: P, immobilie: o },
  dispo:            { ...grund(o), ...ohneImmoFelder, bank: P, ursprung: _, zinssatz: o, vertragsbeginn: _, zinsbindungBis: _, zweck: _, immobilie: _ },
  kreditkarte:      { ...grund(o), ...ohneImmoFelder, bank: P, ursprung: _, zinssatz: o, vertragsbeginn: _, zinsbindungBis: _, zweck: _, immobilie: _ },
  privatdarlehen:   { ...grund(P), ...ohneImmoFelder, bank: o, ursprung: P, zinssatz: o, vertragsbeginn: P, zinsbindungBis: _, zweck: P, immobilie: o },
  studienkredit:    { ...grund(P), ...ohneImmoFelder, bank: P, ursprung: P, zinssatz: o, vertragsbeginn: o, zinsbindungBis: _, zweck: _, immobilie: _ },
  sonstiges:        { ...grund(P), ...ohneImmoFelder, bank: P, ursprung: P, zinssatz: o, vertragsbeginn: P, zinsbindungBis: o, zweck: P, immobilie: o },
};

/** Die Beschriftung je Feld, genau wie im Formular (für Hinweise und Übersetzung). */
export const KREDIT_FELD_LABEL: Readonly<Record<KreditFeld | "kategorie", string>> = {
  kategorie: "Art des Kredits",
  rate: "Monatliche Rate",
  restschuld: "Restschuld",
  restschuldPer: "Restschuld per",
  laufzeitEnde: "Laufzeitende",
  bank: "Bank / Darlehensgeber",
  ursprung: "Ursprungskredit",
  zinssatz: "Zinssatz (%)",
  zinsart: "Zins fest oder variabel",
  vertragsbeginn: "Vertragsbeginn",
  zinsbindungBis: "Zinsbindung bis",
  zweck: "Verwendungszweck",
  sondertilgung: "Sondertilgungsrecht",
  kreditnehmer: "Kreditnehmer",
  immobilie: "Gehört zu Immobilie",
};

/** Auswahlwerte der neuen Felder: gespeichert wird der Schlüssel, angezeigt der Text. */
export const KREDITNEHMER_AUSWAHL = [
  { wert: "person1", label: "Person 1" },
  { wert: "person2", label: "Person 2" },
  { wert: "gemeinsam", label: "Beide gemeinsam" },
] as const;
export const ZINSART_AUSWAHL = [
  { wert: "fest", label: "Fest" },
  { wert: "variabel", label: "Variabel" },
] as const;
export const SONDERTILGUNG_AUSWAHL = [
  { wert: "ja", label: "Ja" },
  { wert: "nein", label: "Nein" },
  { wert: "unbekannt", label: "Unbekannt" },
] as const;

/** Der Anzeigetext zu einem gespeicherten Auswahlwert, für PDF und Kundenakte. */
export function kreditAuswahlText(feld: "kreditnehmer" | "zinsart" | "sondertilgung", wert?: string): string {
  const liste = feld === "kreditnehmer" ? KREDITNEHMER_AUSWAHL : feld === "zinsart" ? ZINSART_AUSWAHL : SONDERTILGUNG_AUSWAHL;
  return (liste as readonly { wert: string; label: string }[]).find((a) => a.wert === wert)?.label ?? "";
}

/**
 * Stufe eines Felds für eine Kreditart. Ohne gewählte Art (Altdaten, oder
 * die Zeile ist gerade erst angelegt) steht alles da und nichts ist Pflicht
 * außer der Art selbst, denn erst sie entscheidet über die Regel.
 */
export function kreditFeldStufe(kategorie: string | undefined, feld: KreditFeld): KreditFeldStufe {
  return KREDIT_FELDREGELN[(kategorie || "").trim()]?.[feld] ?? "o";
}

// ── Verweise auf Immobilien ────────────────────────────────────────────────
//
// Ein Kredit verweist über `immobilie` auf eine Immobilie. Seit Person 2 einen
// eigenen Block Immobilienvermögen hat, gibt es zwei Listen:
//   "0", "1", ...        Immobilie von Person 1 (so wie bisher gespeichert)
//   "p2:0", "p2:1", ...  Immobilie von Person 2
// Damit bleiben alte Verweise gültig, und ein Kredit kann einer Immobilie der
// anderen Person zugeordnet werden (gemeinsame Finanzierung).

const P2_VERWEIS = "p2:";

/** Zerlegt einen Verweis. `null` heißt: kein oder kein lesbarer Verweis. */
export function immobilienVerweis(verweis: string | undefined | null): { person: 1 | 2; index: number } | null {
  const v = (verweis ?? "").trim();
  if (!v) return null;
  const person = v.startsWith(P2_VERWEIS) ? 2 : 1;
  const index = parseInt(person === 2 ? v.slice(P2_VERWEIS.length) : v, 10);
  return Number.isNaN(index) || index < 0 ? null : { person, index };
}

export const immobilienVerweisText = (person: 1 | 2, index: number) => (person === 2 ? `${P2_VERWEIS}${index}` : String(index));

type ImmoTeil = { immobilien?: unknown[] | null };
type SaImmo = ImmoTeil & { person2?: boolean; person2Data?: ImmoTeil | null };

/** Alle gültigen Verweise einer Selbstauskunft, in der Reihenfolge des PDF. */
export function immobilienVerweise(sa: SaImmo): string[] {
  const p1 = (sa.immobilien || []).map((_, i) => immobilienVerweisText(1, i));
  const p2 = sa.person2 ? (sa.person2Data?.immobilien || []).map((_, i) => immobilienVerweisText(2, i)) : [];
  return [...p1, ...p2];
}

/**
 * Die Position einer Immobilie in der gemeinsamen Liste (erst Person 1, dann
 * Person 2), wie PDF und Bankformular sie nummerieren. -1, wenn der Verweis
 * ins Leere zeigt.
 */
export function immobilienPosition(verweis: string | undefined, anzahlP1: number, anzahlP2: number): number {
  const v = immobilienVerweis(verweis);
  if (!v) return -1;
  if (v.person === 1) return v.index < anzahlP1 ? v.index : -1;
  return v.index < anzahlP2 ? anzahlP1 + v.index : -1;
}

/**
 * Nach dem Löschen einer Immobilie: Verweise auf sie fallen weg, spätere
 * Verweise derselben Person rücken um eins nach vorn.
 */
export function verweiseNachLoeschen<K extends { immobilie?: string }>(kredite: K[], person: 1 | 2, geloescht: number): K[] {
  return kredite.map((k) => {
    const v = immobilienVerweis(k.immobilie);
    if (!v || v.person !== person) return k;
    if (v.index === geloescht) return { ...k, immobilie: undefined };
    if (v.index > geloescht) return { ...k, immobilie: immobilienVerweisText(person, v.index - 1) };
    return k;
  });
}

// ── Prüfung ────────────────────────────────────────────────────────────────

const leer = (v: unknown) => typeof v !== "string" || v.trim() === "";

/**
 * Die offenen Pflichtangaben eines Kredits.
 *
 * „Gehört zu Immobilie“ zählt nur, wenn es überhaupt eine Immobilie zur
 * Auswahl gibt. Sonst wäre es ein Feld, das niemand ausfüllen kann; diesen
 * Fall meldet `kreditPruefung` als `immobilieFehlt`. Der Kreditnehmer zählt
 * nur, wenn es eine Person 2 gibt, sonst ist er eindeutig.
 */
export function fehlendeKreditfelder(
  kredit: KreditEintrag,
  gueltigeImmobilien: string[],
  mitPerson2: boolean,
): (KreditFeld | "kategorie")[] {
  if (leer(kredit.kategorie)) return ["kategorie"];
  const fehlt: (KreditFeld | "kategorie")[] = [];
  for (const feld of Object.keys(KREDIT_FELD_LABEL) as (KreditFeld | "kategorie")[]) {
    if (feld === "kategorie" || kreditFeldStufe(kredit.kategorie, feld) !== "P") continue;
    if (feld === "kreditnehmer" && !mitPerson2) continue;
    if (feld === "immobilie") {
      if (gueltigeImmobilien.length > 0 && !gueltigeImmobilien.includes((kredit.immobilie ?? "").trim())) fehlt.push(feld);
    } else if (leer(kredit[feld])) {
      fehlt.push(feld);
    }
  }
  return fehlt;
}

/** Der Fehlerschlüssel eines Kreditfelds im Formular, etwa „kredit_0_bank“ oder „p2_kredit_0_bank“. */
export const kreditFehlerKey = (index: number, feld: KreditFeld | "kategorie", praefix = "") => `${praefix}kredit_${index}_${feld}`;

/** Gehört ein Fehlerschlüssel zu einem Kredit (Person 1 oder 2)? */
export const istKreditFehler = (key: string) => /^(p2_)?kredit_\d+_/.test(key);

/**
 * Prüft alle Kredite einer Person.
 *
 * `fehler` sind die Schlüssel der offenen Felder. `immobilieFehlt` heißt: Ein
 * Kredit verlangt eine zugeordnete Immobilie, unter Vermögenswerte ist aber
 * bei keiner Person eine angelegt.
 */
export function kreditPruefung(
  kredite: KreditEintrag[] | undefined,
  gueltigeImmobilien: string[],
  mitPerson2: boolean,
  praefix = "",
): { fehler: string[]; immobilieFehlt: boolean } {
  const fehler: string[] = [];
  let immobilieFehlt = false;
  (kredite || []).forEach((k, i) => {
    for (const feld of fehlendeKreditfelder(k, gueltigeImmobilien, mitPerson2)) fehler.push(kreditFehlerKey(i, feld, praefix));
    if (gueltigeImmobilien.length === 0 && kreditFeldStufe(k.kategorie, "immobilie") === "P") immobilieFehlt = true;
  });
  return { fehler, immobilieFehlt };
}

/** Beide Personen auf einmal, mit den passenden Präfixen. */
export function kreditPruefungGesamt(sa: SaAusschnitt): { fehler: string[]; immobilieFehlt: boolean } {
  const verweise = immobilienVerweise(sa);
  const mitP2 = !!sa.person2;
  const p1 = kreditPruefung(sa.kredite, verweise, mitP2);
  const p2 = mitP2 ? kreditPruefung(sa.person2Data?.kredite, verweise, mitP2, "p2_") : { fehler: [], immobilieFehlt: false };
  return { fehler: [...p1.fehler, ...p2.fehler], immobilieFehlt: p1.immobilieFehlt || p2.immobilieFehlt };
}

// ── Gegenprüfung Schritt Vermögenswerte ─────────────────────────────────────

type PersonAusschnitt = {
  kredite?: KreditEintrag[];
  vermoegenswerte?: { art?: string }[];
  immobilien?: unknown[] | null;
  immobilienSchuldenfrei?: boolean;
};
type SaAusschnitt = PersonAusschnitt & { person2?: boolean; person2Data?: PersonAusschnitt | null };

const istImmobiliendarlehen = (k: KreditEintrag) => kreditArt(k.art, k.kategorie) === "hypothek";

/**
 * Welche Personen haben eine Immobilie im Bestand, aber keinen
 * Immobilienkredit, und haben noch nicht „schuldenfrei“ geantwortet?
 *
 * Je Person gerechnet. Als abgedeckt gilt eine Person auch, wenn ein Kredit
 * der anderen Person einer ihrer Immobilien zugeordnet ist (gemeinsame
 * Finanzierung, eingetragen bei nur einer Person).
 */
export function immobilieOhneKreditPersonen(sa: SaAusschnitt): (1 | 2)[] {
  const personen: { nr: 1 | 2; teil: PersonAusschnitt; andere: PersonAusschnitt | null | undefined }[] = [
    { nr: 1, teil: sa, andere: sa.person2 ? sa.person2Data : null },
  ];
  if (sa.person2 && sa.person2Data) personen.push({ nr: 2, teil: sa.person2Data, andere: sa });
  return personen
    .filter(({ nr, teil, andere }) => {
      const hatImmobilie = (teil.immobilien || []).length > 0 || (teil.vermoegenswerte || []).some((v) => v.art === "Immobilien");
      if (!hatImmobilie || teil.immobilienSchuldenfrei === true) return false;
      const eigenerKredit = (teil.kredite || []).some(istImmobiliendarlehen);
      const fremderKredit = (andere?.kredite || []).some((k) => immobilienVerweis(k.immobilie)?.person === nr);
      return !eigenerKredit && !fremderKredit;
    })
    .map((p) => p.nr);
}
