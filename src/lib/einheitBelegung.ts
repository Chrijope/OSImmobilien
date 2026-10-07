/**
 * Ob eine Einheit noch zu haben ist, und wie das heisst.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Das CRM kennt drei Zustaende: frei, reserviert, verkauft. Investagon kennt
 * sechs, und der Import klappt sie beim Schreiben auf die drei zusammen:
 *
 *   Frei (1)              -> frei          117 Einheiten
 *   Angefragt (5)         -> reserviert     56
 *   Reserviert (6)        -> reserviert     98
 *   Notartermin (7)       -> reserviert     15
 *   Notarvorbereitung (9) -> reserviert     32
 *   Verkauft (0)          -> verkauft         7
 *
 * (Zahlen vom 16.09.2026, aus der Datenbank gezaehlt.)
 *
 * Hinter dem einen Wort "reserviert" stecken also vier sehr verschiedene
 * Dinge. Eine Einheit, die jemand angefragt hat, ist vertrieblich etwas ganz
 * anderes als eine, die naechste Woche zum Notar geht. Christian hat am
 * 16.09.2026 verlangt, dass man das sieht.
 *
 * Der Klartext muss dafuer nicht neu beschafft werden: Der Import legt den
 * vollstaendigen Originaldatensatz in `meta.investagonRaw` ab, und darin steht
 * `statusName` genau so, wie Investagon es auf dem Bildschirm zeigt. Wir haben
 * ihn also laengst, wir haben ihn nur nie gelesen.
 *
 * Bewusst NICHT gemacht: die drei CRM-Zustaende erweitern. Daran haengen
 * Auswertungen, Filter und die Datenbank. Der Klartext kommt obendrauf, er
 * ersetzt nichts.
 */

import { ausInvestagon } from "./investagonHerkunft";
import { nameMeintNutzer } from "./beraterNamensabgleich";

/** Die Rollen, die auch eine belegte Einheit noch oeffnen duerfen. */
const LEITUNG = ["admin", "inhaber", "vertriebsleiter", "backoffice"] as const;

/** Was diese Datei von einer Einheit braucht. */
export interface BelegungsEinheit {
  status: "frei" | "reserviert" | "verkauft";
  /** Der Klartext aus Investagon, etwa "Notartermin". */
  investagonStatusText?: string;
  kundeId?: string;
  beraterName?: string;
  exklusivNutzer?: string[];
}

/** Der angemeldete Nutzer, soweit die Regeln ihn brauchen. */
export interface BelegungsKontext {
  rolle: string;
  benutzerId?: string;
  name?: string;
}

/** Eine Einheit ist belegt, sobald sie nicht mehr frei ist. */
export function istBelegt(w: Pick<BelegungsEinheit, "status">): boolean {
  return w.status !== "frei";
}

/**
 * Der Text, der auf der Kachel steht.
 *
 * Erste Wahl ist der Klartext aus Investagon, denn er ist der genauere und
 * derselbe, den der Objektpartner dort sieht. Fehlt er, etwa bei einer von
 * Hand gepflegten Einheit, greift der CRM-Zustand. Ein leeres Feld darf nie
 * entstehen: Eine ausgegraute Kachel ohne Begruendung ist schlimmer als gar
 * kein Hinweis.
 */
export function belegungsText(w: BelegungsEinheit): string {
  const ausInvestagon = (w.investagonStatusText || "").trim();
  if (ausInvestagon) return ausInvestagon;
  if (w.status === "verkauft") return "Verkauft";
  if (w.status === "reserviert") return "Reserviert";
  return "Frei";
}

/**
 * Ist das der eigene Vorgang dieses Nutzers?
 *
 * Zwei Wege fuehren dorthin: Der Nutzer steht als Berater an der Einheit,
 * oder er ist ihr ausdruecklich zugewiesen. Beim Berater wird der Name
 * verglichen, denn mehr steht an der Einheit nicht; bei der Zuweisung die
 * Kennung, denn diese Liste wird technisch gefuellt.
 *
 * Die Leitung zaehlt hier ausdruecklich NICHT mit. Sie darf zwar alles
 * oeffnen, aber nicht jede belegte Einheit im Haus ist ihr eigener Vorgang.
 * Wer beides vermischt, sortiert der Leitung die ganze Liste durcheinander.
 */
export function istEigenerVorgang(
  w: BelegungsEinheit,
  ctx: BelegungsKontext,
): boolean {
  const name = (ctx.name || "").trim();
  if (name && (w.beraterName || "").trim() === name) return true;
  if (ctx.benutzerId && (w.exklusivNutzer || []).includes(ctx.benutzerId)) {
    return true;
  }
  return false;
}

/**
 * Darf dieser Nutzer die Einheit trotz Belegung noch oeffnen?
 *
 * Drei Faelle, in dieser Reihenfolge:
 *
 * 1. Sie ist frei. Dann gibt es nichts zu pruefen.
 * 2. Die Leitung. Sie muss an jede Einheit herankommen, sonst koennte
 *    Christian eine Reservierung nicht mehr aufloesen, die er selbst gesetzt
 *    hat. Ein gesperrter Knopf, der die eigene Arbeit blockiert, waere ein
 *    Eigentor.
 * 3. Der eigene Vorgang. Wer die Einheit fuer seinen Kunden gesetzt oder
 *    reserviert hat, kommt weiter rein. Das ist Christians Vorgabe vom
 *    16.09.2026.
 *
 * WICHTIG, und das ist der Kern: Eine Einheit, die in INVESTAGON reserviert
 * ist, hat bei uns keinen Kunden. Fall 3 greift dort also nicht, und genau so
 * soll es sein. Sie gehoert einem fremden Vertrieb, niemand bei uns darf sie
 * vergeben. Nur wo IHR reserviert habt, steht ein Kunde an der Einheit.
 *
 * Das hier entscheidet allein, was die Oberflaeche anbietet. Massgeblich
 * bleibt die Zeilensicherheit der Datenbank.
 *
 * SEIT 23.09.2026 nur noch fuer die Objektkachel: Ob sich ein ganz belegtes
 * Objekt anklicken laesst. Die einzelne Einheit in den Einheitentabellen
 * entscheidet `darfEinheitOeffnen` weiter unten, und dort kommt auch die
 * Leitung nicht mehr in eine belegte Einheit.
 */
export function darfBelegteOeffnen(
  w: BelegungsEinheit,
  ctx: BelegungsKontext,
): boolean {
  if (!istBelegt(w)) return true;
  if ((LEITUNG as readonly string[]).includes(ctx.rolle)) return true;
  return istEigenerVorgang(w, ctx);
}

/**
 * DIE REIHENFOLGE: WAS NOCH ZU HABEN IST, STEHT OBEN
 *
 * Christian hat am 17.09.2026 verlangt, dass alles Freie zuerst kommt und
 * alles Graue ans Ende rutscht. Vier Stufen, von oben nach unten:
 *
 *   0  frei                 da ist noch etwas zu holen
 *   1  eigener Vorgang      belegt, aber der Nutzer haengt selbst daran
 *   2  belegt               angefragt, reserviert, Notartermin, Notarvorbereitung
 *   3  verkauft             erledigt, gehoert ganz ans Ende
 *
 * Stufe 1 ist Christians Zusatz: Ein Vertriebspartner, der bei einer belegten
 * Einheit seinen eigenen Kunden gesetzt hat, soll sie nicht aus den Augen
 * verlieren. Sie wandert deshalb an den Anfang des grauen Blocks und nicht
 * ans Ende. Zu den freien wird sie NICHT gezaehlt, das waere gelogen.
 *
 * Verkauft bleibt auch beim eigenen Vorgang unten. Nach dem Notartermin gibt
 * es dort nichts mehr zu bearbeiten, und Christians Vorgabe ist eindeutig.
 */
export function belegungsRang(
  w: BelegungsEinheit,
  ctx?: BelegungsKontext,
): number {
  if (!istBelegt(w)) return 0;
  if (w.status === "verkauft") return 3;
  if (ctx && istEigenerVorgang(w, ctx)) return 1;
  return 2;
}

/**
 * Bildet die Bloecke, ohne die vorhandene Reihenfolge anzutasten.
 *
 * Wer heute nach Wohnungsnummer oder Preis sortiert sieht, sieht das
 * weiterhin so, nur eben zuerst die freien. Die Sortierung ist deshalb
 * ausdruecklich stabil: Bei gleichem Rang entscheidet die bisherige Position.
 * `Array.prototype.sort` ist seit ES2019 zwar selbst stabil, der Vergleich
 * ueber den Ursprungsplatz schreibt die Absicht aber hin, statt sie
 * vorauszusetzen.
 */
export function nachBelegungGeordnet<T extends BelegungsEinheit>(
  einheiten: readonly T[],
  ctx?: BelegungsKontext,
): T[] {
  return (einheiten || [])
    .map((einheit, platz) => ({ einheit, platz, rang: belegungsRang(einheit, ctx) }))
    .sort((a, b) => a.rang - b.rang || a.platz - b.platz)
    .map((x) => x.einheit);
}

/** Wie viele Einheiten eines Objekts in welchem Zustand sind. */
export interface ObjektBelegung {
  frei: number;
  belegt: number;
  gesamt: number;
  /** Kein einziger freier Platz mehr. */
  vollBelegt: boolean;
  /**
   * Der Text fuer den Aufdruck auf dem Objektbild. Leer, solange noch etwas
   * frei ist.
   *
   * Sind alle Einheiten gleich beschriftet, steht genau das da ("Reserviert").
   * Sind es verschiedene Zustaende, etwa zwei reservierte und eine verkaufte,
   * waere jede Einzelauswahl eine Behauptung ueber das Objekt, die fuer die
   * anderen Einheiten falsch ist. Dann das neutrale "Belegt".
   */
  aufdruck: string;
}

export function objektBelegung(einheiten: BelegungsEinheit[]): ObjektBelegung {
  const alle = einheiten || [];
  const frei = alle.filter((w) => !istBelegt(w)).length;
  const belegt = alle.length - frei;
  const vollBelegt = alle.length > 0 && frei === 0;

  let aufdruck = "";
  if (vollBelegt) {
    const texte = new Set(alle.map((w) => belegungsText(w)));
    aufdruck = texte.size === 1 ? [...texte][0] : "Belegt";
  }

  return { frei, belegt, gesamt: alle.length, vollBelegt, aufdruck };
}

/**
 * Dieselbe Reihenfolge eine Ebene hoeher, fuer die Objektliste.
 *
 * Zwei Stufen, mehr hat Christian nicht verlangt: Ein Objekt, in dem noch
 * etwas frei ist, steht oben (0); ein Objekt, in dem nichts mehr frei ist,
 * steht unten (1). Genau diese Objekte sind in der Liste grau hinterlegt und
 * tragen den Aufdruck.
 *
 * Ein Objekt ohne jede Einheit zaehlt oben mit. Es ist nicht ausverkauft,
 * sondern unfertig, und ein frisch angelegtes Objekt nach unten zu schieben
 * waere genau verkehrt.
 */
export function objektBelegungsRang(einheiten: BelegungsEinheit[]): number {
  return objektBelegung(einheiten).vollBelegt ? 1 : 0;
}

/**
 * Die Belegung in der Angebotssicht der Objektliste.
 *
 * Seit dem 23.09.2026 zeigt die Objektliste nur Einheiten, die im Angebot
 * stehen (`objektImAngebot` im Store). Bleibt danach keine uebrig, obwohl
 * das Objekt Einheiten hat, ist es nicht unfertig, sondern ausverkauft oder
 * nicht mehr im Angebot. Ohne diese Unterscheidung rutschte ein
 * ausverkauftes Objekt nach oben und verloere Grau und Aufdruck, entgegen
 * Christians Vorgabe vom 17.09.2026.
 */
export function angebotsBelegung(
  angeboten: BelegungsEinheit[],
  nichtImAngebot: BelegungsEinheit[] = [],
): ObjektBelegung {
  if ((angeboten || []).length > 0 || nichtImAngebot.length === 0) {
    return objektBelegung(angeboten);
  }
  const alleVerkauft = nichtImAngebot.every((w) => w.status === "verkauft");
  return {
    frei: 0,
    belegt: 0,
    gesamt: 0,
    vollBelegt: true,
    aufdruck: alleVerkauft ? "Verkauft" : "Nicht im Angebot",
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * ÖFFNEN, ANZEIGEN, EMPFEHLEN (Christian am 23.09.2026)
 *
 * Drei Vorgaben fuer die beiden Einheitentabellen, die Liste „Alle
 * Einheiten" der Objektseite und die aufgeklappten Wohneinheiten der Seite
 * „Objekte":
 *
 *   1. Geoeffnet wird nur, was frei ist. Auch die Leitung kommt ueber die
 *      Tabelle nicht mehr in eine reservierte oder verkaufte Einheit. Eine
 *      vorgemerkte Einheit ist noch frei und bleibt zu oeffnen.
 *   2. An einer belegten Einheit steht, wer reserviert hat und wann. Die
 *      Namen sieht nur, wer sie sehen darf, alle anderen lesen „reserviert
 *      am …" ohne Namen.
 *   3. Empfohlene Einheiten tragen ein Abzeichen und stehen oben unter den
 *      freien.
 *
 * Die Felder der Vormerkung fuehrt ein paralleler Umbau gerade erst am
 * Wohnungstyp ein. Diese Datei liest sie deshalb ueber einen eigenen Typ, in
 * dem alles freiwillig ist. So laeuft sie mit und ohne diesen Umbau.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Die Rollen, die an jeder belegten Einheit Kunde und Partner sehen.
 *
 * Das Backoffice gehört seit dem 23.09.2026 dazu: Es wickelt die
 * Reservierungen ab und braucht dafür die Namen (Christian).
 */
const SIEHT_ALLE_NAMEN = ["admin", "inhaber", "vertriebsleiter", "backoffice"] as const;

/** Was Anzeige und Empfehlung zusaetzlich von einer Einheit lesen. */
export interface AnzeigeEinheit extends BelegungsEinheit {
  kundeName?: string | null;
  /** Wann im CRM reserviert wurde. */
  reserviertAm?: string | null;
  /** Die Nutzerkennung dessen, der reserviert oder vorgemerkt hat. */
  reserviertVon?: string | null;
  /** Bis wann die Vormerkung gilt, als Zeitpunkt. */
  vorgemerktBis?: string | null;
  vorgemerktKundeId?: string | null;
  vorgemerktKundeName?: string | null;
  vorgemerktBeraterName?: string | null;
  investagonId?: string | null;
  investagonRaw?: Record<string, unknown> | null;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Ein Zeitpunkt aus einem gespeicherten Wert, oder nichts.
 *
 * Ein reines Datum („2026-09-12") gilt als Kalendertag hier vor Ort.
 * `new Date("2026-09-12")` laese es als Mitternacht in London, und westlich
 * davon stuende dann der Vortag in der Tabelle. Jahre ausserhalb von 2000
 * bis 2100 gelten als unbelegt: Eine Null oder ein leeres Feld wird sonst
 * leicht zum 01.01.1970.
 */
function alsZeitpunkt(wert: unknown): Date | undefined {
  const roh = text(wert);
  if (!roh) return undefined;
  const nurTag = /^(\d{4})-(\d{2})-(\d{2})$/.exec(roh);
  const d = nurTag
    ? new Date(Number(nurTag[1]), Number(nurTag[2]) - 1, Number(nurTag[3]))
    : new Date(roh);
  if (Number.isNaN(d.getTime())) return undefined;
  const jahr = d.getFullYear();
  return jahr >= 2000 && jahr <= 2100 ? d : undefined;
}

const datumText = (d: Date): string =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

const uhrzeitText = (d: Date): string =>
  d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

const gleicherTag = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Das Ende der Vormerkung, wie es in der Zeile steht.
 *
 * Christian will „vorgemerkt bis HH:MM". Endet sie erst an einem anderen Tag,
 * steht das Datum davor, sonst liest man morgen 14:30 als heute 14:30.
 */
function vormerkungsEnde(bis: Date, jetzt: Date): string {
  return gleicherTag(bis, jetzt) ? uhrzeitText(bis) : `${datumText(bis)}, ${uhrzeitText(bis)}`;
}

/**
 * Ist die Einheit gerade vorgemerkt?
 *
 * Nur solange sie frei ist und das Ende in der Zukunft liegt. Eine
 * abgelaufene Vormerkung ist keine mehr, auch wenn das Feld noch gefuellt
 * ist. Ist die Einheit inzwischen reserviert, gilt die Reservierung.
 */
export function istVorgemerkt(w: AnzeigeEinheit, jetzt: Date = new Date()): boolean {
  if (istBelegt(w)) return false;
  const bis = alsZeitpunkt(w.vorgemerktBis);
  return !!bis && bis.getTime() > jetzt.getTime();
}

/**
 * Laesst sich die Einheit aus einer Einheitentabelle oeffnen?
 *
 * Nur wenn sie frei ist, fuer jede Rolle gleich. Christian am 23.09.2026:
 * Bei reservierten und verkauften Einheiten gibt es kein „Einheit oeffnen"
 * mehr, auch nicht fuer den Admin. Eine vorgemerkte Einheit ist frei.
 *
 * Wie `darfBelegteOeffnen` entscheidet das nur, was die Oberflaeche
 * anbietet. Massgeblich bleibt die Zeilensicherheit der Datenbank.
 */
export function darfEinheitOeffnen(w: Pick<BelegungsEinheit, "status">): boolean {
  return !istBelegt(w);
}

/**
 * Ist das der eigene Kunde dieses Nutzers?
 *
 * Zuerst die Kennung (`reserviertVon`). Ist sie gesetzt, entscheidet sie
 * allein, auch gegen einen gleichen Namen: Zwei Konten koennen denselben
 * Namen tragen, das ist im Haus schon vorgekommen. Nur wo keine Kennung steht,
 * etwa bei Reservierungen aus der Zeit davor, zaehlt der Beratername, tolerant
 * verglichen wie ueberall im CRM.
 *
 * Die ausdrueckliche Zuweisung (`exklusivNutzer`) zaehlt hier NICHT. Sie sagt,
 * wer eine Einheit anbieten darf, nicht, wessen Kunde darin steht.
 */
export function istEigenerKunde(
  w: AnzeigeEinheit,
  ctx: BelegungsKontext,
  jetzt: Date = new Date(),
): boolean {
  const kennung = text(w.reserviertVon);
  if (kennung) return !!ctx.benutzerId && kennung === ctx.benutzerId;
  // Der Name nur ohne Kennung und nur, wenn er genau einen Nutzer meint.
  const berater = istVorgemerkt(w, jetzt) ? w.vorgemerktBeraterName : w.beraterName;
  return nameMeintNutzer(berater, { userId: ctx.benutzerId, userName: ctx.name });
}

/**
 * Darf dieser Nutzer Kunde und Vertriebspartner der Einheit sehen?
 *
 * Admin, Inhaber und Vertriebsleiter immer, alle anderen nur beim eigenen
 * Kunden. Heute sehen die beiden Tabellen ohnehin nur Admin und Inhaber, die
 * Regel gilt aber schon fuer die Partner, die dazukommen sollen.
 */
export function darfNamenSehen(
  w: AnzeigeEinheit,
  ctx: BelegungsKontext | undefined,
  jetzt: Date = new Date(),
): boolean {
  if (!ctx) return false;
  if ((SIEHT_ALLE_NAMEN as readonly string[]).includes(ctx.rolle)) return true;
  return istEigenerKunde(w, ctx, jetzt);
}

/**
 * Die Felder im Investagon-Datensatz, die ausdruecklich ein
 * Reservierungsdatum benennen.
 *
 * `updated` gehoert bewusst NICHT dazu. Es ist die letzte Aenderung an der
 * Wohnung, also auch jede Preis- oder Textaenderung, und kein
 * Reservierungsdatum. Stand 23.09.2026 liefert die Listenabfrage keines der
 * Felder hier (siehe `docs/investagon-stand.md`). Dann steht eben kein Datum
 * da, geraten wird nicht.
 */
const INVESTAGON_RESERVIERUNGSDATUM = ["reservation_date", "reservationDate", "reserved_at", "reservedAt"] as const;

/** Das Reservierungsdatum aus den Investagon-Rohdaten, nur wenn es dort sicher steht. */
export function investagonReservierungsdatum(roh: Record<string, unknown> | null | undefined): Date | undefined {
  if (!roh || typeof roh !== "object") return undefined;
  for (const feld of INVESTAGON_RESERVIERUNGSDATUM) {
    const d = alsZeitpunkt(roh[feld]);
    if (d) return d;
  }
  return undefined;
}

/**
 * Belegt in Investagon, ohne Vorgang im CRM?
 *
 * Dieselbe Abgrenzung wie im Import (`statusFelder` in
 * `supabase/functions/investagon-import/mapping.ts`): Ein Vorgang aus dem CRM
 * hat einen Kunden, einen Kundennamen oder ein Reservierungsdatum. Fehlt all
 * das an einer belegten Einheit aus Investagon, hat dort ein fremder Vertrieb
 * reserviert.
 */
export function belegtUeberInvestagon(w: AnzeigeEinheit): boolean {
  if (!istBelegt(w)) return false;
  const herkunft = ausInvestagon({
    investagonId: text(w.investagonId) || undefined,
    meta: w.investagonRaw ? { investagonRaw: w.investagonRaw } : undefined,
  });
  return herkunft && !text(w.kundeId) && !text(w.kundeName) && !text(w.reserviertAm);
}

/** Was in der Zeile zur Belegung steht. */
export interface BelegungsAnzeige {
  art: "frei" | "vorgemerkt" | "reserviert" | "verkauft";
  /**
   * Der Satz ohne Namen, den jeder sehen darf: „reserviert am 12.09.2026",
   * „vorgemerkt bis 14:30", „über Investagon". Leer bei einer freien Einheit.
   */
  hinweis: string;
  /** Nur gesetzt, wenn der Nutzer den Kunden sehen darf. */
  kundeName?: string;
  kundeId?: string;
  /** Der Vertriebspartner, ebenso nur mit Erlaubnis. */
  partnerName?: string;
  /** Belegt in Investagon, ohne Vorgang im CRM. */
  ueberInvestagon: boolean;
}

const oderNichts = (v: unknown): string | undefined => text(v) || undefined;

/**
 * Kunde, Vertriebspartner und Datum einer Einheit, fuer diesen Nutzer.
 *
 * Wer die Namen nicht sehen darf, bekommt dieselbe Zeile ohne sie. Die Namen
 * fehlen dann im Ergebnis ganz, nicht nur in der Darstellung, damit keine
 * Tabelle sie aus Versehen doch zeigt.
 */
export function belegungsAnzeige(
  w: AnzeigeEinheit,
  ctx: BelegungsKontext | undefined,
  jetzt: Date = new Date(),
): BelegungsAnzeige {
  if (istVorgemerkt(w, jetzt)) {
    const bis = alsZeitpunkt(w.vorgemerktBis)!;
    const anzeige: BelegungsAnzeige = {
      art: "vorgemerkt",
      hinweis: `vorgemerkt bis ${vormerkungsEnde(bis, jetzt)}`,
      ueberInvestagon: false,
    };
    if (darfNamenSehen(w, ctx, jetzt)) {
      anzeige.kundeName = oderNichts(w.vorgemerktKundeName);
      anzeige.kundeId = oderNichts(w.vorgemerktKundeId);
      anzeige.partnerName = oderNichts(w.vorgemerktBeraterName);
    }
    return anzeige;
  }

  if (!istBelegt(w)) return { art: "frei", hinweis: "", ueberInvestagon: false };

  const art = w.status === "verkauft" ? "verkauft" : "reserviert";

  if (belegtUeberInvestagon(w)) {
    const am = art === "reserviert" ? investagonReservierungsdatum(w.investagonRaw) : undefined;
    return {
      art,
      hinweis: am ? `über Investagon, reserviert am ${datumText(am)}` : "über Investagon",
      ueberInvestagon: true,
    };
  }

  const am = alsZeitpunkt(w.reserviertAm);
  const anzeige: BelegungsAnzeige = {
    art,
    hinweis: art === "verkauft" ? "verkauft" : am ? `reserviert am ${datumText(am)}` : "reserviert",
    ueberInvestagon: false,
  };
  if (darfNamenSehen(w, ctx, jetzt)) {
    anzeige.kundeName = oderNichts(w.kundeName);
    anzeige.kundeId = oderNichts(w.kundeId);
    anzeige.partnerName = oderNichts(w.beraterName);
  }
  return anzeige;
}

/**
 * Traegt die Einheit das Abzeichen „empfohlen"?
 *
 * Nur eine freie. Eine empfohlene Einheit, die inzwischen reserviert ist,
 * kann niemand mehr anbieten, das Abzeichen waere dort eine falsche Zusage.
 */
export function istEmpfohlen(
  w: BelegungsEinheit & { id: string },
  empfohleneIds?: ReadonlySet<string> | null,
): boolean {
  return !!empfohleneIds && !istBelegt(w) && empfohleneIds.has(w.id);
}

/**
 * Holt die empfohlenen Einheiten an den Anfang der freien.
 *
 * Die freien Einheiten behalten dabei ihre Plaetze in der Liste, nur ihre
 * Reihenfolge untereinander aendert sich: erst die empfohlenen, dann die
 * uebrigen, jeweils in der bisherigen Reihenfolge. Belegte und verkaufte
 * bleiben genau, wo sie waren. So funktioniert es auch, wenn die Tabelle
 * nach Status rueckwaerts sortiert und die freien unten stehen.
 */
export function empfohleneZuerst<T extends BelegungsEinheit & { id: string }>(
  einheiten: readonly T[],
  empfohleneIds?: ReadonlySet<string> | null,
): T[] {
  const liste = [...(einheiten || [])];
  if (!empfohleneIds || empfohleneIds.size === 0) return liste;
  const plaetze: number[] = [];
  const freie: T[] = [];
  liste.forEach((w, platz) => {
    if (!istBelegt(w)) {
      plaetze.push(platz);
      freie.push(w);
    }
  });
  const geordnet = [
    ...freie.filter((w) => empfohleneIds.has(w.id)),
    ...freie.filter((w) => !empfohleneIds.has(w.id)),
  ];
  plaetze.forEach((platz, i) => {
    liste[platz] = geordnet[i];
  });
  return liste;
}
