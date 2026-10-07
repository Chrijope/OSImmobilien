import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Die Logik liegt bei den Edge Functions, getestet wird sie hier, weil Vitest
// nur unterhalb von src sucht (wie bei finanzierung-starten-mail).
import {
  RV_MELDUNG_EMPFAENGER_SCHLUESSEL,
  RV_PDF_LINK_GUELTIG_TAGE,
  empfaengerZusammenstellen,
  konfigLesen,
  meldeUnterschriebeneReservierung,
  meldungDaten,
  meldungIdempotenzSchluessel,
  whatsappGruppe,
} from "../../supabase/functions/_shared/reservierung-unterschrieben-meldung";

/*
 * Die interne Meldung „Reservierung unterschrieben“ an Partner und
 * Geschäftsführung, mit Download der unterschriebenen PDF. Auftrag Christians
 * vom 24.09.2026.
 */

const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");

const KENNUNG_KURZ = "11111111-2222-4333-8444-555555555555";
const PARTNER_ID = "99999999-8888-4777-8666-555555555555";

/* ── Ein nachgebauter Supabase-Client, gerade so viel, wie der Helfer braucht ── */

interface Aufbau {
  kontakt?: Record<string, unknown> | null;
  profile?: Array<{ id: string; name: string | null; email?: string | null; telefon?: string | null }>;
  rollen?: Array<{ user_id: string }>;
  config?: { wert: unknown } | null;
  configFehler?: { message: string } | null;
  signiert?: { data: unknown; error: unknown };
  versand?: (body: Mail) => { data: unknown; error: unknown };
}

/** Eine verschickte Mail, wie sie an send-transactional-email ginge. */
interface Mail {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}

function falscherClient(a: Aufbau) {
  const mails: Mail[] = [];
  const signaturen: Array<{ pfad: string; sekunden: number; optionen: unknown }> = [];
  const abfrage = (tabelle: string) => {
    const filter: Record<string, unknown> = {};
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (spalte: string, wert: unknown) => { filter[spalte] = wert; return q; },
      in: (spalte: string, werte: unknown[]) => { filter[spalte] = werte; return q; },
      maybeSingle: async () => {
        if (tabelle === "kontakte") return { data: a.kontakt ?? null, error: null };
        if (tabelle === "app_config") return { data: a.config ?? null, error: a.configFehler ?? null };
        if (tabelle === "profiles") return { data: (a.profile ?? []).find((p) => p.id === filter.id) ?? null, error: null };
        return { data: null, error: null };
      },
      // `await db.from('profiles').select('id, name')` ohne Filter oder mit `.in('id', …)`
      then: (ok: (v: unknown) => unknown) => {
        const ids = Array.isArray(filter.id) ? filter.id : null;
        const daten = tabelle === "profiles"
          ? (a.profile ?? []).filter((p) => !ids || ids.includes(p.id))
          : tabelle === "user_roles" ? a.rollen ?? [] : [];
        return Promise.resolve({ data: daten, error: null }).then(ok);
      },
    };
    return q;
  };
  const db = {
    from: (tabelle: string) => abfrage(tabelle),
    storage: {
      from: () => ({
        createSignedUrl: async (pfad: string, sekunden: number, optionen: unknown) => {
          signaturen.push({ pfad, sekunden, optionen });
          return a.signiert ?? { data: { signedUrl: `https://speicher.test/${pfad}?token=abc` }, error: null };
        },
      }),
    },
    functions: {
      invoke: async (_name: string, args: { body: Mail }) => {
        mails.push(args.body);
        return a.versand ? a.versand(args.body) : { data: { success: true }, error: null };
      },
    },
  };
  return { db, mails, signaturen };
}

const META = {
  rvSigned: true,
  rvSignedAt: "2026-09-24T10:15:00.000Z",
  rvVertragsdatum: "2026-09-24T10:15:00.000Z",
  rvPdfPath: "reservierung/k-1/inv-1/Reservierungsvereinbarung_Anna_Beispiel_24-09-2026.pdf",
  objektTitel: "Musterweg 1, Wohnung 3",
  rvData: {},
  rvUnterschriebenMeldungOffen: true,
};

const STANDARD: Aufbau = {
  kontakt: { zustaendig_id: PARTNER_ID, berater: null },
  profile: [
    { id: PARTNER_ID, name: "Paula Partner", email: "paula@partner.test" },
    { id: KENNUNG_KURZ, name: "Christian Kurz", email: "kurz@firma.test" },
  ],
  config: { wert: ["peetz@firma.test", KENNUNG_KURZ] },
};

const AUFTRAG = { investmentId: "inv-1", kontaktId: "k-1", meta: META, kundeName: "Anna Beispiel" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Empfängerliste aus app_config", () => {
  it("trennt Kennungen von Adressen und verwirft den Rest", () => {
    expect(konfigLesen([KENNUNG_KURZ.toUpperCase(), " Peetz@Firma.test ", "Christian Kurz", "", 42])).toEqual({
      kennungen: [KENNUNG_KURZ],
      adressen: ["peetz@firma.test"],
      ungueltig: ["Christian Kurz"],
    });
  });

  it("liefert bei allem, was keine Liste ist, nichts", () => {
    expect(konfigLesen(null)).toEqual({ kennungen: [], adressen: [], ungueltig: [] });
    expect(konfigLesen({ userId: KENNUNG_KURZ })).toEqual({ kennungen: [], adressen: [], ungueltig: [] });
  });
});

describe("Empfänger zusammenstellen", () => {
  it("nimmt den Partner zuerst und jede Adresse nur einmal", () => {
    const liste = empfaengerZusammenstellen(
      { email: "c.peetz@more.immo", name: "Christian Peetz" },
      [{ email: "C.Peetz@more.immo" }, { email: "kurz@firma.test", name: "Christian Kurz" }],
    );
    expect(liste).toEqual([
      { email: "c.peetz@more.immo", name: "Christian Peetz", art: "partner" },
      { email: "kurz@firma.test", name: "Christian Kurz", art: "geschaeftsfuehrung" },
    ]);
  });

  it("kommt ohne Partner aus und überspringt kaputte Adressen", () => {
    expect(empfaengerZusammenstellen(null, [{ email: "kein-at" }, { email: "gf@firma.test" }])).toEqual([
      { email: "gf@firma.test", art: "geschaeftsfuehrung" },
    ]);
  });
});

describe("Schutz vor doppeltem Versand", () => {
  it("bildet je Unterschrift und Adresse denselben Schlüssel, unabhängig von der Schreibweise", () => {
    const a = meldungIdempotenzSchluessel("inv-1", META.rvSignedAt, "Kurz@Firma.test");
    expect(a).toBe(meldungIdempotenzSchluessel("inv-1", META.rvSignedAt, "kurz@firma.test "));
    // Eine neue Unterschrift am selben Investment ist eine neue Meldung.
    expect(a).not.toBe(meldungIdempotenzSchluessel("inv-1", "2026-10-01T08:00:00.000Z", "kurz@firma.test"));
  });
});

describe("Inhalt der Mail", () => {
  it("verweist auf Kunde, Objekt, Datum und den Download mit Ablaufdatum", () => {
    const daten = meldungDaten({
      empfaengerName: "Paula Partner", kundeName: "Anna Beispiel", kontaktId: "k-1", meta: META,
      pdfUrl: "https://speicher.test/x.pdf", jetzt: new Date("2026-09-24T12:00:00.000Z"),
    });
    expect(daten).toMatchObject({
      vpName: "Paula Partner",
      kundeName: "Anna Beispiel",
      kundeLink: "https://portal.more.immo/kunden/k-1",
      objektTitel: "Musterweg 1, Wohnung 3",
      unterschriebenAm: "24.09.2026",
      pdfUrl: "https://speicher.test/x.pdf",
      pdfGueltigBis: "01.10.2026",
    });
    expect(daten).not.toHaveProperty("pdfFehlt");
    expect(daten).not.toHaveProperty("einheitVergeben");
  });

  it("sagt ohne PDF, dass sie fehlt, statt einen toten Knopf zu zeigen", () => {
    const daten = meldungDaten({ kundeName: "Anna Beispiel", kontaktId: "k-1", meta: META, pdfUrl: null });
    expect(daten).toMatchObject({ pdfFehlt: true });
    expect(daten).not.toHaveProperty("pdfUrl");
  });

  it("meldet den Konfliktfall und das Abwarten der Widerrufsfrist", () => {
    const vergeben = meldungDaten({
      kundeName: "A", kontaktId: "k-1", meta: { ...META, rvEinheitVergeben: { am: "x" }, rvReservierungAb: "2026-10-08T10:15:00.000Z" },
    });
    expect(vergeben).toMatchObject({ einheitVergeben: true });
    // Ohne Reservierung gibt es auch kein Wirksamkeitsdatum.
    expect(vergeben).not.toHaveProperty("reservierungAb");

    const abwarten = meldungDaten({ kundeName: "A", kontaktId: "k-1", meta: { ...META, rvReservierungAb: "2026-10-08T10:15:00.000Z" } });
    expect(abwarten).toMatchObject({ reservierungAb: "08.10.2026" });

    const haus = meldungDaten({ kundeName: "A", kontaktId: "k-1", meta: { ...META, rvData: { gesamtobjekt: true } } });
    expect(haus).toMatchObject({ gesamtobjekt: true });
  });
});

describe("Versand der Meldung", () => {
  it("schickt an Partner und Geschäftsführung je genau eine Mail mit 7-Tage-Link", async () => {
    const { db, mails, signaturen } = falscherClient(STANDARD);
    const ergebnis = await meldeUnterschriebeneReservierung(db, AUFTRAG);

    expect(mails.map((m) => m.recipientEmail)).toEqual(["paula@partner.test", "peetz@firma.test", "kurz@firma.test"]);
    expect(mails.every((m) => m.templateName === "reservierung-unterschrieben")).toBe(true);
    expect(new Set(mails.map((m) => m.idempotencyKey)).size).toBe(3);
    expect(mails[0].templateData.pdfUrl).toContain("https://speicher.test/");
    // Kennung aus app_config wird über das Profil aufgelöst, samt Anrede.
    expect(mails[2].templateData.vpName).toBe("Christian Kurz");

    expect(signaturen).toEqual([{
      pfad: META.rvPdfPath,
      sekunden: RV_PDF_LINK_GUELTIG_TAGE * 86_400,
      optionen: { download: "Reservierungsvereinbarung_Anna_Beispiel_24-09-2026.pdf" },
    }]);
    expect(RV_PDF_LINK_GUELTIG_TAGE).toBe(7);

    expect(ergebnis.versendet).toHaveLength(3);
    expect(ergebnis.mitPdf).toBe(true);
    expect(ergebnis.metaPatch).toMatchObject({
      rvUnterschriebenMeldungOffen: false,
      rvUnterschriebenGemeldetAn: ["paula@partner.test", "peetz@firma.test", "kurz@firma.test"],
      rvUnterschriebenMeldungFehler: null,
    });
    expect(typeof ergebnis.metaPatch.rvUnterschriebenGemeldetAm).toBe("string");
  });

  it("tut nichts, wenn schon gemeldet wurde", async () => {
    const { db, mails } = falscherClient(STANDARD);
    const ergebnis = await meldeUnterschriebeneReservierung(db, {
      ...AUFTRAG, meta: { ...META, rvUnterschriebenGemeldetAm: "2026-09-24T10:16:00.000Z" },
    });
    expect(ergebnis.bereitsGemeldet).toBe(true);
    expect(mails).toHaveLength(0);
  });

  it("schickt nichts, wenn die Einheit bei der Unterschrift schon vergeben war", async () => {
    const { db, mails } = falscherClient(STANDARD);
    const ergebnis = await meldeUnterschriebeneReservierung(db, {
      ...AUFTRAG, meta: { ...META, rvEinheitVergeben: { am: "2026-09-24T10:15:00.000Z" } },
    });
    expect(mails).toHaveLength(0);
    // Erledigt vermerken, sonst holt der tägliche Lauf die Meldung nach.
    expect(ergebnis.metaPatch).toEqual({ rvUnterschriebenMeldungOffen: false });
  });

  it("schickt ohne zuständigen Partner nur an die Geschäftsführung und vermerkt das", async () => {
    const { db, mails } = falscherClient({ ...STANDARD, kontakt: { zustaendig_id: null, berater: null } });
    const ergebnis = await meldeUnterschriebeneReservierung(db, AUFTRAG);
    expect(mails.map((m) => m.recipientEmail)).toEqual(["peetz@firma.test", "kurz@firma.test"]);
    expect(ergebnis.ohnePartner).toBe(true);
    expect(ergebnis.hinweise.join(" ")).toContain("kein zuständiger Partner");
  });

  it("rät beim Namen nicht, wenn zwei Profile gleich heißen", async () => {
    const { db, mails } = falscherClient({
      ...STANDARD,
      kontakt: { zustaendig_id: null, berater: "Christian Peetz" },
      profile: [
        { id: "a1111111-2222-4333-8444-555555555555", name: "Christian Peetz", email: "c.peetz@more.immo" },
        { id: "b1111111-2222-4333-8444-555555555555", name: "christian  peetz", email: "c.peetz@more.immo" },
      ],
      config: { wert: ["gf@firma.test"] },
    });
    const ergebnis = await meldeUnterschriebeneReservierung(db, AUFTRAG);
    expect(ergebnis.ohnePartner).toBe(true);
    expect(mails.map((m) => m.recipientEmail)).toEqual(["gf@firma.test"]);
  });

  it("nimmt den Namen als Rückfall, wenn er genau ein Profil trifft", async () => {
    const { db, mails } = falscherClient({ ...STANDARD, kontakt: { zustaendig_id: null, berater: " paula  PARTNER " } });
    await meldeUnterschriebeneReservierung(db, AUFTRAG);
    expect(mails[0].recipientEmail).toBe("paula@partner.test");
  });

  it("schickt ohne app_config-Eintrag nur an den Partner und nennt den Grund", async () => {
    const { db, mails } = falscherClient({ ...STANDARD, config: null });
    const ergebnis = await meldeUnterschriebeneReservierung(db, AUFTRAG);
    expect(mails.map((m) => m.recipientEmail)).toEqual(["paula@partner.test"]);
    expect(ergebnis.hinweise.join(" ")).toContain(RV_MELDUNG_EMPFAENGER_SCHLUESSEL);
  });

  it("meldet ohne abgelegte PDF trotzdem, mit dem Hinweis statt Knopf", async () => {
    const { db, mails, signaturen } = falscherClient(STANDARD);
    const ergebnis = await meldeUnterschriebeneReservierung(db, { ...AUFTRAG, meta: { ...META, rvPdfPath: undefined } });
    expect(signaturen).toHaveLength(0);
    expect(ergebnis.mitPdf).toBe(false);
    expect(mails[0].templateData).toMatchObject({ pdfFehlt: true });
    expect(mails[0].templateData).not.toHaveProperty("pdfUrl");
  });

  it("wirft nicht, wenn der Versand scheitert, und lässt die Meldung offen", async () => {
    const { db } = falscherClient({ ...STANDARD, versand: () => ({ data: { success: false, reason: "email_suppressed" }, error: null }) });
    const ergebnis = await meldeUnterschriebeneReservierung(db, AUFTRAG);
    expect(ergebnis.versendet).toHaveLength(0);
    expect(ergebnis.fehler).toHaveLength(3);
    // Kein Riegel gesetzt: Der tägliche Lauf versucht es erneut.
    expect(ergebnis.metaPatch).not.toHaveProperty("rvUnterschriebenGemeldetAm");
    expect(ergebnis.metaPatch).not.toHaveProperty("rvUnterschriebenMeldungOffen");
  });

  it("wirft auch dann nicht, wenn die Datenbank streikt", async () => {
    const { db } = falscherClient(STANDARD);
    (db as { from: unknown }).from = () => { throw new Error("weg"); };
    const ergebnis = await meldeUnterschriebeneReservierung(db, AUFTRAG);
    expect(ergebnis.versendet).toHaveLength(0);
    expect(ergebnis.fehler.length).toBeGreaterThan(0);
  });
});

describe("WhatsApp-Gruppe zum Start in die Finanzierung", () => {
  const FP_ID = "77777777-6666-4555-8444-333333333333";

  it("nennt Partner und Finanzierer mit Telefon, aber nur in der Mail an die Geschäftsführung", async () => {
    const { db, mails } = falscherClient({
      ...STANDARD,
      profile: [
        { id: PARTNER_ID, name: "Paula Partner", email: "paula@partner.test", telefon: "0171 1111111" },
        { id: KENNUNG_KURZ, name: "Christian Kurz", email: "kurz@firma.test" },
        { id: FP_ID, name: "Fritz Finanz", email: "fritz@fp.test", telefon: "0172 2222222" },
      ],
      rollen: [{ user_id: FP_ID }],
    });
    await meldeUnterschriebeneReservierung(db, AUFTRAG);

    expect(mails[0].templateData).not.toHaveProperty("whatsappFinanzierer");
    for (const m of mails.slice(1)) {
      expect(m.templateData).toMatchObject({
        whatsappVertriebspartner: "Paula Partner, 0171 1111111",
        whatsappFinanzierer: "Fritz Finanz, 0172 2222222",
      });
    }
  });

  it("verschickt auch ohne Finanzierer und ohne Telefonnummer", async () => {
    const { db, mails } = falscherClient(STANDARD);
    const ergebnis = await meldeUnterschriebeneReservierung(db, AUFTRAG);
    expect(ergebnis.versendet).toHaveLength(3);
    expect(mails[1].templateData).toMatchObject({
      whatsappVertriebspartner: "Paula Partner, Telefon nicht hinterlegt",
      whatsappFinanzierer: "Finanzierer noch nicht zugeordnet",
    });
  });

  it("kommt ohne Partner aus", () => {
    expect(whatsappGruppe(null, [])).toEqual({
      vertriebspartner: "Vertriebspartner nicht zugeordnet",
      finanzierer: "Finanzierer noch nicht zugeordnet",
    });
  });

  it("die Vorlage zeigt den Abschnitt ohne Gedankenstriche", () => {
    const vorlage = lies("supabase/functions/_shared/transactional-email-templates/reservierung-unterschrieben.tsx");
    expect(vorlage).toContain('titel="Nächster Schritt: WhatsApp-Gruppe eröffnen"');
    expect(vorlage).toContain("Christian Peetz, Christian Kurz");
    expect(vorlage).not.toMatch(/[–—]/);
  });
});

describe("Einbau in die Functions", () => {
  it("finalize-reservierung setzt das Merkmal und meldet erst mit der PDF", () => {
    const quelle = lies("supabase/functions/finalize-reservierung/index.ts");
    expect(quelle).toContain("rvUnterschriebenMeldungOffen: true,");
    expect(quelle).toContain("rvUnterschriebenGemeldetAm: null,");
    expect(quelle).toContain("meldeUnterschriebeneReservierung(supabase, { investmentId, kontaktId, meta, kundeName })");
    // Beide Stellen, an denen eine PDF ankommen kann, laufen über denselben Weg.
    expect(quelle.match(/await pdfNachgereicht\(supabase,/g)).toHaveLength(2);
    expect(quelle).not.toContain("await kopieAblegenUndVerschicken(supabase, {\n            investmentId");
  });

  it("send-reservierung-eskalation holt offene Meldungen nach, zeitlich begrenzt", () => {
    const quelle = lies("supabase/functions/send-reservierung-eskalation/index.ts");
    expect(quelle).toContain("await offeneMeldungenNachholen(db, bericht);");
    expect(quelle).toContain('.eq("meta->>rvUnterschriebenMeldungOffen", "true")');
    expect(quelle).toContain('.gte("meta->>rvSignedAt"');
  });

  it("die Vorlage bleibt im gemeinsamen Layout und intern", () => {
    const vorlage = lies("supabase/functions/_shared/transactional-email-templates/reservierung-unterschrieben.tsx");
    expect(vorlage).toContain("<EmailLayout");
    expect(vorlage).toContain("intern");
    expect(vorlage).toContain('text="Reservierungsvereinbarung herunterladen"');
    // Keine Gedankenstriche in Texten, die Nutzer sehen.
    expect(vorlage).not.toMatch(/[–—]/);
  });
});

describe("Die Migration", () => {
  const datei = "20260924120000_reservierung_unterschrieben_empfaenger.sql";
  const sql = lies(`supabase/migrations/${datei}`);

  it("legt den Eintrag nur an, ohne eine gepflegte Liste zu überschreiben", () => {
    expect(sql).toContain(`'${RV_MELDUNG_EMPFAENGER_SCHLUESSEL}'`);
    expect(sql).toContain("ON CONFLICT (schluessel) DO NOTHING");
    const ohneKommentare = sql.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");
    expect(ohneKommentare).not.toMatch(/DO UPDATE/i);
  });

  it("liegt, solange sie offen ist, als gleiche Kopie im Eingangskorb und in der Sammeldatei", () => {
    const kopie = resolve(__dirname, "../..", `supabase/migrations-inbox/${datei}`);
    if (existsSync(kopie)) {
      expect(readFileSync(kopie, "utf-8")).toBe(sql);
      expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(sql);
    }
  });
});
