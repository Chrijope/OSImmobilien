import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// Der Link liegt bei der Edge Function, getestet wird er hier, weil Vitest
// nur unterhalb von src sucht (wie bei finanzierung-starten-mail).
import {
  bonitaetPfadFuerInvestment,
  bonitaetUrlFuerInvestment,
} from "../../supabase/functions/_shared/unterlagen-erinnerung-link.ts";

const lies = (pfad: string) => readFileSync(resolve(__dirname, "..", "..", pfad), "utf8");

describe("Erinnerung „Deine Unterlagen fehlen noch“", () => {
  it("führt zur Bonität genau dieses Investments, mit Hervorhebung", () => {
    const url = new URL(bonitaetUrlFuerInvestment("inv-123"));
    expect(url.origin).toBe("https://osimmobilien.netlify.app");
    expect(url.pathname).toBe("/kunde/investments");
    expect(url.searchParams.get("tab")).toBe("moreimmo");
    expect(url.searchParams.get("inv")).toBe("inv-123");
    // Gleicher Abschnitt wie der Knopf „Jetzt fortfahren“ (section-bonitaetsunterlagen).
    expect(url.searchParams.get("highlight")).toBe("bonitaetsunterlagen");
  });

  it("verschiedene Investments bekommen verschiedene Links", () => {
    expect(bonitaetPfadFuerInvestment("inv-a")).not.toBe(bonitaetPfadFuerInvestment("inv-b"));
    expect(bonitaetPfadFuerInvestment("inv-a")).toBe(
      "/kunde/investments?tab=moreimmo&inv=inv-a&highlight=bonitaetsunterlagen",
    );
  });

  it("die Function verlinkt nicht mehr auf /kunde/profil, sondern auf das Investment", () => {
    const code = lies("supabase/functions/check-document-reminders/index.ts");
    // Kein Link und keine Adresse mehr auf die Profilseite (Kommentare zählen nicht).
    expect(code).not.toMatch(/(link:|portalUrl =)[^\n]*kunde\/profil/);
    expect(code).not.toMatch(/osimmobilien\.netlify\.app\/kunde\/profil/);
    expect(code).toMatch(/const portalUrl = bonitaetUrlFuerInvestment\(inv\.id\)/);
    expect(code).toMatch(/link: bonitaetPfadFuerInvestment\(inv\.id\)/);
  });

  it("das Portal springt zu genau diesem Abschnitt", () => {
    const code = lies("src/pages/KundeInvestments.tsx");
    expect(code).toMatch(/hervorhebenSobaldDa\(`section-\$\{highlight\}`\)/);
    expect(code).toMatch(/bonitaetsunterlagen: \{ key: "bonitaetsunterlagen"/);
  });
});
