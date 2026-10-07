import { describe, it, expect } from "vitest";
import {
  EINWAND_BIBLIOTHEK,
  EINWAND_KATEGORIEN,
  EINWAND_TECHNIKEN,
} from "@/lib/vertriebsakademieContent";

/** Die Schritt-IDs des Erstgesprächsskripts, gegen die verlinkt wird. */
const SKRIPT_SCHRITTE = [
  "einleitung", "anrede", "ziel_gespraech", "warmup", "mitentscheider", "erfahrung",
  "sparformen", "investitionsbereitschaft", "zwei_punkte", "zusammenarbeit",
  "berufliche_situation", "schufa", "netto", "ziele", "cashflow_erwartung",
  "moreimmo_vorstellung", "pattern_interrupt", "skala_verbindlichkeit",
  "terminvereinbarung", "einladung_check", "offene_fragen", "verabschiedung",
];

describe("Einwand-Bibliothek", () => {
  it("führt alle Einwände in einer Tiefe, nicht in zwei", () => {
    expect(EINWAND_BIBLIOTHEK.length).toBeGreaterThanOrEqual(31);
    for (const e of EINWAND_BIBLIOTHEK) {
      expect(e.meintEigentlich?.trim().length, e.id).toBeGreaterThan(0);
      expect(e.antwortKurz?.trim().length, e.id).toBeGreaterThan(0);
      expect(e.falle?.trim().length, e.id).toBeGreaterThan(0);
      expect(e.profiMove?.trim().length, e.id).toBeGreaterThan(0);
    }
  });

  it("hat eindeutige IDs", () => {
    const ids = EINWAND_BIBLIOTHEK.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("verknüpft jeden Einwand mit einer vorhandenen Technik", () => {
    const technikIds = new Set(EINWAND_TECHNIKEN.map((t) => t.id));
    for (const e of EINWAND_BIBLIOTHEK) {
      expect(e.technik, e.id).toBeTruthy();
      expect(technikIds.has(e.technik!), `${e.id} -> ${e.technik}`).toBe(true);
    }
  });

  it("kennt zehn Techniken, jede vollständig erklärt", () => {
    expect(EINWAND_TECHNIKEN.length).toBe(10);
    for (const t of EINWAND_TECHNIKEN) {
      expect(t.name.trim().length, t.id).toBeGreaterThan(0);
      expect(t.kurz.trim().length, t.id).toBeGreaterThan(0);
      // Das Prinzip ist der Teil, der eine Technik von einem Satz unterscheidet.
      expect(t.prinzip.trim().length, `${t.id}: Prinzip zu dünn`).toBeGreaterThan(80);
      expect(t.schritte.length, `${t.id}: Schritte`).toBe(3);
      expect(t.beispiel.trim().length, t.id).toBeGreaterThan(0);
      expect(t.wann.trim().length, t.id).toBeGreaterThan(0);
      expect(t.achtung.trim().length, `${t.id}: Achtung fehlt`).toBeGreaterThan(0);
    }
    expect(new Set(EINWAND_TECHNIKEN.map((t) => t.id)).size).toBe(10);
  });

  it("kein Gedankenstrich in den Technikbeschreibungen", () => {
    const treffer = EINWAND_TECHNIKEN.filter((t) =>
      [t.kurz, t.prinzip, t.beispiel, t.wann, t.achtung, ...t.schritte].some(
        (s) => s.includes("—") || s.includes("–"),
      ),
    ).map((t) => t.id);
    expect(treffer).toEqual([]);
  });

  it("verweist nur auf Schritte, die es im Erstgesprächsskript wirklich gibt", () => {
    for (const e of EINWAND_BIBLIOTHEK) {
      for (const s of e.skriptSchritte ?? []) {
        expect(SKRIPT_SCHRITTE.includes(s), `${e.id} -> ${s}`).toBe(true);
      }
    }
  });

  it("hängt die meisten Einwände an mindestens einen Gesprächsschritt", () => {
    const mit = EINWAND_BIBLIOTHEK.filter((e) => (e.skriptSchritte ?? []).length > 0);
    expect(mit.length / EINWAND_BIBLIOTHEK.length).toBeGreaterThan(0.8);
  });

  it("benutzt nur bekannte Kategorien", () => {
    const kats = new Set(EINWAND_KATEGORIEN.map((k) => k.id));
    for (const e of EINWAND_BIBLIOTHEK) {
      expect(kats.has(e.kategorie), e.id).toBe(true);
    }
  });

  it("jeder Gesprächsschritt mit Einwänden hat höchstens eine Handvoll davon", () => {
    // Sonst wird die Schnellhilfe im Skript zur Liste, durch die niemand scrollt.
    // Ausnahme: Der Schritt "pattern_interrupt" heißt Einwand-Vorwegnahme, dort
    // gehören viele Einwände hin. Die Schnellhilfe zeigt dort zunächst vier und
    // blendet den Rest auf Klick ein.
    for (const s of SKRIPT_SCHRITTE.filter((x) => x !== "pattern_interrupt")) {
      const n = EINWAND_BIBLIOTHEK.filter((e) => e.skriptSchritte?.includes(s)).length;
      expect(n, s).toBeLessThanOrEqual(8);
    }
  });

  it("kein Gedankenstrich in den neuen Feldern", () => {
    const treffer: string[] = [];
    for (const e of EINWAND_BIBLIOTHEK) {
      for (const feld of [e.meintEigentlich, e.falle, e.profiMove]) {
        if (feld && (feld.includes("—") || feld.includes("–"))) treffer.push(e.id);
      }
    }
    // Die elf Bestandseinträge stammen aus der alten Redaktion und dürfen
    // Gedankenstriche behalten, die zwanzig neuen nicht.
    const neue = treffer.filter((id) => !/-0\d$/.test(id));
    expect(neue).toEqual([]);
  });
});
