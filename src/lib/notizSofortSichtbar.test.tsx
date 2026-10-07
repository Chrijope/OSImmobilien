import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Christians Frage vom 16.09.2026: Erscheint eine frisch geschriebene Notiz
 * sofort in der Aktivitaetenliste, ohne die Seite neu zu laden?
 *
 * Geprueft wird genau die Kette, die im Kundenprofil laeuft:
 * `addAktivitaet` schreibt ueber `cacheInsert` in die Datenbank, der
 * Zwischenspeicher meldet den Neuzugang, und `useLiveData` zeichnet neu.
 * `KundenDetail.tsx` haengt mit derselben Zeile daran
 * (`useLiveData("aktivitaeten", r => r.kunde_id === id)`), der alte Setter
 * `setAktivitaeten` ist dort seit dem Umbau bewusst ein Leerlauf.
 */

const state = vi.hoisted(() => ({
  eingefuegt: [] as Record<string, unknown>[],
  /** Fehlermeldung, mit der die Datenbank antworten soll. */
  fehler: null as string | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        if (state.fehler) return { error: { message: state.fehler } };
        state.eingefuegt.push(row);
        return { error: null };
      },
    }),
    auth: { getUser: async () => ({ data: { user: { id: "u-vp" } } }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}));

const toastFehler = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastFehler, success: vi.fn() } }));

import { addAktivitaet } from "@/lib/aktivitaetenStore";
import { useLiveData } from "@/hooks/useLiveData";

function Verlauf({ kundeId }: { kundeId: string }) {
  const zeilen = useLiveData<{ id: string; kunde_id: string; beschreibung: string }>(
    "aktivitaeten",
    (r) => r.kunde_id === kundeId,
  );
  return (
    <ul>
      {zeilen.map((z) => (
        <li key={z.id}>{z.beschreibung}</li>
      ))}
    </ul>
  );
}

describe("Neue Notiz steht ohne Neuladen im Verlauf", () => {
  beforeEach(() => {
    state.eingefuegt = [];
    state.fehler = null;
    toastFehler.mockClear();
  });

  it("zeigt die Notiz, sobald die Datenbank bestaetigt hat", async () => {
    render(<Verlauf kundeId="otto-hans" />);
    expect(screen.queryByText("Rueckruf am Montag vereinbart")).toBeNull();

    addAktivitaet({
      kundeId: "otto-hans",
      art: "notiz",
      beschreibung: "Rueckruf am Montag vereinbart",
      von: "Otto Hans Betreuer",
    });

    await waitFor(() =>
      expect(screen.getByText("Rueckruf am Montag vereinbart")).toBeTruthy(),
    );
    expect(state.eingefuegt).toHaveLength(1);
  });

  it("laesst die Notiz eines anderen Kunden aus der Liste heraus", async () => {
    render(<Verlauf kundeId="otto-hans" />);
    addAktivitaet({
      kundeId: "jemand-anderes",
      art: "notiz",
      beschreibung: "Gehoert nicht hierher",
      von: "Otto Hans Betreuer",
    });
    await waitFor(() => expect(state.eingefuegt).toHaveLength(1));
    expect(screen.queryByText("Gehoert nicht hierher")).toBeNull();
  });

  it("meldet einen verlorenen Eintrag, statt ihn still zu schlucken", async () => {
    state.fehler = "permission denied";
    render(<Verlauf kundeId="otto-hans" />);
    addAktivitaet({
      kundeId: "otto-hans",
      art: "notiz",
      beschreibung: "Geht nicht durch",
      von: "Otto Hans Betreuer",
    });
    await waitFor(() => expect(toastFehler).toHaveBeenCalled());
    expect(screen.queryByText("Geht nicht durch")).toBeNull();
  });
});
