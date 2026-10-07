/**
 * Befund HB-003: send-transactional-email prueft selbst, wer aufruft.
 *
 * Je Aufrufergruppe ein Fall: nicht angemeldet abgelehnt, interner Nutzer und
 * Dienst erlaubt, Kunde/Tippgeber nur mit freigegebener Vorlage an einen
 * freigegebenen Empfaenger. Dazu zwei Waechter ueber den Quelltext.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  EXTERNE_VORLAGEN,
  bearerToken,
  ermittleAufrufer,
  pruefeMailZugang,
  type AufruferQuellen,
} from "../../supabase/functions/_shared/mail-zugang";
import { createClient } from "@supabase/supabase-js";
import { istDienstAnfrage, istDienstAufruf } from "../../supabase/functions/_shared/objekt-texte-sammel";

const DIENST = "dienst-schluessel";
const ANON = "anon.jwt.schluessel";

function quellen(rolle: Record<string, "intern" | "extern">): AufruferQuellen {
  return {
    istDienst: (kopf) => kopf === `Bearer ${DIENST}`,
    // Der anon-Schluessel ist ein gueltiges JWT, aber kein Nutzer.
    nutzerAusToken: async (token) => (rolle[token] ? { id: `id-${token}`, email: `${token}@Example.de` } : null),
    istIntern: async (id) => rolle[id.replace(/^id-/, "")] === "intern",
  };
}

const Q = quellen({ partner: "intern", kunde: "extern" });

describe("ermittleAufrufer", () => {
  it("erkennt den Dienst am Service-Role-Schluessel", async () => {
    expect(await ermittleAufrufer(`Bearer ${DIENST}`, Q)).toEqual({ art: "dienst" });
  });

  it("ohne Kopf, mit anon-Schluessel oder erfundenem Token: anonym", async () => {
    expect(await ermittleAufrufer(null, Q)).toEqual({ art: "anonym" });
    expect(await ermittleAufrufer("", Q)).toEqual({ art: "anonym" });
    expect(await ermittleAufrufer(`Bearer ${ANON}`, Q)).toEqual({ art: "anonym" });
    expect(await ermittleAufrufer("Bearer erfunden", Q)).toEqual({ art: "anonym" });
  });

  it("interne Rolle und Nutzer ohne interne Rolle", async () => {
    expect(await ermittleAufrufer("Bearer partner", Q)).toEqual({ art: "intern", nutzerId: "id-partner" });
    expect(await ermittleAufrufer("Bearer kunde", Q)).toEqual({ art: "extern", nutzerId: "id-kunde", email: "kunde@example.de" });
  });

  it("scheitert die Rollenpruefung, wird nicht geraten", async () => {
    const kaputt: AufruferQuellen = { ...Q, istIntern: async () => { throw new Error("rpc"); } };
    await expect(ermittleAufrufer("Bearer partner", kaputt)).rejects.toThrow("rpc");
  });

  it("liest nur einen echten Bearer-Kopf", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer   abc  ")).toBe("abc");
    expect(bearerToken("abc")).toBe("");
  });
});

describe("pruefeMailZugang", () => {
  it("anonym: abgelehnt, egal welche Vorlage", () => {
    expect(pruefeMailZugang({ art: "anonym" }, "bug-report", true)).toMatchObject({ erlaubt: false, status: 401 });
    expect(pruefeMailZugang({ art: "anonym" }, "sa-invitation", true)).toMatchObject({ erlaubt: false, status: 401 });
  });

  it("Dienst und interner Nutzer: erlaubt", () => {
    expect(pruefeMailZugang({ art: "dienst" }, "sa-invitation", false)).toEqual({ erlaubt: true });
    expect(pruefeMailZugang({ art: "intern", nutzerId: "p" }, "sa-invitation", false)).toEqual({ erlaubt: true });
  });

  it("extern: nur freigegebene Vorlage an passenden Empfaenger", () => {
    const kunde = { art: "extern" as const, nutzerId: "k", email: "k@x.de" };
    expect(pruefeMailZugang(kunde, "notartermin-bestaetigung-kunde", true)).toEqual({ erlaubt: true });
    expect(pruefeMailZugang(kunde, "notartermin-bestaetigung-kunde", false)).toMatchObject({ erlaubt: false, status: 403 });
    expect(pruefeMailZugang(kunde, "sa-invitation", true)).toMatchObject({ erlaubt: false, status: 403 });
    expect(pruefeMailZugang(kunde, "vermoegensaufbau-lead", true)).toMatchObject({ erlaubt: false, status: 403 });
  });
});

describe("Waechter ueber den Quelltext", () => {
  const WURZEL = process.cwd();
  const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), "utf8");

  it("jede Vorlage der Freigabeliste gibt es in der Registry", () => {
    const registry = lies("supabase/functions/_shared/transactional-email-templates/registry.ts");
    for (const vorlage of Object.keys(EXTERNE_VORLAGEN)) {
      expect(registry, vorlage).toContain(`'${vorlage}':`);
    }
  });

  it("send-transactional-email weist Aufrufe ohne Anmeldung ab, bevor es den Rumpf liest", () => {
    const quelle = lies("supabase/functions/send-transactional-email/index.ts");
    const pruefung = quelle.indexOf("aufrufer.art === 'anonym'");
    expect(pruefung).toBeGreaterThan(0);
    expect(pruefung).toBeLessThan(quelle.indexOf("await req.json()"));
    expect(quelle).toContain("pruefeMailZugang(aufrufer");
  });

  it("jede Edge Function, die Mails ueber send-transactional-email schickt, hat die Dienstrolle", () => {
    const ordner = join(WURZEL, "supabase/functions");
    const ohneDienst: string[] = [];
    for (const name of readdirSync(ordner)) {
      const datei = join(ordner, name, "index.ts");
      if (name === "send-transactional-email" || !existsSync(datei)) continue;
      const quelle = readFileSync(datei, "utf8");
      const schicktMail = /invoke\(\s*['"]send-transactional-email['"]|sendeVorlage\(/.test(quelle);
      if (schicktMail && !/SERVICE_ROLE/.test(quelle)) ohneDienst.push(name);
    }
    expect(ohneDienst).toEqual([]);
  });
});

/*
 * Anlass 27.09.2026: „Neuen Link senden“ zur Selbstauskunft endete mit
 * „An … konnte keine Mail versendet werden. Grund: … HTTP 401“.
 * send-signature-request ruft send-transactional-email mit
 * `createClient(url, SERVICE_ROLE_KEY)` auf. Mit einem Schluessel im neuen
 * Format schickt supabase-js ihn nicht als Bearer, sondern nur im Kopf
 * `apikey`, und die Pruefung sah nur den Bearer. Hier laeuft der echte
 * Client, `fetch` ist ersetzt, nichts geht ins Netz.
 */
describe("Dienstaufruf von Function zu Function (istDienstAnfrage)", () => {
  /** Die Koepfe, mit denen `functions.invoke` des Dienst-Clients ankommt. */
  async function koepfeVonInvoke(schluessel: string): Promise<Headers> {
    let koepfe = new Headers();
    const client = createClient("https://beispiel.invalid", schluessel, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (_ziel: RequestInfo | URL, init?: RequestInit) => {
          koepfe = new Headers(init?.headers);
          return new Response(JSON.stringify({ success: true }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        },
      },
    });
    await client.functions.invoke("send-transactional-email", { body: {} });
    return koepfe;
  }

  const GEHEIM_NEU = "sb_secret_beispielschluessel0123456789";

  it("neues Schluesselformat nur im Kopf apikey: trotzdem als Dienst erkannt", () => {
    // So schickt supabase-js ab 2.1xx einen sb_secret_-Schluessel. Genau das
    // war die Ursache: Der alte Vergleich allein sagt nein. Bewusst ohne
    // echten Client, damit der Test nicht an der installierten SDK-Version
    // haengt (Codex MAIL-002).
    const koepfe = new Headers({ apikey: GEHEIM_NEU });
    expect(istDienstAufruf(koepfe.get("Authorization"), GEHEIM_NEU)).toBe(false);
    expect(istDienstAnfrage(koepfe, GEHEIM_NEU)).toBe(true);
  });

  it("neues Schluesselformat: was functions.invoke auch schickt, es zaehlt als Dienst", async () => {
    expect(istDienstAnfrage(await koepfeVonInvoke(GEHEIM_NEU), GEHEIM_NEU)).toBe(true);
  });

  it("altes Schluesselformat (JWT) laeuft weiter ueber den Bearer", async () => {
    const geheim = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signatur";
    expect(istDienstAnfrage(await koepfeVonInvoke(geheim), geheim)).toBe(true);
  });

  it("der oeffentliche Schluessel aus dem Browser zaehlt nie als Dienst", async () => {
    const koepfe = await koepfeVonInvoke("sb_publishable_oeffentlich0123456789");
    expect(istDienstAnfrage(koepfe, GEHEIM_NEU)).toBe(false);
    expect(istDienstAnfrage(new Headers(), GEHEIM_NEU)).toBe(false);
    // Fehlt der Schluessel in der Umgebung, passt auch ein leerer Kopf nicht.
    expect(istDienstAnfrage(new Headers({ apikey: "" }), "")).toBe(false);
  });

  it("send-transactional-email benutzt genau diese Pruefung", () => {
    const quelle = readFileSync(join(process.cwd(), "supabase/functions/send-transactional-email/index.ts"), "utf8");
    expect(quelle).toMatch(/istDienstAnfrage\(req\.headers, supabaseServiceKey\)/);
  });
});
