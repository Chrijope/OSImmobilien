import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Das Formular im Modus „gesamtes Objekt“ (Globalobjekt), seit dem 23.09.2026.
 *
 * Geprüft wird, was der freigegebene Entwurf in Teil 2 verlangt und was
 * Christians Regeln fürs Haus bedeuten:
 *
 *   - Pflichtwahl Privatperson(en) oder Gesellschaft, bei der Gesellschaft
 *     deren Felder, ohne Widerrufswahl und ohne zweiten Käufer.
 *   - Keine Wohneinheit, dafür Anzahl Einheiten (aus den Einheiten gezählt)
 *     und die Aufteilung als Pflichtwahl.
 *   - Beim Absenden wird das Haus vorgemerkt, nie eine Einheit, und ohne
 *     Migration geht nichts hinaus.
 *   - Ans Investment gehen `weNr` leer und das Kennzeichen „Globalobjekt“.
 */

const ablauf: string[] = [];
const metaFelder: Record<string, unknown> = {};
const investment: Record<string, unknown> = { id: "inv-1", kontaktId: "k-1", pipelineStufe: "objektauswahl" };
const investmentUpdates: Array<Record<string, unknown>> = [];
const kontakt = {
  id: "k-1", vorname: "Anna", nachname: "Beispiel", email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München", geburtstag: "01.01.1980",
};

const t = vi.hoisted(() => ({
  vormerkAntwort: { ok: true, grund: "vorgemerkt", vorgemerktBis: "2026-09-23T12:30:00.000Z" } as Record<string, unknown>,
  rolle: undefined as string | undefined,
  entwuerfe: {} as Record<string, Record<string, unknown>>,
  versandBody: null as Record<string, unknown> | null,
  haus: {} as Record<string, unknown>,
}));

function einheit(id: string) {
  return { id, weNr: id, status: "frei" };
}

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (id === investment.id ? investment : undefined),
  getInvestmentMetaField: (_id: string, key: string, fallback: unknown) => metaFelder[key] ?? fallback,
  setInvestmentMetaFields: (_id: string, felder: Record<string, unknown>) => { ablauf.push("investment-meta"); Object.assign(metaFelder, felder); },
  updateInvestment: (_id: string, felder: Record<string, unknown>) => { ablauf.push("investment"); investmentUpdates.push(felder); Object.assign(investment, felder); },
  getInvestmentsByKontakt: () => [{ ...investment, meta: metaFelder }],
  investmentGespeichert: async () => {},
}));

vi.mock("@/lib/objekteStore", () => ({
  EinheitVergebenFehler: class extends Error {},
  getWohnungKurz: () => null,
  getObjektById: (id: string) => (id === t.haus.id ? t.haus : undefined),
  vormerkeEinheit: async () => { ablauf.push("vormerken-einheit"); return { ok: true, grund: "vorgemerkt" }; },
  vormerkeObjekt: async (objektId: string, kontaktId: string) => {
    ablauf.push(`vormerken-haus:${objektId}:${kontaktId}`);
    return t.vormerkAntwort;
  },
  reserveWohnung: async () => { ablauf.push("reservieren"); },
}));

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (_k: string, fallback: unknown) => (_k === "reservierungen" ? t.entwuerfe : fallback),
  setUserSetting: () => {},
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (id === kontakt.id ? kontakt : null),
  updateKontakt: () => { ablauf.push("kontakt"); },
}));
vi.mock("@/lib/notificationStore", () => ({ addDocNotification: () => { ablauf.push("glocke"); } }));
vi.mock("@/lib/aktivitaetenStore", () => ({ addAktivitaet: () => { ablauf.push("aktivitaet"); } }));
vi.mock("@/contexts/UserContext", () => ({
  useOptionalUser: () => (t.rolle ? { user: { role: t.rolle, name: "Test" } } : null),
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string, args: { body: Record<string, unknown> }) => {
        ablauf.push(`versand:${name}`);
        t.versandBody = args.body;
        return { data: { success: true, results: [{ personType: "kaeufer1", email: kontakt.email, sent: true }] }, error: null };
      },
    },
  },
}));

const hinweise: Array<{ title: string; description?: unknown }> = [];
vi.mock("@/lib/confirm", () => ({
  hinweisDialog: async (opts: { title: string; description?: unknown }) => { hinweise.push(opts); },
  confirmDialog: async () => true,
}));
const toasts: Array<{ title?: string; description?: string; variant?: string }> = [];
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (x: { title?: string; description?: string; variant?: string }) => { toasts.push(x); } }),
  toast: (x: { title?: string; description?: string; variant?: string }) => { toasts.push(x); },
}));

const { ReservierungsForm, validateRvStep } = await import("@/components/reservierung/ReservierungsForm");
const { default: ReservierungSeite } = await import("@/pages/Reservierung");

const ENTWURF_SCHLUESSEL = "k-1:inv-1:objekt:haus-1";

function zeigeFormular() {
  render(
    <MemoryRouter>
      <ReservierungsForm kundeId="k-1" investmentId="inv-1" objektId="haus-1" gesamtobjekt />
    </MemoryRouter>,
  );
}

const weiter = () => fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
const absendeKnopf = () => screen.getByRole("button", { name: /Unterschrift anfordern|Versand erneut versuchen|Unterschrift angefordert/ });

beforeEach(() => {
  cleanup();
  ablauf.length = 0;
  hinweise.length = 0;
  toasts.length = 0;
  investmentUpdates.length = 0;
  for (const k of Object.keys(metaFelder)) delete metaFelder[k];
  // Seit 29.09.2026 prueft das Formular vorab die Selbstauskunft, wie der Server.
  metaFelder.saSigned = true;
  for (const k of Object.keys(t.entwuerfe)) delete t.entwuerfe[k];
  delete investment.objektId;
  delete investment.wohnungId;
  investment.weNr = "12";
  t.vormerkAntwort = { ok: true, grund: "vorgemerkt", vorgemerktBis: "2026-09-23T12:30:00.000Z" };
  t.rolle = undefined;
  t.versandBody = null;
  t.haus = {
    id: "haus-1", titel: "Haus Musterstraße", adresse: "Musterstraße 1", plz: "95028", ort: "Hof",
    globalObjekt: true, belegung: "frei",
    wohnungen: Array.from({ length: 8 }, (_, i) => einheit(`w${i + 1}`)),
    globalDaten: { verkaufspreis: 1850000, stellplaetze: 8, gesamtQm: 640 },
    verkaeuferDaten: { art: "firma", name: "Bau GmbH", strasse: "Weg 1", plz: "95028", ort: "Hof" },
  };
});

describe("Schritt 1: Wer kauft?", () => {
  it("verlangt zuerst die Wahl zwischen Privatperson(en) und Gesellschaft", () => {
    zeigeFormular();
    expect(screen.getByText(/Wer kauft das Haus/)).toBeTruthy();
    // Solange nichts gewählt ist, stehen keine Personenfelder da.
    expect(screen.queryByText("Käufer 1")).toBeNull();
    weiter();
    expect(screen.getByText("Bitte wähle, ob Privatpersonen oder eine Gesellschaft kaufen.")).toBeTruthy();
  });

  it("zeigt bei Privatpersonen die gewohnten Käuferfelder", () => {
    zeigeFormular();
    fireEvent.click(document.getElementById("kaeuferart-privat")!);
    expect(screen.getByText("Käufer 1")).toBeTruthy();
    expect(screen.getByDisplayValue("Anna")).toBeTruthy();
  });

  it("zeigt bei einer Gesellschaft Firma, Register und Vertreter, aber kein Geburtsdatum", () => {
    zeigeFormular();
    fireEvent.click(document.getElementById("kaeuferart-gesellschaft")!);
    expect(screen.getByText("Käuferin")).toBeTruthy();
    for (const label of ["Firma", "Rechtsform", "Registergericht", "Registernummer", "Funktion"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Geburtsdatum")).toBeNull();
    expect(screen.queryByText("Staatsangehörigkeit")).toBeNull();
    expect(screen.getByText(/Der Kontakt muss deshalb die Person sein, die für die Gesellschaft unterschreibt/)).toBeTruthy();
  });
});

describe("Die Pflichtprüfung im Modus „gesamtes Objekt“", () => {
  const basis = {
    vorname: "Anna", nachname: "Beispiel", geburtsdatum: "", staatsangehoerigkeit: "", strasse: "", hausnummer: "", plz: "", ort: "",
    telefon: "0170 1", email: "a@b.test", gueterstand: "", hatPerson2: false,
    p2Vorname: "", p2Nachname: "", p2Geburtsdatum: "", p2Staatsangehoerigkeit: "", p2Strasse: "", p2Hausnummer: "", p2Plz: "", p2Ort: "", p2Telefon: "", p2Email: "",
    wohneinheit: "", objStrasse: "Musterstraße 1", objPlz: "95028", objOrt: "Hof", gesamtpreis: "1.850.000",
    vkName: "", vkStrasse: "", vkPlz: "", vkOrt: "", erklaerungAkzeptiert: true, abgeschlossen: false,
    gesamtobjekt: true,
  };

  it("fragt keine Wohneinheit ab, aber Anzahl Einheiten und Aufteilung", () => {
    expect([...validateRvStep(1, { ...basis, anzahlEinheiten: "8", aufteilung: "offen" } as never, false)]).toEqual([]);
    expect([...validateRvStep(1, { ...basis } as never, false)].sort()).toEqual(["anzahlEinheiten", "aufteilung"]);
    expect(validateRvStep(1, { ...basis, anzahlEinheiten: "0", aufteilung: "aufgeteilt" } as never, false).has("anzahlEinheiten")).toBe(true);
  });

  it("verlangt bei der Gesellschaft deren Felder, aber kein Geburtsdatum und keine Widerrufswahl", () => {
    const fehler = validateRvStep(0, { ...basis, kaeuferArt: "gesellschaft" } as never, true);
    expect([...fehler].sort()).toEqual(
      ["firma", "firmaHausnummer", "firmaOrt", "firmaPlz", "firmaStrasse", "registergericht", "registernummer", "rechtsform", "vertreterFunktion"].sort(),
    );
    expect(validateRvStep(2, { ...basis, kaeuferArt: "gesellschaft", widerrufWahl: "" } as never, false).size).toBe(0);
    // Privatpersonen wählen weiter den Beginn.
    expect(validateRvStep(2, { ...basis, kaeuferArt: "privat", widerrufWahl: "" } as never, false).has("widerrufWahl")).toBe(true);
  });
});

describe("Schritt 2: Objektdaten beim ganzen Haus", () => {
  it("zeigt den festen Kaufgegenstand und die gezählte Anzahl, keine Wohneinheit", () => {
    zeigeFormular();
    fireEvent.click(document.getElementById("kaeuferart-privat")!);
    weiter();
    expect(screen.getByDisplayValue("Gesamtobjekt (Grundstück mit Gebäude und sämtlichen Einheiten)")).toBeTruthy();
    expect((screen.getByPlaceholderText("z. B. 8") as HTMLInputElement).value).toBe("8");
    expect(screen.queryByPlaceholderText("z. B. 6")).toBeNull();
    expect(screen.getByText("Kaufpreis gesamt")).toBeTruthy();
    expect(screen.getByDisplayValue("1.850.000")).toBeTruthy();
    expect(screen.getByDisplayValue("8 Stellplätze")).toBeTruthy();
    // Die frühere Wohnung am Investment wandert nicht ins Haus.
    expect(screen.queryByDisplayValue("12")).toBeNull();
  });
});

async function privatBisZumAbsenden() {
  zeigeFormular();
  fireEvent.click(document.getElementById("kaeuferart-privat")!);
  weiter();
  fireEvent.click(document.getElementById("aufteilung-nicht_aufgeteilt")!);
  weiter();
  fireEvent.click(document.getElementById("erk")!);
  fireEvent.click(document.getElementById("widerruf-sofort")!);
}

describe("Absenden: das Haus wird vorgemerkt, nie eine Einheit", () => {
  it("merkt das Haus vor allem anderen vor und schickt die Globalfassung", async () => {
    await privatBisZumAbsenden();
    expect(screen.getByText(/Fassung des Vertragstextes: 2026-09-23 Gesamtobjekt/)).toBeTruthy();
    expect(screen.getByText("Reservierungsgebühr für ein Gesamtobjekt")).toBeTruthy();
    expect(screen.getByText("3.000,00 EUR")).toBeTruthy();
    expect(screen.queryByText(/Kaufpreis unter/)).toBeNull();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(ablauf).toContain("versand:send-reservation-signature"));
    expect(ablauf[0]).toBe("vormerken-haus:haus-1:k-1");
    expect(ablauf).not.toContain("vormerken-einheit");
    expect(ablauf).not.toContain("reservieren");
    const rv = t.versandBody?.rvData as Record<string, unknown>;
    expect(rv.gesamtobjekt).toBe(true);
    expect(rv.textFassung).toBe("2026-09-23 Gesamtobjekt");
    expect(rv.wohneinheit).toBe("");
    expect(rv.anzahlEinheiten).toBe("8");
    expect(toasts.some((x) => String(x.description).includes("Das Haus ist bis"))).toBe(true);
  });

  it("schreibt ans Investment `weNr` leer, keine Wohnung und das Kennzeichen „Globalobjekt“", async () => {
    await privatBisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(ablauf).toContain("versand:send-reservation-signature"));
    expect(investmentUpdates[0]).toMatchObject({ pipelineStufe: "reservierung", objektId: "haus-1", weNr: "" });
    expect(investmentUpdates[0].wohnungId).toBeUndefined();
    expect(metaFelder.globalObjekt).toBe(true);
    expect((metaFelder.rvVirtualWohnung as Record<string, unknown>).weNr).toBe("");
  });

  it("schickt bei einem vergebenen Haus nichts hinaus und ändert nichts", async () => {
    t.vormerkAntwort = { ok: false, grund: "vergeben" };
    await privatBisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(hinweise).toHaveLength(1));
    expect(hinweise[0].title).toBe("Dieses Haus ist gerade vergeben");
    expect(ablauf).toEqual(["vormerken-haus:haus-1:k-1"]);
  });
});

describe("Ohne Migration geht keine Reservierung eines Globalobjekts hinaus", () => {
  it("sperrt den Knopf und nennt Admin und Inhaber die fehlende Migration", async () => {
    t.rolle = "inhaber";
    delete t.haus.belegung;
    await privatBisZumAbsenden();
    expect(screen.getByText("Migration Globalobjekt-Reservierung noch nicht ausgeführt")).toBeTruthy();
    expect((absendeKnopf() as HTMLButtonElement).disabled).toBe(true);
  });

  it("sagt dem Vertrieb nur, dass es noch nicht freigeschaltet ist", async () => {
    t.rolle = "vertriebspartner";
    delete t.haus.belegung;
    await privatBisZumAbsenden();
    expect(screen.queryByText("Migration Globalobjekt-Reservierung noch nicht ausgeführt")).toBeNull();
    expect(screen.getByText("Reservierung des ganzen Hauses noch nicht freigeschaltet")).toBeTruthy();
    expect((absendeKnopf() as HTMLButtonElement).disabled).toBe(true);
  });

  it("schickt nichts hinaus, wenn die Datenbankfunktion fehlt, und nimmt keinen Rückfallweg", async () => {
    t.rolle = "admin";
    t.vormerkAntwort = { ok: false, grund: "ohne_migration" };
    await privatBisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(hinweise).toHaveLength(1));
    expect(hinweise[0].title).toBe("Migration Globalobjekt-Reservierung noch nicht ausgeführt");
    expect(ablauf).toEqual(["vormerken-haus:haus-1:k-1"]);
  });
});

describe("Die Gesellschaft als Käuferin", () => {
  beforeEach(() => {
    t.entwuerfe[ENTWURF_SCHLUESSEL] = {
      vorname: "Max", nachname: "Muster", telefon: "089 1234", email: "max@muster.test",
      kaeuferArt: "gesellschaft", firma: "Muster Immobilien GmbH", rechtsform: "GmbH",
      firmaStrasse: "Hauptstraße", firmaHausnummer: "5", firmaPlz: "80331", firmaOrt: "München",
      registergericht: "Amtsgericht München", registernummer: "HRB 123456", vertreterFunktion: "Geschäftsführer",
      aufteilung: "aufgeteilt",
      // Vom Kontakt vorbelegt, bei der Gesellschaft aber ohne Bedeutung.
      hatPerson2: true, p2Vorname: "Zweite", p2Nachname: "Person", p2Email: "zwei@muster.test", p2Telefon: "",
      p2Geburtsdatum: "", p2Staatsangehoerigkeit: "", p2Strasse: "", p2Hausnummer: "", p2Plz: "", p2Ort: "",
      geburtsdatum: "", staatsangehoerigkeit: "", strasse: "", hausnummer: "", plz: "", ort: "", gueterstand: "",
      wohneinheit: "", objStrasse: "", objPlz: "", objOrt: "", gesamtpreis: "",
      vkName: "", vkStrasse: "", vkPlz: "", vkOrt: "", erklaerungAkzeptiert: false, abgeschlossen: false,
    };
  });

  it("hat keine Widerrufswahl, schickt nur an den Vertreter und nennt die Firma im Verwendungszweck", async () => {
    zeigeFormular();
    weiter();
    weiter();
    expect(document.getElementById("widerruf-sofort")).toBeNull();
    expect(screen.queryByText("Widerrufsrecht")).toBeNull();
    expect(screen.getByText("Reservierungsgebühr Musterstraße 1 Gesamtobjekt, Muster Immobilien GmbH")).toBeTruthy();
    fireEvent.click(document.getElementById("erk")!);
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(ablauf).toContain("versand:send-reservation-signature"));
    const personen = t.versandBody?.persons as Array<{ personType: string }>;
    expect(personen.map((p) => p.personType)).toEqual(["kaeufer1"]);
    const rv = t.versandBody?.rvData as Record<string, unknown>;
    expect(rv.kaeuferArt).toBe("gesellschaft");
    expect(rv.hatPerson2).toBe(false);
    expect(rv.widerrufWahl).toBe("");
  });
});

describe("Die Seite erkennt den Modus", () => {
  function zeigeSeite(suche: string) {
    render(
      <MemoryRouter initialEntries={[`/reservierung?${suche}`]}>
        <Routes><Route path="/reservierung" element={<ReservierungSeite />} /></Routes>
      </MemoryRouter>,
    );
  }

  it("öffnet von der Objektseite das Formular für das ganze Haus", () => {
    zeigeSeite("kunde=k-1&investmentId=inv-1&objektId=haus-1&gesamtobjekt=1");
    expect(screen.getByText(/Wer kauft das Haus/)).toBeTruthy();
  });

  it("öffnet aus dem Kundenprofil das Haus, wenn das Investment das Kennzeichen trägt", () => {
    metaFelder.globalObjekt = true;
    investment.objektId = "haus-1";
    zeigeSeite("kunde=k-1&investmentId=inv-1&objektId=haus-1");
    expect(screen.getByText(/Wer kauft das Haus/)).toBeTruthy();
  });

  it("bleibt bei der Einzelwohnung, wenn das Objekt kein Globalobjekt ist", () => {
    t.haus.globalObjekt = false;
    zeigeSeite("kunde=k-1&investmentId=inv-1&objektId=haus-1&gesamtobjekt=1");
    expect(screen.queryByText(/Wer kauft das Haus/)).toBeNull();
    expect(screen.getByText("Käufer 1")).toBeTruthy();
  });
});
