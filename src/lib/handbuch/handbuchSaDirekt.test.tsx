/**
 * Selbstauskunft aus dem Handbuch ohne zweites Kontaktformular (28.09.2026).
 *
 * Geprüft wird:
 *   - direkter Sprung: Ergebnisseite und PDF führen in die Selbstauskunft,
 *     nicht auf die offene Selbstauskunft mit Kontaktformular;
 *   - derselbe Lead: der neue Ausfüll-Link hängt am Lead des Handbuchs, es
 *     entsteht kein Kontakt;
 *   - ohne Lead (abgelaufen, unbekannt, weitergeleitetes PDF ohne Token): die
 *     offene Selbstauskunft, die den Lead anlegt oder zuordnet;
 *   - nur Ausfüllen: das PDF trägt nie den eigenen Link, der neue Link liest
 *     nichts Gespeichertes, `handbuch_abrufen` gibt den Link nicht heraus;
 *   - eine fertige Selbstauskunft wird nicht überschrieben.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: vi.fn(),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/lib/handbuch/ereignisse", () => ({ zaehleHandbuch: vi.fn() }));

import { saStartPfad, saWege } from "./wege";
import { leseSaStart, starteHandbuchSelbstauskunft } from "./saStart";
import { baueHandbuch } from "./inhalt";
import { istMetaPixelRoute } from "@/lib/metaPixel";
import HandbuchSelbstauskunftStart from "@/pages/HandbuchSelbstauskunftStart";
import HandbuchErgebnis from "@/pages/HandbuchErgebnis";
import type { HandbuchErgebnisZustand } from "@/pages/HandbuchLanding";
import type { HandbuchAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";

const HB = "a".repeat(64);
const SA = "b".repeat(64);
const NEU = "c".repeat(64);
const A: HandbuchAntworten = { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" };
const OFFEN = "/handbuch/selbstauskunft";

const migration = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20260928200000_handbuch_sa_direkt.sql"), "utf8");
const funktion = (name: string) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  return migration.slice(start, migration.indexOf("$$;", start));
};

beforeEach(() => {
  rpc.mockReset();
});

describe("saWege: wohin „Selbstauskunft ausfüllen“ führt", () => {
  it("Ergebnisseite in derselben Sitzung: der eigene Link, kein Kontaktformular", () => {
    const w = saWege({ saToken: SA, handbuchToken: HB, saStatus: "offen", beraterSlug: "partner" });
    expect(w.bildschirm).toBe(`/sa/${SA}`);
    expect(w.bildschirm).not.toContain(OFFEN);
  });

  it("Ergebnisseite aus der Mail (ohne eigenen Link): Einstieg über das Handbuch-Token", () => {
    const w = saWege({ saToken: null, handbuchToken: HB, saStatus: "offen", beraterSlug: null });
    expect(w.bildschirm).toBe(saStartPfad(HB));
  });

  it("PDF: nie der eigene Link, sondern der Einstieg über das Handbuch-Token", () => {
    const w = saWege({ saToken: SA, handbuchToken: HB, saStatus: "offen", beraterSlug: "partner" });
    expect(w.pdf).toBe(`/handbuch/ergebnis/${HB}/selbstauskunft`);
    expect(w.pdf).not.toContain(SA);
  });

  it("Dublette (kein Token im Browser): kein Knopf auf dem Bildschirm, der Link kommt per Mail", () => {
    const w = saWege({ saToken: null, handbuchToken: null, saStatus: null, beraterSlug: "partner" });
    expect(w.bildschirm).toBeNull();
    // Das PDF kann weitergegeben werden: dort die offene Selbstauskunft, die den Lead selbst zuordnet.
    expect(w.pdf).toBe("/handbuch/partner/selbstauskunft");
  });

  it("Selbstauskunft liegt vor: weder Bildschirm noch PDF bieten sie an", () => {
    expect(saWege({ saToken: SA, handbuchToken: HB, saStatus: "ausgefuellt", beraterSlug: null })).toEqual({ bildschirm: null, pdf: null });
  });

  it("die Startseite trägt ein Token, dort lädt kein Pixel", () => {
    expect(istMetaPixelRoute(saStartPfad(HB))).toBe(false);
  });
});

describe("Handbuch-Kapitel ohne Knopf", () => {
  it("per Mail: eigener Ersatztext statt „liegt schon vor“", () => {
    const text = (saPerMail: boolean) =>
      JSON.stringify(baueHandbuch({ antworten: A, vorname: "Erika", nachname: "Muster", datum: "28.09.2026", saLink: null, saPerMail }));
    expect(text(true)).toContain("Ihren persönlichen Link zur Selbstauskunft senden wir Ihnen per E-Mail.");
    expect(text(true)).not.toContain("liegt uns schon vor");
    expect(text(false)).toContain("Ihre Selbstauskunft liegt uns schon vor.");
  });
});

describe("leseSaStart", () => {
  it("wertet die Antworten der Datenbankfunktion aus", () => {
    expect(leseSaStart({ status: "ok", saToken: NEU })).toEqual({ status: "ok", saToken: NEU });
    expect(leseSaStart({ status: "ok", saToken: "kurz" })).toEqual({ status: "fehler" });
    expect(leseSaStart({ status: "liegt_vor" })).toEqual({ status: "liegtVor" });
    expect(leseSaStart({ status: "abgelaufen" })).toEqual({ status: "abgelaufen" });
    expect(leseSaStart({ status: "zu_oft" })).toEqual({ status: "zuOft" });
    expect(leseSaStart({ status: "unbekannt" })).toEqual({ status: "unbekannt" });
    expect(leseSaStart(null)).toEqual({ status: "fehler" });
  });
});

describe("starteHandbuchSelbstauskunft", () => {
  it("fragt die Datenbank nur mit einem gültigen Handbuch-Token", async () => {
    expect(await starteHandbuchSelbstauskunft("neu")).toEqual({ status: "unbekannt" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mit Migration: der frische Link aus handbuch_sa_starten", async () => {
    rpc.mockResolvedValue({ data: { status: "ok", saToken: NEU }, error: null });
    expect(await starteHandbuchSelbstauskunft(HB)).toEqual({ status: "ok", saToken: NEU });
    expect(rpc).toHaveBeenCalledWith("handbuch_sa_starten", { _token: HB });
  });

  it("ohne Migration: der bisherige Weg über handbuch_abrufen", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "handbuch_sa_starten"
        ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
        : { data: { abgelaufen: false, vorname: "Erika", nachname: "Muster", antworten: A, saToken: SA, saStatus: "offen" }, error: null },
    );
    expect(await starteHandbuchSelbstauskunft(HB)).toEqual({ status: "ok", saToken: SA });
  });

  it("ohne Migration und ohne gespeicherten Link: offene Selbstauskunft (unbekannt)", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "handbuch_sa_starten"
        ? { data: null, error: { code: "PGRST202" } }
        : { data: { abgelaufen: false, vorname: "Erika", nachname: "Muster", antworten: A, saStatus: null }, error: null },
    );
    expect(await starteHandbuchSelbstauskunft(HB)).toEqual({ status: "unbekannt" });
  });

  it("ein anderer Fehler nimmt nie den alten Weg", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    expect(await starteHandbuchSelbstauskunft(HB)).toEqual({ status: "fehler" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

function Adresse() {
  const l = useLocation();
  return <div data-testid="adresse">{l.pathname}</div>;
}

// `?lang=de`: Die Seiten folgen sonst der Browsersprache von jsdom (Englisch).
function starteSeite() {
  return render(
    <MemoryRouter initialEntries={[`${saStartPfad(HB)}?lang=de`]}>
      <Routes>
        <Route path="/handbuch/ergebnis/:token/selbstauskunft" element={<HandbuchSelbstauskunftStart />} />
        <Route path="/sa/:token" element={<Adresse />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Startseite /handbuch/ergebnis/:token/selbstauskunft", () => {
  it("springt direkt in die Selbstauskunft, ohne Kontaktformular", async () => {
    rpc.mockResolvedValue({ data: { status: "ok", saToken: NEU }, error: null });
    starteSeite();
    expect(await screen.findByTestId("adresse")).toHaveTextContent(`/sa/${NEU}`);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fertige Selbstauskunft: kein neuer Link, nur der Hinweis", async () => {
    rpc.mockResolvedValue({ data: { status: "liegt_vor" }, error: null });
    starteSeite();
    expect(await screen.findByText("Ihre Selbstauskunft liegt uns schon vor.")).toBeInTheDocument();
    expect(screen.queryByTestId("adresse")).toBeNull();
  });

  it("abgelaufen: Weg über die offene Selbstauskunft, die den Lead selbst zuordnet", async () => {
    rpc.mockResolvedValue({ data: { status: "abgelaufen" }, error: null });
    starteSeite();
    const knopf = await screen.findByRole("link", { name: /Selbstauskunft ausfüllen/ });
    expect(knopf.getAttribute("href")).toMatch(/^\/handbuch\/selbstauskunft(\?|$)/);
  });
});

describe("Ergebnisseite", () => {
  const zustand = (z: Partial<HandbuchErgebnisZustand>): HandbuchErgebnisZustand => ({
    antworten: A,
    vorname: "Erika",
    nachname: "Muster",
    handbuchToken: HB,
    saToken: SA,
    beraterSlug: null,
    ...z,
  });
  const zeige = (z: HandbuchErgebnisZustand) =>
    render(
      <MemoryRouter initialEntries={[{ pathname: "/handbuch/ergebnis/neu", search: "?lang=de", state: z }]}>
        <Routes>
          <Route path="/handbuch/ergebnis/:token" element={<HandbuchErgebnis />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    sessionStorage.clear();
    // jsdom kennt kein IntersectionObserver (Einblenden der Kapitel).
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("neuer Lead: der Knopf führt direkt in die Selbstauskunft", async () => {
    zeige(zustand({}));
    await waitFor(() => expect(screen.getAllByRole("link", { name: /Selbstauskunft ausfüllen/ }).length).toBeGreaterThan(0));
    for (const a of screen.getAllByRole("link", { name: /Selbstauskunft ausfüllen/ })) {
      expect(a.getAttribute("href")).toContain(`/sa/${SA}`);
      expect(a.getAttribute("href")).not.toContain(OFFEN);
    }
  });

  it("bekannte Adresse (kein Token): kein Knopf zum Kontaktformular, Hinweis auf die Mail", async () => {
    zeige(zustand({ handbuchToken: null, saToken: null }));
    expect((await screen.findAllByText(/senden wir Ihnen per E-Mail/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Selbstauskunft ausfüllen/ })).toBeNull();
    expect(document.querySelector(`a[href*="${OFFEN}"]`)).toBeNull();
  });

  /* Aus der Mail geöffnet: Der Stand der Selbstauskunft kommt aus `handbuch_abrufen`. */
  const zeigeAusMail = (saStatus: "ausgefuellt" | "abgelaufen", lang = "de") => {
    rpc.mockResolvedValue({ data: { abgelaufen: false, vorname: "Erika", nachname: "Muster", antworten: A, saToken: null, saStatus }, error: null });
    return render(
      <MemoryRouter initialEntries={[{ pathname: `/handbuch/ergebnis/${HB}`, search: `?lang=${lang}` }]}>
        <Routes>
          <Route path="/handbuch/ergebnis/:token" element={<HandbuchErgebnis />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it("Selbstauskunft liegt vor: eigene Überschrift, Dank, kein Knopf zum Ausfüllen (29.09.2026)", async () => {
    zeigeAusMail("ausgefuellt");
    expect(await screen.findByRole("heading", { name: "Ihre Selbstauskunft liegt vor" })).toBeTruthy();
    expect(screen.getByText("Vielen Dank. Ihr Berater meldet sich mit den nächsten Schritten bei Ihnen.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Selbstauskunft ausfüllen" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Selbstauskunft ausfüllen/ })).toBeNull();
  });

  it("Selbstauskunft liegt vor, englisch", async () => {
    zeigeAusMail("ausgefuellt", "en");
    expect(await screen.findByRole("heading", { name: "Your self-disclosure has been received" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Complete the self-disclosure" })).toBeNull();
  });

  it("abgelaufener Link: eigener Hinweis, der Knopf holt einen neuen Link", async () => {
    zeigeAusMail("abgelaufen");
    expect(await screen.findByText("Ihr bisheriger Link zur Selbstauskunft ist abgelaufen. Über den Knopf erhalten Sie einen neuen.")).toBeTruthy();
    const knopf = screen.getAllByRole("link", { name: /Selbstauskunft ausfüllen/ })[0];
    expect(knopf.getAttribute("href")).toContain(saStartPfad(HB));
  });
});

describe("Migration 20260928200000", () => {
  const starten = funktion("handbuch_sa_starten");
  const abrufen = funktion("handbuch_abrufen");

  it("derselbe Lead: der Link hängt an Kontakt und Investment des Handbuchs, kein neuer Kontakt", () => {
    expect(starten).toMatch(/INSERT INTO public\.sa_fill_tokens/);
    expect(starten).toContain("_z.kontakt_id::text, _z.investment_id::text");
    expect(starten).not.toMatch(/INSERT INTO public\.kontakte/);
    expect(starten).toContain("_kunde IS DISTINCT FROM _z.kontakt_id");
  });

  it("nur Ausfüllen: keine E-Mail, kein gespeicherter Stand in der Vorbelegung", () => {
    expect(starten).toMatch(/_z\.kontakt_id::text, _z\.investment_id::text, '',/);
    expect(starten).not.toContain("prefill_data FROM");
    expect(starten).not.toContain("saData");
    expect(starten).not.toMatch(/\bemail\b\s*FROM|k\.email|k\.telefon/);
    // Zurück geht nur der Status und das neue Token.
    expect(starten.match(/RETURN jsonb_build_object\([^;]*\);/g)?.every((r) => !/vorname|email|kontakt/.test(r))).toBe(true);
  });

  it("fertige Selbstauskunft wird nicht überschrieben, Link zeitlich begrenzt und gebremst", () => {
    const pruefung = starten.indexOf("'saSigned'");
    expect(pruefung).toBeGreaterThan(0);
    expect(pruefung).toBeLessThan(starten.indexOf("INSERT INTO"));
    expect(starten).toContain("'liegt_vor'");
    expect(starten).toContain("_z.gueltig_bis < now()");
    expect(starten).toContain("now() + interval '7 days'");
    expect(starten).toContain("_anzahl >= 10");
  });

  it("kein Link, solange Person 2 unterschreibt oder schon über einen Link abgeschickt wurde", () => {
    const ende = starten.indexOf("'liegt_vor'");
    expect(starten.slice(0, ende)).toContain("'saSignaturePartial'");
    expect(starten.slice(0, ende)).toMatch(/t\.investment_id = _z\.investment_id::text\s+AND t\.status = 'used'/);
  });

  it("gezählt wird unter einer Sperre je Kontakt", () => {
    const sperre = starten.indexOf("pg_advisory_xact_lock(hashtext(_z.kontakt_id::text))");
    expect(sperre).toBeGreaterThan(0);
    expect(sperre).toBeLessThan(starten.indexOf("SELECT count(*)"));
  });

  it("Links aus dem PDF halten den Zwischenstand nur am Link, nicht am Investment", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS nur_am_link boolean NOT NULL DEFAULT false");
    expect(starten).toMatch(/reminder_sent_at, nur_am_link\)[\s\S]*now\(\), true\)/);
    const speichern = funktion("update_sa_fill_token_data");
    const pruefung = speichern.indexOf("NOT v_token_row.nur_am_link");
    expect(pruefung).toBeGreaterThan(0);
    expect(pruefung).toBeLessThan(speichern.indexOf("UPDATE investments"));
    // Die Rechte bleiben wie bisher.
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.update_sa_fill_token_data(text, jsonb) TO anon, authenticated;");
  });

  it("handbuch_abrufen gibt den gespeicherten Link nicht mehr heraus", () => {
    expect(abrufen).not.toMatch(/'saToken'/);
    expect(abrufen).toContain("'saStatus'");
  });

  it("Vorbelegung wie saVorbelegung im Server-Code", () => {
    expect(starten).toContain("WHEN 'beamter' THEN 'angestellt'");
    expect(starten).toContain("WHEN 'selbststaendig' THEN 'selbstaendig'");
    expect(starten).toContain("WHEN 'alter' THEN jsonb_build_array('rente')");
  });
});
