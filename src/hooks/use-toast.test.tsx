import { describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => {
  const fn = vi.fn(() => "id-1") as unknown as ((...a: unknown[]) => string) & { error: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> };
  fn.error = vi.fn(() => "id-2");
  fn.dismiss = vi.fn();
  return fn;
});
vi.mock("sonner", () => ({ toast: sonner }));

import { toast } from "./use-toast";

describe("use-toast als Weiche auf Sonner (A5)", () => {
  it("normale Meldung mit Beschreibung", () => {
    toast({ title: "Gespeichert", description: "Alles da" });
    expect(sonner).toHaveBeenCalledWith("Gespeichert", { description: "Alles da" });
  });

  it("Fehler als Fehlermeldung", () => {
    toast({ title: "Nicht gespeichert", variant: "destructive" });
    expect(sonner.error).toHaveBeenCalledWith("Nicht gespeichert", {});
  });

  it("macht aus dem Knopf eine Aktion wie „Rückgängig“", () => {
    const klick = vi.fn();
    toast({ title: "Erledigt", duration: 8000, action: <button onClick={klick}>Rückgängig</button> });
    const optionen = (sonner as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1] as { duration: number; action: { label: string; onClick: (e: unknown) => void } };
    expect(optionen.duration).toBe(8000);
    expect(optionen.action.label).toBe("Rückgängig");
    optionen.action.onClick({});
    expect(klick).toHaveBeenCalled();
  });
});
