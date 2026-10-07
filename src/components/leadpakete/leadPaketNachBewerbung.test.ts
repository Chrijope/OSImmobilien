import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastMock, hinweisMock, ausBewerbungMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  hinweisMock: vi.fn().mockResolvedValue(undefined),
  ausBewerbungMock: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: toastMock }));
vi.mock("@/lib/confirm", () => ({ hinweisDialog: hinweisMock }));
vi.mock("@/lib/leadPaketStore", () => ({ leadPaketAusBewerbung: ausBewerbungMock }));

const { leadPaketNachBewerbung } = await import("./leadPaketNachBewerbung");

describe("leadPaketNachBewerbung", () => {
  beforeEach(() => {
    toastMock.mockClear();
    hinweisMock.mockClear();
  });

  it("meldet ein angelegtes Paket mit Anzahl", async () => {
    ausBewerbungMock.mockResolvedValueOnce({ ok: true, status: "angelegt", anzahl: 20 });
    await leadPaketNachBewerbung("b1", Promise.resolve());
    expect(toastMock).toHaveBeenCalledWith({ title: "Leadpaket angelegt: 20 Leads" });
    expect(hinweisMock).not.toHaveBeenCalled();
  });

  it("zeigt bei abweichender E-Mail einen Hinweis im Projektstil", async () => {
    ausBewerbungMock.mockResolvedValueOnce({ ok: true, status: "email_abweichend" });
    await leadPaketNachBewerbung("b1");
    expect(hinweisMock).toHaveBeenCalledTimes(1);
    expect(hinweisMock.mock.calls[0][0].description).toMatch(/E-Mail des verknüpften Nutzerkontos/);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("bleibt still, wenn nichts anzulegen ist, und meldet echte Fehler rot", async () => {
    ausBewerbungMock.mockResolvedValueOnce({ ok: true, status: "nicht_bezahlt" });
    await leadPaketNachBewerbung("b1");
    expect(toastMock).not.toHaveBeenCalled();
    ausBewerbungMock.mockResolvedValueOnce({ ok: false, meldung: "Keine Verbindung zum Server." });
    await leadPaketNachBewerbung("b1", Promise.reject(new Error("speichern")));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Leadpaket nicht angelegt", variant: "destructive" }));
  });
});
