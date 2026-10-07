import {
  getInvestmentById, getInvestmentMetaField, getInvestmentsByKontakt,
  setInvestmentMetaFields, updateInvestment,
} from "@/lib/investmentsStore";
import { getWohnungKurz, type WohnungKurz } from "@/lib/objekteStore";
import { objektartInfo, type Objektart } from "@/lib/objektseiteDaten";
import { darfVorruecken } from "@/lib/pipelineStufen";
import { darfAufObjektauswahl } from "@/lib/objektauswahlWaechter";
import { istVerkaeuferArt, type VerkaeuferArt } from "@/lib/verkaeuferName";
import { objektEingetragen } from "../../supabase/functions/_shared/reservierung-voraussetzungen.ts";

/**
 * Objektdaten, ohne die eine Reservierung nicht nachvollziehbar ist.
 *
 * Der Ablauf zwischen Reservierung und Finanzierung läuft heute großenteils
 * außerhalb des Systems. Wer einen Kunden von Hand auf eine dieser Stufen
 * zieht, sagt damit: hier wird eine bestimmte Wohnung gekauft. Welche und zu
 * welchem Preis, stand danach nirgends. Folge: Die Gesamtsumme unter der
 * Pipelinespalte blieb leer, die Kaufpreis-Kachel im Kundenportal unsichtbar
 * und der Portfoliowert bei null.
 *
 * Deshalb dieses Modul. Es hält an einer Stelle fest, welche Angaben zu einer
 * Stufe gehören und wo sie gespeichert werden, damit die drei Aufrufstellen
 * nicht drei verschiedene Regeln bekommen.
 */

/**
 * Zentraler Schalter für den Weg „Wohnung aus dem eigenen Bestand".
 *
 * Stand 09/2026 gibt es keine Wohnungen im eigenen Bestand. Jedes Objekt
 * kommt von Investagon, heute von Hand eingetragen, später automatisch
 * übernommen. Der Bestandsweg war trotzdem gebaut und machte den Ablauf
 * doppelt: eine Liste freier Wohnungen, die ohnehin leer ist, ein
 * ausgeblendeter Knopf „Objektdaten ändern" und ein fehlendes Bildfeld.
 *
 * Deshalb ist er abgeschaltet und nicht entfernt. Die gesamte Logik bleibt
 * stehen und hängt an diesem einen Wert. Sobald es eigene Objekte gibt,
 * genügt es, ihn auf true zu setzen.
 *
 * Abgeschaltet heißt genau zweierlei: Es wird kein Investment mehr neu mit
 * einer Bestandswohnung verknüpft, und der Bestand ist keine Quelle für die
 * Objektdaten eines Investments mehr. Ein bereits gespeicherter Verweis
 * (`objektId` und `wohnungId` am Investment) bleibt unangetastet und wird in
 * der Objektauswahl weiterhin angezeigt.
 */
export const BESTANDSWOHNUNG_AKTIV = false;

/** Stufen, ab denen feststehen muss, um welche Wohnung es geht. */
const PFLICHT_STUFEN = new Set<string>([
  "reservierung",
  "bonitaetsunterlagen",
  "finanzierung",
]);

/**
 * Wer verkauft. Die Reservierungsvereinbarung verlangt Name und Anschrift als
 * Pflicht, der Notar-Aufnahmebogen zusätzlich Handelsregister, E-Mail und
 * Telefon. Beim eigenen Bestand hängen diese Angaben am Objekt, bei einem von
 * Hand eingetragenen Objekt gibt es dort nichts, woran sie hängen könnten.
 * Deshalb liegen sie am Investment.
 */
export interface ObjektVerkaeufer {
  /**
   * Firma oder Privatperson. Leer bei allen Einträgen aus der Zeit davor, bis
   * jemand wählt. Was daran hängt, steht in `verkaeuferName.ts`.
   */
  art?: VerkaeuferArt | "";
  /** Firmenname bei „Firma“, Nachname bei „Privatperson“. */
  name?: string;
  /** Nur bei „Privatperson“. */
  vorname?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  email?: string;
  telefon?: string;
  /** Handelsregisternummer, Pflichtfeld im Notar-Aufnahmebogen. */
  handelsregister?: string;
}

/**
 * Grundbuch und Teilungserklärung. Alles freiwillig und jederzeit nachtragbar.
 * Wer es hier einträgt, muss es im Notar-Aufnahmebogen nicht mehr tippen.
 */
export interface ObjektGrundbuch {
  amtsgericht?: string;
  gemarkung?: string;
  blatt?: string;
  flurstueck?: string;
  /** In Prozent. Die Anlage V setzt sonst stillschweigend 100 Prozent an. */
  miteigentumsanteil?: number;
  /** Wohnungsnummer laut Teilungserklärung, nicht immer die Wohneinheit. */
  wohnungsnummer?: string;
}

export interface ObjektDaten {
  strasse: string;
  plz: string;
  ort: string;
  /** Wohnungsnummer oder Bezeichnung der Einheit. */
  weNr: string;
  kaufpreis: number;
  /** Freiwillig. Portal und Steuer-Cockpit lesen das Feld bereits. */
  wohnflaeche?: number;
  /**
   * Freiwillig. Ein Foto der Immobilie, das der Kunde im Portal sieht.
   *
   * Liegt im öffentlichen Bereich "objekt-medien" unter dem Präfix
   * "objektfotos/", genau wie die Bilder der Objekte aus dem eigenen Bestand.
   * Gespeichert wird die fertige Adresse, damit Portal und Kundenprofil sie
   * ohne weiteren Schritt anzeigen können.
   */
  bildUrl?: string;
  /**
   * Alle Bilder der Immobilie, das erste ist das Titelbild.
   *
   * `bildUrl` bleibt daneben bestehen und trägt immer dasselbe erste Bild.
   * Kundenportal, Mails und Exposé lesen weiter nur dieses eine Feld und
   * mussten für die Mehrzahl nicht angefasst werden. Wer die Reihenfolge
   * ändert, ändert damit das Titelbild.
   */
  bilder?: string[];

  /* ── Schritt 2: was die Wohnung ausmacht. Alles freiwillig. ── */
  /**
   * Sanierter Bestand, Neubau oder WG und Co-Living.
   *
   * Die Kennungen stammen aus `OBJEKTARTEN`, damit Objektseite, Exposé,
   * Beratungspräsentation und die Objektauswahl dieselben Begriffe sprechen
   * und eine spätere Investagon-Anbindung genau dieses Feld füllen kann. Zur
   * Wahl stehen im Objektfenster nur die drei aus `OBJEKTARTEN_AUSWAHL`, KfW
   * 40 also nicht.
   *
   * Vor 09/2026 gab es die Angabe nur am Objekt des eigenen Bestands. An
   * einem von Hand eingetragenen Objekt blieb das Kennzeichen an der Karte
   * deshalb dauerhaft leer.
   */
  objektart?: Objektart;
  /** Portal-Kachel „Zimmer“. */
  zimmer?: number;
  /** Portal-Kachel „Etage“. */
  etage?: string;
  /** Portal-Kachel „Lage“. */
  lage?: string;
  /** Ohne Baujahr rechnet das Steuer-Cockpit gar keine Abschreibung. */
  baujahr?: number;
  /** Nur bei Neubau. Ersetzt dann das Baujahr. */
  fertigstellung?: string;
  /** Kaltmiete je Monat. Grundlage für Rendite, Anlage V und Liquidität. */
  miete?: number;
  /** Hausgeld je Monat. */
  hausgeld?: number;

  /* ── Schritt 3: wer verkauft ── */
  verkaeufer?: ObjektVerkaeufer;

  /* ── Schritt 4: später, spätestens zum Notartermin ── */
  grundbuch?: ObjektGrundbuch;
  /** Kaufnebenkosten in Euro, Teil der Abschreibungsgrundlage. */
  nebenkosten?: number;
  /** Grundstücksanteil in Prozent. Ohne ihn wird keine Abschreibung gerechnet. */
  grundstueckAnteil?: number;
  /** Nicht umlagefähiges Hausgeld je Monat, nur dieser Teil ist absetzbar. */
  hausgeldNichtUmlage?: number;
}

/**
 * Bruttorendite in Prozent, aus Kaltmiete mal zwölf durch Kaufpreis.
 *
 * Bewusst kein Eingabefeld: Eine getippte Rendite wäre eine zweite Wahrheit,
 * die veraltet, sobald jemand Preis oder Miete korrigiert. Fehlt eine der
 * beiden Größen, gibt es keine Rendite und keinen Schätzwert.
 */
export function renditeAusMiete(kaufpreis?: number | null, mieteMonat?: number | null): number | null {
  const preis = Number(kaufpreis) || 0;
  const miete = Number(mieteMonat) || 0;
  if (preis <= 0 || miete <= 0) return null;
  return (miete * 12) / preis * 100;
}

/** Verlangt diese Stufe die Objektdaten? */
export function stufeBrauchtObjektDaten(stufe?: string | null): boolean {
  return PFLICHT_STUFEN.has(String(stufe || ""));
}

/**
 * Die reservierte Wohnung aus dem eigenen Bestand, falls das Investment eine hat.
 *
 * Diese Quelle fehlte hier lange, und das war der einzige Weg, auf dem zwei
 * Fassungen desselben Objekts entstehen konnten: Bei einer sauber reservierten
 * Bestandswohnung hielt `objektDatenFehlen` die Angaben für leer, der Dialog
 * verlangte eine Adresse, die längst feststand, und wer sie eintippte,
 * überschrieb den Titel des Investments, während die Wohnung unverändert
 * daneben lag.
 *
 * Ein fehlender Zwischenspeicher darf hier nichts umwerfen. Kommt nichts
 * zurück, greifen einfach die übrigen Quellen.
 *
 * Solange `BESTANDSWOHNUNG_AKTIV` aus ist, liefert diese Funktion nichts.
 * Damit fällt der Bestand als Quelle überall zugleich weg, ohne dass eine der
 * Aufrufstellen davon wissen muss.
 */
/**
 * Wie viele Bilder ein Investment tragen darf.
 *
 * Dieselbe Zahl wie in der Investmentkalkulation, entschieden von Christian am
 * 22.09.2026. Für eine Wohnung reicht das, und die Karte im Kundenprofil bleibt
 * durchklickbar, ohne zur Diashow zu werden.
 */
export const MAX_OBJEKT_BILDER = 6;

/**
 * Bringt die Bilder eines Investments in eine verlässliche Liste.
 *
 * Das Feld kommt aus einem JSON-Datensatz und kann alles Mögliche enthalten,
 * auch gar nichts. Ältere Investments kennen nur das einzelne `bildUrl`,
 * deshalb der zweite Parameter: Es rutscht nach vorne, wenn die Liste es noch
 * nicht führt. Doppelte fliegen raus, sonst zeigt das Durchklicken in der
 * Karte zweimal dasselbe Zimmer.
 */
export function bilderListe(roh: unknown, titelbild?: string | null): string[] {
  const liste = Array.isArray(roh) ? roh : [];
  const sauber = liste
    .map((eintrag) => (typeof eintrag === "string" ? eintrag.trim() : ""))
    .filter((eintrag) => eintrag !== "");
  const titel = String(titelbild || "").trim();
  if (titel && !sauber.includes(titel)) sauber.unshift(titel);
  return Array.from(new Set(sauber)).slice(0, MAX_OBJEKT_BILDER);
}

function bestandsWohnung(investmentId: string): WohnungKurz | null {
  if (!BESTANDSWOHNUNG_AKTIV) return null;
  const inv = getInvestmentById(investmentId);
  if (!inv) return null;
  if (!inv.objektId && !inv.wohnungId) return null;
  return getWohnungKurz(inv.objektId, inv.wohnungId);
}

/**
 * Was am Investment über die Wohnung bekannt ist.
 *
 * Liest die vorhandenen Ablagen, in dieser Reihenfolge: die reservierte
 * Wohnung aus dem eigenen Bestand, die Ad-hoc-Wohnung aus der
 * Reservierungsvereinbarung, den Schnappschuss einer Wohnung und die Felder am
 * Investment selbst. Es wird bewusst nichts Neues angelegt, wo es schon eine
 * Quelle gibt.
 *
 * Der eigene Bestand stünde vorn, weil er gepflegt ist: Preis, Fläche und
 * Zuschnitt hängen am Objekt und ändern sich dort zentral. Alles andere wäre
 * eine Abschrift.
 *
 * Solange `BESTANDSWOHNUNG_AKTIV` aus ist, entfällt dieser Vorrang: `bestand`
 * bleibt leer, und gelesen werden allein die Felder am Investment. Das ist
 * heute die einzige Quelle, weil jedes Objekt von Hand eingetragen wird und
 * später aus Investagon kommt.
 */
export function vorhandeneObjektDaten(investmentId?: string | null): Partial<ObjektDaten> {
  if (!investmentId) return {};
  const inv = getInvestmentById(investmentId);
  const virt = getInvestmentMetaField<Record<string, any>>(investmentId, "rvVirtualWohnung", {}) || {};
  const schnapp = getInvestmentMetaField<Record<string, any>>(investmentId, "wohnungSnapshot", {}) || {};
  const objSchnapp = getInvestmentMetaField<Record<string, any>>(investmentId, "objektSnapshot", {}) || {};
  const verkaeufer = getInvestmentMetaField<Record<string, any>>(investmentId, "objektVerkaeufer", {}) || {};
  const grundbuch = getInvestmentMetaField<Record<string, any>>(investmentId, "objektGrundbuch", {}) || {};
  const bestand = bestandsWohnung(investmentId);
  const kaufpreisRoh =
    Number(bestand?.vkGesamt) ||
    getInvestmentMetaField<number>(investmentId, "kaufpreis", 0) ||
    Number(virt.kaufpreis) || Number(schnapp.kaufpreis) || Number(schnapp.vkGesamt) || 0;

  /** Freiwillige Zahl: 0 und Unsinn heißen „nicht erfasst“, nicht „null“. */
  const zahl = (...werte: unknown[]): number | undefined => {
    for (const w of werte) {
      const n = Number(w);
      if (isFinite(n) && n > 0) return n;
    }
    return undefined;
  };
  const text = (...werte: unknown[]): string | undefined => {
    for (const w of werte) {
      const s = String(w ?? "").trim();
      if (s) return s;
    }
    return undefined;
  };

  return {
    strasse: bestand?.adresse || virt.objAdresse || objSchnapp.strasse || objSchnapp.adresse || "",
    plz: bestand?.plz || virt.objPlz || objSchnapp.plz || "",
    ort: bestand?.ort || virt.objOrt || objSchnapp.ort || "",
    weNr: bestand?.weNr || virt.weNr || inv?.weNr || schnapp.weNr || "",
    kaufpreis: isFinite(kaufpreisRoh) && kaufpreisRoh > 0 ? kaufpreisRoh : 0,
    wohnflaeche:
      Number(bestand?.groesse) || Number(virt.groesse) || Number(schnapp.groesse) || undefined,
    // Beim eigenen Bestand gewinnt das Bild des Objekts. Es wird dort gepflegt
    // und ändert sich zentral, eine Abschrift am Investment liefe ihm davon.
    bildUrl: bestand?.bildUrl || virt.bildUrl || objSchnapp.bildUrl || "",
    /*
     * Die Liste gibt es erst seit dem 22.09.2026. Ältere Investments haben nur
     * `bildUrl`, deshalb wird daraus eine Liste mit einem Eintrag gemacht.
     * Ohne diesen Rückfall stünde eine gepflegte Wohnung plötzlich ohne Bild
     * da, obwohl eines gespeichert ist.
     */
    bilder: bilderListe(virt.bilder, bestand?.bildUrl || virt.bildUrl || objSchnapp.bildUrl),

    /*
     * Die freiwilligen Angaben aus Schritt 2.
     *
     * Der eigene Bestand steht hier nicht vorn, weil `WohnungKurz` diese
     * Felder gar nicht führt. Für eine Bestandswohnung kommen sie aus dem
     * Exposé und werden dort gepflegt; die Schnappschüsse am Investment sind
     * die Abschrift davon.
     */

    // Nur eine der bekannten Kennungen zählt. Steht im Datensatz etwas
    // anderes, etwa aus einem früheren Import, gilt die Angabe als nicht
    // gepflegt: Ein unbekannter Wert an der Karte sähe aus wie ein Fehler.
    objektart: objektartInfo(virt.objektart)?.id,
    zimmer: zahl(virt.zimmer, schnapp.zimmer),
    etage: text(virt.etage, schnapp.etage),
    lage: text(virt.lage, schnapp.lage),
    baujahr: zahl(
      getInvestmentMetaField<number>(investmentId, "baujahr", 0),
      virt.baujahr, schnapp.baujahr, objSchnapp.baujahr,
    ),
    fertigstellung: text(virt.fertigstellung, objSchnapp.fertigstellung),
    miete: zahl(virt.miete, schnapp.miete, schnapp.mieteGesamt),
    hausgeld: zahl(
      getInvestmentMetaField<number>(investmentId, "hausgeldMonat", 0),
      virt.hausgeld, schnapp.hausgeldMonat, schnapp.hausgeld,
    ),

    verkaeufer: {
      // Ein Altwert oder Unsinn im Datensatz zählt als „noch nicht gewählt“,
      // sonst stünde die Oberfläche auf einer Wahl, die es nicht gibt.
      art: istVerkaeuferArt(verkaeufer.art) ? verkaeufer.art : "",
      name: text(verkaeufer.name),
      vorname: text(verkaeufer.vorname),
      strasse: text(verkaeufer.strasse),
      plz: text(verkaeufer.plz),
      ort: text(verkaeufer.ort),
      email: text(verkaeufer.email),
      telefon: text(verkaeufer.telefon),
      handelsregister: text(verkaeufer.handelsregister),
    },
    grundbuch: {
      amtsgericht: text(grundbuch.amtsgericht),
      gemarkung: text(grundbuch.gemarkung),
      blatt: text(grundbuch.blatt),
      flurstueck: text(grundbuch.flurstueck),
      miteigentumsanteil: zahl(grundbuch.miteigentumsanteil),
      wohnungsnummer: text(grundbuch.wohnungsnummer),
    },
    nebenkosten: zahl(getInvestmentMetaField<number>(investmentId, "nebenkosten", 0)),
    grundstueckAnteil: zahl(getInvestmentMetaField<number>(investmentId, "grundstueckAnteil", 0)),
    hausgeldNichtUmlage: zahl(getInvestmentMetaField<number>(investmentId, "hausgeldNichtUmlage", 0)),
  };
}

/**
 * Hängt am Investment eine Wohnung aus dem eigenen Bestand?
 *
 * Wo das zutrifft, werden die Objektdaten nicht von Hand gepflegt. Sie kommen
 * aus dem Objekt und ändern sich dort. Die Oberfläche blendet den Knopf zum
 * Ändern deshalb aus und verweist stattdessen auf „Einheit wechseln“, sonst
 * entstünden wieder zwei Fassungen nebeneinander.
 *
 * Solange `BESTANDSWOHNUNG_AKTIV` aus ist, ist die Antwort immer nein. Damit
 * gibt es diese Sonderfälle in der Oberfläche nicht mehr: Jedes Objekt wird
 * von Hand gepflegt, also gibt es überall den Knopf und das Bildfeld.
 */
export function hatBestandsWohnung(investmentId?: string | null): boolean {
  if (!investmentId) return false;
  return !!bestandsWohnung(investmentId);
}

/**
 * Fehlt etwas, ohne das die Stufe keinen Sinn ergibt?
 *
 * Bewusst nur die drei Pflichtangaben. Jedes weitere Pflichtfeld erhöht die
 * Wahrscheinlichkeit, dass jemand Fantasiewerte einträgt, nur um weiterzukommen.
 *
 * Die Kennzahlen aus Schritt 2 gehören ausdrücklich nicht dazu, obwohl sie im
 * Fenster Pflicht sind. Diese Frage entscheidet, ob ein Vorgang weiterziehen
 * darf und ob die Liste der freien Wohnungen zurückkommt. Nähme sie die
 * Kennzahlen mit, stünde jeder Altvorgang ohne Etage oder Hausgeld plötzlich
 * wieder als "kein Objekt eingetragen" da. Wer noch offene Kennzahlen sehen
 * will, fragt `kennzahlenLuecken`.
 */
export function objektDatenFehlen(investmentId?: string | null): boolean {
  const d = vorhandeneObjektDaten(investmentId);
  // Die vier Angaben prüft dieselbe Regel wie `send-reservation-signature`
  // (29.09.2026). Ohne `objektId`: Diese Frage gilt allein den Angaben.
  return !objektEingetragen({ strasse: d.strasse, ort: d.ort, weNr: d.weNr, kaufpreis: d.kaufpreis });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Der Verlauf: welches Objekt vorher an diesem Investment stand
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Ein Objekt, das an diesem Investment einmal eingetragen war und ersetzt
 * wurde.
 *
 * Nur die vier Angaben, die das Objekt benennen, dazu Zeitpunkt und Person.
 * Ein vollständiger Abzug wäre eine zweite Ablage neben `rvVirtualWohnung`
 * und liefe ihr davon, sobald dort ein Feld dazukommt.
 */
export interface ObjektVerlaufEintrag {
  strasse: string;
  plz: string;
  ort: string;
  weNr: string;
  kaufpreis: number;
  /** Zeitpunkt des Wechsels, ISO 8601. Das „bis“ der Zeitachse. */
  gewechseltAm: string;
  /**
   * Wann dieses Objekt eingetragen wurde, ISO 8601. Das „von“ der Zeitachse.
   *
   * Fehlt bei allen Einträgen aus der Zeit vor 09/2026: Dieser Zeitpunkt wurde
   * damals nirgends festgehalten, und er lässt sich nachträglich nicht
   * erraten. Die Karte zeigt dann nur das „bis“, statt eine leere Klammer.
   */
  eingetragenAm?: string;
  /** Wer gewechselt hat. Fehlt, wenn die Aufrufstelle es nicht weiß. */
  gewechseltVon?: string;
}

/**
 * Wie viele vorherige Objekte aufbewahrt und angezeigt werden.
 *
 * Drei, nicht eines und nicht unbegrenzt. Der Regelfall ist genau ein
 * Wechsel, aber gerade der zweite und dritte ist der aufschlussreiche: Wer
 * dreimal wechselt, hat ein Problem im Vorgang, und das soll man sehen. Nach
 * oben begrenzt, weil der Verlauf sonst mit jedem Wechsel den Datensatz des
 * Investments verlängert und die Karte zuwachsen lässt.
 */
export const OBJEKT_VERLAUF_MAX = 3;

/** Schlüssel des Verlaufs in `investments.meta`. */
const VERLAUF_SCHLUESSEL = "objektVerlauf";

/** Schlüssel des „von“-Zeitpunkts in `investments.meta`. */
const EINGETRAGEN_SCHLUESSEL = "objektEingetragenAm";

/**
 * Seit wann das aktuell eingetragene Objekt an diesem Investment steht.
 *
 * Das „von“ der Zeitachse. Bis 09/2026 wurde nur der Zeitpunkt des Wechsels
 * gemerkt, also das „bis“. Seitdem schreibt `speichereObjektDaten` diesen
 * Zeitpunkt beim Eintragen und beim Wechsel mit.
 *
 * Bestehende Vorgänge haben ihn nicht, und er wird auch nicht nachträglich
 * gesetzt: Ein bei der nächsten Korrektur erfundener Zeitpunkt würde
 * behaupten, das Objekt sei erst heute ausgewählt worden. Kommt nichts
 * zurück, zeigt die Karte kein „seit“, statt eines zu erfinden.
 */
export function objektEingetragenAm(investmentId?: string | null): string {
  if (!investmentId) return "";
  return String(getInvestmentMetaField<string>(investmentId, EINGETRAGEN_SCHLUESSEL, "") || "").trim();
}

/**
 * Der Verlauf eines Investments, das zuletzt ersetzte Objekt zuerst.
 *
 * Bestehende Investments haben keinen Verlauf. Dann kommt eine leere Liste
 * zurück, und die Karte zeigt den Bereich gar nicht erst. Alles, was nicht wie
 * ein Eintrag aussieht, wird stillschweigend übergangen: Der Datensatz ist
 * frei geformtes JSON, und eine kaputte Zeile darf die Objektauswahl nicht
 * zerlegen.
 */
export function objektVerlauf(investmentId?: string | null): ObjektVerlaufEintrag[] {
  if (!investmentId) return [];
  const roh = getInvestmentMetaField<unknown>(investmentId, VERLAUF_SCHLUESSEL, []);
  if (!Array.isArray(roh)) return [];
  return roh
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      strasse: String(e.strasse ?? ""),
      plz: String(e.plz ?? ""),
      ort: String(e.ort ?? ""),
      weNr: String(e.weNr ?? ""),
      kaufpreis: Number(e.kaufpreis) || 0,
      gewechseltAm: String(e.gewechseltAm ?? ""),
      ...(e.eingetragenAm ? { eingetragenAm: String(e.eingetragenAm) } : {}),
      ...(e.gewechseltVon ? { gewechseltVon: String(e.gewechseltVon) } : {}),
    }))
    .filter((e) => e.strasse || e.ort || e.weNr)
    .slice(0, OBJEKT_VERLAUF_MAX);
}

/**
 * Die Wohneinheit, wie sie angezeigt wird: mit „WE“ davor, aber nie doppelt.
 *
 * Das Feld ist seit 09/2026 eine reine Zahl. Bestehende Vorgänge tragen dort
 * jedoch Text, häufig „WE 14“, denn genau das schlug der Platzhalter im
 * Objektfenster jahrelang vor. Ohne diese Stelle stünde in der Karte
 * „WE WE 14“.
 *
 * Angezeigt wird weiter, was gespeichert ist, auch wenn es keine Zahl ist.
 * Abgeschnitten wird nur ein vorangestelltes „WE“, und auch das nur, wenn
 * dahinter eine Ziffer folgt. Sonst würde aus „Westflügel 3“ ein
 * „stflügel 3“.
 */
export function weNrAnzeige(weNr?: string | number | null): string {
  const roh = String(weNr ?? "").trim();
  if (!roh) return "";
  return `WE ${roh.replace(/^we[\s.:_-]*(?=\d)/i, "")}`;
}

/** Ist die Wohneinheit eine reine Zahl, wie seit 09/2026 verlangt? */
export function weNrIstZahl(weNr?: string | null): boolean {
  return /^\d+$/.test(String(weNr ?? "").trim());
}

/** Adresse und Einheit in einer Zeile, für Rückfrage und Verlauf. */
export function objektBezeichnung(d: {
  strasse?: string | null; plz?: string | null; ort?: string | null; weNr?: string | null;
}): string {
  return [
    String(d.strasse || "").trim(),
    [String(d.plz || "").trim(), String(d.ort || "").trim()].filter(Boolean).join(" "),
    weNrAnzeige(d.weNr),
  ].filter(Boolean).join(", ");
}

/** Vergleichbar machen: Groß- und Kleinschreibung und Leerraum zählen nicht. */
const vergleichbar = (v?: string | null) =>
  String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Steht überhaupt ein Objekt da, das ein Wechsel ersetzen würde? */
const objektBenannt = (d: Partial<ObjektDaten>) =>
  !!(d.strasse?.trim() || d.ort?.trim() || d.weNr?.trim());

/**
 * Ist an diesem Investment schon ein Objekt eingetragen?
 *
 * Bewusst nicht `objektDatenFehlen`: Dort zählt auch der Kaufpreis mit. Ein
 * Altvorgang mit Adresse, aber ohne Preis hätte danach nichts zu ersetzen,
 * obwohl seine Adresse beim Speichern überschrieben wird.
 */
export function objektBereitsEingetragen(investmentId?: string | null): boolean {
  if (!investmentId) return false;
  return objektBenannt(vorhandeneObjektDaten(investmentId));
}

/**
 * Wird durch diese Eingabe ein anderes Objekt eingetragen?
 *
 * Verglichen werden nur die vier Angaben, die das Objekt benennen. Ein
 * korrigierter Kaufpreis oder eine nachgetragene Kaltmiete ist kein Wechsel,
 * sonst käme die Rückfrage bei jeder Kleinigkeit.
 *
 * Eine Angabe, die vorher fehlte, zählt ausdrücklich nicht als Wechsel. Die
 * PLZ ist erst seit 09/2026 Pflicht: Wer sie an einem Altvorgang nachträgt,
 * ergänzt sein Objekt, er tauscht es nicht aus.
 */
export function istAnderesObjekt(
  vorher: Partial<ObjektDaten> | null | undefined,
  nachher: Partial<ObjektDaten>,
): boolean {
  if (!vorher) return false;
  const felder = ["strasse", "plz", "ort", "weNr"] as const;
  return felder.some((feld) => {
    const alt = vergleichbar(vorher[feld]);
    const neu = vergleichbar(nachher[feld]);
    if (!alt || !neu) return false;
    return alt !== neu;
  });
}

/**
 * Liegt schon eine Reservierungsvereinbarung vor?
 *
 * Für die Rückfrage vor einem Objektwechsel. Der Wechsel rührt die
 * Vereinbarung nämlich nicht an: Sie bleibt liegen und nennt weiter das alte
 * Objekt, bis jemand sie neu erstellt. Ohne diesen Hinweis klänge die
 * Rückfrage harmloser, als der Wechsel ist.
 */
export function reservierungStandFuerWechsel(investmentId?: string | null): {
  vorhanden: boolean;
  unterschrieben: boolean;
} {
  if (!investmentId) return { vorhanden: false, unterschrieben: false };
  const pdf = getInvestmentMetaField<string>(investmentId, "rvPdf", "");
  const unterschrieben = !!getInvestmentMetaField<boolean>(investmentId, "rvSigned", false);
  const gesendet = !!getInvestmentMetaField<string>(investmentId, "rvSignatureSentAt", "");
  return { vorhanden: !!pdf || unterschrieben || gesendet, unterschrieben };
}

/**
 * Der fortgeschriebene Verlauf, oder nichts, wenn es nichts zu merken gibt.
 *
 * Gemerkt wird ausschließlich der Wechsel auf ein anderes Objekt. Eine
 * Korrektur am selben Objekt erzeugt keinen Eintrag, sonst stünden nach drei
 * Tippfehlern drei fast gleiche Zeilen in der Karte und das echte Vorgänger-
 * objekt wäre herausgefallen.
 */
function neuerVerlauf(
  investmentId: string,
  vorher: Partial<ObjektDaten>,
  nachher: ObjektDaten,
  gewechseltVon?: string,
): ObjektVerlaufEintrag[] | null {
  if (!objektBenannt(vorher)) return null;
  if (!istAnderesObjekt(vorher, nachher)) return null;
  const seit = objektEingetragenAm(investmentId);
  const eintrag: ObjektVerlaufEintrag = {
    strasse: vorher.strasse || "",
    plz: vorher.plz || "",
    ort: vorher.ort || "",
    weNr: vorher.weNr || "",
    kaufpreis: Number(vorher.kaufpreis) || 0,
    gewechseltAm: new Date().toISOString(),
    ...(seit ? { eingetragenAm: seit } : {}),
    ...(gewechseltVon ? { gewechseltVon } : {}),
  };
  return [eintrag, ...objektVerlauf(investmentId)].slice(0, OBJEKT_VERLAUF_MAX);
}

/**
 * Das eingetragene Objekt in den Verlauf legen und die Karte leer räumen.
 *
 * Für „Einheit wechseln“. Dort wird kein neues Objekt eingetragen, dort wird
 * das bisherige abgeräumt und der Vorgang geht zurück in die Objektauswahl.
 * Bis jetzt geschah dabei zweierlei nicht: Es entstand kein Verlaufseintrag,
 * das alte Objekt verschwand also spurlos. Und `rvVirtualWohnung` blieb
 * stehen, die Karte zeigte danach weiter das alte Objekt als das aktuelle.
 *
 * Gemerkt werden dieselben Angaben wie beim Ändern über das Objektfenster:
 * Adresse, Einheit, Kaufpreis, Zeitpunkt und Person.
 *
 * `objektId` und `wohnungId` sind freiwillig. Sind sie da, wird die Adresse
 * aus dem Bestand gelesen, denn beim Bestandsweg steht am Investment selbst
 * oft nichts. Das geschieht bewusst ohne `BESTANDSWOHNUNG_AKTIV`: Hier wird
 * festgehalten, was tatsächlich da war, und nicht entschieden, ob der Bestand
 * eine gültige Quelle für neue Vorgänge ist.
 *
 * Antwort ist true, wenn etwas zu merken war.
 */
export function objektInVerlaufVerschieben(
  investmentId: string,
  optionen?: { gewechseltVon?: string; objektId?: string | null; wohnungId?: string | null },
): boolean {
  if (!investmentId) return false;
  const patch = objektVerlaufPatch(investmentId, optionen);
  setInvestmentMetaFields(investmentId, patch);

  /*
   * Titel und Einheit hängen nicht in `meta`, sondern am Investment selbst.
   * `vorhandeneObjektDaten` liest `inv.weNr` mit, ein stehen gebliebener Wert
   * ließe das abgeräumte Objekt also weiter als eingetragen gelten.
   */
  updateInvestment(investmentId, { objektTitel: undefined, weNr: undefined });

  return VERLAUF_SCHLUESSEL in patch;
}

/**
 * Was `objektInVerlaufVerschieben` in `meta` schreibt, ohne zu schreiben.
 *
 * Für „Reservierung aufheben“: Dort geht das Abräumen zusammen mit der
 * Vereinbarung und der Stufe in einem einzigen Schreibvorgang hinaus. Getrennt
 * geschrieben zeigte die Objektauswahl dazwischen kurz das alte Objekt
 * (06.10.2026).
 */
export function objektVerlaufPatch(
  investmentId: string,
  optionen?: { gewechseltVon?: string; objektId?: string | null; wohnungId?: string | null },
): Record<string, unknown> {
  const bestand = (optionen?.objektId || optionen?.wohnungId)
    ? getWohnungKurz(optionen.objektId, optionen.wohnungId)
    : null;
  const eigene = vorhandeneObjektDaten(investmentId);
  const seit = objektEingetragenAm(investmentId);

  const eintrag: ObjektVerlaufEintrag = {
    strasse: String(bestand?.adresse || eigene.strasse || "").trim(),
    plz: String(bestand?.plz || eigene.plz || "").trim(),
    ort: String(bestand?.ort || eigene.ort || "").trim(),
    weNr: String(bestand?.weNr || eigene.weNr || "").trim(),
    kaufpreis: Number(bestand?.vkGesamt) || Number(eigene.kaufpreis) || 0,
    gewechseltAm: new Date().toISOString(),
    ...(seit ? { eingetragenAm: seit } : {}),
    ...(optionen?.gewechseltVon ? { gewechseltVon: optionen.gewechseltVon } : {}),
  };

  const etwasDa = !!(eintrag.strasse || eintrag.ort || eintrag.weNr);

  return {
    ...(etwasDa
      ? { [VERLAUF_SCHLUESSEL]: [eintrag, ...objektVerlauf(investmentId)].slice(0, OBJEKT_VERLAUF_MAX) }
      : {}),
    /*
     * Alles abräumen, was das alte Objekt beschreibt.
     *
     * Sonst steht es doppelt da: oben als aktuelles Objekt, weil
     * `objektDatenFehlen` weiter Daten findet, und darunter im Verlauf. Der
     * Verkäufer und das Grundbuch gehören zum alten Objekt und dürfen dem
     * neuen nicht stillschweigend mitgegeben werden.
     *
     * `meta.anlageV` bleibt bewusst stehen. Dort liegen eigene Annahmen des
     * Kunden; die drei objektbezogenen Werte darin schreibt
     * `speichereObjektDaten` beim nächsten Eintrag ohnehin neu.
     */
    kaufpreis: 0,
    // Der „seit“-Zeitpunkt gehört zum abgeräumten Objekt und ist mit ihm in
    // den Verlauf gewandert. Bliebe er stehen, behauptete die Zeitachse beim
    // nächsten Objekt, es stünde schon seit dem alten Datum da.
    [EINGETRAGEN_SCHLUESSEL]: null,
    rvVirtualWohnung: {},
    wohnungSnapshot: null,
    objektSnapshot: null,
    objektVerkaeufer: null,
    objektGrundbuch: null,
    baujahr: null,
    wohnflaeche: null,
    jahresnettomiete: null,
    hausgeldMonat: null,
    nebenkosten: null,
    grundstueckAnteil: null,
    hausgeldNichtUmlage: null,
  };
}

/** Eine fehlende Kennzahl aus Schritt 2, mit dem Grund, warum sie gebraucht wird. */
export interface KennzahlLuecke {
  /** Beschriftung des Feldes, wortgleich mit dem Fenster. */
  feld: string;
  /** Was ohne diese Angabe leer bleibt oder nicht gerechnet wird. */
  wofuer: string;
}

/**
 * Welche Kennzahlen aus Schritt 2 fehlen noch?
 *
 * Schritt 2 ist seit 09/2026 Pflicht. Diese Prüfung sperrt trotzdem nichts,
 * sie zählt nur auf. Der Grund steht in `objektDatenFehlen`: Eine harte Sperre
 * würde jeden Altvorgang treffen, bei dem diese Felder nie ausgefüllt wurden,
 * und die laufen seit Monaten. Erzwungen wird deshalb im Fenster selbst, wo
 * eingetragen wird, und nicht nachträglich an Vorgängen, die längst weiter
 * sind.
 *
 * Baujahr und Fertigstellung bilden ein Paar, von dem eines genügt. Beide
 * beantworten dieselbe Frage, nur für Bestand und Neubau. Als getrennte
 * Pflichtfelder würde die Fertigstellung jeden Bestandsvorgang blockieren,
 * denn dort gibt es sie schlicht nicht. `speichereObjektDaten` zieht aus der
 * Fertigstellung ohnehin die Jahreszahl und legt sie als Baujahr ab, der
 * Abschreibungssatz steht damit in beiden Fällen.
 *
 * Die Rendite fehlt hier bewusst: Sie wird gerechnet, nicht getippt.
 */
export function kennzahlenLuecken(daten: Partial<ObjektDaten>): KennzahlLuecke[] {
  const zahl = (v?: number | null) => Number(v) > 0;
  const text = (v?: string | null) => String(v ?? "").trim() !== "";
  const luecken: KennzahlLuecke[] = [];

  /*
   * Die Nutzungsart steht vorn, weil sie die beiden Jahresfelder darunter
   * lenkt: Beim Neubau zählt die Fertigstellung, beim sanierten Bestand das
   * Baujahr. Wer zuerst wählt, weiß danach, welches der beiden Felder er
   * ausfüllt.
   */
  if (!objektartInfo(daten.objektart)) {
    luecken.push({ feld: "Nutzungsart", wofuer: "Kennzeichen an der Objektkarte" });
  }
  if (!zahl(daten.wohnflaeche)) {
    luecken.push({ feld: "Wohnfläche", wofuer: "Portal-Kachel, Preis je m² und Anlage V" });
  }
  if (!zahl(daten.zimmer)) {
    luecken.push({ feld: "Zimmer", wofuer: "Portal-Kachel Zimmer" });
  }
  if (!zahl(daten.baujahr) && !text(daten.fertigstellung)) {
    luecken.push({ feld: "Baujahr oder Fertigstellung", wofuer: "Abschreibungssatz im Steuer-Cockpit" });
  }
  if (!text(daten.etage)) {
    luecken.push({ feld: "Etage", wofuer: "Portal-Kachel Etage" });
  }
  if (!text(daten.lage)) {
    luecken.push({ feld: "Lage", wofuer: "Portal-Kachel Lage" });
  }
  if (!zahl(daten.miete)) {
    luecken.push({ feld: "Kaltmiete", wofuer: "Rendite, Liquidität und Anlage V" });
  }
  if (!zahl(daten.hausgeld)) {
    luecken.push({ feld: "Hausgeld", wofuer: "Liquidität, Steuer-Cockpit und Anlage V" });
  }
  return luecken;
}

/**
 * Stehen die Kennzahlen eines Investments vollständig?
 *
 * Reine Auskunft für Anzeigen. Wer sperren will, muss sich vorher überlegen,
 * was mit den Altvorgängen geschieht, siehe `kennzahlenLuecken`.
 */
export function kennzahlenVollstaendig(investmentId?: string | null): boolean {
  return kennzahlenLuecken(vorhandeneObjektDaten(investmentId)).length === 0;
}

/** Muss beim Wechsel auf diese Stufe nach den Objektdaten gefragt werden? */
export function objektDialogNoetig(stufe: string | null | undefined, investmentId?: string | null): boolean {
  if (!stufeBrauchtObjektDaten(stufe)) return false;
  // Ohne Investment gibt es keinen Ort für die Daten. Dann lieber durchlassen,
  // als den Wechsel zu blockieren.
  if (!investmentId) return false;
  return objektDatenFehlen(investmentId);
}

/**
 * Objektdaten am Investment ablegen.
 *
 * Geschrieben wird in `rvVirtualWohnung`, dieselbe Ablage, die die
 * Reservierungsvereinbarung benutzt. Das Kundenportal liest sie bereits, es
 * muss dort nichts geändert werden. `meta.kaufpreis` füllt zusätzlich die
 * Spalte `investments.kaufpreis`, aus der Portfoliowert und Pipelinesumme
 * kommen.
 *
 * Steht eine Adresse, ist die Objektauswahl fachlich erledigt, deshalb rückt
 * der Vorgang auf diese Stufe vor. `darfVorruecken` entscheidet das und lässt
 * Endzustände wie „verloren“ ebenso in Ruhe wie einen Vorgang, der schon
 * weiter ist: Wer beim Notar steht, fällt durch eine nachgetragene Adresse
 * nicht auf Objektauswahl zurück.
 *
 * Ein Riegel gegen Mehrfachauslösung wie `tryAutoAdvance` im Kundenprofil
 * braucht es hier nicht. Der Aufruf kommt aus einem Klick und nicht aus dem
 * Rendervorgang, und die Regel ist von sich aus einmalig: Beim zweiten Mal
 * steht der Vorgang bereits auf „Objektauswahl“, und ein Rang rückt nicht vor
 * sich selbst. Nach einem echten Rücksetzen greift sie wieder, was ein
 * gemerkter Riegel verhindert hätte.
 *
 * Wird dabei ein anderes Objekt eingetragen, wandert das bisherige in den
 * Verlauf. Ohne ihn verschwindet es spurlos: Der Datensatz wird überschrieben,
 * und niemand kann später nachsehen, auf welcher Wohnung der Kunde vorher saß.
 * `gewechseltVon` ist freiwillig, weil nicht jede Aufrufstelle den Namen des
 * Bearbeiters zur Hand hat.
 */
export function speichereObjektDaten(
  investmentId: string,
  daten: ObjektDaten,
  optionen?: { gewechseltVon?: string },
): void {
  // Vor dem ersten Schreibvorgang lesen, sonst steht hier schon das neue Objekt.
  const vorher = vorhandeneObjektDaten(investmentId);
  const verlauf = neuerVerlauf(investmentId, vorher, daten, optionen?.gewechseltVon);
  /*
   * Das „von“ der Zeitachse: seit wann dieses Objekt am Investment steht.
   *
   * Neu gesetzt wird es nur, wenn hier tatsächlich ein anderes Objekt
   * entsteht, also beim ersten Eintrag und bei einem Wechsel. Eine Korrektur
   * am selben Objekt lässt es unangetastet, sonst würde ein nachgetragenes
   * Hausgeld behaupten, das Objekt sei erst heute ausgewählt worden.
   *
   * Bei einem Altvorgang bleibt der Zeitpunkt leer und wird auch nicht
   * erfunden. Die Karte zeigt dann kein „seit“.
   */
  const neuesObjekt = objektBenannt(daten) && (!objektBenannt(vorher) || !!verlauf);
  const eingetragenAm = neuesObjekt ? new Date().toISOString() : objektEingetragenAm(investmentId);
  const virt = getInvestmentMetaField<Record<string, any>>(investmentId, "rvVirtualWohnung", {}) || {};
  const vk = daten.verkaeufer || {};
  const gb = daten.grundbuch || {};
  /*
   * Freiwillige Zahlen: erfasst oder ausdrücklich leer.
   *
   * `null` und nicht `undefined`, denn `undefined` verschwindet beim
   * Verpacken in JSON. Der Datensatz wird in der Datenbank zusammengeführt
   * statt ersetzt, ein verschwundener Schlüssel ließe also den alten Wert
   * stehen und eine gelöschte Angabe käme wieder.
   */
  const wert = (v?: number | null) => (Number(v) > 0 ? Number(v) : null);
  const rendite = renditeAusMiete(daten.kaufpreis, daten.miete);
  /*
   * Bei einem Neubau steht statt des Baujahrs die Fertigstellung.
   *
   * Der Abschreibungssatz nach § 7 Abs. 4 EStG hängt am Jahr, nicht daran,
   * wie es heißt. Steckt in der Fertigstellung eine Jahreszahl und ist das
   * Baujahr leer, gilt sie. Sonst bliebe ein sauber ausgefülltes Feld ohne
   * jede Wirkung, und das Steuer-Cockpit rechnete weiter keine Abschreibung.
   */
  const jahrAusFertigstellung = Number(String(daten.fertigstellung || "").match(/\b(19|20)\d{2}\b/)?.[0]) || 0;
  const baujahr = wert(daten.baujahr) ?? wert(jahrAusFertigstellung);

  setInvestmentMetaFields(investmentId, {
    // Nur bei einem echten Wechsel, sonst bliebe der Schlüssel bei jedem
    // Speichern unnötig im Datensatz stehen.
    ...(verlauf ? { [VERLAUF_SCHLUESSEL]: verlauf } : {}),
    // Ebenso: kein leerer Schlüssel im Datensatz, wenn es nichts zu merken gibt.
    ...(eingetragenAm ? { [EINGETRAGEN_SCHLUESSEL]: eingetragenAm } : {}),
    kaufpreis: daten.kaufpreis,
    rvVirtualWohnung: {
      ...virt,
      weNr: daten.weNr,
      objAdresse: daten.strasse,
      objPlz: daten.plz,
      objOrt: daten.ort,
      kaufpreis: daten.kaufpreis,
      ...(daten.wohnflaeche ? { groesse: daten.wohnflaeche } : {}),
      // Ausdrücklich auch leer schreiben: So lässt sich ein Bild wieder
      // entfernen. Mit `daten.bildUrl ? ... : {}` bliebe das alte stehen.
      bildUrl: daten.bildUrl || "",
      // Dasselbe für die Liste. Das erste Bild ist das Titelbild und steht
      // zugleich in `bildUrl`, damit die bisherigen Leser nichts merken.
      bilder: bilderListe(daten.bilder, daten.bildUrl),
      // Schritt 2. Diese Schlüssel gab es hier schon, sie wurden nur nie
      // beschrieben. Deshalb blieben die Kacheln im Kundenportal leer.
      // Ausdrücklich auch leer schreiben, damit eine gelöschte Angabe nicht
      // durch den alten Wert im Datensatz wieder auftaucht.
      objektart: daten.objektart || "",
      zimmer: wert(daten.zimmer),
      etage: daten.etage || "",
      lage: daten.lage || "",
      baujahr,
      fertigstellung: daten.fertigstellung || "",
      miete: wert(daten.miete),
      hausgeld: wert(daten.hausgeld),
      // Gerechnet, nicht getippt, damit keine zweite Wahrheit entsteht.
      rendite: rendite != null ? Number(rendite.toFixed(2)) : null,
    },
    objektVerkaeufer: {
      art: istVerkaeuferArt(vk.art) ? vk.art : "",
      name: vk.name || "",
      vorname: vk.vorname || "",
      strasse: vk.strasse || "",
      plz: vk.plz || "",
      ort: vk.ort || "",
      email: vk.email || "",
      telefon: vk.telefon || "",
      handelsregister: vk.handelsregister || "",
    },
    objektGrundbuch: {
      amtsgericht: gb.amtsgericht || "",
      gemarkung: gb.gemarkung || "",
      blatt: gb.blatt || "",
      flurstueck: gb.flurstueck || "",
      miteigentumsanteil: wert(gb.miteigentumsanteil),
      wohnungsnummer: gb.wohnungsnummer || "",
    },
    /*
     * Dieselben Angaben noch einmal unter den Namen, die Steuer-Cockpit,
     * Portfolio-Leiste und Anlage V bereits lesen.
     *
     * Diese Lesestellen kennen `rvVirtualWohnung` nicht, sie greifen direkt
     * auf die oberste Ebene zu. Die Namen existieren dort seit jeher, es hat
     * sie nur nie jemand geschrieben. Deshalb blieben Abschreibung, Rendite
     * und Anlage V beim Handeintrag dauerhaft leer.
     */
    baujahr,
    wohnflaeche: wert(daten.wohnflaeche),
    jahresnettomiete: daten.miete && daten.miete > 0 ? Number(daten.miete) * 12 : null,
    hausgeldMonat: wert(daten.hausgeld),
    nebenkosten: wert(daten.nebenkosten),
    grundstueckAnteil: wert(daten.grundstueckAnteil),
    hausgeldNichtUmlage: wert(daten.hausgeldNichtUmlage),
    /*
     * Die Anlage V liest ihre Angaben aus `meta.anlageV`, mit den Spalten-
     * namen der Tabelle. Ohne den Miteigentumsanteil rechnet sie
     * stillschweigend mit 100 Prozent und vermerkt das.
     */
    anlageV: {
      ...(getInvestmentMetaField<Record<string, any>>(investmentId, "anlageV", {}) || {}),
      miteigentumsanteil_prozent: wert(gb.miteigentumsanteil),
      hausgeld_nicht_umlage_monat: wert(daten.hausgeldNichtUmlage),
      gebaeude_anteil_prozent:
        Number(daten.grundstueckAnteil) > 0 ? 100 - Number(daten.grundstueckAnteil) : null,
    },
  });

  // Titel und Einheit auch an das Investment selbst, damit Listen und der
  // Kundenordner die Wohnung benennen können und nicht nur "Investment 1".
  const titel = [daten.strasse, [daten.plz, daten.ort].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");
  const inv = getInvestmentById(investmentId);
  /*
   * Vorruecken nur, wenn die Selbstauskunft es hergibt.
   *
   * Der Rangvergleich allein genuegt nicht: Er sagt, dass Objektauswahl weiter
   * vorne liegt, aber nicht, ob der Vorgang dort hingehoert. Bis zum
   * 21.09.2026 sprang ein Investment allein durch das Speichern der
   * Objektdaten dorthin, auch ohne unterschriebene Selbstauskunft. Die
   * Objektdaten werden weiterhin gespeichert, nur die Stufe bleibt stehen.
   */
  const zielStufe =
    darfVorruecken(inv?.pipelineStufe, "objektauswahl") && darfAufObjektauswahl(investmentId)
      ? "objektauswahl"
      : undefined;

  updateInvestment(investmentId, {
    ...(titel ? { objektTitel: titel } : {}),
    ...(daten.weNr ? { weNr: daten.weNr } : {}),
    ...(zielStufe ? { pipelineStufe: zielStufe } : {}),
  });
}

/**
 * Rückt der Vorgang durch das Eintragen der Adresse auf „Objektauswahl“ vor?
 *
 * Nur zur Anzeige gedacht, damit der Dialog vorher sagen kann, was gleich
 * passiert. Die Entscheidung selbst trifft `speichereObjektDaten`.
 */
export function rueckenAufObjektauswahl(investmentId?: string | null): boolean {
  if (!investmentId) return false;
  return darfVorruecken(getInvestmentById(investmentId)?.pipelineStufe, "objektauswahl");
}

/**
 * Kaufpreis eines Investments, für die Summe unter der Pipelinespalte.
 *
 * Bisher wurde dort der Kaufpreis des Kontakts addiert. Ein Kunde mit zwei
 * Immobilien zählte damit zweimal denselben Betrag, weil jede Pipelinekarte
 * für ein Investment steht, der Kontaktwert aber nur einmal existiert.
 */
/**
 * Der Kaufpreis eines Kunden, ueber alle seine Investments.
 *
 * Ein Kontakt kann mehrere Vorgaenge haben, deshalb wird summiert. Der Wert am
 * Kontakt selbst dient nur als Rueckfall: Er wird beim Ziehen auf Reservierung
 * oder Finanzierung gar nicht gesetzt, der Dialog legt alles am Investment ab.
 * Wer nur den Kontaktwert liest, sieht bei genau diesen Kunden eine Null.
 */
export function kontaktKaufpreis(kontaktId: string, kontaktWert?: number): number {
  try {
    const summe = getInvestmentsByKontakt(kontaktId)
      .filter((inv) => !["archiviert", "verloren"].includes(String(inv.pipelineStufe || "")))
      .reduce((s, inv) => s + investmentKaufpreis(inv.id), 0);
    if (summe > 0) return summe;
  } catch {
    /* Zwischenspeicher noch nicht bereit */
  }
  return Number(kontaktWert) || 0;
}

export function investmentKaufpreis(investmentId?: string | null): number {
  if (!investmentId) return 0;
  const d = vorhandeneObjektDaten(investmentId);
  return d.kaufpreis || 0;
}

/**
 * Was die eingetragenen Angaben schon tragen und was noch fehlt.
 *
 * Reine Anzeige, keine Sperre. Der Vorgang läuft mit den fünf Pflichtangaben
 * genauso weiter wie bisher. Die Zahlen sagen nur, wie viel Arbeit später noch
 * anfällt, und machen den Nutzen der freiwilligen Schritte sichtbar, ohne
 * jemanden dazu zu zwingen.
 */
export interface ObjektDatenStand {
  /** Freiwillige Kacheln im Kundenportal, gefüllt von insgesamt. */
  portalGefuellt: number;
  portalGesamt: number;
  /** Pflichtangaben, die die Reservierungsvereinbarung sonst selbst abfragt. */
  reservierungGefuellt: number;
  reservierungGesamt: number;
  /** Objektbezogene Pflichtfelder des Notar-Aufnahmebogens. */
  notarGefuellt: number;
  notarGesamt: number;
}

export function objektDatenStand(investmentId?: string | null): ObjektDatenStand {
  return objektDatenStandAus(vorhandeneObjektDaten(investmentId));
}

/**
 * Derselbe Stand, aber zu bereits gelesenen Angaben.
 *
 * Die Karte im Kundenprofil führt Bestand und Handeintrag zu einem Satz
 * Angaben zusammen, siehe `objektKarte.ts`. Zählte sie danach über
 * `objektDatenStand(investmentId)`, käme wieder nur der Handeintrag heraus und
 * eine sauber gepflegte Bestandswohnung stünde als „nichts erfasst“ da.
 */
export function objektDatenStandAus(d: Partial<ObjektDaten>): ObjektDatenStand {
  const vk = d.verkaeufer || {};
  const gb = d.grundbuch || {};
  const gefuellt = (werte: unknown[]) =>
    werte.filter((w) => (typeof w === "number" ? w > 0 : String(w ?? "").trim() !== "")).length;

  // Die acht Kacheln, die beim Handeintrag heute dauerhaft leer bleiben.
  // Adresse, Einheit und Kaufpreis sind Pflicht und deshalb nicht mitgezählt.
  const portal = [
    d.wohnflaeche, d.zimmer, d.etage, d.lage, d.baujahr, d.miete, d.hausgeld,
    renditeAusMiete(d.kaufpreis, d.miete) ?? 0,
  ];

  // Genau die Felder, die Schritt 2 und Schritt 3 der Reservierungs-
  // vereinbarung als Pflicht verlangen.
  const reservierung = [
    d.weNr, d.strasse, d.plz, d.ort, d.kaufpreis,
    vk.name, vk.strasse, vk.plz, vk.ort,
  ];

  // Die objektbezogenen Pflichtfelder des Notar-Aufnahmebogens. Käufer- und
  // Bankangaben stehen dort woanders und gehören nicht zur Objektauswahl.
  const notar = [
    gb.amtsgericht, gb.gemarkung, gb.blatt, gb.flurstueck,
    d.strasse, d.kaufpreis,
    vk.name, vk.strasse, vk.handelsregister, vk.email, vk.telefon,
  ];

  return {
    portalGefuellt: gefuellt(portal),
    portalGesamt: portal.length,
    reservierungGefuellt: gefuellt(reservierung),
    reservierungGesamt: reservierung.length,
    notarGefuellt: gefuellt(notar),
    notarGesamt: notar.length,
  };
}
