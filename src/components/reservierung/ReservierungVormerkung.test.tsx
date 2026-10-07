import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Die Reihenfolge beim Absenden, seit dem 23.09.2026.
 *
 * Christians Regeln: Wer die Reservierungsvereinbarung absendet, merkt die
 * Einheit zuerst 60 Minuten vor. Lehnt die Datenbank ab, weil die Einheit
 * vergeben oder für einen anderen Kunden vorgemerkt ist, geschieht gar
 * nichts: kein Investment, kein Kontakt, keine Mail. Reserviert wird erst mit
 * der Unterschrift.
 *
 * Fehlt die Migration noch, nimmt das Formular den bisherigen Weg und
 * reserviert beim Absenden, jetzt aber erst nach der Prüfung, ob die Einheit
 * noch frei ist.
 */

const ablauf: string[] = [];
const metaFelder: Record<string, unknown> = {};
const investment: Record<string, unknown> = { id: "inv-1", kontaktId: "k-1", pipelineStufe: "objektauswahl" };
const kontakt = {
  id: "k-1", vorname: "Anna", nachname: "Beispiel", email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München", geburtstag: "01.01.1980",
};

const t = vi.hoisted(() => ({
  vormerkAntwort: { ok: true, grund: "vorgemerkt", vorgemerktBis: "2026-09-23T12:30:00.000Z" } as Record<string, unknown>,
  reserveFehler: null as Error | null,
  versandOk: true,
  rolle: undefined as string | undefined,
  entwuerfe: {} as Record<string, Record<string, unknown>>,
}));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (id === investment.id ? investment : undefined),
  getInvestmentMetaField: (_id: string, key: string, fallback: unknown) => metaFelder[key] ?? fallback,
  setInvestmentMetaFields: (_id: string, felder: Record<string, unknown>) => { ablauf.push("investment-meta"); Object.assign(metaFelder, felder); },
  updateInvestment: (_id: string, felder: Record<string, unknown>) => { ablauf.push("investment"); Object.assign(investment, felder); },
  getInvestmentsByKontakt: () => [{ ...investment, meta: metaFelder }],
  investmentGespeichert: async () => {},
}));

vi.mock("@/lib/objekteStore", () => {
  class EinheitVergebenFehler extends Error {
    grund: "vergeben" | "globalobjekt";
    constructor(grund: "vergeben" | "globalobjekt") { super(grund); this.grund = grund; }
  }
  return {
    EinheitVergebenFehler,
    getWohnungKurz: () => null,
    getObjektById: () => undefined,
    vormerkeEinheit: async (wohnungId: string, kontaktId: string) => {
      ablauf.push(`vormerken:${wohnungId}:${kontaktId}`);
      return t.vormerkAntwort;
    },
    reserveWohnung: async () => {
      ablauf.push("reservieren");
      if (t.reserveFehler) throw t.reserveFehler;
    },
  };
});

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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string) => {
        ablauf.push(`versand:${name}`);
        return t.versandOk
          ? { data: { success: true, results: [{ personType: "kaeufer1", email: kontakt.email, sent: true }] }, error: null }
          : { data: null, error: new Error("Netz weg") };
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

const { ReservierungsForm, entwurfLaden } = await import("@/components/reservierung/ReservierungsForm");

function bisZumAbsenden(props: Record<string, unknown> = {}) {
  render(
    <MemoryRouter>
      <ReservierungsForm
        kundeId="k-1"
        investmentId="inv-1"
        objektId="obj-1"
        wohnungId="we-6"
        wohnungData={{ weNr: "6", groesse: 60, kaufpreis: 250000, etage: "1", lage: "", objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof" }}
        verkaeuferData={{ vkArt: "firma", vkName: "Bau GmbH", vkStrasse: "Weg 1", vkPlz: "95028", vkOrt: "Hof" }}
        {...props}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  fireEvent.click(document.getElementById("erk")!);
  fireEvent.click(document.getElementById("widerruf-sofort")!);
}

const absendeKnopf = () => screen.getByRole("button", { name: /Unterschrift anfordern|Versand erneut versuchen|Unterschrift angefordert/ });

beforeEach(() => {
  cleanup();
  ablauf.length = 0;
  hinweise.length = 0;
  toasts.length = 0;
  for (const k of Object.keys(metaFelder)) delete metaFelder[k];
  // Seit 29.09.2026 prueft das Formular vorab die Selbstauskunft, wie der Server.
  metaFelder.saSigned = true;
  for (const k of Object.keys(t.entwuerfe)) delete t.entwuerfe[k];
  investment.pipelineStufe = "objektauswahl";
  // Das Absenden schreibt Objekt und Wohnung ans Investment; jeder Test beginnt ohne.
  delete investment.objektId;
  delete investment.wohnungId;
  t.vormerkAntwort = { ok: true, grund: "vorgemerkt", vorgemerktBis: "2026-09-23T12:30:00.000Z" };
  t.reserveFehler = null;
  t.versandOk = true;
  t.rolle = undefined;
});

describe("Erst vormerken, dann Investment, Kontakt und Versand", () => {
  it("merkt die Einheit für genau diesen Kunden vor, bevor irgendetwas anderes geschieht", async () => {
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(ablauf).toContain("versand:send-reservation-signature"));
    expect(ablauf[0]).toBe("vormerken:we-6:k-1");
    expect(ablauf.indexOf("vormerken:we-6:k-1")).toBeLessThan(ablauf.indexOf("investment"));
    expect(ablauf.indexOf("kontakt")).toBeLessThan(ablauf.indexOf("versand:send-reservation-signature"));
    // Regel 5: Mit Migration wird beim Absenden NICHT reserviert.
    expect(ablauf).not.toContain("reservieren");
  });

  it("nennt im Erfolg die Vormerkung", async () => {
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(toasts.some((x) => x.title === "Unterschrift angefordert ✓")).toBe(true));
    const erfolg = toasts.find((x) => x.title === "Unterschrift angefordert ✓");
    expect(erfolg?.description).toContain("vorgemerkt");
  });

  it("schickt bei einer vergebenen Einheit nichts hinaus und ändert nichts", async () => {
    t.vormerkAntwort = { ok: false, grund: "vergeben" };
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(hinweise).toHaveLength(1));
    expect(hinweise[0].title).toBe("Diese Einheit ist gerade vergeben");
    expect(ablauf).toEqual(["vormerken:we-6:k-1"]);
  });

  it("schickt bei einer fremden Vormerkung nichts hinaus und nennt die Uhrzeit", async () => {
    t.vormerkAntwort = { ok: false, grund: "vorgemerkt_von_anderem", vorgemerktBis: "2026-09-23T12:30:00.000Z" };
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(hinweise).toHaveLength(1));
    expect(hinweise[0].title).toBe("Diese Einheit ist vorgemerkt bis 14:30 Uhr");
    expect(ablauf).toEqual(["vormerken:we-6:k-1"]);
  });

  it("merkt beim zweiten Versuch erneut vor, weil die Vormerkung inzwischen abgelaufen sein kann", async () => {
    t.versandOk = false;
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(screen.getByRole("button", { name: /Versand erneut versuchen/ })).toBeTruthy());
    ablauf.length = 0;
    t.vormerkAntwort = { ok: false, grund: "vorgemerkt_von_anderem", vorgemerktBis: "2026-09-23T12:30:00.000Z" };
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(hinweise.some((h) => String(h.title).startsWith("Diese Einheit ist vorgemerkt"))).toBe(true));
    expect(ablauf).toEqual(["vormerken:we-6:k-1"]);
  });

  it("merkt ohne Einheit aus dem Bestand nichts vor und läuft wie bisher", async () => {
    bisZumAbsenden({ objektId: undefined, wohnungId: undefined });
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(ablauf).toContain("versand:send-reservation-signature"));
    expect(ablauf.some((s) => s.startsWith("vormerken"))).toBe(false);
  });
});

describe("Rückfall, solange die Migration fehlt", () => {
  beforeEach(() => {
    t.vormerkAntwort = { ok: false, grund: "ohne_migration" };
  });

  it("reserviert wie bisher, aber vor Investment und Kontakt", async () => {
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(ablauf).toContain("versand:send-reservation-signature"));
    expect(ablauf.indexOf("reservieren")).toBeGreaterThan(-1);
    expect(ablauf.indexOf("reservieren")).toBeLessThan(ablauf.indexOf("investment"));
  });

  it("schickt nichts hinaus, wenn die Einheit inzwischen vergeben ist", async () => {
    const { EinheitVergebenFehler } = await import("@/lib/objekteStore");
    t.reserveFehler = new EinheitVergebenFehler("vergeben");
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(hinweise).toHaveLength(1));
    expect(hinweise[0].title).toBe("Diese Einheit ist gerade vergeben");
    expect(ablauf).toEqual(["vormerken:we-6:k-1", "reservieren"]);
  });

  it("zeigt Admin und Inhaber den Hinweis auf die fehlende Migration", async () => {
    t.rolle = "inhaber";
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(ablauf).toContain("versand:send-reservation-signature"));
    expect(toasts.some((x) => x.title === "Migration Vormerkung noch nicht ausgeführt")).toBe(true);
  });

  it("zeigt dem Vertrieb keinen Technikhinweis", async () => {
    t.rolle = "vertriebspartner";
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(ablauf).toContain("versand:send-reservation-signature"));
    expect(toasts.some((x) => x.title === "Migration Vormerkung noch nicht ausgeführt")).toBe(false);
  });
});

describe("Der Entwurf gehört zur Einheit", () => {
  const entwurf = (we: string) => ({ vorname: "Anna", wohneinheit: we, objStrasse: "Alte Straße 1" });

  it("übernimmt einen älteren Entwurf ohne Einheit im Schlüssel nicht für eine andere Wohnung", () => {
    t.entwuerfe["k-1:inv-1"] = entwurf("12");
    const d = entwurfLaden("k-1:inv-1:we-6", "k-1:inv-1", "6");
    expect(d.wohneinheit).toBe("");
    expect(d.objStrasse).toBe("");
  });

  it("übernimmt ihn für dieselbe Wohnung, damit nichts verloren geht", () => {
    t.entwuerfe["k-1:inv-1"] = entwurf("6");
    expect(entwurfLaden("k-1:inv-1:we-6", "k-1:inv-1", "WE 6").wohneinheit).toBe("6");
  });

  it("nimmt den Entwurf mit der Einheit im Schlüssel zuerst", () => {
    t.entwuerfe["k-1:inv-1"] = entwurf("12");
    t.entwuerfe["k-1:inv-1:we-6"] = entwurf("6");
    expect(entwurfLaden("k-1:inv-1:we-6", "k-1:inv-1", "6").wohneinheit).toBe("6");
  });

  it("zeigt im Formular die gewählte Wohnung, nicht die aus dem alten Entwurf", () => {
    t.entwuerfe["k-1:inv-1"] = entwurf("12");
    render(
      <MemoryRouter>
        <ReservierungsForm kundeId="k-1" investmentId="inv-1" objektId="obj-1" wohnungId="we-6"
          wohnungData={{ weNr: "6", groesse: 60, kaufpreis: 250000, etage: "1", lage: "", objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof" }} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect((screen.getByPlaceholderText("z. B. 6") as HTMLInputElement).value).toBe("6");
  });
});
