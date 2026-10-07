/**
 * M14 vom 04.10.2026: Handbuch-Mail an bekannte Kontakte in der Profilsprache,
 * Links mit `?lang=`. Dazu der Papierkorb-Befund in handbuch-einladung.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handbuchLink, spracheFuerHandbuch } from "../../../supabase/functions/_shared/handbuch-anlage.ts";

const lies = (...teile: string[]) => readFileSync(join(process.cwd(), "supabase", "functions", ...teile), "utf8");

const KONTAKT = "11111111-2222-3333-4444-555555555555";

/** Ein Client, der für jeden Kontakt die angegebene Profilsprache liefert. */
function clientMitProfil(sprache: string) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { meta: { kundenSprache: sprache } }, error: null }),
        }),
      }),
    }),
  };
}

describe("spracheFuerHandbuch", () => {
  it("nimmt bei einem bekannten Kontakt die Profilsprache, nicht die der Seite", async () => {
    const sprache = await spracheFuerHandbuch(clientMitProfil("en"), {
      kontaktId: KONTAKT,
      sprache: "de",
      dublette: { erkanntUeber: "email", gespeicherteEmail: "a@b.de" },
    });
    expect(sprache).toBe("en");
    expect(handbuchLink("t", sprache)).toContain("?lang=en");
  });

  it("nimmt bei einem neuen Kontakt die Sprache der Seite", async () => {
    expect(await spracheFuerHandbuch(clientMitProfil("en"), { kontaktId: KONTAKT, sprache: "de" })).toBe("de");
    expect(await spracheFuerHandbuch(clientMitProfil("en"), { kontaktId: KONTAKT })).toBeNull();
  });
});

describe("Aufrufer", () => {
  it("handbuch-einladung nimmt die Profilsprache und prüft die Spalte geloescht", () => {
    const text = lies("handbuch-einladung", "index.ts");
    expect(text).toContain("const sprache = spracheAusMeta(meta);");
    expect(text).not.toContain("body.sprache");
    expect(text).toContain("kontakt.geloescht === true");
    expect(text).not.toContain("meta.geloescht ===");
  });

  it("send-lead-zuweisung-mail hängt lang=en an die Links eines englischen Profils", () => {
    const text = lies("send-lead-zuweisung-mail", "index.ts");
    expect(text).toContain('spracheAusMeta(meta) === "en" ? `${KAMPAGNE}&lang=en` : KAMPAGNE');
    expect(text).toContain("einladungsLink(PORTAL, einladung.token, kampagne)");
    expect(text).toContain("handbuchLink: `${basis}?${kampagne}`");
  });

  it("handbuch-anlage verwendet die ermittelte Sprache für Mail und Links", () => {
    const text = lies("_shared", "handbuch-anlage.ts");
    expect(text).toContain("const sprache = await spracheFuerHandbuch(supabase, e);");
    expect(text).toContain("handbuchLink: handbuchLink(e.token, sprache)");
    expect(text).not.toMatch(/handbuchLink\(e\.token, e\.sprache\)/);
  });
});
