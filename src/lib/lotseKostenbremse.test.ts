/**
 * Kostenbremse und gemeinsame Auszüge des MORE Lotsen (Runde 2, 28.09.2026).
 *
 * Bewiesen wird:
 *   1. Ein Sperrvermerk wird per INSERT gewonnen: Von zwei gleichzeitigen
 *      Läufen wertet nur einer aus. Kann nicht geschrieben werden, wertet
 *      keiner aus (fail closed).
 *   2. Vorbereiten ist serverseitig gebremst: je Einheit ein Lauf in 10
 *      Minuten, je Nutzer 30 am Tag.
 *   3. Ein reiner Einordnungsvermerk überschreibt nie einen vollständigen Auszug.
 *   4. Auszüge gelten nutzerübergreifend: Der zweite Nutzer derselben Einheit
 *      löst weder Download noch KI-Aufruf aus. Neu ausgelesen wird nur bei
 *      neuer Dateiversion oder höherer Schema-Fassung.
 *   5. Fragen mit Kundendaten werden erkannt, Objektfragen nicht.
 */
import { describe, expect, it } from "vitest";
import {
  auszugAnsicht,
  auszuegeZuordnen,
  auszugSchluessel,
  auszugVorsilbe,
  einordnungMerken,
  fehlendeAuszuege,
  gewonneneSperren,
  IN_ARBEIT_MS,
  inArbeitSchluessel,
  sperreGewinnen,
  VORBEREITEN_EINHEIT_MS,
  VORBEREITEN_JE_TAG,
  vorbereitenFreigeben,
  type Ablage,
  type LotseKandidat,
} from "../../supabase/functions/_shared/lotse-unterlagen";
import { AUSZUG_SCHEMA_FASSUNG, gespeicherteEinordnung, NUR_EINORDNUNG } from "../../supabase/functions/_shared/lotse-faktenauszug";
import { frageMitKundendaten, LOTSE_KUNDENDATEN_TEXT } from "../../supabase/functions/_shared/lotse-regeln";

type Zeile = Record<string, unknown>;

/**
 * Eine kleine Tabelle mit eindeutigem `dokument_schluessel`, wie Postgres sie
 * erzwingt. Jede Anweisung wird für sich atomar ausgeführt, in der Reihenfolge,
 * in der sie ankommt; so lassen sich gleichzeitige Läufe nachstellen.
 */
class FakeDb {
  zeilen = new Map<string, Zeile>();
  schreibfehler: { code: string; message: string } | null = null;
  from() {
    return new Abfrage(this);
  }
}

class Abfrage {
  private filter: Array<(z: Zeile) => boolean> = [];
  private werte: Zeile | null = null;
  private zaehlen = false;
  constructor(private db: FakeDb) {}
  insert(zeile: Zeile) {
    return Promise.resolve().then(() => {
      if (this.db.schreibfehler) return { error: this.db.schreibfehler };
      const schluessel = String(zeile.dokument_schluessel);
      if (this.db.zeilen.has(schluessel)) return { error: { code: "23505", message: "doppelt" } };
      this.db.zeilen.set(schluessel, { ...zeile });
      return { error: null };
    });
  }
  update(werte: Zeile) {
    this.werte = werte;
    return this;
  }
  select(_spalten: string, optionen?: { head?: boolean }) {
    if (optionen?.head) this.zaehlen = true;
    return this;
  }
  eq(spalte: string, wert: unknown) {
    this.filter.push((z) => z[spalte] === wert);
    return this;
  }
  lt(spalte: string, wert: string) {
    this.filter.push((z) => String(z[spalte]) < wert);
    return this;
  }
  like(spalte: string, muster: string) {
    this.filter.push((z) => String(z[spalte]).startsWith(muster.replace(/%$/, "")));
    return this;
  }
  then<T>(fertig: (e: { data?: Zeile[]; count?: number; error: unknown }) => T) {
    return Promise.resolve().then(() => {
      const treffer = [...this.db.zeilen.values()].filter((z) => this.filter.every((f) => f(z)));
      if (this.zaehlen) return fertig({ count: treffer.length, error: null });
      if (this.werte) {
        if (this.db.schreibfehler) return fertig({ error: this.db.schreibfehler });
        for (const z of treffer) Object.assign(z, this.werte);
        return fertig({ data: treffer.map((z) => ({ dokument_schluessel: z.dokument_schluessel })), error: null });
      }
      return fertig({ data: treffer, error: null });
    });
  }
}

const JETZT = Date.parse("2026-09-28T12:00:00Z");
const vermerk = (schluessel: string) => ({ objekt_id: "o1", dokument_schluessel: schluessel, ampel: "rot", art: "in_arbeit", auszug: { in_arbeit: true } });

describe("Sperrvermerk per INSERT", () => {
  it("von zwei gleichzeitigen Läufen gewinnt genau einer", async () => {
    const db = new FakeDb();
    const [a, b] = await Promise.all([
      sperreGewinnen(db, vermerk("x#in_arbeit"), IN_ARBEIT_MS, JETZT),
      sperreGewinnen(db, vermerk("x#in_arbeit"), IN_ARBEIT_MS, JETZT),
    ]);
    expect([a, b].sort()).toEqual(["belegt", "gewonnen"]);
  });

  it("zwei gleichzeitige Vorbereitungen werten jede Unterlage nur einmal aus", async () => {
    const db = new FakeDb();
    const unterlagen = ["a", "b", "c"];
    const [erster, zweiter] = await Promise.all([
      gewonneneSperren(db, unterlagen, (u) => vermerk(`${u}#in_arbeit`), JETZT),
      gewonneneSperren(db, unterlagen, (u) => vermerk(`${u}#in_arbeit`), JETZT),
    ]);
    expect([...erster.gewonnen, ...zweiter.gewonnen].sort()).toEqual(unterlagen);
    expect(erster.gewonnen.filter((u) => zweiter.gewonnen.includes(u))).toEqual([]);
  });

  it("ein abgelaufener Vermerk wird genau einmal übernommen, ein frischer nie", async () => {
    const db = new FakeDb();
    await sperreGewinnen(db, vermerk("x#in_arbeit"), IN_ARBEIT_MS, JETZT);
    expect(await sperreGewinnen(db, vermerk("x#in_arbeit"), IN_ARBEIT_MS, JETZT + 60_000)).toBe("belegt");
    const spaeter = JETZT + IN_ARBEIT_MS + 1;
    const [a, b] = await Promise.all([
      sperreGewinnen(db, vermerk("x#in_arbeit"), IN_ARBEIT_MS, spaeter),
      sperreGewinnen(db, vermerk("x#in_arbeit"), IN_ARBEIT_MS, spaeter),
    ]);
    expect([a, b].sort()).toEqual(["belegt", "gewonnen"]);
  });

  it("kann der Vermerk nicht geschrieben werden, wertet niemand aus", async () => {
    const db = new FakeDb();
    db.schreibfehler = { code: "42501", message: "keine Rechte" };
    expect(await sperreGewinnen(db, vermerk("x#in_arbeit"), IN_ARBEIT_MS, JETZT)).toBe("fehler");
    expect(await gewonneneSperren(db, ["a", "b"], (u) => vermerk(`${u}#in_arbeit`), JETZT)).toEqual({ gewonnen: [], belegt: [] });
  });
});

describe("Vorbereiten, serverseitige Bremse", () => {
  const einheit = (n: number) => ({ userId: "u1", objektId: "o1", wohnungId: `w${n}` });

  it("je Einheit ein Lauf in 10 Minuten, auch bei gleichzeitigen Aufrufen", async () => {
    const db = new FakeDb();
    const [a, b] = await Promise.all([vorbereitenFreigeben(db, einheit(1), JETZT), vorbereitenFreigeben(db, einheit(1), JETZT)]);
    expect([a, b].sort()).toEqual(["einheit_kuerzlich", "frei"]);
    expect(await vorbereitenFreigeben(db, einheit(1), JETZT + 5 * 60_000)).toBe("einheit_kuerzlich");
    expect(await vorbereitenFreigeben(db, einheit(1), JETZT + VORBEREITEN_EINHEIT_MS + 1)).toBe("frei");
  });

  it("je Nutzer und Tag höchstens 30 Läufe, danach freundlich nichts", async () => {
    const db = new FakeDb();
    for (let n = 1; n <= VORBEREITEN_JE_TAG; n++) expect(await vorbereitenFreigeben(db, einheit(n), JETZT)).toBe("frei");
    expect(await vorbereitenFreigeben(db, einheit(99), JETZT)).toBe("tageslimit");
    // Ein anderer Nutzer ist davon nicht betroffen.
    expect(await vorbereitenFreigeben(db, { ...einheit(100), userId: "u2" }, JETZT)).toBe("frei");
  });

  it("ein Schreibfehler gibt nichts frei", async () => {
    const db = new FakeDb();
    db.schreibfehler = { code: "XX000", message: "kaputt" };
    expect(await vorbereitenFreigeben(db, einheit(1), JETZT)).toBe("fehler");
  });
});

describe("Einordnungsvermerk überschreibt keinen vollständigen Auszug", () => {
  const voll = { dokument_schluessel: "k", ampel: "gruen", art: "expose", schema_fassung: AUSZUG_SCHEMA_FASSUNG, auszug: { text: "Baujahr 1995" }, erstellt_am: "2026-09-28T10:00:00.000Z" };
  const einordnung = { dokument_schluessel: "k", ampel: "gruen", art: "sonstiges", schema_fassung: AUSZUG_SCHEMA_FASSUNG, auszug: NUR_EINORDNUNG };

  it("ein gelesener vollständiger Auszug bleibt", async () => {
    const db = new FakeDb();
    db.zeilen.set("k", { ...voll });
    expect(await einordnungMerken(db, einordnung, voll)).toBe("uebersprungen");
    expect(db.zeilen.get("k")?.auszug).toEqual({ text: "Baujahr 1995" });
  });

  it("wurde der Auszug nach dem Lesen geschrieben, bleibt er auch", async () => {
    const db = new FakeDb();
    // Gelesen: nichts da. Inzwischen schreibt der Lotse den Auszug.
    db.zeilen.set("k", { ...voll });
    expect(await einordnungMerken(db, einordnung, undefined)).toBe("uebersprungen");
    // Gelesen: ein alter Vermerk. Inzwischen ersetzt ihn der Auszug (neues erstellt_am).
    const alt = { ...einordnung, schema_fassung: AUSZUG_SCHEMA_FASSUNG - 1, erstellt_am: "2026-09-27T10:00:00.000Z" };
    expect(await einordnungMerken(db, einordnung, alt)).toBe("uebersprungen");
    expect(db.zeilen.get("k")?.auszug).toEqual({ text: "Baujahr 1995" });
  });

  it("ein alter Vermerk oder eine leere Stelle werden geschrieben", async () => {
    const db = new FakeDb();
    expect(await einordnungMerken(db, einordnung, undefined)).toBe("geschrieben");
    const alt = { ...einordnung, schema_fassung: AUSZUG_SCHEMA_FASSUNG - 1, erstellt_am: "2026-09-27T10:00:00.000Z" };
    db.zeilen.set("k", { ...alt });
    expect(await einordnungMerken(db, einordnung, alt)).toBe("geschrieben");
    expect(db.zeilen.get("k")?.schema_fassung).toBe(AUSZUG_SCHEMA_FASSUNG);
  });
});

describe("Auszüge gelten für alle Nutzer, einmal je Dateiversion", () => {
  const ablage = (n: number): Ablage => ({ eimer: "objekt-dokumente", pfad: `objekte/o1/wohnungen/w1/unterlage-${n}.pdf` });
  /** Die Unterlagen, wie sie jeder Nutzer aus den Dokumentzeilen und den Storage-Metadaten bekommt. */
  const kandidaten = (version: string): LotseKandidat[] => [
    { ablage: ablage(1), vorsilbe: auszugVorsilbe(ablage(1), version), ampel: "gruen", art: "expose", inhaltPruefen: true },
    { ablage: ablage(2), vorsilbe: auszugVorsilbe(ablage(2), version), ampel: "rot", art: "mietvertrag", roteArt: "mietvertrag" },
  ];

  /** Ein Öffnen des Lotsen: zuordnen, fehlende wählen, nur diese laden und auswerten und speichern. */
  async function oeffne(db: FakeDb, version: string, zaehler: { download: number; gateway: number }, jetzt: number) {
    const liste = kandidaten(version);
    const { zeilenJe, auszuege } = auszuegeZuordnen(liste, [...db.zeilen.values()], () => undefined);
    const fehlend = fehlendeAuszuege(liste, zeilenJe, auszuege, 6, jetzt);
    const { gewonnen } = await gewonneneSperren(db, fehlend, (k) => ({ ...vermerk(inArbeitSchluessel(k.vorsilbe)), auszug: { in_arbeit: true, am: new Date(jetzt).toISOString() } }), jetzt);
    for (const k of gewonnen) {
      zaehler.download++;
      zaehler.gateway++;
      const schluessel = auszugSchluessel(k.vorsilbe, `hash-${version}`);
      db.zeilen.set(schluessel, {
        dokument_schluessel: schluessel, ampel: k.ampel, art: k.art, schema_fassung: AUSZUG_SCHEMA_FASSUNG,
        auszug: k.ampel === "rot" ? { nettokaltmiete: 640 } : { text: "Baujahr 1995" }, erstellt_am: new Date(jetzt).toISOString(),
      });
    }
    return { fehlend: fehlend.length, bereit: auszuege.size };
  }

  it("der zweite Nutzer derselben Einheit lädt nichts und fragt kein Modell", async () => {
    const db = new FakeDb();
    const nutzerA = { download: 0, gateway: 0 };
    const nutzerB = { download: 0, gateway: 0 };
    await oeffne(db, "v1", nutzerA, JETZT);
    expect(nutzerA).toEqual({ download: 2, gateway: 2 });
    const zweiter = await oeffne(db, "v1", nutzerB, JETZT + 60_000);
    expect(nutzerB).toEqual({ download: 0, gateway: 0 });
    expect(zweiter).toEqual({ fehlend: 0, bereit: 2 });
  });

  it("neu ausgelesen wird nur bei neuer Dateiversion oder höherer Schema-Fassung", async () => {
    const db = new FakeDb();
    const zaehler = { download: 0, gateway: 0 };
    await oeffne(db, "v1", zaehler, JETZT);
    await oeffne(db, "v1", zaehler, JETZT + 1000);
    expect(zaehler.download).toBe(2);
    // Die Datei wurde ersetzt: neue Version aus den Storage-Metadaten.
    await oeffne(db, "v2", zaehler, JETZT + 2000);
    expect(zaehler.download).toBe(4);
    // Die Schema-Fassung steigt: gespeicherte Zeilen passen nicht mehr.
    for (const z of db.zeilen.values()) z.schema_fassung = AUSZUG_SCHEMA_FASSUNG - 1;
    const nachFassung = await oeffne(db, "v2", { download: 0, gateway: 0 }, JETZT + IN_ARBEIT_MS + 5000);
    expect(nachFassung.fehlend).toBe(2);
  });
});

describe("Nicht auswertbare Unterlage gilt als vorhanden (Runde 3)", () => {
  const ablage = (n: number): Ablage => ({ eimer: "objekt-dokumente", pfad: `objekte/o1/wohnungen/w1/unterlage-${n}.pdf` });
  const liste = (): LotseKandidat[] => [
    // Die große, unbedenkliche Unterlage steht zuerst und würde sonst jedes Mal gewählt.
    { ablage: ablage(1), vorsilbe: auszugVorsilbe(ablage(1), "v1"), ampel: "gruen", art: "baubeschreibung", inhaltPruefen: true },
    { ablage: ablage(2), vorsilbe: auszugVorsilbe(ablage(2), "v1"), ampel: "gruen", art: "expose", inhaltPruefen: true },
  ];

  /** Eine Frage: höchstens eine Unterlage laden; die große wird als „größer als 8 MB“ gespeichert, ohne Einordnung. */
  function frage(db: FakeDb, geladen: string[], jetzt: number) {
    const kandidaten = liste();
    const { zeilenJe, auszuege } = auszuegeZuordnen(kandidaten, [...db.zeilen.values()], () => undefined);
    for (const k of fehlendeAuszuege(kandidaten, zeilenJe, auszuege, 1, jetzt)) {
      geladen.push(k.ablage.pfad);
      const schluessel = auszugSchluessel(k.vorsilbe, "hash");
      db.zeilen.set(schluessel, {
        dokument_schluessel: schluessel, ampel: k.ampel, art: k.art, schema_fassung: AUSZUG_SCHEMA_FASSUNG,
        auszug: k.art === "baubeschreibung" ? { nicht_auswertbar: "größer als 8 MB" } : { text: "Baujahr 1995" },
        erstellt_am: new Date(jetzt).toISOString(),
      });
    }
    return auszuege.size;
  }

  it("der zweite Aufruf lädt die große Datei nicht erneut, die nächste Unterlage kommt dran", () => {
    const db = new FakeDb();
    const geladen: string[] = [];
    frage(db, geladen, JETZT);
    frage(db, geladen, JETZT + 1000);
    const bereit = frage(db, geladen, JETZT + 2000);
    expect(geladen).toEqual([ablage(1).pfad, ablage(2).pfad]);
    expect(bereit).toBe(2);
  });

  it("nur für die aktuelle Schema-Fassung und nie als Einordnung „frei“", () => {
    const k = { ampel: "gruen" as const, art: "baubeschreibung", inhaltPruefen: true };
    const zeile = { ampel: "gruen", art: "baubeschreibung", auszug: { nicht_auswertbar: "kein PDF" } };
    expect(auszugAnsicht({ ...zeile, schema_fassung: AUSZUG_SCHEMA_FASSUNG }, k)).toEqual({ ampel: "gruen", art: "baubeschreibung", roteArt: undefined });
    expect(auszugAnsicht({ ...zeile, schema_fassung: AUSZUG_SCHEMA_FASSUNG - 1 }, k)).toBeNull();
    expect(auszugAnsicht({ ...zeile, auszug: { nicht_auswertbar: "Mieter Erika Beispiel" }, schema_fassung: AUSZUG_SCHEMA_FASSUNG }, k)).toBeNull();
    expect(gespeicherteEinordnung({ ...zeile, schema_fassung: AUSZUG_SCHEMA_FASSUNG })).toBeNull();
  });
});

describe("Kundendaten in der Frage (LOTSE3-002)", () => {
  it("erkennt typische Kundendaten", () => {
    for (const frage of [
      "Mein Kunde verdient 4.500 € brutto, was bleibt ihm?",
      "Einkommen 62.000 im Jahr, lohnt sich das?",
      "Steuerklasse 3, zwei Kinder, 1 Kind unter 6: wie hoch ist der Steuereffekt?",
      "Geburtsdatum 12.03.1981, passt die Laufzeit?",
      "IBAN DE89 3704 0044 0532 0130 00 für die Reservierung?",
      "Rechne das für Herr Vogl",
      "Was bedeutet das für Frau Schmidt?",
      "Bruttogehalt 5000, Nettogehalt 3100?",
      "netto 3.100 im Monat, reicht das?",
      // Runde 3
      "Kunde X hat 5000 € im Monat, geht das?",
      "Meine Kundin hat 60k Jahresbrutto",
      "Paar, beide Beamte, 7.800 € Haushaltsnetto",
      "Er zahlt 42 % Grenzsteuersatz",
      "Er hat 4.200 € monatlich zur Verfügung, reicht das?",
      "Ehepaar mit 95.000 Euro pro Jahr, passt das?",
      "Sein Monatsnetto liegt bei 3.900",
      "Der Kunde hat 80k auf dem Konto",
      "Angestellte, 3.400 € im Monat, geht die Rate?",
      "Persönlicher Steuersatz 38 %, wie hoch ist der Effekt?",
      // Runde 3b: brutto oder netto neben einer Person, auch mit Rücklage oder Grunderwerbsteuer (Regression)
      "Er hat 3.500 netto, reicht das für die Rücklage?",
      "Kunde hat 4000 netto, reicht das für Grunderwerbsteuer und Notar?",
      "Mit 3.500 netto, kann sie die Grunderwerbsteuer zahlen?",
      "Mein Kunde zahlt 38 % Steuern",
      "Wir haben 6.000 € netto im Monat, passt die Rate?",
      "Kunde 45 Jahre, 4.000 € netto, Rate 900 €?",
      "Er hat 3.800 € monatlich und 500 € Miete",
      // Runde 3c: keine Regression gegenüber der Gebühren-Ausnahme
      "Was kostet mich die Wohnung im Monat bei 3.500 netto?",
      "Wie viel kostet mich das bei 4.000 € netto?",
      "Was kostet ihn das bei 3.200 netto, ist das tragbar?",
      "Netto 3.200 € inkl. Bonus, reicht das?",
      "3.500 netto zzgl. Weihnachtsgeld, welche Wohnung geht?",
      "Wie sieht es aus bei 3.800 brutto inkl. Zulagen?",
      "Verwaltungsfachangestellter, 3.200 € netto, geht das?",
      "Selbstständig, 5.000 netto nach USt, reicht das?",
      "Bei 4.100 netto, was hat die Verwaltung für Unterlagen?",
      "Welche Unterlagen braucht die Verwaltung, 3.000 netto reichen?",
      "Sie hat 3.500 netto, reicht das für die Miete?",
      "Er hat 4.000 brutto, wie hoch ist die Rate?",
    ]) expect(frageMitKundendaten(frage), frage).toBe(true);
  });

  it("lässt Objektfragen und Provisionsfragen in Ruhe", () => {
    for (const frage of [
      "Was bleibt monatlich nach Hausgeld, Verwaltung und Finanzierung?",
      "Wie hoch ist die Nettokaltmiete 2024?",
      "Kaltmiete netto 850 €, stimmt das?",
      "Wie hoch ist das Mieteinkommen im Jahr 2025?",
      "Gibt es ein Kinderzimmer mit 12 m²?",
      "Wie hoch ist die Bruttorendite bei 289.000 €?",
      "Lohnt sich die Sanierung von 2019?",
      "Die Frau des Mieters zahlt 850 €, stimmt das?",
      "Was verdient MOREImmo an den 289.000 €?",
      "Welche Unterlagen liegen vor, welche fehlen?",
      // Runde 3: Objektfragen mit Beträgen je Zeitraum
      "Kaltmiete netto 850 € im Monat?",
      "Hausgeld monatlich 320 €?",
      "Mieteinnahmen pro Jahr?",
      "Mieteinnahmen pro Jahr 10.200 €, stimmt das?",
      "Wie hoch ist der Steuersatz der Grunderwerbsteuer in Bayern?",
      "Grunderwerbsteuer 3,5 % in Bayern, welcher Steuersatz gilt in NRW?",
      "Die Wohnung hat 320 € Hausgeld im Monat, stimmt das?",
      "Wie hoch ist die Kreditrate im Monat bei 4 % Zins?",
      "Sie zahlt 850 € Miete im Monat, ist das marktüblich?",
      "Die Rücklage beträgt 17 € monatlich, reicht das?",
      "Kostet die Wohnung 250k?",
      // Runde 3b: „hat“ und „haben“ an Objekten, Gebühren mit brutto oder netto
      "Hat die WEG 1.500 € Instandhaltung pro Jahr eingeplant?",
      "Hat der Stellplatz 60 € im Monat?",
      "Die Heizung hat 1.800 € Wartung pro Jahr gekostet",
      "Haben die Einheiten im Jahr 3 % Wertsteigerung gehabt?",
      "Die SEV kostet 30 € netto pro Monat",
      "Verwaltergebühr 29,75 € brutto",
      "Sie hat 320 € Hausgeld im Monat, stimmt das?",
      "Kaltmiete netto 850 €, zahlt sie pünktlich?",
      // Runde 3c: Gebühr direkt vor dem Betrag, ohne Person
      "SEV 25 € netto im Monat, ist das üblich?",
      "Die Verwaltung kostet 28 € brutto je Einheit im Monat?",
      "Sie bringt 10.200 € im Jahr, ist das realistisch?",
    ]) expect(frageMitKundendaten(frage), frage).toBe(false);
    expect(LOTSE_KUNDENDATEN_TEXT).not.toMatch(/[–—]/);
  });
});
