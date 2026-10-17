import { describe, it, expect } from "vitest";
import {
  EINWAND_BIBLIOTHEK,
  EINWAND_KATEGORIEN,
  EINWAND_TECHNIKEN,
} from "@/lib/vertriebsakademieContent";

/** Die Schritt-IDs des Erstgesprächsskripts, gegen die verlinkt wird. */
const SKRIPT_SCHRITTE = [
  "einleitung", "anrede", "ziel_gespraech", "warmup", "familiaere_situation", "berufliche_situation",
  "ziele", "rentenluecke", "sparformen", "ueberleitung_rahmen", "netto", "eigenkapital",
  "investitionsbereitschaft", "schufa", "osimmobilien_vorstellung", "ablauf", "zusammenfassung",
  "einschaetzung", "skala_verbindlichkeit", "terminvereinbarung", "einladung_check", "offene_fragen",
  "verabschiedung",
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
    // Ausnahme: Die ehrliche Einschätzung (Schritt 18, früher die
    // Einwand-Vorwegnahme) ist die Stelle, an der versteckte Einwände kommen.
    // Die Schnellhilfe zeigt dort zunächst vier und blendet den Rest auf Klick ein.
    for (const s of SKRIPT_SCHRITTE.filter((x) => x !== "einschaetzung")) {
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

  describe("nach dem OS-Handbuch Einwandbehandlung (Stand 15.10.2026)", () => {
    // Die fünfzehn Einwände des Handbuchs, in seiner Reihenfolge.
    const HANDBUCH = [
      "preis-21", "produkt-40", "preis-01", "zeit-40", "familie-01", "produkt-23", "produkt-41",
      "produkt-20", "produkt-25", "produkt-42", "bank-22", "produkt-43", "produkt-33",
      "denkezeit-39", "vertrauen-01",
    ];

    it("führt alle fünfzehn vorn, mit Nachfrage, Zustimmungsfrage und Nie-Sätzen", () => {
      expect(EINWAND_BIBLIOTHEK.slice(0, 15).map((e) => e.id)).toEqual(HANDBUCH);
      for (const e of EINWAND_BIBLIOTHEK.slice(0, 15)) {
        expect(e.nachfrage?.trim().length, e.id).toBeGreaterThan(0);
        expect(e.zustimmung?.trim().length, e.id).toBeGreaterThan(0);
        expect(e.nie?.length, e.id).toBeGreaterThan(0);
        expect(e.antwortZahlen?.trim().length, e.id).toBeGreaterThan(0);
      }
    });

    it("findet die neuen Einwände über Stichworte", () => {
      const finde = (q: string) =>
        EINWAND_BIBLIOTHEK.filter((e) =>
          [e.einwand, e.meintEigentlich, e.antwortKurz, e.nachfrage ?? "", ...(e.tags ?? [])]
            .join(" ")
            .toLowerCase()
            .includes(q),
        ).map((e) => e.id);
      expect(finde("weit weg")).toContain("produkt-40");
      expect(finde("keine zeit")).toContain("zeit-40");
      expect(finde("hausgeld")).toContain("produkt-41");
      expect(finde("eigenheim")).toContain("produkt-42");
      expect(finde("abschreibung")).toContain("produkt-43");
    });

    it("spricht per Du, ohne Gedankenstrich, Druck oder Fremdbezug", () => {
      for (const e of EINWAND_BIBLIOTHEK) {
        const text = [
          e.einwand, e.meintEigentlich, e.antwortKurz, e.antwortStory ?? "", e.antwortZahlen ?? "",
          e.nachfrage ?? "", e.zustimmung ?? "", e.falle, e.profiMove ?? "",
        ].join(" ");
        expect(/[–—]/.test(text), `${e.id}: Gedankenstrich`).toBe(false);
        // „Sie“ ist am Satzanfang oft „sie“, deshalb nur die eindeutigen Formen.
        expect(/\b(Ihnen|Ihre[mnrs]?)\b/.test(text), `${e.id}: Sie-Form`).toBe(false);
        expect(/Bayern|Augsburg|Sachsen/.test(text), `${e.id}: Bundesland`).toBe(false);
        // Kaufnebenkosten nur mit den Sätzen für Berlin und Brandenburg.
        expect(/5,5 %|5,5 bis/.test(text), `${e.id}: Kaufnebenkosten`).toBe(false);
      }
    });
  });
});
