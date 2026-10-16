import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dataCache", () => ({ cacheGet: () => [] }));

import { differenzenAusKette, festgeschriebeneKette, strukturUnter } from "./partnerstruktur";
import { strukturEinladung } from "../../supabase/functions/_shared/einladung-konditionen";

/* Partnerstruktur und Differenz je Ebene (Christian, 16.10.2026). */

describe("Differenz je Ebene", () => {
  it("A 10 %, B 8 %, C 5 %: Abschluss von C ergibt B 3 % und A 2 %", () => {
    const d = differenzenAusKette(5, [
      { ebene: 2, partner: "A", satz: 10 },
      { ebene: 1, partner: "B", satz: 8 },
    ]);
    expect(d.map((x) => [x.leiterId, x.differenzSatz])).toEqual([["B", 3], ["A", 2]]);
  });

  it("nie negativ und insgesamt nie mehr als der höchste Satz", () => {
    // B liegt unter C: B bekommt nichts, A die Differenz zu C.
    const d = differenzenAusKette(5, [
      { ebene: 1, partner: "B", satz: 4 },
      { ebene: 2, partner: "A", satz: 10 },
    ]);
    expect(d).toEqual([{ leiterId: "A", ebene: 2, leiterSatz: 10, differenzSatz: 5 }]);
  });

  it("Teamleiter ohne Satz bekommt nichts und verschiebt nichts", () => {
    const d = differenzenAusKette(5, [
      { ebene: 1, partner: "B", satz: null },
      { ebene: 2, partner: "A", satz: 10 },
    ]);
    expect(d.map((x) => [x.leiterId, x.differenzSatz])).toEqual([["A", 5]]);
  });

  it("Nachkommastellen ohne Rundungsrest", () => {
    expect(differenzenAusKette(4.2, [{ ebene: 1, partner: "B", satz: 10.5 }])[0].differenzSatz).toBe(6.3);
  });
});

describe("festgeschriebene Kette", () => {
  it("liest lockedProvisionKette, sortiert nach Ebene, verwirft Unsinn", () => {
    expect(
      festgeschriebeneKette({ lockedProvisionKette: [{ ebene: 2, partner: "A", satz: 10 }, { ebene: 1, partner: "B", satz: "8" }, { foo: 1 }] }),
    ).toEqual([{ ebene: 1, partner: "B", satz: null }, { ebene: 2, partner: "A", satz: 10 }]);
  });

  it("ohne Kette (vor der Reservierung oder Altbestand) null", () => {
    expect(festgeschriebeneKette({})).toBeNull();
    expect(festgeschriebeneKette(null)).toBeNull();
  });
});

describe("Struktur über alle Ebenen", () => {
  const zeilen = [
    { user_id: "B", einstellungen: { teamleader_id: "A" } },
    { user_id: "C", einstellungen: { teamleader_id: "B" } },
    { user_id: "D", einstellungen: { teamleader_id: "C" } },
    { user_id: "X", einstellungen: { teamleader_id: "Y" } },
  ];
  it("liefert alle Ebenen mit Teamleiter", () => {
    expect(strukturUnter("A", zeilen)).toEqual([
      { userId: "B", ebene: 1, teamleiterId: "A" },
      { userId: "C", ebene: 2, teamleiterId: "B" },
      { userId: "D", ebene: 3, teamleiterId: "C" },
    ]);
  });
  it("übersteht einen Kreis", () => {
    const kreis = [...zeilen, { user_id: "A", einstellungen: { teamleader_id: "D" } }];
    expect(strukturUnter("A", kreis).map((z) => z.userId)).toEqual(["B", "C", "D"]);
  });
});

describe("invite-user: Vertriebspartner lädt in seine Struktur ein", () => {
  const basis = { aufruferId: "A", rollen: ["vertriebspartner"], obergrenze: 10 };
  it("ein Satz bis zum eigenen Eigen-Satz, der Einladende wird Teamleiter", () => {
    expect(strukturEinladung({ ...basis, satzRoh: "8,5" })).toEqual({ satz: 8.5, teamleaderId: "A" });
    expect(strukturEinladung({ ...basis, satzRoh: 10 })).toEqual({ satz: 10, teamleaderId: "A" });
  });
  it("lehnt einen höheren Satz, fehlenden Satz, eigene Lücke und fremde Rollen ab", () => {
    expect(strukturEinladung({ ...basis, satzRoh: 10.5 })).toHaveProperty("fehler");
    expect(strukturEinladung({ ...basis, satzRoh: "" })).toHaveProperty("fehler");
    expect(strukturEinladung({ ...basis, obergrenze: null, satzRoh: 5 })).toHaveProperty("fehler");
    expect(strukturEinladung({ ...basis, rollen: ["vertriebspartner", "backoffice"], satzRoh: 5 })).toHaveProperty("fehler");
  });

  const fn = readFileSync("supabase/functions/invite-user/index.ts", "utf8");
  it("die Function nutzt die Prüfung und holt kein vorhandenes Konto in die Struktur", () => {
    expect(fn).toContain('if (callerIsVpOnly) return target === "kunde" || target === "tippgeber" || target === "vertriebspartner";');
    expect(fn).toContain("strukturEinladung({");
    expect(fn).toContain("if (vpStrukturEinladung && existingUser)");
    // Satz und Teamleiter kommen aus der Prüfung, nicht aus dem Browser.
    expect(fn).toContain("teamleaderId = ergebnis.teamleaderId;");
  });
});

describe("Migration partnerstruktur", () => {
  const SQL = readFileSync("supabase/migrations/20261016100000_partnerstruktur.sql", "utf8");
  it("schützt Teamleiter und Werber und erlaubt Sätze nur bis zur eigenen Grenze in der Struktur", () => {
    expect(SQL).toContain("'teamleader_id', 'geworben_von_user_id'");
    expect(SQL).toContain("(_neu ->> _k)::numeric <= _grenze");
    expect(SQL).toContain("ergaebe einen Kreis");
  });
  it("schreibt die Kette mit dem Satz fest und schützt den Schlüssel", () => {
    expect(SQL).toContain("'lockedProvisionKette', public.provisionskette_ermitteln(NEW.kunde_id, _ergebnis.partner_id)");
    expect(SQL).toMatch(/'lockedProvisionRateFehler',\s*'lockedProvisionKette'\s*\];/);
  });
  it("ändert keine Bestandsdaten und gibt nur die eigene Struktur frei", () => {
    expect(SQL).not.toMatch(/UPDATE public\.investments/);
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.struktur_unter(uuid) FROM PUBLIC, anon, authenticated;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.meine_struktur() TO authenticated, service_role;");
    expect(SQL).toContain('CREATE POLICY "Struktur liest user_settings"');
  });
  it("struktur_satz_setzen prüft Struktur und Grenze", () => {
    const f = SQL.slice(SQL.indexOf("FUNCTION public.struktur_satz_setzen"), SQL.indexOf("COMMENT ON FUNCTION public.struktur_satz_setzen"));
    expect(f).toContain("Dieser Partner gehoert nicht zu deiner Struktur.");
    expect(f).toContain("IF _satz > _grenze THEN");
  });
});

describe("Oberfläche", () => {
  it("Vertriebspartner und Vertriebsleitung sehen unter /nutzerverwaltung die Struktur, nicht die Verwaltung", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('if (user.role === "vertriebspartner" || user.role === "vertriebsleiter") return <StrukturVerwaltung />;');
    expect(app).toContain("return <IpAllowlistGuard><Nutzerverwaltung /></IpAllowlistGuard>;");
  });
  it("die Monatsabrechnung rechnet die Differenz aus der Kette, nicht mehr aus Lizenzpaketen", () => {
    const quelle = readFileSync("src/pages/Provisionsabrechnung.tsx", "utf8");
    expect(quelle).toContain("differenzenAusKette(satz, kette)");
    expect(quelle).not.toContain("calculateJuniorOverride");
    // Dem Partner wird nichts abgezogen.
    expect(quelle).toContain("const overheadsAbgezogen: AbrechnungOverhead[] = [];");
  });
});
