/**
 * Keine automatische Bestätigungsmail mehr an Leads (entfallen am 26.09.2026).
 *
 * Zwei Kundenmails sind auf Christians Wunsch komplett raus: die Bestätigung
 * bei der Zuweisung an einen Partner und die Bestätigung beim Eingang über die
 * Microseite. Die Meldungen an den Partner bleiben. Die Edge Functions laufen
 * in Deno, deshalb wird am Quelltext geprüft.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { VORLAGEN_ZIELGRUPPE } from "../../supabase/functions/_shared/transactional-email-templates/_zielgruppe";

const WURZEL = process.cwd();
const VORLAGEN_ORDNER = "supabase/functions/_shared/transactional-email-templates";

// Zusammengesetzt, damit diese Datei selbst den Suchlauf nicht auslöst.
const ENTFALLEN = ["meta", "microseite"].map((v) => `${v}-lead-${"bestaetigung"}`);

// Die einzige Stelle, an der die Namen noch stehen dürfen: die Sperrliste, mit
// der der Versand einem alten Aufrufer sauber absagt.
const ERLAUBT = new Set(["supabase/functions/send-transactional-email/index.ts"]);

const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), "utf8");

function quelldateien(ordner: string): string[] {
  const ergebnis: string[] = [];
  for (const eintrag of readdirSync(join(WURZEL, ordner))) {
    if (eintrag === "node_modules") continue;
    const pfad = join(ordner, eintrag);
    if (statSync(join(WURZEL, pfad)).isDirectory()) ergebnis.push(...quelldateien(pfad));
    else if (/\.(ts|tsx)$/.test(eintrag)) ergebnis.push(pfad);
  }
  return ergebnis;
}

describe("Bestätigungsmails an Leads sind entfallen", () => {
  it("die beiden Vorlagennamen stehen nirgends mehr im Code, außer in der Sperrliste", () => {
    const fundstellen: string[] = [];
    for (const datei of [...quelldateien("src"), ...quelldateien("supabase/functions")]) {
      const rel = relative(WURZEL, join(WURZEL, datei));
      if (ERLAUBT.has(rel)) continue;
      const inhalt = lies(datei);
      for (const name of ENTFALLEN) if (inhalt.includes(name)) fundstellen.push(`${rel}: ${name}`);
    }
    expect(fundstellen).toEqual([]);
  });

  it("die Vorlagendateien sind gelöscht und stehen weder in Registry noch Zielgruppe", () => {
    const registry = lies(`${VORLAGEN_ORDNER}/registry.ts`);
    for (const name of ENTFALLEN) {
      expect(existsSync(join(WURZEL, VORLAGEN_ORDNER, `${name}.tsx`))).toBe(false);
      expect(registry).not.toContain(name);
      expect(Object.keys(VORLAGEN_ZIELGRUPPE)).not.toContain(name);
    }
  });

  it("der Versand sagt einem alten Aufrufer ab, statt abzustürzen oder zu senden", () => {
    const versand = lies("supabase/functions/send-transactional-email/index.ts");
    for (const name of ENTFALLEN) expect(versand).toContain(`'${name}'`);
    const absage = versand.indexOf("ENTFALLENE_VORLAGEN.has(templateName)");
    expect(absage).toBeGreaterThan(-1);
    // Die Absage kommt vor dem Nachschlagen in der Registry und vor jedem Versand.
    expect(absage).toBeLessThan(versand.indexOf("const template = TEMPLATES[templateName]"));
    expect(versand.slice(absage, absage + 600)).toContain("status: 410");
  });

  it("die Zuweisung in der Lead-Verwaltung löst keine Kundenmail mehr aus, die Glocke an den Partner bleibt", () => {
    const seite = lies("src/pages/LeadVerwaltung.tsx");
    expect(seite).not.toContain("send-lead-zuweisung-mail");
    expect(seite).not.toContain("sendLeadBestaetigung");

    const einzeln = seite.slice(seite.indexOf("const handleAssign = async"));
    expect(einzeln).toContain("sendAssignNotification(berater.id, berater.name, assignDialog)");

    // Seit dem 26.09.2026 gibt es keine Mehrfachauswahl mehr, zugewiesen wird
    // je Zeile. Die Sammelmail bleibt für andere Aufrufer in beraterHistorie.
    expect(seite).not.toContain("handleBulkAssign");
  });

  it("die Zuweisungs-Function schickt seit 30.09.2026 die neue Willkommensmail, geprüft und nur einmal", () => {
    const fn = lies("supabase/functions/send-lead-zuweisung-mail/index.ts");
    expect(fn).toContain('templateName: "lead-willkommen"');
    // Nur angemeldet, und nur der Zuständige selbst oder die Leitung.
    expect(fn).toContain("nutzerAusJwt(");
    expect(fn).toContain('"admin", "inhaber", "vertriebsleiter"');
    // Einmal je Kontakt, Handbuch-Leads ausgenommen.
    expect(fn).toContain("meta.leadWillkommenGesendet");
    expect(fn).toContain("`lead-willkommen-${kontakt.id}`");
    expect(fn).toContain("meta.handbuchFunnel");
    // Der Partner kommt aus der Datenbank, nicht vom Aufrufer.
    expect(fn).not.toContain("beraterId");

    const vorlage = lies(`${VORLAGEN_ORDNER}/lead-willkommen.tsx`);
    expect(vorlage).toContain("absender: 'zustaendiger-partner'");
    expect(vorlage).toContain("die Kontaktdaten findest du unten");
    expect(VORLAGEN_ZIELGRUPPE["lead-willkommen"]).toBe("kunde");
    expect(lies(`${VORLAGEN_ORDNER}/registry.ts`)).toContain("'lead-willkommen': leadWillkommen");
  });

  it("jede Zuweisung über leadZuweisenWennFrei löst die Willkommensmail aus", () => {
    const store = lies("src/lib/kundenStore.ts");
    const fn = store.slice(store.indexOf("export async function leadZuweisenWennFrei("));
    const rumpf = fn.slice(0, fn.indexOf("\n}\n"));
    // Selbstübernahme direkt, Zuweisung durch Dritte über den Nachlauf
    // `nachZuweisung`. Eine nicht mehr lesbare Zeile gilt seit dem 04.10.2026
    // nicht mehr als Erfolg und bekommt keine Mail.
    expect(rumpf.split("void willkommensMailNachZuweisung(id)").length - 1).toBe(2);
    expect(rumpf.split("await nachZuweisung();").length - 1).toBe(1);
  });

  it("submit-lead schickt dem Interessenten keine Mail mehr, die Partnermail bleibt", () => {
    const fn = lies("supabase/functions/submit-lead/index.ts");
    expect(fn).not.toContain("send-transactional-email");
    expect(fn).not.toContain("sendeBestaetigungsMail");
    expect(fn).toContain('functions.invoke("send-lead-partner-mail"');
  });
});
