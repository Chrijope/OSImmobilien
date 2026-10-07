import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import type { Investment } from "@/lib/investmentsStore";
import type { KundeData } from "@/lib/kundenStore";

/**
 * Nach „Reservierung aufheben“ oder „Einheit wechseln“ zeigt die
 * Objektauswahl wieder die Empfehlungen statt der Objektkarte (Christian,
 * 05.10.2026). Geprüft wird die echte Karte vorher und nachher, dazwischen
 * der echte Ablauf `reservierungAufheben`, nur ohne Datenbank.
 */

const stand = vi.hoisted(() => ({
  objekte: [] as unknown[],
  objektEingetragen: true,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "vertriebspartner", name: "Vera Partner", email: "" }, authUser: { id: "vp-1" } }),
}));
vi.mock("@/lib/sidebarNavigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sidebarNavigation")>()),
  siehtObjekteMenue: () => true,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/kunden/TerminseiteKnopf", () => ({ TerminseiteKnopf: () => null }));
vi.mock("@/components/kunden/InvestmentBerechnungen", () => ({ InvestmentBerechnungen: () => null }));
vi.mock("@/components/kunden/ObjektDatenDialog", () => ({ ObjektDatenDialog: () => null }));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjekte: () => stand.objekte,
}));
vi.mock("@/lib/objektDatenPflicht", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektDatenPflicht")>()),
  objektDatenFehlen: () => !stand.objektEingetragen,
  hatBestandsWohnung: () => false,
  vorhandeneObjektDaten: () => (stand.objektEingetragen ? { strasse: "Teststraße 1", plz: "80331", ort: "München", weNr: "1", kaufpreis: 274000 } : {}),
  objektVerlauf: () => [],
  objektEingetragenAm: () => "",
}));
vi.mock("@/lib/investmentsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentsStore")>()),
  getEigeneSaData: () => ({ plz: "83022", ort: "Rosenheim" }),
  getInvestmentMeta: (_id: string, key: string, fallback: unknown) =>
    key === "wohnortGeo" ? { plz: "83022", lat: 47.86, lng: 12.12 } : fallback,
  setInvestmentMeta: () => undefined,
}));
vi.mock("@/lib/geocodeCache", () => ({ getCachedCoords: () => null, geocodeAddress: async () => null }));

const { FreieWohnungenCard } = await import("./FreieWohnungenCard");
const { reservierungAufheben } = await import("@/lib/reservierungAufheben");
type Mittel = import("@/lib/reservierungAufheben").AufhebenMittel;

const einheit: ObjektWohnung = {
  id: "a1", weNr: "1", etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 800, vkGesamt: 274000,
  qmPreis: 0, rendite: 0, vermietet: true, status: "reserviert", kundeId: "k-1",
} as ObjektWohnung;
const haus = {
  id: "A", titel: "Haus A", adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
  bildUrl: "", bilder: [], dokumente: [], wohnungen: [einheit], videoUrl: "", videoSichtbar: false, badge: "",
  groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
  erstellt_am: "2026-01-01", meta: { standortanalyse: { schema: 2, objekt_koordinaten: { lat: 48.14, lng: 11.58 } } },
} as unknown as ObjektData;
const KUNDE = { id: "k-1", vorname: "Max", nachname: "Muster", plz: "83022", ort: "Rosenheim" } as KundeData;

function karte(inv: Investment) {
  return (
    <FreieWohnungenCard
      kunde={KUNDE} inv={inv} minRahmen={250000} maxRahmen={300000} allDocsApproved={false}
      canSwitchObjekt canSwitchObjektDirect={false} userRole="vertriebspartner" userName="Vera Partner"
      onSwitchObjekt={() => undefined} onNavigate={() => undefined}
    />
  );
}

describe("Reservierung aufheben, danach die Empfehlungen", () => {
  it("vorher die Objektkarte mit „Einheit wechseln“, nachher die Empfehlungsliste", async () => {
    stand.objekte = [haus];
    stand.objektEingetragen = true;
    let inv = {
      id: "inv-1", kontaktId: "k-1", nummer: 1, label: "", pipelineStufe: "reservierung", objektId: "A", wohnungId: "a1",
      objektTitel: "Haus A", weNr: "1", erstellt_am: "2026-09-01",
    } as Investment;

    const { rerender } = render(karte(inv));
    expect(screen.getByTestId("objektkarte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Einheit wechseln/ })).toBeInTheDocument();
    expect(screen.queryByTestId("objekt-empfehlungen")).not.toBeInTheDocument();

    const geschrieben: Record<string, unknown>[] = [];
    const mittel: Mittel = {
      metaLesen: () => ({ rvSigned: true, rvPdfPath: "reservierung/k-1/inv-1/RV.pdf", objektId: "A", wohnungId: "a1" }),
      einheitFreigeben: async () => { Object.assign(einheit, { status: "frei", kundeId: undefined }); return { ok: true }; },
      hausFreigeben: async () => ({ ok: true }),
      pdfKopieren: async () => true,
      // Ein Schreibvorgang: Vereinbarung, Objekt und Stufe zusammen.
      metaSchreiben: async (_id, patch) => {
        geschrieben.push(patch);
        stand.objektEingetragen = false;
        inv = { ...inv, pipelineStufe: "objektauswahl", objektId: undefined, wohnungId: undefined, objektTitel: undefined, weNr: undefined };
      },
      offeneLinksLoeschen: async () => 0,
      objektInVerlauf: () => ({}),
      zuruecksetzen: async () => true,
    };
    const ergebnis = await reservierungAufheben({
      investmentId: "inv-1", kontaktId: "k-1", objektId: "A", wohnungId: "a1", anlass: "einheit_gewechselt",
      vonName: "Vera Partner", vonId: "vp-1", darfOffeneLinksLoeschen: false,
    }, mittel);
    expect(ergebnis.ok).toBe(true);
    // Die unterschriebene Vereinbarung ist archiviert, nicht gelöscht.
    expect(geschrieben[0].rvHistorie).toEqual([expect.objectContaining({ stand: "unterschrieben", anlass: "einheit_gewechselt" })]);

    rerender(karte(inv));
    expect(screen.queryByTestId("objektkarte")).not.toBeInTheDocument();
    expect(screen.getByTestId("objekt-empfehlungen")).toBeInTheDocument();
    expect(screen.getByTestId("empfehlung-a1")).toBeInTheDocument();
  });
});
