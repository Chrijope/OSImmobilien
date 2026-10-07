import { describe, it, expect, vi } from "vitest";

/**
 * Provisionszuordnung ueber die Kennung.
 *
 * Provisionsabrechnung und Abrechnungen ordneten Kontakte bisher ueber
 * `k.berater === u.name || k.zustaendig_id === u.id` bzw. nur ueber den Namen
 * zu. Jetzt gilt `istZustaendig`: Kennung zuerst, der Name nur ohne Kennung
 * und nur eindeutig. Fuer eindeutige Namen muessen die Summen gleich bleiben.
 */

vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [] }));

import { istZustaendig } from "./kontaktOwnership";
import { istEigenKontakt } from "./karriereStufeHelper";

type K = { id: string; berater: string; zustaendig_id: string; kaufpreis: number };

const SATZ = 4;
const summe = (kontakte: K[], pruefe: (k: K) => boolean) =>
  Math.round(kontakte.filter(pruefe).reduce((s, k) => s + k.kaufpreis * (SATZ / 100), 0) * 100) / 100;
const alteRegel = (u: { id: string; name: string }) => (k: K) => k.berater === u.name || k.zustaendig_id === u.id;
const neueRegel = (u: { id: string; name: string }, nutzer: { id: string; name: string }[]) =>
  (k: K) => istZustaendig(k, { userId: u.id, userName: u.name }, nutzer);

describe("Summen bei eindeutigen Namen", () => {
  const nutzer = [
    { id: "erika", name: "Erika Beispiel" },
    { id: "max", name: "Max Muster" },
  ];
  const kontakte: K[] = [
    { id: "1", berater: "Erika Beispiel", zustaendig_id: "erika", kaufpreis: 250_000 },
    { id: "2", berater: "Erika Beispiel", zustaendig_id: "erika", kaufpreis: 180_000 },
    { id: "3", berater: "Max Muster", zustaendig_id: "max", kaufpreis: 320_000 },
    // Altbestand ohne Kennung: zaehlt weiter ueber den eindeutigen Namen.
    { id: "4", berater: "Max Muster", zustaendig_id: "", kaufpreis: 99_000 },
    { id: "5", berater: "", zustaendig_id: "", kaufpreis: 500_000 },
  ];

  it("bleiben je Partner gleich", () => {
    for (const u of nutzer) {
      expect(summe(kontakte, neueRegel(u, nutzer))).toBe(summe(kontakte, alteRegel(u)));
    }
    expect(summe(kontakte, neueRegel(nutzer[0], nutzer))).toBe(17_200);
    expect(summe(kontakte, neueRegel(nutzer[1], nutzer))).toBe(16_760);
  });
});

describe("Zwei Partner mit gleichem Namen", () => {
  const nutzer = [
    { id: "max-1", name: "Max Muster" },
    { id: "max-2", name: "Max Muster" },
  ];
  const kontakte: K[] = [
    { id: "1", berater: "Max Muster", zustaendig_id: "max-1", kaufpreis: 200_000 },
    { id: "2", berater: "Max Muster", zustaendig_id: "max-2", kaufpreis: 300_000 },
    // Ohne Kennung ist nicht klar, wem er gehoert: er zaehlt bei keinem.
    { id: "3", berater: "Max Muster", zustaendig_id: "", kaufpreis: 400_000 },
  ];

  it("gehen an den richtigen und nicht doppelt", () => {
    expect(summe(kontakte, neueRegel(nutzer[0], nutzer))).toBe(8_000);
    expect(summe(kontakte, neueRegel(nutzer[1], nutzer))).toBe(12_000);
    // Die alte Regel zaehlte jeden Kontakt bei beiden.
    expect(summe(kontakte, alteRegel(nutzer[0]))).toBe(36_000);
  });
});

describe("Eigen oder zugewiesen ohne Ersteller-Kennung", () => {
  it("nimmt bei eindeutigem Namen den Namensvergleich wie bisher", () => {
    expect(istEigenKontakt("erika", { berater: "Erika Beispiel", erstelltVonName: "Erika Beispiel" })).toBe(true);
  });

  it("entscheidet ueber die Kennung, wenn sie da ist", () => {
    expect(istEigenKontakt("max-2", { berater: "Max Muster", erstelltVonId: "max-1", erstelltVonName: "Max Muster" })).toBe(false);
  });
});
