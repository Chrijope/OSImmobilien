/**
 * Die automatisch erzeugten Objekttexte, von der Seite aus gesehen.
 *
 * Erzeugt werden sie in der Edge Function `objekt-texte-ki`, gespeichert
 * werden sie in `objekte.meta.objekttexteKi`. Diese Datei ist die eine Stelle,
 * über die die Oberfläche sie anfasst: anzeigen, erzeugen lassen, von Hand
 * überschreiben.
 *
 * DIE REINE LOGIK LIEGT WOANDERS
 *
 * Form, Prüfung und Auftragstext stehen in
 * `supabase/functions/_shared/objekt-texte.ts`, weil die Edge Function in Deno
 * läuft und nichts aus `src/` lesen kann. Von dort wird hier nur
 * weitergereicht, damit Erzeugung und Anzeige nicht auseinanderlaufen. Dasselbe
 * Muster nutzt schon `src/lib/standortanalyse.ts`.
 *
 * KEIN FREIGABESCHRITT, ENTSCHEIDUNG VOM 22.09.2026
 *
 * Ein erzeugter Text erscheint sofort auf Objektseite, Einheitenseite und im
 * Exposé. Christian kennt das Risiko, dass damit ein ungeprüfter Werbetext
 * beim Kunden landet, und will es so. Deshalb bleiben zwei Dinge fest
 * eingebaut: die Prüfung auf Versprechen und der sichtbare Vermerk, dass der
 * Text automatisch entstanden ist. Beides ist jetzt wichtiger als vorher, weil
 * niemand mehr dazwischenschaut.
 *
 * Was von Hand in `meta.kurzbeschreibung` oder `meta.standortargumente` steht,
 * gewinnt immer. Nur wo nichts steht oder der vorige automatische Text, greift
 * der neue Vorschlag.
 *
 * WO DER TEXT LIEGT, UND WARUM AN ZWEI STELLEN
 *
 * Der vollständige Lauf steht unter `meta.objekttexteKi`, mit Belegen,
 * Quellen, Sanierungen und Beanstandungen. Denselben Wortlaut schreibt die
 * Function zusätzlich in `meta.kurzbeschreibung` und `meta.standortargumente`,
 * wo dort nichts steht oder der vorige automatische Text. Der Grund:
 * Objektseite, Einheitenseite und das öffentliche Exposé lesen seit jeher
 * diese beiden Felder, und die Positivliste des Exposés lässt nur sie hinaus.
 * Ob das Gezeigte von Hand oder automatisch entstanden ist, beantwortet der
 * Vergleich der beiden Stellen.
 *
 * SEIT DEM 23.09.2026
 *
 * Fassung 2 des Stands: Beschreibung bis 1000 Zeichen und die Liste der
 * Sanierungen. Jedes Objekt mit Objektangaben bekommt einen Text, die
 * Umgebung misst die Function vorher selbst. Den Bestand füllt der Server
 * nach jedem Investagon-Abgleich in Etappen nach.
 *
 * Fassung 3 (ebenfalls 23.09.2026): Die Beschreibung entsteht aus den
 * gesamten Objektunterlagen, dazu bis zu drei Marktargumente aus der
 * Marktanalyse, gepflegt in `meta.marktargumente`. Und der Browser erkennt an
 * der mitgeschickten Fassung, ob die Function überhaupt ausgerollt ist
 * (`funktionStandAusFehler`), statt jedes Objekt als fehlgeschlagen zu zählen.
 *
 * Fassung 4 (23.09.2026 spät): Kurzbeschreibung nur zum Objekt und ohne
 * Kennzahlen, Standortargumente nur zum Standort. Ob die Umgebung gemessen
 * wurde, steht im Vermerk `umgebung` und nicht mehr als Beanstandung; die
 * Karte zeigt ihn nur Admin und Inhaber. Eine Kurzbeschreibung, die wortgleich
 * der Investagon-Freitext ist, gilt nicht mehr als von Hand gepflegt
 * (`istInvestagonKopie`).
 */

import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { getObjektById, updateObjektFieldFast, type ObjektData } from "@/lib/objekteStore";
import { objektseiteFelder } from "@/lib/objektseiteDaten";
import {
  ANZAHL_MARKTARGUMENTE,
  ANZAHL_STANDORTARGUMENTE,
  automatischerWortlaut,
  hatTexte,
  istInvestagonKopie,
  letzterFehlerAusMeta,
  MAX_ARGUMENT,
  MAX_KURZBESCHREIBUNG,
  MAX_SANIERUNGEN,
  objektTexteAusMeta,
  objektTexteInMeta,
  OBJEKT_TEXTE_FUNKTION_VERSION,
  OBJEKT_TEXTE_META_SCHLUESSEL,
  OBJEKT_TEXTE_SCHEMA,
  texteInGepflegteFelder,
  type LetzterFehler,
  type ObjektTexte,
  type SanierungsEintrag,
  type StandortArgument,
  type UmgebungStand,
} from "../../supabase/functions/_shared/objekt-texte";
import {
  objektTexteEnAusMeta,
  OBJEKT_TEXTE_EN_META_SCHLUESSEL,
  uebersetzungsQuelle,
  uebersetzungFehlt,
  objektTexteEnOhneGepflegte,
} from "../../supabase/functions/_shared/objekt-texte-en.ts";

export { OBJEKT_TEXTE_EN_META_SCHLUESSEL, objektTexteEnAusMeta };

export {
  ANZAHL_MARKTARGUMENTE,
  ANZAHL_STANDORTARGUMENTE,
  hatTexte,
  letzterFehlerAusMeta,
  MAX_ARGUMENT,
  MAX_KURZBESCHREIBUNG,
  MAX_SANIERUNGEN,
  objektTexteAusMeta,
  objektTexteInMeta,
  OBJEKT_TEXTE_FUNKTION_VERSION,
  OBJEKT_TEXTE_META_SCHLUESSEL,
  OBJEKT_TEXTE_SCHEMA,
  // Die Karte bildet damit nach, was der Serverlauf in die gepflegten Felder schreibt.
  texteInGepflegteFelder,
};
export type { LetzterFehler, ObjektTexte, SanierungsEintrag, StandortArgument, UmgebungStand };

/** Der Vorschlag, der an diesem Objekt liegt. Ohne Lauf gibt es keinen. */
export function objektTexte(objekt: Pick<ObjektData, "meta">): ObjektTexte | undefined {
  return objektTexteAusMeta(objekt.meta);
}

/** Woher der Text stammt, den die Seite gerade zeigt. */
export type TextHerkunft = "gepflegt" | "automatisch" | "investagon" | "keine";

export interface AngezeigteObjektTexte {
  /** Die Kurzbeschreibung, die auf der Seite stehen soll. Leer, wenn es keine gibt. */
  kurzbeschreibung: string;
  kurzbeschreibungHerkunft: TextHerkunft;
  /** Die Standortargumente als einfache Sätze, in der vorgesehenen Reihenfolge. */
  standortargumente: string[];
  standortargumenteHerkunft: TextHerkunft;
  /** Die Marktargumente aus der Marktanalyse, höchstens drei, oft keine. */
  marktargumente: string[];
  marktargumenteHerkunft: TextHerkunft;
  /** True, sobald einer der Blöcke automatisch entstanden ist. */
  automatisch: boolean;
  /** Was die Prüfung am erzeugten Text beanstandet hat. Für interne Anzeigen. */
  beanstandungen: string[];
}

/**
 * Der Stand, den eine Seite anzeigen soll.
 *
 * Die Reihenfolge ist für alle Blöcke dieselbe, und sie wird getrennt
 * bestimmt: Das eine Feld kann gepflegt sein und das andere erzeugt. Die
 * Marktargumente folgen den Standortargumenten, nur ohne Rückfall.
 *
 *   1. Das gepflegte Feld, also `meta.kurzbeschreibung` beziehungsweise
 *      `meta.standortargumente`. Dort steht entweder ein von Hand
 *      geschriebener Text oder der erzeugte, den die Function dort abgelegt
 *      hat. Welcher von beiden, sagt der Vergleich mit `meta.objekttexteKi`,
 *      auch mit einem Stand der Fassung 1, solange der neue noch fehlt.
 *   2. Der erzeugte Text, falls das Feld leer geblieben ist. Das kommt vor,
 *      wenn die Function ihn nicht mehr ablegen konnte.
 *   3. Der Rückfall aus den Investagon-Freitexten, den `objektseiteFelder`
 *      schon kennt. Er steht bewusst hinten: Die Freitexte sind lang und
 *      allgemein, der erzeugte Text ist kurz und geht auf dieses Objekt ein.
 *      Für die Standortargumente gibt es dort ohnehin keine Quelle.
 *
 * Objektseite, Einheitenseite und Exposé lesen ausschließlich hierüber, damit
 * sie nicht drei verschiedene Texte zeigen und damit überall derselbe Vermerk
 * über der Herkunft steht.
 */
export function anzuzeigendeObjektTexte(
  objekt: Pick<ObjektData, "meta" | "globalDaten">,
): AngezeigteObjektTexte {
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const vorschlag = objektTexte(objekt);
  // Der zuletzt automatisch geschriebene Wortlaut, gleich welcher Fassung.
  // Sonst hieße ein Text der Fassung 1 bis zum nächsten Lauf „von Hand“.
  const automatisch = automatischerWortlaut(meta);

  const imFeldKurz = typeof meta.kurzbeschreibung === "string" ? meta.kurzbeschreibung.trim() : "";
  const imFeld = (feld: "standortargumente" | "marktargumente") =>
    (Array.isArray(meta[feld]) ? (meta[feld] as unknown[]) : [])
      .map((a) => (typeof a === "string" ? a.trim() : ""))
      .filter(Boolean);
  const imFeldArgumente = imFeld("standortargumente");

  const erzeugteArgumente = vorschlag?.standortargumente.map((a) => a.argument) ?? [];
  const automatischeArgumente = automatisch?.standortargumente ?? [];

  // Nur für den Rückfall. `objektseiteFelder` füllt leere Felder aus den
  // Investagon-Rohdaten, und genau das ist hier die dritte Wahl.
  const rueckfall = objektseiteFelder(objekt).kurzbeschreibung?.trim() || "";

  // Wortgleich der Investagon-Freitext im Feld stammt aus dem alten
  // Pflegedialog, nicht von Hand (siehe `istInvestagonKopie`). Er zählt wie
  // der Rückfall, also nach dem erzeugten Text.
  const feldIstKopie = !!imFeldKurz && imFeldKurz !== automatisch?.kurzbeschreibung && istInvestagonKopie(meta, imFeldKurz);

  let kurzbeschreibung = "";
  let kurzbeschreibungHerkunft: TextHerkunft = "keine";
  if (imFeldKurz && !feldIstKopie) {
    kurzbeschreibung = imFeldKurz;
    // Wortgleich mit dem erzeugten Text heißt: Er ist erzeugt, nicht getippt.
    kurzbeschreibungHerkunft = imFeldKurz === automatisch?.kurzbeschreibung ? "automatisch" : "gepflegt";
  } else if (vorschlag?.kurzbeschreibung) {
    kurzbeschreibung = vorschlag.kurzbeschreibung;
    kurzbeschreibungHerkunft = "automatisch";
  } else if (feldIstKopie || rueckfall) {
    kurzbeschreibung = feldIstKopie ? imFeldKurz : rueckfall;
    kurzbeschreibungHerkunft = "investagon";
  }

  let standortargumente: string[] = [];
  let standortargumenteHerkunft: TextHerkunft = "keine";
  if (imFeldArgumente.length > 0) {
    standortargumente = imFeldArgumente;
    const wortgleich =
      imFeldArgumente.length === automatischeArgumente.length &&
      imFeldArgumente.every((a, i) => a === automatischeArgumente[i]);
    standortargumenteHerkunft = wortgleich ? "automatisch" : "gepflegt";
  } else if (erzeugteArgumente.length > 0) {
    standortargumente = erzeugteArgumente;
    standortargumenteHerkunft = "automatisch";
  }

  const imFeldMarkt = imFeld("marktargumente");
  const erzeugteMarkt = vorschlag?.marktargumente?.map((a) => a.argument) ?? [];
  const automatischeMarkt = automatisch?.marktargumente ?? [];
  let marktargumente: string[] = [];
  let marktargumenteHerkunft: TextHerkunft = "keine";
  if (imFeldMarkt.length > 0) {
    marktargumente = imFeldMarkt;
    const wortgleich =
      imFeldMarkt.length === automatischeMarkt.length && imFeldMarkt.every((a, i) => a === automatischeMarkt[i]);
    marktargumenteHerkunft = wortgleich ? "automatisch" : "gepflegt";
  } else if (erzeugteMarkt.length > 0) {
    marktargumente = erzeugteMarkt;
    marktargumenteHerkunft = "automatisch";
  }

  const istAutomatisch =
    kurzbeschreibungHerkunft === "automatisch" ||
    standortargumenteHerkunft === "automatisch" ||
    marktargumenteHerkunft === "automatisch";
  return {
    kurzbeschreibung,
    kurzbeschreibungHerkunft,
    standortargumente,
    standortargumenteHerkunft,
    marktargumente,
    marktargumenteHerkunft,
    automatisch: istAutomatisch,
    beanstandungen: istAutomatisch ? (vorschlag?.beanstandungen ?? []) : [],
  };
}

/*
 * Die englische Fassung (Plan Kundensprache, Entscheidung 12) liest das
 * Exposé über `oeffentlicheObjekttexteEn` (`seitenSprache.ts`, Etappe 3).
 * Hier steht nur, was die Erzeugung betrifft: ob sie fehlt, und der Aufruf,
 * der sie nachholt.
 */

/**
 * Fehlt zu den automatisch erzeugten Texten dieses Objekts die passende
 * englische Fassung? Dann lohnt `englischeObjektTexteAnfordern`. Von Hand
 * gepflegte Blöcke zählen nicht, sie werden nie übersetzt.
 */
export function englischeObjektTexteFehlen(objekt: Pick<ObjektData, "meta">): boolean {
  return uebersetzungFehlt(objekt.meta, uebersetzungsQuelle(objekt.meta, objektTexte(objekt)));
}

/**
 * Die englische Fassung der automatisch erzeugten Texte nachholen, ohne die
 * deutschen Texte neu zu erzeugen (`nurEnglisch`). Für Objekte, deren Texte
 * vor dem 25.09.2026 entstanden. Gibt das neue `meta.objekttexteKiEn` zurück
 * oder `undefined`, wenn es nicht geklappt hat; ein Fehler bricht nie ab,
 * dann bleibt es beim deutschen Text mit Hinweis.
 */
export async function englischeObjektTexteAnfordern(objektId: string): Promise<unknown> {
  try {
    const { data, error } = await supabase.functions.invoke("objekt-texte-ki", {
      body: { objektId, nurEnglisch: true },
    });
    if (error || !data || typeof data !== "object") return undefined;
    return (data as { englisch?: unknown }).englisch;
  } catch {
    return undefined;
  }
}

/**
 * Wo ein Objekt bei den Texten steht.
 *
 * Drei Fälle, und mehr gibt es nicht: Es fehlt ein aktueller Stand und die
 * Grundlage reicht („offen"), es ist schon einer da („hat-texte"), oder zum
 * Objekt steht gar nichts, woraus sich ein Text schreiben ließe
 * („grundlage-fehlt").
 *
 * Diese Einstufung läuft allein im Browser, ohne einen einzigen Netzaufruf.
 * Alles, was sie liest, hat die Seite ohnehin schon geladen. Sie hält den
 * selbsttätigen Start von der Leitung fern, solange er nichts zu tun hätte,
 * und der Sammellauf in der Objektübersicht entscheidet mit derselben Regel,
 * welche Objekte er überhaupt anfasst. Das ist wichtiger als es aussieht:
 * Jeder Aufruf der Function zählt gegen das Kontingent, auch einer, der
 * nichts zu tun findet.
 *
 * SEIT DEM 23.09.2026
 *
 * Es genügen Objektangaben, denn die Function misst die Umgebung vor dem Lauf
 * selbst (siehe `genugQuellen`). Und ein Objekt mit zwei von Hand gepflegten
 * Texten gilt nicht mehr als versorgt: Der Lauf liefert auch die Sanierungen,
 * und die gibt es nur aus ihm. Die gepflegten Texte bleiben dabei stehen.
 */
export type ObjektTexteStand = "offen" | "hat-texte" | "grundlage-fehlt";

/** Was die Einstufung von einem Objekt braucht. Alles außer `meta` darf fehlen. */
export type ObjektFuerTexteStand = Pick<ObjektData, "meta"> &
  Partial<Pick<ObjektData, "titel" | "adresse" | "ort" | "beschreibung" | "dokumente">>;

export function objektTexteStand(objekt: ObjektFuerTexteStand): ObjektTexteStand {
  const meta = (objekt.meta || {}) as Record<string, unknown>;

  // Schon gelaufen, in der aktuellen Fassung. Auch ein Vermerk ohne Ergebnis
  // zählt, sonst liefe der Versuch bei jedem Seitenaufbau erneut an. Ein
  // Stand der Fassung 1 zählt nicht, jedes Objekt soll einmal neu entstehen.
  if (objektTexteAusMeta(meta)) return "hat-texte";

  return hatObjektangaben(objekt) ? "offen" : "grundlage-fehlt";
}

/**
 * Steht zum Objekt überhaupt etwas, woraus ein Text entstehen kann?
 *
 * Titel, Adresse, Ort, Beschreibung oder eine Objektunterlage. Die Function
 * liest noch mehr Felder (`objektQuellen`); das hier ist nur die Vorprüfung im
 * Browser, damit kein Aufruf ins Leere geht.
 */
export function hatObjektangaben(objekt: Omit<ObjektFuerTexteStand, "meta">): boolean {
  const gefuellt = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  return (
    gefuellt(objekt.titel) ||
    gefuellt(objekt.adresse) ||
    gefuellt(objekt.ort) ||
    gefuellt(objekt.beschreibung) ||
    (objekt.dokumente || []).some((d) => d.kategorie === "objektunterlagen" && !!d.url)
  );
}

/** Fehlt zu diesem Objekt ein aktueller Stand, und lässt sich einer erzeugen? */
export function brauchtObjektTexte(objekt: ObjektFuerTexteStand): boolean {
  return objektTexteStand(objekt) === "offen";
}

/**
 * Objekte, für die in dieser Sitzung schon ein Lauf angestoßen wurde.
 *
 * Zwei Karten auf einer Seite, ein erneutes Zeichnen durch React oder ein
 * Sprung zurück auf dieselbe Seite würden den Lauf sonst mehrfach starten,
 * bevor das Ergebnis gespeichert ist. Die Merkliste lebt nur im Arbeitsspeicher
 * dieses Fensters; die dauerhafte Sicherung ist der gespeicherte Stand am
 * Objekt.
 */
const angestossen = new Set<string>();

/**
 * Den selbsttätigen Lauf anstoßen, falls er nötig ist.
 *
 * Gibt zurück, ob wirklich etwas angestoßen wurde. Der Aufrufer darf das
 * Versprechen stehen lassen: Die Funktion wartet auf nichts, was den
 * Seitenaufbau aufhalten würde.
 */
export async function starteObjektTexteBeiBedarf(
  objekt: ObjektFuerTexteStand & Pick<ObjektData, "id">,
): Promise<ErzeugenErgebnis | undefined> {
  if (!objekt.id || angestossen.has(objekt.id)) return undefined;
  if (!brauchtObjektTexte(objekt)) return undefined;
  angestossen.add(objekt.id);
  return await erzeugeObjektTexte(objekt.id, { automatisch: true });
}

/** Nur für Tests: die Merkliste der angestoßenen Läufe leeren. */
export function vergissAngestosseneLaeufe(): void {
  angestossen.clear();
}

/**
 * Die Grenze, an die ein Lauf gestoßen ist.
 *
 * „stunde" und „tag" sind die Kontingente der Function je Nutzer, „gateway"
 * ist die Bremse des Lovable AI Gateway, „guthaben" das aufgebrauchte
 * KI-Guthaben. Alle vier haben dieselbe Folge: Weiterfeuern bringt nichts und
 * macht es eher schlimmer. Der Sammellauf hört daran auf, statt die nächsten
 * neunzig Objekte gegen eine geschlossene Tür zu fahren.
 */
export type Kontingentgrenze = "stunde" | "tag" | "gateway" | "guthaben";

/**
 * Warum die Function selbst nicht antwortet, wie sie soll.
 *
 * „fehlt“: Es gibt sie auf dem Server nicht. „veraltet“: Es läuft eine ältere
 * Fassung, die ihre Nummer (`version`) noch nicht mitschickt. „startet-nicht“:
 * Sie ist da, fährt aber nicht hoch. „nicht-erreichbar“: Die Anfrage kam gar
 * nicht an, meist ebenfalls, weil sie fehlt, seltener wegen des Netzes.
 *
 * Alle vier treffen jedes Objekt gleich. Ein Durchgang hört daran sofort auf.
 */
export type FunktionStand = "fehlt" | "veraltet" | "startet-nicht" | "nicht-erreichbar";

export const FUNKTION_SATZ: Readonly<Record<FunktionStand, string>> = Object.freeze({
  fehlt:
    "Die Function objekt-texte-ki ist noch nicht ausgerollt, auf dem Server gibt es sie noch nicht. Bitte in Lovable ausrollen lassen und danach erneut starten.",
  veraltet:
    "Die Function objekt-texte-ki ist noch nicht ausgerollt, auf dem Server läuft noch eine ältere Fassung. Bitte in Lovable ausrollen lassen und danach erneut starten.",
  "startet-nicht":
    "Die Function objekt-texte-ki startet auf dem Server nicht. Bitte in Lovable neu ausrollen lassen und die Logs der Function ansehen.",
  "nicht-erreichbar":
    "Die Function objekt-texte-ki war nicht erreichbar. Meist ist sie noch nicht ausgerollt, seltener fehlt gerade die Netzverbindung. Bitte in Lovable ausrollen lassen und danach erneut starten.",
});

/** Trägt die Antwort mindestens die Fassung, die dieser Browser erwartet? */
function versionReicht(version: unknown): boolean {
  const n = typeof version === "number" ? version : typeof version === "string" && version.trim() ? Number(version) : NaN;
  return Number.isFinite(n) && n >= OBJEKT_TEXTE_FUNKTION_VERSION;
}

/**
 * Ob eine abgelehnte Antwort gar nicht von der aktuellen Function stammt.
 *
 * Die aktuelle Function schickt in jeder Antwort `version`, auch in jedem
 * Fehler. Nur die Absage des Nutzerkontingents (`rate_limited`) kommt aus
 * einem gemeinsamen Helfer ohne Nummer. Alles andere ohne Nummer stammt von
 * der Plattform davor (Function fehlt, startet nicht) oder von einer älteren
 * Fassung (Fehler mit `error`, aber ohne `version`).
 */
export function funktionStandAusFehler(
  fehler: unknown,
  status: number,
  rumpf: Record<string, unknown>,
): FunktionStand | undefined {
  if ((fehler as { name?: unknown } | null)?.name === "FunctionsFetchError") return "nicht-erreichbar";
  if (rumpf.rate_limited === true || versionReicht(rumpf.version)) return undefined;
  const code = typeof rumpf.code === "string" ? rumpf.code : "";
  const nachricht = typeof rumpf.message === "string" ? rumpf.message : "";
  if (code === "BOOT_ERROR" || /failed to start|boot error/i.test(nachricht)) return "startet-nicht";
  if (status === 404 && (code === "NOT_FOUND" || /not found/i.test(nachricht) || typeof rumpf.error !== "string")) return "fehlt";
  if (typeof rumpf.error === "string") return "veraltet";
  return undefined;
}

/**
 * Ein Klartext für Absagen der Plattform, die keine Nummer tragen und auch
 * nicht auf eine fehlende Function deuten. Sonst stünde dort nur der Code.
 */
function plattformGrund(status: number, rumpf: Record<string, unknown>): string {
  if (rumpf.code === "WORKER_LIMIT" || status === 546) {
    return "Die Function hat ihr Speicher- oder Rechenlimit überschritten, meist wegen großer Unterlagen. Bitte dieses Objekt später einzeln erneut versuchen.";
  }
  if (status === 504) return "Die Function hat länger gebraucht, als die Plattform erlaubt. Bitte dieses Objekt erneut versuchen.";
  return "";
}

export interface ErzeugenErgebnis {
  texte?: ObjektTexte;
  /** Ob der Lauf wirklich ein Modell gefragt hat oder nur Gespeichertes brachte. */
  neu: boolean;
  /** Ob das Ergebnis am Objekt gespeichert werden konnte. */
  gespeichert: boolean;
  /** Im Klartext, warum nichts entstanden ist. Leer, wenn alles lief. */
  fehler: string;
  /** Gesetzt, wenn eine Grenze den Lauf abgewiesen hat. */
  grenze?: Kontingentgrenze;
  /**
   * Der Status einer abgelehnten Antwort, soweit bekannt. 422 heißt: Zum
   * Objekt fehlt die Grundlage, das ist kein technischer Fehler.
   */
  status?: number;
  /** Gesetzt, wenn die Function selbst fehlt oder veraltet ist. Siehe `FunktionStand`. */
  funktion?: FunktionStand;
}

/**
 * Status und Rumpf einer abgelehnten Antwort, ohne sie zu verbrauchen.
 *
 * Gelesen wird ausschließlich über eine Kopie. Der ursprüngliche Rumpf bleibt
 * damit offen für `edgeFehlerMitGrund`, das gleich danach denselben Weg geht
 * und den Klartext daraus holt.
 */
async function antwortDaten(fehler: unknown): Promise<{ status: number; rumpf: Record<string, unknown> }> {
  const kontext = (fehler as { context?: { status?: number; clone?: () => { text: () => Promise<string> } } })?.context;
  const status = typeof kontext?.status === "number" ? kontext.status : 0;
  if (!kontext || typeof kontext.clone !== "function") return { status, rumpf: {} };
  try {
    const gelesen = JSON.parse(await kontext.clone().text());
    return { status, rumpf: gelesen && typeof gelesen === "object" ? gelesen : {} };
  } catch {
    // Kein lesbares JSON. Dann bleibt der Status die einzige Auskunft.
    return { status, rumpf: {} };
  }
}

/** Welche Grenze hinter einer abgelehnten Antwort steckt, falls überhaupt eine. */
function grenzeAus(status: number, rumpf: Record<string, unknown>): Kontingentgrenze | undefined {
  // `rate_limited` setzt nur unser eigenes Kontingent, siehe
  // `supabase/functions/_shared/rate-limit.ts`. Es ist damit das genauere
  // Kennzeichen als der Status, den sich Kontingent und Gateway teilen.
  if (rumpf.rate_limited === true) return rumpf.reason === "hour" ? "stunde" : "tag";
  if (status === 429) return "gateway";
  if (status === 402) return "guthaben";
  return undefined;
}

/**
 * Die Texte erzeugen lassen.
 *
 * `neuErzeugen` ersetzt einen vorhandenen Stand, `automatisch` kennzeichnet
 * den selbsttätigen Start, `neuMessen` misst zusätzlich die Umgebung neu
 * (Knopf „Erneut versuchen“ im internen Vermerk der Karte). Die Function wertet `automatisch` seit dem
 * 23.09.2026 nicht mehr aus (siehe dort). Es bleibt im Aufruf, damit eine noch
 * nicht ausgerollte ältere Fassung der Function weiter versteht, was gemeint
 * ist.
 */
export async function erzeugeObjektTexte(
  objektId: string,
  wie: { neuErzeugen?: boolean; automatisch?: boolean; neuMessen?: boolean } = {},
): Promise<ErzeugenErgebnis> {
  try {
    const { data, error } = await supabase.functions.invoke("objekt-texte-ki", {
      body: {
        objektId,
        neuErzeugen: wie.neuErzeugen === true,
        automatisch: wie.automatisch === true,
        // Auch eine vorhandene Messung wiederholen, siehe `neuMessen` in `lauf.ts`.
        ...(wie.neuMessen === true ? { neuMessen: true } : {}),
      },
    });

    if (error) {
      const { status, rumpf } = await antwortDaten(error);
      const funktion = funktionStandAusFehler(error, status, rumpf);
      if (funktion) {
        return { neu: false, gespeichert: false, fehler: FUNKTION_SATZ[funktion], funktion, ...(status ? { status } : {}) };
      }
      // Ohne diesen Umweg stünde in der Meldung nur „Edge Function returned a
      // non-2xx status code“, und der Nutzer wüsste nicht, was zu tun ist.
      const mitGrund = (await edgeFehlerMitGrund(error)) as Error;
      return {
        neu: false,
        gespeichert: false,
        fehler: plattformGrund(status, rumpf) || mitGrund?.message || "Die Texte konnten nicht erzeugt werden.",
        grenze: grenzeAus(status, rumpf),
        ...(status ? { status } : {}),
      };
    }
    /*
     * Eine gelungene Antwort ohne Fassungsnummer stammt von einer älteren
     * Function. Deren Stand liest dieser Browser nicht mehr, und ohne diese
     * Prüfung sähe jedes Objekt fehlgeschlagen aus, obwohl nur das Ausrollen
     * fehlt.
     */
    if (!data || typeof data !== "object" || !versionReicht((data as { version?: unknown }).version)) {
      return { neu: false, gespeichert: false, fehler: FUNKTION_SATZ.veraltet, funktion: "veraltet" };
    }
    if (data.error) {
      return { neu: false, gespeichert: false, fehler: String(data.error) };
    }

    const texte = objektTexteAusMeta({ [OBJEKT_TEXTE_META_SCHLUESSEL]: data?.texte });
    return {
      texte,
      neu: data?.neu === true,
      gespeichert: data?.gespeichert === true,
      // Ein Lauf, der bewusst nichts erzeugt hat, ist kein Fehler. Sein Grund
      // steht im Stand selbst und wird dort angezeigt.
      fehler: texte || data?.texte === null ? "" : "Die Antwort enthielt keine verwertbaren Texte.",
    };
  } catch (e) {
    return {
      neu: false,
      gespeichert: false,
      fehler: e instanceof Error ? e.message : "Die Texte konnten nicht erzeugt werden.",
    };
  }
}

/**
 * Einen von Hand geschriebenen Text speichern, der ab jetzt Vorrang hat.
 *
 * Geschrieben werden nur `meta.kurzbeschreibung`, `meta.standortargumente`
 * und, wenn mitgegeben, `meta.marktargumente`.
 * Leere Angaben entfernen den Eintrag, und dann ist wieder der erzeugte Text
 * zu sehen. Das ist der Weg zurück, ohne einen neuen Lauf.
 *
 * NICHT der Umweg über `objektseiteFelderInMeta`: Jene Funktion schreibt alle
 * Felder der Objektseite auf einmal, und `objektseiteFelder` liefert für leere
 * Felder Rückfallwerte aus Investagon. Beides zusammen würde hier aus einem
 * Rückfall eine gepflegte Angabe machen, und der nächste Import käme nicht
 * mehr dagegen an.
 *
 * `updateObjektFieldFast` meldet einen Fehlschlag nicht, deshalb wird danach
 * nachgesehen, ob der Wert wirklich angekommen ist. Eine stille Rückmeldung
 * „gespeichert“ auf eine abgelehnte Änderung wäre schlimmer als ein Fehler.
 */
export async function speichereGepflegteTexte(
  objekt: Pick<ObjektData, "id" | "meta" | "globalDaten">,
  eingabe: {
    kurzbeschreibung: string;
    standortargumente: string[];
    /** Ohne Angabe bleiben die Marktargumente am Objekt, wie sie sind. */
    marktargumente?: string[];
  },
): Promise<{ ok: boolean; fehler: string; meta?: Record<string, unknown> }> {
  const kurzbeschreibung = eingabe.kurzbeschreibung.trim();
  const argumente = eingabe.standortargumente.map((a) => a.trim()).filter(Boolean);
  const markt = eingabe.marktargumente?.map((a) => a.trim()).filter(Boolean);

  const meta: Record<string, unknown> = { ...((objekt.meta || {}) as Record<string, unknown>) };
  if (kurzbeschreibung) meta.kurzbeschreibung = kurzbeschreibung;
  else delete meta.kurzbeschreibung;
  if (argumente.length > 0) meta.standortargumente = argumente;
  else delete meta.standortargumente;
  if (markt) {
    if (markt.length > 0) meta.marktargumente = markt;
    else delete meta.marktargumente;
  }
  // Ein von Hand geschriebener Block bleibt deutsch (Entscheidung 12). Die
  // englische Fassung des automatischen Textes passt dann nicht mehr und
  // fällt für diesen Block weg, sonst zeigte das Exposé sie statt des
  // Getippten.
  const englisch = objektTexteEnOhneGepflegte(meta)[OBJEKT_TEXTE_EN_META_SCHLUESSEL];
  if (englisch) meta[OBJEKT_TEXTE_EN_META_SCHLUESSEL] = englisch;
  else delete meta[OBJEKT_TEXTE_EN_META_SCHLUESSEL];

  try {
    await updateObjektFieldFast(objekt.id, { meta });
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : "Die Texte konnten nicht gespeichert werden." };
  }

  const frisch = getObjektById(objekt.id);
  const angekommen = ((frisch?.meta || {}) as Record<string, unknown>);
  const kurzAngekommen = (typeof angekommen.kurzbeschreibung === "string" ? angekommen.kurzbeschreibung.trim() : "") === kurzbeschreibung;
  const listeAngekommen = Array.isArray(angekommen.standortargumente) ? angekommen.standortargumente : [];
  const argumenteAngekommen =
    listeAngekommen.length === argumente.length && listeAngekommen.every((a, i) => String(a).trim() === argumente[i]);
  const marktListe = Array.isArray(angekommen.marktargumente) ? angekommen.marktargumente : [];
  const marktAngekommen =
    !markt || (marktListe.length === markt.length && marktListe.every((a, i) => String(a).trim() === markt[i]));
  if (!kurzAngekommen || !argumenteAngekommen || !marktAngekommen) {
    return { ok: false, fehler: "Die Texte wurden nicht gespeichert. Fehlt die Berechtigung, dieses Objekt zu ändern?" };
  }
  // Das geschriebene `meta` kommt mit zurück, damit die Karte den neuen Stand
  // sofort zeigen kann, ohne auf das Neuladen der Seite zu warten.
  return { ok: true, fehler: "", meta };
}
