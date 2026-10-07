import { describe, it, expect } from "vitest";

/**
 * Die Marktargumente aus der Standortdatenbank der Marktanalyse.
 *
 * Geprüft wird, was einen falschen Werbesatz erzeugen würde: ein Objekt, das
 * der falschen Stadt zugeordnet wird, eine geschätzte Zahl, die als erhoben
 * durchgeht, die von einem Sprachmodell geschriebene Arbeitgeberliste, oder
 * ein Mietniveau, das zu einer Aussage über Mieteinnahmen einlädt.
 */

import {
  findeMarktStandorte,
  istErhobeneKennzahl,
  istErhobenerArbeitgeber,
  MARKT_NAEHE_KM,
  marktQuellen,
  ortKern,
  waehleMarktStandort,
  type MarktKennzahl,
  type MarktStandort,
} from "../../supabase/functions/_shared/objekt-texte-markt";

const STANDORTE: MarktStandort[] = [
  { id: "aux", name: "Augsburg", bundesland: "Bayern", lat: 48.37, lng: 10.898 },
  { id: "ffm", name: "Frankfurt am Main", bundesland: "Hessen", lat: 50.11, lng: 8.682 },
  { id: "ffo", name: "Frankfurt (Oder)", bundesland: "Brandenburg", lat: 52.347, lng: 14.55 },
  { id: "bn1", name: "Bonn", bundesland: "Nordrhein-Westfalen", lat: 50.737, lng: 7.098 },
  { id: "bn2", name: "Bonn", bundesland: "Nordrhein-Westfalen", lat: 50.737, lng: 7.098 },
];

describe("Welchem Standort ein Objekt zugeordnet wird", () => {
  it("nimmt denselben Ort, auch mit Stadtteil oder anderer Schreibweise", () => {
    expect(findeMarktStandorte(STANDORTE, { ort: "Augsburg" })).toMatchObject({ art: "ort", kandidaten: [{ id: "aux" }] });
    expect(findeMarktStandorte(STANDORTE, { ort: "Augsburg-Göggingen" })).toMatchObject({ art: "ort", kandidaten: [{ id: "aux" }] });
    expect(findeMarktStandorte(STANDORTE, { ort: "Frankfurt am Main" })).toMatchObject({ kandidaten: [{ id: "ffm" }] });
    expect(ortKern("Halle (Saale)")).toBe("halle");
  });

  it("rät bei einem mehrdeutigen Namen nicht, sondern nimmt die Lage", () => {
    expect(findeMarktStandorte(STANDORTE, { ort: "Frankfurt" })).toBeUndefined();
    const nahOder = findeMarktStandorte(STANDORTE, { ort: "Frankfurt" }, { lat: 52.35, lng: 14.5 });
    expect(nahOder).toMatchObject({ art: "naehe", kandidaten: [{ id: "ffo" }] });
  });

  it("nimmt einen nahen Standort nur bis zur Grenze und nennt die Entfernung", () => {
    // Stadtbergen liegt wenige Kilometer westlich von Augsburg.
    const nah = findeMarktStandorte(STANDORTE, { ort: "Stadtbergen" }, { lat: 48.365, lng: 10.84 });
    expect(nah).toMatchObject({ art: "naehe", kandidaten: [{ id: "aux" }] });
    if (nah?.art === "naehe") expect(nah.entfernungKm).toBeLessThan(MARKT_NAEHE_KM);
    // Mitten in der Lüneburger Heide ist keine Stadt der Liste nah genug.
    expect(findeMarktStandorte(STANDORTE, { ort: "Egestorf" }, { lat: 53.19, lng: 10.07 })).toBeUndefined();
    expect(findeMarktStandorte(STANDORTE, { ort: "Egestorf" })).toBeUndefined();
  });

  it("nimmt bei doppelt geführtem Namen den Eintrag mit den meisten erhobenen Zahlen", () => {
    const zuordnung = findeMarktStandorte(STANDORTE, { ort: "Bonn" })!;
    expect(zuordnung.kandidaten).toHaveLength(2);
    const kennzahlen: MarktKennzahl[] = [
      { standort_id: "bn2", kennzahl: "einwohner", wert: 330000, quelle_id: "destatis" },
      { standort_id: "bn2", kennzahl: "arbeitslosenquote_pct", wert: 6.1, quelle_id: "destatis" },
      { standort_id: "bn1", kennzahl: "einwohner", wert: 1, quelle_id: "ai" },
    ];
    expect(waehleMarktStandort(zuordnung, kennzahlen).id).toBe("bn2");
  });
});

describe("Nur Erhobenes", () => {
  it("lässt Schätzungen und gerechnete Bodenrichtwerte draußen", () => {
    expect(istErhobeneKennzahl({ quelle_id: "destatis", wert: 5 })).toBe(true);
    expect(istErhobeneKennzahl({ quelle_id: "boris", wert: 520, meta: { methode: "wfs" } })).toBe(true);
    expect(istErhobeneKennzahl({ quelle_id: "boris", wert: 520, meta: { methode: "kaufpreis_x_0.35" } })).toBe(false);
    expect(istErhobeneKennzahl({ quelle_id: "bbsr_heuristik", wert: 520 })).toBe(false);
    expect(istErhobeneKennzahl({ quelle_id: "ai", wert: 5 })).toBe(false);
    expect(istErhobeneKennzahl({ quelle_id: "", wert: 5 })).toBe(false);
    expect(istErhobeneKennzahl({ quelle_id: "destatis", wert: null })).toBe(false);
  });

  it("lässt die von einem Sprachmodell geschriebene Arbeitgeberliste draußen", () => {
    expect(istErhobenerArbeitgeber({ name: "Erfundene Werke AG", quelle: "ai" })).toBe(false);
    expect(istErhobenerArbeitgeber({ name: "Unbekannte Herkunft GmbH" })).toBe(false);
    expect(istErhobenerArbeitgeber({ name: "Stadtwerke", quelle: "ihk" })).toBe(true);
  });
});

describe("Die Zeilen für das Modell", () => {
  const augsburg = STANDORTE[0];
  const ort = { art: "ort" as const, kandidaten: [augsburg] };
  const kennzahlen: MarktKennzahl[] = [
    { standort_id: "aux", kennzahl: "einwohner", wert: 301033, stand: "2026-07-10", quelle_id: "destatis" },
    { standort_id: "aux", kennzahl: "arbeitslosenquote_pct", wert: 4.1, stand: "2026-07-10", quelle_id: "destatis" },
    { standort_id: "aux", kennzahl: "bodenrichtwert_eur_qm", wert: 780, stand: "2026-06-02", quelle_id: "boris", meta: { methode: "wfs" } },
    // Preis- und Mietniveau gehen bewusst nicht an das Modell.
    { standort_id: "aux", kennzahl: "miete_qm_eur", wert: 12.4, stand: "2026-06-02", quelle_id: "bbsr" },
    { standort_id: "aux", kennzahl: "kaufpreis_qm_wohnung_eur", wert: 4200, stand: "2026-06-02", quelle_id: "bbsr" },
  ];

  it("nennt je Kennzahl Stadt, Wert, Quelle und Stand, mit einer Kopfzeile zur Zuordnung", () => {
    const zeilen = marktQuellen({ standort: augsburg, zuordnung: ort, kennzahlen });
    expect(zeilen[0]).toBe("Markt, Standort der Marktanalyse: Augsburg (Bayern), derselbe Ort wie das Objekt");
    expect(zeilen).toContain("Markt Augsburg, Einwohner: 301.033 (Destatis, Stand 07/2026)");
    expect(zeilen).toContain("Markt Augsburg, Arbeitslosenquote: 4,1 Prozent (Destatis, Stand 07/2026)");
    expect(zeilen).toContain("Markt Augsburg, Bodenrichtwert: 780 Euro je m² (BORIS-D, Stand 06/2026)");
    expect(zeilen.join(" ")).not.toMatch(/miet|kaufpreis/i);
  });

  it("sagt beim nahen Standort, dass das Objekt nicht dort liegt", () => {
    const zeilen = marktQuellen({ standort: augsburg, zuordnung: { art: "naehe", kandidaten: [augsburg], entfernungKm: 6 }, kennzahlen });
    expect(zeilen[0]).toBe("Markt, nächstgelegener Standort der Marktanalyse: Augsburg (Bayern), rund 6 km Luftlinie vom Objekt entfernt");
  });

  it("rechnet eine Einwohnerentwicklung nur über mindestens ein Jahr", () => {
    const mitVerlauf = [
      ...kennzahlen,
      { standort_id: "aux", kennzahl: "einwohner", wert: 295000, stand: "2021-07-10", quelle_id: "destatis" },
    ];
    const zeilen = marktQuellen({ standort: augsburg, zuordnung: ort, kennzahlen: mitVerlauf });
    expect(zeilen.join("\n")).toContain("Einwohnerentwicklung: von 295.000 (Stand 07/2021) auf 301.033 (Stand 07/2026), plus 2 Prozent");

    const zweiAbrufeImSelbenJahr = [
      ...kennzahlen,
      { standort_id: "aux", kennzahl: "einwohner", wert: 300000, stand: "2026-01-10", quelle_id: "destatis" },
    ];
    expect(marktQuellen({ standort: augsburg, zuordnung: ort, kennzahlen: zweiAbrufeImSelbenJahr }).join("\n")).not.toContain("Einwohnerentwicklung");
  });

  it("nennt erhobene Arbeitgeber, keine aus der KI-Liste", () => {
    const zeilen = marktQuellen({
      standort: augsburg,
      zuordnung: ort,
      kennzahlen: [],
      arbeitgeber: [
        { name: "Erfundene Werke AG", quelle: "ai", rang: 1 },
        { name: "Klinikum Augsburg", branche: "Gesundheit", mitarbeiter: 6000, quelle: "ihk", rang: 2 },
      ],
    });
    expect(zeilen).toContain("Markt Augsburg, große Arbeitgeber laut Unternehmensregister: Klinikum Augsburg (Gesundheit, rund 6.000 Beschäftigte)");
    expect(zeilen.join(" ")).not.toContain("Erfundene");
  });

  it("gibt ohne erhobene Angaben gar nichts zurück, auch keine Kopfzeile", () => {
    const nurGeschaetzt: MarktKennzahl[] = [{ standort_id: "aux", kennzahl: "einwohner", wert: 1, quelle_id: "ai" }];
    expect(marktQuellen({ standort: augsburg, zuordnung: ort, kennzahlen: nurGeschaetzt })).toEqual([]);
    expect(marktQuellen({ standort: augsburg, zuordnung: ort, kennzahlen: null })).toEqual([]);
  });
});
