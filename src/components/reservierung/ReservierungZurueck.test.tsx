import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

/**
 * Der Zurückweg aus der Reservierungsvereinbarung.
 *
 * Sie geht seit 09/2026 im selben Reiter auf. Damit braucht sie oben einen
 * Weg zurück, und dieser Weg muss dorthin führen, wo der Nutzer hergekommen
 * ist, nicht auf eine feste Seite.
 *
 * Geprüft wird vor allem die Rückfrage: Sie darf nur erscheinen, wenn wirklich
 * etwas zu verlieren ist. Das Formular geht aus Kontakt und Investment
 * vorbefüllt auf, und eine Vorbefüllung ist keine Eingabe des Nutzers. Wer
 * öffnet, sich vertut und sofort zurückgeht, soll nicht gefragt werden.
 */

/** Was der Bestätigungsdialog gefragt hat, und was er antworten soll. */
const gefragt: Array<Record<string, unknown>> = [];
let antwort = true;

vi.mock("@/lib/confirm", () => ({
  confirmDialog: async (opts: Record<string, unknown>) => {
    gefragt.push(opts);
    return antwort;
  },
  hinweisDialog: async () => {},
}));

/** Die Ablage des Entwurfs, damit das Verwerfen nachprüfbar ist. */
const einstellungen: Record<string, unknown> = {};

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (schluessel: string, fallback: unknown) => einstellungen[schluessel] ?? fallback,
  setUserSetting: (schluessel: string, wert: unknown) => { einstellungen[schluessel] = wert; },
}));

vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));

/*
 * Der Zwischenspeicher gilt hier als geladen. Die Seite wartet seit dem
 * 16.09.2026 auf ihn, weil sie Kunde und Investment selbst nachschlägt,
 * statt die Daten aus der Adresszeile zu nehmen.
 */
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));

const kontakt = {
  id: "k-1",
  vorname: "Anna", nachname: "Beispiel",
  email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München",
  geburtstag: "01.01.1980", steuerId: "123/456/78901",
};

vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (id === kontakt.id ? kontakt : null),
  updateKontakt: () => {},
}));

vi.mock("@/lib/objekteStore", () => ({
  reserveWohnung: async () => {},
  getObjektById: () => undefined,
  getWohnungKurz: () => null,
}));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: () => undefined,
  getInvestmentMetaField: (_id: string, _key: string, fallback: unknown) => fallback,
  setInvestmentMetaFields: () => {},
  updateInvestment: () => {},
  getInvestmentsByKontakt: () => [],
}));

vi.mock("@/lib/notificationStore", () => ({ addDocNotification: () => {} }));

// Die Seite bringt sonst die ganze Anwendungshülle samt Anmeldung mit.
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: async () => ({ data: null, error: null }) } },
}));

const { eigeneEingabeVorhanden } = await import("@/components/reservierung/ReservierungsForm");
const { default: ReservierungSeite } = await import("@/pages/Reservierung");

/** Zeigt den Fragezeichenteil mit, damit Reiter und Investment prüfbar sind. */
function Kundenprofil() {
  const { search } = useLocation();
  return <div>Kundenprofil<span data-testid="kundenprofil-such">{search}</span></div>;
}

function zeigeSeite(suchteil: string) {
  return render(
    <MemoryRouter initialEntries={[`/reservierung?${suchteil}`]}>
      <Routes>
        <Route path="/reservierung" element={<ReservierungSeite />} />
        <Route path="/kunden/:id" element={<Kundenprofil />} />
        <Route path="/objekte/:id" element={<div>Objektseite</div>} />
        <Route path="/kontakte" element={<div>Kontaktliste</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Den Vornamen ändern. Er steht vorbefüllt aus dem Kontakt. */
function tippeImVornamen(wert: string) {
  const feld = screen.getByDisplayValue("Anna") as HTMLInputElement;
  fireEvent.change(feld, { target: { value: wert } });
  return feld;
}

beforeEach(() => {
  gefragt.length = 0;
  antwort = true;
  for (const k of Object.keys(einstellungen)) delete einstellungen[k];
});

describe("Der Zurückknopf oben", () => {
  it("führt ins Kundenprofil, wenn die Adresszeile nichts anderes sagt", async () => {
    zeigeSeite("kunde=k-1");
    fireEvent.click(screen.getByRole("button", { name: "Zurück zum Kundenprofil" }));
    await waitFor(() => expect(screen.getByText("Kundenprofil")).toBeTruthy());
  });

  /*
   * Das Kundenprofil merkt sich Reiter und gewähltes Investment in der
   * Adresse. Beides muss den Weg zurück überstehen, sonst landet man auf dem
   * Standardreiter und sucht den Vorgang erneut.
   */
  it("behält Reiter und Investment des Kundenprofils", async () => {
    zeigeSeite("kunde=k-1&zurueck=" + encodeURIComponent("/kunden/k-1?tab=investments&investment=inv-1"));
    fireEvent.click(screen.getByRole("button", { name: "Zurück zum Kundenprofil" }));
    await waitFor(() => expect(screen.getByText("Kundenprofil")).toBeTruthy());
    expect(screen.getByTestId("kundenprofil-such").textContent).toBe("?tab=investments&investment=inv-1");
  });

  it("führt zur Objektseite, wenn sie als Ziel mitgereist ist", async () => {
    zeigeSeite("kunde=k-1&zurueck=" + encodeURIComponent("/objekte/obj-1"));
    fireEvent.click(screen.getByRole("button", { name: "Zurück zum Objekt" }));
    await waitFor(() => expect(screen.getByText("Objektseite")).toBeTruthy());
  });

  /*
   * Ein Direktaufruf ohne Vorgeschichte, etwa aus einem Lesezeichen. Ohne
   * Kunden in der Adresszeile bleibt die Kontaktliste.
   */
  it("führt ohne Kunden in der Adresse zur Kontaktliste", async () => {
    zeigeSeite("");
    fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
    await waitFor(() => expect(screen.getByText("Kontaktliste")).toBeTruthy());
  });

  /*
   * Die Adresszeile darf niemanden von der Anwendung fortschicken. Ein Ziel,
   * das kein Pfad innerhalb der Anwendung ist, wird verworfen.
   */
  it("nimmt kein fremdes Ziel aus der Adresszeile an", async () => {
    zeigeSeite("kunde=k-1&zurueck=" + encodeURIComponent("https://fremde.test/seite"));
    fireEvent.click(screen.getByRole("button", { name: "Zurück zum Kundenprofil" }));
    await waitFor(() => expect(screen.getByText("Kundenprofil")).toBeTruthy());
  });
});

describe("Die Rückfrage beim Zurückspringen", () => {
  it("bleibt aus, solange nur die Vorbefüllung dasteht", async () => {
    zeigeSeite("kunde=k-1");
    fireEvent.click(screen.getByRole("button", { name: "Zurück zum Kundenprofil" }));
    await waitFor(() => expect(screen.getByText("Kundenprofil")).toBeTruthy());
    expect(gefragt).toHaveLength(0);
  });

  it("kommt, sobald jemand ein Feld ändert", async () => {
    zeigeSeite("kunde=k-1");
    tippeImVornamen("Annegret");
    fireEvent.click(screen.getByRole("button", { name: "Zurück zum Kundenprofil" }));
    await waitFor(() => expect(gefragt).toHaveLength(1));
    expect(gefragt[0].title).toBe("Reservierungsvereinbarung verwerfen?");
    expect(gefragt[0].confirmText).toBe("Verwerfen");
    expect(gefragt[0].cancelText).toBe("Weiter ausfüllen");
  });

  it("hält im Formular fest, wenn weiter ausgefüllt werden soll", async () => {
    antwort = false;
    zeigeSeite("kunde=k-1");
    tippeImVornamen("Annegret");
    fireEvent.click(screen.getByRole("button", { name: "Zurück zum Kundenprofil" }));
    await waitFor(() => expect(gefragt).toHaveLength(1));
    expect(screen.queryByText("Kundenprofil")).toBeNull();
    expect(screen.getByDisplayValue("Annegret")).toBeTruthy();
  });

  it("setzt den Entwurf beim Verwerfen auf den Ausgangsstand zurück", async () => {
    zeigeSeite("kunde=k-1");
    tippeImVornamen("Annegret");
    await waitFor(() => {
      const abgelegt = einstellungen["reservierungen"] as Record<string, { vorname: string }>;
      expect(abgelegt["k-1"].vorname).toBe("Annegret");
    });
    fireEvent.click(screen.getByRole("button", { name: "Zurück zum Kundenprofil" }));
    await waitFor(() => expect(screen.getByText("Kundenprofil")).toBeTruthy());
    const abgelegt = einstellungen["reservierungen"] as Record<string, { vorname: string }>;
    expect(abgelegt["k-1"].vorname).toBe("Anna");
  });

  /*
   * Wer eine Änderung wieder zurücktippt, steht auf dem Ausgangsstand. Dann
   * ist nichts mehr zu verlieren, und es wird nicht gefragt.
   */
  it("bleibt aus, wenn die Änderung wieder rückgängig getippt wurde", async () => {
    zeigeSeite("kunde=k-1");
    tippeImVornamen("Annegret");
    const feld = screen.getByDisplayValue("Annegret") as HTMLInputElement;
    fireEvent.change(feld, { target: { value: "Anna" } });
    fireEvent.click(screen.getByRole("button", { name: "Zurück zum Kundenprofil" }));
    await waitFor(() => expect(screen.getByText("Kundenprofil")).toBeTruthy());
    expect(gefragt).toHaveLength(0);
  });
});

describe("eigeneEingabeVorhanden", () => {
  const ausgang = { vorname: "Anna", nachname: "Beispiel", hatPerson2: false } as never;

  it("meldet nichts, wenn nichts abweicht", () => {
    expect(eigeneEingabeVorhanden(ausgang, { ...(ausgang as object) } as never)).toBe(false);
  });

  it("meldet eine Abweichung in einem Textfeld", () => {
    expect(eigeneEingabeVorhanden(ausgang, { ...(ausgang as object), vorname: "Annegret" } as never)).toBe(true);
  });

  it("meldet eine Abweichung in einem Schalter", () => {
    expect(eigeneEingabeVorhanden(ausgang, { ...(ausgang as object), hatPerson2: true } as never)).toBe(true);
  });

  /* Leer und fehlend sind dasselbe, sonst meldete jedes fehlende Feld eine Eingabe. */
  it("hält ein fehlendes Feld und ein leeres Feld für gleich", () => {
    expect(eigeneEingabeVorhanden(ausgang, { ...(ausgang as object), geburtsname: "" } as never)).toBe(false);
  });
});
