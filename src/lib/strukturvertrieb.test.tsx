import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { KennzahlenZeile, StrukturKennzahlenKontext, seit } = await import("@/components/teampartner/StrukturKennzahlen");

/* Christians Regeln zum Strukturvertrieb vom 22.10.2026, an den Migrationen festgehalten. */
const chats = readFileSync(resolve(process.cwd(), "supabase/migrations/20261022120000_strukturvertrieb_chats_saetze.sql"), "utf8");
const zahlen = readFileSync(resolve(process.cwd(), "supabase/migrations/20261022121000_struktur_kennzahlen.sql"), "utf8");

describe("Strukturvertrieb in der Datenbank", () => {
  it("ergänzt Teamleiter und Vertriebsleitung nur in internen Chats, der Kundenchat bleibt 1:1", () => {
    const trigger = chats.slice(chats.indexOf("FUNCTION public.chat_gruppe_struktur_ergaenzen"));
    expect(trigger).toMatch(/kundenkommunikation[\s\S]*RETURN NEW;[\s\S]*struktur_chat_teilnehmer_ergaenzen\(NEW\.id, NEW\.erstellt_von\)/);
    expect(chats).not.toMatch(/FUNCTION public\.kundenchat_teilnehmer_abgleichen/);
    expect(chats).toMatch(/ELSIF v_kundenchat THEN\s+RAISE EXCEPTION 'Der Kundenchat bleibt zwischen Partner und Kunde\.'/);
  });

  it("lässt Vertriebspartner nur ihre Struktur nach unten einladen, weitere Rollen nur die Leitung", () => {
    expect(chats).toMatch(/ELSIF v_leitung THEN\s+NULL;\s+ELSIF v_partner THEN\s+IF EXISTS \(SELECT 1 FROM public\.struktur_unter\(v_uid\)/);
    expect(chats).toMatch(/ELSIF v_partnerchat THEN\s+RAISE EXCEPTION 'In diesen Chat laedt nur die Vertriebsleitung/);
  });

  it("begrenzt Sätze auf den direkten Teamleiter und nach unten auf den höchsten Satz darunter", () => {
    expect(chats).toMatch(/provisions_obergrenze\(k\.leiter_id\) FROM public\.struktur_kette\(_partner\) k WHERE k\.ebene = 1/);
    expect(chats).toMatch(/max\(public\.provisions_obergrenze\(u\.mitglied_id\)\) FROM public\.struktur_unter\(_partner\) u WHERE u\.ebene = 1/);
  });

  it("gibt Kennzahlen nur als Summen und nur im erlaubten Umfang heraus", () => {
    expect(zahlen).toMatch(/FROM public\.meine_struktur\(\) m\s+WHERE public\.ist_nur_vertriebspartner\(auth\.uid\(\)\)/);
    expect(zahlen).toMatch(/AND public\.ist_vertriebsleitung\(auth\.uid\(\)\)/);
    // Keine Spalte mit Kundennamen oder Kontakt-Kennungen.
    const rueckgabe = zahlen.slice(zahlen.indexOf("RETURNS TABLE("), zahlen.indexOf("LANGUAGE sql"));
    expect(rueckgabe).not.toMatch(/name|kontakt|kunde_id/);
  });
});

describe("Kennzahlen im Strukturbaum", () => {
  it("zeigt Kunden je Stufe, Termine und Aktivität eines Partners", () => {
    const k = {
      partner_id: "p1", kunden_gesamt: 9, leads: 4, beratung: 3, kaufphase: 1, abgeschlossen: 1, verloren: 0,
      termine: 5, reservierungen: 1, notartermine: 0, letzte_aktivitaet: new Date().toISOString(), letzter_login: null,
    };
    render(
      <StrukturKennzahlenKontext.Provider value={new Map([["p1", k]])}>
        <KennzahlenZeile partnerId="p1" />
        <KennzahlenZeile partnerId="unbekannt" />
      </StrukturKennzahlenKontext.Provider>,
    );
    const zeile = screen.getAllByTestId("struktur-kennzahlen");
    expect(zeile).toHaveLength(1);
    expect(zeile[0]).toHaveTextContent("4Leads3Beratung1Kauf1Abschl.");
    expect(zeile[0]).toHaveTextContent("5 Termine · 1 Reserv. · 0 Notar");
    expect(zeile[0]).toHaveTextContent("Aktiv heute · Login –");
  });

  it("schreibt Zeitabstände kurz", () => {
    const jetzt = new Date("2026-10-22T12:00:00Z");
    expect(seit(null, jetzt)).toBe("–");
    expect(seit("2026-10-21T10:00:00Z", jetzt)).toBe("gestern");
    expect(seit("2026-10-12T12:00:00Z", jetzt)).toBe("vor 10 Tagen");
    expect(seit("2026-06-22T12:00:00Z", jetzt)).toBe("vor 4 Monaten");
  });
});

describe("Namensabgleich mit unsichtbaren Namensvettern", () => {
  it("macht einen Namen mehrdeutig, wenn der Namensvetter für den Partner unsichtbar ist", async () => {
    const { mitVerdecktenNamensvettern, findeBeraterNachName } = await import("@/lib/beraterNamensabgleich");
    const sichtbar = [{ id: "a", name: "Max Muster" }, { id: "b", name: "Eva Klar" }];
    const liste = mitVerdecktenNamensvettern(sichtbar, new Set(["max muster"]));
    expect(findeBeraterNachName("Max Muster", liste).art).toBe("mehrdeutig");
    expect(findeBeraterNachName("Eva Klar", liste)).toMatchObject({ art: "eindeutig", id: "b" });
    // Sind beide Namensvettern sichtbar, kommt kein verdeckter Eintrag dazu.
    expect(mitVerdecktenNamensvettern([...sichtbar, { id: "c", name: "max  muster" }], new Set(["max muster"]))).toHaveLength(3);
  });
});
