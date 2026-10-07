/**
 * Meta Pixel nur mit Anlage 4 (a), Bestandsschutz (b) oder als Admin.
 *
 * Die Serverseite liegt in supabase/functions/_shared/meta-pixel-freigabe.ts
 * und wird von get-vp-microsite, submit-lead, meta-lead und vp-marketing
 * benutzt. Geprüft wird sie hier, weil die Functions unter Deno laufen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  VERTRAGSFASSUNG_MIT_ANLAGE_4,
  entscheideMetaPixelFreigabe,
  fassungHatAnlage4,
  hatVertragMitAnlage4,
  ladeMetaPixelFreigabe,
  type FreigabeClient,
} from "../../supabase/functions/_shared/meta-pixel-freigabe.ts";
import { darfMetaPixelSetzen } from "@/lib/metaPixelFreigabe";
import { VERTRAGS_FASSUNG } from "@/lib/vertragKonditionen";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
import { entferneMetaPixel, ladeCapiTokenStatus, loescheCapiToken, speichereCapiToken } from "@/lib/vpMarketingStore";

const PARTNER = "22222222-2222-2222-2222-222222222222";

const vertrag = (meta: Record<string, unknown>, unterschrieben: string = VERTRAGSFASSUNG_MIT_ANLAGE_4) => ({
  meta: {
    userAccountId: PARTNER,
    vertragStatus: "unterschrieben",
    vertragFassung: VERTRAGSFASSUNG_MIT_ANLAGE_4,
    vertragUnterschrieben: { fassung: unterschrieben, quelle: "digital" },
    ...meta,
  },
});

const basis = { rollen: ["vertriebspartner"], profilGesperrt: false, pixelGesperrt: false, bestandsschutz: false, vertragMitAnlage4: false };

describe("Vertragsfassung mit Anlage 4", () => {
  it("die aktuelle Vertragsfassung enthält Anlage 4", () => {
    // Seit 2026-09-29 liegt die aktuelle Kennung hinter der ersten mit
    // Anlage 4; die Server-Prüfung muss sie trotzdem als "mit Anlage 4" lesen.
    expect(VERTRAGS_FASSUNG >= VERTRAGSFASSUNG_MIT_ANLAGE_4).toBe(true);
    expect(fassungHatAnlage4(VERTRAGS_FASSUNG)).toBe(true);
  });

  it("ab 2026-09-26, nicht davor, nicht die Altfassung, nichts Ungültiges", () => {
    expect(fassungHatAnlage4("2026-09-26")).toBe(true);
    expect(fassungHatAnlage4(" 2027-01-01 ")).toBe(true);
    for (const k of ["2026-09-10", "2026-09-07", "2026-09-01-lang", "", null, undefined, "neu", 20260926]) {
      expect(fassungHatAnlage4(k), String(k)).toBe(false);
    }
  });

  it("(a) zählt nur ein beidseitig unterschriebener Vertrag des Nutzers mit Anlage 4", () => {
    expect(hatVertragMitAnlage4([vertrag({})], PARTNER)).toBe(true);
    // Nur vom Partner unterschrieben, Gegenzeichnung fehlt.
    expect(hatVertragMitAnlage4([vertrag({ vertragStatus: "wartet_auf_kurz" })], PARTNER)).toBe(false);
    expect(hatVertragMitAnlage4([vertrag({ vertragStatus: "gesendet" })], PARTNER)).toBe(false);
    // Unterschrieben, aber ältere Fassung.
    expect(hatVertragMitAnlage4([vertrag({ vertragFassung: "2026-09-10" }, "2026-09-10")], PARTNER)).toBe(false);
    // A4-05: Der neue Entwurf zählt nicht, nur die unterschriebene Fassung.
    expect(hatVertragMitAnlage4([vertrag({}, "2026-09-10")], PARTNER)).toBe(false);
    expect(hatVertragMitAnlage4([vertrag({ vertragUnterschrieben: undefined })], PARTNER)).toBe(false);
    // Vertrag eines anderen Kontos.
    expect(hatVertragMitAnlage4([vertrag({ userAccountId: "fremd" })], PARTNER)).toBe(false);
    expect(hatVertragMitAnlage4([vertrag({})], "")).toBe(false);
    expect(hatVertragMitAnlage4(null, PARTNER)).toBe(false);
  });
});

describe("entscheideMetaPixelFreigabe", () => {
  it("(a) Vertrag mit Anlage 4 gibt frei", () => {
    expect(entscheideMetaPixelFreigabe({ ...basis, vertragMitAnlage4: true })).toEqual({ erlaubt: true, grund: "vertrag_anlage_4" });
  });
  it("(b) Bestandsschutz gibt frei", () => {
    expect(entscheideMetaPixelFreigabe({ ...basis, bestandsschutz: true })).toEqual({ erlaubt: true, grund: "bestandsschutz" });
  });
  it("Admin und Inhaber dürfen immer", () => {
    expect(entscheideMetaPixelFreigabe({ ...basis, rollen: ["admin"] }).erlaubt).toBe(true);
    expect(entscheideMetaPixelFreigabe({ ...basis, rollen: ["inhaber"] }).grund).toBe("admin");
  });
  it("ohne Vertrag mit Anlage 4 und ohne Bestandsschutz: gesperrt", () => {
    expect(entscheideMetaPixelFreigabe(basis)).toEqual({ erlaubt: false, grund: "ohne_anlage_4" });
  });
  it("Vertragsende und Sperre durch die Verwaltung gehen allem vor", () => {
    const alles = { ...basis, bestandsschutz: true, vertragMitAnlage4: true };
    expect(entscheideMetaPixelFreigabe({ ...alles, profilGesperrt: true }).grund).toBe("profil_gesperrt");
    expect(entscheideMetaPixelFreigabe({ ...alles, pixelGesperrt: true })).toEqual({ erlaubt: false, grund: "pixel_gesperrt" });
  });
});

/** Dienst-Client mit festen Antworten je Tabelle. */
function client(antworten: Record<string, { data: unknown; error: { code?: string; message?: string } | null }>): FreigabeClient {
  return {
    from: (tabelle: string) => ({
      select: () => ({
        eq: () => {
          const a = antworten[tabelle] ?? { data: null, error: null };
          return Object.assign(Promise.resolve(a), { maybeSingle: () => Promise.resolve(a) });
        },
      }),
    }),
  };
}

const ok = (data: unknown) => ({ data, error: null });

describe("ladeMetaPixelFreigabe", () => {
  const standard = {
    user_roles: ok([{ role: "vertriebspartner" }]),
    profiles: ok({ gesperrt: false }),
    bewerbungen: ok([]),
  };

  it("(b) Bestandsschutz aus der Liste", async () => {
    const c = client({ ...standard, meta_pixel_berechtigung: ok({ bestandsschutz: true, bestandsschutz_beendet_am: null, gesperrt_am: null }) });
    expect(await ladeMetaPixelFreigabe(c, PARTNER)).toMatchObject({ erlaubt: true, grund: "bestandsschutz" });
  });

  it("nach dem Entfernen der Pixel-ID ist der Bestandsschutz vorbei", async () => {
    const c = client({ ...standard, meta_pixel_berechtigung: ok({ bestandsschutz: true, bestandsschutz_beendet_am: "2026-10-02T10:00:00Z", gesperrt_am: null }) });
    expect(await ladeMetaPixelFreigabe(c, PARTNER)).toMatchObject({ erlaubt: false, grund: "ohne_anlage_4" });
  });

  it("(a) ein Neupartner mit Vertrag mit Anlage 4 darf, auch nach Entfernen und Wiedereintragen", async () => {
    const c = client({ ...standard, bewerbungen: ok([vertrag({})]), meta_pixel_berechtigung: ok(null) });
    expect(await ladeMetaPixelFreigabe(c, PARTNER)).toMatchObject({ erlaubt: true, grund: "vertrag_anlage_4" });
  });

  it("ohne Eintrag und ohne Vertrag mit Anlage 4: gesperrt", async () => {
    const c = client({ ...standard, meta_pixel_berechtigung: ok(null) });
    expect(await ladeMetaPixelFreigabe(c, PARTNER)).toMatchObject({ erlaubt: false });
  });

  it("Sperre durch die Verwaltung schlägt Vertrag und Bestandsschutz", async () => {
    const c = client({
      ...standard,
      bewerbungen: ok([vertrag({})]),
      meta_pixel_berechtigung: ok({ bestandsschutz: true, bestandsschutz_beendet_am: null, gesperrt_am: "2026-10-01T00:00:00Z" }),
    });
    expect(await ladeMetaPixelFreigabe(c, PARTNER)).toMatchObject({ erlaubt: false, grund: "pixel_gesperrt" });
  });

  it("Migration noch nicht gelaufen: kein Bestandsschutz aus den selbst geschriebenen Einstellungen (A4-01)", async () => {
    const fehlt = { data: null, error: { code: "PGRST205", message: "not in schema cache" } };
    const mitPixel = client({
      ...standard,
      meta_pixel_berechtigung: fehlt,
      user_settings: ok({ einstellungen: { marketing: { metaPixelId: "123456789012345" } } }),
      vp_marketing_einstellungen: ok({ meta_capi_token: "EAAB" }),
    });
    expect(await ladeMetaPixelFreigabe(mitPixel, PARTNER)).toMatchObject({ erlaubt: false, grund: "ohne_anlage_4", tabelleFehlt: true });
    // Vertrag mit Anlage 4 und Admin gehen auch ohne die Liste.
    const mitVertrag = client({ ...standard, meta_pixel_berechtigung: fehlt, bewerbungen: ok([vertrag({})]) });
    expect((await ladeMetaPixelFreigabe(mitVertrag, PARTNER)).erlaubt).toBe(true);
    const admin = client({ ...standard, meta_pixel_berechtigung: fehlt, user_roles: ok([{ role: "inhaber" }]) });
    expect((await ladeMetaPixelFreigabe(admin, PARTNER)).erlaubt).toBe(true);
  });

  it("jeder andere Lesefehler sperrt, und ein gesperrtes Profil auch", async () => {
    const kaputt = client({ ...standard, bewerbungen: { data: null, error: { code: "57014", message: "timeout" } } });
    expect((await ladeMetaPixelFreigabe(kaputt, PARTNER)).erlaubt).toBe(false);
    const gesperrt = client({ ...standard, profiles: ok({ gesperrt: true }), meta_pixel_berechtigung: ok({ bestandsschutz: true }) });
    expect((await ladeMetaPixelFreigabe(gesperrt, PARTNER)).erlaubt).toBe(false);
    expect((await ladeMetaPixelFreigabe(client(standard), "")).erlaubt).toBe(false);
  });

  it("Admin darf ohne Vertrag und ohne Eintrag", async () => {
    const c = client({ ...standard, user_roles: ok([{ role: "admin" }]), meta_pixel_berechtigung: ok(null) });
    expect(await ladeMetaPixelFreigabe(c, PARTNER)).toMatchObject({ erlaubt: true, grund: "admin" });
  });
});

describe("Einstellungen: darfMetaPixelSetzen (nur Anzeige)", () => {
  const leer = { istAdmin: false, serverErlaubt: null, gespeichertePixelId: "", tokenHinterlegt: false };
  it("Admin immer", () => {
    expect(darfMetaPixelSetzen({ ...leer, istAdmin: true, serverErlaubt: false })).toBe(true);
  });
  it("die Antwort des Servers entscheidet, wenn es eine gibt", () => {
    expect(darfMetaPixelSetzen({ ...leer, serverErlaubt: true })).toBe(true);
    expect(darfMetaPixelSetzen({ ...leer, serverErlaubt: false, gespeichertePixelId: "123456789012345" })).toBe(false);
  });
  it("ohne Antwort nur, wer schon etwas hinterlegt hat", () => {
    expect(darfMetaPixelSetzen(leer)).toBe(false);
    expect(darfMetaPixelSetzen({ ...leer, gespeichertePixelId: "123456789012345" })).toBe(true);
    expect(darfMetaPixelSetzen({ ...leer, tokenHinterlegt: true })).toBe(true);
  });
});

describe("vpMarketingStore über die Function vp-marketing", () => {
  beforeEach(() => invoke.mockReset());

  it("liest nur, ob ein Token hinterlegt ist, und die Freigabe", async () => {
    invoke.mockResolvedValue({ data: { ok: true, hinterlegt: true, tabelleFehlt: false, pixelErlaubt: false }, error: null });
    expect(await ladeCapiTokenStatus(PARTNER)).toEqual({ hinterlegt: true, tabelleFehlt: false, pixelErlaubt: false });
    expect(invoke).toHaveBeenCalledWith("vp-marketing", { body: { userId: PARTNER, action: "status" } });
  });

  it("zeigt die Sperre beim Speichern als Fehler", async () => {
    invoke.mockResolvedValue({ data: { ok: false, gesperrt: true, fehler: "Ein eigenes Meta Pixel ist mit dem Vertragsstand ab Oktober 2026 (Anlage 4) möglich. Sprich uns an." }, error: null });
    const r = await speichereCapiToken(PARTNER, "EAAB");
    expect(r.ok).toBe(false);
    expect(r.fehler).toContain("Anlage 4");
    expect(invoke).toHaveBeenCalledWith("vp-marketing", { body: { userId: PARTNER, action: "save", token: "EAAB" } });
  });

  it("Pixel entfernen geht über die Aktion entfernen, Fehler sind sichtbar", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await entferneMetaPixel(PARTNER)).toEqual({ ok: true, tabelleFehlt: false });
    expect(invoke).toHaveBeenCalledWith("vp-marketing", { body: { userId: PARTNER, action: "entfernen" } });
    invoke.mockResolvedValue({ data: { ok: false, fehler: "Das Pixel konnte nicht entfernt werden." }, error: null });
    expect((await entferneMetaPixel(PARTNER)).fehler).toContain("nicht entfernt");
  });

  it("Entfernen geht immer über delete", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await loescheCapiToken(PARTNER)).toEqual({ ok: true, tabelleFehlt: false });
    expect(invoke).toHaveBeenCalledWith("vp-marketing", { body: { userId: PARTNER, action: "delete" } });
  });

  it("ist die Function nicht erreichbar, steht das sichtbar da", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request") });
    const s = await ladeCapiTokenStatus(PARTNER);
    expect(s.fehler).toBeTruthy();
    expect(s.pixelErlaubt).toBeNull();
  });
});
