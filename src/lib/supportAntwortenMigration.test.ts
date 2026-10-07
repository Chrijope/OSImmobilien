import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  hatSupportAntwort, istNurKunde, istSupportRolle, supportMailSchluessel, supportTicketAdresse,
} from "../../supabase/functions/_shared/support-antwort.ts";

/**
 * Migration 20260928130000: Support-Antworten atomar anhaengen und melden.
 *
 * Die Migration laesst sich hier nicht ausfuehren. Die Tests halten am
 * Quelltext fest, was die Freigabe vom 28.09.2026 verlangt.
 */

const DATEI = "20260928130000_support_antworten_melden.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
const CODE = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

function funktion(name: string): string {
  const start = CODE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return CODE.slice(start, CODE.indexOf("\n$$;", start));
}

describe("Migration Support-Antworten", () => {
  it("liegt gleichlautend im Eingangskorb, in der Sammeldatei und im README", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(SQL.trim());
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    for (const zeile of ["31.1 ", "31.2 ", "31.3 ", "31.4 ", "31.5 "]) expect(pruefung).toContain(`'${zeile}`);
  });

  it("alle vier Funktionen mit SECURITY DEFINER und festem search_path", () => {
    for (const name of ["support_ticket_nachricht_anhaengen", "support_ticket_gelesen", "support_ticket_antwort_melden", "support_ticket_mail_beanspruchen"]) {
      const text = funktion(name);
      expect(text, name).toContain("SECURITY DEFINER");
      expect(text, name).toContain("SET search_path = public");
    }
  });

  describe("Anhaengen", () => {
    const text = () => funktion("support_ticket_nachricht_anhaengen");

    it("ist atomar: Zeilensperre und Anhaengen in der Datenbank", () => {
      expect(text()).toContain("FOR UPDATE");
      expect(text()).toContain("v_liste || jsonb_build_array(v_neu)");
    });

    it("prueft die Berechtigung: Ersteller schreibt ins eigene Ticket, nur Support antwortet", () => {
      expect(text()).toMatch(/p_als = 'support' AND NOT v_ist_support/);
      expect(text()).toMatch(/p_als = 'nutzer' AND NOT COALESCE\(v_t\.benutzer_id = v_uid, false\)/);
      expect(text()).toContain("public.is_admin_role(v_uid)");
      expect(text()).toContain("public.has_role(v_uid, 'backoffice'::public.app_role)");
      expect(text()).not.toContain("vertriebsleiter");
    });

    it("Absender aus dem Profil, nicht fest 'Admin'", () => {
      expect(text()).toContain("'MOREImmo Support (' || v_vorname || ')'");
      expect(text()).not.toMatch(/'Admin'/);
    });

    it("stellt nur 'neu' auf 'in_bearbeitung'", () => {
      expect(text()).toContain("WHEN p_als = 'support' AND v_t.status = 'neu' THEN 'in_bearbeitung'");
    });

    it("Glocke nur bei Support-Antwort, nie an den Schreibenden selbst, mit Link aufs Ticket", () => {
      const t = text();
      const glocke = t.slice(t.indexOf("INSERT INTO public.benachrichtigungen") - 300);
      expect(glocke).toContain("IF p_als = 'support' AND v_t.benutzer_id IS NOT NULL AND v_t.benutzer_id <> v_uid");
      // Geloeschtes Konto: Antwort landet, nur die Glocke entfaellt.
      expect(glocke).toContain("AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_t.benutzer_id) THEN");
      expect(glocke).toContain("'/support-kontaktieren?ticket=' || v_t.id::text");
    });
  });

  it("Lesemarke: nur das eigene Ticket und nur dieses Feld", () => {
    const text = funktion("support_ticket_gelesen");
    expect(text).toContain("AND benutzer_id = v_uid");
    expect(text).toContain("'{gelesen_am_ersteller}'");
    expect(text).not.toMatch(/SET\s+status/);
  });

  it("Erneut melden: nur Support, nur mit vorhandener Antwort, ohne neue Nachricht", () => {
    const text = funktion("support_ticket_antwort_melden");
    expect(text).toContain("Nur Support darf Antworten melden");
    expect(text).toContain("n->>'absender' = 'backoffice'");
    expect(text).toContain("- 'gelesen_am_ersteller'");
    // Liest die Liste, schreibt aber keine Nachricht.
    expect(text).not.toContain("jsonb_build_object('nachrichten'");
    expect(text).not.toContain("jsonb_build_array(");
  });

  it("Mail-Bremse: eine bedingte Aenderung, 15 Minuten, nur Service-Rolle", () => {
    const text = funktion("support_ticket_mail_beanspruchen");
    expect(text).toContain("interval '15 minutes'");
    expect(text).toMatch(/UPDATE public\.support_tickets[\s\S]*WHERE id = p_ticket_id[\s\S]*support_mail_am/);
    expect(CODE).toContain("REVOKE ALL ON FUNCTION public.support_ticket_mail_beanspruchen(uuid) FROM public, anon, authenticated;");
    expect(CODE).toContain("GRANT EXECUTE ON FUNCTION public.support_ticket_mail_beanspruchen(uuid) TO service_role;");
  });
});

describe("Mailregeln der Function support-antwort-mail", () => {
  it("nur Admin, Inhaber und Backoffice duerfen die Mail anstossen", () => {
    expect(istSupportRolle(["backoffice"])).toBe(true);
    expect(istSupportRolle(["vertriebspartner", "inhaber"])).toBe(true);
    expect(istSupportRolle(["vertriebsleiter"])).toBe(false);
    expect(istSupportRolle([])).toBe(false);
  });

  it("keine Mail an reine Kunden", () => {
    expect(istNurKunde(["kunde"])).toBe(true);
    expect(istNurKunde([])).toBe(true);
    expect(istNurKunde(["kunde", "vertriebspartner"])).toBe(false);
  });

  it("braucht eine Support-Antwort im Ticket", () => {
    expect(hatSupportAntwort([{ absender: "nutzer" }])).toBe(false);
    expect(hatSupportAntwort([{ absender: "nutzer" }, { absender: "backoffice" }])).toBe(true);
    expect(hatSupportAntwort(undefined)).toBe(false);
  });

  it("Knopf fuehrt direkt aufs Ticket, Schluessel je beanspruchtem Fenster", () => {
    expect(supportTicketAdresse("https://portal.more.immo/", "abc")).toBe("https://portal.more.immo/support-kontaktieren?ticket=abc");
    expect(supportMailSchluessel("abc", "2026-09-28T10:00:00.000Z")).not.toBe(supportMailSchluessel("abc", "2026-09-28T10:15:00.000Z"));
  });

  it("die Function liest die Adresse ueber die Kennung, nie aus dem Ticket", () => {
    const fn = readFileSync("supabase/functions/support-antwort-mail/index.ts", "utf8");
    expect(fn).toContain(".from('profiles').select('name, email').eq('id', empfaengerId)");
    expect(fn).not.toContain("erstellerEmail");
    expect(fn).toContain("support_ticket_mail_beanspruchen");
  });

  it("die Vorlage enthaelt keinen Antworttext und keine Gedankenstriche", () => {
    const vorlage = readFileSync("supabase/functions/_shared/transactional-email-templates/support-antwort.tsx", "utf8");
    const texte = vorlage.split("\n").filter((z) => !z.trim().startsWith("*") && !z.trim().startsWith("//"));
    expect(texte.join("\n")).not.toMatch(/[–—]/);
    expect(vorlage).not.toMatch(/inhalt|antwortText/);
  });
});
