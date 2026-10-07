import { describe, expect, it } from "vitest";
import {
  adressSchluessel,
  baueAdressIndex,
  eintragen,
  findeAdressTreffer,
  hausSchluessel,
  mitZweitkennung,
  slugsVon,
  titelSchluessel,
} from "../../supabase/functions/investagon-import/dubletten";

/*
 * Titel wie im Bestand vom 17.09.2026, Adressen und Postleitzahlen
 * synthetisch. Die neun Paare sind dasselbe Haus in zwei
 * Vermarktungsmodellen und duerfen NIE zusammengefuehrt werden.
 */
const MODELLPAARE: { a: string; b: string; adresse: string; plz: string }[] = [
  {
    a: "01. Hof, Ossecker Straße 42 (Standard-Modell)",
    b: "01. Hof, Ossecker Straße 42 (All-inclusive-Modell)",
    adresse: "Ossecker Straße 42",
    plz: "95032",
  },
  {
    a: "02. Hof, Ossecker Straße 46 (Standard-Modell)",
    b: "02. Hof, Ossecker Straße 46 (All-inclusive-Modell)",
    adresse: "Ossecker Straße 46",
    plz: "95032",
  },
  {
    a: "03. Hof, Scharnhorststraße 1 (Standard-Modell)",
    b: "03. Hof, Scharnhorststraße 1 (All-inclusive-Modell)",
    adresse: "Scharnhorststraße 1",
    plz: "95028",
  },
  {
    a: "04. Hof, Scharnhorststraße 3 (Standard-Modell)",
    b: "04. Hof, Scharnhorststraße 3 (All-inclusive-Modell)",
    adresse: "Scharnhorststraße 3",
    plz: "95028",
  },
  {
    a: "05. Hof, Scharnhorststraße 5 (Standard-Modell)",
    b: "05. Hof, Scharnhorststraße 5 (All-inclusive-Modell)",
    adresse: "Scharnhorststraße 5",
    plz: "95028",
  },
  {
    a: "12. Nürnberg, Breitscheidstraße 18 (Standard-Modell)",
    b: "12. Nürnberg, Breitscheidstraße 18 (All-inclusive-Modell)",
    adresse: "Breitscheidstraße 18",
    plz: "90459",
  },
  {
    a: "15. Nürnberg, Gebhard-Ott-Straße 5 (Standard-Modell)",
    b: "15. Nürnberg, Gebhard-Ott-Straße 5 (All-inclusive-Modell)",
    adresse: "Gebhard-Ott-Straße 5",
    plz: "90439",
  },
  {
    a: "13. Landsbergerstraße 22a, 82210 Germering",
    b: "13. Landsbergerstraße 22a, 82210 Germering (Co-Living)",
    adresse: "Landsbergerstraße 22a",
    plz: "82210",
  },
  {
    a: "Quartier Würzburg - Co-Living",
    b: "Quartier Würzburg - Bestandswohnungen",
    adresse: "Nürnberger Straße 10",
    plz: "97076",
  },
];

const objekt = (
  id: string,
  titel: string,
  adresse: string,
  plz: string,
  slug?: string,
) => ({ id, titel, adresse, plz, meta: slug ? { investagonSlug: slug } : {} });

describe("Dublettenschutz: Modellvarianten bleiben getrennt", () => {
  it.each(MODELLPAARE)(
    "$a und $b sind trotz gleicher Adresse zwei Objekte",
    ({ a, b, adresse, plz }) => {
      const index = baueAdressIndex([objekt("alt", a, adresse, plz, "slug-a")]);
      expect(
        findeAdressTreffer(index, { name: b, adresse, plz }),
      ).toEqual({ art: "keiner" });
      // Und in der Gegenrichtung genauso.
      const index2 = baueAdressIndex([objekt("alt", b, adresse, plz, "slug-b")]);
      expect(
        findeAdressTreffer(index2, { name: a, adresse, plz }),
      ).toEqual({ art: "keiner" });
    },
  );

  it("findet dasselbe Modell aber wieder, auch aus dem zweiten Zugang", () => {
    for (const { a, adresse, plz } of MODELLPAARE) {
      const index = baueAdressIndex([objekt("alt", a, adresse, plz, "slug-a")]);
      expect(findeAdressTreffer(index, { name: a, adresse, plz })).toEqual({
        art: "import",
        id: "alt",
        titel: a,
        slug: "slug-a",
      });
    }
  });

  it("legt beide Modelle nebeneinander ab, ohne sich zu ueberschreiben", () => {
    const { a, b, adresse, plz } = MODELLPAARE[0];
    const index = baueAdressIndex([
      objekt("a", a, adresse, plz, "slug-a"),
      objekt("b", b, adresse, plz, "slug-b"),
    ]);
    expect(index.size).toBe(2);
  });
});

describe("Dublettenschutz: echte Dubletten", () => {
  it("erkennt gleiche Adresse UND gleichen Titel als dasselbe Haus", () => {
    const index = baueAdressIndex([
      objekt("alt", "07. Nürnberg, Musterweg 3", "Musterweg 3", "90402", "lehner-7"),
    ]);
    expect(
      findeAdressTreffer(index, {
        name: "07. Nürnberg, Musterweg 3",
        adresse: "Musterweg 3",
        plz: "90402",
      }),
    ).toMatchObject({ art: "import", id: "alt", slug: "lehner-7" });
  });

  it("glaettet Schreibweise, Leerzeichen und Umlaute", () => {
    const index = baueAdressIndex([
      objekt("alt", "01. Hof,  Ossecker Straße 42", "Ossecker Straße 42", "95032", "a"),
    ]);
    expect(
      findeAdressTreffer(index, {
        name: "01. Hof, Ossecker Str. 42 ",
        adresse: "Ossecker Str. 42",
        plz: "95032 ",
      }),
    ).toMatchObject({ art: "import", id: "alt" });
    expect(adressSchluessel("Landsbergerstraße 22a", "82210"))
      .toBe(adressSchluessel("Landsbergerstr. 22 a", "82210"));
    expect(titelSchluessel("Standard-Modell")).toBe(titelSchluessel("standard modell"));
  });

  it("vergleicht die Postleitzahl mit", () => {
    const index = baueAdressIndex([
      objekt("alt", "Musterweg 3", "Musterweg 3", "90402", "a"),
    ]);
    expect(
      findeAdressTreffer(index, { name: "Musterweg 3", adresse: "Musterweg 3", plz: "90403" }),
    ).toEqual({ art: "keiner" });
  });

  it("ohne Adresse, Postleitzahl oder Titel gibt es keinen Treffer", () => {
    expect(hausSchluessel({ titel: "Ohne Adresse", adresse: "", plz: "95032" })).toBe("");
    expect(hausSchluessel({ titel: "Ohne PLZ", adresse: "Musterweg 3", plz: "" })).toBe("");
    expect(hausSchluessel({ titel: "", adresse: "Musterweg 3", plz: "95032" })).toBe("");
    const index = baueAdressIndex([objekt("alt", "Musterweg 3", "", "", "a")]);
    expect(
      findeAdressTreffer(index, { name: "Musterweg 3", adresse: "", plz: "" }),
    ).toEqual({ art: "keiner" });
  });

  it("fuehrt nichts zusammen, wenn der Bestand selbst schon doppelt liegt", () => {
    const index = baueAdressIndex([
      objekt("a", "Musterweg 3", "Musterweg 3", "90402", "lehner-7"),
      objekt("b", "Musterweg 3", "Musterweg 3", "90402", "moreimmo-7"),
    ]);
    expect(
      findeAdressTreffer(index, { name: "Musterweg 3", adresse: "Musterweg 3", plz: "90402" }),
    ).toEqual({ art: "mehrdeutig", anzahl: 2 });
  });

  it("uebernimmt kein von Hand angelegtes Objekt, sondern meldet es nur", () => {
    const index = baueAdressIndex([
      objekt("hand", "Musterweg 3", "Musterweg 3", "90402"),
    ]);
    expect(
      findeAdressTreffer(index, { name: "Musterweg 3", adresse: "Musterweg 3", plz: "90402" }),
    ).toEqual({ art: "handarbeit", id: "hand", titel: "Musterweg 3" });
  });

  it("kennt Objekte, die im selben Lauf erst entstanden sind", () => {
    const index = baueAdressIndex([]);
    eintragen(index, objekt("neu", "Musterweg 3", "Musterweg 3", "90402", "lehner-7"));
    expect(
      findeAdressTreffer(index, { name: "Musterweg 3", adresse: "Musterweg 3", plz: "90402" }),
    ).toMatchObject({ art: "import", id: "neu" });
  });
});

describe("Zweitkennung", () => {
  it("laesst die Hauptkennung stehen und haengt die neue daneben", () => {
    const meta = { investagonSlug: "lehner-7", anlageklasse: "Eigentumswohnung" };
    const ergaenzt = mitZweitkennung(meta, "moreimmo-7", "More Immo (eigener Bestand)");
    expect(ergaenzt.investagonSlugsWeitere).toEqual(["moreimmo-7"]);
    expect(ergaenzt.investagonSlug).toBeUndefined();
    expect((ergaenzt.investagonZweitkennungen as any)["moreimmo-7"]).toMatchObject({
      bautraeger: "More Immo (eigener Bestand)",
    });
  });

  it("traegt dieselbe Kennung kein zweites Mal ein", () => {
    const meta = { investagonSlug: "lehner-7", investagonSlugsWeitere: ["moreimmo-7"] };
    expect(mitZweitkennung(meta, "moreimmo-7", "More Immo").investagonSlugsWeitere)
      .toEqual(["moreimmo-7"]);
    expect(mitZweitkennung(meta, "lehner-7", "Lehner").investagonSlugsWeitere)
      .toEqual(["moreimmo-7"]);
  });

  it("nennt alle Kennungen eines Objekts, damit die Bereinigung sie kennt", () => {
    expect(slugsVon({ investagonSlug: "a", investagonSlugsWeitere: ["b", "c"] }))
      .toEqual(["a", "b", "c"]);
    expect(slugsVon({})).toEqual([]);
    expect(slugsVon(null)).toEqual([]);
  });
});
