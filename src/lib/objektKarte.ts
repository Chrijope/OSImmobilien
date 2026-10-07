import type { ObjektDaten } from "@/lib/objektDatenPflicht";
import { renditeAusMiete, weNrAnzeige } from "@/lib/objektDatenPflicht";
import { objektartLabel } from "@/lib/objektseiteDaten";
import { hausgeldTeile } from "../../supabase/functions/_shared/einheit-hausgeld";

/**
 * Eine Darstellung für jedes Objekt im Kundenprofil.
 *
 * Die Karte „Objektauswahl“ hatte zwei Gesichter. Hing am Investment eine
 * Wohnung aus dem eigenen Bestand, zeigte sie Bild, Eckdaten und drei graue
 * Kacheln. War das Objekt von Hand eingetragen, zeigte sie stattdessen eine
 * Liste mit Zeilen. Dieselbe Frage, zwei Antworten, und wer beides nebeneinander
 * sah, musste zweimal hinschauen.
 *
 * Dieses Modul führt beide Quellen auf einen Satz Angaben zusammen. Die Karte
 * bekommt danach nur noch fertige Werte und muss nicht mehr wissen, woher sie
 * kommen. Bewusst ohne jeden Zugriff auf einen Zwischenspeicher: Die Karte
 * liest die Quellen, dieses Modul rechnet, und genau das lässt sich prüfen.
 *
 * Fehlt eine Angabe, entsteht kein Eintrag. Eine fehlende Kachel ist besser als
 * eine leere, denn eine leere sieht aus wie ein Fehler.
 */

/** Was die Wohnung aus dem eigenen Bestand über sich weiß. */
export interface ObjektKarteWohnung {
  weNr?: string | null;
  groesse?: number | null;
  zimmer?: number | null;
  mieteGesamt?: number | null;
  vkGesamt?: number | null;
  rendite?: number | null;
  etage?: string | null;
  lage?: string | null;
  hausgeldMonat?: number | null;
  /** Die Teile des Hausgelds, siehe `_shared/einheit-hausgeld.ts`. */
  hausgeldNichtUmlagefaehigEuro?: number | null;
  ruecklageZufuehrungMonat?: number | null;
  investagonRaw?: Record<string, unknown> | null;
  reserviertAm?: string | null;
}

/** Was das Objekt aus dem eigenen Bestand über sich weiß. */
export interface ObjektKarteObjekt {
  titel?: string | null;
  adresse?: string | null;
  plz?: string | null;
  ort?: string | null;
  /** Bereits aufgelöste Bildadresse, die Karte macht das vorher. */
  bildUrl?: string | null;
  /**
   * Nutzungsart, etwa „Denkmal“ oder „Neubau“. Freier Text am Bestandsobjekt.
   *
   * Der Handeintrag hat dafür seit 09/2026 ein eigenes Feld mit drei festen
   * Möglichkeiten, siehe `ObjektDaten.objektart`.
   */
  badge?: string | null;
  globalDaten?: { baujahr?: number | null } | null;
  verkaeuferDaten?: {
    art?: "firma" | "person" | "" | null; vorname?: string | null;
    name?: string | null; strasse?: string | null; plz?: string | null;
    ort?: string | null; email?: string | null; telefon?: string | null;
  } | null;
}

/** Alles, was die Karte über ein Objekt zusammentragen kann. */
export interface ObjektKarteQuelle {
  /** Die am Investment gepflegten Angaben, Regelfall seit 09/2026. */
  investment: Partial<ObjektDaten>;
  /** Die verknüpfte Einheit aus dem eigenen Bestand, falls es eine gibt. */
  wohnung?: ObjektKarteWohnung | null;
  /** Das zugehörige Objekt aus dem eigenen Bestand. */
  objekt?: ObjektKarteObjekt | null;
  /** `investments.meta`, für Zuzahlung, Cashflow und Reservierungsdatum. */
  meta?: Record<string, unknown> | null;
  /** Bereits aufgelöstes Bild am Investment, für den Handeintrag. */
  eigenesBild?: string | null;
  /** Alle Bilder am Investment, schon aufgelöst. Das erste ist das Titelbild. */
  eigeneBilder?: string[] | null;
  /** Titel am Investment, Rückfall für die Überschrift. */
  investmentTitel?: string | null;
  /** Objektname am Kontakt, letzter Rückfall für die Überschrift. */
  kontaktObjekt?: string | null;
  /** Wann das Investment angelegt wurde. */
  erstelltAm?: string | null;
  /** Ist der Vorgang mindestens auf der Stufe Reservierung? */
  reserviert?: boolean;
}

/**
 * Eine graue Kachel: Beschriftung, Wert und ob der Wert gut oder schlecht ist.
 *
 * Übrig sind nur noch die Zahlen aus der Berechnung des Vorgangs, also
 * Zuzahlung und Cashflow. Die sechs Objektkacheln darüber sind weggefallen:
 * Miete, Rendite, Etage und Baujahr standen wortgleich in der Liste darunter,
 * Preis je m² und Hausgeld sind dorthin gewandert.
 */
export interface ObjektKarteKachel {
  name: string;
  wert: string;
  /** Nur für Beträge, die auch negativ sein können, etwa der Cashflow. */
  ton?: "gut" | "schlecht";
}

export interface ObjektKarteDaten {
  /** Bildadresse oder leer. Leer heißt: die Karte zeigt ihr Platzhaltersymbol. */
  bildUrl: string;
  /**
   * Alle Bilder, das erste ist das Titelbild und steht auch in `bildUrl`.
   *
   * Die Karte blättert damit durch. Bleibt die Liste leer, zeigt sie wie
   * bisher nur `bildUrl`, und ohne beides ihr Platzhaltersymbol.
   */
  bilder: string[];
  /** Überschrift im Bild. */
  titel: string;
  /** Zweite Zeile im Bild, Postleitzahl und Ort. */
  ortszeile: string;
  /** Einheit, schon mit „WE“ davor. Leer, wenn keine bekannt ist. */
  einheit: string;
  /** Beschriftung des Kennzeichens oben links. */
  zustand: string;
  /** Zeile darunter, schon fertig beschriftet. Leer, wenn kein Datum vorliegt. */
  zeitpunkt: string;
  /** Kaufpreis, Fläche und Zimmer, nur was vorliegt. Der Kaufpreis steht vorn. */
  /**
   * Preis je Quadratmeter, fertig als Betrag. Leer, solange Kaufpreis oder
   * Wohnfläche fehlt.
   *
   * Steht in der Liste hinter dem Kaufpreis. Vorher gab es ihn nur als graue
   * Kachel, und mit den Kacheln wäre er ersatzlos aus der Karte verschwunden.
   */
  preisJeQm: string;
  /**
   * Bruttorendite, fertig als Prozentwert. Leer, wenn sie sich nicht ergibt.
   *
   * Gerechnet aus Kaufpreis und Kaltmiete, ersatzweise die am Bestandsobjekt
   * gepflegte Rendite. Diesen Rückfall gab es bisher nur in der grauen Kachel.
   */
  rendite: string;
  /**
   * Nutzungsart als Kennzeichen im Bildkopf: Sanierter Bestand, Neubau oder
   * WG und Co-Living.
   *
   * Sie kommt aus beiden Quellen. Beim Bestand ist es der frei getippte Badge
   * am Objekt, beim Handeintrag die am Investment gewählte Objektart. Leer
   * bleibt sie nur bei Vorgängen aus der Zeit vor 09/2026, in denen noch
   * niemand gewählt hat.
   */
  nutzungsart: string;
  /** Die grauen Kacheln, nur die mit Wert. */
  kacheln: ObjektKarteKachel[];
  /** Kommt das Objekt aus dem eigenen Bestand? */
  ausBestand: boolean;
  /** Die zusammengeführten Angaben, für die Übersicht unter der Karte. */
  daten: Partial<ObjektDaten>;
}

const euro = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

/** Erste brauchbare Zahl. 0 und Unsinn heißen „nicht erfasst“. */
function zahl(...werte: unknown[]): number | undefined {
  for (const w of werte) {
    const n = Number(w);
    if (isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Erster nicht leerer Text. */
function text(...werte: unknown[]): string {
  for (const w of werte) {
    const s = String(w ?? "").trim();
    if (s) return s;
  }
  return "";
}

/** Deutsche Zahl ohne unnötige Nachkommastellen. */
function nummer(v: number, stellen = 0): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: stellen, maximumFractionDigits: stellen,
  }).format(v);
}

/** Datum als tt.mm.jjjj, gleiche Regel wie `formatDatum` in `utils`. */
function datum(v: string): string {
  const roh = String(v || "").trim();
  if (!roh) return "";
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(roh)) return roh;
  const d = new Date(roh);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/**
 * Die zusammengeführten Objektdaten, Bestand vor Handeintrag.
 *
 * Der Bestand steht vorn, weil er gepflegt ist: Preis, Fläche und Zuschnitt
 * hängen am Objekt und ändern sich dort zentral. Was der Bestand nicht führt,
 * etwa Grundbuch und Kaufnebenkosten, kommt weiter vom Investment.
 *
 * Bewusst getrennt von `vorhandeneObjektDaten`: Jene Funktion entscheidet, ob
 * ein Vorgang weiterziehen darf, und hängt am Schalter `BESTANDSWOHNUNG_AKTIV`.
 * Hier geht es nur um die Anzeige, und angezeigt wird, was da ist.
 */
export function zusammengefuehrteObjektDaten(quelle: ObjektKarteQuelle): Partial<ObjektDaten> {
  const { investment: inv, wohnung: w, objekt: o } = quelle;
  const vkBestand = o?.verkaeuferDaten || null;
  const vkInv = inv.verkaeufer || {};

  return {
    ...inv,
    strasse: text(o?.adresse, inv.strasse),
    plz: text(o?.plz, inv.plz),
    ort: text(o?.ort, inv.ort),
    weNr: text(w?.weNr, inv.weNr),
    kaufpreis: zahl(w?.vkGesamt, inv.kaufpreis) || 0,
    wohnflaeche: zahl(w?.groesse, inv.wohnflaeche),
    zimmer: zahl(w?.zimmer, inv.zimmer),
    etage: text(w?.etage, inv.etage) || undefined,
    lage: text(w?.lage, inv.lage) || undefined,
    baujahr: zahl(o?.globalDaten?.baujahr, inv.baujahr),
    miete: zahl(w?.mieteGesamt, inv.miete),
    // Gepflegt oder nach der gemeinsamen Regel aus den Teilen gerechnet.
    hausgeld: zahl(hausgeldTeile(w).gesamt, inv.hausgeld),
    hausgeldNichtUmlage: zahl(hausgeldTeile(w).nichtUmlagefaehig, inv.hausgeldNichtUmlage),
    bildUrl: text(o?.bildUrl, quelle.eigenesBild, inv.bildUrl),
    verkaeufer: {
      /*
       * Firma oder Privatperson. Die Wahl gehört zum Namen und muss mit ihm
       * aus derselben Quelle kommen: Nähme sie der Bestand und der Name das
       * Investment, stünde am Ende ein Vorname unter einer Firma.
       */
      ...(text(vkBestand?.name)
        ? { art: vkBestand?.art || "", vorname: vkBestand?.vorname || undefined }
        : { art: vkInv.art || "", vorname: vkInv.vorname }),
      name: text(vkBestand?.name, vkInv.name) || undefined,
      strasse: text(vkBestand?.strasse, vkInv.strasse) || undefined,
      plz: text(vkBestand?.plz, vkInv.plz) || undefined,
      ort: text(vkBestand?.ort, vkInv.ort) || undefined,
      email: text(vkBestand?.email, vkInv.email) || undefined,
      telefon: text(vkBestand?.telefon, vkInv.telefon) || undefined,
      // Das Handelsregister führt der Bestand nicht, es steht nur am Investment.
      handelsregister: vkInv.handelsregister,
    },
  };
}

/**
 * Alles, was die Karte anzeigt, aus welcher Quelle auch immer.
 *
 * Fehlende Angaben erzeugen keinen Eintrag. Die Karte darf deshalb jede
 * Kachel und jede Eckzahl blind ausgeben, ohne selbst zu prüfen.
 */
export function objektKarteDaten(quelle: ObjektKarteQuelle): ObjektKarteDaten {
  const d = zusammengefuehrteObjektDaten(quelle);
  const meta: Record<string, unknown> = quelle.meta || {};
  const ausBestand = !!(quelle.wohnung || quelle.objekt);

  /*
   * Die Rendite wird gerechnet, nicht abgeschrieben.
   *
   * Der Bestand führt zwar eine gepflegte Rendite an der Wohnung, aber sie
   * gehört zum Verkaufspreis der Wohnung und nicht zwingend zu dem, was am
   * Investment steht. Deshalb zuerst aus Kaufpreis und Kaltmiete rechnen und
   * nur zurückfallen, wenn eine der beiden Größen fehlt.
   */
  const rendite = renditeAusMiete(d.kaufpreis, d.miete) ?? zahl(quelle.wohnung?.rendite) ?? null;

  const preisJeQm =
    d.kaufpreis && d.kaufpreis > 0 && d.wohnflaeche ? d.kaufpreis / d.wohnflaeche : 0;

  const kacheln: ObjektKarteKachel[] = [];
  const kachel = (name: string, wert: string, ton?: "gut" | "schlecht") => {
    if (wert) kacheln.push(ton ? { name, wert, ton } : { name, wert });
  };

  /*
   * Hier standen sechs Kacheln: Miete, Rendite, Preis je m², Hausgeld, Etage
   * und Baujahr. Vier davon wiederholten wortgleich, was die Liste unter der
   * Karte ohnehin zeigt, und doppelt gesagt ist nicht deutlicher.
   *
   * Preis je m² und Hausgeld gab es dagegen nur hier. Sie fallen deshalb
   * nicht weg, sondern stehen jetzt in der Liste: der Preis je m² hinter dem
   * Kaufpreis, das Hausgeld in einer eigenen Zeile.
   */

  // Zahlen aus der Berechnung des Vorgangs. Sie hängen am Investment und
  // liegen deshalb in beiden Fällen gleich vor.
  const zuzahlung = Number(meta.zuzahlung);
  if (isFinite(zuzahlung) && meta.zuzahlung != null) {
    kachel("Zuzahlung", euro(zuzahlung));
  }
  for (const [schluessel, name] of [
    ["cashflowVorSteuer", "CF vor Steuer"],
    ["cashflowNachSteuer", "CF nach Steuer"],
  ] as const) {
    const wert = Number(meta[schluessel]);
    if (meta[schluessel] != null && isFinite(wert)) {
      kachel(name, euro(wert), wert >= 0 ? "gut" : "schlecht");
    }
  }

  /*
   * Der Zeitpunkt, ehrlich beschriftet.
   *
   * Vorher stand neben „Reserviert“ immer ein Datum, und fehlte das
   * Reservierungsdatum, sprang die Anzeige auf das Anlagedatum des
   * Investments über. Das las sich wie eine Reservierung, war aber nur der
   * Tag, an dem der Vorgang entstanden ist.
   */
  const reserviertAm = datum(text(meta.reserviertAm, quelle.wohnung?.reserviertAm));
  const angelegtAm = datum(text(quelle.erstelltAm));

  return {
    bildUrl: text(quelle.objekt?.bildUrl, quelle.eigenesBild, d.bildUrl),
    /*
     * Beim Bestandsobjekt gewinnt weiter dessen eigenes Bild: Es wird am
     * Objekt gepflegt und gilt für alle Kunden. Nur der Handeintrag bringt
     * seine Liste mit.
     */
    bilder: quelle.objekt?.bildUrl ? [] : quelle.eigeneBilder || [],
    titel: text(quelle.objekt?.titel, d.strasse, quelle.investmentTitel, quelle.kontaktObjekt),
    ortszeile: [d.plz, d.ort].map((v) => String(v || "").trim()).filter(Boolean).join(" "),
    einheit: weNrAnzeige(d.weNr),
    zustand: quelle.reserviert ? "Reserviert" : "Objekt ausgewählt",
    zeitpunkt: reserviertAm
      ? `reserviert am ${reserviertAm}`
      : angelegtAm ? `angelegt am ${angelegtAm}` : "",
    /*
     * Auf volle Euro gerundet. Der Preis je Quadratmeter ist eine Größen-
     * ordnung zum Vergleichen, keine Rechnungsposition, und die Zeile steht
     * jetzt neben dem Kaufpreis. Zwei Beträge mit Cent nebeneinander liest
     * niemand.
     */
    preisJeQm: preisJeQm > 0 ? `${nummer(Math.round(preisJeQm))} €` : "",
    rendite: rendite != null ? `${rendite.toFixed(2).replace(".", ",")} %` : "",
    /*
     * Liegt beides vor, gewinnt der Bestand.
     *
     * Dieselbe Regel wie bei Preis, Fläche und Adresse eine Ebene höher: Was
     * am Objekt gepflegt wird, ändert sich dort zentral und gilt für alle
     * seine Einheiten. Eine am einzelnen Investment gewählte Art wäre daneben
     * eine Abschrift, die dem Objekt davonläuft. Umgekehrt springt die
     * gewählte Art ein, sobald das Objekt keinen Badge trägt.
     */
    nutzungsart: text(quelle.objekt?.badge, objektartLabel(d.objektart)),
    kacheln,
    ausBestand,
    daten: d,
  };
}
