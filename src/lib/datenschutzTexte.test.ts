import { describe, expect, it } from "vitest";
import {
  DATENSCHUTZ_TEXTE,
  PLATZHALTER,
  type DatenschutzBaustein,
  type DatenschutzFassung,
} from "./datenschutzTexte";
import { ANLAGE_4_BETROFFENEN_TEXT, ANLAGE_4_BETROFFENEN_TITEL } from "./vertragAnlage4";

function texteAus(baustein: DatenschutzBaustein): string[] {
  if (typeof baustein === "string") return [baustein];
  if ("liste" in baustein) return baustein.liste;
  if ("zeilen" in baustein) return baustein.zeilen;
  if ("tabelle" in baustein) return [...baustein.tabelle.kopf, ...baustein.tabelle.zeilen.flat()];
  return [baustein.cookieEinstellungen];
}

function alleTexte(f: DatenschutzFassung): string[] {
  const texte = [f.titel, f.stand, f.inhaltTitel];
  for (const a of f.abschnitte) {
    texte.push(a.titel, ...a.inhalt.flatMap(texteAus));
    for (const u of a.unterabschnitte ?? []) texte.push(u.titel, ...u.inhalt.flatMap(texteAus));
  }
  return texte;
}

function alleIds(f: DatenschutzFassung): string[] {
  return f.abschnitte.flatMap((a) => [a.id, ...(a.unterabschnitte ?? []).map((u) => u.id)]);
}

const { de, en } = DATENSCHUTZ_TEXTE;

describe("Datenschutzerklärung, Texte", () => {
  it("hat in beiden Sprachen dieselben Sprungmarken in derselben Reihenfolge", () => {
    expect(alleIds(en)).toEqual(alleIds(de));
  });

  it("vergibt jede Sprungmarke nur einmal", () => {
    const ids = alleIds(de);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([
    ["de", de],
    ["en", en],
  ] as const)("enthält in %s keine Gedankenstriche", (_s, fassung) => {
    const mitStrich = alleTexte(fassung).filter((t) => /[–—]|\s-\s/.test(t));
    expect(mitStrich).toEqual([]);
  });

  it("spricht auf Deutsch im Sie (Gruppe F)", () => {
    const duForm = alleTexte(de).filter((t) => /\b(du|dich|dir|dein|deine|deinen|deiner|euch|euer)\b/i.test(t));
    expect(duForm).toEqual([]);
  });

  it("veröffentlicht keine Platzhalter (Muss-Punkt der Gegenlesung)", () => {
    expect(alleTexte(de).filter((t) => t.includes(PLATZHALTER.de) || t.includes("["))).toEqual([]);
    expect(alleTexte(en).filter((t) => t.includes(PLATZHALTER.en) || t.includes("["))).toEqual([]);
  });

  it("nennt keinen Datenschutzbeauftragten und verlinkt keine AVV-Vorlage", () => {
    for (const f of [de, en]) {
      const text = alleTexte(f).join("\n");
      expect(text).not.toMatch(/Datenschutzbeauftragte|data protection officer/i);
      expect(text).not.toContain("AVV-Template");
      expect(alleIds(f)).not.toContain("avv");
    }
  });

  it("beschreibt Kirchensteuer, Art. 26 und Linkzählung wie im Code (Entscheidungen 27.09.2026)", () => {
    for (const f of [de, en]) {
      const text = alleTexte(f).join("\n");
      // Kirchensteuer: Pflichtfeld ohne Haken, also keine Art.-9-Einwilligung behaupten.
      expect(text).not.toMatch(/Art\. 9 Abs\. 2 lit\. a|Art\. 9\(2\)\(a\)/);
      // Art. 26: nur neue Partner haben Anlage 4, also keinen Abschluss mit allen behaupten.
      expect(text).not.toMatch(/Vereinbarung geschlossen|have concluded an arrangement/);
      // Zählpixel sind seit 49929df0 entfernt; gezählt wird nur der Linkaufruf.
      expect(text).toMatch(/keine Zählpixel|contain no tracking pixels/);
      expect(text).not.toMatch(/Öffnungszählung|open tracking/i);
    }
  });

  it("übernimmt den Betroffenentext aus Anlage 4 wörtlich und beschreibt die Einwilligung je Partner", () => {
    const meta = de.abschnitte.find((a) => a.id === "meta")!;
    const gemeinsam = meta.unterabschnitte?.find((u) => u.id === "meta-gemeinsame-verantwortung");
    expect(gemeinsam?.titel).toBe(ANLAGE_4_BETROFFENEN_TITEL);
    expect(gemeinsam?.inhalt).toEqual(ANLAGE_4_BETROFFENEN_TEXT);
    expect(meta.unterabschnitte?.length).toBe(
      en.abschnitte.find((a) => a.id === "meta")!.unterabschnitte?.length,
    );
    const text = alleTexte({ ...de, abschnitte: [meta] }).join(" ");
    expect(text).toMatch(/genau diesen Partner/);
    expect(text).toMatch(/allgemeine Wahl zu Marketing im Cookie-Hinweis reicht dafür nicht/);
    expect(text).toMatch(/13 Kalendermonate/);
    expect(text).toMatch(/Nur notwendige/);
    expect(text).toMatch(/nie ein Pixel/);
  });

  it("die englische Fassung von Anlage 4 folgt der Quelle: gleiche Absätze, gleiche Seiten, Anschrift und Mail", () => {
    const enMeta = en.abschnitte.find((a) => a.id === "meta")!;
    const enText = enMeta.unterabschnitte!.find((u) => u.id === "meta-gemeinsame-verantwortung")!.inhalt as string[];
    expect(enText.length).toBe(ANLAGE_4_BETROFFENEN_TEXT.length);
    ANLAGE_4_BETROFFENEN_TEXT.forEach((absatz, i) => {
      for (const pfad of absatz.match(/\/[a-z]+\//g) ?? []) expect(enText[i], `Absatz ${i + 1}: ${pfad}`).toContain(pfad);
      for (const fest of ["Wendelsteinstraße 19", "datenschutz@more.immo", "Art. 26"]) {
        if (absatz.includes(fest)) expect(enText[i], `Absatz ${i + 1}: ${fest}`).toContain(fest);
      }
    });
    // Die Seitenangaben: /vp/, /handbuch/ samt Konfigurator, nie die Selbstauskunft.
    expect(ANLAGE_4_BETROFFENEN_TEXT[0]).toMatch(/samt Konfigurator/);
    expect(ANLAGE_4_BETROFFENEN_TEXT[0]).toMatch(/Selbstauskunft der Handbuch-Seite[^.]*kein Pixel/);
    expect(enText[0]).toMatch(/including the configurator/);
    expect(enText[0]).toMatch(/self-disclosure of the handbook page/);
  });

  it("enthält den Abschnitt zum Geldwäschegesetz und stützt ihn auf lit. c", () => {
    const gwg = de.abschnitte.find((a) => a.id === "geldwaesche");
    expect(gwg && alleTexte({ ...de, abschnitte: [gwg] }).join(" ")).toMatch(/Art\. 6 Abs\. 1 lit\. c DSGVO.*fünf Jahre/);
  });

  it("zeigt öffentlich nur den Monat, nicht den internen Entwurfsvermerk", () => {
    expect(de.stand).toBe("Stand: September 2026");
    for (const t of [...alleTexte(de), ...alleTexte(en)]) {
      expect(t).not.toMatch(/\bEntwurf\b|anwaltlich|26\.09\.2026|\bdraft\b/i);
    }
  });

  it("bietet im Abschnitt Cookies den Link zu den Cookie-Einstellungen", () => {
    for (const f of [de, en]) {
      const cookies = f.abschnitte.find((a) => a.id === "cookies");
      expect(cookies?.inhalt.some((b) => typeof b === "object" && "cookieEinstellungen" in b)).toBe(true);
    }
  });

  it("nennt die zuständige Aufsichtsbehörde und die Adresse für Datenschutzanfragen", () => {
    const text = alleTexte(de).join("\n");
    expect(text).toContain("Bayerisches Landesamt für Datenschutzaufsicht");
    expect(text).toContain("datenschutz@more.immo");
    expect(text).toContain("Wendelsteinstraße 19");
  });
});
