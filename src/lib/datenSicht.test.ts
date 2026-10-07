// Die zentrale Führungs-Abfrage: Ist diese Person Führungskraft, und für wen?
//
// Diese Frage stand vorher an fünf Stellen im Code, an jeder mit einer anderen
// Antwort. Die Tests halten die eine Antwort fest, damit sie nicht wieder
// auseinanderläuft.

import { describe, it, expect } from "vitest";
import {
  fuehrungsumfang,
  istFuehrungskraft,
  darfGesamtabrechnungSehen,
  erlaubteSicht,
  sichtbareNutzer,
  gehoertZurSicht,
  FUEHRUNGSROLLEN,
} from "./datenSicht";

describe("fuehrungsumfang", () => {
  it("gibt Inhaber und Administratoren das ganze Haus", () => {
    expect(fuehrungsumfang("inhaber")).toBe("haus");
    expect(fuehrungsumfang("admin")).toBe("haus");
    expect(fuehrungsumfang("testaccount")).toBe("haus");
  });

  it("gibt dem Vertriebsleiter sein Team, nicht das Haus", () => {
    expect(fuehrungsumfang("vertriebsleiter")).toBe("team");
  });

  it("lässt alle anderen bei den eigenen Zahlen", () => {
    for (const rolle of ["vertriebspartner", "setterin", "kunde", "tippgeber", "backoffice"]) {
      expect(fuehrungsumfang(rolle)).toBe("eigene");
    }
    expect(fuehrungsumfang(undefined)).toBe("eigene");
  });
});

describe("istFuehrungskraft", () => {
  it("umfasst den Vertriebsleiter, der auf der Pipeline bisher fehlte", () => {
    expect(istFuehrungskraft("vertriebsleiter")).toBe(true);
    expect(istFuehrungskraft("admin")).toBe(true);
    expect(istFuehrungskraft("inhaber")).toBe(true);
  });

  it("umfasst weder Vertriebspartner noch Kunde oder Tippgeber", () => {
    expect(istFuehrungskraft("vertriebspartner")).toBe(false);
    expect(istFuehrungskraft("kunde")).toBe(false);
    expect(istFuehrungskraft("tippgeber")).toBe(false);
  });

  it("stimmt mit der Liste FUEHRUNGSROLLEN überein", () => {
    for (const rolle of FUEHRUNGSROLLEN) expect(istFuehrungskraft(rolle)).toBe(true);
    expect(FUEHRUNGSROLLEN).toContain("vertriebsleiter");
  });
});

describe("darfGesamtabrechnungSehen", () => {
  it("gilt zusätzlich für die Buchhaltung", () => {
    expect(darfGesamtabrechnungSehen("buchhaltung")).toBe(true);
    expect(istFuehrungskraft("buchhaltung")).toBe(false);
  });
});

describe("erlaubteSicht", () => {
  it("lässt Führungskräfte umschalten", () => {
    expect(erlaubteSicht("vertriebsleiter", "team")).toBe("team");
    expect(erlaubteSicht("admin", "haus")).toBe("haus");
  });

  it("hält alle anderen bei den eigenen Zahlen", () => {
    expect(erlaubteSicht("vertriebspartner", "haus")).toBe("eigene");
  });
});

describe("sichtbareNutzer", () => {
  it("setzt für das ganze Haus keine Grenze", () => {
    expect(sichtbareNutzer("inhaber", "ich", ["a", "b"])).toBeNull();
  });

  it("gibt dem Vertriebsleiter sich selbst und sein Team", () => {
    const ids = sichtbareNutzer("vertriebsleiter", "ich", ["a", "b"]);
    expect(ids).not.toBeNull();
    expect([...ids!].sort()).toEqual(["a", "b", "ich"]);
  });

  it("ignoriert das Team bei einem Vertriebspartner", () => {
    const ids = sichtbareNutzer("vertriebspartner", "ich", ["a", "b"]);
    expect([...ids!]).toEqual(["ich"]);
  });

  it("liefert ohne eigene Kennung nichts statt alles", () => {
    const ids = sichtbareNutzer("vertriebsleiter", undefined, []);
    expect(ids!.size).toBe(0);
  });
});

describe("gehoertZurSicht", () => {
  const team = { ids: new Set(["partner-1"]), namen: new Set(["Alt Bestand"]) };

  it("zeigt in der Hausansicht jeden Kontakt", () => {
    expect(gehoertZurSicht({ zustaendig_id: "fremd" }, "haus", "Ich", "ich")).toBe(true);
  });

  it("erkennt eigene Kontakte über die Kennung", () => {
    expect(gehoertZurSicht({ zustaendig_id: "ich" }, "eigene", "Ich", "ich")).toBe(true);
  });

  it("erkennt eigene Kontakte auch über den Namen", () => {
    expect(gehoertZurSicht({ berater: "Ich" }, "eigene", "Ich", "ich")).toBe(true);
  });

  // Der eigentliche Fehler: Die Teamsicht lief über das Freitextfeld `berater`.
  // Ein Lead mit sauberer Zuständigkeit, aber leerem Namensfeld fiel heraus.
  it("nimmt Teamleads über die Zuständigkeit auf, auch ohne Beraternamen", () => {
    expect(
      gehoertZurSicht({ zustaendig_id: "partner-1", berater: "" }, "team", "Ich", "ich", team),
    ).toBe(true);
  });

  it("nimmt Altbestände ohne Kennung weiterhin über den Namen auf", () => {
    expect(
      gehoertZurSicht({ zustaendig_id: null, berater: "Alt Bestand" }, "team", "Ich", "ich", team),
    ).toBe(true);
  });

  it("lässt fremde Leads aus der Teamsicht heraus", () => {
    expect(
      gehoertZurSicht({ zustaendig_id: "fremd", berater: "Fremd" }, "team", "Ich", "ich", team),
    ).toBe(false);
  });

  it("zählt einen Lead nicht zum Team, nur weil sein Name zufällig passt", () => {
    // Die Kennung entscheidet. Steht sie auf jemand anderem, hilft der Name nicht.
    expect(
      gehoertZurSicht({ zustaendig_id: "fremd", berater: "Alt Bestand" }, "team", "Ich", "ich", team),
    ).toBe(false);
  });

  it("gibt ohne Team nur die eigenen Kontakte", () => {
    expect(gehoertZurSicht({ zustaendig_id: "partner-1" }, "team", "Ich", "ich")).toBe(false);
    expect(gehoertZurSicht({ zustaendig_id: "ich" }, "team", "Ich", "ich")).toBe(true);
  });
});
