import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Was die Dokumentenanalyse verschweigt.
 *
 * Der Lauf sammelte gescheiterte Dokumente immer schon in `failedItems`,
 * gezeigt wurde diese Liste nie. Ein unlesbares PDF verschwand lautlos, und
 * darüber stand „Analyse erfolgreich abgeschlossen“. Erst wenn alle
 * Dokumente scheiterten, gab es überhaupt eine Meldung.
 *
 * Geprüft wird deshalb die Abschlussanzeige mit einem teilweise gescheiterten
 * Lauf: Sie muss die Zahl ehrlich nennen und jede nicht gelesene Datei mit
 * Namen und Grund zeigen.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({}) }) },
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/lib/confirm", () => ({ confirmDialog: async () => true }));

const { ObjektUploadAnalyse } = await import("@/components/objekte/ObjektUploadAnalyse");
const { createEmptyUploadAnalyseRuntimeState } = await import("@/lib/objektAnalyseShared");

/** Ein abgeschlossener Lauf: zwei Dokumente gelesen, eines nicht. */
const runtime = createEmptyUploadAnalyseRuntimeState({
  runId: "r1",
  status: "completed",
  phase: "completed",
  progress: 100,
  progressText: "2 von 3 Dokumenten gelesen, 1 nicht",
  totalFiles: 3,
  partialResults: [
    { storagePath: "a", data: { titel: "Musterhaus" } },
    { storagePath: "b", data: {} },
  ],
  failedItems: [
    { name: "Teilungserklaerung.pdf", reason: "PDF konnte nicht geladen werden", stage: "analysis" },
  ],
  result: { titel: "Musterhaus" },
});

describe("Abschluss einer teilweise gescheiterten Analyse", () => {
  it("nennt die Zahl ehrlich und zeigt die nicht gelesene Datei", () => {
    render(
      <ObjektUploadAnalyse
        draftKey="entwurf-1"
        onAnalyseComplete={() => {}}
        isAdmin
        draft={{ files: [], slotFiles: {}, cloudUrl: "", result: runtime.result, runtime }}
      />,
    );

    expect(screen.getByText("2 von 3 Dokumenten gelesen, 1 nicht")).toBeInTheDocument();
    expect(screen.queryByText("Analyse erfolgreich abgeschlossen")).not.toBeInTheDocument();
    expect(screen.getByText("Teilungserklaerung.pdf")).toBeInTheDocument();
    expect(screen.getByText(/PDF konnte nicht geladen werden/)).toBeInTheDocument();
  });
});

describe("Abschluss ohne Fehlschlag", () => {
  it("meldet weiterhin schlicht Erfolg", () => {
    const sauber = { ...runtime, runId: "r2", failedItems: [], progressText: "Analyse abgeschlossen ✓" };
    render(
      <ObjektUploadAnalyse
        draftKey="entwurf-2"
        onAnalyseComplete={() => {}}
        isAdmin
        draft={{ files: [], slotFiles: {}, cloudUrl: "", result: sauber.result, runtime: sauber }}
      />,
    );

    expect(screen.getByText("Analyse erfolgreich abgeschlossen")).toBeInTheDocument();
    expect(screen.queryByText(/konnten nicht gelesen werden/)).not.toBeInTheDocument();
  });
});
