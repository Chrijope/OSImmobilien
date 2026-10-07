import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Das Kundenprofil unter „Dokumente“ seit dem 23.09.2026: Der Kasten
 * „Interaktive Objektvorstellungen“ und der Knopf „Objektvorstellung“ sind
 * weg. Exposé, Kundenansicht und „Kundenlink senden“ decken sie ab. Die Karte
 * fragt die Tabelle `objektvorstellungen` auch nicht mehr ab.
 */

const tabellen = vi.hoisted(() => [] as string[]);

vi.mock("@/integrations/supabase/client", () => {
  const kanal = { on: () => kanal, subscribe: () => kanal };
  return {
    supabase: {
      from: (tabelle: string) => {
        tabellen.push(tabelle);
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
      },
      channel: () => kanal,
      removeChannel: () => {},
    },
  };
});

vi.mock("@/lib/kundeDokumenteStore", () => ({
  listKundeDokumente: async () => [],
  createOrdner: async () => null,
  uploadDatei: async () => null,
  renameDokument: async () => false,
  moveDokument: async () => false,
  deleteDokument: async () => false,
  getSignedUrl: async () => null,
}));

const { default: KundeDokumenteCard } = await import("./KundeDokumenteCard");

describe("KundeDokumenteCard ohne Objektvorstellung", () => {
  it("zeigt Ordner und Upload, aber keinen Einstieg und keinen Kasten zur Objektvorstellung", async () => {
    render(<KundeDokumenteCard kontaktId="k1" investments={[{ id: "inv1", label: "Investment 1" }]} canManage />);

    await waitFor(() => expect(screen.getByText("Noch keine Dokumente in diesem Ordner.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Ordner/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Objektvorstellung/i })).toBeNull();
    expect(screen.queryByText(/Interaktive Objektvorstellung/i)).toBeNull();
    expect(document.body).not.toHaveTextContent(/Objektvorstellung/i);
    expect(tabellen).not.toContain("objektvorstellungen");
  });
});

describe("Kein Einstieg mehr in eine neue Objektvorstellung", () => {
  const wurzel = resolve(__dirname, "../../..");

  it("hat Dialog, Store und die Bausteine der alten Seite entfernt", () => {
    for (const datei of [
      "src/components/kunde/ObjektvorstellungDialog.tsx",
      "src/lib/objektvorstellungenStore.ts",
      "src/components/objektvorstellung",
    ]) {
      expect(existsSync(join(wurzel, datei))).toBe(false);
    }
  });

  it("legt nirgends im Quelltext eine Objektvorstellung an oder liest ihre Tabelle", () => {
    const funde: string[] = [];
    const durchsuche = (ordner: string) => {
      for (const eintrag of readdirSync(ordner)) {
        const pfad = join(ordner, eintrag);
        if (statSync(pfad).isDirectory()) { durchsuche(pfad); continue; }
        if (!/\.(ts|tsx)$/.test(eintrag) || /\.test\.tsx?$/.test(eintrag)) continue;
        // Sync-Kopien („Datei 2.tsx“) baut niemand ein, siehe tsconfig.app.json.
        if (/ [2-9]\.tsx?$/.test(eintrag)) continue;
        // Die generierten Datenbanktypen kennen die Tabelle weiter, sie bleibt bestehen.
        if (pfad.endsWith(join("integrations", "supabase", "types.ts"))) continue;
        const quelle = readFileSync(pfad, "utf-8");
        if (/objektvorstellungenStore|ObjektvorstellungDialog|from\(\s*["']objektvorstellungen["']/.test(quelle)) {
          funde.push(pfad.slice(wurzel.length + 1));
        }
      }
    };
    durchsuche(join(wurzel, "src"));
    expect(funde).toEqual([]);
  });
});
