import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildTree, C_LEVEL_ROLLEN, type Strukturknoten, type TeamMitglied } from "./strukturBaum";

/** Kurzform fuer einen Nutzer mit erfundenen Beispieldaten. */
function person(id: string, rollen: string[]): TeamMitglied {
  return {
    id,
    vorname: id,
    nachname: "Test",
    imonduId: "",
    rolle: rollen[0] || "",
    rolleColor: "",
    email: "",
    telefon: "",
    status: "aktiv",
    _userRoles: rollen,
  };
}

/** Kurzform fuer einen Tippgeber, der einer Person zugeordnet ist. */
function tippgeberFuer(id: string, zugeordnetId: string): TeamMitglied {
  return { ...person(id, []), istTippgeber: true, zugeordnetId };
}

/** Eine Zeile aus `user_settings` mit Teamleiter-Zuordnung. */
function zuordnung(userId: string, teamleiterId: string) {
  return { user_id: userId, einstellungen: { teamleader_id: teamleiterId } };
}

/** Alle Kennungen des Baums, doppelte eingeschlossen. */
function alleIds(knoten: Strukturknoten): string[] {
  return [knoten.id, ...(knoten.children || []).flatMap(alleIds)];
}

/** Direkte Kinder eines Knotens. */
function kindIds(knoten: Strukturknoten): string[] {
  return (knoten.children || []).map(k => k.id);
}

function suche(knoten: Strukturknoten, id: string): Strukturknoten | undefined {
  if (knoten.id === id) return knoten;
  for (const kind of knoten.children || []) {
    const treffer = suche(kind, id);
    if (treffer) return treffer;
  }
  return undefined;
}

describe("buildTree", () => {
  it("haengt eine C-Level-Person auf die zweite Ebene, auch mit fremder Teamleiter-Zuordnung", () => {
    const nutzer = [
      person("inhaber", ["inhaber"]),
      person("leiter", ["vertriebsleiter"]),
      person("partner", ["vertriebspartner"]),
    ];
    // Der Vertriebsleiter ist einem Vertriebspartner zugeordnet. Die
    // C-Level-Ebene geht dieser Zuordnung vor.
    const settings = [zuordnung("leiter", "partner"), zuordnung("partner", "inhaber")];

    const baum = buildTree(nutzer, [], "all", settings);

    expect(baum.id).toBe("inhaber");
    expect(kindIds(baum)).toContain("leiter");
    expect(kindIds(suche(baum, "partner")!)).not.toContain("leiter");
  });

  it("haengt einen Partner unter seinen C-Level-Teamleiter", () => {
    const nutzer = [
      person("inhaber", ["inhaber"]),
      person("leiter", ["vertriebsleiter"]),
      person("partner", ["vertriebspartner"]),
    ];
    const settings = [zuordnung("partner", "leiter")];

    const baum = buildTree(nutzer, [], "all", settings);

    expect(kindIds(baum)).toEqual(["leiter"]);
    expect(kindIds(suche(baum, "leiter")!)).toEqual(["partner"]);
  });

  it("haengt einen Tippgeber unter die Person, der er zugeordnet ist", () => {
    const nutzer = [person("inhaber", ["inhaber"]), person("partner", ["vertriebspartner"])];
    const tippgeber = [tippgeberFuer("tipp", "partner")];
    const settings = [zuordnung("partner", "inhaber")];

    const baum = buildTree(nutzer, tippgeber, "all", settings);

    expect(kindIds(suche(baum, "partner")!)).toEqual(["tipp"]);
  });

  it("zeigt niemanden zweimal, auch nicht bei C-Level plus Vertriebspartner", () => {
    const nutzer = [
      person("inhaber", ["inhaber"]),
      // Traegt beide Rollen. Gehoert damit nur auf die C-Level-Ebene.
      person("doppelt", ["vertriebsleiter", "vertriebspartner"]),
      person("partner", ["vertriebspartner"]),
      person("waise", ["vertriebspartner"]),
    ];
    const settings = [zuordnung("doppelt", "inhaber"), zuordnung("partner", "doppelt")];

    const baum = buildTree(nutzer, [], "all", settings);
    const ids = alleIds(baum);

    expect(ids.filter(id => id === "doppelt")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(kindIds(baum)).toContain("doppelt");
    expect(kindIds(suche(baum, "doppelt")!)).toEqual(["partner"]);
  });

  it("laeuft bei einer zirkulaeren Teamleiter-Zuordnung nicht endlos", () => {
    const nutzer = [
      person("inhaber", ["inhaber"]),
      person("a", ["vertriebspartner"]),
      person("b", ["vertriebspartner"]),
      person("c", ["vertriebspartner"]),
    ];
    const settings = [
      // Gegenseitige Zuordnung ueber die Wurzel: a haengt unter dem Inhaber,
      // der Inhaber laut Einstellung unter a.
      zuordnung("a", "inhaber"),
      zuordnung("inhaber", "a"),
      // Gegenseitige Zuordnung zweier Partner ohne Verbindung nach oben.
      zuordnung("b", "c"),
      zuordnung("c", "b"),
    ];

    const baum = buildTree(nutzer, [], "all", settings);
    const ids = alleIds(baum);

    // Kein Aufhaengen, keine Doppelung, die Wurzel bleibt die Wurzel.
    expect(new Set(ids).size).toBe(ids.length);
    expect(baum.id).toBe("inhaber");
    expect(kindIds(baum)).toEqual(["a"]);
    expect(kindIds(suche(baum, "a")!)).toEqual([]);
    // b und c zeigen nur aufeinander. Sie erscheinen nicht im Baum, weil ihr
    // Teamleiter zwar existiert, aber von der Wurzel aus nie erreicht wird.
    // Das ist der bisherige Stand und hier nur festgehalten.
    expect(ids).not.toContain("b");
    expect(ids).not.toContain("c");
  });

  it("erzeugt keine leere Ebene, wenn es gar keine C-Level-Person gibt", () => {
    const nutzer = [
      person("inhaber", ["inhaber"]),
      person("partner", ["vertriebspartner"]),
      person("unterpartner", ["vertriebspartner"]),
    ];
    const settings = [zuordnung("partner", "inhaber"), zuordnung("unterpartner", "partner")];

    const baum = buildTree(nutzer, [], "all", settings);

    expect(kindIds(baum)).toEqual(["partner"]);
    expect(kindIds(suche(baum, "partner")!)).toEqual(["unterpartner"]);
  });

  it("laesst den Inhaber die Wurzel bleiben, auch mit C-Level-Rolle", () => {
    const nutzer = [
      person("inhaber", ["inhaber", "vertriebsleiter"]),
      person("partner", ["vertriebspartner"]),
    ];
    const settings = [zuordnung("partner", "inhaber")];

    const baum = buildTree(nutzer, [], "all", settings);
    const ids = alleIds(baum);

    expect(baum.id).toBe("inhaber");
    expect(ids.filter(id => id === "inhaber")).toHaveLength(1);
    expect(kindIds(baum)).toEqual(["partner"]);
  });

  it("haengt Waisen unter die Wurzel und kennzeichnet sie", () => {
    const nutzer = [
      person("inhaber", ["inhaber"]),
      person("leiter", ["vertriebsleiter"]),
      person("waise", ["vertriebspartner"]),
    ];
    // "waise" hat keine Zuordnung. Sie darf nicht unter der C-Level-Person
    // landen, das haette niemand so entschieden.
    const settings = [zuordnung("leiter", "inhaber")];

    const baum = buildTree(nutzer, [], "all", settings);

    expect(kindIds(baum)).toContain("waise");
    expect(suche(baum, "waise")!.ohneTeamleiter).toBe(true);
    expect(kindIds(suche(baum, "leiter")!)).toEqual([]);
  });

  it("zeigt bei gewaehlter Einzelperson nur deren Teilbaum ohne C-Level darueber", () => {
    const nutzer = [
      person("inhaber", ["inhaber"]),
      person("leiter", ["vertriebsleiter"]),
      person("partner", ["vertriebspartner"]),
    ];
    const settings = [zuordnung("leiter", "inhaber"), zuordnung("partner", "leiter")];

    const baum = buildTree(nutzer, [], "leiter", settings);

    expect(baum.id).toBe("leiter");
    expect(kindIds(baum)).toEqual(["partner"]);
  });

  it("kennt genau die sechs vereinbarten C-Level-Rollen", () => {
    expect(C_LEVEL_ROLLEN).toEqual([
      "admin",
      "vertriebsleiter",
      "hr",
      "buchhaltung",
      "finanzierungspartner",
      "objektpartner",
    ]);
  });

  /*
   * Wer im Baum stehen soll, muss von der Seite auch geladen werden. Steht eine
   * C-Level-Rolle nicht in `allowedRoles`, fehlt die Person still auf der
   * zweiten Ebene, ohne Fehlermeldung. Genau das war bei hr, buchhaltung und
   * finanzierungspartner der Fall.
   */
  it("wird von der Seite auch geladen, jede einzelne Rolle", () => {
    const quelle = readFileSync("src/pages/Teampartner.tsx", "utf-8");
    for (const rolle of C_LEVEL_ROLLEN) {
      expect(quelle, rolle).toContain(`"${rolle}"`);
    }
  });
});
