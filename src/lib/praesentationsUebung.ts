/**
 * Die Moderation der Präsentationen: mit den Antworten des Bewerbers, sonst
 * blank, mit Wegwahl.
 *
 * Hinter „Moderation öffnen" im Reiter Videocall wählt die HR-Managerin, was
 * sie sehen will: die Folien des alten Vorabbogens (das 22er-Deck aus
 * `praesentationsDeck.ts`), die Folien des aktuellen Kennenlernbogens (die
 * Strecken aus `bewerberVideocall.ts`) oder nur den Rechner aus dem
 * Vorabbogen.
 *
 * Diese Datei ist reine Rechnerei: Adressen, Wege, die Gruppen der
 * Folienleiste, die Schlüssel der Favoriten, die Kopplung mit dem
 * Präsentationsfenster und der Folienbezug der Notizen. Gezeichnet wird in
 * `PraesentationsUebung.tsx`.
 *
 * ## Bewerber, Folien und Notizen
 *
 * Wird die Seite aus einem Bewerberprofil geöffnet, reist seine Kennung mit
 * (`bewerber=<id>`). Sie tut zweierlei. Erstens landen Notizen bei ihm, im
 * vorhandenen Notizenprotokoll (`notizenLog`), mit dem Folienbezug vorn im
 * Text, etwa „[Closing, Folie 11 Deine Zahlen] …". Zweitens tragen die Folien
 * des Kennenlernbogens **seine Antworten**, dieselben wie im geteilten
 * Fenster des Videocalls (`kennenlernFolien`).
 *
 * Blank bleibt es in drei Fällen, und jeder davon ist gewollt: ohne Kennung
 * (dann ist es wirklich eine Übung), ohne eingereichten Bogen, und auf einem
 * anderen Weg als seinem. Ein fremder Weg hat für ihn keine Antworten, und
 * eine halb gefüllte Folie wäre schlimmer als eine leere.
 *
 * Die Folien des Vorabbogens bleiben in dieser Ansicht immer blank. Das alte
 * 22er-Deck hat seine eigene Moderation (`ClosingModeration.tsx`), die die
 * Angaben des Bewerbers trägt; hier dient es zum Durchgehen und Zeigen.
 *
 * ## Das Präsentationsfenster
 *
 * Für die Bildschirmfreigabe öffnet die Moderation dieselbe Seite mit
 * `fenster=1` in einem zweiten Fenster. Das Fenster zeigt nur die Folie und
 * folgt der Moderation über den BroadcastChannel aus
 * `praesentationsKopplung.ts`. Der Kanal heißt nach einer Sitzungskennung je
 * Tab (`uebungsSitzung`), nicht nach einem Bewerber; so stören sich zwei
 * Moderationen desselben Nutzers nicht. Beim Kennenlernbogen reist die
 * Kennung mit ins Fenster, damit auch dort seine Antworten auf den Folien
 * stehen; sein Name steht dort nach wie vor nirgends.
 *
 * ## Woher die Wege kommen
 *
 *   Vorabbogen: Feld `teil`, Werte 1 (ab Teil 1, alle 22 Folien) und 2 (nur
 *     Teil 2, 15 Folien). Die vier Hintergrund-Pfade (A bis D) verändern nur
 *     den Sprechtext der Moderation, nicht die Folien: Die Profil-Folie zeigt
 *     immer alle vier Pfade als Karten.
 *   Kennenlernbogen: Feld `weg`, Werte weg1 bis weg5 (die Weiche des Bogens).
 *     Jede Strecke hat gesetzte Module und Module bei Bedarf; die bei Bedarf
 *     lassen sich in der Leiste zuschalten (`module`).
 */

import type { KennenlernenAntworten, WegId } from "./bewerberKennenlernen";
import type { Bewerber } from "./bewerbungStore";
import type { UebungsStandNachricht } from "./praesentationsKopplung";
import {
  MODULE,
  STRECKEN,
  getKern,
  getModul,
  getStrecke,
  videocallFolien,
  type ModulId,
  type VideocallFolie,
} from "./bewerberVideocall";
import { deckFuerEinstieg, leseTeil, type DeckTeil } from "./praesentationsDeck";

export type UebungsArt = "vorabbogen" | "kennenlernbogen" | "rechner";

export const UEBUNGS_ARTEN: {
  art: UebungsArt;
  titel: string;
  /** Der Name auf dem Knopf in der Leiste. */
  kurz: string;
  /** Die Zeile unter dem Namen, sagt, welche Präsentation dahintersteckt. */
  unterzeile: string;
  text: string;
}[] = [
  {
    art: "vorabbogen",
    titel: "Alter Vorabbogen",
    kurz: "Vorabbogen",
    unterzeile: "Closing-Präsentation",
    text: "Die 22 Folien in ihrem Weg: Teil 1 Kennenlernen, Teil 2 Präsentation über uns. Mit Einstieg ab Teil 1 oder nur Teil 2.",
  },
  {
    art: "kennenlernbogen",
    titel: "Aktueller Kennenlernbogen",
    kurz: "Kennenlernbogen",
    unterzeile: "Kennenlern-Präsentation",
    text: "Die Folien des Videocalls, je nach Weg der Weiche. Fünf Wege, jeweils mit gesetzten Modulen und Modulen bei Bedarf.",
  },
  {
    art: "rechner",
    titel: "Nur der Rechner",
    kurz: "Rechner",
    unterzeile: "Nur die Rechner-Folie",
    text: "Der Rechner aus dem Vorabbogen, eigenständig und ohne Folien davor oder danach. Zum Durchgehen mit dem Gegenüber.",
  },
];

export const UEBUNGS_PFAD = "/praesentation-uebung";

/** Die Folien-Id des Rechners im 22er-Deck. */
export const RECHNER_FOLIE_ID = "rechner";

/** Liest den URL-Parameter `art`. Unbekanntes fällt auf den Vorabbogen zurück. */
export function leseUebungsArt(wert: string | null | undefined): UebungsArt {
  const w = (wert ?? "").trim();
  return w === "kennenlernbogen" || w === "rechner" ? w : "vorabbogen";
}

/** Liest den URL-Parameter `weg`. Unbekanntes fällt auf Weg 1 zurück. */
export function leseWeg(wert: string | null | undefined): WegId {
  const w = (wert ?? "").trim();
  return getStrecke(w) ? (w as WegId) : "weg1";
}

/** Liest den URL-Parameter `module`, etwa „m3,m6". Unbekannte Kürzel fallen weg. */
export function leseModule(wert: string | null | undefined): ModulId[] {
  const bekannt = new Set<string>(MODULE.map((m) => m.id));
  const gesehen = new Set<string>();
  const liste: ModulId[] = [];
  for (const teil of (wert ?? "").split(",")) {
    const id = teil.trim();
    if (!bekannt.has(id) || gesehen.has(id)) continue;
    gesehen.add(id);
    liste.push(id as ModulId);
  }
  return liste;
}

export type UebungsStand = {
  art: UebungsArt;
  /** Nur Vorabbogen: Einstieg ab Teil 1 oder nur Teil 2. */
  teil: DeckTeil;
  /** Nur Kennenlernbogen: die Strecke. */
  weg: WegId;
  /** Nur Kennenlernbogen: zugeschaltete Module bei Bedarf. */
  module: ModulId[];
  /** Die Folie, auf der die Ansicht steht. Leer heißt: die erste. */
  folieId: string;
  /**
   * Der Bewerber, aus dessen Profil die Seite geöffnet wurde. Er entscheidet
   * über zweierlei: wo die Notizen landen, und ob die Folien des
   * Kennenlernbogens seine Antworten tragen. Leer, wenn die Seite direkt
   * aufgerufen wurde; dann ist es die blanke Übung.
   */
  bewerberId: string;
};

/** Liest alle Parameter der Übungsansicht aus einer Query. */
export function leseUebungsStand(params: URLSearchParams): UebungsStand {
  return {
    art: leseUebungsArt(params.get("art")),
    teil: leseTeil(params.get("teil")),
    weg: leseWeg(params.get("weg")),
    module: leseModule(params.get("module")),
    folieId: (params.get("folie") ?? "").trim(),
    bewerberId: (params.get("bewerber") ?? "").trim(),
  };
}

/**
 * Die Query der Übungsansicht. Nur die Parameter, die zur Art gehören,
 * landen in der Adresse; alles andere bliebe Ballast.
 */
export function uebungsQuery(stand: Partial<UebungsStand> & { art: UebungsArt }): string {
  const teile = [`art=${stand.art}`];
  if (stand.art === "vorabbogen" && stand.teil === 2) teile.push("teil=2");
  if (stand.art === "kennenlernbogen") {
    teile.push(`weg=${stand.weg ?? "weg1"}`);
    if (stand.module && stand.module.length > 0) teile.push(`module=${stand.module.join(",")}`);
  }
  if (stand.folieId && stand.art !== "rechner") teile.push(`folie=${encodeURIComponent(stand.folieId)}`);
  if (stand.bewerberId?.trim()) teile.push(`bewerber=${encodeURIComponent(stand.bewerberId.trim())}`);
  return teile.join("&");
}

/** Die Adresse der Übungsansicht, für Links aus dem CRM. */
export function uebungsUrl(stand: Partial<UebungsStand> & { art: UebungsArt }): string {
  return `${UEBUNGS_PFAD}?${uebungsQuery(stand)}`;
}

// ───────────────────── Das Präsentationsfenster ───────────────────────────

/** Schlüssel der Sitzungskennung im sessionStorage, der je Tab gilt. */
const SITZUNG_SCHLUESSEL = "praesentationsUebungSitzung";

/**
 * Die Sitzungskennung dieses Tabs. Sie entsteht beim ersten Aufruf und
 * überlebt ein Neuladen, damit ein offenes Präsentationsfenster danach
 * wieder andockt. Ohne sessionStorage (Testumgebung, gesperrter Speicher)
 * bleibt sie leer; dann läuft alles über den gemeinsamen Übungskanal.
 */
export function uebungsSitzung(): string {
  try {
    const vorhanden = window.sessionStorage.getItem(SITZUNG_SCHLUESSEL);
    if (vorhanden) return vorhanden;
    const neu = Math.random().toString(36).slice(2, 10);
    window.sessionStorage.setItem(SITZUNG_SCHLUESSEL, neu);
    return neu;
  } catch {
    return "";
  }
}

/**
 * Die Kennung, unter der die Übungsansicht ihren Kanal öffnet. Sie geht an
 * `oeffneKanal` an die Stelle der Bewerber-Id; ohne Sitzung fällt der Kanal
 * auf den festen Übungskanal ohne Bewerber zurück (`kanalName(null)`).
 */
export function uebungsKanalKennung(sitzung: string | null | undefined): string | null {
  const s = (sitzung ?? "").trim();
  return s ? `uebung-${s}` : null;
}

/**
 * Die Adresse des Präsentationsfensters: dieselbe Seite mit `fenster=1`, der
 * Sitzungskennung und dem aktuellen Stand.
 *
 * Die Kennung des Bewerbers reist nur beim Kennenlernbogen mit, und nur zu
 * einem Zweck: damit auch das geteilte Fenster seine Antworten auf den Folien
 * trägt. Genau die sieht er im Videocall ohnehin, es sind seine eigenen. Sein
 * Name steht dort weiterhin nirgends, und die Folien des Vorabbogens kennen
 * keine Antworten, dort bliebe die Kennung wirkungslos.
 */
export function uebungsFensterUrl(stand: UebungsStand, sitzung: string): string {
  const teile = ["fenster=1"];
  if (sitzung.trim()) teile.push(`kanal=${encodeURIComponent(sitzung.trim())}`);
  teile.push(uebungsQuery({
    ...stand,
    bewerberId: stand.art === "kennenlernbogen" ? stand.bewerberId : "",
  }));
  return `${UEBUNGS_PFAD}?${teile.join("&")}`;
}

/** Der Stand als Nachricht an das Fenster. Ohne Bewerber, wie die Adresse. */
export function standNachricht(stand: UebungsStand): UebungsStandNachricht {
  return {
    typ: "stand",
    art: stand.art,
    teil: stand.teil,
    weg: stand.weg,
    module: [...stand.module],
    folieId: stand.folieId,
  };
}

/**
 * Der Stand aus einer Nachricht, geprüft wie eine Adresse: unbekannte Wege
 * und Module fallen weg. Der Bewerber bleibt der eigene, denn er reist nie
 * über den Kanal.
 */
export function standAusNachricht(n: UebungsStandNachricht, bewerberId = ""): UebungsStand {
  return {
    art: n.art,
    teil: n.teil,
    weg: leseWeg(n.weg),
    module: leseModule(n.module.join(",")),
    folieId: n.folieId.trim(),
    bewerberId,
  };
}

// ───────────────────────────── Notizen ────────────────────────────────────

/**
 * Der Folienbezug vorn in einer Notiz, etwa „[Closing, Folie 11 Deine
 * Zahlen]". So ist im Notizenprotokoll des Bewerbers später klar, wobei die
 * Notiz entstand, ohne ein zweites Notizsystem.
 */
export function notizFolienBezug(stand: Pick<UebungsStand, "art" | "weg">, nummer: number, titel: string): string {
  if (stand.art === "rechner") return "[Rechner]";
  const kopf = stand.art === "vorabbogen" ? "Closing" : `Kennenlern, Weg ${wegNummer(stand.weg)}`;
  const t = titel.trim();
  return `[${kopf}, Folie ${nummer}${t ? ` ${t}` : ""}]`;
}

/** Der Notiztext, wie er im Protokoll steht: Bezug, Leerzeichen, Text. */
export function notizMitBezug(bezug: string, text: string): string {
  return `${bezug} ${text.trim()}`;
}

/**
 * Ein Bewerber ohne jede Angabe, für die Bausteine der Moderation, die einen
 * Bewerber als Eingabe brauchen (etwa den Teil-2-Skriptblock). Die Kennung
 * ist leer, damit nichts davon je gespeichert werden kann.
 */
export function leererBewerber(): Bewerber {
  return {
    id: "", vorname: "", nachname: "", email: "", telefon: "", ort: "", quelle: "",
    beworben: "", stelleId: "", stelleTitel: "", status: "Eingang", bewertung: 0,
    erstelltAm: "",
    typ: "", typLabel: "", typBeschreibung: "", typEignung: "", erfahrung: "",
    motivation: "", notizen: "", ziele: "", beschaeftigungsart: "", onboardingTerminId: "",
    lebenslaufUrl: "", dokumente: [], vertragStatus: "nicht_gesendet", vertragDatum: "",
    benachrichtigungen: [], chatVerknuepft: false,
    ausgangslage: "", zielBest: "", wieStarten: "",
    notizenLog: [], adresse: "",
  } as Bewerber;
}

/**
 * Die Folien des Kennenlernbogens auf einem Weg, ohne Bewerber.
 *
 * `videocallFolien` liest alle Texte über den Lesekopf und liefert leere
 * Strings, wo nichts steht. Es reicht deshalb, den Weg zu setzen; alle
 * anderen Antworten bleiben weg. Die Folien tragen dann die Sätze für „keine
 * Angabe", genau wie bei einem Bewerber, der eine Frage übersprungen hat.
 */
export function kennenlernUebungsFolien(weg: WegId, module: readonly ModulId[] = []): VideocallFolie[] {
  return videocallFolien({ weg }, module);
}

/**
 * Der Weg, den dieser Bewerber im Kennenlernbogen gewählt hat.
 *
 * Null, wenn kein Bogen vorliegt oder der Weg darin unbekannt ist. Aus der
 * Datenbank kann alles kommen, deshalb wird gegen die Strecken geprüft und
 * nicht blind umgetauft.
 */
export function bogenWeg(antworten: KennenlernenAntworten | null | undefined): WegId | null {
  const roh = typeof antworten?.weg === "string" ? antworten.weg.trim() : "";
  return getStrecke(roh) ? (roh as WegId) : null;
}

/**
 * Die Folien des Kennenlernbogens, wie die Moderation sie zeichnet.
 *
 * Liegt der Bogen dieses Bewerbers vor und zeigt die Ansicht seinen Weg,
 * tragen die Folien seine Antworten: dieselbe Rechnung wie im geteilten
 * Fenster des Videocalls, derselbe Aufruf von `videocallFolien`. Auf einem
 * anderen Weg und ohne Bogen bleiben sie blank.
 *
 * Die Folien-Ids hängen nur an Weg und Modulen, nicht an den Antworten. Die
 * Leiste, die Favoriten und das PDF rechnen deshalb weiter mit der blanken
 * Liste, ohne dass die Nummern auseinanderlaufen.
 */
export function kennenlernFolien(
  weg: WegId,
  module: readonly ModulId[] = [],
  antworten: KennenlernenAntworten | null | undefined = null,
): VideocallFolie[] {
  return antworten && bogenWeg(antworten) === weg
    ? videocallFolien(antworten, module)
    : kennenlernUebungsFolien(weg, module);
}

/** Kurzer Name einer Kennenlern-Folie für die Leiste. */
export function kennenlernFolienTitel(folie: VideocallFolie): string {
  return folie.art === "modul"
    ? `Modul ${getModul(folie.bausteinId as ModulId).nummer}: ${getModul(folie.bausteinId as ModulId).kurz}`
    : getKern(folie.bausteinId as Exclude<typeof folie.bausteinId, ModulId>).titel;
}

/** Die Nummer eines Wegs, wie sie in der Leiste steht: weg3 ist Weg 3. */
export function wegNummer(weg: WegId): number {
  return parseInt(weg.replace("weg", ""), 10) || 0;
}

// ───────────────────────────── Die Leiste ─────────────────────────────────

export type LeistenEintrag = {
  /** Der Favoriten-Schlüssel, zugleich die stabile Kennung in der Leiste. */
  schluessel: string;
  art: UebungsArt;
  folieId: string;
  titel: string;
  /** Untertitel, etwa die Kopfzeile oder die Phase. */
  unterzeile?: string;
  /** Nur Kennenlernbogen: der Weg, zu dem der Eintrag gehört. */
  weg?: WegId;
  /** Nur Kennenlernbogen: das Modul, wenn es eines bei Bedarf ist. */
  modulBeiBedarf?: ModulId;
  /** Nur Vorabbogen: der Teil der Folie. */
  teil?: DeckTeil;
  /** Der Rechner, damit die Leiste ihn eigens beschriften kann. */
  istRechner?: boolean;
};

export type LeistenGruppe = {
  id: string;
  titel: string;
  unterzeile?: string;
  eintraege: LeistenEintrag[];
  /** Nur Kennenlernbogen: der Weg dieser Gruppe. */
  weg?: WegId;
  /** Nur Kennenlernbogen: die Module bei Bedarf dieser Strecke. */
  beiBedarf?: ModulId[];
};

/**
 * Die Gruppen des Vorabbogens: Teil 1 und Teil 2, alle 22 Folien, unabhängig
 * vom Einstieg. Der Einstieg entscheidet nur, welche Folien die Bühne zeigt.
 */
export function vorabbogenGruppen(): LeistenGruppe[] {
  const alle = deckFuerEinstieg(1);
  const gruppe = (teil: DeckTeil, titel: string, unterzeile: string): LeistenGruppe => ({
    id: `vorabbogen-teil${teil}`,
    titel,
    unterzeile,
    eintraege: alle
      .filter((f) => f.teil === teil)
      .map((f) => ({
        schluessel: favoritenSchluessel("vorabbogen", f.id),
        art: "vorabbogen",
        folieId: f.id,
        titel: f.id === RECHNER_FOLIE_ID ? `${f.titel} (Rechner)` : f.titel,
        unterzeile: f.phase,
        teil: f.teil,
        istRechner: f.id === RECHNER_FOLIE_ID,
      })),
  });
  return [
    gruppe(1, "Teil 1 · Kennenlernen", "Folien zum Erstgespräch"),
    gruppe(2, "Teil 2 · Präsentation über uns", "Vom Einstieg bis zur Entscheidung"),
  ];
}

/**
 * Die Gruppen des Kennenlernbogens: fünf Wege. Jede Gruppe listet die Folien
 * ihres Wegs mit den gesetzten Modulen und den gerade zugeschalteten.
 */
export function kennenlernGruppen(moduleJeWeg: Partial<Record<WegId, ModulId[]>> = {}): LeistenGruppe[] {
  return STRECKEN.map((s) => {
    const zusatz = moduleJeWeg[s.weg] ?? [];
    const folien = kennenlernUebungsFolien(s.weg, zusatz);
    return {
      id: `kennenlernbogen-${s.weg}`,
      titel: `Weg ${wegNummer(s.weg)}`,
      unterzeile: s.label,
      weg: s.weg,
      beiBedarf: s.beiBedarf,
      eintraege: folien.map((f) => ({
        schluessel: favoritenSchluessel("kennenlernbogen", f.id, s.weg),
        art: "kennenlernbogen",
        folieId: f.id,
        titel: kennenlernFolienTitel(f),
        unterzeile: f.kopfzeile,
        weg: s.weg,
        modulBeiBedarf: f.art === "modul" && s.beiBedarf.includes(f.bausteinId as ModulId)
          ? (f.bausteinId as ModulId)
          : undefined,
      })),
    };
  });
}

/** Der eigene Eintrag für den Rechner, damit er sofort zu finden ist. */
export function rechnerEintrag(): LeistenEintrag {
  return {
    schluessel: favoritenSchluessel("rechner", RECHNER_FOLIE_ID),
    art: "rechner",
    folieId: RECHNER_FOLIE_ID,
    titel: "Rechner, eigenständig",
    unterzeile: "Deine Zahlen, ohne Folien davor und danach",
    istRechner: true,
  };
}

// ───────────────────────────── Favoriten ──────────────────────────────────

/**
 * Der Schlüssel eines Favoriten: Art, Weg und Folien-Id, durch senkrechte
 * Striche getrennt. Beim Vorabbogen bleibt der Weg leer, denn seine Folien
 * sind in beiden Einstiegen dieselben.
 */
export function favoritenSchluessel(art: UebungsArt, folieId: string, weg?: WegId): string {
  return `${art}|${art === "kennenlernbogen" ? weg ?? "weg1" : ""}|${folieId}`;
}

export type FavoritenZiel = { art: UebungsArt; weg: WegId | null; folieId: string };

/** Zerlegt einen Schlüssel. Unbrauchbares ergibt null, statt die Leiste zu zerlegen. */
export function leseFavoritenSchluessel(schluessel: string): FavoritenZiel | null {
  const teile = schluessel.split("|");
  if (teile.length !== 3) return null;
  const [artRoh, wegRoh, folieId] = teile;
  if (!["vorabbogen", "kennenlernbogen", "rechner"].includes(artRoh) || !folieId) return null;
  const art = artRoh as UebungsArt;
  if (art === "kennenlernbogen") {
    if (!getStrecke(wegRoh)) return null;
    return { art, weg: wegRoh as WegId, folieId };
  }
  return { art, weg: null, folieId };
}

/** Nur gültige, eindeutige Schlüssel. Aus der Datenbank kann alles kommen. */
export function sanitizeFavoriten(roh: unknown): string[] {
  if (!Array.isArray(roh)) return [];
  const gesehen = new Set<string>();
  const liste: string[] = [];
  for (const wert of roh) {
    if (typeof wert !== "string") continue;
    const s = wert.trim();
    if (!s || gesehen.has(s) || !leseFavoritenSchluessel(s)) continue;
    gesehen.add(s);
    liste.push(s);
  }
  return liste;
}

/** Setzt oder entfernt einen Favoriten. Die Reihenfolge bleibt die des Setzens. */
export function toggleFavorit(liste: readonly string[], schluessel: string): string[] {
  return liste.includes(schluessel) ? liste.filter((s) => s !== schluessel) : [...liste, schluessel];
}

/**
 * Beschriftung eines Favoriten in der Leiste: Gruppe und Folientitel, dazu
 * die Module, die ein Modul bei Bedarf braucht. Eine Folie, die es nicht
 * mehr gibt (etwa nach einer Umbenennung im Deck), ergibt null und wird in
 * der Leiste nicht gezeigt.
 */
export function favoritBeschriftung(
  schluessel: string,
): { gruppe: string; titel: string; ziel: FavoritenZiel; module: ModulId[] } | null {
  const ziel = leseFavoritenSchluessel(schluessel);
  if (!ziel) return null;
  if (ziel.art === "rechner") {
    return { gruppe: "Rechner", titel: rechnerEintrag().titel, ziel, module: [] };
  }
  if (ziel.art === "vorabbogen") {
    const eintrag = vorabbogenGruppen().flatMap((g) => g.eintraege).find((e) => e.folieId === ziel.folieId);
    return eintrag ? { gruppe: "Vorabbogen", titel: eintrag.titel, ziel, module: [] } : null;
  }
  const strecke = getStrecke(ziel.weg);
  if (!strecke) return null;
  // Ein Modul bei Bedarf muss zugeschaltet sein, sonst gibt es die Folie nicht.
  const modulId = ziel.folieId.startsWith("modul-") ? (ziel.folieId.slice("modul-".length) as ModulId) : null;
  const module: ModulId[] = modulId && !strecke.gesetzt.includes(modulId) ? [modulId] : [];
  const folie = kennenlernUebungsFolien(ziel.weg!, module).find((f) => f.id === ziel.folieId);
  if (!folie) return null;
  return { gruppe: `Kennenlernbogen · Weg ${wegNummer(ziel.weg!)}`, titel: kennenlernFolienTitel(folie), ziel, module };
}
