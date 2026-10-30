import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { investmentFuerFinanzierer } from "./finanzierungEinreichung";

describe("Rücksprung aus dem Finanzierungschat", () => {
  const liste = [
    { investment_id: "inv-alt", finanzierer_id: "f1", status: "abgelehnt" as const },
    { investment_id: "inv-lauf", finanzierer_id: "f1", status: "in_pruefung" as const },
    { investment_id: "inv-zu", finanzierer_id: "f2", status: "zuschlag" as const },
  ];
  it("nimmt den Kauf mit Zuschlag, sonst den laufenden, sonst irgendeinen", () => {
    expect(investmentFuerFinanzierer(liste, "f2")).toBe("inv-zu");
    expect(investmentFuerFinanzierer(liste, "f1")).toBe("inv-lauf");
    expect(investmentFuerFinanzierer([liste[0]], "f1")).toBe("inv-alt");
    expect(investmentFuerFinanzierer(liste, "f3")).toBeUndefined();
  });
});

describe("Migration mehrere Zuschläge", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261030120000_finanzierung_mehrere_zuschlaege.sql"), "utf8");
  it("weiterer Zuschlag sagt niemandem ab, der erste wie bisher", () => {
    expect(sql).not.toContain("schon einen Zuschlag");
    expect(sql).toMatch(/IF v_erster THEN\s+UPDATE public\.finanzierung_einreichungen SET status = 'abgesagt'/);
  });
  it("Chat holt Finanzierer und Leitung bei jedem Öffnen dazu", () => {
    expect(sql).not.toContain("v_neu");
    expect(sql).toContain("ur.role::text IN ('admin', 'inhaber', 'vertriebsleiter', 'backoffice')");
    expect(sql).toContain("coalesce(p.gesperrt, false) = false");
  });
});
