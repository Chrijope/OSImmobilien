import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  objektauswahlFreigeschaltet,
  reservierungFreigeschaltet,
} from "@/lib/investmentFreischaltung";

/**
 * Die Objektauswahl steht immer da, die Reservierung hängt am Objekt.
 *
 * Christians Befund vom 16.09.2026: Im Investment-Reiter fehlte zwischen
 * Selbstauskunft und Reservierung der Abschnitt Objektauswahl. Er wurde ohne
 * abgeschlossene Selbstauskunft gar nicht erst gebaut, während die
 * Reservierung eine andere Frage prüfte und trotzdem erschien.
 *
 * Der zweite Teil dieser Datei liest den Quelltext von `KundenDetail.tsx`.
 * Die Seite ist zu groß, um sie in einem Test aufzubauen, und diese Zusagen
 * lassen sich sonst still zurückdrehen. Dasselbe Vorgehen wie in
 * `objektauswahlEineStelle.test.ts`.
 */

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");
const kundenDetail = lies("src/pages/KundenDetail.tsx");

describe("Die vier Zustände der Objektauswahl", () => {
  it("bleibt gesperrt, solange weder Selbstauskunft noch Vermerk vorliegen", () => {
    expect(objektauswahlFreigeschaltet({ saLiegtVor: false, saEntfaellt: false })).toBe(false);
    expect(objektauswahlFreigeschaltet({})).toBe(false);
  });

  it("öffnet mit unterschriebener Selbstauskunft", () => {
    expect(objektauswahlFreigeschaltet({ saLiegtVor: true })).toBe(true);
  });

  it("öffnet mit gesetztem Schalter, auch ganz ohne Selbstauskunft", () => {
    expect(objektauswahlFreigeschaltet({ saLiegtVor: false, saEntfaellt: true })).toBe(true);
  });

  it("öffnet, wenn beides zutrifft", () => {
    expect(objektauswahlFreigeschaltet({ saLiegtVor: true, saEntfaellt: true })).toBe(true);
  });
});

describe("Die Reservierung hängt am Objekt", () => {
  it("bleibt ohne Objekt zu, auch mit unterschriebener Selbstauskunft", () => {
    // Die Selbstauskunft kommt in dieser Frage gar nicht mehr vor.
    expect(reservierungFreigeschaltet({ objektGesetzt: false })).toBe(false);
    expect(reservierungFreigeschaltet({})).toBe(false);
  });

  it("öffnet mit gesetztem Objekt", () => {
    expect(reservierungFreigeschaltet({ objektGesetzt: true })).toBe(true);
  });

  it("bleibt für Investagon-Vorgänge ohne Objekt zu, die Blanko-Reservierung ist abgeschaltet", () => {
    // Seit dem 29.09.2026 gibt es keinen Investagon-Zweig mehr. Ein
    // mitgegebenes Kennzeichen darf die Karte nicht wieder öffnen.
    const mitKennzeichen = { objektGesetzt: false, istInvestagon: true } as Parameters<typeof reservierungFreigeschaltet>[0];
    expect(reservierungFreigeschaltet(mitKennzeichen)).toBe(false);
  });

  it("öffnet für einen von Hand auf Reservierung gesetzten Vorgang", () => {
    expect(reservierungFreigeschaltet({ objektGesetzt: false, stufeAbReservierung: true })).toBe(true);
  });
});

describe("Die Karte wird immer gebaut", () => {
  it("hängt nicht mehr an !isPreSA, sondern am eigenen Zustand", () => {
    expect(kundenDetail).toContain("{!objektauswahlFrei ? (");
    // Das alte Gate genau an dieser Stelle gibt es nicht mehr.
    expect(kundenDetail).not.toContain("{!isPreSA && (\n            <>\n            {/* Freie Wohnungen */}");
  });

  it("nennt gesperrt den Grund", () => {
    expect(kundenDetail).toContain(
      "Wird nach der unterschriebenen Selbstauskunft des Kunden freigeschaltet.",
    );
  });

  it("bleibt gesperrt anspringbar", () => {
    expect(kundenDetail).toContain('data-section="objektauswahl"');
    expect(kundenDetail).toContain("id={`card-objektauswahl-${inv.id}`} data-section=\"objektauswahl\"");
  });
});

describe("Die Reservierungskarte im Quelltext", () => {
  it("prüft nicht mehr die Selbstauskunft", () => {
    expect(kundenDetail).not.toContain("const reservierungFreigeschaltet = !!(saSigned || saPdfFilename)");
    expect(kundenDetail).not.toContain("Reservierung wird nach unterschriebener Selbstauskunft freigeschaltet.");
  });

  it("nennt gesperrt das Objekt als Bedingung", () => {
    expect(kundenDetail).toContain("Wird nach dem gesetzten Objekt freigeschaltet.");
  });

  it("nimmt objektDatenFehlen als Quelle für „Objekt gesetzt“", () => {
    expect(kundenDetail).toContain("objektGesetzt: !!inv.objektId || !objektDatenFehlen(inv.id),");
    expect(kundenDetail).toContain("const canReserve = !!inv.objektId || !objektDatenFehlen(inv.id);");
  });

  it("kennt keinen Investagon-Weg mehr in die Reservierung", () => {
    // Blanko-Reservierung seit dem 29.09.2026 abgeschaltet.
    const karte = kundenDetail.slice(
      kundenDetail.indexOf("{reservierungOffen({"),
      kundenDetail.indexOf("stufeAbReservierung: stufeErreicht(inv.pipelineStufe, \"reservierung\"),"),
    );
    expect(karte).not.toContain("istInvestagon");
    expect(kundenDetail).not.toMatch(/canReserve = [^;]*istInvestagon/);
  });
});

describe("Das Raster bleibt paarweise", () => {
  it("legt keine gesperrte Phase mehr über beide Spalten", () => {
    // `lg:col-span-2` an dieser Stelle hätte die Zelle neben der Objektauswahl
    // leer gelassen und alle Paare darunter verschoben.
    expect(kundenDetail).not.toContain('<div className="space-y-6 lg:col-span-2">');
    expect(kundenDetail).toContain("<LockedPhaseCard");
  });
});

describe("Die Unternavigation zeigt den Ablauf", () => {
  it("führt Objektauswahl und Reservierung vor Bonität und Bankprüfung", () => {
    const reihenfolge = ["ueberblick", "erstgespraech", "selbstauskunft", "objektauswahl",
      "reservierung", "bonitaet", "finanzierung", "notar", "abwicklung", "kundenordner"];
    const abschnitt = kundenDetail.slice(
      kundenDetail.indexOf("const INVESTMENT_ABSCHNITTE"),
      kundenDetail.indexOf("// Grundliste kommt aus src/lib/bankpruefungDocs.ts"),
    );
    const gefunden = [...abschnitt.matchAll(/\{ key: "([a-z]+)"/g)].map((m) => m[1]);
    expect(gefunden).toEqual(reihenfolge);
  });
});

describe("Bonitätsunterlagen beim Selbstfinanzierer", () => {
  /*
   * Geprueft wird die Zusage, nicht der Wortlaut: Der Bereich muss sagen, dass
   * die Unterlagen nicht gebraucht werden und warum. Frueher stand dafuer eine
   * zweite, schlanke Karte im Quelltext; sie ist am 16.09.2026 entfallen, weil
   * sie unerreichbar geworden war. Den Hinweis traegt jetzt der Warnkasten in
   * der gemeinsamen Karte.
   */
  it("werden gekennzeichnet und nicht ausgeblendet", () => {
    expect(kundenDetail).toMatch(/nicht erforderlich, der Kunde finanziert selbst/i);
    expect(kundenDetail).toContain("Das Finanzierungsangebot");
  });

  it("lösen keine Nachfass-Meldung mehr aus", () => {
    expect(kundenDetail).toContain('inv.pipelineStufe === "bonitaetsunterlagen" && !saEntfaellt');
    const inbox = lies("src/hooks/useInvestmentInboxTriggers.ts");
    expect(inbox).toContain('stage === "bonitaetsunterlagen" && !saEntfaelltHier');
    const erinnerung = lies("supabase/functions/check-document-reminders/index.ts");
    expect(erinnerung).toContain("invMeta.selbstauskunftEntfaellt?.aktiv");
  });
});

/*
 * Der gemeinsame Kasten um Bonitätscheck, Bankprüfung und Pflichtdokumente,
 * gewünscht von Christian am 16.09.2026.
 *
 * Dazu gehört, dass der Pflichtdokumente-Kasten beim Selbstfinanzierer gar
 * nicht gebaut wird, und dass die Sprungmarke der Unternavigation trotz der
 * zwei Fassungen des Abschnitts nur einmal je Investment im Baum steht.
 */
describe("Bonität und Bankprüfung stehen in einer gemeinsamen Karte", () => {
  it("trägt die gemeinsame Überschrift", () => {
    const bereich = kundenDetail.slice(
      kundenDetail.indexOf("<div id={`card-bonitaet-${inv.id}`}"),
      kundenDetail.indexOf('<h3 className="font-bold mb-4">Bonitätscheck</h3>'),
    );
    expect(bereich).toContain('<h3 className="font-bold mb-4">Bonität und Bankprüfung</h3>');
  });

  it("baut den Pflichtdokumente-Kasten bei gesetztem Vermerk gar nicht", () => {
    const pflichtkasten = kundenDetail.slice(
      kundenDetail.indexOf("{/* Pflichtfelder Hinweis + Prüfungsstatus"),
      kundenDetail.indexOf("const reviewResultSentAt = (inv as any).reviewResultSentAt;"),
    );
    expect(pflichtkasten).toContain("{!saEntfaellt && (() => {");
  });

  /*
   * Seit dem 16.09.2026 gibt es nur noch EINE Fassung des Abschnitts. Die
   * zweite hing an `isPreSA && saEntfaellt` und war unerreichbar geworden:
   * Der Vermerk oeffnet ueber `hasInvSA` die volle Ansicht mit, damit ist
   * `isPreSA` bei gesetztem Vermerk immer falsch.
   */
  it("führt die Sprungmarke card-bonitaet nur einmal je Investment", () => {
    const marke = "id={`card-bonitaet-${inv.id}`}";
    expect(kundenDetail.split(marke).length - 1).toBe(1);
  });

  it("hat keinen unerreichbaren Zweig mehr, der auf isPreSA und saEntfaellt zugleich prueft", () => {
    expect(kundenDetail).not.toContain("{isPreSA && saEntfaellt && (");
  });
});

describe("Der Schalter hält sich an die Hausregeln", () => {
  it("fragt über confirmDialog und nicht über das Browserfenster", () => {
    expect(kundenDetail).toContain("Selbstauskunft überspringen?");
    const rundum = kundenDetail.slice(
      kundenDetail.indexOf("const schalteSaEntfaellt"),
      kundenDetail.indexOf("const saEntfaelltSchalter"),
    );
    expect(rundum).toContain("confirmDialog({");
    expect(rundum).not.toMatch(/(?<![\w.])confirm\(/);
    expect(rundum).not.toMatch(/(?<![\w.])alert\(/);
  });

  it("schreibt Setzen und Zurücknehmen ins Protokoll", () => {
    expect(kundenDetail).toContain("Selbstauskunft übersprungen: Kunde finanziert selbst");
    expect(kundenDetail).toContain("zurückgenommen (durch ${user.name}, ${user.role})");
  });

  it("zeigt ihn der Setterin nicht", () => {
    expect(kundenDetail).toContain("const darfSaEntfallenSchalten = !isSetterinRole && darfSelbstauskunftEntfallen(user.role)");
  });
});

/*
 * Nach der Ruecknahme des Vermerks, gemeldet von Christian am 16.09.2026.
 *
 * Wer „Kunde finanziert selbst" wieder abschaltet, bekam die Objektauswahl
 * erneut gesperrt, obwohl der Vorgang laengst dort stand. Fortschrittsanzeige
 * und Karte widersprachen sich, und das sah aus wie ein Fehler.
 */
describe("Ruecknahme des Vermerks wirft niemanden zurueck", () => {
  it("die erreichte Stufe haelt die Objektauswahl offen", () => {
    expect(objektauswahlFreigeschaltet({
      saLiegtVor: false, saEntfaellt: false, stufeErreicht: true,
    })).toBe(true);
  });

  it("ohne erreichte Stufe bleibt sie gesperrt", () => {
    expect(objektauswahlFreigeschaltet({
      saLiegtVor: false, saEntfaellt: false, stufeErreicht: false,
    })).toBe(false);
  });

  it("die Stufe ist nur ein dritter Weg, kein Ersatz fuer die beiden anderen", () => {
    expect(objektauswahlFreigeschaltet({ saLiegtVor: true })).toBe(true);
    expect(objektauswahlFreigeschaltet({ saEntfaellt: true })).toBe(true);
    expect(objektauswahlFreigeschaltet({})).toBe(false);
  });

  it("die Oberflaeche reicht die erreichte Stufe auch wirklich durch", () => {
    expect(kundenDetail).toContain('stufeErreicht: stufeErreicht(inv.pipelineStufe, "objektauswahl")');
  });
});

/*
 * Das Aufblitzen nach dem Setzen, gemeldet von Christian am 16.09.2026.
 *
 * Die Stufe wanderte ueber `stufenwechsel` und damit per setTimeout aus dem
 * Render heraus. Einen Durchgang lang stand die freigeschaltete Karte da,
 * waehrend die Stufe noch die alte war.
 */
describe("kein Aufblitzen nach dem Setzen", () => {
  it("der Klickbehandler zieht die Stufe selbst mit", () => {
    const rundum = kundenDetail.slice(
      kundenDetail.indexOf("const schalteSaEntfaellt"),
      kundenDetail.indexOf("const saEntfaelltSchalter"),
    );
    expect(rundum).toContain('updateInvestment(inv.id, { pipelineStufe: "objektauswahl" })');
  });

  // Seit dem 05.10.2026 nicht mehr in der Objektauswahl: vor der Selbstauskunft
  // im Kasten Selbstauskunft, danach unter Bonität und Bankprüfung.
  it("der Schalter steht bei Selbstauskunft und Bonität, nicht in der Objektauswahl", () => {
    expect(kundenDetail).not.toContain("fussbereich={saEntfaelltSchalter}");
    expect(kundenDetail.split("{saEntfaelltSchalter}").length - 1).toBe(2);
    const bonitaet = kundenDetail.slice(kundenDetail.indexOf("Bonitätscheck, Bankprüfung und die Pflichtdokumente"), kundenDetail.indexOf("── Person 2 Bonitätscheck/Bankprüfung ──"));
    expect(bonitaet).toContain("{saEntfaelltSchalter}");
  });
});

/*
 * Kein Rueckschritt aus den Bonitaetsunterlagen, gefunden am 16.09.2026.
 *
 * Beide Stufenlisten fuehrten "bonitaetsunterlagen" und setzten von dort auf
 * "objektauswahl". Das stammte aus der Zeit, als die Bonitaet VOR der
 * Objektauswahl lag. Seit der Drehung am 06.08.2026 liegt sie dahinter, der
 * Wechsel warf den Vorgang also zurueck. Sichtbar wurde es als Aufblitzen des
 * Abschnitts "Bonitaet und Bankpruefung", der an genau dieser Schwelle haengt.
 */
describe("der Sprung auf die Objektauswahl geht nur nach vorn", () => {
  it("objektauswahl liegt in der Pipeline vor den Bonitaetsunterlagen", async () => {
    const { PIPELINE_STUFEN } = await import("@/lib/pipelineStufen");
    const keys = PIPELINE_STUFEN.map((s) => s.key);
    expect(keys.indexOf("objektauswahl")).toBeLessThan(keys.indexOf("bonitaetsunterlagen"));
  });

  it("keine der beiden Stufenlisten holt jemanden aus den Bonitaetsunterlagen zurueck", () => {
    for (const treffer of kundenDetail.matchAll(
      /\["erstgespraech_geplant", "erstgespraech", "beratungsgespraech"[^\]]*\]/g,
    )) {
      expect(treffer[0]).not.toContain("bonitaetsunterlagen");
    }
  });

  it("der Bonitaetsbereich bleibt bei gesetztem Vermerk sichtbar", () => {
    expect(kundenDetail).toContain("const hasInvSA = saEntfaelltVermerk.aktiv || saVollansicht({");
  });

  /*
   * Der Vermerk liegt zusaetzlich im lokalen Zustand, damit die Anzeige schon
   * im ersten Renderdurchgang nach dem Klick stimmt. Ohne ihn las dieser
   * Durchgang noch den alten Wert aus dem Zwischenspeicher, und alles unter
   * dem Bonitaetsabschnitt sprang.
   */
  it("der Vermerk wirkt sofort, nicht erst nach dem Zwischenspeicher", () => {
    expect(kundenDetail).toContain("const saEntfaelltVermerk = saVermerkLokal[inv.id] ?? getSelbstauskunftEntfaellt(inv.id)");
    // In beide Richtungen mitziehen, sonst hinkt das Ausschalten nach.
    expect(kundenDetail.split("setSaVermerkLokal((v) => ({ ...v, [inv.id]: vermerk }))").length - 1).toBe(2);
  });
});
