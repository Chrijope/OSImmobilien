import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Waechter fuer die Hoehe des Chatfensters im Reiter Kommunikation.
 *
 * Bis zum 05.10.2026 mass `useChatSichthoehe` die Hoehe aus der Lage der
 * Karte. Im Kundenprofil blieb dabei oft nur die Untergrenze von 180 Pixeln,
 * und eine einzige Blase wurde abgeschnitten. Jetzt gilt eine feste Hoehe,
 * fuer internen Chat und Kundenchat dieselbe.
 */
const wurzel = process.cwd();
const reiter = readFileSync(resolve(wurzel, "src/components/kunde/KommunikationReiter.tsx"), "utf8");
const verlauf = readFileSync(resolve(wurzel, "src/components/chat/ChatVerlauf.tsx"), "utf8");

/** Die Chatkarte, vom Oeffnen bis zum Ende des Reiters. */
const chatKarte = reiter.slice(reiter.indexOf("<Card data-kundenprofil-chat"));

describe("Kommunikation: Chatfenster mit fester Hoehe", () => {
  it("misst die Hoehe nicht mehr aus der Lage der Karte", () => {
    expect(reiter).not.toMatch(/useChatSichthoehe\(/);
  });

  it("legt eine feste, gut nutzbare Hoehe fest, mobil mindestens 60 Prozent", () => {
    const hoehe = reiter.match(/const CHATFENSTER_HOEHE = "([^"]+)"/)?.[1] ?? "";
    expect(hoehe).toContain("h-[min(70vh,720px)]");
    expect(hoehe).toContain("lg:min-h-[480px]");
    expect(hoehe).toContain("min-h-[60vh]");
  });

  it("die Chatkarte traegt die Hoehe und ist eine Spalte mit festem Kopf", () => {
    expect(chatKarte).toMatch(/^<Card data-kundenprofil-chat className=\{cn\("flex flex-col overflow-hidden", CHATFENSTER_HOEHE\)\}>/);
  });

  it("beide Chats nutzen dieselbe Karte, also dieselbe Hoehe", () => {
    // Genau ein Verlauf, in der Chatkarte, umgeschaltet nur ueber die Kennung.
    expect(reiter.match(/<ChatVerlauf\b/g)).toHaveLength(1);
    expect(chatKarte).toContain("<ChatVerlauf");
    expect(chatKarte).toContain("chatId={offenerChat.id}");
  });

  it("die linke Spalte wird nie hoeher als der Chat, sondern scrollt", () => {
    expect(reiter).toContain('const LINKE_SPALTE_HOEHE = "lg:max-h-[min(70vh,720px)] lg:overflow-y-auto"');
    expect(reiter).toContain('<Card className={cn("p-2 overflow-hidden", LINKE_SPALTE_HOEHE)}>');
  });
});

describe("ChatVerlauf: nur der Nachrichtenbereich scrollt", () => {
  it("der Nachrichtenbereich fuellt den Rest und darf schrumpfen", () => {
    expect(verlauf).toContain('<ScrollArea className="flex-1 min-h-0 p-4"');
  });

  it("die Eingabe steht fest darunter", () => {
    expect(verlauf).toContain('<div className="p-3 border-t shrink-0 bg-card">');
  });

  it("ein leerer Verlauf zeigt mittig einen ruhigen Hinweis", () => {
    expect(verlauf).toContain("sichtbareNachrichten.length === 0 &&");
    expect(verlauf).toMatch(/data-chat-leer className="pointer-events-none absolute inset-0 flex items-center justify-center/);
    expect(verlauf).toContain("Noch keine Nachrichten. Schreib die erste unten.");
  });
});
