import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

import { antwortOhneFunction, chatBenachrichtigungAnstossen } from "./chatBenachrichtigungAnstossen";

beforeEach(() => { invoke.mockReset(); });

describe("Glocke und Mail nach dem Senden anstossen", () => {
  it("ruft die Function mit genau der gesendeten Nachricht auf", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(chatBenachrichtigungAnstossen("n-1")).resolves.toBe("uebernommen");
    expect(invoke).toHaveBeenCalledWith("chat-benachrichtigung", { body: { nachrichtId: "n-1" } });
  });

  it("ist die Function noch nicht ausgerollt, meldet es das, damit der Browser die Erwaehnung uebernimmt", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "not found", context: { status: 404 } } });
    await expect(chatBenachrichtigungAnstossen("n-1")).resolves.toBe("nicht_erreichbar");
  });

  it("hat die Function gearbeitet und dann gescheitert, springt der Browser nicht ein (keine doppelte Glocke)", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "boom", context: { status: 500 } } });
    await expect(chatBenachrichtigungAnstossen("n-1")).resolves.toBe("fehler");
  });

  it("wirft nie, auch wenn der Aufruf selbst zerbricht", async () => {
    invoke.mockImplementation(() => { throw new Error("offline"); });
    await expect(chatBenachrichtigungAnstossen("n-1")).resolves.toBe("nicht_erreichbar");
  });

  it("ohne Kennung wird gar nichts aufgerufen", async () => {
    await expect(chatBenachrichtigungAnstossen("")).resolves.toBe("fehler");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("wertet nur 404 oder keine Antwort als fehlende Function", () => {
    expect(antwortOhneFunction({ context: { status: 404 } })).toBe(true);
    expect(antwortOhneFunction({ context: {} })).toBe(true);
    expect(antwortOhneFunction({ context: { status: 403 } })).toBe(false);
  });
});
