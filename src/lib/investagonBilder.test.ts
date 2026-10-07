import { describe, it, expect } from "vitest";
import {
  findeBildAdressen,
  bildRang,
  istBildDatei,
  sammleBildUrls,
  stabilerDateiname,
} from "@/lib/investagonBilder";

/**
 * Die Bild-Erkennung entscheidet, ob der Investagon-Dialog "Bildadressen
 * gefunden" oder "Keine Bildadressen in der Antwort" anzeigt. Ein falsches
 * "gefunden" würde die nächste Ausbaustufe auf eine Sackgasse schicken,
 * deshalb prüfen die Tests beide Richtungen.
 */
describe("findeBildAdressen", () => {
  it("findet Bilddateien an Zeichenketten, auch mit Query-String", () => {
    const befund = findeBildAdressen({
      "/api/properties": {
        beispiel: { titelbild: "https://cdn.investagon.com/objekt-1.jpg?w=800" },
      },
    });
    expect(befund.gefunden).toBe(true);
    expect(befund.fundstellen.some((f) => f.includes("objekt-1.jpg"))).toBe(true);
  });

  it("findet Bildfelder am Namen, wenn sie Inhalt tragen", () => {
    const befund = findeBildAdressen({
      beispiel: { images: [{ id: "abc-123" }], name: "Wormser Straße" },
    });
    expect(befund.gefunden).toBe(true);
    expect(befund.fundstellen).toContain("beispiel.images");
  });

  it("meldet leere Bildfelder nicht als Treffer", () => {
    const befund = findeBildAdressen({
      beispiel: { images: [], photo: null, thumbnailUrl: "" },
    });
    expect(befund.gefunden).toBe(false);
    expect(befund.fundstellen).toEqual([]);
  });

  it("meldet nichts, wenn die Antwort keine Bilder enthält", () => {
    const befund = findeBildAdressen({
      "/api/projects": {
        anzahl: 2,
        beispiel: { name: "Karl-Heine-Straße 27", price: 250000, city: "Leipzig" },
      },
    });
    expect(befund.gefunden).toBe(false);
  });

  it("übersteht Fehlerantworten und einfache Werte", () => {
    expect(findeBildAdressen(null).gefunden).toBe(false);
    expect(findeBildAdressen("Fehler").gefunden).toBe(false);
    expect(findeBildAdressen({ "/api/projects": { fehler: "401 Unauthorized" } }).gefunden).toBe(false);
  });

  it("nennt eine Fundstelle nur einmal und begrenzt die Liste", () => {
    const viele = Array.from({ length: 50 }, (_, i) => ({
      photoUrl: `https://cdn.example.com/bild-${i}.png`,
    }));
    const befund = findeBildAdressen({ einheiten: viele });
    expect(befund.gefunden).toBe(true);
    expect(befund.fundstellen.length).toBeLessThanOrEqual(12);
    expect(new Set(befund.fundstellen).size).toBe(befund.fundstellen.length);
  });
});

/**
 * `sammleBildUrls` liefert die Adressen, die der Import wirklich laedt.
 * Anders als die Diagnose darf sie nur ladbare Adressen nennen, sonst
 * versucht der Import, einen blanken Dateinamen herunterzuladen.
 */
describe("sammleBildUrls", () => {
  it("sammelt vollständige und relative Adressen, auch mit Query-String", () => {
    const urls = sammleBildUrls({
      images: [
        { url: "https://cdn.investagon.com/objekt-1.jpg?w=800" },
        { url: "/media/objekt-2.webp" },
      ],
      titelbild: "https://cdn.investagon.com/titel.PNG",
    });
    expect(urls).toEqual([
      "https://cdn.investagon.com/objekt-1.jpg?w=800",
      "/media/objekt-2.webp",
      "https://cdn.investagon.com/titel.PNG",
    ]);
  });

  it("lässt Nicht-Adressen und Nicht-Bilder liegen", () => {
    const urls = sammleBildUrls({
      dateiname: "grundriss.jpg", // blanker Name, keine ladbare Adresse
      dokument: "https://cdn.investagon.com/expose.pdf",
      logo: "https://cdn.investagon.com/logo.svg", // SVG ist kein Objektfoto
      seite: "https://investagon.com/objekt",
    });
    expect(urls).toEqual([]);
  });

  it("nennt eine Adresse nur einmal", () => {
    const urls = sammleBildUrls({
      titelbild: "https://cdn.example.com/a.jpg",
      galerie: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
    });
    expect(urls).toEqual(["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"]);
  });
});

/**
 * `istBildDatei` trennt im Dokumentenpaket Bilder von Dokumenten. Ein PDF,
 * das als Bild durchginge, laege hinterher als kaputtes Foto im Exposé.
 */
describe("istBildDatei", () => {
  it("erkennt Bilddateien an der Endung, unabhängig von der Schreibweise", () => {
    expect(istBildDatei("fotos/aussen.jpg")).toBe(true);
    expect(istBildDatei("fotos/innen.JPEG")).toBe(true);
    expect(istBildDatei("grundriss.png")).toBe(true);
    expect(istBildDatei("bad.webp")).toBe(true);
  });

  it("lässt Dokumente, Ordner und Systemdateien liegen", () => {
    expect(istBildDatei("expose.pdf")).toBe(false);
    expect(istBildDatei("berechnung.xlsx")).toBe(false);
    expect(istBildDatei("fotos/")).toBe(false);
    expect(istBildDatei("__MACOSX/fotos/aussen.jpg")).toBe(false);
    expect(istBildDatei(".DS_Store")).toBe(false);
    expect(istBildDatei("")).toBe(false);
  });
});

/**
 * Der stabile Dateiname ist der Schlüssel der Idempotenz: Gleiche Herkunft
 * ergibt immer denselben Pfad, verschiedene Herkunft nie denselben.
 */
describe("stabilerDateiname", () => {
  it("liefert für dieselbe Herkunft immer denselben Namen", () => {
    const url = "https://cdn.investagon.com/media/objekt-1.jpg?w=800";
    expect(stabilerDateiname(url, url)).toBe(stabilerDateiname(url, url));
  });

  it("hält gleiche Dateinamen aus verschiedenen Quellen auseinander", () => {
    const a = stabilerDateiname("zip:einheit-1:fotos/bad.jpg", "fotos/bad.jpg");
    const b = stabilerDateiname("zip:einheit-2:fotos/bad.jpg", "fotos/bad.jpg");
    expect(a).not.toBe(b);
    expect(a.endsWith("-bad.jpg")).toBe(true);
    expect(b.endsWith("-bad.jpg")).toBe(true);
  });

  it("macht aus Umlauten und Query-Strings einen sicheren Pfad", () => {
    const name = stabilerDateiname(
      "https://cdn.example.com/Außenansicht Süd.jpg?w=800",
      "https://cdn.example.com/Außenansicht Süd.jpg?w=800",
    );
    expect(name).toMatch(/^[0-9a-f]{8}-[\w.-]+$/);
    expect(name.endsWith(".jpg")).toBe(true);
  });
});

/**
 * `bildRang` sortiert die Objektbilder: Außenansichten zuerst, dann
 * Unbestimmtes, dann Innenaufnahmen, ganz zuletzt Pläne.
 */
describe("bildRang", () => {
  it("erkennt Außenaufnahmen", () => {
    expect(bildRang("Fassade Vorderseite.jpg")).toBe(0);
    expect(bildRang("aussenansicht-1.jpeg")).toBe(0);
    expect(bildRang("Strassenansicht.png")).toBe(0);
    expect(bildRang("Hauseingang.jpg")).toBe(0);
  });
  it("stellt Innenaufnahmen und Pläne hinten an", () => {
    expect(bildRang("Badezimmer.jpg")).toBe(2);
    expect(bildRang("Wohnzimmer 3.OG.jpg")).toBe(2);
    expect(bildRang("Grundriss WE12.pdf.png")).toBe(3);
  });
  it("bleibt bei nichtssagenden Namen neutral", () => {
    expect(bildRang("WhatsApp Image 2026-04-29 at 12.27.07.jpeg")).toBe(1);
    expect(bildRang("")).toBe(1);
  });
  it("lässt eindeutige Außenworte gewinnen", () => {
    expect(bildRang("Aussenansicht mit Balkon.jpg")).toBe(0);
    expect(bildRang("Treppenhaus.jpg")).toBe(2);
  });
});
