import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Der Nachfassplan nach dem Drive-Prozessstandard (16.10.2026).
 */

const stand = vi.hoisted(() => ({
  aufgaben: [] as Array<{ task: Record<string, unknown>; rueckfall?: string }>,
  meta: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}));
vi.mock("./prozessAufgabe", () => ({
  addProzessAufgabe: async (task: Record<string, unknown>, rueckfall?: string) => {
    stand.aufgaben.push({ task, rueckfall });
    return true;
  },
}));
vi.mock("./kundenStore", () => ({
  mergeKontaktMeta: async (id: string, patch: Record<string, unknown>) => { stand.meta.push({ id, patch }); return true; },
}));

const plan = await import("./nachfassplan");
const {
  BP_ENDE_META, DREI_VERSUCHE, KEINE_REAKTION_TITEL, UNTERLAGE_FEHLT_TITEL, ZUSAMMENFASSEN_TITEL,
  beratungsNachfassTexte, dreiVersucheSchluessel, fehlversucheSeitGespraech, gespraechsArt, gespraechsEnde,
  istBeratungspraesentation, legeZusammenfassungAn, nachfassNachBeratung, offenNachBeratung, zusammenfassungFaellig,
} = plan;

beforeEach(() => {
  stand.aufgaben = [];
  stand.meta = [];
});

const STUNDE = 60 * 60 * 1000;

describe("Titel nach Anlass: was zu tun ist", () => {
  it("stehen wie im Prozessstandard", () => {
    expect(ZUSAMMENFASSEN_TITEL).toBe("Gespräch zusammenfassen: Nachfass-Mail innerhalb von 2 Stunden senden");
    expect(UNTERLAGE_FEHLT_TITEL).toBe("Unterlage fehlt: Kunden erinnern");
    expect(KEINE_REAKTION_TITEL).toBe("Seit 48 Stunden keine Reaktion: Kunden anrufen");
    expect(plan.DREI_VERSUCHE_TITEL).toBe("Drei Versuche ohne Erfolg: letzte Nachricht senden und Vorgang pausieren");
    for (const t of [ZUSAMMENFASSEN_TITEL, UNTERLAGE_FEHLT_TITEL, KEINE_REAKTION_TITEL, plan.DREI_VERSUCHE_TITEL]) {
      expect(t).not.toMatch(/[–—]/);
    }
  });
});

describe("Welches Gespräch", () => {
  it("erkennt Erstgespräch und Beratungspräsentation an Anlass oder Titel", () => {
    expect(gespraechsArt("Telefonisches Erstgespräch")).toBe("erstgespraech");
    expect(gespraechsArt("Beratungsgespräch")).toBe("beratung");
    expect(gespraechsArt("Beratungspräsentation")).toBe("beratung");
    expect(gespraechsArt("Irgendwas", "beratung")).toBe("beratung");
    expect(gespraechsArt("Beratungsgespräch", "objektvorstellung")).toBeNull();
    expect(gespraechsArt("Notartermin")).toBeNull();
    expect(istBeratungspraesentation("Finanzierungsgespräch")).toBe(false);
  });
});

describe("Gespräch zusammenfassen", () => {
  it("ist zwei Stunden nach Gesprächsende fällig, ohne Dauer nach einer Stunde Gespräch", () => {
    const beginn = new Date(2026, 9, 16, 14, 0);
    expect(gespraechsEnde(beginn).getHours()).toBe(15);
    expect(zusammenfassungFaellig(gespraechsEnde(beginn, 45))).toEqual({ tag: "2026-10-16", uhrzeit: "16:45" });
    // Über Mitternacht in den nächsten Tag.
    expect(zusammenfassungFaellig(gespraechsEnde(new Date(2026, 9, 16, 22, 0)))).toEqual({ tag: "2026-10-17", uhrzeit: "01:00" });
  });

  it("legt die Aufgabe über addProzessAufgabe an, mit Schlüssel je Kunde, Art und Tag", async () => {
    const ok = await legeZusammenfassungAn({
      kontaktId: "k-1", kundeName: "Erika Muster", art: "erstgespraech",
      beginn: new Date(2026, 9, 16, 10, 0), dauerMinuten: 30, rueckfallZustaendig: "vp-1",
    });
    expect(ok).toBe(true);
    expect(stand.aufgaben).toHaveLength(1);
    const { task, rueckfall } = stand.aufgaben[0];
    expect(task.titel).toBe(ZUSAMMENFASSEN_TITEL);
    expect(task.faellig_am).toBe("2026-10-16");
    expect(task.uhrzeit).toBe("12:30");
    expect(task.ausloeserSchluessel).toBe("gespraech_zusammenfassen:k-1:erstgespraech:2026-10-16");
    expect(rueckfall).toBe("vp-1");
    // Nur die Beratungspräsentation merkt sich ihr Ende am Kontakt.
    expect(stand.meta).toEqual([]);
  });

  it("merkt sich nach der Beratungspräsentation deren Ende am Kontakt", async () => {
    const beginn = new Date(2026, 9, 16, 10, 0);
    await legeZusammenfassungAn({ kontaktId: "k-2", kundeName: "Max", art: "beratung", beginn });
    expect(stand.meta).toEqual([{ id: "k-2", patch: { [BP_ENDE_META]: gespraechsEnde(beginn).toISOString() } }]);
    expect(stand.aufgaben[0].task.ausloeserSchluessel).toBe("gespraech_zusammenfassen:k-2:beratung:2026-10-16");
  });

  it("legt bei ungültigem Datum nichts an", async () => {
    expect(await legeZusammenfassungAn({ kontaktId: "k-1", kundeName: "X", art: "beratung", beginn: new Date("kaputt") })).toBe(false);
    expect(stand.aufgaben).toEqual([]);
  });
});

describe("Nach der Beratungspräsentation: 24 und 48 Stunden", () => {
  const ende = Date.UTC(2026, 9, 16, 12, 0);
  const basis = { endeMs: ende, stufe: "selbstauskunft", offen: ["Selbstauskunft"], hatKuenftigenTermin: false };

  it("vor 24 Stunden nichts, danach erinnern, ab 48 Stunden zusätzlich anrufen", () => {
    expect(nachfassNachBeratung({ ...basis, jetztMs: ende + 23 * STUNDE })).toEqual([]);
    expect(nachfassNachBeratung({ ...basis, jetztMs: ende + 24 * STUNDE })).toEqual(["unterlage_fehlt"]);
    expect(nachfassNachBeratung({ ...basis, jetztMs: ende + 48 * STUNDE })).toEqual(["unterlage_fehlt", "keine_reaktion"]);
  });

  it("alles da, ein Termin steht oder die Stufe ist weiter: kein Hinweis", () => {
    const spaet = ende + 50 * STUNDE;
    expect(nachfassNachBeratung({ ...basis, jetztMs: spaet, offen: [] })).toEqual([]);
    expect(nachfassNachBeratung({ ...basis, jetztMs: spaet, hatKuenftigenTermin: true })).toEqual(["unterlage_fehlt"]);
    expect(nachfassNachBeratung({ ...basis, jetztMs: spaet, stufe: "reservierung" })).toEqual([]);
    expect(nachfassNachBeratung({ ...basis, jetztMs: spaet, stufe: "bg_noshow" })).toEqual([]);
  });

  it("nennt, was fehlt: Selbstauskunft und Mindestunterlagen", () => {
    expect(offenNachBeratung({})).toEqual(["Selbstauskunft", "Personalausweis, letzte Gehaltsabrechnung"]);
    expect(offenNachBeratung({ saSigned: true, docStatuses: { Personalausweis: "uploaded", "Letzter Gehaltsnachweis": "approved" } })).toEqual([]);
    expect(offenNachBeratung({ saSigned: true, docStatuses: { Personalausweis: "uploaded" } })).toEqual(["letzte Gehaltsabrechnung"]);
  });

  it("Texte und Schlüssel", () => {
    expect(beratungsNachfassTexte("unterlage_fehlt", "Erika", ["Selbstauskunft"]).titel).toBe(UNTERLAGE_FEHLT_TITEL);
    const anruf = beratungsNachfassTexte("keine_reaktion", "Erika", ["Selbstauskunft"]);
    expect(anruf.titel).toBe(KEINE_REAKTION_TITEL);
    expect(anruf.typ).toBe("anruf");
    expect(plan.beratungsNachfassSchluessel("keine_reaktion", "k-1", "2026-10-16T12:00:00.000Z")).toBe("keine_reaktion_nach_beratung:k-1:2026-10-16");
  });
});

describe("Drei Versuche ohne Erfolg", () => {
  const anruf = (datum: string, stufe = true) => ({
    id: datum, kundeId: "k-1", art: "anruf" as const, von: "VP", datum,
    beschreibung: stufe ? "Kontaktversuch 7 – Nicht erreicht (Stufe „beratungsgespraech\"). Keine Wartezeit, bitte manuell nachfassen." : "Kontaktversuch 2/15 – Nicht erreicht. Nächster Versuch in 4 Stunden.",
  });
  const gespraech = (datum: string, text = "Beratungsgespräch erschienen ✓") => ({
    id: `g-${datum}`, kundeId: "k-1", art: "meeting" as const, von: "VP", datum, beschreibung: text,
  });

  it("zählt nur Fehlversuche ab der Beratung und seit dem letzten Gespräch", () => {
    const liste = [
      anruf("2026-10-01T10:00:00Z", false), anruf("2026-10-02T10:00:00Z", false), // Leadphase
      anruf("2026-10-05T10:00:00Z"),
      gespraech("2026-10-10T10:00:00Z"),
      anruf("2026-10-12T10:00:00Z"), anruf("2026-10-13T10:00:00Z"),
      gespraech("2026-10-14T10:00:00Z", "Beratungsgespräch nicht erschienen ✓"),
    ];
    expect(fehlversucheSeitGespraech(liste)).toEqual({ anzahl: 2, seit: "2026-10-10T10:00:00Z" });
    expect(DREI_VERSUCHE).toBe(3);
    expect(dreiVersucheSchluessel("k-1", "2026-10-10T10:00:00Z")).toBe("drei_versuche:k-1:2026-10-10");
  });

  it("ohne Gespräch zählt alles ab der Beratung", () => {
    expect(fehlversucheSeitGespraech([anruf("2026-10-05T10:00:00Z")])).toEqual({ anzahl: 1, seit: "" });
    expect(dreiVersucheSchluessel("k-1", "")).toBe("drei_versuche:k-1:ohne_gespraech");
  });
});

describe("Verdrahtung", () => {
  const lies = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

  it("alle vier Wege nach „stattgefunden“ legen die Zusammenfassung an", () => {
    for (const datei of ["lib/terminErgebnis.ts", "lib/festerTerminErgebnis.ts", "pages/KundenDetail.tsx", "pages/videocall/VideocallBuchungen.tsx"]) {
      expect(lies(datei), datei).toContain("await legeZusammenfassungAn({");
    }
  });

  it("der Trigger-Hook prüft 24 und 48 Stunden über addProzessAufgabe mit Schlüssel", () => {
    const hook = lies("hooks/useInvestmentInboxTriggers.ts");
    expect(hook).toContain("nachfassNachBeratung({");
    expect(hook).toContain("ausloeserSchluessel: schluessel,");
  });

  it("das Kundenprofil zählt Fehlversuche seit dem letzten Gespräch", () => {
    const seite = lies("pages/KundenDetail.tsx");
    expect(seite).toContain("fehlversucheSeitGespraech(getAktivitaeten(id))");
    expect(seite).toContain("titel: DREI_VERSUCHE_TITEL,");
  });
});
