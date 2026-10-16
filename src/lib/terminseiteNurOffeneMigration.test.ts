import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migrationen vom 16.10.2026: Die Terminseite verschiebt nur noch offene
 * Termine, und schon falsch verschobene werden wieder geöffnet.
 *
 * Ausführen lässt sich SQL hier nicht. Der Test hält deshalb zweierlei fest:
 * den Quelltext der Regel wortgenau und, an einem Abbild dieser Regel, die
 * Fälle offen, abgeschlossen, laufend und die 15-Minuten-Grenze. Ändert
 * jemand die Regel in der Migration, scheitert der erste Teil, und das Abbild
 * muss mitgezogen werden.
 */

const REGEL = readFileSync("supabase/migrations/20261016120000_terminseite_nur_offene_verschieben.sql", "utf8");
const VORLAGE = readFileSync("supabase/migrations/20260930140000_terminseite_dauer.sql", "utf8");
const REPARATUR = readFileSync("supabase/migrations/20261016121000_terminseite_verschobene_termine_oeffnen.sql", "utf8");

const PRAEDIKAT = `  SELECT _b.status = 'offen'
    AND (_b.start_at > now() OR _b.created_at >= now() - interval '15 minutes')
    AND NOT EXISTS (
      SELECT 1 FROM public.aktivitaeten a
      WHERE a.id = _b.aktivitaet_id
        -- Text-Spalte; leer zaehlt wie im Frontend als nicht erledigt.
        AND NULLIF(btrim(a.erledigt_am), '') IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.aufgaben g
      WHERE _b.aktivitaet_id IS NOT NULL
        AND g.meeting_aktivitaet_id = _b.aktivitaet_id
        AND g.status IN ('erledigt', 'abgesagt')
    );`;

/** Abbild von `partnertermin_korrigierbar`, Zeiten in Minuten relativ zu jetzt. */
interface Fall {
  status: "offen" | "wahrgenommen" | "nicht_erschienen" | "abgesagt";
  beginnInMin: number;
  eingetragenVorMin: number;
  verlaufErledigt?: boolean;
  aufgabe?: "offen" | "in_bearbeitung" | "erledigt" | "abgesagt";
}
function korrigierbar(f: Fall): boolean {
  return f.status === "offen"
    && (f.beginnInMin > 0 || f.eingetragenVorMin <= 15)
    && !f.verlaufErledigt
    && f.aufgabe !== "erledigt" && f.aufgabe !== "abgesagt";
}

/** Ab der ersten Zeile nach dem Helfer, also nur die beiden kopierten Funktionen. */
const rumpf = (sql: string) => sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.partnertermin_zugang"));

describe("Regel: nur offene Termine verschieben", () => {
  it("steht wortgenau in der Hilfsfunktion", () => {
    expect(REGEL).toContain(PRAEDIKAT);
  });

  it("ändert gegenüber 20260930140000 nur die beiden Stellen mit der Stunde", () => {
    const zurueck = rumpf(REGEL)
      .replace("'korrigierbar', public.partnertermin_korrigierbar(b),", "'korrigierbar', b.start_at >= now() - interval '1 hour',")
      .replace(
        "    -- Seit 16.10.2026: nur ein offener Termin, siehe partnertermin_korrigierbar.\n    AND public.partnertermin_korrigierbar(b)\n",
        "    AND b.start_at >= now() - interval '1 hour'\n",
      );
    expect(zurueck).toBe(rumpf(VORLAGE));
  });

  it("lässt die Vergangenheitsgrenze für die eingegebene Zeit stehen", () => {
    expect(REGEL).toContain("IF _start < now() - interval '1 hour' THEN");
  });

  it("ist über die API nicht aufrufbar", () => {
    expect(REGEL).toContain("REVOKE ALL ON FUNCTION public.partnertermin_korrigierbar(public.buchungen) FROM PUBLIC, anon, authenticated;");
  });

  it("verschiebt einen offenen Termin, der noch nicht begonnen hat", () => {
    expect(korrigierbar({ status: "offen", beginnInMin: 30, eingetragenVorMin: 120, aufgabe: "offen" })).toBe(true);
  });

  it("fasst einen abgeschlossenen Termin nicht an (Beispiel 13:00 No-Show, 13:20 neu)", () => {
    expect(korrigierbar({ status: "nicht_erschienen", beginnInMin: -20, eingetragenVorMin: 120, verlaufErledigt: true, aufgabe: "abgesagt" })).toBe(false);
    expect(korrigierbar({ status: "wahrgenommen", beginnInMin: -20, eingetragenVorMin: 120, verlaufErledigt: true, aufgabe: "erledigt" })).toBe(false);
    // Auch in der Zukunft: abgeschlossen bleibt abgeschlossen.
    expect(korrigierbar({ status: "wahrgenommen", beginnInMin: 30, eingetragenVorMin: 120 })).toBe(false);
  });

  it("fasst einen Termin nicht an, dessen Verlaufszeile oder Aufgabe schon erledigt ist", () => {
    expect(korrigierbar({ status: "offen", beginnInMin: 30, eingetragenVorMin: 120, verlaufErledigt: true })).toBe(false);
    expect(korrigierbar({ status: "offen", beginnInMin: 30, eingetragenVorMin: 120, aufgabe: "erledigt" })).toBe(false);
    expect(korrigierbar({ status: "offen", beginnInMin: 30, eingetragenVorMin: 120, aufgabe: "in_bearbeitung" })).toBe(true);
  });

  it("fasst ein laufendes Gespräch nicht an, das früher eingetragen wurde", () => {
    expect(korrigierbar({ status: "offen", beginnInMin: -10, eingetragenVorMin: 60, aufgabe: "offen" })).toBe(false);
  });

  it("korrigiert bis einschließlich 15 Minuten nach dem Eintragen, danach nicht mehr", () => {
    expect(korrigierbar({ status: "offen", beginnInMin: -30, eingetragenVorMin: 15, aufgabe: "offen" })).toBe(true);
    expect(korrigierbar({ status: "offen", beginnInMin: -30, eingetragenVorMin: 16, aufgabe: "offen" })).toBe(false);
  });
});

describe("Reparatur: falsch verschobene Termine wieder öffnen", () => {
  it("sichert vorher Buchungen, Verlaufszeilen und Aufgaben, unlesbar über die API", () => {
    for (const t of ["buchungen", "aktivitaeten", "aufgaben"]) {
      expect(REPARATUR).toContain(`CREATE TABLE IF NOT EXISTS public.${t}_sicherung_20261016 AS`);
      expect(REPARATUR).toContain(`ALTER TABLE public.${t}_sicherung_20261016 ENABLE ROW LEVEL SECURITY;`);
      expect(REPARATUR).toContain(`REVOKE ALL ON public.${t}_sicherung_20261016 FROM anon, authenticated;`);
    }
    expect(REPARATUR.indexOf("_sicherung_20261016 AS")).toBeLessThan(REPARATUR.indexOf("UPDATE public.buchungen b"));
  });

  it("löscht nichts und sagt nichts ab", () => {
    const ohneKommentare = REPARATUR.replace(/^--.*$/gm, "");
    expect(ohneKommentare).not.toMatch(/\bDELETE\b|\bDROP TABLE\b|TRUNCATE|'abgesagt'/);
  });

  it("ändert an der Buchung nur den Status, nicht die Zeit (sonst ginge eine Mail raus)", () => {
    expect(REPARATUR).toMatch(/UPDATE public\.buchungen b\nSET status = 'offen'\nWHERE/);
    expect(REPARATUR).not.toMatch(/UPDATE public\.buchungen[^;]*start_at\s*=/);
  });

  it("nimmt nur abgeschlossene Terminseiten-Buchungen, die nach dem Abschluss geändert wurden", () => {
    expect(REPARATUR).toContain("JOIN public.buchung_links l ON l.id = b.link_id AND l.ziel = 'extern'");
    expect(REPARATUR).toContain("WHERE b.status IN ('wahrgenommen', 'nicht_erschienen')");
    expect(REPARATUR).toContain("THEN a.erledigt_am::timestamptz END + interval '1 minute'");
    // erledigt_am ist Text: nie ohne Prüfung umwandeln oder rechnen.
    expect(REPARATUR.replace(/^--.*$/gm, "")).not.toMatch(/a\.erledigt_am \+|a\.erledigt_am IS NOT NULL/);
  });
});
