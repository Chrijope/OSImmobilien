import { beendeSitzungenVon, sitzungenNachSperreBeenden } from "./sitzungenBeenden";
import { hinweisDialog } from "@/lib/confirm";

vi.mock("@/lib/confirm", () => ({ hinweisDialog: vi.fn(async () => {}) }));

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

/** So kommt eine Fehlerantwort (Status ab 400) aus `supabase.functions.invoke`. */
function fehlerAntwort(status: number, koerper: Record<string, unknown>) {
  const text = JSON.stringify(koerper);
  return {
    data: null,
    error: {
      name: "FunctionsHttpError",
      message: "Edge Function returned a non-2xx status code",
      context: { status, text: async () => text, clone: () => ({ text: async () => text }) },
    },
  };
}

afterEach(() => {
  invoke.mockReset();
  vi.mocked(hinweisDialog).mockClear();
});

it("ruft manage-sessions mit Ziel und Grund", async () => {
  invoke.mockResolvedValue({ data: { success: true, sitzungen: 2 }, error: null });
  await beendeSitzungenVon("u-1", "Konto gesperrt");
  expect(invoke).toHaveBeenCalledWith("manage-sessions", {
    body: { action: "admin-force-logout", targetUserId: "u-1", reason: "Konto gesperrt" },
  });
});

it("meldet „Migration ausstehend“ mit dem Text der Function statt still zu scheitern", async () => {
  invoke.mockResolvedValue(fehlerAntwort(503, { error: "Migration ausstehend: 20260926200000_naechtliche_abmeldung.sql ist noch nicht gelaufen." }));
  await expect(beendeSitzungenVon("u-1")).rejects.toThrow(/Migration ausstehend/);
});

it("meldet fehlende Rechte", async () => {
  invoke.mockResolvedValue(fehlerAntwort(403, { error: "Nicht autorisiert" }));
  await expect(beendeSitzungenVon("u-1")).rejects.toThrow("Nicht autorisiert");
});

it("meldet einen Fehler im Rumpf einer 200-Antwort", async () => {
  invoke.mockResolvedValue({ data: { error: "kaputt" }, error: null });
  await expect(beendeSitzungenVon("u-1")).rejects.toThrow("kaputt");
});

describe("Sperren", () => {
  it("zeigt einen Hinweis mit dem Grund, wenn das Abmelden scheitert", async () => {
    invoke.mockResolvedValue(fehlerAntwort(503, { error: "Migration ausstehend: 20260926200000_naechtliche_abmeldung.sql ist noch nicht gelaufen." }));
    await expect(sitzungenNachSperreBeenden("u-1", "Max Muster")).resolves.toBe(false);
    expect(hinweisDialog).toHaveBeenCalledTimes(1);
    const { title, description } = vi.mocked(hinweisDialog).mock.calls[0][0];
    expect(title).toBe("Gesperrt, aber noch nicht abgemeldet");
    expect(String(description)).toContain("Max Muster");
    expect(String(description)).toContain("Migration ausstehend");
  });

  it("zeigt keinen Hinweis, wenn das Abmelden klappt", async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await expect(sitzungenNachSperreBeenden("u-1", "Max Muster")).resolves.toBe(true);
    expect(hinweisDialog).not.toHaveBeenCalled();
  });
});
