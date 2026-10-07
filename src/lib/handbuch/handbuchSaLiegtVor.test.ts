/**
 * HB-009: Offene Selbstauskunft, wenn die Selbstauskunft schon unterschrieben
 * vorliegt, und die Unterscheidung „technisch gescheitert“.
 *
 * Geprüft wird `handbuchNachLeadAnlegen` gegen eine kleine Ersatz-Datenbank:
 * Mail an die gespeicherte Adresse, Glocke an Partner oder Leitung, und
 * `zustellung` für bekannte und neue Adressen in derselben Form.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SA_AKTUALISIEREN_LEITUNG,
  SA_AKTUALISIEREN_TITEL,
  handbuchAntwort,
  handbuchDublettenAntwort,
  handbuchNachLeadAnlegen,
  zustellungAus,
  type HandbuchAnlageEingabe,
} from "../../../supabase/functions/_shared/handbuch-anlage.ts";

type Antwort = { data: unknown; error: unknown };

/** Jede Tabelle antwortet mit einem festen Ergebnis; Einfügungen werden mitgeschrieben. */
function ersatzDb(opts: {
  investments: Array<Record<string, unknown>>;
  saTokenFehler?: boolean;
  mail?: "ok" | "fehler";
  leitung?: string[];
}) {
  const eingefuegt: Record<string, unknown[]> = {};
  const mails: Array<Record<string, unknown>> = [];
  const antwortFuer = (tabelle: string): Antwort => {
    if (tabelle === "investments") return { data: opts.investments, error: null };
    if (tabelle === "sa_fill_tokens") return opts.saTokenFehler ? { data: null, error: { message: "kaputt" } } : { data: { token: "neuer-sa-token" }, error: null };
    if (tabelle === "user_roles") return { data: (opts.leitung ?? []).map((user_id) => ({ user_id })), error: null };
    return { data: null, error: null };
  };
  const db = {
    from(tabelle: string) {
      const kette: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "or", "order", "limit", "single", "maybeSingle", "update"]) kette[m] = () => kette;
      kette.insert = (zeilen: unknown) => {
        (eingefuegt[tabelle] ??= []).push(...(Array.isArray(zeilen) ? zeilen : [zeilen]));
        return kette;
      };
      kette.then = (ok: (a: Antwort) => unknown) => Promise.resolve(antwortFuer(tabelle)).then(ok);
      return kette;
    },
    functions: {
      invoke: vi.fn(async (_name: string, args: { body: Record<string, unknown> }) => {
        mails.push(args.body);
        return opts.mail === "fehler" ? { data: null, error: { message: "Versand kaputt" } } : { data: { success: true }, error: null };
      }),
    },
  };
  return { db, eingefuegt, mails };
}

const UNTERSCHRIEBEN = [{ id: "inv-1", erstellt_am: "2026-09-01", meta: { saSigned: true } }];
const OFFEN = [{ id: "inv-1", erstellt_am: "2026-09-01", meta: {} }];

function eingabe(extra: Partial<HandbuchAnlageEingabe> = {}): HandbuchAnlageEingabe {
  return {
    kontaktId: "kontakt-1",
    beraterId: "partner-1",
    vorname: "Fremd",
    nachname: "Eingabe",
    email: "eingegeben@example.org",
    antworten: null,
    token: "",
    dublette: { erkanntUeber: "email", gespeicherteEmail: "gespeichert@example.org", gespeicherterName: "Erika Muster" },
    ...extra,
  };
}

describe("Selbstauskunft liegt schon vor", () => {
  it("Mail an die gespeicherte Adresse und Glocke an den Partner, kein Token", async () => {
    const { db, eingefuegt, mails } = ersatzDb({ investments: UNTERSCHRIEBEN });
    const e = await handbuchNachLeadAnlegen(db, eingabe());
    expect(e.saToken).toBeNull();
    expect(e.zustellung).toBe("ok");
    expect(mails).toHaveLength(1);
    expect(mails[0].templateName).toBe("selbstauskunft-liegt-vor");
    expect(mails[0].recipientEmail).toBe("gespeichert@example.org");
    expect(mails[0].kontaktId).toBe("kontakt-1");
    expect((mails[0].templateData as { name: string }).name).toBe("Erika Muster");
    const glocken = eingefuegt.benachrichtigungen as Array<{ benutzer_id: string; titel: string; link: string }>;
    expect(glocken.map((g) => g.benutzer_id)).toEqual(["partner-1"]);
    expect(glocken[0].titel).toBe(SA_AKTUALISIEREN_TITEL);
    expect(glocken[0].link).toBe("/kunden/kontakt-1");
    expect(eingefuegt.sa_fill_tokens).toBeUndefined();
  });

  it("ohne Partner geht die Glocke an die Leitung", async () => {
    const { db, eingefuegt } = ersatzDb({ investments: UNTERSCHRIEBEN, leitung: ["admin-1", "vl-1", "admin-1"] });
    await handbuchNachLeadAnlegen(db, eingabe({ beraterId: null }));
    expect((eingefuegt.benachrichtigungen as Array<{ benutzer_id: string }>).map((g) => g.benutzer_id)).toEqual(["admin-1", "vl-1"]);
    expect([...SA_AKTUALISIEREN_LEITUNG]).toEqual(["admin", "inhaber", "vertriebsleiter"]);
  });

  it("scheitert die Mail, heißt es „fehler“", async () => {
    const { db } = ersatzDb({ investments: UNTERSCHRIEBEN, mail: "fehler" });
    const e = await handbuchNachLeadAnlegen(db, eingabe());
    expect(e.zustellung).toBe("fehler");
  });

  it("bei Erkennung über das Telefon bleibt es still: keine Mail, keine Glocke, „ok“", async () => {
    const { db, eingefuegt, mails } = ersatzDb({ investments: UNTERSCHRIEBEN });
    const e = await handbuchNachLeadAnlegen(db, eingabe({ dublette: { erkanntUeber: "telefon", gespeicherteEmail: "gespeichert@example.org" } }));
    expect(mails).toHaveLength(0);
    expect(eingefuegt.benachrichtigungen).toBeUndefined();
    expect(e.zustellung).toBe("ok");
  });
});

describe("Technisches Scheitern, für bekannte und neue Adressen gleich", () => {
  it("Link nicht angelegt: „fehler“, neu wie bekannt", async () => {
    for (const dublette of [undefined, eingabe().dublette]) {
      const { db } = ersatzDb({ investments: OFFEN, saTokenFehler: true });
      const e = await handbuchNachLeadAnlegen(db, eingabe({ dublette }));
      expect(e.zustellung).toBe("fehler");
    }
  });

  it("Link und Mail gelungen: „ok“", async () => {
    const { db, mails } = ersatzDb({ investments: OFFEN });
    const e = await handbuchNachLeadAnlegen(db, eingabe());
    expect(e.zustellung).toBe("ok");
    expect(mails[0].templateName).toBe("sa-invitation");
  });

  it("die Dublettenantwort trägt nur `zustellung`, nie ein Token", () => {
    expect(handbuchDublettenAntwort({ zustellung: "fehler" })).toEqual({ success: true, handbuchToken: null, saToken: null, zustellung: "fehler" });
    expect(handbuchDublettenAntwort(null)).toEqual(handbuchAntwort(null));
    expect(Object.keys(handbuchDublettenAntwort({ zustellung: "ok" })).sort()).toEqual(Object.keys(handbuchAntwort(null)).sort());
  });

  it("nur technische Hinweise zählen als Fehler", () => {
    expect(zustellungAus(["dublette_ohne_sa_link", "migration_handbuch_fehlt", "sa_bereits_unterschrieben"])).toBe("ok");
    expect(zustellungAus(["sa_mail_fehler"])).toBe("fehler");
  });
});

/**
 * Die Mail gehört zur Gruppe F (Selbstauskunft) und siezt, wie `sa-invitation`.
 * Geprüft wird der Quelltext ohne Kommentare, denn Vitest kann die Vorlage
 * nicht laden (React kommt über `npm:`).
 */
describe("Mail „Selbstauskunft liegt vor“ siezt (Gruppe F)", () => {
  const quelle = readFileSync(
    join(__dirname, "../../../supabase/functions/_shared/transactional-email-templates/selbstauskunft-liegt-vor.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("grüßt förmlich und spricht mit Sie an", () => {
    expect(quelle).toContain("foermlich(name, sprache, kundeAnrede)");
    expect(quelle).toContain(
      "Ihre Selbstauskunft liegt uns bereits vor. Möchten Sie etwas ändern, meldet sich Ihr Berater bei Ihnen.",
    );
  });

  it("enthält kein Du und keine Gedankenstriche", () => {
    expect(quelle.match(/\b(du|dir|dich|dein|deine|deinen|deinem|deiner|Du|Dein|Deine|Möchtest|hast)\b/g) ?? []).toEqual([]);
    expect(quelle).not.toContain("hallo(");
    expect(quelle).not.toMatch(/[–—]/);
  });
});
