/**
 * Darf dieser Aufruf den Handelsvertretervertrag weiterschalten?
 *
 * Die Logik liegt in
 * `supabase/functions/_shared/vertrag-gegenzeichnung-zugriff.ts`, weil
 * `finalize-vertrag` sie braucht. Geprüft wird sie hier, denn die Edge
 * Functions selbst laufen unter Deno und kommen im Testlauf nicht vor.
 *
 * Anlass: externes Audit vom 15.09.2026, Befund F03C. `finalize-vertrag` hat
 * den Token der Gegenzeichnung zwar erzeugt und per Mail verschickt, in der
 * zweiten Stufe aber nie wieder angesehen. Wer eine Bewerbungs-Id kannte,
 * konnte damit eine Gegenzeichnung vortäuschen, eigene PDFs in die Akte legen
 * und dem Bewerber eine Bestätigungsmail darauf schicken.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GEGENZEICHNUNG_ABGELEHNT,
  VERTRAGS_FASSUNG_ALT_KENNUNG,
  fassungDerAnfrage,
  personTypZurStufe,
  pruefeBewerberStufe,
  pruefeGegenzeichnung,
  tokenGiltFuerVertrag,
  type LeseClient,
  type VertragsAnfrage,
} from "../../supabase/functions/_shared/vertrag-gegenzeichnung-zugriff.ts";

const BEWERBER_ID = "11111111-1111-1111-1111-111111111111";
const FREMDE_ID = "22222222-2222-2222-2222-222222222222";
const KURZ_TOKEN = "kurz-token-aaa";

type Zeile = {
  kontakt_id?: unknown;
  person_type?: unknown;
  expires_at?: unknown;
};

/** Ein Client, der genau diese Zeilen kennt, abgelegt nach Token. */
function clientMit(zeilen: Record<string, Zeile>, fehler: unknown = null): LeseClient {
  return {
    from: () => ({
      select: () => ({
        eq: (_feld: string, wert: unknown) => ({
          maybeSingle: async () => ({
            data: fehler ? null : (zeilen[String(wert)] ?? null),
            error: fehler,
          }),
        }),
      }),
    }),
  };
}

function inTagen(tage: number): string {
  return new Date(Date.now() + tage * 24 * 60 * 60 * 1000).toISOString();
}

const gueltigeKurzZeile: Zeile = {
  kontakt_id: BEWERBER_ID,
  person_type: "vertrag_kurz",
  expires_at: inTagen(30),
};

describe("personTypZurStufe", () => {
  it("ordnet die Gegenzeichnung dem vertrag_kurz zu", () => {
    expect(personTypZurStufe("kurz")).toBe("vertrag_kurz");
  });

  it("ordnet alles andere dem Schritt des Bewerbers zu", () => {
    expect(personTypZurStufe("bewerber")).toBe("vertrag");
    expect(personTypZurStufe("")).toBe("vertrag");
  });
});

describe("tokenGiltFuerVertrag", () => {
  it("lässt den richtigen Token für die Gegenzeichnung durch", async () => {
    const client = clientMit({ [KURZ_TOKEN]: gueltigeKurzZeile });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, KURZ_TOKEN, "vertrag_kurz"))
      .resolves.toBe(true);
  });

  it("lässt den richtigen Token für den Schritt des Bewerbers durch", async () => {
    const client = clientMit({
      "bewerber-token": { kontakt_id: BEWERBER_ID, person_type: "vertrag", expires_at: inTagen(14) },
    });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, "bewerber-token", "vertrag"))
      .resolves.toBe(true);
  });

  // Der Kern des Befunds F03C: ohne Token ging es vorher trotzdem.
  it("weist einen Aufruf ohne Token ab", async () => {
    const client = clientMit({ [KURZ_TOKEN]: gueltigeKurzZeile });
    for (const nichts of [undefined, null, "", "   "]) {
      await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, nichts, "vertrag_kurz"))
        .resolves.toBe(false);
    }
  });

  it("weist einen unbekannten Token ab", async () => {
    const client = clientMit({ [KURZ_TOKEN]: gueltigeKurzZeile });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, "erfunden", "vertrag_kurz"))
      .resolves.toBe(false);
  });

  // Ein eigener, gültiger Link darf keinen fremden Vertrag abschließen.
  it("weist einen Token ab, der zu einer anderen Bewerbung gehört", async () => {
    const client = clientMit({
      [KURZ_TOKEN]: { ...gueltigeKurzZeile, kontakt_id: FREMDE_ID },
    });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, KURZ_TOKEN, "vertrag_kurz"))
      .resolves.toBe(false);
  });

  // Sonst könnte der Bewerber mit seinem eigenen Link beide Unterschriften
  // allein leisten.
  it("weist den Token des Bewerbers für die Gegenzeichnung ab", async () => {
    const client = clientMit({
      "bewerber-token": { kontakt_id: BEWERBER_ID, person_type: "vertrag", expires_at: inTagen(14) },
    });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, "bewerber-token", "vertrag_kurz"))
      .resolves.toBe(false);
  });

  it("weist den Token der Gegenzeichnung für den Schritt des Bewerbers ab", async () => {
    const client = clientMit({ [KURZ_TOKEN]: gueltigeKurzZeile });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, KURZ_TOKEN, "vertrag"))
      .resolves.toBe(false);
  });

  it("weist einen abgelaufenen Token ab", async () => {
    const client = clientMit({
      [KURZ_TOKEN]: { ...gueltigeKurzZeile, expires_at: inTagen(-1) },
    });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, KURZ_TOKEN, "vertrag_kurz"))
      .resolves.toBe(false);
  });

  it("weist einen Token mit unlesbarer Frist ab", async () => {
    const client = clientMit({
      [KURZ_TOKEN]: { ...gueltigeKurzZeile, expires_at: "übermorgen" },
    });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, KURZ_TOKEN, "vertrag_kurz"))
      .resolves.toBe(false);
  });

  // Altbestände aus der Zeit vor den befristeten Links tragen keine Frist.
  // Sie sollen nicht nachträglich ungültig werden.
  it("lässt eine Zeile ohne Frist durch", async () => {
    const client = clientMit({
      [KURZ_TOKEN]: { ...gueltigeKurzZeile, expires_at: null },
    });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, KURZ_TOKEN, "vertrag_kurz"))
      .resolves.toBe(true);
  });

  it("weist ab, wenn die Bewerbungs-Id fehlt", async () => {
    const client = clientMit({ [KURZ_TOKEN]: gueltigeKurzZeile });
    await expect(tokenGiltFuerVertrag(client, "", KURZ_TOKEN, "vertrag_kurz"))
      .resolves.toBe(false);
  });

  // Fällt die Datenbank aus, soll der Abschluss unterbleiben, nicht
  // durchrutschen.
  it("weist ab, wenn die Abfrage fehlschlägt", async () => {
    const client = clientMit({ [KURZ_TOKEN]: gueltigeKurzZeile }, { message: "kaputt" });
    await expect(tokenGiltFuerVertrag(client, BEWERBER_ID, KURZ_TOKEN, "vertrag_kurz"))
      .resolves.toBe(false);
  });
});

describe("Ablehnung", () => {
  // Immer derselbe Satz, egal warum. Sonst ließe sich aus den Antworten
  // ablesen, welche Bewerbungen es gibt und wie weit sie sind.
  it("nennt keinen Grund", () => {
    expect(GEGENZEICHNUNG_ABGELEHNT).toBe(
      "Dieser Link berechtigt nicht dazu, den Vertrag abzuschliessen.",
    );
  });
});

/* ── Welche Unterschrift wird gegengezeichnet? (A4-04, A4-05) ──────────── */

const anfrage = (id: string, extra: Partial<VertragsAnfrage> = {}): VertragsAnfrage => ({
  id,
  person_type: "vertrag",
  status: "signed",
  created_at: "2026-09-20T10:00:00Z",
  signed_at: "2026-09-21T10:00:00Z",
  sa_data: { bewerberData: { vertragFassung: "2026-09-26" } },
  ...extra,
});
const kurz = (extra: Partial<VertragsAnfrage> = {}): VertragsAnfrage => ({
  id: "k1",
  person_type: "vertrag_kurz",
  status: "pending",
  created_at: "2026-09-21T10:00:01Z",
  sa_data: { bewerberRequestId: "v1" },
  ...extra,
});

describe("pruefeGegenzeichnung", () => {
  it("nimmt die Fassung der unterschriebenen Anfrage, auf die die Gegenzeichnung zeigt", () => {
    const befund = pruefeGegenzeichnung(kurz(), [anfrage("v1")]);
    expect(befund).toMatchObject({ ok: true, fassung: "2026-09-26" });
  });

  it("ein alter 2026-09-10-Vertrag bleibt 2026-09-10, auch wenn der Entwurf neuer ist", () => {
    const alt = anfrage("v1", { sa_data: { bewerberData: { vertragFassung: "2026-09-10" } } });
    expect(pruefeGegenzeichnung(kurz(), [alt])).toMatchObject({ ok: true, fassung: "2026-09-10" });
  });

  it("lehnt ab, wenn danach eine neuere Anfrage an den Bewerber ging (überholt)", () => {
    const neuer = anfrage("v2", { status: "pending", created_at: "2026-09-26T09:00:00Z" });
    expect(pruefeGegenzeichnung(kurz(), [anfrage("v1"), neuer])).toEqual({ ok: false, grund: "ueberholt" });
  });

  it("ein Testversand oder eine als überholt markierte Anfrage zählt dabei nicht", () => {
    const test = anfrage("t1", { status: "pending", created_at: "2026-09-26T09:00:00Z", sa_data: { testversand: true } });
    const zu = anfrage("v0", { status: "ueberholt", created_at: "2026-09-26T09:00:00Z" });
    expect(pruefeGegenzeichnung(kurz(), [anfrage("v1"), test, zu]).ok).toBe(true);
  });

  it("nur mit offener Gegenzeichnung und nur nach der Unterschrift des Bewerbers derselben Anfrage", () => {
    expect(pruefeGegenzeichnung(kurz({ status: "signed" }), [anfrage("v1")])).toEqual({ ok: false, grund: "gegenzeichnung_nicht_offen" });
    expect(pruefeGegenzeichnung(kurz({ status: "ueberholt" }), [anfrage("v1")]).ok).toBe(false);
    expect(pruefeGegenzeichnung(kurz({ person_type: "vertrag" }), [anfrage("v1")]).ok).toBe(false);
    expect(pruefeGegenzeichnung(kurz(), [anfrage("v1", { status: "pending" })])).toEqual({ ok: false, grund: "bewerber_nicht_unterschrieben" });
    expect(pruefeGegenzeichnung(kurz(), [anfrage("anders")])).toEqual({ ok: false, grund: "bewerber_nicht_unterschrieben" });
  });

  it("ohne Verweis auf die Anfrage des Bewerbers wird neutral abgelehnt (NB-02)", () => {
    // Solche Anfragen trägt Migration 20260927080000 nach, mit neuem Token.
    const b = pruefeGegenzeichnung(kurz({ sa_data: {} }), [anfrage("v1")]);
    expect(b).toEqual({ ok: false, grund: "bewerber_nicht_unterschrieben" });
  });

  it("eine Anfrage ohne Kennung gehört zur Altfassung", () => {
    expect(fassungDerAnfrage(anfrage("v1", { sa_data: {} }))).toBe(VERTRAGS_FASSUNG_ALT_KENNUNG);
  });
});

describe("finalize-vertrag gibt den Link der Gegenzeichnung nicht an den Bewerber (A4-04)", () => {
  const quelle = readFileSync(join(__dirname, "..", "..", "supabase", "functions", "finalize-vertrag", "index.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  it("die Antwort von Stufe A enthält keine signatureUrl", () => {
    const antwort = quelle.match(/JSON\.stringify\(\{ allSigned: false, stage: "awaiting_kurz"[^)]*\)/)?.[0] ?? "";
    expect(antwort).not.toBe("");
    expect(antwort).not.toContain("signatureUrl");
  });
  it("der Token der Gegenzeichnung steht nicht mehr in der Akte des Bewerbers", () => {
    expect(quelle).not.toMatch(/vertragKurzAnfrageToken:\s*kurzToken/);
  });
  it("Stufe B prüft die Anfrage und schreibt die unterschriebene Fassung", () => {
    expect(quelle).toContain("pruefeGegenzeichnung(");
    expect(quelle).toContain("vertragUnterschrieben:");
    expect(quelle).toContain("fassung: befund.fassung");
  });
});

describe("pruefeBewerberStufe (NB-03)", () => {
  const echt = (id: string, extra: Partial<VertragsAnfrage> = {}) => anfrage(id, extra);

  it("nur die aktuelle echte, unterschriebene Anfrage ändert etwas", () => {
    expect(pruefeBewerberStufe(echt("v1"), [echt("v1")], "gesendet")).toBe("aktuell");
  });

  it("ein wieder eingespielter alter Token ist wirkungslos", () => {
    const alt = echt("v1", { created_at: "2026-09-10T10:00:00Z" });
    const neu = echt("v2", { status: "pending", created_at: "2026-09-26T10:00:00Z" });
    expect(pruefeBewerberStufe(alt, [alt, neu], "gesendet")).toBe("ueberholt");
    // Auch wenn die neue schon unterschrieben ist.
    expect(pruefeBewerberStufe(alt, [alt, { ...neu, status: "signed" }], "wartet_auf_kurz")).toBe("ueberholt");
  });

  it("ein Testversand ändert weder Bewerbung noch Gegenzeichnung", () => {
    const test = echt("t1", { sa_data: { testversand: true } });
    expect(pruefeBewerberStufe(test, [echt("v1"), test], "gesendet")).toBe("testversand");
    // Und er überholt die echte Anfrage nicht.
    const spaeterTest = echt("t2", { created_at: "2026-09-26T10:00:00Z", sa_data: { testversand: true } });
    expect(pruefeBewerberStufe(echt("v1"), [echt("v1"), spaeterTest], "gesendet")).toBe("aktuell");
  });

  it("nach der Gegenzeichnung bleibt alles, wie es ist", () => {
    expect(pruefeBewerberStufe(echt("v1"), [echt("v1")], "unterschrieben")).toBe("schon_unterschrieben");
  });

  it("eine ungültige oder nicht unterschriebene Anfrage ändert nichts", () => {
    expect(pruefeBewerberStufe(echt("v1", { status: "pending" }), [], "gesendet")).toBe("nicht_unterschrieben");
    expect(pruefeBewerberStufe(echt("v1", { status: "ueberholt" }), [], "gesendet")).toBe("nicht_unterschrieben");
    expect(pruefeBewerberStufe(kurz(), [], "gesendet")).toBe("nicht_unterschrieben");
  });
});

describe("finalize-vertrag, Stufe B schließt die Gegenzeichnung zuerst (NB-04)", () => {
  const quelle = readFileSync(join(__dirname, "..", "..", "supabase", "functions", "finalize-vertrag", "index.ts"), "utf8");
  it("bedingtes Schließen mit genau einer Zeile, vor dem Schreiben der Bewerbung", () => {
    const schliessen = quelle.indexOf('.eq("id", kurzId).eq("status", "pending")');
    const bewerbung = quelle.indexOf('.update(neueStufe ? { meta: nextMeta, status: neueStufe } : { meta: nextMeta })');
    expect(schliessen).toBeGreaterThan(0);
    expect(bewerbung).toBeGreaterThan(schliessen);
    expect(quelle).toContain("(geschlossen || []).length !== 1");
    // Scheitert die Bewerbung, wird die Anfrage wieder geöffnet.
    expect(quelle).toContain('.update({ status: "pending", signed_at: null, signature_data: null })');
    expect(quelle).toContain("ponytail:");
  });
});

describe("update-sa-signature-data nimmt nur die Selbstauskunft an (NB-01)", () => {
  it("Positivliste: Vertrag, Gegenzeichnung und Reservierung abgelehnt", async () => {
    const { darfSaKorrigieren } = await import("../../supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts");
    for (const typ of ["person1", "person2", "partner"]) expect(darfSaKorrigieren(typ), typ).toBe(true);
    for (const typ of ["vertrag", "vertrag_kurz", "rv_person1", "aftersales_kunde", "", null, undefined]) {
      expect(darfSaKorrigieren(typ), String(typ)).toBe(false);
    }
  });
  it("prüft die Positivliste und zieht nur Selbstauskunft-Anfragen nach", () => {
    const quelle = readFileSync(join(__dirname, "..", "..", "supabase", "functions", "update-sa-signature-data", "index.ts"), "utf8");
    expect(quelle).toContain("if (!darfSaKorrigieren(anfrage.person_type))");
    expect(quelle).toContain('.in("person_type", [...SA_PERSON_TYPEN])');
    expect(quelle).not.toContain('.not("person_type", "like", "rv_%")');
  });
});
