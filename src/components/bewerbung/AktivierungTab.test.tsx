import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Aktivierungs-Tab: das Gate greift für normale Rollen, Admin und Inhaber
// sehen den Inhalt als Vorschau mit deutlichem Hinweisstreifen.
// Store, App-Konfiguration und Supabase sind Attrappen.

vi.mock("@/lib/bewerbungStore", () => ({
  updateBewerber: vi.fn(),
  changeBewerberStatus: vi.fn(),
  addNotification: vi.fn(),
}));

vi.mock("@/lib/appConfigStore", () => ({
  getAppConfig: () => "",
  setAppConfig: vi.fn(),
}));

vi.mock("@/lib/dataCache", () => ({
  onCacheChange: () => () => {},
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { AktivierungTab } from "./AktivierungTab";
import { changeBewerberStatus, type Bewerber } from "@/lib/bewerbungStore";

function baueBewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "test-bewerber-1",
    vorname: "Max",
    nachname: "Muster",
    email: "max@example.com",
    telefon: "",
    status: "Rechnung",
    bewertung: 0,
    erstelltAm: new Date().toISOString(),
    dokumente: [], benachrichtigungen: [], notizenLog: [],
    paketwahl: "junior",
    vertragStatus: "unterschrieben",
    rechnungBezahltBestaetigungen: [], rechnungBezahltAm: "",
    onboardingChecklist: [], academyPflichtModule: [],
    ...teil,
  } as unknown as Bewerber;
}

const zeige = (teil: Partial<Bewerber>, adminVorschau: boolean, darfNutzerAnlegen = false) =>
  render(
    <MemoryRouter>
      <AktivierungTab
        bewerber={baueBewerber(teil)}
        canEdit={true}
        currentUserName="Christian"
        onRefresh={() => {}}
        adminVorschau={adminVorschau}
        darfNutzerAnlegen={darfNutzerAnlegen}
      />
    </MemoryRouter>,
  );

describe("AktivierungTab: Nutzer anlegen nur Admin und Inhaber", () => {
  const bezahlt = { rechnungBezahltAm: new Date().toISOString(), vertragStatus: "unterschrieben" } as Partial<Bewerber>;

  it("HR sieht weder die Nutzer-Maske noch den Versand der Zugangsdaten", () => {
    zeige(bezahlt, false, false);
    expect(screen.queryByRole("button", { name: /Nutzer-Maske öffnen/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Zugangsdaten senden/ })).toBeNull();
    expect(screen.getByText("Den Nutzer legen Admin und Inhaber an.")).toBeInTheDocument();
    expect(screen.getByText("Die Zugangsdaten senden Admin und Inhaber.")).toBeInTheDocument();
  });

  it("Admin und Inhaber sehen beide Knöpfe", () => {
    zeige(bezahlt, true, true);
    expect(screen.getByRole("button", { name: /Nutzer-Maske öffnen/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zugangsdaten senden/ })).toBeInTheDocument();
  });

  it("der Arbeitsplatz entscheidet nach der aktiven Rolle, die Glocke geht an Admin und Inhaber", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const lies = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf-8");
    expect(lies("src/pages/BewerberArbeitsplatz.tsx")).toContain('darfNutzerAnlegen={user.role === "admin" || user.role === "inhaber"}');
    const rechnung = lies("src/components/bewerbung/RechnungsTab.tsx");
    expect(rechnung).toMatch(/notifyByRole\(\["admin", "inhaber"\], \{\s*titel: "Lead-Paket bezahlt, Nutzer anlegen"/);
    expect(rechnung).not.toMatch(/notifyByRole\(\["hr"\], \{\s*titel: "Lead-Paket bezahlt/);
  });
});

describe("AktivierungTab (Admin-Vorschau)", () => {
  /*
   * Seit dem 19.09.2026 haengt die Freigabe am VERTRAG und nicht mehr an der
   * bezahlten Rechnung.
   *
   * Grund: Wer kein Lead-Paket gewaehlt hat, bekommt gar keine Rechnung und
   * bleibt nach der Gegenzeichnung in der Stufe "Vertrag" liegen. Genau dort
   * soll HR den Onboarding-Termin buchen. Waere der Reiter weiter an die
   * Zahlung gekoppelt, kaeme diese Gruppe nie an den Termin heran.
   */
  it("ohne unterschriebenen Vertrag bleibt der Bereich gesperrt", () => {
    zeige({ rechnungBezahltAm: "", vertragStatus: "gesendet", vertragSignedAt: "" }, false);
    expect(screen.getByText(/Vertrag noch nicht vollständig unterschrieben/)).toBeInTheDocument();
    expect(screen.queryByText(/Onboarding-Fortschritt/)).not.toBeInTheDocument();
  });

  it("öffnet sich mit dem vollständig unterschriebenen Vertrag, auch ohne Rechnung", () => {
    zeige({ rechnungBezahltAm: "", vertragStatus: "unterschrieben" }, false);
    expect(screen.getByText(/Onboarding-Fortschritt/)).toBeInTheDocument();
    expect(screen.queryByText(/noch nicht vollständig unterschrieben/)).not.toBeInTheDocument();
  });

  it("als Admin erscheint der Inhalt mit Vorschau-Hinweis", () => {
    zeige({ rechnungBezahltAm: "", vertragStatus: "gesendet", vertragSignedAt: "" }, true);
    expect(screen.getByText(/Vorschau als Administrator/)).toBeInTheDocument();
    expect(screen.getByText(/der Vertrag noch nicht vollständig unterschrieben ist/)).toBeInTheDocument();
    expect(screen.getByText(/Onboarding-Fortschritt/)).toBeInTheDocument();
  });

  it("bei bezahlter Rechnung erscheint kein Vorschau-Hinweis", () => {
    zeige({ rechnungBezahltAm: new Date().toISOString() }, true);
    expect(screen.queryByText(/Vorschau als Administrator/)).not.toBeInTheDocument();
    expect(screen.getByText(/Onboarding-Fortschritt/)).toBeInTheDocument();
  });
});

describe("AktivierungTab (Onboarding-Termin und Lead-Paket)", () => {
  /*
   * Seit dem 23.09.2026 fuehrt aus "Rechnung" nur die bestaetigte Zahlung
   * fuer das Lead-Paket heraus (RechnungsTab), und nur dann geht die
   * Folgemail an Christian. Ein eingetragener Onboarding-Termin darf einen
   * Bewerber mit offenem Lead-Paket deshalb nicht vorher weiterschieben.
   */
  const statusMock = vi.mocked(changeBewerberStatus);
  beforeEach(() => statusMock.mockClear());

  /** Traegt zum schon gesetzten Datum die Uhrzeit ein, damit der Termin vollstaendig ist. */
  const terminVervollstaendigen = (teil: Partial<Bewerber>) => {
    const { container } = zeige({ onboardingTerminDatum: "01.10.2026", ...teil }, false);
    const uhrzeit = container.querySelector('input[type="time"]') as HTMLInputElement;
    fireEvent.change(uhrzeit, { target: { value: "10:00" } });
  };

  it("mit offenem Lead-Paket bleibt der Bewerber in Rechnung", () => {
    terminVervollstaendigen({ status: "Rechnung", leadPaket: { betrag: 2500, anzahl: 20 }, rechnungBezahltAm: "" });
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("mit bezahltem Lead-Paket schiebt der Termin nach Nutzer anlegen", () => {
    terminVervollstaendigen({
      status: "Rechnung",
      leadPaket: { betrag: 2500, anzahl: 20 },
      rechnungBezahltAm: new Date().toISOString(),
    });
    expect(statusMock).toHaveBeenCalledWith("test-bewerber-1", "Nutzer_anlegen");
  });

  it("ohne Lead-Paket schiebt der Termin wie bisher nach Nutzer anlegen", () => {
    terminVervollstaendigen({ status: "Vertrag", rechnungBezahltAm: "" });
    expect(statusMock).toHaveBeenCalledWith("test-bewerber-1", "Nutzer_anlegen");
  });
});

describe("AktivierungTab: Anleitung geht mit der persönlichen Mail", () => {
  const offen = { rechnungBezahltAm: new Date().toISOString(), vertragStatus: "unterschrieben" } as Partial<Bewerber>;

  it("Block 2 zeigt die mitgeschickte PDF mit Vorschau auf die öffentliche Datei", () => {
    zeige(offen, true, true);
    expect(screen.getByText("Anleitung OS Immobilien Mail einrichten (PDF)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vorschau öffnen/ })).toHaveAttribute(
      "href",
      "/dokumente/moreimmo-mail-einrichten.pdf",
    );
  });

  it("die Postfach-Karte unter Freischalten entfällt, die Karten zählen ab 1", () => {
    zeige(offen, true, true);
    expect(screen.queryByText(/E-Mail-Postfach anlegen/)).toBeNull();
    expect(screen.getByText("1. Nutzer im CRM anlegen")).toBeInTheDocument();
    expect(screen.getByText("2. Investagon-Zugang einrichten")).toBeInTheDocument();
  });

  it("ein schon gesetzter Postfach-Haken bleibt gesetzt und zählt im Fortschritt", () => {
    zeige({
      ...offen,
      aktivierungOnboarding: { email_postfach: { done: true, doneAt: "2026-09-20T10:00:00.000Z", doneBy: "HR" } },
    } as Partial<Bewerber>, true, true);
    const haken = screen.getByRole("checkbox", { name: /Postfach bei one.com angelegt/ });
    expect(haken).toHaveAttribute("data-state", "checked");
    expect(screen.getByText("1 von 3 Schritten erledigt")).toBeInTheDocument();
  });
});
