import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Die beiden Bögen dürfen sich nicht überlagern.
 *
 * Der alte Vorabbogen und das neue Kennenlernen schreiben in dieselbe Tabelle
 * `bewerber_formular`. Eine frisch angelegte Zeile enthält noch keine
 * Antworten und war damit von einer alten nicht zu unterscheiden. Der alte
 * Erinnerungslauf hätte sie mitgenommen: Der Bewerber bekäme an Tag 3 zwei
 * Mails, und die zweite führte ihn mit demselben Zugangscode in den alten
 * Bogen mit achtundzwanzig Schritten. Füllt er den aus, gilt das Kennenlernen
 * als erledigt, ohne dass er es je gesehen hat.
 *
 * Geprüft wird am Quelltext, weil beide Seiten Deno-Funktionen sind und die
 * Zusage zwischen ihnen liegt, nicht in einer von beiden.
 */

const lies = (pfad: string) => readFileSync(new URL(pfad, import.meta.url), "utf-8");

// Seit dem 15.09.2026 steht der Versand im gemeinsamen Modul, das Function
// und automatischer Eingang gleichermassen benutzen.
const VERSAND = "../../supabase/functions/_shared/kennenlernen-versand.ts";
const ALTE_KETTE = "../../supabase/functions/send-bewerber-formular-erinnerungen/index.ts";

describe("Der neue Bogen ist von Anfang an gekennzeichnet", () => {
  it("setzt das Kennzeichen schon beim Anlegen, nicht erst mit der ersten Antwort", () => {
    const quelle = lies(VERSAND);
    // Seit 15.09.2026 kann neben `bogen` ein Kennzeichen `ohneMail` stehen,
    // deshalb ein Muster statt des festen Einzeilers.
    expect(quelle).toMatch(/antworten:\s*\{\s*bogen:\s*"kennenlernen"/);
  });
});

describe("Die alte Erinnerungskette lässt den neuen Bogen in Ruhe", () => {
  it("schließt gekennzeichnete Zeilen aus ihrer Suche aus", () => {
    const quelle = lies(ALTE_KETTE);
    expect(quelle).toContain('.is("antworten->>bogen", null)');
  });

  it("filtert vor der Auswahl, nicht erst beim Versand", () => {
    // Der Filter muss in derselben Abfrage stehen wie die Statusbedingung.
    // Stünde er später, wäre schon gelesen, was nicht gelesen werden soll.
    const quelle = lies(ALTE_KETTE);
    const abfrage = quelle.slice(
      quelle.indexOf('.from("bewerber_formular")'),
      quelle.indexOf('.gt("expires_at"'),
    );
    expect(abfrage).toContain('.is("antworten->>bogen", null)');
  });
});

/*
 * Der zweite Fall, seit dem Sammelversand vom 14.09.2026 der Regelfall: Ein
 * Bewerber hat BEIDE Zeilen, eine alte offene und eine neue.
 *
 * Der Filter auf das Kennzeichen hält nur die neue Zeile aus der alten Kette
 * heraus. Die alte Zeile desselben Bewerbers nimmt sie weiterhin mit, und dann
 * bekommt er zwei verschiedene Formulare von uns, beide angemahnt. Wir fragen
 * mit dem Kennenlernen längst ausführlicher; der frühere Bogen ist damit
 * gegenstandslos, genau wie nach einem geführten Erstgespräch.
 */
describe("Wer den Kennenlernbogen hat, wird an den alten nicht mehr erinnert", () => {
  it("fragt vor dem Versand, ob schon ein Kennenlernbogen vorliegt", () => {
    const quelle = lies(ALTE_KETTE);
    expect(quelle).toContain('.eq("antworten->>bogen", "kennenlernen")');
    expect(quelle).toContain("kennenlernBoegen");
  });

  /*
   * Übersprungen heißt hier: Zeitstempel setzen und weiter. Ohne ihn prüfte
   * der Lauf denselben Bogen jede Nacht erneut.
   */
  it("vermerkt den übersprungenen Bogen, statt ihn täglich erneut zu prüfen", () => {
    const quelle = lies(ALTE_KETTE);
    const stelle = quelle.indexOf("kennenlernBoegen");
    expect(stelle).toBeGreaterThan(-1);
    const danach = quelle.slice(stelle, stelle + 600);
    expect(danach).toContain("erinnerung_am");
    expect(danach).toContain("uebersprungen++");
  });
});
