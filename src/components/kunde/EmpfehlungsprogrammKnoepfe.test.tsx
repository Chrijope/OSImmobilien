import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { KundenprofilUeberschrift } from "@/components/kunden/profil/KundenprofilStammdaten";

/*
 * Der Knopf hängt am Zwischenspeicher und an den Programmen je Investment.
 * Beides wird hier ersetzt, geprüft wird nur die Darstellung. Die Dialoge
 * fallen weg, sie sprechen mit Supabase und sind nicht Gegenstand.
 */
let kontaktMeta: Record<string, unknown> = {};
vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => [{ id: "k1", meta: kontaktMeta }],
}));
vi.mock("@/lib/empfehlungenStore", () => ({
  createProgramm: vi.fn(),
  getProgrammByInvestment: () => undefined,
}));
vi.mock("@/components/kunde/EmpfehlungsprogrammDialoge", () => ({
  EmpfehlungsprogrammDialoge: () => null,
}));

import { EmpfehlungsprogrammKnoepfe } from "./EmpfehlungsprogrammKnoepfe";

const kunde = { id: "k1", vorname: "Kambiz", nachname: "Zangeneh" };
const zeige = (role = "vertriebspartner", investments = [{ id: "i1" }]) =>
  render(
    <EmpfehlungsprogrammKnoepfe
      ueberschrift={<KundenprofilUeberschrift>Empfehlungsprogramm</KundenprofilUeberschrift>}
      kunde={kunde}
      investments={investments}
      currentUser={{ id: "u1", name: "Partner", role }}
    />,
  );

describe("Empfehlungsprogramm im Kundenprofil", () => {
  beforeEach(() => { kontaktMeta = {}; });

  it("hat eine Überschrift im Stil von Kontaktdaten", () => {
    zeige();
    const ueberschrift = screen.getByRole("heading", { level: 3, name: "Empfehlungsprogramm" });
    const vergleich = render(<KundenprofilUeberschrift>Kontaktdaten</KundenprofilUeberschrift>);
    expect(ueberschrift.className).toBe(vergleich.getByRole("heading", { name: "Kontaktdaten" }).className);
  });

  it("zeigt den Aktivieren-Knopf als Hauptaktion in der Grundfarbe", () => {
    zeige();
    const knopf = screen.getByRole("button", { name: /Empfehlungsprogramm aktivieren/ });
    expect(knopf.className).toContain("bg-primary");
    expect(knopf.className).not.toContain("bg-secondary");
  });

  it("lässt Bearbeiten und Deaktivieren leise, wenn das Programm läuft", () => {
    kontaktMeta = { empfehlungsprogramm_aktiv: true };
    zeige();
    expect(screen.queryByRole("button", { name: /Empfehlungsprogramm aktivieren/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Empfehlungsprogramm bearbeiten/ }).className).toContain("bg-secondary");
  });

  it("zeigt ohne Berechtigung weder Knopf noch Überschrift", () => {
    zeige("setterin");
    expect(screen.queryByRole("heading", { name: "Empfehlungsprogramm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("zeigt ohne Investment weder Knopf noch Überschrift", () => {
    zeige("vertriebspartner", []);
    expect(screen.queryByRole("heading", { name: "Empfehlungsprogramm" })).not.toBeInTheDocument();
  });
});
