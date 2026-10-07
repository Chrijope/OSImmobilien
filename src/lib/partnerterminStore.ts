import { supabase } from "@/integrations/supabase/client";
import { funktionFehlt, spalteFehlt } from "@/lib/buchungStore";
import { PARTNERTERMIN_FEHLER_TEXTE, type PartnerterminFehlerCode } from "@/lib/partnerterminFehlerTexte";

/**
 * Die Terminseite des Vertriebspartners, unter `/terminwahl/:token`.
 *
 * ## Warum es diesen Weg gibt
 *
 * Jeder Partner terminiert über seinen eigenen Kalenderdienst, in der Regel
 * Calendly. Der meldet uns nichts zurück: Der Kunde bucht, und im CRM steht
 * nichts. Christian hat am 21.09.2026 dieselbe Lösung wie beim Bewerber
 * bestellt: eine eigene Seite, in der der fremde Kalender eingebettet steckt,
 * und daneben trägt man die gebuchte Zeit ein. Seit dem 29.09.2026 nur noch
 * der angemeldete Partner, dem der Link gehört, nicht mehr der Kunde.
 *
 * ## Warum hier nichts abstürzt, wenn die Migration noch nicht gelaufen ist
 *
 * Migrationen kommen über git, werden aber von Hand in Supabase ausgeführt.
 * Fehlt eine der beiden Datenbankfunktionen, liefert das Lesen `null` samt
 * Grund, und die Seite sagt das, statt weiß zu bleiben.
 */

/** Eine der vier Gesprächsarten, für die der Partner einen Kalender hinterlegt hat. */
export interface PartnerAnlass {
  /** `erstgespraech`, `beratung`, `objektvorstellung` oder `finanzierungsgespraech`. */
  anlass: string;
  bezeichnung: string;
  beschreibung: string;
  dauerMinuten: number;
  /** Der eigene Buchungskalender des Partners für genau diesen Anlass. */
  url: string;
}

/** Ein bestätigter Termin, so wie ihn die Seite anzeigt. */
export interface PartnerTermin {
  /** JJJJ-MM-TT. */
  datum: string;
  /** HH:MM. */
  uhrzeit: string;
  anlass: string;
  bezeichnung: string;
  dauerMinuten: number;
  /**
   * Lässt sich die Zeit noch korrigieren? Nur solange der Termin nicht mehr
   * als eine Stunde vorbei ist; danach legt derselbe Anlass eine neue Buchung
   * an. Ohne Angabe der Datenbank (vor Migration 20260929130000) wahr.
   */
  korrigierbar: boolean;
  /** Das Investment, an dem der Termin hängt, soweit bekannt. */
  investmentId: string | null;
}

/** Ein laufendes Investment des Kunden, für die Auswahl „Gehört zu". */
export interface PartnerInvestment {
  id: string;
  /** Objekt und Wohnung, oder leer, wenn beides noch nicht gepflegt ist. */
  bezeichnung: string;
}

/**
 * Der Kunde, zu dem der Termin gehört.
 *
 * Kommt nur, wenn der Aufrufer als Besitzer des Links angemeldet ist, also der
 * Partner selbst. Für alle anderen bleibt es `null`. Die Grenze zieht die
 * Datenbank und nicht diese Seite.
 *
 * Deshalb ist `kunde` zugleich das Zeichen „der Aufrufer besitzt den Link“:
 * Für den Besitzer schickt `partnertermin_zugang` immer ein Objekt, auch ein
 * leeres, für alle anderen `null`. Die Seite weist ohne `kunde` ab, damit das
 * schon gilt, bevor Migration 20260929130000 gelaufen ist.
 */
export interface PartnerKunde {
  name: string;
  email: string;
  telefon: string;
}

export interface PartnerterminZugang {
  berater: {
    name: string;
    email: string | null;
    telefon: string | null;
    bild: string | null;
    position?: string | null;
    ort?: string | null;
    zitat?: string | null;
  };
  zeitzone: string;
  /** Nur der Vorname, für die Anrede. Mehr gibt die Datenbank nicht heraus. */
  vorname: string;
  anlaesse: PartnerAnlass[];
  /** Der zuletzt eingetragene Termin, sonst `null`. */
  termin: PartnerTermin | null;
  /**
   * Je Gesprächsart der zuletzt eingetragene Termin. Seit Migration
   * 20260929130000 bekommt jede Gesprächsart eine eigene Buchung. Vorher
   * schickt die Datenbank nur `termin`, dann steht hier genau dieser.
   */
  termine: PartnerTermin[];
  /**
   * Das Investment, das der Partner beim Erzeugen des Links gewählt hat.
   *
   * Steht es fest, entfällt die Frage „Gehört zu" auf der Seite. Das ist der
   * Normalfall, wenn der Termin aus einem Investment heraus vereinbart wird.
   */
  investmentId: string | null;
  /** Die laufenden Investments des Kunden, für die Auswahl. */
  investments: PartnerInvestment[];
  /** Nur für den Partner gefüllt, siehe `PartnerKunde`. */
  kunde: PartnerKunde | null;
}

export type PartnerterminErgebnis =
  | { ok: true; termin: PartnerTermin }
  /**
   * `grund` ist der deutsche Satz, `code` sein stabiler Schlüssel. Über den
   * Schlüssel zeigt die Seite den Satz in der gewählten Sprache
   * (`partnerterminFehlerTexte.ts`).
   */
  | {
      ok: false;
      grund: string;
      code: PartnerterminFehlerCode;
      /**
       * Fehlercode und HTTP-Status, etwa „PGRST202, HTTP 404“. Nur bei
       * technischen Fehlern gesetzt. Die Seite hängt ihn an den Fehlercode,
       * damit der Partner beim Support mehr sagen kann als „ging nicht“. Keine
       * Meldungstexte der Datenbank, die können Tabellen- oder Spaltennamen
       * enthalten.
       */
      technik?: string;
    };

/** Fehlschlag mit deutschem Satz und Schlüssel aus einer Quelle. */
function fehlschlag(code: PartnerterminFehlerCode, technik?: string): PartnerterminErgebnis {
  return technik
    ? { ok: false, grund: PARTNERTERMIN_FEHLER_TEXTE.de[code], code, technik }
    : { ok: false, grund: PARTNERTERMIN_FEHLER_TEXTE.de[code], code };
}

/** Status 0 heißt bei supabase-js: keine Antwort, der Aufruf kam nie an. */
function technischeKennung(fehler: { code?: unknown }, status: unknown): string {
  const teile: string[] = [];
  if (typeof fehler.code === "string" && fehler.code) teile.push(fehler.code);
  if (typeof status === "number") teile.push(`HTTP ${status}`);
  return teile.join(", ");
}

/**
 * War die Verbindung gestört, statt dass etwas kaputt ist?
 *
 * PGRST000 bis PGRST002 kommen mit HTTP 503, wenn PostgREST die Datenbank kurz
 * nicht erreicht. 502 und 504 meldet das Gateway davor. Status 0 beziehungsweise
 * „Failed to fetch“ heißt, der Aufruf kam gar nicht erst an. In allen Fällen
 * hilft ein zweiter Versuch.
 */
function verbindungGestoert(fehler: { code?: unknown; message?: unknown }, status: unknown): boolean {
  if (status === 502 || status === 503 || status === 504 || status === 0) return true;
  if (typeof fehler.code === "string" && /^PGRST00[012]$/.test(fehler.code)) return true;
  return typeof fehler.message === "string" && /failed to fetch|networkerror|load failed/i.test(fehler.message);
}

/** Pausen vor dem zweiten und dritten Versuch. */
export const WIEDERHOLUNG_PAUSEN_MS = [800, 2000];

type RpcAntwort = { data: unknown; error: { code?: unknown; message?: unknown } | null; status?: number };

/**
 * Ein Aufruf, bei gestörter Verbindung still bis zu zweimal wiederholt.
 *
 * Christian am 29.09.2026: „Im besten Fall kommt keine Fehlermeldung.“ Eine
 * kurze Störung ist nach einer Sekunde meist vorbei, der Nutzer soll davon
 * nichts merken. Andere Fehler werden nicht wiederholt, sie gingen beim
 * zweiten Mal genauso schief.
 *
 * Doppelt eingetragen wird dabei nichts, siehe `bestaetigePartnertermin`.
 */
async function mitWiederholung(aufruf: () => PromiseLike<RpcAntwort>): Promise<RpcAntwort> {
  const einmal = async (): Promise<RpcAntwort> => {
    try {
      return await aufruf();
    } catch (e) {
      // supabase-js wirft normalerweise nicht, ein Netzabbruch soll trotzdem als Störung zählen.
      return { data: null, error: { code: "", message: String(e) }, status: 0 };
    }
  };
  let antwort = await einmal();
  for (const pause of WIEDERHOLUNG_PAUSEN_MS) {
    if (!antwort.error || !verbindungGestoert(antwort.error, antwort.status)) break;
    await new Promise((fertig) => setTimeout(fertig, pause));
    antwort = await einmal();
  }
  return antwort;
}

function text(wert: unknown): string {
  return typeof wert === "string" ? wert : "";
}

function zahl(wert: unknown, ersatz: number): number {
  return typeof wert === "number" && Number.isFinite(wert) ? wert : ersatz;
}

function leseTermin(wert: unknown): PartnerTermin | null {
  if (!wert || typeof wert !== "object") return null;
  const t = wert as Record<string, unknown>;
  if (!text(t.datum) || !text(t.uhrzeit)) return null;
  return {
    datum: text(t.datum),
    uhrzeit: text(t.uhrzeit),
    anlass: text(t.anlass),
    bezeichnung: text(t.bezeichnung),
    dauerMinuten: zahl(t.dauer_minuten, 60),
    korrigierbar: t.korrigierbar !== false,
    investmentId: text(t.investment_id) || null,
  };
}

function leseZugang(daten: unknown): PartnerterminZugang | null {
  if (!daten || typeof daten !== "object") return null;
  const d = daten as Record<string, unknown>;
  const b = (d.berater && typeof d.berater === "object" ? d.berater : {}) as Record<string, unknown>;

  const anlaesse = Array.isArray(d.anlaesse)
    ? d.anlaesse.flatMap((eintrag) => {
        if (!eintrag || typeof eintrag !== "object") return [];
        const a = eintrag as Record<string, unknown>;
        if (!text(a.anlass) || !text(a.url)) return [];
        return [{
          anlass: text(a.anlass),
          bezeichnung: text(a.bezeichnung),
          beschreibung: text(a.beschreibung),
          dauerMinuten: zahl(a.dauer_minuten, 60),
          url: text(a.url),
        }];
      })
    : [];

  return {
    berater: {
      name: text(b.name) || "Dein Ansprechpartner",
      email: text(b.email) || null,
      telefon: text(b.telefon) || null,
      bild: text(b.bild) || null,
      position: text(b.position) || null,
      ort: text(b.ort) || null,
      zitat: text(b.zitat) || null,
    },
    zeitzone: text(d.zeitzone) || "Europe/Berlin",
    vorname: text(d.vorname),
    anlaesse,
    termin: leseTermin(d.termin),
    // Ohne `termine` (vor der Migration) steht der eine Termin für seinen Anlass.
    termine: Array.isArray(d.termine)
      ? d.termine.flatMap((t) => leseTermin(t) ?? [])
      : [leseTermin(d.termin)].flatMap((t) => t ?? []),
    investmentId: text(d.investment_id) || null,
    investments: Array.isArray(d.investments)
      ? d.investments.flatMap((eintrag) => {
          if (!eintrag || typeof eintrag !== "object") return [];
          const i = eintrag as Record<string, unknown>;
          if (!text(i.id)) return [];
          return [{ id: text(i.id), bezeichnung: text(i.bezeichnung) }];
        })
      : [],
    // Auch ein leeres Objekt zählt, siehe `PartnerKunde`.
    kunde: (() => {
      if (!d.kunde || typeof d.kunde !== "object") return null;
      const k = d.kunde as Record<string, unknown>;
      return { name: text(k.name), email: text(k.email), telefon: text(k.telefon) };
    })(),
  };
}

/** Warum der Zugang nicht kam. */
export type ZugangFehler = "unbekannt" | "migration" | "technisch" | "verbindung";

export interface ZugangErgebnis {
  zugang: PartnerterminZugang | null;
  /** Nur gesetzt, wenn `zugang` fehlt. */
  grund?: ZugangFehler;
  /** Fehlercode und HTTP-Status, nur bei technischen Gründen. */
  technik?: string;
}

/** Welcher Fehlertext zu welchem Ladegrund gehört. */
export const ZUGANG_FEHLER_CODE: Record<ZugangFehler, PartnerterminFehlerCode> = {
  unbekannt: "linkUngueltig",
  migration: "funktionFehlt",
  technisch: "allgemein",
  verbindung: "verbindung",
};

/**
 * Den Zugang zum Token holen.
 *
 * ## Warum hier drei Gründe unterschieden werden
 *
 * Bis zum 21.09.2026 gab diese Funktion bei jedem Fehler schlicht `null`
 * zurück, und die Seite schrieb „Dieser Link ist nicht mehr gültig". Damit sah
 * ein kaputtes Backend für den Kunden genauso aus wie ein alter Link, und für
 * uns auch: Im Fall „Funktion fehlt" wurde nicht einmal ins Protokoll
 * geschrieben.
 *
 * Genau diese Falle hat am selben Tag schon einmal einen halben Tag gekostet,
 * damals auf der Bewerber-Terminseite. Deshalb steht der Grund jetzt dabei,
 * und protokolliert wird in jedem Fall außer beim schlicht unbekannten Token.
 */
export async function ladePartnerterminMitGrund(token: string): Promise<ZugangErgebnis> {
  if (!token) return { zugang: null, grund: "unbekannt" };

  const { data, error, status } = await mitWiederholung(() => supabase.rpc(
    "partnertermin_zugang" as never,
    { _token: token } as never,
  ) as unknown as PromiseLike<RpcAntwort>);

  if (error) {
    const technik = technischeKennung(error, status);
    /*
      Eine fehlende Spalte ist kein fehlender Bausatz: Die Funktion ist da, sie
      passt nur nicht zur Tabelle. Das muss auffallen und darf nicht als
      "Migration kommt gleich" beschwichtigt werden.
    */
    if (spalteFehlt(error)) {
      console.error("ladePartnertermin: Spalte fehlt in der Datenbank", error);
      return { zugang: null, grund: "technisch", technik };
    }
    if (verbindungGestoert(error, status)) {
      console.error("ladePartnertermin: Verbindung gestört", error);
      return { zugang: null, grund: "verbindung", technik };
    }
    if (funktionFehlt(error)) {
      console.error("ladePartnertermin: Funktion nicht erreichbar", error);
      return { zugang: null, grund: "migration", technik };
    }
    console.error("ladePartnertermin:", error);
    return { zugang: null, grund: "technisch", technik };
  }

  const zugang = leseZugang(data);
  // Kein Fehler, aber auch kein Zugang: Das ist der echte tote Link.
  return zugang ? { zugang } : { zugang: null, grund: "unbekannt" };
}

/** Kurzfassung für Aufrufer, die den Grund nicht brauchen. */
export async function ladePartnertermin(token: string): Promise<PartnerterminZugang | null> {
  return (await ladePartnerterminMitGrund(token)).zugang;
}

/**
 * Datum und Uhrzeit eintragen.
 *
 * Geprüft wird in der Datenbank und nicht hier: Besitz des Links, Investment
 * und Zeitraum. Was im Browser läuft, lässt sich umgehen.
 *
 * Seit Migration 20260929130000 bekommt jede Gesprächsart eine eigene
 * Buchung. Derselbe Anlass mit noch nicht vorbeiem Termin wird aktualisiert
 * („Zeit korrigieren“), ein anderer Anlass legt eine neue Buchung an.
 */
export async function bestaetigePartnertermin(
  token: string,
  anlass: string,
  datum: string,
  uhrzeit: string,
  /**
   * Zu welchem Investment der Termin gehört.
   *
   * Ohne Angabe entscheidet die Datenbank: das Investment am Link, sofern es
   * zum Kunden gehört und noch läuft, sonst das einzige laufende. Bei
   * mehreren bleibt es leer, denn das falsche wäre schlimmer als keines.
   */
  investmentId?: string | null,
): Promise<PartnerterminErgebnis> {
  if (!token) return fehlschlag("linkUngueltig");
  if (!anlass) return fehlschlag("anlassFehlt");
  if (!datum || !uhrzeit) return fehlschlag("datumFehlt");

  /*
    Wiederholt wird nur bei gestörter Verbindung. Kam der erste Aufruf in der
    Datenbank an und nur die Antwort nicht zurück, entsteht trotzdem nichts
    doppelt: Der zweite Aufruf trägt denselben Anlass und eine Zeit, die nicht
    vorbei ist, also aktualisiert `partnertermin_bestaetigen` die eben
    angelegte Buchung, statt eine zweite anzulegen (Sperre je Link in der
    Datenbank), und die Stufe rückt nur vorwärts. Allein ein Link mit
    `einmalig` lehnt den zweiten Aufruf ab, darum kümmert sich der Zweig
    „bereits ein Termin“ unten.
  */
  const { data, error, status } = await mitWiederholung(() => supabase.rpc(
    "partnertermin_bestaetigen" as never,
    {
      _token: token,
      _anlass: anlass,
      _datum: datum,
      _uhrzeit: uhrzeit,
      _investment_id: investmentId || null,
    } as never,
  ) as unknown as PromiseLike<RpcAntwort>);
  if (!error) {
    const termin = leseTermin(data);
    if (termin) return { ok: true, termin };
    /*
      Kein Fehler, aber auch kein Termin zurueck. Das darf nicht als Erfolg
      durchgehen: Die Seite zeigte dem Kunden sonst eine Bestaetigung ohne Zeit.
    */
    console.error("bestaetigePartnertermin: Antwort ohne Termin", data);
    return fehlschlag("allgemein");
  }

  /*
    Eine fehlende Spalte ist nie ein Grund zurueckzufallen: Die Funktion ist da,
    sie passt nur nicht zur Tabelle. Frueher lief so ein Fall in den Zweig
    darunter und wurde als "Migration noch nicht gelaufen" beschwichtigt.
  */
  const technik = technischeKennung(error, status);

  if (spalteFehlt(error)) {
    console.error("bestaetigePartnertermin: Spalte fehlt in der Datenbank", error);
    return fehlschlag("allgemein", technik);
  }

  if (verbindungGestoert(error, status)) {
    console.error("bestaetigePartnertermin: Verbindung gestört", error);
    return fehlschlag("verbindung", technik);
  }

  if (funktionFehlt(error)) {
    /*
      Entweder ist die Migration noch nicht gelaufen, oder sie ist gerade
      gelaufen und PostgREST kennt die Funktion noch nicht: Sein Schema-Cache
      laedt sich erst nach einem Moment neu. Deshalb laedt der Text zum zweiten
      Versuch ein, statt aufzugeben.
    */
    console.error("bestaetigePartnertermin: Funktion nicht erreichbar", error);
    return fehlschlag("funktionFehlt", technik);
  }

  /*
    Die Meldungen der Datenbank sind kurz und lesbar, durchgereicht wird
    trotzdem nichts Unbekanntes: Jede Meldung bekommt ihren eigenen Satz aus
    `partnerterminFehlerTexte.ts`, der sagt, wo der Fehler liegt und was der
    Partner tun kann.
  */
  const meldung = String((error as { message?: string }).message || "");
  if (/Vergangenheit/i.test(meldung)) return fehlschlag("vergangenheit");
  if (/Zukunft/i.test(meldung)) return fehlschlag("zukunft");
  if (/Datum und Uhrzeit/i.test(meldung)) return fehlschlag("unvollstaendig");
  if (/bereits ein Termin/i.test(meldung)) {
    /*
      Steht über den Link schon genau dieser Termin, ist das kein Fehler: Meist
      hat ein früherer Versuch gespeichert, nur seine Antwort ging verloren.
      Dann gilt der vorhandene Termin als bestätigt.
    */
    const vorhanden = (await ladePartnerterminMitGrund(token)).zugang?.termine
      .find((t) => t.anlass === anlass && t.datum === datum && t.uhrzeit === uhrzeit);
    if (vorhanden) return { ok: true, termin: vorhanden };
    return fehlschlag("bereitsTermin");
  }
  if (/Gespraechsart|Gesprächsart/i.test(meldung)) return fehlschlag("gespraechsart");
  if (/Zu viele/i.test(meldung)) return fehlschlag("zuSchnell");
  if (/Kein Zugang/i.test(meldung)) return fehlschlag("linkUngueltig");
  console.error("bestaetigePartnertermin:", error);
  return fehlschlag("allgemein", technik);
}

/** Die Adresse der Terminseite zu einem Buchungstoken. */
export function partnerterminPfad(token: string): string {
  return `/terminwahl/${token}`;
}
