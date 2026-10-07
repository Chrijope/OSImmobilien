import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * Kundenportal, Bereich „Bonität“, Vermerk „Kunde finanziert selbst“
 * (Christian, 05.10.2026): Bonitätscheck und Bankprüfung werden nicht
 * gebraucht. Der Kunde wird nicht zum Hochladen aufgefordert, die Listen
 * stehen eingeklappt und lassen sich zum freiwilligen Hochladen aufklappen.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn(async () => ({ error: null })) }) },
    rpc: vi.fn(),
    from: () => ({ insert: vi.fn(async () => ({ error: null })) }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/MobileScanQRDialog", () => ({ MobileScanQRDialog: () => null }));

import i18n from "@/i18n";
import { BonitaetsSection } from "./KundeInvestments";

const kontakt = { id: "k-1", vorname: "Anna", nachname: "Muster", zustaendig_id: null };

function zeige(invMeta: Record<string, unknown>) {
  return render(
    <BonitaetsSection inv={{ id: "inv-1", meta: invMeta }} invMeta={invMeta} kontakt={kontakt} kontaktMeta={{}} onRefresh={vi.fn()} />,
  );
}

const bankpruefung = () => screen.getByText("Bankprüfung");

beforeAll(async () => {
  await i18n.changeLanguage("de");
});

describe("Kundenportal, Bonität beim Selbstfinanzierer", () => {
  it("ohne Vermerk: Pflichtliste sichtbar, Aufforderung zum Hochladen", () => {
    zeige({ unterlagenFreigeschaltet: true, docStatuses: {} });
    expect(screen.getByText(/Bitte lade die folgenden Pflichtdokumente hoch/)).toBeInTheDocument();
    expect(bankpruefung()).toBeVisible();
    expect(screen.queryByRole("button", { name: /werden nicht gebraucht/ })).toBeNull();
  });

  it("mit Vermerk: eingeklappt, keine Aufforderung, freiwillig aufklappbar", () => {
    zeige({ unterlagenFreigeschaltet: true, docStatuses: {}, selbstauskunftEntfaellt: { aktiv: true } });
    expect(screen.queryByText(/Bitte lade die folgenden Pflichtdokumente hoch/)).toBeNull();
    expect(screen.getByText("Für diesen Kauf brauchen wir keine Bonitätsunterlagen von dir")).toBeInTheDocument();
    expect(bankpruefung()).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Unterlagen anzeigen, werden nicht gebraucht/ }));
    expect(bankpruefung()).toBeVisible();
    expect(screen.getByRole("button", { name: /Unterlagen wieder einklappen/ })).toBeInTheDocument();
  });

  it("die neuen Texte gibt es auf Deutsch und Englisch", () => {
    for (const schluessel of ["entfaellt_title", "entfaellt_text", "entfaellt_anzeigen", "entfaellt_einklappen"]) {
      const voll = `portal.investments.bon.${schluessel}`;
      expect(i18n.exists(voll, { lng: "de" })).toBe(true);
      expect(i18n.exists(voll, { lng: "en" })).toBe(true);
    }
  });
});
