import type { ObjektStruktur } from "@/lib/objektKlassen";
import type { DokumentFreigabeFelder, ObjektData, ObjektDokument, ObjektWohnung, WohnungDokument } from "@/lib/objekteStore";
import { investagonKategorieSuche } from "@/lib/dokumentGruppen";
import {
  darfZumKunden, dokumentAmpel, internVonHandAusZeile, type Ampel, type FreigabeDokument,
} from "../../supabase/functions/_shared/dokument-freigabe";

/**
 * Wohin Dateien gehören, je Objektart.
 *
 * Der Anlege-Assistent, die Objektseite und die Einheitsseite müssen sich
 * über dieselbe Frage einig sein: Gehört diese Datei ans Haus oder an die
 * Wohnung? Die Antwort steht deshalb an genau einer Stelle und nicht dreimal
 * verstreut in den Seiten.
 *
 * Die drei Arten sind dieselben wie in `objektKlassen.ts`. Co-Living teilt
 * sich die Kachel mit der Einzelwohnung und ist auch hier keine eigene Art.
 */

export interface UnterlagenRegeln {
  /** Objektunterlagen lassen sich am Objekt hochladen. */
  objektDokumente: boolean;
  /** Wohnungsunterlagen lassen sich je Einheit hochladen. */
  wohnungDokumente: boolean;
  /** Wohin die Bilder aus dem Medien-Schritt gespeichert werden. */
  medienZiel: "objekt" | "einheit";
  /** Bilder lassen sich zusätzlich je Einheit hochladen. */
  wohnungBilder: boolean;
  /** Überschrift über den Objektunterlagen im Assistenten. */
  objektDokumenteTitel: string;
  /** Überschrift über den Wohnungsunterlagen im Assistenten. */
  wohnungDokumenteTitel: string;
}

/**
 * Die Objektart, wie sie im Assistenten gerade eingestellt ist.
 *
 * Der Assistent hält die Art in zwei Schaltern statt in einem Feld. Diese
 * Funktion übersetzt sie in die eine Einteilung, mit der alles andere
 * arbeitet.
 */
export function wizardStruktur(isGlobalObjekt: boolean, isEinzelwohnung: boolean): ObjektStruktur {
  if (isGlobalObjekt) return "globalobjekt";
  if (isEinzelwohnung) return "einzelwohnung";
  return "mehrere_einheiten";
}

/**
 * Die Regeln für eine Objektart.
 *
 * `hatEinheiten` zählt nur beim Globalobjekt: Das Haus wird als Ganzes
 * verkauft, es kann aber Einheiten hinterlegt haben. Erst dann gibt es
 * überhaupt eine Einheit, an die etwas gehängt werden könnte.
 */
export function unterlagenRegeln(struktur: ObjektStruktur, hatEinheiten: boolean): UnterlagenRegeln {
  if (struktur === "einzelwohnung") {
    // Es gibt nur die Einheitsseite. Alles hängt an der Wohnung, sonst
    // landet eine Datei an einem Objekt, das der Nutzer nie zu sehen bekommt.
    return {
      objektDokumente: false,
      wohnungDokumente: true,
      medienZiel: "einheit",
      wohnungBilder: true,
      objektDokumenteTitel: "Objektunterlagen",
      wohnungDokumenteTitel: "Unterlagen der Wohnung",
    };
  }
  if (struktur === "globalobjekt") {
    return {
      objektDokumente: true,
      wohnungDokumente: hatEinheiten,
      medienZiel: "objekt",
      wohnungBilder: hatEinheiten,
      objektDokumenteTitel: "Objektunterlagen",
      wohnungDokumenteTitel: "Unterlagen je Einheit",
    };
  }
  return {
    objektDokumente: true,
    wohnungDokumente: true,
    medienZiel: "objekt",
    wohnungBilder: true,
    objektDokumenteTitel: "Hausunterlagen, gelten für das ganze Objekt",
    wohnungDokumenteTitel: "Wohnungsunterlagen, je Einheit getrennt",
  };
}

/**
 * Die Unterlagen, die die Objektseite zu einem Objekt zeigt: jede Zeile aus
 * `objekt_dokumente`, hinter der eine Datei steht. Die leeren Platzhalter
 * aus `defaultDokumente` fallen weg.
 *
 * Objektseite und Einheitsseite nehmen beide diese Funktion, damit auf der
 * Einheitsseite nie etwas anderes steht als auf der Objektseite.
 */
export function objektseitenDokumente(objekt: Pick<ObjektData, "dokumente">): ObjektDokument[] {
  return (objekt.dokumente || []).filter((d) => d.url);
}

/** Der Sammelordner des Objekts, falls einer gepflegt ist. */
export function objektUnterlagenLink(objekt: Pick<ObjektData, "meta">): string {
  return String((objekt.meta as { unterlagenLink?: unknown } | undefined)?.unterlagenLink || "").trim();
}

/** Was die Ampel von einer Objekt- oder Wohnungsunterlage braucht. */
type FreigabeQuelle = { name: string; url: string; kategorie?: string | null; sichtbar?: boolean } & DokumentFreigabeFelder;

/**
 * Die Angaben für die Dokumenten-Ampel (`_shared/dokument-freigabe.ts`).
 *
 * „Intern von Hand" heißt: Kategorie „intern" oder `sichtbar = false`. Bei
 * einer Datei aus Investagon zählt `sichtbar` nicht (Voreinstellung des
 * Imports), intern ist sie dort nur als Eigenprovisionsvereinbarung
 * (`istInterneInvestagonUnterlage`); sonst entscheidet die Ampel.
 */
export function freigabeDokument(d: FreigabeQuelle, investagonKategorie?: string): FreigabeDokument {
  return {
    name: d.name,
    kategorie: d.kategorie,
    investagonKategorie: investagonKategorie ?? null,
    internVonHand: internVonHandAusZeile(d),
    kundenFreigabe: d.kundenFreigabe ?? null,
    geschwaerzt: d.geschwaerzt === true,
  };
}

/**
 * Erscheint diese Objektunterlage beim Kunden, also in der Kundenansicht?
 *
 * Seit dem 23.09.2026 entscheidet die Dokumenten-Ampel: Grün von selbst,
 * Gelb nach Freigabe durch Admin oder Inhaber, Rot (Mietvertrag, Grundbuch)
 * nur als geprüft geschwärzte und freigegebene Kopie. Maßgeblich ist der
 * Server, der dieselbe Regel rechnet; hier steht sie, damit das Kennzeichen
 * im CRM ehrlich sagt, was hinausgeht.
 */
export function kundeSiehtObjektDokument(d: FreigabeQuelle, investagonKategorie?: string): boolean {
  return darfZumKunden(freigabeDokument(d, investagonKategorie));
}

/**
 * Dasselbe für eine Wohnungsunterlage. Bis zum 23.09.2026 entschied hier
 * allein die Kategorie, und damit galten auch die Standardeinträge
 * „Mietvertrag" und „GBA Wohnung" als „Kunde sieht" (Befund 2 im Bauplan).
 */
export function kundeSiehtWohnungDokument(d: FreigabeQuelle, investagonKategorie?: string): boolean {
  return darfZumKunden(freigabeDokument(d, investagonKategorie));
}

/**
 * Ob Admin oder Inhaber an dieser Unterlage umschalten können.
 *
 *   bereit           Zeile aus der Tabelle, die Migration ist gelaufen.
 *   migration_fehlt  Zeile aus der Tabelle, aber ohne die neuen Spalten.
 *   nur_grundregel   Die Datei hängt nur in `wohnungen.meta.dokumente`
 *                    (so speichert das CRM von Hand hochgeladene
 *                    Wohnungsunterlagen). Dort gibt es keine geschützte
 *                    Spalte, es gilt die Grundregel der Ampel.
 */
export type FreigabeSchalter = "bereit" | "migration_fehlt" | "nur_grundregel";

/** Eine Zeile im Reiter „Dokumente" von Einheits- und Objektseite. */
export interface EinheitUnterlage {
  id: string;
  name: string;
  url: string;
  /** Die Art der Unterlage, als Text neben dem Namen. */
  art: "Intern" | "Objektunterlagen" | "Wohnungsunterlagen";
  /** Wer sie sieht: der Kunde oder nur das CRM. Folgt `darfZumKunden`. */
  kundeSieht: boolean;
  /**
   * Die Kategorie aus Investagon (Rohwert, etwa „layout"), sofern die Datei
   * von dort kommt und sich im Originaldatensatz wiederfindet. Sie bestimmt
   * den Oberbegriff in der Liste, siehe `dokumentGruppen.ts`.
   */
  investagonKategorie?: string;
  /** Aus welcher Tabelle die Zeile stammt. Fehlt bei Einträgen nur aus `meta.dokumente`. */
  tabelle?: "objekt_dokumente" | "wohnungs_dokumente";
  /** Die Ampelfarbe nach Oberbegriff und Titel. */
  ampel?: Ampel;
  /** Beim Hochladen ausdrücklich als intern markiert (nie bei Investagon-Dateien). */
  internVonHand?: boolean;
  /** Die Entscheidung von Admin oder Inhaber, leer heißt Grundregel. */
  kundenFreigabe?: "frei" | "gesperrt" | null;
  /** Vom Admin als geschwärzt geprüft markiert. */
  geschwaerzt?: boolean;
  /** Ob sich hier umschalten lässt, siehe `FreigabeSchalter`. */
  freigabeSchalter?: FreigabeSchalter;
}

/** Die Felder der Ampel für eine Zeile im Reiter „Dokumente". */
function ampelFelder(
  d: FreigabeQuelle,
  investagonKategorie: string | undefined,
  tabelle: EinheitUnterlage["tabelle"],
): Pick<EinheitUnterlage, "kundeSieht" | "tabelle" | "ampel" | "internVonHand" | "kundenFreigabe" | "geschwaerzt" | "freigabeSchalter"> {
  const freigabe = freigabeDokument(d, investagonKategorie);
  return {
    kundeSieht: darfZumKunden(freigabe),
    ...(tabelle ? { tabelle } : {}),
    ampel: dokumentAmpel(freigabe),
    internVonHand: freigabe.internVonHand,
    kundenFreigabe: freigabe.kundenFreigabe ?? null,
    geschwaerzt: freigabe.geschwaerzt === true,
    freigabeSchalter: !tabelle ? "nur_grundregel" : d.freigabeSpalten ? "bereit" : "migration_fehlt",
  };
}

/** Eine Zeile im Reiter als Eingabe für die Ampel. */
export function freigabeVonEintrag(e: EinheitUnterlage): FreigabeDokument {
  return {
    name: e.name,
    investagonKategorie: e.investagonKategorie ?? null,
    internVonHand: e.internVonHand === true,
    kundenFreigabe: e.kundenFreigabe ?? null,
    geschwaerzt: e.geschwaerzt === true,
  };
}

/**
 * Die Objektunterlagen als Zeilen für den Reiter „Dokumente".
 *
 * Objektseite und Einheitsseite nehmen beide diese Funktion, damit auf beiden
 * dieselben Zeilen mit derselben Einordnung stehen.
 */
export function objektUnterlagenEintraege(objekt: Pick<ObjektData, "dokumente" | "meta">): EinheitUnterlage[] {
  const kategorie = investagonKategorieSuche(objekt);
  return objektseitenDokumente(objekt).map((d) => {
    const investagonKategorie = kategorie(d.name);
    return {
      id: d.id, name: d.name, url: d.url,
      art: d.kategorie === "intern" ? "Intern" : "Objektunterlagen",
      investagonKategorie,
      ...ampelFelder(d, investagonKategorie, "objekt_dokumente"),
    };
  });
}

export interface EinheitUnterlagenGruppe {
  schluessel: "objekt" | "wohnung";
  titel: string;
  link: string;
  linkLabel: string;
  eintraege: EinheitUnterlage[];
}

/**
 * Die Gruppen im Reiter „Dokumente" der Einheitsseite.
 *
 * Christian am 23.09.2026: Wer eine Wohnung öffnet, soll dort auch Exposé,
 * Energieausweis, Teilungserklärung und alles andere zum Haus finden, ohne auf
 * die Objektseite zurückzumüssen. Bis dahin standen die Objektunterlagen nur
 * bei einem Objekt mit genau einer Einheit hier, weil es dort keine
 * Objektseite gibt. Jetzt stehen sie auf jeder Einheitsseite, getrennt von
 * dem, was nur zu dieser Wohnung gehört.
 *
 * Die Objektunterlagen sind genau die der Objektseite, samt ihrer Einordnung
 * „Kunde sieht" oder „nur CRM". Eine interne Unterlage bleibt also auch hier
 * als intern gekennzeichnet. Wer sie überhaupt lesen darf, entscheidet nicht
 * diese Funktion, sondern die Datenbank: `objekt_dokumente` und
 * `wohnungs_dokumente` geben ihre Zeilen nur an interne Rollen heraus, und die
 * Seite selbst ist wie die Objektseite nur für admin und inhaber offen (siehe
 * `ObjektseiteZugang`).
 *
 * Eine Gruppe ohne Datei und ohne Sammelordner fällt weg, damit keine leere
 * Überschrift stehen bleibt. Sind beide leer, kommt eine leere Liste zurück.
 */
export function einheitUnterlagenGruppen(
  objekt: Pick<ObjektData, "dokumente" | "meta">,
  wohnung: Pick<ObjektWohnung, "dokumente" | "unterlagenLink" | "investagonRaw">,
): EinheitUnterlagenGruppe[] {
  const zumObjekt: EinheitUnterlagenGruppe = {
    schluessel: "objekt",
    titel: "Dokumente zum Objekt",
    link: objektUnterlagenLink(objekt),
    linkLabel: "Objektunterlagen öffnen",
    eintraege: objektUnterlagenEintraege(objekt),
  };
  // Die Einheit trägt ihren Originaldatensatz direkt, nicht unter `meta`.
  const wohnungKategorie = investagonKategorieSuche({ meta: { investagonRaw: wohnung.investagonRaw } });
  const zurWohnung: EinheitUnterlagenGruppe = {
    schluessel: "wohnung",
    titel: "Dokumente zu dieser Wohnung",
    link: wohnung.unterlagenLink?.trim() || "",
    linkLabel: "Wohnungsunterlagen öffnen",
    eintraege: (wohnung.dokumente || []).filter((d) => d.url).map((d) => {
      const investagonKategorie = wohnungKategorie(d.name);
      return {
        id: d.id, name: d.name, url: d.url,
        art: d.kategorie === "intern" ? "Intern" : "Wohnungsunterlagen",
        investagonKategorie,
        ...ampelFelder(d, investagonKategorie, d.ausTabelle ? "wohnungs_dokumente" : undefined),
      };
    }),
  };
  return [zumObjekt, zurWohnung].filter((g) => g.eintraege.length > 0 || g.link);
}
