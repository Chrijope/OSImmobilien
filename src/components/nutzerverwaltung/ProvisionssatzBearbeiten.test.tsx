import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/*
 * Lead- und Eigen-Satz im Nutzerprofil (15.10.2026): nur admin/inhaber
 * bearbeiten, Komma erlaubt, nach dem Speichern wird nachgelesen.
 */

const zustand = {
  rpcAufrufe: [] as Array<{ name: string; args: any }>,
  gespeichert: {} as Record<string, unknown>,
  fehler: [] as string[],
  erfolg: [] as string[],
};

vi.mock("@/integrations/supabase/client", () => {
  const abfrage = {
    select: () => abfrage,
    eq: () => abfrage,
    maybeSingle: async () => ({ data: { einstellungen: zustand.gespeichert }, error: null }),
  };
  return {
    supabase: {
      from: () => abfrage,
      rpc: async (name: string, args: any) => {
        zustand.rpcAufrufe.push({ name, args });
        return { data: null, error: null };
      },
    },
  };
});
vi.mock("sonner", () => ({
  toast: { error: (t: string) => zustand.fehler.push(t), success: (t: string) => zustand.erfolg.push(t) },
}));
vi.mock("@/lib/auditLog", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/dataCache", () => ({ cacheRefreshTable: async () => {}, cacheGet: () => [] }));

const { ProvisionssatzBearbeiten, NICHT_GESPEICHERT_TEXT } = await import("./ProvisionssatzBearbeiten");

beforeEach(() => {
  zustand.rpcAufrufe = [];
  zustand.gespeichert = {};
  zustand.fehler = [];
  zustand.erfolg = [];
});

describe("ProvisionssatzBearbeiten", () => {
  it("ist ohne aktive Rolle admin/inhaber nur Anzeige", () => {
    render(<ProvisionssatzBearbeiten userId="u-1" zielName="Partner" lead={8} eigen={12} darfBearbeiten={false} />);
    expect((screen.getByLabelText("Lead-Satz (%)") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Eigen-Satz (%)") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /Speichern/ })).toBeNull();
  });

  it("speichert „10,5“ als 10,5 und meldet Erfolg, wenn der Wert ankommt", async () => {
    zustand.gespeichert = { custom_provision_rate_setter: 10.5, custom_provision_rate_eigen: 12 };
    render(<ProvisionssatzBearbeiten userId="u-1" zielName="Partner" lead={8} eigen={12} darfBearbeiten />);
    fireEvent.change(screen.getByLabelText("Lead-Satz (%)"), { target: { value: "10,5" } });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    await waitFor(() => expect(zustand.erfolg).toContain("Provisionssätze gespeichert"));
    expect(zustand.rpcAufrufe[0].args._patch).toEqual({ custom_provision_rate_setter: 10.5, custom_provision_rate_eigen: 12 });
  });

  it("meldet, wenn der Schutz-Trigger den Wert still verworfen hat", async () => {
    zustand.gespeichert = { custom_provision_rate_setter: 8, custom_provision_rate_eigen: 12 };
    render(<ProvisionssatzBearbeiten userId="u-1" zielName="Partner" lead={8} eigen={12} darfBearbeiten />);
    fireEvent.change(screen.getByLabelText("Eigen-Satz (%)"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    await waitFor(() => expect(zustand.fehler).toContain(NICHT_GESPEICHERT_TEXT));
    expect(zustand.erfolg).toHaveLength(0);
  });

  it("sperrt Speichern bei einem Satz außerhalb von 0 bis 100", () => {
    render(<ProvisionssatzBearbeiten userId="u-1" zielName="Partner" lead={8} eigen={12} darfBearbeiten />);
    fireEvent.change(screen.getByLabelText("Lead-Satz (%)"), { target: { value: "120" } });
    expect((screen.getByRole("button", { name: /Speichern/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Bitte trag einen Provisionssatz zwischen 0 und 100 Prozent ein.")).toBeTruthy();
  });
});
