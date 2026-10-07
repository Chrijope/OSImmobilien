import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import type { Investment } from "@/lib/investmentsStore";
import type { KundeData } from "@/lib/kundenStore";

/**
 * Die Empfehlungen in der Objektauswahl, so wie das Kundenprofil sie zeigt:
 * die ganze Karte `FreieWohnungenCard`, nur ohne Datenbank.
 *
 * Geprüft wird, wer sie sieht, was oben steht und in welcher Reihenfolge,
 * dass die Gesamtliste alle freien Objekte zeigt und die passenden
 * hervorhebt, wohin die Knöpfe je Rolle führen, was nach außen geht, und das
 * Fenster „Objektauswahl vergrößern".
 */

const stand = vi.hoisted(() => ({
  rolle: "vertriebspartner",
  objekte: [] as unknown[],
  sa: null as Record<string, unknown> | null,
  meta: {} as Record<string, unknown>,
  geschrieben: [] as Array<[string, string, unknown]>,
  finanziertSelbst: false,
  photon: [] as string[],
  // Christians Schalter „Objekte" in der Seitenleiste, für die Rolle freigeschaltet.
  // `null` heißt: Die echte Prüfung der Seitenleiste entscheidet.
  objekteFrei: null as boolean | null,
  // Womit die Karte die Prüfung der Seitenleiste aufruft.
  menueAufrufe: [] as Array<{ identitaet?: { userId?: string | null } }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: stand.rolle, name: "Vera Partner", email: "" }, authUser: { id: "vp-1" } }),
}));
vi.mock("@/lib/sidebarNavigation", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sidebarNavigation")>();
  return {
    ...echt,
    siehtObjekteMenue: (ctx: Parameters<typeof echt.siehtObjekteMenue>[0]) => {
      stand.menueAufrufe.push(ctx);
      return stand.objekteFrei ?? echt.siehtObjekteMenue(ctx);
    },
  };
});
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/kunden/TerminseiteKnopf", () => ({
  TerminseiteKnopf: ({ beschriftung }: { beschriftung: string }) => <button type="button">{beschriftung}</button>,
}));
vi.mock("@/components/kunden/InvestmentBerechnungen", () => ({ InvestmentBerechnungen: () => null }));
vi.mock("@/components/kunden/ObjektDatenDialog", () => ({ ObjektDatenDialog: () => null }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjekte: () => stand.objekte,
}));
vi.mock("@/lib/objektDatenPflicht", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektDatenPflicht")>()),
  objektDatenFehlen: () => true,
  hatBestandsWohnung: () => false,
  vorhandeneObjektDaten: () => ({}),
  objektVerlauf: () => [],
  objektEingetragenAm: () => "",
}));
vi.mock("@/lib/investmentsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentsStore")>()),
  getEigeneSaData: () => stand.sa,
  getInvestmentMeta: (id: string, key: string, fallback: unknown) => stand.meta[`${id}:${key}`] ?? fallback,
  setInvestmentMeta: (id: string, key: string, wert: unknown) => { stand.geschrieben.push([id, key, wert]); },
}));
vi.mock("@/lib/selbstauskunftEntfaellt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/selbstauskunftEntfaellt")>()),
  selbstauskunftEntfaellt: () => stand.finanziertSelbst,
}));
vi.mock("@/lib/umgebung", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/umgebung")>()),
  geocode: async (anfrage: string) => { stand.photon.push(anfrage); return { lat: 47.8571, lng: 12.1181 }; },
}));
// Null heißt im Speicher der Objektkarte: schon gesucht, nichts gefunden.
// Damit schlägt der Test keine Objektadresse im Hintergrund nach.
vi.mock("@/lib/geocodeCache", () => ({
  getCachedCoords: () => null,
  geocodeAddress: async () => null,
}));

const { FreieWohnungenCard } = await import("./FreieWohnungenCard");

const MUENCHEN = { lat: 48.14, lng: 11.58 };
const AUGSBURG = { lat: 48.37, lng: 10.9 };
const LEIPZIG = { lat: 51.34, lng: 12.37 };

function we(id: string, teile: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return { id, weNr: id.replace(/\D/g, "") || "1", etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 800, vkGesamt: 260000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teile };
}

function objekt(id: string, wohnungen: ObjektWohnung[], lage: { lat: number; lng: number } | null, teile: Partial<ObjektData> = {}): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01",
    meta: lage ? { standortanalyse: { schema: 2, objekt_koordinaten: lage } } : {},
    ...teile,
  } as ObjektData;
}

const KUNDE = { id: "k-1", vorname: "Max", nachname: "Muster", plz: "83022", ort: "Rosenheim" } as KundeData;
const INV = { id: "inv-1", kontaktId: "k-1", nummer: 1, label: "", pipelineStufe: "objektauswahl", erstellt_am: "2026-09-01" } as Investment;

/*
 * `listeZu`: Die Gesamtliste ist seit dem 05.10.2026 standardmäßig zu. Die
 * meisten Beschreibungen prüfen ihren Inhalt und klappen sie deshalb auf.
 */
function zeige(teile: { rolle?: string; min?: number; max?: number; kunde?: KundeData; listeZu?: boolean; gesendeteLinks?: React.ReactNode } = {}) {
  const navigiert = vi.fn();
  if (teile.rolle) stand.rolle = teile.rolle;
  render(
    <FreieWohnungenCard
      kunde={teile.kunde ?? KUNDE}
      inv={INV}
      minRahmen={teile.min ?? 250000}
      maxRahmen={teile.max ?? 300000}
      allDocsApproved={false}
      canSwitchObjekt={false}
      canSwitchObjektDirect={false}
      userRole={stand.rolle}
      userName="Vera Partner"
      onSwitchObjekt={() => undefined}
      onNavigate={navigiert}
      gesendeteLinks={teile.gesendeteLinks}
    />,
  );
  const umschalter = screen.queryByRole("button", { name: /Alle Objekte mit freien Einheiten anzeigen/ });
  if (umschalter && !teile.listeZu) fireEvent.click(umschalter);
  return navigiert;
}

beforeEach(() => {
  stand.rolle = "vertriebspartner";
  stand.sa = { plz: "83022", ort: "Rosenheim", strasse: "Geheimweg 7" };
  // Der Wohnort ist schon gemerkt, es wird nichts nachgeschlagen.
  stand.meta = { "inv-1:wohnortGeo": { plz: "83022", lat: 47.86, lng: 12.12 } };
  stand.geschrieben = [];
  stand.finanziertSelbst = false;
  stand.photon = [];
  // Die übrigen Beschreibungen prüfen die Empfehlungen selbst, also nach der Freischaltung.
  stand.objekteFrei = true;
  stand.objekte = [
    // München, gut 50 km: zwei passende, eine zu teure.
    objekt("A", [we("a1", { vkGesamt: 274000 }), we("a2", { vkGesamt: 262000 }), we("a3", { vkGesamt: 400000 })], MUENCHEN),
    // Augsburg, gut 100 km: eine passende.
    objekt("B", [we("b1", { vkGesamt: 280000 })], AUGSBURG),
    // Leipzig: zu günstig für den Rahmen, steht nur in der Gesamtliste.
    objekt("C", [we("c1", { vkGesamt: 200000 })], LEIPZIG, { plz: "04109", ort: "Leipzig" }),
    // Ohne Lage: passt, steht aber hinten.
    objekt("D", [we("d1", { vkGesamt: 265000 })], null),
    // Exklusiv für jemand anderen: taucht nirgends auf.
    objekt("E", [we("e1", { vkGesamt: 270000 })], MUENCHEN, { exklusivPartner: ["Otto Anders"] }),
    // Alles belegt: nicht in der Liste.
    objekt("F", [we("f1", { status: "reserviert" })], MUENCHEN),
  ];
});

describe("Wer die Empfehlungen sieht", () => {
  it.each(["vertriebspartner", "vertriebsleiter", "inhaber", "admin", "backoffice", "finanzierungspartner"])("%s sieht sie nach der Freischaltung", (rolle) => {
    zeige({ rolle });
    expect(screen.getByTestId("objekt-empfehlungen")).toBeInTheDocument();
  });

  it.each(["setterin", "objektpartner", "hr"])("%s sieht die Karte wie bisher, ohne Empfehlungen", (rolle) => {
    zeige({ rolle });
    expect(screen.queryByTestId("objekt-empfehlungen")).not.toBeInTheDocument();
  });

  it("das Eintragen von Hand bleibt unverändert", () => {
    zeige();
    expect(screen.getByText("Adresse, Einheit und Kaufpreis des Objekts hier eintragen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Objekt eintragen/ })).toBeInTheDocument();
  });
});

/*
 * Christian am 29.09.2026: Empfehlungen und die Liste aller Objekte mit freien
 * Einheiten erst, wenn der Eintrag „Objekte" in der Seitenleiste für die Rolle
 * freigeschaltet ist. Hier entscheidet die echte Prüfung der Seitenleiste.
 */
describe("Am Schalter „Objekte“ der Seitenleiste", () => {
  beforeEach(() => { stand.objekteFrei = null; });

  it.each(["vertriebspartner", "vertriebsleiter"])("%s ohne den Eintrag sieht nur „Objekt eintragen“", (rolle) => {
    zeige({ rolle });
    expect(screen.getByRole("button", { name: /Objekt eintragen/ })).toBeInTheDocument();
    expect(screen.queryByTestId("objekt-empfehlungen")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gesamtliste")).not.toBeInTheDocument();
    expect(screen.queryByText(/freie(n)? Einheiten/)).not.toBeInTheDocument();
  });

  // Die beiden pflegen kein Objekt (`darfObjektPflegen`), sie sehen hier also gar nichts zur Auswahl.
  it.each(["backoffice", "finanzierungspartner"])("%s ohne den Eintrag sieht keine Empfehlungen", (rolle) => {
    zeige({ rolle });
    expect(screen.queryByTestId("objekt-empfehlungen")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gesamtliste")).not.toBeInTheDocument();
  });

  it.each(["admin", "inhaber"])("%s sieht den Eintrag und damit Empfehlungen und Gesamtliste", (rolle) => {
    zeige({ rolle });
    expect(screen.getByTestId("empfehlungen-liste")).toBeInTheDocument();
    expect(screen.getByTestId("gesamtliste")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Objekt eintragen/ })).toBeInTheDocument();
  });

  // Ohne Kennung kann die Testfreischaltung (`objekteTestFreigabe`) nicht greifen.
  it("fragt mit der eigenen Kennung, damit die Testfreischaltung greift", () => {
    stand.menueAufrufe = [];
    zeige({ rolle: "vertriebspartner" });
    expect(stand.menueAufrufe.at(-1)?.identitaet?.userId).toBe("vp-1");
  });

  it("nach der Freischaltung für den Vertriebspartner sieht er die Empfehlungen", () => {
    stand.objekteFrei = true;
    zeige({ rolle: "vertriebspartner" });
    expect(screen.getByTestId("empfehlungen-liste")).toBeInTheDocument();
    expect(screen.getByTestId("gesamtliste")).toBeInTheDocument();
  });
});

describe("Die Empfehlungen oben", () => {
  it("nach Entfernung, eine je Haus, ohne Lage hinten", () => {
    zeige();
    const liste = screen.getByTestId("empfehlungen-liste");
    const eintraege = within(liste).getAllByRole("listitem").map((li) => li.getAttribute("data-testid"));
    // Im Haus A liegt a1 näher an der Rahmenmitte als a2.
    expect(eintraege).toEqual(["empfehlung-a1", "empfehlung-b1", "empfehlung-d1"]);
    const a1 = screen.getByTestId("empfehlung-a1");
    expect(within(a1).getByText(/^passt in den Rahmen, \d+ km von Rosenheim$/)).toBeInTheDocument();
    expect(within(a1).getByText("+1 weitere passende im Haus")).toBeInTheDocument();
    expect(within(screen.getByTestId("empfehlung-d1")).getByText("passt in den Rahmen, Entfernung unbekannt")).toBeInTheDocument();
    expect(screen.getByText("4 Einheiten passen in den Rahmen, verteilt auf 3 Objekte")).toBeInTheDocument();
  });

  it("zeigt den Finanzierungsrahmen, verglichen mit dem Kaufpreis (seit dem 23.09.2026)", () => {
    zeige();
    const zeile = screen.getByTestId("empfehlung-rahmen");
    expect(zeile).toHaveTextContent(/Finanzierungsrahmen 250\.000\s€ bis 300\.000\s€, verglichen mit dem Kaufpreis/);
    expect(zeile).not.toHaveTextContent("Kaufnebenkosten");
    expect(zeile.textContent).not.toMatch(/[–—]/);
  });

  it('„Einheit öffnen" führt den Vertriebspartner in die alte Ansicht mit Kundenbezug', () => {
    const navigiert = zeige();
    fireEvent.click(within(screen.getByTestId("empfehlung-a1")).getByRole("button", { name: /Einheit öffnen/ }));
    expect(navigiert).toHaveBeenCalledWith("/objekte/A/wohnung/a1?kundeId=k-1&investmentId=inv-1");
  });

  it("setzt vor dem Wegnavigieren die Adresse auf den Rückweg, für den Zurück-Knopf des Browsers", () => {
    window.history.replaceState(null, "", "/kunden/k-1?investment=inv-1");
    const navigiert = zeige();
    fireEvent.click(within(screen.getByTestId("empfehlung-a1")).getByRole("button", { name: /Einheit öffnen/ }));
    expect(navigiert).toHaveBeenCalledTimes(1);
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe("/kunden/k-1?tab=investments&investment=inv-1#objektauswahl");
  });

  it('„Einheit öffnen" führt Admin und Inhaber auf die neue Einheitsseite mit ?empfehlung=', () => {
    const navigiert = zeige({ rolle: "inhaber" });
    fireEvent.click(within(screen.getByTestId("empfehlung-a1")).getByRole("button", { name: /Einheit öffnen/ }));
    // Seit dem 24.09.2026 reist der Rückweg ins Kundenprofil mit (`?zurueck=`).
    const ziel = navigiert.mock.calls[0][0] as string;
    const [pfad, suche] = ziel.split("?");
    const p = new URLSearchParams(suche);
    expect(pfad).toBe("/objekte/A/einheiten/a1");
    expect(p.get("empfehlung")).toBe("inv-1");
    expect(p.get("zurueck")).toBe("/kunden/k-1?tab=investments&investment=inv-1#objektauswahl");
  });
});

// Seit dem 05.10.2026 kein eigener Kasten mehr, sondern direkt unter dem Terminknopf.
describe("Gesendete Links in der Objektauswahl", () => {
  it("stehen in der Zeile unter „Objektvorstellungsgespräch vereinbaren“", () => {
    zeige({ gesendeteLinks: <span data-testid="gesendete-links-platzhalter">Gesendete Links (3)</span> });
    const zusatz = document.querySelector("[data-kopf-zusatz]") as HTMLElement;
    const knopf = within(zusatz).getByRole("button", { name: /Objektvorstellungsgespräch vereinbaren/ });
    const links = within(zusatz).getByTestId("gesendete-links-platzhalter");
    expect(knopf.compareDocumentPosition(links) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(links.parentElement).toHaveClass("w-full");
  });
});

describe("Die Gesamtliste", () => {
  it("ist standardmäßig zu, die fünf besten Treffer bleiben sichtbar", () => {
    zeige({ listeZu: true });
    expect(screen.getByTestId("empfehlungen-liste")).toBeInTheDocument();
    expect(screen.queryByTestId("gesamtliste")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Sortierung" })).not.toBeInTheDocument();
    const umschalter = screen.getByRole("button", { name: "Alle Objekte mit freien Einheiten anzeigen (4)" });
    expect(umschalter).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(umschalter);
    expect(screen.getByTestId("gesamtliste")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alle Objekte mit freien Einheiten ausblenden (4)" })).toHaveAttribute("aria-expanded", "true");
  });

  it("steht beim Selbstfinanzierer gleich offen", () => {
    stand.finanziertSelbst = true;
    zeige({ listeZu: true });
    expect(screen.getByTestId("gesamtliste")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alle Objekte mit freien Einheiten ausblenden/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("zeigt alle Objekte mit freien Einheiten, die passenden hervorgehoben", () => {
    zeige();
    const liste = screen.getByTestId("gesamtliste");
    expect(within(liste).getByTestId("gesamtliste-A")).toHaveAttribute("data-passt", "ja");
    expect(within(liste).getByTestId("gesamtliste-C")).toHaveAttribute("data-passt", "nein");
    expect(within(liste).queryByTestId("gesamtliste-E")).not.toBeInTheDocument();
    expect(within(liste).queryByTestId("gesamtliste-F")).not.toBeInTheDocument();
    // Passende zuerst, darunter die übrigen.
    const reihenfolge = within(liste).getAllByRole("button").map((b) => b.getAttribute("data-testid"));
    expect(reihenfolge.indexOf("gesamtliste-C")).toBeGreaterThan(reihenfolge.indexOf("gesamtliste-D"));
  });

  it("ein Klick öffnet das Objekt mit Kundenbezug", () => {
    const navigiert = zeige({ rolle: "backoffice" });
    fireEvent.click(screen.getByTestId("gesamtliste-C"));
    expect(navigiert).toHaveBeenCalledWith("/objekte/C/verwaltung?kundeId=k-1&investmentId=inv-1");
  });
});

describe("Ohne Rahmen", () => {
  it("keine Empfehlungen, ein Hinweis, die Gesamtliste nach Entfernung", () => {
    stand.sa = null;
    stand.finanziertSelbst = true;
    zeige({ min: 0, max: 0 });
    expect(screen.queryByTestId("empfehlungen-liste")).not.toBeInTheDocument();
    expect(screen.getByText(/Der Kunde finanziert selbst, deshalb gibt es keinen Finanzierungsrahmen/)).toBeInTheDocument();
    const reihenfolge = within(screen.getByTestId("gesamtliste")).getAllByRole("button").map((b) => b.getAttribute("data-testid"));
    expect(reihenfolge).toEqual(["gesamtliste-A", "gesamtliste-B", "gesamtliste-C", "gesamtliste-D"]);
    for (const b of within(screen.getByTestId("gesamtliste")).getAllByRole("button")) expect(b).toHaveAttribute("data-passt", "nein");
  });
});

describe("Der Wohnort", () => {
  it('wird nur mit „PLZ Ort" nachgeschlagen und grob am Investment gemerkt', async () => {
    stand.meta = {};
    zeige();
    await waitFor(() => expect(stand.geschrieben).toHaveLength(1));
    expect(stand.photon).toEqual(["83022 Rosenheim"]);
    expect(stand.geschrieben[0]).toEqual(["inv-1", "wohnortGeo", { plz: "83022", lat: 47.86, lng: 12.12 }]);
    await screen.findByTestId("empfehlungen-liste");
  });

  it("eine lesende Rolle rechnet damit, schreibt aber nichts", async () => {
    stand.meta = {};
    zeige({ rolle: "finanzierungspartner" });
    await screen.findByTestId("empfehlungen-liste");
    expect(stand.photon).toEqual(["83022 Rosenheim"]);
    expect(stand.geschrieben).toHaveLength(0);
  });

  it("fehlt er, wird nach Preis sortiert und es steht dabei", () => {
    stand.sa = { einkommen: {} };
    zeige({ kunde: { ...KUNDE, plz: "", ort: "" } });
    expect(screen.getByText("Wohnort fehlt, nach Preis sortiert")).toBeInTheDocument();
    expect(stand.photon).toEqual([]);
  });
});

describe("Objektauswahl vergrößern", () => {
  it('öffnet die Liste groß, mit „Nur passende" und aufklappbaren Einheiten', () => {
    const navigiert = zeige();
    fireEvent.click(screen.getByRole("button", { name: /Objektauswahl vergrößern/ }));
    const fenster = screen.getByRole("dialog");
    expect(within(fenster).getByText("Objektauswahl für Max")).toBeInTheDocument();
    const liste = within(fenster).getByTestId("objektauswahl-liste");
    expect(within(liste).getByTestId("objektauswahl-objekt-C")).toBeInTheDocument();

    fireEvent.click(within(fenster).getByRole("switch", { name: "Nur passende" }));
    expect(within(liste).queryByTestId("objektauswahl-objekt-C")).not.toBeInTheDocument();
    expect(within(liste).getByTestId("objektauswahl-objekt-A")).toHaveAttribute("data-passt", "ja");

    fireEvent.click(within(within(liste).getByTestId("objektauswahl-objekt-A")).getByRole("button", { name: /3 freie Einheiten/ }));
    const a3 = within(liste).getByTestId("objektauswahl-einheit-a3");
    expect(a3).toHaveTextContent("passt nicht");
    fireEvent.click(within(a3).getByRole("button", { name: /Einheit öffnen/ }));
    expect(navigiert).toHaveBeenCalledWith("/objekte/A/wohnung/a3?kundeId=k-1&investmentId=inv-1");
  });

  it('ohne Rahmen ist „Nur passende" gesperrt', () => {
    stand.sa = null;
    zeige({ min: 0, max: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Objektauswahl vergrößern/ }));
    expect(within(screen.getByRole("dialog")).getByRole("switch", { name: "Nur passende" })).toBeDisabled();
  });

  it("liegt über der Kopfleiste und scrollt nur in der Liste", () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: /Objektauswahl vergrößern/ }));
    const fenster = screen.getByRole("dialog");
    // Die eigene Ebene muss am Element ankommen und die `z-50` des Dialogs ersetzen.
    expect(fenster.className).toMatch(/(?:^|\s)z-\[\d+\]/);
    expect(fenster.className).not.toMatch(/(?:^|\s)z-50(?:\s|$)/);
    expect(fenster.className).toContain("overflow-hidden");
    expect(within(fenster).getByTestId("objektauswahl-liste").className).toContain("overflow-y-auto");
  });
});

describe("Objektauswahl vergrößern, die Entfernung", () => {
  const km = (id: string) => Number(screen.getByTestId(`objektauswahl-entfernung-${id}`).textContent!.match(/^(\d+) km/)![1]);

  it('steht an jedem Objekt, ohne Lage als „Entfernung unbekannt", nicht in den Einheitenzeilen', () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: /Objektauswahl vergrößern/ }));
    const liste = within(screen.getByRole("dialog")).getByTestId("objektauswahl-liste");
    for (const id of ["A", "B", "C"]) {
      expect(within(liste).getByTestId(`objektauswahl-entfernung-${id}`)).toHaveTextContent(/^\d+ km von Rosenheim$/);
    }
    expect(within(liste).getByTestId("objektauswahl-entfernung-D")).toHaveTextContent("Entfernung unbekannt");
    expect(screen.queryByTestId("objektauswahl-entfernung-hinweis")).not.toBeInTheDocument();

    // Auch unter „Bester Score" sichtbar (Standard seit dem 04.10.2026), nicht nur bei der Sortierung danach.
    expect(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Sortieren nach" })).toHaveTextContent("Bester Score");

    fireEvent.click(within(within(liste).getByTestId("objektauswahl-objekt-A")).getByRole("button", { name: /3 freie Einheiten/ }));
    for (const zeile of ["a1", "a2", "a3"]) expect(within(liste).getByTestId(`objektauswahl-einheit-${zeile}`)).not.toHaveTextContent("km");
  });

  it("ist beim Sortieren nach Entfernung die Grundlage der Reihenfolge", () => {
    stand.sa = null;
    zeige({ min: 0, max: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Objektauswahl vergrößern/ }));
    const fenster = screen.getByRole("dialog");
    expect(within(fenster).getByRole("combobox", { name: "Sortieren nach" })).toHaveTextContent("Entfernung");
    const reihenfolge = within(within(fenster).getByTestId("objektauswahl-liste"))
      .getAllByTestId(/^objektauswahl-objekt-/).map((z) => z.getAttribute("data-testid"));
    expect(reihenfolge).toEqual(["objektauswahl-objekt-A", "objektauswahl-objekt-B", "objektauswahl-objekt-C", "objektauswahl-objekt-D"]);
    expect(km("A")).toBeLessThan(km("B"));
    expect(km("B")).toBeLessThan(km("C"));
    expect(screen.getByTestId("objektauswahl-entfernung-D")).toHaveTextContent("Entfernung unbekannt");
  });

  it("fehlt ohne Wohnort, dafür steht einmal oben, warum", () => {
    stand.sa = { einkommen: {} };
    zeige({ kunde: { ...KUNDE, plz: "", ort: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Objektauswahl vergrößern/ }));
    const fenster = screen.getByRole("dialog");
    expect(within(fenster).queryAllByTestId(/^objektauswahl-entfernung-[A-Z]$/)).toHaveLength(0);
    expect(within(fenster).queryByText(/km/)).not.toBeInTheDocument();
    expect(within(fenster).getByTestId("objektauswahl-entfernung-hinweis")).toHaveTextContent("Wohnort fehlt, deshalb keine Entfernungen.");
  });
});

/*
 * Der Objektscore (Strategie vom 04.10.2026): Ring je Treffer, Top 5 nach
 * Score, „Warum?“, Sortierung der Gesamtliste. Mit Einkommen in der
 * Selbstauskunft, damit die monatliche Belastung bewertet werden kann.
 */
describe("Der Objektscore", () => {
  const mitEinkommen = (eigenkapital = 30000) => {
    stand.sa = { plz: "83022", ort: "Rosenheim", gehalt: 3000, miete: 900, lebenshaltung: 800, vermoegenswerte: [{ betrag: eigenkapital }], wuenscheZiele: ["steuer"] };
  };
  const ringe = (container: HTMLElement) => within(container).getAllByTestId("score-ring").map((r) => r.getAttribute("data-wert"));

  it("heißt „Beste Treffer“, trägt die Hinweiszeile und einen Ring je Treffer, nach Score geordnet", () => {
    mitEinkommen();
    zeige();
    expect(screen.getByText("Beste Treffer für Max")).toBeInTheDocument();
    expect(screen.queryByText(/^Empfehlungen für/)).not.toBeInTheDocument();
    expect(screen.getByTestId("score-hinweis")).toHaveTextContent(
      "Objektscore: interne Sortierhilfe aus Selbstauskunft, Zielen und Objektdaten. Keine Anlageberatung, nicht für den Kunden bestimmt.",
    );
    expect(screen.getByTestId("empfehlung-rahmen")).toHaveTextContent("Ziele: Steuervorteile");
    const werte = ringe(screen.getByTestId("empfehlungen-liste")).map(Number);
    expect(werte.every((w) => Number.isFinite(w))).toBe(true);
    expect([...werte].sort((a, b) => b - a)).toEqual(werte);
    // Höchstens eine Einheit je Haus: A hat zwei passende.
    expect(screen.getAllByTestId(/^empfehlung-a\d$/)).toHaveLength(1);
  });

  // Seit dem 05.10.2026 bei jedem Treffer zu, auch beim ersten.
  it("„Warum?“ ist bei allen Treffern zu und zeigt auf Klick Gründe und Bausteinbalken", () => {
    mitEinkommen();
    zeige();
    const [erster, zweiter] = screen.getAllByTestId("score-warum");
    for (const w of screen.getAllByTestId("score-warum")) expect(within(w).queryByTestId("score-warum-kasten")).not.toBeInTheDocument();
    fireEvent.click(within(erster).getByRole("button", { name: /^Warum \d+\?$/ }));
    expect(within(erster).getByTestId("score-warum-kasten")).toBeInTheDocument();
    expect(within(erster).getByTestId("baustein-rahmen")).toBeInTheDocument();
    expect(within(erster).getByTestId("baustein-steuer")).toHaveTextContent("fehlt");
    expect(within(zweiter).queryByTestId("score-warum-kasten")).not.toBeInTheDocument();
    fireEvent.click(within(zweiter).getByRole("button", { name: /^Warum \d+\?$/ }));
    expect(within(zweiter).getByTestId("score-warum-kasten")).toBeInTheDocument();
  });

  it("deckelt auf 59 mit Warnchip, wenn das Eigenkapital die Kaufnebenkosten nicht deckt", () => {
    mitEinkommen(2000);
    zeige();
    const liste = screen.getByTestId("empfehlungen-liste");
    expect(ringe(liste).map(Number).every((w) => w <= 59)).toBe(true);
    expect(within(liste).getAllByTestId("score-warnung")[0]).toHaveTextContent("Eigenkapital deckt die Kaufnebenkosten nicht");
  });

  it("ohne bewertbare Belastung „n. b.“ und die bisherige Reihenfolge", () => {
    zeige();
    expect(ringe(screen.getByTestId("empfehlungen-liste")).every((w) => w === "nb")).toBe(true);
  });

  it("die Gesamtliste sortiert standardmäßig nach Bestem Score und lässt sich umstellen und filtern", () => {
    mitEinkommen();
    zeige();
    const gruppe = screen.getByRole("group", { name: "Sortierung" });
    expect(within(gruppe).getByRole("button", { name: "Bester Score" })).toHaveAttribute("aria-pressed", "true");
    const reihe = () => within(screen.getByTestId("gesamtliste")).getAllByRole("button").map((b) => b.getAttribute("data-testid"));
    // Ohne passende Einheit steht C am Ende, mit „n. b.“.
    expect(reihe().at(-1)).toBe("gesamtliste-C");
    expect(within(screen.getByTestId("gesamtliste-C")).getByTestId("score-ring")).toHaveAttribute("data-wert", "nb");
    fireEvent.click(within(gruppe).getByRole("button", { name: "Preis" }));
    expect(reihe()[0]).toBe("gesamtliste-C");
    fireEvent.click(screen.getByLabelText("Nur passende"));
    expect(reihe()).not.toContain("gesamtliste-C");
  });

  it("ohne Rahmen sind „Bester Score“ und „Passende zuerst“ gesperrt, Ringe fehlen", () => {
    mitEinkommen();
    zeige({ min: 0, max: 0 });
    const gruppe = screen.getByRole("group", { name: "Sortierung" });
    expect(within(gruppe).getByRole("button", { name: "Bester Score" })).toBeDisabled();
    expect(within(gruppe).getByRole("button", { name: "Entfernung" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("score-ring")).not.toBeInTheDocument();
    expect(screen.queryByTestId("score-hinweis")).not.toBeInTheDocument();
  });

  it("der Score steht in keiner Adresse und wird nirgends gespeichert", () => {
    mitEinkommen();
    const navigiert = zeige({ rolle: "admin" });
    fireEvent.click(within(screen.getByTestId("empfehlungen-liste")).getAllByRole("button", { name: /Einheit öffnen|Objekt öffnen/ })[0]);
    const ziel = navigiert.mock.calls[0][0] as string;
    expect(ziel).not.toMatch(/score|punkte/i);
    expect([...new URLSearchParams(ziel.split("?")[1]).keys()].sort()).toEqual(["empfehlung", "zurueck"]);
    expect(stand.geschrieben.filter(([, key]) => /score/i.test(key))).toEqual([]);
  });

  it("das vergrößerte Fenster sortiert ebenso nach Score und zeigt die Ringe", () => {
    mitEinkommen();
    zeige();
    fireEvent.click(screen.getByRole("button", { name: /Objektauswahl vergrößern/ }));
    const fenster = screen.getByRole("dialog");
    expect(within(fenster).getByRole("combobox", { name: "Sortieren nach" })).toHaveTextContent("Bester Score");
    expect(within(fenster).getAllByTestId("score-ring").length).toBeGreaterThan(0);
  });
});
