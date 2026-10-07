/**
 * H1 vom 04.10.2026: `lead-eskalation-check` und `send-sla-inactivity-nudges`.
 *
 * Beide liefen nie, weil ihre Rollenliste `juniorpartner` enthielt, das es im
 * Enum `app_role` nicht gibt. Dazu der Stichtag gegen die Altfall-Welle und
 * die eigene Merkmarke, die `aktualisiert_am` zuruecksetzte.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLES } from "@/types/user";
import {
  ESKALATION_STICHTAG,
  eskalationsBezug,
  vorStichtag,
} from "../../supabase/functions/_shared/eskalation-bezug.ts";

const lies = (...teile: string[]) => readFileSync(join(process.cwd(), ...teile), "utf8");

describe("eskalationsBezug", () => {
  it("nimmt aktualisiert_am, solange keine eigene Marke im Spiel ist", () => {
    expect(eskalationsBezug({ aktualisiert_am: "2026-10-01T08:00:00Z", erstellt_am: "2026-09-20T08:00:00Z" }))
      .toBe("2026-10-01T08:00:00Z");
    expect(eskalationsBezug({ aktualisiert_am: null, erstellt_am: "2026-09-20T08:00:00Z" }))
      .toBe("2026-09-20T08:00:00Z");
  });

  it("zaehlt die eigene Merkmarke nicht als Aktivitaet", () => {
    // Die Marke setzte aktualisiert_am auf den Zeitpunkt der Eskalation.
    expect(
      eskalationsBezug({
        aktualisiert_am: "2026-10-05T02:00:00.150Z",
        meta: { eskalationBezug: "2026-10-01T08:00:00Z", eskalationMarkeAm: "2026-10-05T02:00:00.000Z" },
      }),
    ).toBe("2026-10-01T08:00:00Z");
  });

  it("nimmt eine echte Aktivitaet nach der Marke wieder ernst", () => {
    expect(
      eskalationsBezug({
        aktualisiert_am: "2026-10-06T10:00:00Z",
        meta: { eskalationBezug: "2026-10-01T08:00:00Z", eskalationMarkeAm: "2026-10-05T02:00:00Z" },
      }),
    ).toBe("2026-10-06T10:00:00Z");
  });
});

describe("Stichtag", () => {
  it("steht auf dem 27.09.2026", () => {
    expect(ESKALATION_STICHTAG.startsWith("2026-09-27")).toBe(true);
  });

  it("laesst Altfaelle liegen und nimmt neue Faelle", () => {
    expect(vorStichtag("2026-09-20T08:00:00Z")).toBe(true);
    expect(vorStichtag("2026-09-28T08:00:00Z")).toBe(false);
    // Ohne lesbaren Zeitpunkt lieber nicht eskalieren.
    expect(vorStichtag(null)).toBe(true);
  });
});

describe("Rollenlisten der beiden Dienste", () => {
  const enumRollen = new Set(ROLES.map((r) => r.id));
  const dateien = [
    ["supabase", "functions", "lead-eskalation-check", "index.ts"],
    ["supabase", "functions", "send-sla-inactivity-nudges", "index.ts"],
  ];

  it.each(dateien)("%s/%s/%s/%s nennt nur Rollen aus app_role und keine Setterin", (...pfad) => {
    const text = lies(...pfad);
    expect(text).not.toMatch(/['"]juniorpartner['"]/);
    expect(text).not.toMatch(/['"]setterin['"]/);
    const block = pfad[2] === "lead-eskalation-check"
      ? text.match(/BETREUENDE_ROLLEN = \[([^\]]*)\]/)?.[1]
      : text.match(/\.in\("role", \[([^\]]*)\]\)/)?.[1];
    expect(block).toBeTruthy();
    for (const rolle of block!.match(/[a-z_]+/g) || []) expect(enumRollen.has(rolle as never)).toBe(true);
  });

  it.each(dateien)("%s/%s/%s/%s wertet den Fehler der Rollenabfrage aus", (...pfad) => {
    const text = lies(...pfad);
    expect(text).toMatch(/error: (rErr|rolesError)/);
    expect(text).toContain("vorStichtag(");
  });

  it.each(dateien)("%s/%s/%s/%s gibt keine rohen Datenbankmeldungen nach aussen", (...pfad) => {
    const text = lies(...pfad);
    expect(text).not.toMatch(/JSON\.stringify\(\{[^}]*\.message/);
    expect(text).not.toContain("errors: errors.slice");
  });

  it("schreibt den Bezug mit der Merkmarke", () => {
    const text = lies("supabase", "functions", "lead-eskalation-check", "index.ts");
    expect(text).toContain("patch.eskalationBezug = bezug");
    expect(text).toContain("patch.eskalationMarkeAm = jetzt");
    expect(text).toContain("tageSeit(bezug)");
  });
});
