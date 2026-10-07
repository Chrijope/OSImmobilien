/**
 * Die drei Mails an einen nicht erreichten Lead (Entscheidung vom 26.09.2026).
 *
 * Geprüft wird die reine Entscheidung (welche Mail bei welchem Versuch), der
 * Neustart bei einem Partnerwechsel, dass immer der zuständige Partner
 * absendet und nie die Person, die klickt, und dass die drei alten
 * Einzelmails sauber entfallen sind. Die Edge Function läuft in Deno, dort
 * wird am Quelltext geprüft.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const { invoke, stelleKundenspracheSicher } = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
  stelleKundenspracheSicher: vi.fn(() => Promise.resolve("de")),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/lib/kundenSprache", () => ({ stelleKundenspracheSicher }));

import {
  MAIL_BEI_VERSUCH,
  NICHT_ERREICHT_VORLAGEN,
  TEAM_ABSENDER,
  leseMailStand,
  nichtErreichtMailAnfrage,
  nichtErreichtMailVerarbeiten,
  planeNichtErreichtMail,
  type NichtErreichtMailStand,
} from "./nichtErreichtMails";
import {
  TEAM_ABSENDER as TEAM_ABSENDER_SERVER,
  absenderName,
  antwortAdresse,
} from "../../supabase/functions/_shared/zustaendiger-absender";
import { VORLAGEN_ZIELGRUPPE } from "../../supabase/functions/_shared/transactional-email-templates/_zielgruppe";
import { antwortAn } from "../../supabase/functions/_shared/transactional-email-templates/_nicht-erreicht";

const WURZEL = process.cwd();
const VORLAGEN_ORDNER = "supabase/functions/_shared/transactional-email-templates";
const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), "utf8");

/** Spielt n verpasste Anrufe nacheinander durch und sammelt die Mails. */
function spiele(n: number, partnerId: string | null, start: unknown = undefined, email = "lead@example.com") {
  let stand: unknown = start;
  const mails: Array<{ versuch: number; nummer: number }> = [];
  for (let i = 0; i < n; i++) {
    const plan = planeNichtErreichtMail({ bisher: stand, partnerId, fortgeschritten: false, email });
    if (plan.mail) mails.push({ versuch: plan.mail.versuch, nummer: plan.mail.nummer });
    stand = plan.stand;
  }
  return { stand: stand as NichtErreichtMailStand, mails };
}

describe("Welche Mail bei welchem Versuch", () => {
  it("Mail 1 beim 1., Mail 2 beim 4., Mail 3 beim 10. Versuch, sonst keine", () => {
    const { mails, stand } = spiele(15, "partner-a");
    expect(mails).toEqual([
      { versuch: 1, nummer: 1 },
      { versuch: 4, nummer: 2 },
      { versuch: 10, nummer: 3 },
    ]);
    expect(stand).toEqual({ partnerId: "partner-a", versuche: 15, gesendet: [1, 4, 10] });
  });

  it("die Tabelle nennt genau die drei Versuche", () => {
    expect(MAIL_BEI_VERSUCH).toEqual({ 1: 1, 4: 2, 10: 3 });
    expect(Object.values(NICHT_ERREICHT_VORLAGEN)).toEqual([
      "nicht-erreicht-mail-1",
      "nicht-erreicht-mail-2",
      "nicht-erreicht-mail-3",
    ]);
  });

  it("nach einem Partnerwechsel beginnt die Folge beim neuen Partner wieder bei Mail 1", () => {
    const beiA = spiele(5, "partner-a").stand;
    const plan = planeNichtErreichtMail({ bisher: beiA, partnerId: "partner-b", fortgeschritten: false, email: "lead@example.com" });
    expect(plan.mail?.nummer).toBe(1);
    expect(plan.stand).toEqual({ partnerId: "partner-b", versuche: 1, gesendet: [1] });
    expect(spiele(10, "partner-b", beiA).mails.map((m) => m.nummer)).toEqual([1, 2, 3]);
  });

  it("auch der Wechsel von niemandem zu einem Partner beginnt von vorn", () => {
    const ohne = spiele(2, null).stand;
    expect(ohne.partnerId).toBe("");
    const plan = planeNichtErreichtMail({ bisher: ohne, partnerId: "partner-a", fortgeschritten: false, email: "x@y.de" });
    expect(plan.mail?.nummer).toBe(1);
  });

  it("ab Beratungsgespräch keine Mail und kein Zählen", () => {
    const plan = planeNichtErreichtMail({ bisher: undefined, partnerId: "partner-a", fortgeschritten: true, email: "lead@example.com" });
    expect(plan).toEqual({ stand: null, mail: null });
  });

  it("ohne E-Mail-Adresse keine Mail, gezählt wird trotzdem", () => {
    for (const email of ["", "   ", null, undefined]) {
      const plan = planeNichtErreichtMail({ bisher: undefined, partnerId: "partner-a", fortgeschritten: false, email });
      expect(plan.mail).toBeNull();
      expect(plan.stand).toEqual({ partnerId: "partner-a", versuche: 1, gesendet: [] });
    }
  });

  it("dieselbe Mail geht an denselben Lead vom selben Partner nur einmal", () => {
    const bisher = { partnerId: "partner-a", versuche: 3, gesendet: [1, 4] };
    const plan = planeNichtErreichtMail({ bisher, partnerId: "partner-a", fortgeschritten: false, email: "lead@example.com" });
    expect(plan.mail).toBeNull();
    expect(plan.stand?.versuche).toBe(4);
  });

  it("liest Altbestand und kaputte Werte vorsichtig", () => {
    expect(leseMailStand(undefined)).toBeNull();
    expect(leseMailStand("kaputt")).toBeNull();
    expect(leseMailStand({ versuche: -1 })).toBeNull();
    expect(leseMailStand({ partnerId: " a ", versuche: "2", gesendet: [1, "x"] })).toEqual({
      partnerId: "a",
      versuche: 2,
      gesendet: [1],
    });
  });
});

describe("Absender ist immer der zuständige Partner", () => {
  beforeEach(() => {
    invoke.mockClear();
    stelleKundenspracheSicher.mockClear();
  });

  it("die Anfrage trägt die Kennung aus zustaendig_id und einen Schlüssel je Kontakt, Partner und Mail", () => {
    const body = nichtErreichtMailAnfrage({
      kontaktId: "k1",
      email: " lead@example.com ",
      kundeName: "Max Muster",
      partnerId: "partner-a",
      vorlage: "nicht-erreicht-mail-1",
    });
    expect(body).toEqual({
      templateName: "nicht-erreicht-mail-1",
      recipientEmail: "lead@example.com",
      idempotencyKey: "nicht-erreicht-mail-1-k1-partner-a",
      kontaktId: "k1",
      templateData: { name: "Max Muster", beraterUserId: "partner-a" },
    });
  });

  it("ohne zuständigen Partner schreibt das OS Immobilien Team, nicht wer geklickt hat", () => {
    const body = nichtErreichtMailAnfrage({ kontaktId: "k1", email: "a@b.de", kundeName: "", partnerId: "", vorlage: "nicht-erreicht-mail-1" });
    expect(body.templateData).toEqual({ name: "", berater: { name: "OS Immobilien Team", email: "os@os-immobilien.com" } });
    expect(body.idempotencyKey).toBe("nicht-erreicht-mail-1-k1-team");
    // Browser und Server nennen dasselbe Haus.
    expect(TEAM_ABSENDER).toEqual(TEAM_ABSENDER_SERVER);
    // Auch der mailto-Rückfall in Mail 1 zeigt auf office@.
    expect(antwortAn(null)).toBe("os@os-immobilien.com");
    expect(antwortAn({ name: "Christian Peetz", email: "os@os-immobilien.com" })).toBe("os@os-immobilien.com");
  });

  it("klickt eine Setterin, geht die Mail trotzdem im Namen des Partners", async () => {
    // Die Funktion nimmt den angemeldeten Nutzer gar nicht entgegen. Ob eine
    // Setterin oder der Partner selbst klickt, ergibt denselben Aufruf.
    const stand = nichtErreichtMailVerarbeiten(
      { id: "k1", email: "lead@example.com", vorname: "Max", nachname: "Muster", zustaendig_id: "partner-a" },
      { fortgeschritten: false },
    );
    expect(stand).toEqual({ partnerId: "partner-a", versuche: 1, gesendet: [1] });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const [name, { body }] = invoke.mock.calls[0] as unknown as [string, { body: any }];
    expect(name).toBe("send-transactional-email");
    expect(body.templateData.beraterUserId).toBe("partner-a");
    expect(body.sprache).toBe("de");
    expect(stelleKundenspracheSicher).toHaveBeenCalledWith("k1");
  });

  it("bei Versuch 2 geht nichts raus und es wird nicht nach der Sprache gefragt", async () => {
    const stand = nichtErreichtMailVerarbeiten(
      { id: "k1", email: "lead@example.com", zustaendig_id: "partner-a", nichtErreichtMails: { partnerId: "partner-a", versuche: 1, gesendet: [1] } },
      { fortgeschritten: false },
    );
    expect(stand?.versuche).toBe(2);
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke).not.toHaveBeenCalled();
    expect(stelleKundenspracheSicher).not.toHaveBeenCalled();
  });

  it("der Server nimmt Name und Adresse des Partners, sonst das Team", () => {
    expect(absenderName({ name: "Christian Peetz" })).toBe("Christian Peetz | OS Immobilien");
    expect(absenderName(null)).toBe("OS Immobilien Team");
    expect(absenderName({ name: "  " })).toBe("OS Immobilien Team");
    // Zeichen, die den Mailkopf aufbrechen könnten, fliegen raus.
    expect(absenderName({ name: 'Eve <evil@x.de>\r\nBcc: a@b' })).not.toMatch(/[<>\r\n]/);
    expect(antwortAdresse({ email: "os@os-immobilien.com" })).toBe("os@os-immobilien.com");
    expect(antwortAdresse({ email: "kaputt" })).toBe("os@os-immobilien.com");
    expect(antwortAdresse(null)).toBe("os@os-immobilien.com");
  });

  it("send-transactional-email liest den Partner selbst und setzt Absender und Antwortadresse", () => {
    const versand = lies("supabase/functions/send-transactional-email/index.ts");
    const block = versand.slice(versand.indexOf("template.absender === 'zustaendiger-partner'"));
    expect(block).toContain("zustaendigenPartnerLaden(supabase as never, kontaktId)");
    expect(block).toContain("beraterUserId: partner.id");
    expect(block).toContain("absenderAnzeige = absenderName(partner)");
    expect(block).toContain("replyTo = antwortAdresse(partner)");
    expect(versand).toContain("from: `${absenderAnzeige} <noreply@${FROM_DOMAIN}>`");
    // Vor der Auflösung des Ansprechpartners, sonst unterschriebe der Klickende.
    expect(versand.indexOf("template.absender === 'zustaendiger-partner'")).toBeLessThan(
      versand.indexOf("templateData = await ansprechpartnerErgaenzen("),
    );
    // Die Sperrliste bleibt unangetastet und kommt vorher.
    expect(versand.indexOf(".from('suppressed_emails')")).toBeLessThan(
      versand.indexOf("template.absender === 'zustaendiger-partner'"),
    );
    const zustaendig = lies("supabase/functions/_shared/zustaendiger-absender.ts");
    expect(zustaendig).toContain(".select('zustaendig_id')");
    expect(zustaendig).toContain(".eq('id', partnerId)");
    for (const n of [1, 2, 3]) {
      expect(lies(`${VORLAGEN_ORDNER}/nicht-erreicht-mail-${n}.tsx`)).toContain("absender: 'zustaendiger-partner'");
    }
  });
});

describe("Die Aufrufstellen nutzen die zentrale Funktion", () => {
  it("das Kundenprofil schickt keine eigene Mail mehr bei Nicht erreicht", () => {
    const seite = lies("src/pages/KundenDetail.tsx");
    // Nur der Name, die Parameter des Handlers ändern sich mit dem Anruf-Dialog.
    const start = seite.indexOf("const handleSetterNichtErreicht = (");
    const ende = seite.indexOf("// Follow-Up Dialog state", start);
    const handler = seite.slice(start, ende);
    expect(start).toBeGreaterThan(-1);
    expect(handler).toContain("nichtErreichtMailVerarbeiten(kunde, { fortgeschritten: isAdvancedStage })");
    expect(handler).toContain("nichtErreichtMails,");
    expect(handler).not.toContain("send-transactional-email");
  });

  it("das Setter-Skript ebenso", () => {
    const skript = lies("src/components/setter/SetterSkript.tsx");
    const start = skript.indexOf("const handleNichtErreicht = () => {");
    const handler = skript.slice(start, skript.indexOf("// Follow-Up Dialog state", start));
    expect(handler).toContain("nichtErreichtMailVerarbeiten(kunde, { fortgeschritten })");
    expect(handler).not.toContain("sendKundenEmail(");
  });
});

// Zusammengesetzt, damit diese Datei selbst den Suchlauf nicht auslöst.
const ENTFALLEN = ["setter", "vp", "lead"].map((v) => `${v}-nicht-${"erreicht"}`);

// Wo die alten Namen noch stehen dürfen: die Sperrliste im Versand, und das
// Vertriebshandbuch, dort ist der dritte Name die Kennung eines
// Handbuchartikels und keine Mailvorlage.
const ERLAUBT = new Set(["supabase/functions/send-transactional-email/index.ts", "src/lib/vertriebshandbuch.ts"]);

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

describe("Die alten Einzelmails je Versuch sind entfallen", () => {
  it("die drei Vorlagennamen stehen nirgends mehr im Code, außer in der Sperrliste", () => {
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
      expect(registry).not.toContain(`'${name}'`);
      expect(Object.keys(VORLAGEN_ZIELGRUPPE)).not.toContain(name);
    }
    for (const name of Object.values(NICHT_ERREICHT_VORLAGEN)) {
      expect(registry).toContain(`'${name}': `);
      expect(VORLAGEN_ZIELGRUPPE[name]).toBe("kunde");
    }
  });

  it("der Versand sagt einem alten Aufrufer mit 410 ab, bevor er etwas nachschlägt", () => {
    const versand = lies("supabase/functions/send-transactional-email/index.ts");
    const liste = versand.slice(versand.indexOf("const ENTFALLENE_VORLAGEN"), versand.indexOf("])", versand.indexOf("const ENTFALLENE_VORLAGEN")));
    for (const name of ENTFALLEN) expect(liste).toContain(`'${name}'`);
    const absage = versand.indexOf("ENTFALLENE_VORLAGEN.has(templateName)");
    expect(absage).toBeLessThan(versand.indexOf("const template = TEMPLATES[templateName]"));
    expect(versand.slice(absage, absage + 600)).toContain("status: 410");
  });
});

describe("Die Texte der drei Mails", () => {
  const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const texte = [1, 2, 3].map((n) => ohneKommentare(lies(`${VORLAGEN_ORDNER}/nicht-erreicht-mail-${n}.tsx`)));

  it("haben keine Gedankenstriche", () => {
    for (const t of texte) expect(t).not.toMatch(/[–—]/);
  });

  it("duzen", () => {
    for (const t of texte) expect(t).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer)\b/);
  });

  it("Mail 1 nennt die Adresse des Partners als mailto-Link, statt auf noreply antworten zu lassen", () => {
    const mail1 = texte[0];
    // Kein "antworte auf diese Mail" und kein "reply to this email" mehr.
    expect(mail1).not.toMatch(/antworte auf diese Mail|reply to this email/i);
    expect(mail1).toContain("oder schreib mir kurz an ");
    expect(mail1).toContain("Schreib mir einfach kurz an ");
    expect(mail1).toContain("drop me a line at ");
    // Die Adresse im Satz ist der Link, und alle Zeitfenster-Wege gehen per
    // mailto an dieselbe Partneradresse (ohne Partner office@).
    expect(mail1).toContain("const partnerAdresse = antwortAn(berater)");
    expect(mail1).toContain("antwortLink(partnerAdresse, t.antwortBetreff");
    expect(mail1).toMatch(/<Link href=\{zeitfensterLink\}[\s\S]*?\{partnerAdresse\}/);
    expect(mail1).toContain("<Nebenhandlung href={zeitfensterLink}");
    expect(mail1).toMatch(/<Handlung\s+sprache=\{sprache\}\s+href=\{zeitfensterLink\}/);
  });

  it("Mail 2 ist eine andere Mail als Mail 1", () => {
    expect(texte[1]).not.toContain("Ich habe es gerade bei dir versucht");
    expect(texte[1]).toContain("Ich melde mich noch einmal");
  });

  it("Mail 3 bietet beide Antworten fertig zum Senden an", () => {
    expect(texte[2]).toContain("Später gern");
    expect(texte[2]).toContain("Kein Interesse, bitte schließen");
    expect(texte[2]).toContain("Nebenhandlung");
  });
});
