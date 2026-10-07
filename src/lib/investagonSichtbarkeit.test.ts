import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  neueOhneAngebotAussortieren,
  planeRuecknahme,
  projektAngebot,
  VERMERK_SCHLUESSEL,
  type VermerkObjekt,
} from "../../supabase/functions/investagon-import/sichtbarkeit";

/*
 * Christians Regel, Stand Nachmittag 23.09.2026:
 *
 * - Objekte ohne angebotene Einheit bleiben sichtbar und stehen in der
 *   Objektuebersicht unter "Nicht verfuegbar". Der Import blendet nichts
 *   mehr aus.
 * - Was die Fassung vom Vormittag mit Vermerk ausgeblendet hat (23 Objekte),
 *   blendet der naechste Lauf wieder ein und entfernt den Vermerk. Von Hand
 *   Ausgeblendetes ohne Vermerk bleibt.
 * - Neue Projekte ohne ein einziges Angebot werden nicht angelegt.
 *
 * Werte in Investagon: visibility -1 Offline, 0 Ueberpruefung, 1 Online;
 * active 0 Verkauft, 1 Frei, 5/6/7/9 angefragt bis Notartermin.
 */

const VERMERK = { grund: "offline", am: "2026-09-23T08:15:00.000Z" };

function einheiten(anzahl: number, roh: Record<string, unknown>) {
  return Array.from({ length: anzahl }, () => ({ roh: { ...roh } }));
}

function projekt(slug: string, liste: { roh?: Record<string, unknown> }[]) {
  return { slug, einheiten: liste };
}

function objekt(
  id: string,
  sichtbar: boolean,
  weitereMeta: Record<string, unknown> = {},
): VermerkObjekt {
  return {
    id,
    titel: `Objekt ${id}`,
    sichtbar,
    meta: { investagonSlug: id, ...weitereMeta },
  };
}

describe("Was ein Projekt anbietet, aus seinen Einheiten", () => {
  it("bietet etwas an, sobald eine Einheit online und weder verkauft noch Entwurf ist", () => {
    expect(
      projektAngebot([
        { visibility: -1, active: 1 },
        { visibility: 1, active: 6 },
        { visibility: 0, active: 1 },
      ]),
    ).toBe("angeboten");
  });

  it("bietet nichts an, wenn alles offline, in Überprüfung, verkauft oder Entwurf ist", () => {
    expect(projektAngebot(einheiten(11, { visibility: -1, active: 1 }).map((e) => e.roh)))
      .toBe("nicht_angeboten");
    expect(projektAngebot([{ visibility: 1, active: 0 }, { visibility: 0, active: 1 }]))
      .toBe("nicht_angeboten");
    expect(projektAngebot([{ visibility: 1, active: 1, draft: 1 }])).toBe("nicht_angeboten");
  });

  it("macht aus fehlenden Angaben nie ein 'nicht angeboten'", () => {
    expect(projektAngebot([])).toBe("unbekannt");
    expect(projektAngebot([{ visibility: -1, active: 1 }, {}])).toBe("unbekannt");
    expect(projektAngebot([undefined])).toBe("unbekannt");
  });
});

describe("Neue Projekte ohne Angebot werden nicht angelegt", () => {
  const imCrm = new Set(["bestand-offline", "zweitkennung"]);

  it("legt ein neues Projekt, das in Investagon nie online war, nicht an", () => {
    const neu = projekt("neu-offline", einheiten(4, { visibility: -1, active: 1 }));
    const ergebnis = neueOhneAngebotAussortieren([neu], imCrm);
    expect(ergebnis.behalten).toEqual([]);
    expect(ergebnis.nichtAngelegt).toEqual([neu]);
  });

  it("legt auch ein neues, schon ausverkauftes Projekt nicht an", () => {
    const neu = projekt("neu-verkauft", einheiten(3, { visibility: 1, active: 0 }));
    expect(neueOhneAngebotAussortieren([neu], imCrm).nichtAngelegt).toEqual([neu]);
  });

  it("gleicht ein vorhandenes Objekt weiter ab, auch wenn es offline gegangen ist", () => {
    const bestand = projekt("bestand-offline", einheiten(5, { visibility: -1, active: 1 }));
    const zweit = projekt("zweitkennung", einheiten(2, { visibility: 0, active: 1 }));
    const ergebnis = neueOhneAngebotAussortieren([bestand, zweit], imCrm);
    expect(ergebnis.behalten).toEqual([bestand, zweit]);
    expect(ergebnis.nichtAngelegt).toEqual([]);
  });

  it("legt neue Projekte mit Angebot oder ohne Angaben an wie bisher", () => {
    const mitAngebot = projekt("neu-online", [{ roh: { visibility: 1, active: 1 } }]);
    const ohneAngaben = projekt("neu-unklar", [{ roh: {} }]);
    const ausDatei = projekt("aus-datei", [{}]);
    const ohneEinheiten = projekt("leer", []);
    const ergebnis = neueOhneAngebotAussortieren(
      [mitAngebot, ohneAngaben, ausDatei, ohneEinheiten],
      imCrm,
    );
    expect(ergebnis.behalten).toHaveLength(4);
    expect(ergebnis.nichtAngelegt).toEqual([]);
  });
});

describe("Die Ausblendungen vom Vormittag werden zurückgenommen", () => {
  it("blendet ein Objekt mit Vermerk wieder ein und entfernt den Vermerk", () => {
    const o = objekt("freie-10", false, { [VERMERK_SCHLUESSEL]: VERMERK, kalkulation: { zins: 3.9 } });
    expect(planeRuecknahme([o])).toEqual([
      {
        id: "freie-10",
        titel: "Objekt freie-10",
        einblenden: true,
        meta: { investagonSlug: "freie-10", kalkulation: { zins: 3.9 } },
      },
    ]);
  });

  it("nimmt auch einen nachgetragenen Vermerk zurück", () => {
    const o = objekt("mahlower-3", false, {
      [VERMERK_SCHLUESSEL]: { ...VERMERK, nachgetragen: true },
    });
    expect(planeRuecknahme([o])[0]).toMatchObject({ einblenden: true });
  });

  it("entfernt nur den Vermerk, wenn das Objekt schon wieder sichtbar ist", () => {
    const o = objekt("von-hand-eingeblendet", true, { [VERMERK_SCHLUESSEL]: VERMERK });
    const [schritt] = planeRuecknahme([o]);
    expect(schritt.einblenden).toBe(false);
    expect(schritt.meta).not.toHaveProperty(VERMERK_SCHLUESSEL);
  });

  it("laesst eine Handausblendung ohne Vermerk unangetastet", () => {
    expect(planeRuecknahme([objekt("von-hand", false), objekt("sichtbar", true)])).toEqual([]);
  });

  it("nimmt alle 23 Ausblendungen in einem Lauf zurück, ohne Notbremse", () => {
    const bestand = [
      ...Array.from({ length: 23 }, (_, i) => objekt(`orange-${i}`, false, { [VERMERK_SCHLUESSEL]: VERMERK })),
      ...Array.from({ length: 68 }, (_, i) => objekt(`gruen-${i}`, true)),
    ];
    const schritte = planeRuecknahme(bestand);
    expect(schritte).toHaveLength(23);
    expect(schritte.every((s) => s.einblenden)).toBe(true);
  });

  it("ignoriert einen leeren Eintrag unter dem Schlüssel", () => {
    expect(planeRuecknahme([objekt("x", false, { [VERMERK_SCHLUESSEL]: null })])).toEqual([]);
  });
});

describe("Der Import blendet nichts mehr aus", () => {
  it("schreibt nirgends sichtbar = false", () => {
    // Wie `objektauswahlEineStelle.test.ts`: Der Quelltext sichert eine
    // Zusage ab, die sich sonst still zurueckdrehen liesse.
    for (const datei of ["index.ts", "sichtbarkeit.ts", "verkaeufe.ts"]) {
      const text = readFileSync(
        resolve(process.cwd(), "supabase/functions/investagon-import", datei),
        "utf8",
      );
      expect(text, datei).not.toMatch(/sichtbar:\s*false/);
    }
  });
});
