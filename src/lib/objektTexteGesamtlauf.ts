/**
 * Der Durchgang über alle Objekte: Beschreibung und fünf Standortargumente
 * für jedes sichtbare Objekt, mit einem Klick.
 *
 * WARUM ES IHN GIBT
 *
 * Christian am 23.09.2026: „Alle Objekte durchgehen und bei allen eine
 * Beschreibung und fünf Standortargumente hinterlegen, sodass es bei allen
 * angezeigt wird.“ Der Sammellauf (`objektTexteSammellauf.ts`) hört nach
 * zwanzig Objekten auf, der Sammelmodus des Servers arbeitet in Etappen von
 * drei, vier Objekten je Viertelstunde. Beides kommt an, aber nicht auf einen
 * Klick. Admin und Inhaber haben deshalb ein höheres Kontingent
 * (`supabase/functions/_shared/objekt-texte-kontingent.ts`), und dieser
 * Durchgang nutzt es.
 *
 * WAS ER ANFASST
 *
 * Mehr als der Sammellauf, denn er soll wirklich alles fertig machen:
 *
 *   1. Objekte ohne Stand der Fassung 2, auch solche mit von Hand gepflegten
 *      Texten. Sanierungen und die gemessene Standortanalyse entstehen nur im
 *      Lauf; die Handtexte bleiben dabei unangetastet (`texteInGepflegteFelder`).
 *   2. Objekte, die nur einen Vermerk ohne Ergebnis tragen. Die meisten stammen
 *      aus der Zeit, als eine gemessene Umgebung noch Pflicht war.
 *   3. Objekte, an denen die Beschreibung fehlt oder weniger als fünf
 *      Standortargumente zu sehen sind, sofern ein neuer Lauf daran etwas
 *      ändern kann. Sind die Argumente von Hand gepflegt, kann er das nicht.
 *   4. Seit Fassung 4: fertige Objekte, deren Umgebung sich beim letzten Lauf
 *      nicht messen ließ, weil ein Dienst ausfiel (`umgebung.art: "dienst"`).
 *      Ein neuer Versuch kann das beheben. Lag es an der Adresse, nicht.
 *
 * Für 2 bis 4 geht der Aufruf mit `neuErzeugen`, sonst gäbe die Function den
 * vorhandenen Stand unverändert zurück. Für 1 ohne, damit ein Objekt, das der
 * Server inzwischen gefüllt hat, nicht ein zweites Mal bezahlt wird.
 *
 * NACHEINANDER, MIT PAUSE, UND ANHALTEN AN JEDER GRENZE
 *
 * Wie beim Sammellauf: ein Objekt nach dem anderen, `PAUSE_MS` dazwischen.
 * Stößt ein Aufruf an ein Kontingent, an die Bremse des Gateways oder an ein
 * leeres Guthaben, hält der Durchgang an und nennt, was offen bleibt. Schlagen
 * mehrere Objekte hintereinander fehl, hält er ebenfalls an: Dann liegt es
 * meist nicht am Objekt, und die übrigen liefen gegen denselben Fehler. Der
 * Grund des letzten Fehlschlags steht dann im Satz dazu.
 *
 * FEHLT DIE FUNCTION, HÄLT ER SOFORT AN
 *
 * Am 23.09.2026 endete jedes Objekt als fehlgeschlagen. Ist die Function
 * nicht ausgerollt, liegt es nie am einzelnen Objekt. Erkennt `erzeugeObjektTexte`
 * das (`funktion`), endet der Durchgang beim ersten Objekt mit genau diesem
 * Satz, und das Objekt bleibt offen statt fehlgeschlagen.
 *
 * Die Datei kennt weder Knöpfe noch Zwischenspeicher. Den Lauf über
 * Seitenwechsel hinweg hält `objektTexteGesamtlaufStore.ts`, die Anzeige liegt
 * in `src/components/objekte/ObjektTexteGesamtlauf.tsx`. Geprüft wird in
 * `src/lib/objektTexteGesamtlauf.test.ts`.
 */

import type { ObjektData } from "@/lib/objekteStore";
import {
  ANZAHL_STANDORTARGUMENTE,
  erzeugeObjektTexte,
  hatObjektangaben,
  hatTexte,
  objektTexteAusMeta,
  objektTexteInMeta,
  texteInGepflegteFelder,
  type ErzeugenErgebnis,
  type ObjektTexte,
} from "@/lib/objektTexteKi";
import { vonHandGepflegt } from "../../supabase/functions/_shared/objekt-texte";
import {
  grenzeSatz,
  KONTINGENT_LEITUNG,
  PAUSE_MS,
  type SammellaufEnde,
  type SammellaufObjekt,
  type TexteKontingent,
} from "@/lib/objektTexteSammellauf";

/**
 * Nach so vielen Fehlschlägen in Folge hält der Durchgang an.
 *
 * Ein einzelnes kaputtes Objekt soll ihn nicht stoppen. Fünf hintereinander
 * deuten dagegen auf etwas Übergreifendes, etwa eine nicht ausgerollte
 * Function oder eine abgelaufene Anmeldung.
 */
export const FEHLER_IN_FOLGE_MAX = 5;

// ── Was an einem Objekt zu sehen ist ────────────────────────────────────────

/** Was an Text an einem Objekt steht, ohne den Rückfall auf Investagon-Freitexte. */
export interface TexteBefund {
  /** Der Stand der Fassung 2, auch ein Vermerk ohne Ergebnis. */
  stand: ObjektTexte | undefined;
  /** Steht eine Beschreibung da, von Hand oder erzeugt? */
  beschreibung: boolean;
  /** Wie viele Standortargumente zu sehen sind. */
  argumente: number;
  /** Welche der beiden Felder von Hand geschrieben sind. */
  vonHand: { kurzbeschreibung: boolean; standortargumente: boolean };
}

const alsMeta = (meta: unknown): Record<string, unknown> =>
  meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};

/**
 * Den Stand eines Objekts lesen, in derselben Reihenfolge wie die Anzeige.
 *
 * Wie `anzuzeigendeObjektTexte`: zuerst das gepflegte Feld, sonst der erzeugte
 * Stand. Der Rückfall auf die Investagon-Freitexte zählt hier bewusst nicht.
 * Er ist lang und allgemein, und Standortargumente gibt er gar nicht her; ein
 * Objekt, das nur ihn zeigt, ist nicht fertig.
 */
export function texteBefund(meta: unknown): TexteBefund {
  const m = alsMeta(meta);
  const stand = objektTexteAusMeta(m);
  const feldKurz = typeof m.kurzbeschreibung === "string" ? m.kurzbeschreibung.trim() : "";
  const feldArgumente = (Array.isArray(m.standortargumente) ? m.standortargumente : []).filter(
    (a) => typeof a === "string" && a.trim().length > 0,
  ).length;
  return {
    stand,
    beschreibung: !!feldKurz || !!stand?.kurzbeschreibung,
    argumente: feldArgumente > 0 ? feldArgumente : (stand?.standortargumente.length ?? 0),
    vonHand: vonHandGepflegt(m),
  };
}

/**
 * Ist ein Objekt fertig?
 *
 * Fertig heißt: Beschreibung und fünf Standortargumente sind zu sehen, und sie
 * stammen entweder aus einem Stand der Fassung 2 oder sind beide von Hand
 * gepflegt. Ein Text der Fassung 1 zählt nicht, er wird ohnehin neu erzeugt.
 */
export function texteFertig(objekt: Pick<ObjektData, "meta">): boolean {
  const b = texteBefund(objekt.meta);
  if (!b.beschreibung || b.argumente < ANZAHL_STANDORTARGUMENTE) return false;
  const ausStand = !!b.stand && !b.stand.ohneErgebnis;
  return ausStand || (b.vonHand.kurzbeschreibung && b.vonHand.standortargumente);
}

/** Der ruhige Stand für die Objektübersicht: „Texte: 58 von 91 Objekten fertig“. */
export function zaehleTexteStand(objekte: Array<Pick<ObjektData, "id" | "meta">>): { fertig: number; gesamt: number } {
  let fertig = 0;
  let gesamt = 0;
  for (const objekt of objekte || []) {
    if (!objekt?.id) continue;
    gesamt += 1;
    if (texteFertig(objekt)) fertig += 1;
  }
  return { fertig, gesamt };
}

// ── Welche Objekte der Durchgang anfasst ────────────────────────────────────

/** Warum ein Objekt im Durchgang dran ist. */
export type GesamtlaufAnlass = "ohne-stand" | "unvollstaendig" | "vermerk" | "ohne-messung";

export interface GesamtlaufAuftrag {
  objekt: SammellaufObjekt;
  anlass: GesamtlaufAnlass;
  /** Ob die Function einen vorhandenen Stand ersetzen soll. */
  neuErzeugen: boolean;
}

/** Ein Objekt in der Zusammenfassung, mit dem Grund im Klartext. */
export interface GesamtlaufEintrag {
  id: string;
  titel: string;
  grund: string;
}

export interface GesamtlaufAuswahl {
  /** Die Objekte, für die ein Lauf lohnt, in der Reihenfolge der Abarbeitung. */
  auftraege: GesamtlaufAuftrag[];
  /** Schon fertig, kein Lauf nötig. */
  vorhanden: SammellaufObjekt[];
  /** Nicht angefasst, weil ein Lauf nichts ändern würde. */
  uebersprungen: GesamtlaufEintrag[];
}

export const GRUND_OHNE_ANGABEN =
  "Zu diesem Objekt stehen weder Titel noch Adresse, Ort, Beschreibung oder Unterlagen. Bitte zuerst Objektangaben ergänzen.";

function grundHandArgumente(anzahl: number): string {
  const wieviele = anzahl === 1 ? "ein Standortargument" : `${anzahl} Standortargumente`;
  return `Von Hand gepflegt ist nur ${wieviele}. Ein neuer Lauf ändert daran nichts, bitte auf der Objektseite ergänzen.`;
}

const titelVon = (objekt: SammellaufObjekt) => objekt.titel || "Objekt ohne Titel";

/** Zuerst die ganz ohne Text, dann die halb fertigen, dann die Vermerke, zuletzt die ohne Messung. */
const RANG: Record<GesamtlaufAnlass, number> = { "ohne-stand": 0, unvollstaendig: 1, vermerk: 2, "ohne-messung": 3 };

/** Für ein einzelnes Objekt: Auftrag, schon fertig oder übersprungen mit Grund. */
function ordneEin(
  objekt: SammellaufObjekt,
): { art: "auftrag"; auftrag: GesamtlaufAuftrag } | { art: "vorhanden" } | { art: "uebersprungen"; grund: string } {
  const b = texteBefund(objekt.meta);

  let auftrag: GesamtlaufAuftrag | undefined;
  if (!b.stand) {
    auftrag = { objekt, anlass: "ohne-stand", neuErzeugen: false };
  } else if (b.stand.ohneErgebnis) {
    auftrag = { objekt, anlass: "vermerk", neuErzeugen: true };
  } else {
    const argumenteFehlen = b.argumente < ANZAHL_STANDORTARGUMENTE;
    // Eine fehlende Beschreibung kann der Lauf immer füllen: Ein von Hand
    // gepflegtes Feld wäre ja nicht leer. Bei den Argumenten nur dann, wenn
    // sie nicht von Hand stammen.
    if (!b.beschreibung || (argumenteFehlen && !b.vonHand.standortargumente)) {
      auftrag = { objekt, anlass: "unvollstaendig", neuErzeugen: true };
    } else if (argumenteFehlen) {
      return { art: "uebersprungen", grund: grundHandArgumente(b.argumente) };
    } else if (b.stand.umgebung?.gemessen === false && b.stand.umgebung.art !== "adresse") {
      auftrag = { objekt, anlass: "ohne-messung", neuErzeugen: true };
    } else {
      return { art: "vorhanden" };
    }
  }

  if (!hatObjektangaben(objekt)) return { art: "uebersprungen", grund: GRUND_OHNE_ANGABEN };
  return { art: "auftrag", auftrag };
}

/**
 * Die Liste aufteilen, bevor ein einziger Aufruf herausgeht.
 *
 * Objekte ohne Kennung fallen heraus: Ohne sie könnte die Function nichts
 * laden, der Aufruf würde nur ein Kontingent verbrauchen.
 */
export function waehleGesamtlauf(objekte: SammellaufObjekt[]): GesamtlaufAuswahl {
  const auswahl: GesamtlaufAuswahl = { auftraege: [], vorhanden: [], uebersprungen: [] };
  for (const objekt of objekte || []) {
    if (!objekt?.id) continue;
    const einordnung = ordneEin(objekt);
    if (einordnung.art === "auftrag") auswahl.auftraege.push(einordnung.auftrag);
    else if (einordnung.art === "vorhanden") auswahl.vorhanden.push(objekt);
    else auswahl.uebersprungen.push({ id: objekt.id, titel: titelVon(objekt), grund: einordnung.grund });
  }
  // `sort` ist stabil: Innerhalb eines Anlasses bleibt die Reihenfolge der Liste.
  auswahl.auftraege.sort((a, b) => RANG[a.anlass] - RANG[b.anlass]);
  return auswahl;
}

// ── Der Durchgang ───────────────────────────────────────────────────────────

/** Der Stand während des Durchgangs, für die Anzeige. */
export interface GesamtlaufFortschritt {
  /** Wie viele Objekte dieser Durchgang anfasst. */
  gesamt: number;
  /** Das wievielte gerade an der Reihe ist, ab 1. */
  nummer: number;
  titel: string;
  erzeugt: number;
  fehlgeschlagen: number;
}

/** Warum der Durchgang zu Ende ist. „stoerung“: zu viele Fehlschläge in Folge. */
export type GesamtlaufEnde = SammellaufEnde | "stoerung";

export interface GesamtlaufBericht {
  /** Objekte in der übergebenen Liste. */
  gesamt: number;
  /** Davon mit einem Lauf vorgesehen. */
  vorgesehen: number;
  /** Aufrufe, die wirklich herausgegangen sind. */
  angefasst: number;
  /** Objekte mit neu erzeugtem und gespeichertem Text. */
  erzeugt: number;
  /** Schon fertig, vorab oder weil der Server sie inzwischen gefüllt hat. */
  schonVorhanden: number;
  /** Nicht angefasst oder von der Function als ohne Grundlage erkannt. */
  uebersprungen: GesamtlaufEintrag[];
  /** Fehlgeschlagen. Diese nimmt „Nur Fehlgeschlagene erneut versuchen“. */
  fehlgeschlagen: GesamtlaufEintrag[];
  /** Erzeugt, aber noch ohne Beschreibung oder mit weniger als fünf Argumenten. */
  unvollstaendig: GesamtlaufEintrag[];
  /** Nicht mehr drangekommen, wegen Abbruch, Grenze oder Störung. */
  offen: GesamtlaufEintrag[];
  ende: GesamtlaufEnde;
  /** Bei einer Grenze oder Störung der Satz, der erklärt, wie es weitergeht. */
  grenzeText: string;
}

export interface GesamtlaufOptionen {
  /** Der einzelne Lauf. Im Test ersetzt, sonst die Edge Function. */
  erzeuge?: (objektId: string, wie: { neuErzeugen: boolean }) => Promise<ErzeugenErgebnis>;
  /** Wird vor und nach jedem Objekt gerufen. */
  melde?: (fortschritt: GesamtlaufFortschritt) => void;
  /** Gibt true zurück, sobald der Nutzer anhält. */
  abgebrochen?: () => boolean;
  /** Die Pause zwischen zwei Aufrufen. Im Test ohne echtes Warten. */
  warte?: (ms: number) => Promise<void>;
  pauseMs?: number;
  /** Das Kontingent des Aufrufers. Standard ist das der Leitung. */
  kontingent?: TexteKontingent;
  /**
   * Das aktuelle `meta` eines Objekts, etwa aus dem Zwischenspeicher.
   *
   * Ein Durchgang dauert eine halbe Stunde und länger. In der Zeit füllt der
   * Server nach jedem Investagon-Abgleich selbst ein paar Objekte, und jemand
   * kann eine Objektseite öffnen. Vor jedem Objekt wird deshalb noch einmal
   * nachgesehen, ob der Lauf noch nötig ist.
   */
  aktuellesMeta?: (objektId: string) => Record<string, unknown> | null | undefined;
}

const echteWartezeit = (ms: number) => new Promise<void>((fertig) => setTimeout(fertig, ms));

function eintrag(objekt: SammellaufObjekt, grund: string): GesamtlaufEintrag {
  return { id: objekt.id, titel: titelVon(objekt), grund };
}

/**
 * Was nach einem gelungenen Lauf am Objekt zu sehen sein wird.
 *
 * Bildet nach, was die Function schreibt: den Stand und die gepflegten Felder,
 * soweit sie leer sind oder den vorigen automatischen Text tragen. Nur so
 * lässt sich sagen, ob ein von Hand gepflegtes Feld die Lücke offen hält.
 */
function lueckeNachLauf(metaVorher: unknown, texte: ObjektTexte): string {
  const metaNachher = objektTexteInMeta(texteInGepflegteFelder(alsMeta(metaVorher), texte), texte);
  const b = texteBefund(metaNachher);
  if (!b.beschreibung) return "Es kam keine Beschreibung zurück.";
  if (b.argumente >= ANZAHL_STANDORTARGUMENTE) return "";
  if (b.vonHand.standortargumente) return grundHandArgumente(b.argumente);
  return `Nur ${b.argumente} von ${ANZAHL_STANDORTARGUMENTE} Standortargumenten. Meist fehlen dafür Angaben am Objekt, oder die Umgebung ließ sich nicht messen.`;
}

function vorsorglichSatz(kontingent: TexteKontingent, zurueckgestellt: number): string {
  return (
    `Mehr als ${kontingent.stunde} Läufe je Stunde nimmt die Schnittstelle nicht an. ` +
    `${zurueckgestellt} ${zurueckgestellt === 1 ? "Objekt bleibt" : "Objekte bleiben"} für den nächsten Durchgang offen.`
  );
}

/** Der Satz bei zu vielen Fehlschlägen in Folge, mit dem Grund des letzten. */
function stoerungSatz(letzterGrund: string): string {
  return (
    `${FEHLER_IN_FOLGE_MAX} Objekte hintereinander sind fehlgeschlagen. Der Durchgang hält an, damit die übrigen ` +
    "nicht gegen denselben Fehler laufen." +
    (letzterGrund ? ` Zuletzt: ${letzterGrund}` : "") +
    " Versuch es später erneut, am besten zuerst nur mit den Fehlgeschlagenen."
  );
}

/**
 * Den Durchgang ausführen.
 *
 * Angehalten wird zwischen zwei Objekten, nicht mitten in einem: Ein laufender
 * Aufruf schreibt sein Ergebnis noch zu Ende, sonst wäre das Kontingent
 * verbraucht und der Text trotzdem weg.
 */
export async function objektTexteGesamtlauf(
  objekte: SammellaufObjekt[],
  optionen: GesamtlaufOptionen = {},
): Promise<GesamtlaufBericht> {
  const erzeuge =
    optionen.erzeuge ??
    ((id: string, wie: { neuErzeugen: boolean }) => erzeugeObjektTexte(id, { neuErzeugen: wie.neuErzeugen, automatisch: true }));
  const melde = optionen.melde ?? (() => undefined);
  const abgebrochen = optionen.abgebrochen ?? (() => false);
  const warte = optionen.warte ?? echteWartezeit;
  const pauseMs = optionen.pauseMs ?? PAUSE_MS;
  const kontingent = optionen.kontingent ?? KONTINGENT_LEITUNG;

  const auswahl = waehleGesamtlauf(objekte);
  // Nicht mehr, als die Function in einer Stunde annimmt. Bei rund neunzig
  // Objekten greift das nicht, es schützt nur vor einem viel größeren Bestand.
  const zuTun = auswahl.auftraege.slice(0, Math.max(0, kontingent.stunde));
  const zurueckgestellt = auswahl.auftraege.slice(zuTun.length);

  const bericht: GesamtlaufBericht = {
    gesamt: (objekte || []).length,
    vorgesehen: auswahl.auftraege.length,
    angefasst: 0,
    erzeugt: 0,
    schonVorhanden: auswahl.vorhanden.length,
    uebersprungen: [...auswahl.uebersprungen],
    fehlgeschlagen: [],
    unvollstaendig: [],
    offen: [],
    ende: "fertig",
    grenzeText: "",
  };

  const stand = (nummer: number, titel: string): GesamtlaufFortschritt => ({
    gesamt: zuTun.length,
    nummer,
    titel,
    erzeugt: bericht.erzeugt,
    fehlgeschlagen: bericht.fehlgeschlagen.length,
  });
  /** Alles ab dieser Stelle ist nicht mehr drangekommen. */
  const restOffen = (ab: number) => {
    bericht.offen.push(...zuTun.slice(ab).map((a) => eintrag(a.objekt, "Nicht mehr drangekommen.")));
  };

  let fehlerInFolge = 0;

  for (let i = 0; i < zuTun.length; i++) {
    if (abgebrochen()) {
      bericht.ende = "abgebrochen";
      restOffen(i);
      break;
    }

    let auftrag = zuTun[i];
    const titel = titelVon(auftrag.objekt);

    // Inzwischen erledigt? Dann kein Aufruf, er kostete nur Kontingent.
    const frisch = optionen.aktuellesMeta?.(auftrag.objekt.id);
    if (frisch) {
      const neu = ordneEin({ ...auftrag.objekt, meta: frisch });
      if (neu.art === "vorhanden") {
        bericht.schonVorhanden += 1;
        melde(stand(i + 1, titel));
        continue;
      }
      if (neu.art === "uebersprungen") {
        bericht.uebersprungen.push(eintrag(auftrag.objekt, neu.grund));
        melde(stand(i + 1, titel));
        continue;
      }
      auftrag = neu.auftrag;
    }

    if (bericht.angefasst > 0 && pauseMs > 0) {
      await warte(pauseMs);
      // Wer während der Pause anhält, soll nicht noch ein Objekt abwarten.
      if (abgebrochen()) {
        bericht.ende = "abgebrochen";
        restOffen(i);
        break;
      }
    }

    melde(stand(i + 1, titel));
    const ergebnis = await erzeuge(auftrag.objekt.id, { neuErzeugen: auftrag.neuErzeugen });
    bericht.angefasst += 1;

    if (ergebnis.funktion) {
      // Die Function fehlt oder ist veraltet. Kein Objekt kann etwas dafür,
      // deshalb bleibt dieses offen, und der Durchgang endet mit dem Grund.
      bericht.ende = "nicht-ausgerollt";
      bericht.grenzeText = ergebnis.fehler;
      restOffen(i);
      melde(stand(i + 1, titel));
      break;
    }

    if (ergebnis.grenze) {
      // Dieses Objekt hat nichts bekommen, und die nächsten bekämen auch
      // nichts. Es bleibt offen, zusammen mit allen danach.
      bericht.ende = "kontingent";
      bericht.grenzeText = grenzeSatz(ergebnis.grenze, kontingent);
      restOffen(i);
      melde(stand(i + 1, titel));
      break;
    }

    if (ergebnis.fehler) {
      if (ergebnis.status === 422) {
        // Die Function hat die Grundlage verworfen. Kein technischer Fehler,
        // ein erneuter Versuch fände dieselbe Lücke.
        bericht.uebersprungen.push(eintrag(auftrag.objekt, ergebnis.fehler));
        fehlerInFolge = 0;
      } else {
        bericht.fehlgeschlagen.push(eintrag(auftrag.objekt, ergebnis.fehler));
        fehlerInFolge += 1;
      }
    } else if (ergebnis.texte?.ohneErgebnis) {
      bericht.uebersprungen.push(eintrag(auftrag.objekt, ergebnis.texte.ohneErgebnis));
      fehlerInFolge = 0;
    } else if (!hatTexte(ergebnis.texte)) {
      bericht.fehlgeschlagen.push(eintrag(auftrag.objekt, "Es kam kein verwertbarer Text zurück."));
      fehlerInFolge += 1;
    } else if (!ergebnis.neu) {
      // Ohne `neuErzeugen` gibt die Function einen vorhandenen Stand zurück,
      // statt ein Modell zu fragen. Der Server war schneller.
      bericht.schonVorhanden += 1;
      fehlerInFolge = 0;
    } else if (!ergebnis.gespeichert) {
      bericht.fehlgeschlagen.push(
        eintrag(auftrag.objekt, "Der Text ist entstanden, konnte aber nicht am Objekt gespeichert werden. Fehlt die Berechtigung?"),
      );
      fehlerInFolge += 1;
    } else {
      bericht.erzeugt += 1;
      fehlerInFolge = 0;
      // `auftrag.objekt.meta` ist hier schon der frisch gelesene Stand, falls es einen gab.
      const luecke = lueckeNachLauf(auftrag.objekt.meta, ergebnis.texte as ObjektTexte);
      if (luecke) bericht.unvollstaendig.push(eintrag(auftrag.objekt, luecke));
    }

    melde(stand(i + 1, titel));

    if (fehlerInFolge >= FEHLER_IN_FOLGE_MAX && i < zuTun.length - 1) {
      bericht.ende = "stoerung";
      bericht.grenzeText = stoerungSatz(bericht.fehlgeschlagen[bericht.fehlgeschlagen.length - 1]?.grund ?? "");
      restOffen(i + 1);
      break;
    }
  }

  if (zurueckgestellt.length > 0) {
    bericht.offen.push(...zurueckgestellt.map((a) => eintrag(a.objekt, "Über dem stündlichen Kontingent.")));
    if (bericht.ende === "fertig") {
      bericht.ende = "kontingent";
      bericht.grenzeText = vorsorglichSatz(kontingent, zurueckgestellt.length);
    }
  }

  return bericht;
}
