/**
 * „Meeting erstellen" ohne Zoom.
 *
 * Befund vom 29.09.2026: Ein Vertriebspartner fuellte Thema, Datum, Uhrzeit
 * und „Gehört zu" aus, und der Knopf blieb grau. Ursache war die Bedingung
 * `disabled={loading || (!zoomLoading && !zoomConnected)}`: Ohne verbundenes
 * Zoom-Profil liess sich nie speichern. Seitdem traegt der Dialog nur noch den
 * Termin ein, Zoom kommt darin nicht mehr vor.
 *
 * Aelter (21.09.2026) und weiter gueltig: Die Auswahl „Gehört zu" wird direkt
 * an `onCreated` weitergereicht, nicht ueber einen Zustand im Aufrufer.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const spione = vi.hoisted(() => ({
  invoke: vi.fn(),
  getInvestmentsByKontakt: vi.fn(),
}));

// Falls doch wieder etwas eine Function aufruft, soll der Test es sehen.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: spione.invoke }, from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentsByKontakt: spione.getInvestmentsByKontakt,
}));

vi.mock("@/lib/eigeneBuchungslinks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/eigeneBuchungslinks")>()),
  useEigeneBuchungslinks: () => ({ links: {}, laedt: false }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import { MeetingErstellenDialog } from "./MeetingErstellenDialog";

function zeige(props: Partial<React.ComponentProps<typeof MeetingErstellenDialog>> = {}) {
  const onCreated = props.onCreated ?? vi.fn();
  const onOpenChange = props.onOpenChange ?? vi.fn();
  render(
    <MemoryRouter>
      <MeetingErstellenDialog
        open
        kontaktId="k1"
        defaultTopic="Erstgespräch"
        defaultDate="2026-10-01"
        defaultTime="17:30"
        {...props}
        onCreated={onCreated}
        onOpenChange={onOpenChange}
      />
    </MemoryRouter>,
  );
  return { onCreated, onOpenChange };
}

const speichern = () => fireEvent.click(screen.getByRole("button", { name: /^Meeting erstellen$/i }));

describe("Meeting erstellen: ohne Zoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spione.getInvestmentsByKontakt.mockReturnValue([
      { id: "inv-1", nummer: 1, objektTitel: "Investment 1" },
      { id: "inv-2", nummer: 2, objektTitel: "Beispielweg 7" },
    ]);
  });

  it("speichert mit den Pflichtfeldern, ohne Zoom-Verbindung und ohne Function", async () => {
    const { onCreated, onOpenChange } = zeige();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "inv-1" } });
    const knopf = screen.getByRole("button", { name: /^Meeting erstellen$/i });
    expect(knopf).not.toBeDisabled();
    speichern();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith(
      { thema: "Erstgespräch", datum: "2026-10-01", uhrzeit: "17:30", dauer: 60, agenda: "" },
      "inv-1",
    );
    expect(spione.invoke).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("zeigt im Dialog kein Wort Zoom", () => {
    zeige();
    expect(document.body.textContent || "").not.toMatch(/zoom/i);
    expect(screen.queryByText(/Jetzt verbinden/i)).toBeNull();
  });

  it("enthaelt im Quelltext keine Zoom-Anbindung mehr", () => {
    const quelle = readFileSync(path.resolve(__dirname, "./MeetingErstellenDialog.tsx"), "utf8");
    expect(quelle).not.toMatch(/useZoomConnection|useZoomFeatureAccess|zoom-integration|zoomConnected/);
  });

  it("bleibt offen, wenn das Speichern im Aufrufer scheitert", async () => {
    const onCreated = vi.fn().mockResolvedValue(false);
    const { onOpenChange } = zeige({ onCreated, investmentIdVorauswahl: "inv-1" });
    speichern();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("legt ohne Uhrzeit nichts an", async () => {
    const { onCreated } = zeige({ defaultTime: "", investmentIdVorauswahl: "inv-1" });
    speichern();
    await new Promise((r) => setTimeout(r, 0));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("legt ohne Zuordnung kein Meeting an, solange es Investments gibt", async () => {
    const { onCreated } = zeige();
    speichern();
    await new Promise((r) => setTimeout(r, 0));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("übernimmt die Vorauswahl sichtbar und lässt sie umstellen", async () => {
    const { onCreated } = zeige({ investmentIdVorauswahl: "inv-1" });
    const auswahl = screen.getByRole("combobox") as HTMLSelectElement;
    expect(auswahl.value).toBe("inv-1");
    fireEvent.change(auswahl, { target: { value: "inv-2" } });
    speichern();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ thema: "Erstgespräch" }), "inv-2");
  });

  it("gibt ohne Investments keine Zuordnung mit", async () => {
    spione.getInvestmentsByKontakt.mockReturnValue([]);
    const { onCreated } = zeige();
    expect(screen.queryByText("Gehört zu *")).toBeNull();
    speichern();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith(expect.any(Object), undefined);
  });

  it("markiert die Pflichtfelder und nicht die Agenda", () => {
    zeige();
    expect(screen.getByText("Agenda (optional)")).toBeInTheDocument();
    expect(screen.getByText("Thema *")).toBeInTheDocument();
    expect(screen.getByText("Datum *")).toBeInTheDocument();
    expect(screen.getByText("Uhrzeit *")).toBeInTheDocument();
    expect(screen.getByText("Gehört zu *")).toBeInTheDocument();
  });
});

/*
 * Die zweite Hälfte des Weges liegt im Kundenprofil. `KundenDetail.tsx` ist zu
 * groß, um sie im Test zu rendern, deshalb wird der Quelltext geprüft.
 *
 * Der Dialog ist der einzige Weg zu einem Meeting für alle ohne
 * Videocall-Freigabe. Verschwindet er, fällt für einen Teil der Mannschaft das
 * Anlegen eines Termins ersatzlos aus, und genau das soll auffallen.
 */
describe("Kundenprofil: der Einbauort legt Termin und Aufgabe an", () => {
  const quelle = readFileSync(path.resolve(__dirname, "../../pages/KundenDetail.tsx"), "utf8");
  const einbau = quelle.slice(quelle.indexOf("<MeetingErstellenDialog"));

  it("hat genau einen Einbauort", () => {
    expect(quelle.split("<MeetingErstellenDialog").length - 1).toBe(1);
  });

  it("schreibt ein Meeting in die Kundenakte und die Zuordnung in die Aufgabe", () => {
    expect(einbau).toMatch(/onCreated=\{async \(m, gewaehltesInvestment\) =>/);
    expect(einbau).toMatch(/art: "meeting"/);
    expect(einbau).toContain("investmentId: gewaehltesInvestment,");
  });

  it("schreibt keine Zoom-Daten mehr", () => {
    const block = einbau.slice(0, einbau.indexOf("\n        />\n"));
    expect(block).not.toMatch(/zoomMeeting|join_url|zoomLink|Zoom-Meeting/);
  });

  it("zeigt die vier Buchungskalender auch in dieser Maske", () => {
    const dialog = readFileSync(path.resolve(__dirname, "./MeetingErstellenDialog.tsx"), "utf8");
    expect(dialog).toContain("<BuchungskalenderListe");
    expect(dialog).toContain("links={eigeneKalender}");
    expect(dialog).toContain("kontaktId={kontaktId}");
  });

  it("gibt der Karte im Investment-Reiter ihr Investment mit", () => {
    expect(quelle).toContain("renderSetterSkriptSection = (investmentId?: string)");
    expect(quelle).toContain("renderSetterSkriptSection(inv.id)");
  });
});
