/**
 * Der nächste geplante Kontakt zu einem Kunden.
 *
 * Bisher hat die Pipeline-Kachel in der Stufe Follow-Up das Feld
 * `verstecktBis` angezeigt. Das Feld beschreibt aber nur die Wartephase nach
 * einem "Nicht erreicht" und wird nicht angefasst, wenn jemand über die
 * Schnellaktion eine neue Aufgabe anlegt. Die Kachel zeigte deshalb ein altes
 * Datum, obwohl längst ein neuer Termin stand.
 *
 * Hier laufen alle Quellen zusammen, die für jeden sichtbar sind:
 *   - Aufgaben am Kunden (Tabelle `aufgaben`, seit der Migration für alle
 *     internen Rollen lesbar)
 *   - offene Follow-Ups (Tabelle `follow_ups`)
 *   - fest gebuchte Termine am Kontakt (Erstgespräch, Beratungsgespräch)
 *   - `verstecktBis` als letzte Rückfallebene
 *
 * Genommen wird der nächste Termin in der Zukunft. Gibt es keinen, wird der
 * zuletzt fällige zurückgegeben und als überfällig gekennzeichnet, damit die
 * Kachel nicht leer bleibt.
 */

export type KontaktQuelle =
  | "aufgabe"
  | "follow_up"
  | "termin"
  | "videotermin"
  | "wartephase";

export interface GeplanterKontakt {
  /** ISO-Zeitstempel. */
  zeitpunkt: string;
  quelle: KontaktQuelle;
  /** Kurzer Text für die Kachel, etwa "Aufgabe" oder "Erstgespräch". */
  bezeichnung: string;
  /** Titel der Aufgabe beziehungsweise des Follow-Ups, falls vorhanden. */
  titel?: string;
  /** True, wenn der Zeitpunkt bereits vorbei ist. */
  ueberfaellig: boolean;
}

export interface KontaktEingabe {
  /** Aufgaben am Kunden, bereits auf offen gefiltert. */
  aufgaben?: Array<{
    titel?: string;
    faelligAm?: string;
    /** Getrennt gepflegte Uhrzeit. Sie schlaegt die im Zeitstempel, siehe zuZeitpunkt. */
    uhrzeit?: string;
    typ?: string;
    /**
     * Vom System nach einem "nicht erreicht" angelegt. Zählt als Wiedervorlage,
     * nicht als vereinbarter Termin.
     */
    wiedervorlage?: boolean;
    /**
     * Ab Beginn des Fälligkeitstags fällig, nicht erst um 23:59. Für Aufträge,
     * die sofort Handlungsbedarf sind und den Lead nicht als "geplant" grün
     * färben dürfen, etwa "Objekt-Vorstellungstermin vereinbaren".
     */
    sofortFaellig?: boolean;
  }>;
  /** Offene Follow-Ups zum Kunden. */
  followUps?: Array<{ titel?: string; faelligAm?: string; uhrzeit?: string }>;
  /** Feste Termine am Kontakt. */
  termine?: Array<{
    datum?: string;
    uhrzeit?: string;
    bezeichnung: string;
    /** Am Termin haengt ein Videoraum oder ein Videodienst, siehe istVideoTermin. */
    video?: boolean;
  }>;
  /** Wartephase nach "Nicht erreicht". */
  verstecktBis?: string;
  /**
   * Schon zusammengeführte geplante Schritte mit fertigem Zeitpunkt, aus
   * `geplanteAktionenFuer` (kontaktTermine.ts). Fehlt `bezeichnung`, gilt
   * die der Quelle.
   */
  geplant?: Array<{ zeit: number; quelle: Exclude<KontaktQuelle, "wartephase">; bezeichnung?: string; titel?: string }>;
}

const QUELLE_BEZEICHNUNG: Record<KontaktQuelle, string> = {
  aufgabe: "Aufgabe",
  follow_up: "Follow-Up",
  termin: "Termin",
  videotermin: "Videomeeting",
  wartephase: "Wiedervorlage",
};

/**
 * Ist an dem Termin ein Videogespräch hinterlegt?
 *
 * Erkannt wird das allein am hinterlegten Link, ein eigenes Feld dafür gibt es
 * nicht. Zwei Formen kommen vor:
 *
 *   - "/raum/<token>" ist der eigene Videoraum. Die Datenbank schreibt ihn
 *     bewusst als Pfad, weil sie die öffentliche Adresse der Anwendung nicht
 *     kennt.
 *   - Eine vollständige Adresse ist ein fremder Dienst, etwa zoom.us.
 *
 * Ein Termin ohne Link findet vor Ort oder am Telefon statt und bleibt ein
 * gewöhnlicher Termin. Freitext, der gar kein Link ist, zählt ebenfalls nicht.
 */
export function istVideoTermin(zoomLink?: string | null): boolean {
  const link = (zoomLink || "").trim();
  if (!link) return false;
  if (link.startsWith("/raum/")) return true;
  return /^https?:\/\//i.test(link) || link.toLowerCase().startsWith("www.");
}

/** Wandelt Datum plus optionale Uhrzeit in einen Zeitstempel. Ungültiges ergibt null. */
export function zuZeitpunkt(datum?: string, uhrzeit?: string): number | null {
  if (!datum) return null;
  const s = String(datum).trim();
  if (!s) return null;

  /*
   * Ein voller Zeitstempel, aber eine eigene Uhrzeit steht daneben.
   *
   * Aufgaben führen beides: `faellig_am` als Zeitstempel und `uhrzeit` als
   * eigenes Feld. Beim Anlegen werden sie zusammen gesetzt, danach aber nicht
   * mehr gemeinsam gepflegt. Wer die Uhrzeit später ändert, ändert nur das
   * eine Feld, und die beiden driften auseinander.
   *
   * Gemeldet bei Andre Goller: In der Aktivitätsübersicht stand 18 Uhr, im
   * Hinweis hinter dem Namen 10 Uhr. Beides stammte aus derselben Aufgabe,
   * nur aus verschiedenen Feldern.
   *
   * Die ausdrücklich gepflegte Uhrzeit gewinnt. Sie ist das, was jemand
   * zuletzt eingetragen hat.
   */
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    if (uhrzeit && /^\d{1,2}:\d{2}/.test(uhrzeit)) {
      // Der Tag in Ortszeit, nicht die ersten zehn Zeichen: Der Zeitstempel
      // steht in UTC, eine Aufgabe um 01:00 Uhr deutscher Zeit trägt dort
      // noch den Vortag und rutschte so einen Tag nach vorn (bis 04.10.2026).
      const ort = new Date(s);
      const tagTeil = isNaN(ort.getTime())
        ? s.slice(0, 10)
        : `${ort.getFullYear()}-${String(ort.getMonth() + 1).padStart(2, "0")}-${String(ort.getDate()).padStart(2, "0")}`;
      const zeitTeil = uhrzeit.slice(0, 5).padStart(5, "0");
      const mitUhrzeit = new Date(`${tagTeil}T${zeitTeil}:00`).getTime();
      if (!isNaN(mitUhrzeit)) return mitUhrzeit;
    }
    const t = new Date(s).getTime();
    return isNaN(t) ? null : t;
  }

  let tag = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    tag = s;
  } else {
    const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (de) {
      const [, dd, mm, yyyy] = de;
      tag = `${yyyy}-${String(+mm).padStart(2, "0")}-${String(+dd).padStart(2, "0")}`;
    }
  }
  if (!tag) return null;

  // Ohne Uhrzeit zählt das Ende des Tages: Eine Aufgabe für heute ist um
  // 09:00 noch nicht überfällig.
  const zeit = uhrzeit && /^\d{1,2}:\d{2}/.test(uhrzeit)
    ? uhrzeit.slice(0, 5).padStart(5, "0")
    : "23:59";
  const t = new Date(`${tag}T${zeit}:00`).getTime();
  return isNaN(t) ? null : t;
}

interface Kandidat {
  zeit: number;
  quelle: KontaktQuelle;
  bezeichnung: string;
  titel?: string;
}

function sammleKandidaten(e: KontaktEingabe): Kandidat[] {
  const out: Kandidat[] = [];

  for (const a of e.aufgaben || []) {
    const zeit = zuZeitpunkt(a.faelligAm, a.sofortFaellig ? "00:00" : a.uhrzeit);
    if (zeit === null) continue;
    // Ein Follow-Up, das als Aufgabe gespeichert wurde (der Follow-Up-Dialog
    // legt beides an), soll auch "Follow-Up" heissen. Vorher stand "Aufgabe
    // geplant" auf Kachel und Ampel, und wer sein Follow-Up suchte, fand es
    // unter dem Namen nicht.
    const quelle: KontaktQuelle = a.wiedervorlage
      ? "wartephase"
      : a.typ === "follow_up"
      ? "follow_up"
      : "aufgabe";
    out.push({
      zeit,
      quelle,
      bezeichnung: QUELLE_BEZEICHNUNG[quelle],
      titel: a.titel,
    });
  }

  for (const f of e.followUps || []) {
    const zeit = zuZeitpunkt(f.faelligAm, f.uhrzeit);
    if (zeit === null) continue;
    out.push({
      zeit,
      quelle: "follow_up",
      bezeichnung: QUELLE_BEZEICHNUNG.follow_up,
      titel: f.titel,
    });
  }

  for (const t of e.termine || []) {
    const zeit = zuZeitpunkt(t.datum, t.uhrzeit);
    if (zeit === null) continue;
    // Ein Videogespräch ist ein Termin, nur eben keiner vor Ort. Es bekommt
    // eine eigene Quelle, damit die Kachel "Videomeeting geplant" schreiben
    // kann statt des unspezifischen "Termin geplant".
    out.push({ zeit, quelle: t.video ? "videotermin" : "termin", bezeichnung: t.bezeichnung });
  }

  for (const g of e.geplant || []) {
    if (!Number.isFinite(g.zeit)) continue;
    out.push({ zeit: g.zeit, quelle: g.quelle, bezeichnung: g.bezeichnung || QUELLE_BEZEICHNUNG[g.quelle], titel: g.titel });
  }

  const wartezeit = zuZeitpunkt(e.verstecktBis);
  if (wartezeit !== null) {
    out.push({
      zeit: wartezeit,
      quelle: "wartephase",
      bezeichnung: QUELLE_BEZEICHNUNG.wartephase,
    });
  }

  return out;
}

/**
 * Der nächste geplante Kontakt. `jetzt` ist überschreibbar, damit die Tests
 * nicht von der Uhr abhängen.
 */
export function naechsterKontakt(
  e: KontaktEingabe,
  jetzt: number = Date.now(),
): GeplanterKontakt | null {
  const kandidaten = sammleKandidaten(e);
  if (kandidaten.length === 0) return null;

  const zukunft = kandidaten.filter((k) => k.zeit > jetzt).sort((a, b) => a.zeit - b.zeit);

  // Ein vereinbarter Termin schlägt die Wartephase, auch wenn die Wartephase
  // früher liegt. Wer eine neue Aufgabe anlegt, hat den nächsten Schritt
  // festgelegt; das alte `verstecktBis` aus einem "Nicht erreicht" ist damit
  // überholt und darf die Kachel nicht mehr bestimmen.
  const echteTermine = zukunft.filter((k) => k.quelle !== "wartephase");

  const gewaehlt = echteTermine.length > 0
    ? echteTermine[0]
    : zukunft.length > 0
    ? zukunft[0]
    // Nichts in der Zukunft: der zuletzt fällige Termin ist die ehrlichste
    // Aussage, denn genau der ist liegen geblieben.
    : kandidaten.sort((a, b) => b.zeit - a.zeit)[0];

  return {
    zeitpunkt: new Date(gewaehlt.zeit).toISOString(),
    quelle: gewaehlt.quelle,
    bezeichnung: gewaehlt.bezeichnung,
    titel: gewaehlt.titel,
    ueberfaellig: gewaehlt.zeit <= jetzt,
  };
}

/** True, wenn ein fester Termin in der Zukunft vorliegt. Die Wartephase zählt nicht. */
export function hatGeplantenTermin(e: KontaktEingabe, jetzt: number = Date.now()): boolean {
  return sammleKandidaten(e).some((k) => k.quelle !== "wartephase" && k.zeit > jetzt);
}
