import { describe, expect, it } from "vitest";
import { projekteAusPaket, type Uebergabepaket } from "../../supabase/functions/investagon-import/uebergabe-paket";

/**
 * Import aus dem Uebergabe-Paket (07.10.2026): Ohne API-Schluessel kommen die
 * Investagon-Daten aus der Oberflaeche. Geprueft wird die Zuordnung, die
 * spaeter ueber Wohnung und Bilder entscheidet.
 */

const einheit = (id: string, we: string) => ({
  id,
  object_apartment_number: we,
  object_size: "42,5",
  object_rooms: "2",
  purchase_price_apartment: "161000",
  rent_apartment_month: "552,89",
  object_street: "Hauffstraße",
  object_house_number: "38 a",
  object_postal_code: "14548",
  object_city: "Schwielowsee",
  active: 1,
  visibility: 1,
});

const paket: Uebergabepaket = {
  erstellt: "2026-10-07T20:00:00.000Z",
  projekte: [{
    code: "ox6qzw52",
    roh: { id: "32589", name: "Hauffstraße 38", object_street: "Hauffstraße", object_house_number: "38 a", object_postal_code: "14548", object_city: "Schwielowsee" },
    einheiten: [einheit("274944", "1"), einheit("274978", "35"), einheit("339456", "35")],
    fotos: [
      { datei: "p1.jpg", art: "projekt", einheit: null, reihenfolge: 0 },
      { datei: "e1.jpg", art: "einheit", einheit: "274944", reihenfolge: 1 },
      { datei: "doppelt.jpg", art: "einheit", einheit: "339456", reihenfolge: 2 },
      { datei: "fehlt.jpg", art: "einheit", einheit: "274944", reihenfolge: 3 },
    ],
    dokumente: [
      { name: "Teilungserklärung", datei: "t.pdf", typ: "declaration_of_division", einheit: null },
      { name: "Wirtschaftsplan", datei: "w.pdf", typ: "economic_plan", einheit: "274978" },
    ],
  }],
};

const link = (pfad: string) => (pfad.includes("fehlt") ? undefined : `https://speicher.test/${pfad}`);

describe("Investagon-Übergabe", () => {
  const { projekte, bildQuellen, hinweise } = projekteAusPaket(paket, link);
  const quelle = bildQuellen.get("32589")!;

  it("nimmt die Investagon-ID als Kennung, wie der API-Import", () => {
    expect(projekte[0].slug).toBe("32589");
    expect(quelle.projektRoh.api_project_id).toBe("32589");
  });

  it("übernimmt eine doppelt geführte Wohnung einmal, mit den Bildern beider Einträge", () => {
    expect(projekte[0].einheiten.map((e) => e.we)).toEqual(["1", "35"]);
    const we35 = quelle.einheiten.find((e) => e.we === "35")!;
    expect((we35.roh.photos as { filename: string }[]).map((f) => f.filename)).toEqual(["https://speicher.test/foto__doppelt.jpg"]);
    expect(hinweise.join(" ")).toContain("WE 35 doppelt");
  });

  it("hängt Fotos und Dokumente an Projekt bzw. Wohnung und lässt fehlende Dateien weg", () => {
    expect((quelle.projektRoh.photos as unknown[]).length).toBe(1);
    expect((quelle.projektRoh.files as { title: string }[])[0].title).toBe("Teilungserklärung");
    const we1 = quelle.einheiten.find((e) => e.we === "1")!;
    expect((we1.roh.photos as unknown[]).length).toBe(1);
    const we35 = quelle.einheiten.find((e) => e.we === "35")!;
    expect((we35.roh.files as { filename: string }[])[0].filename).toBe("https://speicher.test/dok__w.pdf");
  });
});
