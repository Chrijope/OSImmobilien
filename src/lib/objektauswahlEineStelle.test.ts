import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { stufeBrauchtObjektDaten, BESTANDSWOHNUNG_AKTIV } from "@/lib/objektDatenPflicht";

/**
 * Eine Eingabestelle für das Objekt, und ein Sprung, der beim richtigen
 * Investment landet.
 *
 * Diese Tests lesen den Quelltext, so wie es `followUpObjekt.test.ts` für die
 * Nur-manuell-Garantie tut. Sie sichern Zusagen ab, die sich sonst still
 * zurückdrehen lassen, weil kein Aufruf sie erzwingt.
 */

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

const pipeline = lies("src/pages/Pipeline.tsx");
const kundenDetail = lies("src/pages/KundenDetail.tsx");
const karte = lies("src/components/kunden/FreieWohnungenCard.tsx");
const pflichtModul = lies("src/lib/objektDatenPflicht.ts");

describe("Die Pipeline fragt keine Objektdaten mehr ab", () => {
  it("bindet das Eingabefenster nicht mehr ein", () => {
    expect(pipeline).not.toContain("ObjektDatenDialog");
  });

  it("blockiert den Zug stattdessen mit einem Hinweis", () => {
    expect(pipeline).toContain("setObjektHinweis");
    expect(pipeline).toContain("Zuerst das Objekt eintragen");
  });

  it("bietet den Sprung mit der Kennung des gemeinten Investments an", () => {
    expect(pipeline).toContain("?investment=${objektHinweis.invId}#objektauswahl");
  });

  it("legt kein Investment im Hintergrund an, sondern verweist auf das Kundenprofil", () => {
    expect(pipeline).toContain("noch kein Investment");
    // Ein automatisches Anlegen erzeugt Karteileichen und ist deshalb bewusst nicht da.
    expect(pipeline).not.toContain("createInvestment");
  });
});

describe("Der Sprung landet im richtigen Investment", () => {
  it("wertet den Parameter beim Laden aus und öffnet dessen Reiter", () => {
    expect(kundenDetail).toContain('.get("investment")');
    /*
     * Seit dem Zusammenführen der Investment-Reiter gibt es nur noch den einen
     * Reiter "investments", und welches Investment offen ist, steht in der
     * Auswahl daneben. Vorher hieß der Reiter selbst `inv-<id>`. Die Zusage ist
     * dieselbe geblieben: Der Parameter öffnet genau dieses Investment.
     */
    expect(kundenDetail).toContain("setGewaehltesInvestment(gewuenscht)");
    expect(kundenDetail).toContain('setActiveTab("investments")');
  });

  it("nimmt für den Anker nicht mehr blind das erste Investment", () => {
    expect(kundenDetail).toContain('investments.find((i) => i.id === gewuenscht) || investments[0]');
  });

  it("öffnet beim Anker das Investment, scrollt hin und hebt den Abschnitt orange hervor", () => {
    // Darauf verlässt sich der Rücksprung aus der Objektauswahl (`rueckwegImVerlaufMerken`).
    const anker = kundenDetail.slice(kundenDetail.indexOf("const ankerSprungGetan"), kundenDetail.indexOf("const investmentsGeladen"));
    expect(anker).toContain("oeffneInvestment(inv.id, { nachObenRollen: false })");
    expect(anker).toContain("scrollIntoView");
    expect(anker).toContain("markiereProfilAbschnitt(el)");
  });

  it("springt, sobald der Abschnitt da ist, ohne feste Wartezeit und ohne Umweg nach oben", () => {
    const anker = kundenDetail.slice(kundenDetail.indexOf("const ankerSprungGetan"), kundenDetail.indexOf("const investmentsGeladen"));
    expect(anker).toContain("requestAnimationFrame(versuche)");
    expect(anker).not.toContain("setTimeout");
    expect(anker).not.toContain('behavior: "smooth"');
    // Der Investment-Sprung rollt nicht nach oben, wenn ein Anker folgt.
    expect(kundenDetail).toContain("if (!window.location.hash) rolleNachDemZeichnenNachOben();");
  });

  it("kennt den Abschnitt unter seinem neuen Namen", () => {
    expect(kundenDetail).toContain('data-section="objektauswahl"');
    expect(kundenDetail).not.toContain('data-section="freie-wohnungen"');
  });
});

describe("Die Karte heißt Objektauswahl", () => {
  it("trägt den neuen Namen für den Vertrieb", () => {
    expect(karte).toContain('isSetter ? "Zugewiesene Wohnung" : "Objektauswahl"');
  });

  it("führt keine eigene Stufenliste mehr, sondern die gemeinsame Rangfolge", () => {
    expect(karte).toContain('stufeErreicht(inv.pipelineStufe, "reservierung")');
    expect(karte).not.toContain('["reservierung", "finanzierung", "notar", "abrechnung", "abgeschlossen"]');
  });

  it("bietet das Eintragen und das Ändern an derselben Stelle an", () => {
    expect(karte).toContain("Objekt eintragen");
    expect(karte).toContain("Objektdaten ändern");
    expect(karte).toContain("ObjektDatenDialog");
  });
});

/**
 * Der Weg über den eigenen Bestand ist abgeschaltet, nicht entfernt.
 *
 * Es gibt heute keine Wohnungen im eigenen Bestand. Jedes Objekt kommt von
 * Investagon, heute von Hand eingetragen, später automatisch übernommen.
 * Geprüft wird deshalb dreierlei: Der Schalter sitzt an einer einzigen Stelle,
 * die doppelten Wege hängen wirklich daran, und ein bereits gespeicherter
 * Verweis wird trotzdem noch angezeigt.
 */
describe("Der Bestandsweg hängt an einem einzigen Schalter", () => {
  it("wird an genau einer Stelle abgefangen", () => {
    expect(pflichtModul).toContain("export const BESTANDSWOHNUNG_AKTIV");
    expect(pflichtModul).toContain("if (!BESTANDSWOHNUNG_AKTIV) return null;");
  });

  it("schaltet damit die Sonderfälle des Fensters mit ab", () => {
    // `hatBestandsWohnung` sagt dann immer nein, also gibt es überall den
    // Knopf zum Ändern und das Bildfeld.
    expect(pflichtModul).toContain("return !!bestandsWohnung(investmentId)");
  });

  it("berechnet die Liste der freien Wohnungen gar nicht erst", () => {
    expect(karte).toContain("(BESTANDSWOHNUNG_AKTIV ? allObjekte : [])");
  });

  it("zeigt die Liste der freien Wohnungen nicht mehr an", () => {
    expect(karte).toContain("!BESTANDSWOHNUNG_AKTIV ? null :");
  });

  it("nimmt den Bestand aus dem Notar-Aufnahmebogen heraus", () => {
    expect(kundenDetail).toContain("BESTANDSWOHNUNG_AKTIV && objektId ? getObjektById(objektId) : undefined");
  });

  it("zeigt einen bereits gespeicherten Verweis weiterhin an", () => {
    // Bewusst ohne Schalter: Hier wird nichts verknüpft, nur gelesen.
    expect(karte).toContain("inv.wohnungId ? allObjekte.flatMap(o => o.wohnungen).find(w => w.id === inv.wohnungId)");
  });

  it("ist ein Schalter und keine Vermutung", () => {
    // Absichtlich ohne Prüfung auf false: Wird der Bestand später wieder
    // eingeführt, soll dieser Test nicht im Weg stehen.
    expect(typeof BESTANDSWOHNUNG_AKTIV).toBe("boolean");
  });
});

describe("Kein Rückfall in eine veraltete Reihenfolge", () => {
  it("führt die Bonität nirgends mehr vor der Objektauswahl", () => {
    // Die alte Liste in KundenDetail stellte "bonitaetsunterlagen" vor
    // "objektauswahl". Seit dem Tausch vom 06.08.2026 ist das falsch herum.
    expect(kundenDetail).not.toContain('"bonitaetsunterlagen","objektauswahl"');
  });
});

describe("Welche Stufen ohne Objekt keinen Sinn ergeben", () => {
  it("verlangt das Objekt ab der Reservierung", () => {
    for (const s of ["reservierung", "bonitaetsunterlagen", "finanzierung"]) {
      expect(stufeBrauchtObjektDaten(s)).toBe(true);
    }
  });

  it("verlangt es davor nicht", () => {
    for (const s of ["beratungsgespraech", "selbstauskunft", "objektauswahl", "follow_up_objekt"]) {
      expect(stufeBrauchtObjektDaten(s)).toBe(false);
    }
  });
});
