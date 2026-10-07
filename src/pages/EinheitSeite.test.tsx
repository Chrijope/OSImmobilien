import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Die Einheiten-Seite eines Ein-Einheiten-Objekts: Sie ersetzt die
 * Objektseite. Deshalb fehlt die Karte „Weitere Einheiten in diesem Haus",
 * die Brotkrumen führen ohne Zwischenstufe zur Objektliste, und die
 * Objektangaben samt „Objekt bearbeiten" liegen hier.
 * Bei mehreren Einheiten bleibt alles wie gehabt, bis auf die Textkarte:
 * Beschreibung und Standort stehen seit dem 23.09.2026 auf jeder
 * Einheitsseite.
 *
 * Seit dem 23.09.2026 (Christians Vorgabe) gibt es „Objektangaben pflegen"
 * nicht mehr. Admin und Inhaber öffnen die Objektangaben über den Stift an
 * ihrer Karte, Beschreibung und Standort über den Stift an der Textkarte.
 * Andere Rollen sehen keinen Stift.
 */

const objekte = vi.hoisted(() => ({ liste: {} as Record<string, unknown>, rolle: "admin", zugangUmgehen: false }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: objekte.rolle, name: "Test", email: "" }, authUser: null }),
}));
// Der selbsttätige Textlauf gehört nicht hierher, er hat seinen eigenen Test.
vi.mock("@/lib/objektTexteKi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektTexteKi")>()),
  brauchtObjektTexte: () => false,
  starteObjektTexteBeiBedarf: async () => undefined,
}));
// Lässt die Seite ohne Zugangsprüfung rendern, um die Regel für die Stifte
// auch unabhängig von ihr zu prüfen.
vi.mock("@/components/objektseite/ObjektseiteZugang", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/components/objektseite/ObjektseiteZugang")>();
  return {
    ObjektseiteZugang: (p: { verwaltungPfad: string; children: React.ReactNode }) =>
      objekte.zugangUmgehen ? <>{p.children}</> : <echt.ObjektseiteZugang {...p} />,
  };
});
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => objekte.liste[id],
}));

const { default: EinheitSeite } = await import("./EinheitSeite");
const { OBJEKT_TEXTE_META_SCHLUESSEL, OBJEKT_TEXTE_SCHEMA } = await import("@/lib/objektTexteKi");

function we(id: string): ObjektWohnung {
  return { id, weNr: `WE ${id}`, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei" };
}

function objekt(id: string, wohnungen: ObjektWohnung[]): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: { verwaltung: "Hausverwaltung Beispiel GmbH", standortargumente: ["Wachsende Stadt"] },
  } as unknown as ObjektData;
}

function renderMit(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route path="/objekte/:id/einheiten/:weId" element={<EinheitSeite />} />
        <Route path="/objekte/:id/wohnung/:weId" element={<p>Verwaltungsansicht</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const STIFT_ANGABEN = "Objektangaben bearbeiten";
const STIFT_TEXTE = "Beschreibung und Standort bearbeiten";

beforeEach(() => {
  objekte.rolle = "admin";
  objekte.zugangUmgehen = false;
});

describe("Einheiten-Seite bei genau einer Einheit", () => {
  it("blendet die weiteren Einheiten aus und zeigt stattdessen die Objektangaben mit den Objektaktionen", () => {
    objekte.liste = { o1: objekt("o1", [we("w1")]) };
    renderMit("/objekte/o1/einheiten/w1");
    expect(screen.queryByText("Weitere Einheiten in diesem Haus")).not.toBeInTheDocument();
    expect(screen.getByText("Objektangaben")).toBeInTheDocument();
    expect(screen.getByText("Hausverwaltung Beispiel GmbH")).toBeInTheDocument();
    // Die Standortargumente stehen jetzt in derselben Textkarte wie auf der Objektseite.
    expect(screen.getByText("Beschreibung und Standort")).toBeInTheDocument();
    expect(screen.getByText("Wachsende Stadt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Objekt bearbeiten" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Objektangaben pflegen/ })).not.toBeInTheDocument();
    // Brotkrumen ohne Zwischenstufe: der Objektname ist kein Link mehr.
    expect(screen.getByRole("link", { name: "Objekte" })).toHaveAttribute("href", "/objekte");
    expect(screen.getByText("Haus o1").closest("a")).toBeNull();
    expect(screen.queryByText("1 von 1 frei")).not.toBeInTheDocument();
  });

  it("zeigt genau eine Karte Objektdetails mit Zeilen und Erklärung, keine Karte Auf einen Blick mehr", () => {
    objekte.liste = { o1: objekt("o1", [{ ...we("w1"), stellplatzPreis: 9500, stellplatzMiete: 40 }]) };
    renderMit("/objekte/o1/einheiten/w1");
    expect(screen.getAllByText("Objektdetails")).toHaveLength(1);
    expect(screen.queryByText("Auf einen Blick")).not.toBeInTheDocument();
    expect(screen.getByText("Info-Symbol zeigt die Erklärung")).toBeInTheDocument();
    // Kaufpreis und Größe stehen in den Kacheln, nicht mehr in der Karte; Stellplatz steht jetzt in der Karte.
    expect(screen.queryByText("Kaufpreis")).not.toBeInTheDocument();
    expect(screen.queryByText("Größe")).not.toBeInTheDocument();
    expect(screen.getByText("Wohnfläche")).toBeInTheDocument();
    expect(screen.getByText("Stellplatz")).toBeInTheDocument();
    expect(screen.getByText("40 € Miete je Monat")).toBeInTheDocument();
  });

  /*
   * Christians Auftrag vom 23.09.2026: Verwaltung nach Regel, im
   * Gemeinschaftseigentum echte Angaben statt der Objektbeschreibung, die
   * Sanierungen aus den Angaben des Bauträgers mit Vermerk.
   */
  it("zeigt Verwaltung, Gemeinschaftseigentum und Sanierungen eines WG-Objekts aus Investagon", () => {
    const o = objekt("o3", [{ ...we("w1"), investagonRaw: { object_share_owner: 2.345, heating_type: "gas" } }]);
    o.titel = "Landsbergerstraße 22a (Co-Living)";
    o.meta = {
      investagonSlug: "abc",
      investagonRaw: { extras: [{ id: 1, value: "Objektbeschreibung, die hier nicht hingehört.", weight: 0 }] },
      objekttexteKi: { sanierungen: [{ jahr: "2024", massnahme: "Dach und Fassade renoviert", beleg: "Extras" }] },
    };
    objekte.liste = { o3: o };
    renderMit("/objekte/o3/einheiten/w1");
    expect(screen.getByText("WEG- und SEV-Verwaltung")).toBeInTheDocument();
    expect(screen.getByText("Heizung Gas")).toBeInTheDocument();
    expect(screen.getByText("Miteigentumsanteil 2,345 %")).toBeInTheDocument();
    expect(screen.getByText("Dach und Fassade renoviert")).toBeInTheDocument();
    expect(screen.getByText(/aus den Angaben des Bauträgers, nicht von uns geprüft/)).toBeInTheDocument();
    // Seit dem 24.09.2026 ohne Kennzeichnung der automatischen Auslesung.
    expect(screen.queryByText(/automatisch herausgelesen/)).not.toBeInTheDocument();
    expect(screen.getByText("Zuletzt 2024")).toBeInTheDocument();
  });

  it("überschreibt die Sanierungsliste neutral, weil sie auch Maßnahmen in den Wohnungen nennt (24.09.2026)", () => {
    // Bad und Küche sind Sondereigentum; unter „am Gemeinschaftseigentum“ standen sie falsch.
    const o = objekt("o4", [we("w1")]);
    o.meta = { objekttexteKi: { sanierungen: [{ jahr: "2023", massnahme: "Bäder und Küchen in allen Wohnungen erneuert", beleg: "Exposé" }] } };
    objekte.liste = { o4: o };
    renderMit("/objekte/o4/einheiten/w1");
    expect(screen.getByText("Bäder und Küchen in allen Wohnungen erneuert")).toBeInTheDocument();
    expect(screen.getByText("Sanierungen und Maßnahmen")).toBeInTheDocument();
    expect(screen.queryByText(/Maßnahmen am Gemeinschaftseigentum/)).not.toBeInTheDocument();
  });

  it("zeigt bei mehreren Einheiten weiterhin die weiteren Einheiten und den Weg zur Objektseite", () => {
    objekte.liste = { o2: objekt("o2", [we("w1"), we("w2")]) };
    renderMit("/objekte/o2/einheiten/w1");
    expect(screen.getByText("Weitere Einheiten in diesem Haus")).toBeInTheDocument();
    expect(screen.queryByText("Objektangaben")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Objekt bearbeiten" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Haus o2" })).toHaveAttribute("href", "/objekte/o2");
  });
});

describe("Bearbeiten-Stifte auf der Einheitsseite eines Einzelobjekts", () => {
  for (const rolle of ["admin", "inhaber"]) {
    it(`zeigt ${rolle} den Stift an den Objektangaben und an der Textkarte, ohne die alten Knöpfe`, () => {
      objekte.rolle = rolle;
      objekte.liste = { o1: objekt("o1", [we("w1")]) };
      renderMit("/objekte/o1/einheiten/w1");
      expect(screen.getByRole("button", { name: STIFT_TEXTE })).toBeInTheDocument();
      for (const name of [/Objektangaben pflegen/, /^Pflegen$/, /Texte erzeugen/, /Neu erzeugen/, /Selbst schreiben/]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      }
      fireEvent.click(screen.getByRole("button", { name: STIFT_ANGABEN }));
      expect(screen.getByRole("dialog", { name: "Objektangaben pflegen" })).toBeInTheDocument();
    });
  }

  it("nennt beim Admin den Stift als Weg für Sanierungen, keinen Objektpartner", () => {
    objekte.liste = { o1: objekt("o1", [we("w1")]) };
    renderMit("/objekte/o1/einheiten/w1");
    expect(screen.getByText(/Sanierungen trägst du über den Stift an den Objektangaben ein/)).toBeInTheDocument();
    expect(screen.queryByText(/Objektpartner/)).not.toBeInTheDocument();
    expect(screen.queryByText(/über „Objektangaben pflegen/)).not.toBeInTheDocument();
  });

  for (const rolle of ["objektpartner", "vertriebspartner"]) {
    it(`schickt ${rolle} auf die Verwaltungsansicht`, () => {
      objekte.rolle = rolle;
      objekte.liste = { o1: objekt("o1", [we("w1")]) };
      renderMit("/objekte/o1/einheiten/w1");
      expect(screen.getByText("Verwaltungsansicht")).toBeInTheDocument();
    });

    it(`zeigt ${rolle} auch ohne Zugangsprüfung keinen Stift und keinen Pflegeknopf`, () => {
      objekte.rolle = rolle;
      objekte.zugangUmgehen = true;
      objekte.liste = { o1: objekt("o1", [we("w1")]) };
      renderMit("/objekte/o1/einheiten/w1");
      expect(screen.getByText("Objektangaben")).toBeInTheDocument();
      expect(screen.getByText("Wachsende Stadt")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: STIFT_ANGABEN })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: STIFT_TEXTE })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Objektangaben pflegen/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Sanierungen trägst du/)).not.toBeInTheDocument();
    });
  }

});

/*
 * Beschreibung und Standort auf JEDER Einheitsseite.
 *
 * Bis zum 23.09.2026 hielt hier ein Test das Gegenteil fest: Bei Häusern mit
 * mehreren Einheiten stand die Textkarte nur auf der Objektseite. Christian
 * fragte deshalb, warum nicht alle Einheitsseiten Texte haben, und will sie
 * ausdrücklich überall sehen. Es sind dieselben Texte des Objekts, der Stift
 * folgt denselben Rechten wie auf der Objektseite, und der interne Vermerk
 * bleibt Admin und Inhaber vorbehalten. Die Objektangaben selbst pflegt man
 * bei mehreren Einheiten weiter auf der Objektseite.
 */
describe("Textkarte bei mehreren Einheiten", () => {
  const MIT_VERMERK = {
    [OBJEKT_TEXTE_META_SCHLUESSEL]: {
      schema: OBJEKT_TEXTE_SCHEMA,
      kurzbeschreibung: "Frisch sanierter Altbau mit neuem Dach.",
      standortargumente: [{ argument: "Wachsende Stadt", beleg: "x" }],
      marktargumente: [],
      sanierungen: [],
      erzeugtAm: "2026-09-23T10:00:00.000Z",
      modell: "m",
      quellenStand: "q",
      quellen: [],
      beanstandungen: [],
      umgebung: { gemessen: false, grund: "Overpass weg.", art: "dienst" },
    },
  };
  const mehrere = (meta: Record<string, unknown> = {}) => {
    const o = objekt("o2", [we("w1"), we("w2")]);
    return { ...o, meta: { ...(o.meta as Record<string, unknown>), ...meta } } as ObjektData;
  };

  it("zeigt dieselben Texte des Objekts und dem Admin den Stift, aber nicht die Objektangaben", () => {
    objekte.liste = { o2: mehrere() };
    renderMit("/objekte/o2/einheiten/w1");
    expect(screen.getByText("Beschreibung und Standort")).toBeInTheDocument();
    expect(screen.getByText("Wachsende Stadt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: STIFT_TEXTE })).toBeInTheDocument();
    // Die Objektangaben pflegt man bei mehreren Einheiten weiter auf der Objektseite.
    expect(screen.queryByRole("button", { name: STIFT_ANGABEN })).not.toBeInTheDocument();
    expect(screen.getByText(/auf der Objektseite über den Stift an den Objektdetails/)).toBeInTheDocument();
  });

  it("zeigt Admin und Inhaber den internen Vermerk", () => {
    for (const rolle of ["admin", "inhaber"]) {
      objekte.rolle = rolle;
      objekte.liste = { o2: mehrere(MIT_VERMERK) };
      const { unmount } = renderMit("/objekte/o2/einheiten/w1");
      expect(screen.getByText("Frisch sanierter Altbau mit neuem Dach.")).toBeInTheDocument();
      expect(screen.getByTestId("interner-vermerk")).toBeInTheDocument();
      unmount();
    }
  });

  it("zeigt dem Vertrieb die Texte, aber weder Stift noch Vermerk", () => {
    objekte.rolle = "vertriebspartner";
    objekte.zugangUmgehen = true;
    objekte.liste = { o2: mehrere(MIT_VERMERK) };
    renderMit("/objekte/o2/einheiten/w1");
    expect(screen.getByText("Frisch sanierter Altbau mit neuem Dach.")).toBeInTheDocument();
    expect(screen.getByText("Wachsende Stadt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: STIFT_TEXTE })).not.toBeInTheDocument();
    expect(screen.queryByTestId("interner-vermerk")).not.toBeInTheDocument();
    expect(screen.queryByText("Bitte ansehen")).not.toBeInTheDocument();
  });
});

/**
 * Anordnung des Reiters „Übersicht“ seit dem 24.09.2026, zweite Fassung
 * (Christians Vorgabe, analog zur Objektseite): Galerie über die ganze
 * Breite, darunter Kacheln neben Objektdetails, dann Beschreibung und
 * Standort neben den Sanierungen, ganz unten die weiteren Einheiten.
 */
describe("Anordnung der Einheiten-Seite", () => {
  /** true, wenn `a` im Dokument vor `b` steht. */
  const davor = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("stellt Galerie, Kacheln mit Objektdetails, Beschreibung mit Sanierungen und weitere Einheiten untereinander", () => {
    objekte.liste = { o9: objekt("o9", [we("w1"), we("w2")]) };
    renderMit("/objekte/o9/einheiten/w1");
    const galerie = screen.getByTestId("uebersicht-galerie");
    const kennzahlen = screen.getByTestId("uebersicht-kennzahlen");
    const beschreibungZeile = screen.getByTestId("uebersicht-beschreibung");
    const weitere = screen.getByText("Weitere Einheiten in diesem Haus");

    // Die Galerie steht allein in ihrer Zeile.
    expect(galerie).toContainElement(screen.getByText("Galerie"));
    expect(galerie).not.toContainElement(screen.getByText("Gesamtinvestition"));

    // Zeile 2: links die vier Kacheln 2 × 2, rechts die Objektdetails.
    const kacheln = screen.getByTestId("einheit-kacheln");
    expect(kennzahlen.className).toContain("xl:grid-cols-2");
    expect(kennzahlen.children[0]).toBe(kacheln);
    for (const k of ["Gesamtinvestition", "Monatsmiete kalt", "Wohnfläche", "Typ und Nutzung"]) expect(kacheln).toContainElement(screen.getByText(k));
    expect(kacheln.className).toContain("sm:grid-cols-2");
    expect(kennzahlen.children[1]).toContainElement(screen.getByTestId("karte-objektdetails"));

    // Zeile 3: links Beschreibung und Standort, rechts die Sanierungen samt Gemeinschaftseigentum.
    expect(beschreibungZeile.className).toContain("xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]");
    expect(beschreibungZeile.children[0]).toBe(screen.getByTestId("objekt-texte-karte"));
    const sanierungen = screen.getByTestId("karte-sanierungen");
    expect(beschreibungZeile.children[1].children[0]).toBe(sanierungen);
    // Darunter die internen Highlights (seit 01.10.2026).
    expect(beschreibungZeile.children[1].children[1]).toBe(screen.getByTestId("karte-interne-highlights"));
    expect(sanierungen).toContainElement(screen.getByText("Sanierungen und Maßnahmen"));
    expect(within(sanierungen).getByText(/^Gemeinschaftseigentum:/)).toBeInTheDocument();

    // Die weiteren Einheiten stehen über die ganze Breite, außerhalb der Zeilen.
    for (const zeile of [galerie, kennzahlen, beschreibungZeile]) expect(zeile).not.toContainElement(weitere);
    expect(davor(galerie, kennzahlen)).toBe(true);
    expect(davor(kennzahlen, beschreibungZeile)).toBe(true);
    expect(davor(beschreibungZeile, weitere)).toBe(true);
  });

  it("zeigt in den weiteren Einheiten dieselben Spalten wie die Objektseite, samt Rendite", () => {
    objekte.liste = { o11: objekt("o11", [we("w1"), { ...we("w2"), mieteGesamt: 735, vkGesamt: 245000 }]) };
    renderMit("/objekte/o11/einheiten/w1");
    const tabelle = screen.getByTestId("weitere-einheiten-tabelle");
    const koepfe = within(tabelle).getAllByRole("columnheader").map((k) => k.textContent);
    expect(koepfe).toEqual(["WE-Nr.", "Etage", "Zimmer", "Fläche", "Kaufpreis", "je m²", "Kaltmiete", "Rendite", "Status"]);
    // 12 × 600 / 200.000 = 3,60 %; 12 × 735 / 245.000 = 3,60 %
    expect(screen.getByTestId("weitere-rendite-w1")).toHaveTextContent("3,60 %");
    expect(screen.getByTestId("weitere-rendite-w2")).toHaveTextContent("3,60 %");
    expect(screen.getByTestId("weitere-w1")).toHaveAttribute("data-aktuell", "true");
  });

  it("setzt beim Einzelobjekt die Objektangaben an die Stelle der weiteren Einheiten", () => {
    objekte.liste = { o10: objekt("o10", [we("w1")]) };
    renderMit("/objekte/o10/einheiten/w1");
    const angaben = screen.getByText("Objektangaben");
    for (const zeile of ["uebersicht-galerie", "uebersicht-kennzahlen", "uebersicht-beschreibung"]) {
      expect(screen.getByTestId(zeile)).not.toContainElement(angaben);
    }
    expect(davor(screen.getByText("Beschreibung und Standort"), angaben)).toBe(true);
  });
});
