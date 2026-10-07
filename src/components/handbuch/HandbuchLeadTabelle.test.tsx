import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { KundeData } from "@/lib/kundenStore";
import type { LeadStandZeile, StandLaden } from "@/lib/handbuch/leadStand";

const ladeLeadStaende = vi.fn<(ids: string[]) => Promise<StandLaden>>();
vi.mock("@/lib/handbuch/leadStand", async (original) => ({
  ...(await original<typeof import("@/lib/handbuch/leadStand")>()),
  ladeLeadStaende: (ids: string[]) => ladeLeadStaende(ids),
}));

import HandbuchLeadTabelle, { STAND_NEU_LADEN_MS } from "./HandbuchLeadTabelle";

const lead = { id: "k1", vorname: "Anna", nachname: "Müller", erstellt_am: "2026-09-26T08:00:00Z" } as KundeData;
const zeile = (saUnterschrieben: boolean): LeadStandZeile => ({
  kontaktId: "k1",
  handbuchAm: null,
  geoeffnetAm: null,
  pdfAm: null,
  saGeoeffnetAm: null,
  saUnterschrieben,
  saPdfImInvestment: saUnterschrieben,
});
const antwort = (saUnterschrieben: boolean): StandLaden => ({ status: "ok", zeilen: new Map([["k1", zeile(saUnterschrieben)]]) });

function tabelle(props: { aktualisierung?: number; loeschenErlaubt?: boolean } = {}) {
  return (
    <HandbuchLeadTabelle
      leads={[lead]}
      laedt={false}
      aktualisierung={props.aktualisierung}
      zuweisenErlaubt
      loeschenErlaubt={props.loeschenErlaubt ?? true}
      onOeffnen={() => {}}
      onZuweisen={() => {}}
      onLoeschen={() => {}}
    />
  );
}

async function ruhe() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("HandbuchLeadTabelle: der Stand bleibt aktuell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ladeLeadStaende.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lädt auf „Aktualisieren“ neu, obwohl sich die Leads nicht ändern", async () => {
    ladeLeadStaende.mockResolvedValueOnce(antwort(false)).mockResolvedValueOnce(antwort(true));
    const { rerender } = render(tabelle({ aktualisierung: 0 }));
    await ruhe();
    expect(screen.getByText("0 mit Selbstauskunft")).toBeTruthy();

    rerender(tabelle({ aktualisierung: 1 }));
    await ruhe();
    expect(ladeLeadStaende).toHaveBeenCalledTimes(2);
    expect(screen.getByText("1 mit Selbstauskunft")).toBeTruthy();
  });

  it("lädt im Abstand und beim Zurückkehren in den Tab nach, nicht im Sekundentakt", async () => {
    ladeLeadStaende.mockResolvedValue(antwort(false));
    render(tabelle());
    await ruhe();
    expect(ladeLeadStaende).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(ladeLeadStaende).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(STAND_NEU_LADEN_MS);
    });
    expect(ladeLeadStaende).toHaveBeenCalledTimes(2);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(ladeLeadStaende).toHaveBeenCalledTimes(3);
  });

  it("ein Fehler beim Nachladen wirft den bekannten Stand nicht weg", async () => {
    ladeLeadStaende.mockResolvedValueOnce(antwort(true)).mockResolvedValueOnce({ status: "fehler" });
    const { rerender } = render(tabelle({ aktualisierung: 0 }));
    await ruhe();
    rerender(tabelle({ aktualisierung: 1 }));
    await ruhe();
    expect(screen.getByText("1 mit Selbstauskunft")).toBeTruthy();
  });

  it("zeigt den Papierkorb-Knopf nur, wenn Löschen erlaubt ist", async () => {
    ladeLeadStaende.mockResolvedValue(antwort(false));
    const { rerender } = render(tabelle({ loeschenErlaubt: true }));
    await ruhe();
    expect(screen.getByLabelText("Anna Müller in den Papierkorb")).toBeTruthy();
    rerender(tabelle({ loeschenErlaubt: false }));
    expect(screen.queryByLabelText("Anna Müller in den Papierkorb")).toBeNull();
  });
});
