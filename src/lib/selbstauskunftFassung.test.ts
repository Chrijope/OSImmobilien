/**
 * Fassungskennung der Selbstauskunft (Befund HB-004, 26.09.2026).
 *
 * Jede abgeschickte Fassung trägt eine eigene Kennung, jede Unterschrift
 * gehört zu genau einer Fassung, und abgeschlossen wird nur, wenn alle
 * erwarteten Personen dieselbe Fassung unterschrieben haben.
 *
 * Die Edge Functions lassen sich hier nicht ausführen. Der Ablauf wird mit
 * denselben Regeln aus `_shared/` in einer kleinen Tabelle im Speicher
 * nachgestellt, so wie `submit-sa-signature`, `send-signature-request`,
 * `sign_signature_request` und `finalize-selbstauskunft` sie anwenden. Der
 * Quelltext der Functions wird darauf geprüft, dass er die Regeln benutzt.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SA_PERSON_TYPEN,
  SA_UEBERHOLT,
  saAeltereFassungenUeberholen,
  saAktuelleFassung,
  saAufzuraeumendePersonTypen,
  saErwartetePersonen,
  saFassungFuerVersand,
  saFassungVon,
  saUnterschriftenStand,
  type SaAnfrage,
} from "../../supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts";
import { SIGNATUR_SEITE_TEXTE } from "@/lib/signaturSeiteTexte";

type Zeile = SaAnfrage & { token: string; meta?: Record<string, unknown> };

const LINK_1 = "11111111-1111-4111-8111-111111111111";
const LINK_2 = "22222222-2222-4222-8222-222222222222";

const V1 = { vorname: "Max", einkommen: 4000, person2: true, person2Data: { vorname: "Erika" } };
const V2 = { vorname: "Max", einkommen: 5200, person2: true, person2Data: { vorname: "Erika" } };
const OHNE_P2 = { vorname: "Max", person2: false, person2Data: { vorname: "" } };

let zeilen: Zeile[] = [];
let uhr = 0;
let laufend = 0;
const jetzt = () => new Date(Date.UTC(2026, 8, 26, 8, 0, uhr++)).toISOString();
const neuesToken = () => `tok-${++laufend}`;

beforeEach(() => {
  zeilen = [];
  uhr = 0;
  laufend = 0;
});

/** Wie `saAeltereFassungenUeberholen` in der Datenbank. */
function ueberholen(fassung: string) {
  for (const z of zeilen) {
    if (z.status === "pending" && (SA_PERSON_TYPEN as readonly string[]).includes(z.person_type) && saFassungVon(z) !== fassung) {
      z.status = SA_UEBERHOLT;
    }
  }
}

/** send-signature-request: legt offene Anfragen an und gibt ihre Tokens zurück. */
function anfordern(args: { personen: string[]; saData: unknown; vorgegeben?: string }): Record<string, string> {
  const v = saFassungFuerVersand({
    vorgegeben: args.vorgegeben ?? null,
    bestehende: zeilen,
    empfaengerTypen: args.personen,
    saData: args.saData,
    neueKennung: crypto.randomUUID(),
  });
  if (v.neu && v.fassung) ueberholen(v.fassung);
  const typen = saAufzuraeumendePersonTypen(args.personen);
  zeilen = zeilen.filter((z) => !(z.status === "pending" && typen.includes(z.person_type)));
  const tokens: Record<string, string> = {};
  for (const p of args.personen) {
    const token = neuesToken();
    tokens[p] = token;
    zeilen.push({
      token, person_type: p, status: "pending", created_at: jetzt(), sa_data: v.saData,
      ...(v.fassung ? { meta: { saFassung: v.fassung } } : {}),
    });
  }
  return tokens;
}

/** submit-sa-signature: Ausfüll-Link abschicken, Unterschriften am Bildschirm, Person 2 optional per Mail. */
function abschicken(args: { link: string; saData: unknown; amBildschirm: string[]; p2PerMail?: boolean }): Record<string, string> {
  ueberholen(args.link);
  for (const p of args.amBildschirm) {
    const doppelt = zeilen.some((z) => z.person_type === p && z.status === "signed" && saFassungVon(z) === args.link);
    if (doppelt) continue;
    const zeit = jetzt();
    zeilen.push({
      token: neuesToken(), person_type: p, status: "signed", created_at: zeit, signed_at: zeit,
      signature_data: `${p}-${args.link.slice(0, 1)}`, sa_data: args.saData, meta: { saFassung: args.link },
    });
  }
  return args.p2PerMail ? anfordern({ personen: ["person2"], saData: args.saData, vorgegeben: args.link }) : {};
}

/** sign_signature_request: nimmt nur offene Anfragen an. */
function unterschreiben(token: string) {
  const z = zeilen.find((r) => r.token === token);
  if (!z || z.status !== "pending") throw new Error("Invalid, expired or already-signed signature request");
  z.status = "signed";
  z.signed_at = jetzt();
  z.signature_data = `${z.person_type}-per-link-${token}`;
}

/** finalize-selbstauskunft, wie es den Stand berechnet. */
function abschluss() {
  const angaben = saUnterschriftenStand(zeilen).saData;
  return saUnterschriftenStand(zeilen, { erwartet: saErwartetePersonen(angaben) });
}

describe("Das Codex-Szenario: zwei Ausfüll-Links vor der ersten Unterschrift", () => {
  it("schließt nie die zweite Fassung mit der Unterschrift von Person 1 zur ersten ab", () => {
    // Link 1: Person 1 unterschreibt, Person 2 bekommt ihre Mail.
    const mail1 = abschicken({ link: LINK_1, saData: V1, amBildschirm: ["person1"], p2PerMail: true });
    expect(abschluss().alleUnterschrieben).toBe(false);

    // Link 2 mit geänderten Angaben: Person 1 unterschreibt erneut.
    const mail2 = abschicken({ link: LINK_2, saData: V2, amBildschirm: ["person1"], p2PerMail: true });

    // Die neue Unterschrift von Person 1 wurde gespeichert, nicht übersprungen.
    const p1 = zeilen.filter((z) => z.person_type === "person1" && z.status === "signed");
    expect(p1.map(saFassungVon)).toEqual([LINK_1, LINK_2]);

    // Die alte Anfrage an Person 2 ist überholt und nicht mehr unterschreibbar.
    expect(zeilen.find((z) => z.token === mail1.person2)?.status).toBe(SA_UEBERHOLT);
    expect(() => unterschreiben(mail1.person2)).toThrow();

    let stand = abschluss();
    expect(stand.fassung).toBe(LINK_2);
    expect(stand.alleUnterschrieben).toBe(false);
    expect(Object.keys(stand.unterschriften)).toEqual(["person1"]);

    // Person 2 unterschreibt die neue Fassung: fertig, mit genau diesen Angaben und Unterschriften.
    unterschreiben(mail2.person2);
    stand = abschluss();
    expect(stand.alleUnterschrieben).toBe(true);
    expect(stand.saData).toEqual(V2);
    expect(stand.unterschriften.person1.signatureData).toBe("person1-2");
    expect(stand.unterschriften.person2.signatureData).toBe(`person2-per-link-${mail2.person2}`);
  });

  it("zählt eine Unterschrift von Person 2 zur ersten Fassung nicht für die zweite", () => {
    const mail1 = abschicken({ link: LINK_1, saData: V1, amBildschirm: ["person1"], p2PerMail: true });
    // Person 2 unterschreibt noch rechtzeitig die erste Fassung: die ist damit fertig.
    unterschreiben(mail1.person2);
    expect(abschluss()).toMatchObject({ alleUnterschrieben: true, saData: V1, fassung: LINK_1 });

    // Danach kommt Link 2 mit neuen Angaben: Person 2 muss die neue Fassung unterschreiben.
    const mail2 = abschicken({ link: LINK_2, saData: V2, amBildschirm: ["person1"], p2PerMail: true });
    let stand = abschluss();
    expect(stand.alleUnterschrieben).toBe(false);
    expect(stand.unterschriften.person2).toBeUndefined();

    unterschreiben(mail2.person2);
    stand = abschluss();
    expect(stand).toMatchObject({ alleUnterschrieben: true, saData: V2, fassung: LINK_2 });
  });

  it("schließt ab, wenn die neue Fassung Person 2 nicht mehr enthält, und überholt deren alten Link", () => {
    const mail1 = abschicken({ link: LINK_1, saData: V1, amBildschirm: ["person1"], p2PerMail: true });
    abschicken({ link: LINK_2, saData: OHNE_P2, amBildschirm: ["person1"] });
    expect(abschluss()).toMatchObject({ alleUnterschrieben: true, saData: OHNE_P2 });
    expect(zeilen.find((z) => z.token === mail1.person2)?.status).toBe(SA_UEBERHOLT);
  });
});

describe("Normalfälle mit Fassungskennung", () => {
  it("eine Person: fertig mit der eigenen Unterschrift", () => {
    abschicken({ link: LINK_1, saData: OHNE_P2, amBildschirm: ["person1"] });
    expect(abschluss()).toMatchObject({ alleUnterschrieben: true, fassung: LINK_1, anzahlGesamt: 1 });
  });

  it("zwei Personen am selben Bildschirm: dieselbe Fassung, fertig", () => {
    abschicken({ link: LINK_1, saData: V1, amBildschirm: ["person1", "person2"] });
    expect(abschluss()).toMatchObject({ alleUnterschrieben: true, anzahlUnterschrieben: 2 });
  });

  it("legt bei einem Wiederholungsversuch desselben Links keine zweite Unterschrift an", () => {
    abschicken({ link: LINK_1, saData: OHNE_P2, amBildschirm: ["person1"] });
    abschicken({ link: LINK_1, saData: OHNE_P2, amBildschirm: ["person1"] });
    expect(zeilen.filter((z) => z.status === "signed")).toHaveLength(1);
  });

  it("Versand aus dem CRM an beide ist eine neue Fassung, der Neuversand an eine Person bleibt in ihr", () => {
    const beide = anfordern({ personen: ["person1", "person2"], saData: V1 });
    const fassung = saAktuelleFassung(zeilen);
    expect(fassung).toMatch(/^[0-9a-f-]{36}$/);
    unterschreiben(beide.person1);

    // „Neuen Link senden“ an Person 2, versehentlich mit abweichenden Angaben:
    // gehört zur selben Fassung und trägt deren Angaben.
    const neu = anfordern({ personen: ["person2"], saData: V2 });
    const zeile = zeilen.find((z) => z.token === neu.person2)!;
    expect(saFassungVon(zeile)).toBe(fassung);
    expect(zeile.sa_data).toEqual(V1);
    // Die Unterschrift von Person 1 bleibt gültig.
    unterschreiben(neu.person2);
    expect(abschluss()).toMatchObject({ alleUnterschrieben: true, saData: V1 });
  });

  it("ein neuer Versand an beide überholt die offenen Anfragen der vorigen Fassung", () => {
    const alt = anfordern({ personen: ["person1", "person2"], saData: V1 });
    anfordern({ personen: ["person1", "person2"], saData: V2 });
    expect(zeilen.find((z) => z.token === alt.person1)?.status).toBe(SA_UEBERHOLT);
    expect(zeilen.find((z) => z.token === alt.person2)?.status).toBe(SA_UEBERHOLT);
    expect(() => unterschreiben(alt.person1)).toThrow();
  });
});

describe("Bestand ohne Fassungskennung verhält sich wie bisher", () => {
  it("rechnet ohne Kennung mit der bisherigen Zählweise", () => {
    zeilen.push(
      { token: "a", person_type: "person1", status: "signed", created_at: jetzt(), signed_at: jetzt(), sa_data: V1 },
      { token: "b", person_type: "person2", status: "pending", created_at: jetzt(), sa_data: V1 },
    );
    expect(saAktuelleFassung(zeilen)).toBeNull();
    let stand = abschluss();
    expect(stand).toMatchObject({ fassung: null, alleUnterschrieben: false });
    unterschreiben("b");
    stand = abschluss();
    expect(stand.alleUnterschrieben).toBe(true);
  });

  it("der Neuversand an eine Person bleibt im Bestand ohne Kennung", () => {
    zeilen.push(
      { token: "a", person_type: "person1", status: "signed", created_at: jetzt(), signed_at: jetzt(), sa_data: V1 },
      { token: "b", person_type: "person2", status: "pending", created_at: jetzt(), sa_data: V1 },
    );
    const neu = anfordern({ personen: ["person2"], saData: V1 });
    expect(saFassungVon(zeilen.find((z) => z.token === neu.person2))).toBeNull();
    unterschreiben(neu.person2);
    expect(abschluss().alleUnterschrieben).toBe(true);
  });

  it("der Zeitvermerk fassungSeit gilt im Bestand weiter", () => {
    const alt = "2026-09-26T08:00:00.000Z";
    const stand = saUnterschriftenStand(
      [{ person_type: "person1", status: "signed", created_at: alt, signed_at: alt }],
      { fassungSeit: "2026-09-26T09:00:00.000Z", erwartet: ["person1"] },
    );
    expect(stand.alleUnterschrieben).toBe(false);
  });

  it("ein neuer Ausfüll-Link überholt offene Anfragen aus dem Bestand, Unterschriebenes bleibt", () => {
    zeilen.push(
      { token: "a", person_type: "person1", status: "signed", created_at: jetzt(), signed_at: jetzt(), sa_data: V1 },
      { token: "b", person_type: "person2", status: "pending", created_at: jetzt(), sa_data: V1 },
    );
    abschicken({ link: LINK_2, saData: OHNE_P2, amBildschirm: ["person1"] });
    expect(zeilen.find((z) => z.token === "a")?.status).toBe("signed");
    expect(zeilen.find((z) => z.token === "b")?.status).toBe(SA_UEBERHOLT);
    expect(abschluss()).toMatchObject({ alleUnterschrieben: true, fassung: LINK_2, saData: OHNE_P2 });
  });

  it("andere Vorgänge am selben Investment bestimmen keine Fassung", () => {
    zeilen.push(
      { token: "a", person_type: "person1", status: "signed", created_at: jetzt(), signed_at: jetzt(), meta: { saFassung: LINK_1 } },
      { token: "x", person_type: "aftersales_kunde", status: "pending", created_at: jetzt() },
    );
    expect(saAktuelleFassung(zeilen)).toBe(LINK_1);
  });
});

describe("Überholen in der Datenbank", () => {
  it("markiert nur offene Anfragen der Selbstauskunft aus anderen Fassungen", async () => {
    const aufrufe: unknown[][] = [];
    const kette: Record<string, unknown> = {};
    for (const m of ["from", "update", "eq", "in", "or", "is"]) {
      kette[m] = (...a: unknown[]) => { aufrufe.push([m, ...a]); return kette; };
    }
    (kette as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok);
    const { error } = await saAeltereFassungenUeberholen(kette, { kontaktId: "k1", investmentId: "i1", fassung: LINK_2 });
    expect(error).toBeNull();
    expect(aufrufe).toContainEqual(["update", { status: SA_UEBERHOLT }]);
    expect(aufrufe).toContainEqual(["eq", "status", "pending"]);
    expect(aufrufe).toContainEqual(["in", "person_type", ["person1", "person2", "partner"]]);
    expect(aufrufe).toContainEqual(["or", `meta->>saFassung.is.null,meta->>saFassung.neq.${LINK_2}`]);
    expect(aufrufe).toContainEqual(["eq", "investment_id", "i1"]);
  });

  it("lehnt eine Kennung ab, die keine UUID ist", async () => {
    const { error } = await saAeltereFassungenUeberholen({}, { kontaktId: "k1", fassung: "x,status.eq.signed" });
    expect(error).toBeInstanceOf(Error);
  });
});

describe("Die Functions und die Signaturseite benutzen die Regeln", () => {
  const submit = readFileSync("supabase/functions/submit-sa-signature/index.ts", "utf8");
  const senden = readFileSync("supabase/functions/send-signature-request/index.ts", "utf8");
  const korrektur = readFileSync("supabase/functions/update-sa-signature-data/index.ts", "utf8");
  const seite = readFileSync("src/pages/SignaturSeite.tsx", "utf8");

  it("submit-sa-signature: Kennung aus dem Link, erst überholen, dann speichern, Kennung an Person 2", () => {
    expect(submit).toContain("const saFassung = String(tokenData.id)");
    const ueberholt = submit.indexOf("saAeltereFassungenUeberholen(supabase");
    // Seit 07.10.2026 speichert `sa_link_abschliessen` (Rueckfall ohne Migration: das Einfuegen im Code).
    const einfuegen = Math.min(
      submit.indexOf('supabase.rpc("sa_link_abschliessen"'),
      submit.search(/\.from\("signature_requests"\)\n\s+\.insert\(/),
    );
    expect(ueberholt).toBeGreaterThan(0);
    expect(einfuegen).toBeGreaterThan(ueberholt);
    expect(submit).toContain("meta: { saFassung }");
    expect(submit).toMatch(/nachweisToken: token,[\s\S]{0,120}saFassung: String\(tokenData\.id\),/);
  });

  it("send-signature-request: mitgeschickte Kennung nur mit Nachweis, neue Fassung überholt ältere", () => {
    expect(senden).toContain('vorgegeben: mitNachweis && typeof saFassungRoh === "string" ? saFassungRoh : null');
    expect(senden).toContain("if (versandFassung.neu && versandFassung.fassung)");
    expect(senden).toContain("meta: { saFassung: versandFassung.fassung }");
  });

  it("update-sa-signature-data: keine Korrektur über eine überholte Anfrage, nur die eigene Fassung", () => {
    expect(korrektur).toContain("anfrage.status === SA_UEBERHOLT");
    expect(korrektur).toContain('query = query.eq("meta->>saFassung", fassung)');
  });

  it("die Signaturseite zeigt überholte Anfragen mit eigenem Hinweis, deutsch in Sie-Form und englisch", () => {
    expect(seite).toContain('data.status === "ueberholt"');
    expect(seite).toContain("{t.ueberholtText}");
    for (const sprache of ["de", "en"] as const) {
      const t = SIGNATUR_SEITE_TEXTE[sprache];
      expect(t.ueberholtTitel.length).toBeGreaterThan(0);
      expect(t.ueberholtText).not.toMatch(/[–—]/);
    }
    expect(SIGNATUR_SEITE_TEXTE.de.ueberholtText).toContain("Ihre Unterschrift");
    expect(SIGNATUR_SEITE_TEXTE.de.ueberholtText).not.toMatch(/\b(du|dein|deine)\b/i);
  });
});
