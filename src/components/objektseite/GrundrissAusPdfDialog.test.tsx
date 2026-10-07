import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { EinheitUnterlage } from "@/lib/objektUnterlagenRegeln";
import type { GrundrissUebernahme } from "@/lib/grundrissAusPdf";

/**
 * „Grundriss aus PDF übernehmen“ im Reiter Dokumente: Knopf nur bei PDFs und
 * nur für Admin und Inhaber, Seite und Einheit wählen, Speichern mit Name und
 * Ziel, die Rückfrage vor dem Ersetzen. pdf.js und das Speichern sind
 * nachgebaut, die Namensregel ist die echte.
 */

const speicher = vi.hoisted(() => ({
  resolveUnterlagenUrl: vi.fn(async (zeiger: string) => `https://x.supabase.co/storage/v1/object/sign/objekt-dokumente${zeiger}?token=t`),
  unterlageHerunterladen: vi.fn(),
  adresseHerunterladen: vi.fn(),
}));
vi.mock("@/lib/storage", () => speicher);
const meldung = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: meldung }));
const nutzer = vi.hoisted(() => ({ rolle: "admin" as string | null }));
vi.mock("@/contexts/UserContext", () => ({
  useOptionalUser: () => (nutzer.rolle ? { user: { role: nutzer.rolle, name: "Test" } } : null),
}));
vi.mock("@/lib/dokumentFreigabeStore", () => ({ setzeKundenFreigabe: vi.fn(), FREIGABE_MIGRATION: "20260923170000_dokument_kundenfreigabe" }));
vi.mock("@/lib/appConfigStore", () => ({ getAppConfig: (_s: string, rueckfall: unknown) => rueckfall, setAppConfig: vi.fn() }));
const bestaetigen = vi.hoisted(() => vi.fn());
vi.mock("@/lib/confirm", () => ({ confirmDialog: bestaetigen }));

const pdf = vi.hoisted(() => ({
  quelle: {
    seiten: 12,
    zeichnen: vi.fn(async (_seite: number, _kante: number) => ({ toDataURL: () => "data:image/jpeg;base64,AAAA", width: 1, height: 1 })),
    schliessen: vi.fn(),
  },
}));
const uebernahmeLogik = vi.hoisted(() => ({
  pdfOeffnen: vi.fn(async () => pdf.quelle),
  seiteAlsBild: vi.fn(async () => ({ blob: new Blob(["png"]), endung: "png" })),
  grundrissAusPdfSpeichern: vi.fn(async (e: { name: string }) => ({ ok: true, name: e.name })),
  uebernommeneGrundrisseFuer: vi.fn(() => [] as Array<{ id: string; name: string }>),
}));
vi.mock("@/lib/grundrissAusPdf", async (orig) => ({ ...(await orig<typeof import("@/lib/grundrissAusPdf")>()), ...uebernahmeLogik }));

const { DokumenteAnsicht } = await import("./DokumenteAnsicht");
const { GrundrissAusPdfDialog } = await import("./GrundrissAusPdfDialog");

const UEBERNAHME: GrundrissUebernahme = { objektId: "o1", einheiten: [{ id: "w7", weNr: "WE 7" }, { id: "w8", weNr: "WE 8" }] };

function dok(name: string, url: string, teil: Partial<EinheitUnterlage> = {}): EinheitUnterlage {
  return { id: `d-${name}`, name, url, art: "Objektunterlagen", kundeSieht: true, ...teil };
}
const TE = dok("Teilungserklärung mit Aufteilungsplan", "/objekt-dokument/objekte/o1/dokumente/te.pdf");

function zeigeReiter(eintrag: EinheitUnterlage, optionen: { uebernahme?: GrundrissUebernahme | null; bereich?: "objekt" | "wohnung"; kundenModus?: boolean } = {}) {
  const uebernahme = optionen.uebernahme === null ? undefined : optionen.uebernahme ?? UEBERNAHME;
  return render(
    <DokumenteAnsicht
      bereiche={[{ schluessel: optionen.bereich ?? "objekt", titel: "Dokumente", eintraege: [eintrag] }]}
      grundrissUebernahme={uebernahme}
      kundenModus={optionen.kundenModus}
      adresseLaden={async () => null}
    />,
  );
}

const knopf = () => screen.queryByTestId("grundriss-aus-pdf-knopf");

beforeEach(() => {
  vi.clearAllMocks();
  nutzer.rolle = "admin";
  uebernahmeLogik.uebernommeneGrundrisseFuer.mockReturnValue([]);
});

describe("Knopf „Grundriss aus PDF übernehmen“", () => {
  it.each(["admin", "inhaber"])("steht für %s bei einer PDF", (rolle) => {
    nutzer.rolle = rolle;
    zeigeReiter(TE);
    expect(knopf()).toHaveTextContent("Grundriss aus PDF übernehmen");
  });

  it.each(["vertriebsleiter", "objektpartner", "backoffice", "vertriebspartner"])("fehlt für %s, auch wenn die Rolle Dokumente freigeben darf", (rolle) => {
    nutzer.rolle = rolle;
    zeigeReiter(TE);
    expect(knopf()).toBeNull();
  });

  it("fehlt bei Bildern, bei Dateien auf fremden Servern, in der Kundenansicht und ohne Angaben zum Objekt", () => {
    zeigeReiter(dok("Grundriss WE 7", "/objekt-dokument/objekte/o1/dokumente/g.png"));
    expect(knopf()).toBeNull();
    document.body.innerHTML = "";
    zeigeReiter(dok("Exposé Bauträger", "https://tool.investagon.com/files/expose.pdf"));
    expect(knopf()).toBeNull();
    document.body.innerHTML = "";
    zeigeReiter({ ...TE, kundeSieht: true }, { kundenModus: true });
    expect(knopf()).toBeNull();
    document.body.innerHTML = "";
    zeigeReiter(TE, { uebernahme: null });
    expect(knopf()).toBeNull();
  });

  it("öffnet den Dialog und lädt die PDF über die befristete Adresse", async () => {
    zeigeReiter(TE);
    fireEvent.click(knopf()!);
    const dialog = await screen.findByTestId("grundriss-aus-pdf");
    expect(dialog).toHaveTextContent("Aus: Teilungserklärung mit Aufteilungsplan");
    await waitFor(() => expect(uebernahmeLogik.pdfOeffnen).toHaveBeenCalledWith("https://x.supabase.co/storage/v1/object/sign/objekt-dokumente/objekt-dokument/objekte/o1/dokumente/te.pdf?token=t"));
    expect(speicher.resolveUnterlagenUrl).toHaveBeenCalledWith(TE.url);
    expect(await within(dialog).findByAltText("Seite 1 von 12")).toBeInTheDocument();
  });

  it("belegt auf der Einheitsseite bei einer Wohnungsunterlage die Einheit vor, bei einer Objektunterlage ebenfalls die der Seite", async () => {
    const mitSeite = { ...UEBERNAHME, wohnungId: "w8" };
    zeigeReiter({ ...TE, art: "Wohnungsunterlagen" }, { bereich: "wohnung", uebernahme: mitSeite });
    fireEvent.click(knopf()!);
    const dialog = await screen.findByTestId("grundriss-aus-pdf");
    expect((within(dialog).getByLabelText("Grundriss für") as HTMLSelectElement).value).toBe("w8");
  });
});

describe("Dialog: Seite und Einheit wählen", () => {
  async function oeffne(props: Partial<Parameters<typeof GrundrissAusPdfDialog>[0]> = {}) {
    const onOpenChange = vi.fn();
    render(<GrundrissAusPdfDialog offen onOpenChange={onOpenChange} quelle={{ name: TE.name, url: TE.url }} uebernahme={UEBERNAHME} {...props} />);
    const dialog = await screen.findByTestId("grundriss-aus-pdf");
    await within(dialog).findByAltText("Seite 1 von 12");
    return { dialog, onOpenChange };
  }
  const auswahl = (dialog: HTMLElement) => within(dialog).getByLabelText("Grundriss für") as HTMLSelectElement;
  const speichernKnopf = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Als Grundriss speichern" });

  it("blättert Seite für Seite und springt über die Seitenzahl, gezeichnet wird nur die sichtbare Seite", async () => {
    const { dialog } = await oeffne();
    expect(within(dialog).getByRole("button", { name: /Zurück/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Weiter/ }));
    expect(await within(dialog).findByAltText("Seite 2 von 12")).toBeInTheDocument();
    const feld = within(dialog).getByLabelText("Seitenzahl");
    fireEvent.change(feld, { target: { value: "12" } });
    fireEvent.keyDown(feld, { key: "Enter" });
    expect(await within(dialog).findByAltText("Seite 12 von 12")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Weiter/ })).toBeDisabled();
    expect(pdf.quelle.zeichnen.mock.calls.map((c) => c[0])).toEqual([1, 2, 12]);
  });

  it("belegt bei einer Unterlage an der Einheit diese Einheit vor", async () => {
    const { dialog } = await oeffne({ vorbelegteWohnungId: "w7" });
    expect(auswahl(dialog).value).toBe("w7");
    expect(dialog).toHaveTextContent("Gespeichert als „Grundriss WE 7“ bei den Unterlagen dieser Einheit.");
    expect(speichernKnopf(dialog)).toBeEnabled();
  });

  it("bietet bei einer Unterlage am Objekt alle Einheiten und das ganze Haus an und speichert erst nach der Wahl", async () => {
    const { dialog } = await oeffne();
    expect(auswahl(dialog).value).toBe("");
    expect(speichernKnopf(dialog)).toBeDisabled();
    expect(Array.from(auswahl(dialog).options).map((o) => o.textContent)).toEqual(["Einheit wählen", "WE 7", "WE 8", "Ganzes Haus (Hausplan)"]);
    fireEvent.change(auswahl(dialog), { target: { value: "haus" } });
    expect(dialog).toHaveTextContent("Gespeichert als „Grundriss Haus“ bei den Unterlagen zum Objekt.");
    expect(speichernKnopf(dialog)).toBeEnabled();
  });

  it("speichert die gewählte Seite unter dem Namen der gewählten Einheit und schließt", async () => {
    const { dialog, onOpenChange } = await oeffne();
    fireEvent.click(within(dialog).getByRole("button", { name: /Weiter/ }));
    await within(dialog).findByAltText("Seite 2 von 12");
    fireEvent.change(auswahl(dialog), { target: { value: "w8" } });
    fireEvent.click(speichernKnopf(dialog));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(uebernahmeLogik.seiteAlsBild).toHaveBeenCalledWith(pdf.quelle, 2);
    expect(uebernahmeLogik.grundrissAusPdfSpeichern).toHaveBeenCalledWith(expect.objectContaining({
      objektId: "o1", ziel: { art: "einheit", wohnungId: "w8", weNr: "WE 8" }, name: "Grundriss WE 8", ersetzen: [],
    }));
    expect(bestaetigen).not.toHaveBeenCalled();
    expect(meldung.success).toHaveBeenCalledWith("„Grundriss WE 8“ ist gespeichert und erscheint im Exposé.");
  });

  it("fragt vor dem Ersetzen eines schon übernommenen Plans: ersetzen", async () => {
    uebernahmeLogik.uebernommeneGrundrisseFuer.mockReturnValue([{ id: "alt", name: "Grundriss WE 7" }]);
    bestaetigen.mockResolvedValueOnce(true);
    const { dialog } = await oeffne({ vorbelegteWohnungId: "w7" });
    fireEvent.click(speichernKnopf(dialog));
    await waitFor(() => expect(uebernahmeLogik.grundrissAusPdfSpeichern).toHaveBeenCalled());
    expect(bestaetigen).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Ersetzen", cancelText: "Zusätzlich speichern" }));
    expect(uebernahmeLogik.grundrissAusPdfSpeichern).toHaveBeenCalledWith(expect.objectContaining({ name: "Grundriss WE 7", ersetzen: [{ id: "alt", name: "Grundriss WE 7" }] }));
  });

  it("fragt vor dem Ersetzen eines schon übernommenen Plans: zusätzlich, mit eigenem Namen", async () => {
    uebernahmeLogik.uebernommeneGrundrisseFuer.mockReturnValue([{ id: "alt", name: "Grundriss WE 7" }]);
    bestaetigen.mockResolvedValueOnce(false);
    const { dialog } = await oeffne({ vorbelegteWohnungId: "w7" });
    fireEvent.click(speichernKnopf(dialog));
    await waitFor(() => expect(uebernahmeLogik.grundrissAusPdfSpeichern).toHaveBeenCalled());
    expect(uebernahmeLogik.grundrissAusPdfSpeichern).toHaveBeenCalledWith(expect.objectContaining({ name: "Grundriss WE 7 (2)", ersetzen: [] }));
  });

  it("meldet einen Fehler beim Speichern und bleibt offen", async () => {
    uebernahmeLogik.grundrissAusPdfSpeichern.mockResolvedValueOnce({ ok: false, text: "Das Bild ließ sich nicht speichern." } as never);
    const { dialog, onOpenChange } = await oeffne({ vorbelegteWohnungId: "w7" });
    fireEvent.click(speichernKnopf(dialog));
    await waitFor(() => expect(meldung.error).toHaveBeenCalledWith("Das Bild ließ sich nicht speichern."));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("lädt eine Datei auf einem fremden Server gar nicht erst", async () => {
    render(<GrundrissAusPdfDialog offen onOpenChange={vi.fn()} quelle={{ name: "Exposé", url: "https://tool.investagon.com/files/expose.pdf" }} uebernahme={UEBERNAHME} />);
    expect(await screen.findByText(/liegt auf einem fremden Server/)).toBeInTheDocument();
    expect(speicher.resolveUnterlagenUrl).not.toHaveBeenCalled();
    expect(uebernahmeLogik.pdfOeffnen).not.toHaveBeenCalled();
  });
});
