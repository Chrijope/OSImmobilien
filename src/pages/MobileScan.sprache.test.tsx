/**
 * Der Handy-Scan spricht mit dem Kunden in dessen Sprache (Kundensprache,
 * Etappe 3, S7).
 *
 * Die Dokumentnamen sind zugleich der Unterlagentyp im CRM und bleiben
 * deutsch gespeichert. Übersetzt wird nur die Anzeige, über das Wörterbuch in
 * `mobileScanTexte.ts`. Der letzte Block prüft, dass jeder Name, den die Seite
 * zu sehen bekommen kann, darin steht.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const t = vi.hoisted(() => ({ sprache: null as unknown, spracheFehler: false }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string) => {
      if (name === "kundensprache_zum_link") {
        return t.spracheFehler
          ? { data: null, error: { message: "function kundensprache_zum_link does not exist" } }
          : { data: t.sprache, error: null };
      }
      return { data: [], error: null };
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  },
}));

const getMobileScanSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mobileScanSessions", () => ({
  getMobileScanSession,
  appendMobileScanUpload: vi.fn(),
  completeMobileScanSession: vi.fn(),
}));

const { default: MobileScan } = await import("./MobileScan");
const { MobileScanHochgeladen } = await import("@/components/MobileScanHochgeladen");
const {
  DOKUMENTNAMEN_EN, MOBILE_SCAN_TEXTE, STANDARD_DOKUMENTE_P1, STANDARD_DOKUMENTE_P2, dokumentnameAnzeige, mitText,
} = await import("./mobileScanTexte");
const { gedankenstrichFrei, textdateiLuecken } = await import("@/lib/seitenSprache");
const { buildBankpruefungBaseDocs } = await import("@/lib/bankpruefungDocs");
const { buildBankpruefungDocListe } = await import("@/lib/bankpruefungListe");
const { buildBonitaetDocs, buildBonitaetDocsPerson2 } = await import("@/lib/bonitaetDocs");
const portal = await import("@/lib/portalUnterlagenListe");

const TOKEN = "b".repeat(32);

function sitzung(zusatz: Record<string, unknown> = {}) {
  return {
    id: "s1",
    token: TOKEN,
    kontakt_id: "k1",
    investment_id: "i1",
    person: 1,
    block: "bonitaet",
    status: "offen",
    last_doc_typ: null,
    last_upload_at: null,
    meta: { docList: null, uploads: [] },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    created_at: "2026-09-25T09:00:00Z",
    updated_at: "2026-09-25T09:00:00Z",
    ...zusatz,
  };
}

async function zeige(pfad = `/mobile-scan/${TOKEN}`) {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[pfad]}>
        <Routes><Route path="/mobile-scan/:token" element={<MobileScan />} /></Routes>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  t.sprache = null;
  t.spracheFehler = false;
  getMobileScanSession.mockResolvedValue(sitzung());
  document.documentElement.setAttribute("lang", "de");
});

afterEach(() => { vi.clearAllMocks(); });

describe("MobileScan: Sprache der Seite", () => {
  it("nimmt die Sprache vom Server, auch für die Dokumentnamen", async () => {
    t.sprache = "en";
    await zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Scan your credit check documents");
    expect(screen.getByText(/Have your documents ready: ID card, pay slips/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Start scan/ })); });

    expect(screen.getByText("All documents listed are required for your credit check.")).toBeTruthy();
    expect(screen.getByText("ID card")).toBeTruthy();
    expect(screen.getByText("Most recent pay slip")).toBeTruthy();
    expect(screen.getAllByText("Required").length).toBe(STANDARD_DOKUMENTE_P1.length);
    expect(screen.queryByText("Personalausweis")).toBeNull();
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("zeigt den gespeicherten deutschen Namen, wenn es keine Übersetzung gibt", async () => {
    t.sprache = "en";
    getMobileScanSession.mockResolvedValue(sitzung({ meta: { docList: ["Personalausweis", "Nachweis Girokonto"], uploads: [] } }));
    await zeige();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Start scan/ })); });
    expect(screen.getByText("ID card")).toBeTruthy();
    // Von Hand ergänzte Unterlage: kein Eintrag, also der deutsche Name.
    expect(screen.getByText("Nachweis Girokonto")).toBeTruthy();
  });

  it("zeigt eine abgelaufene Sitzung englisch an", async () => {
    t.sprache = "en";
    getMobileScanSession.mockResolvedValue(sitzung({ expires_at: "2020-01-01T00:00:00Z" }));
    await zeige();
    expect(await screen.findByText(MOBILE_SCAN_TEXTE.en.fehlerAbgelaufen)).toBeTruthy();
  });

  it("bleibt Deutsch, wenn die Sprachabfrage fehlt (Migration nicht gelaufen)", async () => {
    t.spracheFehler = true;
    await zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Bonitätsunterlagen scannen");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Scan starten/ })); });
    expect(screen.getByText("Personalausweis")).toBeTruthy();
  });

  it("lässt sich mit ?lang=de für die Anzeige überschreiben", async () => {
    t.sprache = "en";
    await zeige(`/mobile-scan/${TOKEN}?lang=de`);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Bonitätsunterlagen scannen");
  });

  it("lässt sich mit ?lang=en für die Anzeige überschreiben", async () => {
    t.sprache = "de";
    await zeige(`/mobile-scan/${TOKEN}?lang=en`);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Scan your credit check documents");
  });
});

describe("Liste „Hochgeladen“: Englisch", () => {
  it("übersetzt Beschriftungen und Dokumentnamen, nicht den gespeicherten Typ", () => {
    render(
      <MobileScanHochgeladen
        sprache="en"
        eintraege={[
          { id: "1", docTyp: "Personalausweis Person 2", status: "fertig" },
          { id: "2", docTyp: "Arbeitsvertrag", status: "fehler" },
        ]}
      />,
    );
    const liste = screen.getByRole("heading", { name: "Uploaded" }).closest("section") as HTMLElement;
    expect(within(liste).getByText("1 document in this session")).toBeTruthy();
    expect(within(liste).getByText("ID card (person 2)")).toBeTruthy();
    expect(within(liste).getByRole("img", { name: "Failed" })).toBeTruthy();
    expect(within(liste).getByText(MOBILE_SCAN_TEXTE.en.liste.fehlerText)).toBeTruthy();
  });
});

describe("Handy-Scan: Texte vollständig", () => {
  it("hat alle Texte in beiden Sprachen", () => {
    expect(textdateiLuecken(MOBILE_SCAN_TEXTE.de, MOBILE_SCAN_TEXTE.en)).toEqual([]);
  });

  it("setzt Platzhalter ohne Gedankenstrich ein", () => {
    for (const texte of [MOBILE_SCAN_TEXTE.de, MOBILE_SCAN_TEXTE.en]) {
      const beispiele = [
        mitText(texte.uploadFehler, { fehler: "Netz weg" }),
        mitText(texte.zusammengefuehrt, { zahl: 3 }),
        mitText(texte.zusammenfuehrenFehler, { fehler: "Netz weg" }),
        mitText(texte.abschliessen, { zahl: 4 }),
        mitText(texte.naechsteAufnahme, { seite: texte.vorderseite }),
        mitText(texte.seiteN, { zahl: 2 }),
        mitText(texte.seitenEins, { zahl: 1 }),
        mitText(texte.seitenMehr, { zahl: 3 }),
        mitText(texte.liste.zahlEins, { zahl: 1 }),
        mitText(texte.liste.zahlMehr, { zahl: 3 }),
      ];
      for (const text of beispiele) {
        expect(text).not.toMatch(/\{\w+\}/);
        expect(gedankenstrichFrei(text), text).toBe(true);
      }
    }
  });
});

/** Alle Dokumentnamen, die eine Sitzung mitbringen kann, ohne freie Eingaben. */
function bekannteDokumentnamen(): string[] {
  const namen = new Set<string>([...STANDARD_DOKUMENTE_P1, ...STANDARD_DOKUMENTE_P2]);
  const dazu = (docs: { name: string }[]) => docs.forEach((d) => namen.add(d.name));

  // Bonität, wie Portal und Kundenprofil sie der Sitzung mitgeben.
  dazu([...portal.INITIAL_PFLICHT_DOCS, portal.SCHUFA_DOC, ...portal.GEHALTS_DOCS_P1]);
  dazu([...portal.INITIAL_PFLICHT_DOCS_P2, portal.SCHUFA_DOC_P2, ...portal.GEHALTS_DOCS_P2]);
  for (const art of ["angestellt", "selbstaendig", "beamter", ""]) {
    dazu(buildBonitaetDocs(art));
    dazu(buildBonitaetDocsPerson2(art));
    for (const person of [1, 2] as const) {
      for (const variant of ["admin", "kompakt"] as const) {
        dazu(buildBankpruefungBaseDocs({ beschaeftigungsart: art, person, variant, privateKV: "100" }));
      }
      // Die ganze Bankprüfungsliste mit allen Nachweisen, die aus der
      // Selbstauskunft entstehen können.
      for (const mietart of ["Mietfrei", "Zur Miete"]) {
        dazu(buildBankpruefungDocListe({
          person,
          saData: {
            beschaeftigungsart: art,
            privateKV: "100",
            mietart,
            autokredite: "100",
            privatkredite: "100",
            sonstigeKredite: "100",
            zinsTilgung: "100",
            mieteinnahmen: "100",
          },
        }));
      }
    }
  }
  return [...namen];
}

describe("Dokumentnamen: Wörterbuch", () => {
  it("hat für jeden bekannten Dokumentnamen einen englischen Eintrag", () => {
    const namen = bekannteDokumentnamen();
    // Die Standardlisten allein sind 22 Namen, dazu die Bankprüfung.
    expect(namen.length).toBeGreaterThan(40);
    const fehlend = namen.filter((name) => dokumentnameAnzeige(name, "en") === name);
    expect(fehlend).toEqual([]);
    for (const name of namen) {
      const englisch = dokumentnameAnzeige(name, "en");
      expect(gedankenstrichFrei(englisch), englisch).toBe(true);
      expect(englisch).not.toMatch(/advisor/i);
    }
  });

  it("lässt Deutsch unverändert", () => {
    for (const name of bekannteDokumentnamen()) expect(dokumentnameAnzeige(name, "de")).toBe(name);
  });

  it("setzt zweite Person und Nachweise je Vermögenswert zusammen", () => {
    expect(dokumentnameAnzeige("Lohnsteuerbescheinigung Vorjahr Person 2", "en"))
      .toBe("Annual wage tax statement for last year (Lohnsteuerbescheinigung) (person 2)");
    expect(dokumentnameAnzeige("Nachweis: Tagesgeld", "en")).toBe("Proof: Tagesgeld");
    expect(dokumentnameAnzeige("Nachweis: Tagesgeld Person 2", "en")).toBe("Proof: Tagesgeld (person 2)");
    expect(dokumentnameAnzeige("Völlig freie Unterlage", "en")).toBe("Völlig freie Unterlage");
  });

  it("nimmt die Glossarbegriffe", () => {
    expect(DOKUMENTNAMEN_EN.Selbstauskunft).toBe("Self-disclosure (Selbstauskunft)");
    expect(DOKUMENTNAMEN_EN.Eigenkapitalnachweis).toBe("Proof of equity");
  });
});
