import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Zahlungsstatus-Tab: drei Zweige. (1) Gate ohne unterschriebenen Vertrag,
// (2) mit Lead-Paket wird der Zahlungseingang bestaetigt, (3) ohne Lead-Paket
// ist keine Zahlung offen und "Weiter zur Aktivierung" setzt die Freigabemarke.
// Store und Supabase sind Attrappen, es passiert kein Netz- oder Cache-Zugriff.
//
// Seit dem 23.09.2026 (Christian): Die bestaetigte Zahlung schiebt aus
// "Rechnung" nach "Nutzer anlegen", und nur dann geht die Folgemail
// "Zahlung fuer das Lead-Paket eingegangen" an Christian.

const { updateBewerberMock } = vi.hoisted(() => ({ updateBewerberMock: vi.fn() }));

vi.mock("@/lib/bewerbungStore", () => ({
  updateBewerber: updateBewerberMock,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { RechnungsTab } from "./RechnungsTab";
import type { Bewerber } from "@/lib/bewerbungStore";
import { supabase } from "@/integrations/supabase/client";

const invokeMock = vi.mocked(supabase.functions.invoke);
const rpcMock = vi.mocked((supabase as unknown as { rpc: (...a: unknown[]) => unknown }).rpc);

/** Alle Aufrufe der Folgemail an Christian. */
const folgemails = () =>
  invokeMock.mock.calls.filter(
    ([name, opts]) =>
      name === "send-transactional-email" &&
      (opts as { body?: { templateName?: string } })?.body?.templateName === "rechnung-bezahlt-nutzer-anlegen",
  );

function baueBewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "test-bewerber-1",
    vorname: "Max",
    nachname: "Muster",
    email: "max@example.com",
    telefon: "",
    ort: "",
    quelle: "",
    beworben: "",
    stelleId: "",
    stelleTitel: "",
    status: "Rechnung",
    bewertung: 0,
    erstelltAm: new Date().toISOString(),
    typ: "", typLabel: "", typBeschreibung: "", typEignung: "", erfahrung: "",
    motivation: "", notizen: "", ziele: "", beschaeftigungsart: "", onboardingTerminId: "",
    lebenslaufUrl: "", dokumente: [], vertragStatus: "unterschrieben", vertragDatum: "",
    benachrichtigungen: [], chatVerknuepft: false,
    paketwahl: "junior", zahlungsweise: "einmal",
    vertragPdfUrl: "", vertragSignedPdfUrl: "https://example.com/vertrag.pdf",
    rechnungLexBelegNr: "", rechnungZahlungsdatum: "",
    rechnungBezahltBestaetigungen: [], rechnungBezahltAm: "",
    ...teil,
  } as Bewerber;
}

beforeEach(() => {
  updateBewerberMock.mockClear();
  invokeMock.mockClear();
});

describe("RechnungsTab (Zahlungsstatus)", () => {
  it("zeigt das Gate, solange kein unterschriebener Vertrag vorliegt", () => {
    render(
      <RechnungsTab
        bewerber={baueBewerber({ vertragStatus: "nicht_gesendet", vertragSignedPdfUrl: "" })}
        canEdit={true}
        currentUserName="Christian"
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText(/Zahlungsstatus noch nicht verfügbar/)).toBeInTheDocument();
    expect(screen.queryByText(/Weiter zur Aktivierung/)).not.toBeInTheDocument();
  });

  /*
   * Ohne Lead-Paket ist nichts bezahlt worden: "Weiter zur Aktivierung" setzt
   * nur die Freigabemarke, schiebt keinen Status und schickt keine Folgemail.
   * Bis zum 23.09.2026 ging von hier dieselbe Mail hinaus wie nach einer
   * echten Zahlung.
   */
  it("ohne Lead-Paket: Hinweis und 'Weiter zur Aktivierung' setzt nur die Freigabemarke, ohne Folgemail", () => {
    render(
      <RechnungsTab
        bewerber={baueBewerber()}
        canEdit={true}
        currentUserName="Christian"
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText(/Kein Lead-Paket gewählt, keine Zahlung offen\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Weiter zur Aktivierung/ }));

    expect(updateBewerberMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateBewerberMock.mock.calls[0];
    expect(payload.status).toBeUndefined();
    expect(payload.rechnungBezahltAm).toBeTruthy();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("mit Lead-Paket: zeigt Betrag und Anzahl, Bestätigen erst nach externem Versand", () => {
    render(
      <RechnungsTab
        bewerber={baueBewerber({ leadPaket: { betrag: 2500, anzahl: 20 } })}
        canEdit={true}
        currentUserName="Christian"
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText(/Lead-Paket: 2\.500\s*€ \/ 20 Leads/)).toBeInTheDocument();
    // Ohne externen Versand ist der Bestaetigen-Knopf gesperrt.
    const knopf = screen.getByRole("button", { name: /Erst Rechnung extern versenden/ });
    expect(knopf).toBeDisabled();
  });

  it("Admin-Vorschau: zeigt den Inhalt trotz fehlender Voraussetzungen mit Hinweisstreifen", () => {
    render(
      <RechnungsTab
        bewerber={baueBewerber({
          vertragStatus: "nicht_gesendet",
          vertragSignedPdfUrl: "",
          leadPaket: { betrag: 2500, anzahl: 20 },
        })}
        canEdit={true}
        currentUserName="Christian"
        onRefresh={() => {}}
        adminVorschau={true}
      />,
    );
    expect(screen.getByText(/Vorschau als Administrator/)).toBeInTheDocument();
    expect(screen.getByText(/der unterschriebene Vertrag noch nicht vorliegt/)).toBeInTheDocument();
    expect(screen.queryByText(/Zahlungsstatus noch nicht verfügbar/)).not.toBeInTheDocument();
    // Inhalt und Aktionen sind da
    expect(screen.getByText(/Lead-Paket: 2\.500\s*€ \/ 20 Leads/)).toBeInTheDocument();
  });

  it("Admin-Vorschau: bei erfüllten Voraussetzungen erscheint kein Hinweisstreifen", () => {
    render(
      <RechnungsTab
        bewerber={baueBewerber()}
        canEdit={true}
        currentUserName="Christian"
        onRefresh={() => {}}
        adminVorschau={true}
      />,
    );
    expect(screen.queryByText(/Vorschau als Administrator/)).not.toBeInTheDocument();
  });

  it("mit Lead-Paket in Rechnung: Bestätigen setzt bezahlt, rückt nach Nutzer anlegen und schickt die Folgemail", () => {
    render(
      <RechnungsTab
        bewerber={baueBewerber({
          leadPaket: { betrag: 2500, anzahl: 20 },
          rechnungExternErstelltVersendet: true,
          rechnungExternErstelltVersendetAm: new Date().toISOString(),
        })}
        canEdit={true}
        currentUserName="Christian"
        onRefresh={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Zahlungseingang bestätigen/ }));

    expect(updateBewerberMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateBewerberMock.mock.calls[0];
    expect(payload.status).toBe("Nutzer_anlegen");
    expect(payload.rechnungBezahltAm).toBeTruthy();
    expect(payload.rechnungBezahltBestaetigungen).toHaveLength(1);
    expect(payload.rechnungBezahltBestaetigungen[0].name).toBe("Christian");

    const mails = folgemails();
    expect(mails).toHaveLength(1);
    const body = (mails[0][1] as { body: { recipientEmail: string; templateData: Record<string, unknown> } }).body;
    expect(body.recipientEmail).toBe("c.peetz@more.immo");
    expect(body.templateData.leadPaketBetragFormatiert).toMatch(/^2\.500\s€$/);
    expect(body.templateData.leadAnzahl).toBe(20);
  });

  it("mit Lead-Paket: nach der bestätigten Zahlung legt die Datenbank das Leadpaket aus der Bewerbung an", async () => {
    rpcMock.mockClear();
    const b = baueBewerber({
      leadPaket: { betrag: 2500, anzahl: 20 },
      rechnungExternErstelltVersendet: true,
      rechnungExternErstelltVersendetAm: new Date().toISOString(),
    });
    render(<RechnungsTab bewerber={b} canEdit={true} currentUserName="Christian" onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Zahlungseingang bestätigen/ }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("lead_paket_aus_bewerbung", { _bewerbung_id: b.id }));
  });

  it("mit Lead-Paket, aber nicht mehr in Rechnung: bezahlt ohne Statussprung und ohne Folgemail", () => {
    render(
      <RechnungsTab
        bewerber={baueBewerber({
          status: "Nutzer_anlegen",
          leadPaket: { betrag: 2500, anzahl: 20 },
          rechnungExternErstelltVersendet: true,
          rechnungExternErstelltVersendetAm: new Date().toISOString(),
        })}
        canEdit={true}
        currentUserName="Christian"
        onRefresh={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Zahlungseingang bestätigen/ }));

    const [, payload] = updateBewerberMock.mock.calls[0];
    expect(payload.status).toBeUndefined();
    expect(payload.rechnungBezahltAm).toBeTruthy();
    expect(folgemails()).toHaveLength(0);
  });
});
