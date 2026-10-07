import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Orange Hauptaktion im Kundenportal (Entscheidung Christian, 25.09.2026):
 * Je Ansicht genau EINE Aktion in Marken-Orange (`variant="brand"` bzw.
 * `btn-brand`), wie im CRM. Alle anderen Knöpfe bleiben, wie sie sind. Eine
 * Ansicht ohne echte Hauptaktion bekommt kein Orange.
 *
 * Geprüft wird der Quelltext je Datei. Stehen in einer Datei zwei Stellen,
 * gehören sie zu Ansichten, die nie gleichzeitig sichtbar sind; das steht
 * jeweils dabei. Der Chat prüft es zusätzlich im gerenderten Zustand
 * (KundeChat.test.tsx).
 */
const lies = (pfad: string) => readFileSync(resolve(__dirname, "..", "..", pfad), "utf8");
// Kommentare zaehlen nicht mit, sie duerfen die Regel beim Namen nennen.
const ohneKommentare = (quelle: string) =>
  quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const orange = (quelle: string) => (ohneKommentare(quelle).match(/variant="brand"|\bbtn-brand\b/g) || []).length;

const ERWARTET: { datei: string; anzahl: number; warum: string }[] = [
  { datei: "src/pages/KundeStammdaten.tsx", anzahl: 1, warum: "Übersicht: Aktion des ersten nächsten Schritts" },
  { datei: "src/pages/KundeKundenordner.tsx", anzahl: 0, warum: "Mein Ordner: nur gleichartige Downloads, keine Hauptaktion" },
  { datei: "src/pages/KundeInvestments.tsx", anzahl: 0, warum: "Investments: das Orange steckt in der NextStepCard" },
  { datei: "src/components/kunde/portal/NextStepCard.tsx", anzahl: 2, warum: "derselbe Aufruf, einmal für Desktop, einmal fürs Handy" },
  { datei: "src/components/kunde/EigeneInvestmentsTab.tsx", anzahl: 2, warum: "Liste: Investment hinzufügen; Dialog Bearbeiten: Speichern" },
  { datei: "src/pages/KundeSteuerCockpit.tsx", anzahl: 0, warum: "Steuer-Übersicht: nur Auswahlkarten" },
  { datei: "src/components/kunde/SteuerCockpitCard.tsx", anzahl: 1, warum: "Steuer-Detail: Anlage-V-Aufstellung (PDF)" },
  { datei: "src/components/kunde/AnlageVSendenDialog.tsx", anzahl: 1, warum: "Dialog: Senden" },
  { datei: "src/components/kunde/eigene/EigeneSteuerJahresListe.tsx", anzahl: 0, warum: "Liste gleichartiger Zeilen" },
  { datei: "src/components/kunde/eigene/SteuerCockpitEigen.tsx", anzahl: 0, warum: "Teil der Detailansicht einer eigenen Immobilie" },
  { datei: "src/pages/KundeEmpfehlungen.tsx", anzahl: 2, warum: "ohne Programm: anfragen; mit Programm: Empfehlung absenden" },
  { datei: "src/pages/KundeChat.tsx", anzahl: 2, warum: "ohne Chat: Chat starten; im Chat: Senden" },
  { datei: "src/pages/KundeEinstellungen.tsx", anzahl: 1, warum: "Passwort: Speichern" },
  { datei: "src/components/kunde/portal/KundePortalLayout.tsx", anzahl: 0, warum: "Kopf und Menü tragen keine Hauptaktion" },
];

describe("Kundenportal: genau eine orange Hauptaktion je Ansicht", () => {
  for (const { datei, anzahl, warum } of ERWARTET) {
    it(`${datei.split("/").pop()}: ${anzahl} (${warum})`, () => {
      expect(orange(lies(datei))).toBe(anzahl);
    });
  }

  it("die beiden Stellen der NextStepCard schließen sich per Bildschirmbreite aus", () => {
    const quelle = lies("src/components/kunde/portal/NextStepCard.tsx");
    expect(quelle).toMatch(/btn-brand hidden sm:inline-flex/);
    expect(quelle).toMatch(/btn-brand sm:hidden/);
  });
});
