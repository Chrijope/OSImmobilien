import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Der Wächter über die Sie-Anrede der Beratungspräsentation.
 *
 * Seit dem 21.10.2026 siezt die Präsentation die Kunden, im CRM, auf der
 * Artefakt-Seite und in der PDF (Entscheidung Christian). Vorher galt die
 * Du-Hausregel. Ein zurückgerutschtes „dein“ fällt keinem Test auf, aber
 * jedem Kunden. Geprüft werden die Texte als Werte und der sichtbare Text
 * der Folien. Die Sprechskripte des Trainer-Modus sind intern und bleiben
 * in Du-Form (duAnrede.test.ts).
 */
const DU_WOERTER = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|Du|Dich|Dir|Dein|Deine|Deinen|Deinem|Deiner|Deines)\b/g;

function duTreffer(text: string): string[] {
  return text.match(DU_WOERTER) ?? [];
}

/** Alle Texte eines Objekts, mit Pfad. */
function texte(wert: unknown, pfad: string, aus: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof wert === "string") aus.push([pfad, wert]);
  else if (Array.isArray(wert)) wert.forEach((w, i) => texte(w, `${pfad}[${i}]`, aus));
  else if (wert && typeof wert === "object") for (const [k, w] of Object.entries(wert)) texte(w, `${pfad}.${k}`, aus);
  return aus;
}

describe("Die Beratungspräsentation siezt durchgehend", () => {
  it("enthält in ihren Texten keine Du-Anrede", async () => {
    const a = await import("@/lib/beratungOsDaten");
    const b = await import("@/lib/beratungOsDatenB");
    const k = await import("@/lib/beratungKonzeptDaten");
    const alle = [
      ...texte(a.OS_TEXTE, "OS_TEXTE"),
      ...texte(k.KONZEPT_STEUER, "KONZEPT_STEUER"),
      ...texte(k.KONZEPT_ALTER, "KONZEPT_ALTER"),
      ...texte(b.OS_TEXTE_B, "OS_TEXTE_B"),
      ...texte(b.KAUFKRAFT_B, "KAUFKRAFT_B"),
      ...texte(b.DOKUMENTE_B, "DOKUMENTE_B"),
    ];
    expect(alle.length).toBeGreaterThan(100);
    for (const [pfad, text] of alle) expect(duTreffer(text), `${pfad}: „${text}“`).toEqual([]);
    expect(a.lueckenSatz(3000, 800)).toContain("Ihres Wunschnettos");
  });

  it("liest die gemeinsamen Texte in der Sie-Fassung", async () => {
    const { BERATUNG_TEXTE_SIE } = await import("@/lib/beratungSieTexte");
    const quelle = readFileSync(join(__dirname, "..", "pages", "BeratungspraesentationHV.tsx"), "utf8");
    expect(quelle).toContain("const tx = BERATUNG_TEXTE_SIE;");
    const genutzt = [...new Set([...quelle.matchAll(/\btx\.(arbeitsweise|rueckblick|ueberUns)\.(\w+)/g)].map((m) => `${m[1]}.${m[2]}`))];
    expect(genutzt.length).toBeGreaterThan(10);
    for (const schluessel of genutzt) {
      const [gruppe, feld] = schluessel.split(".");
      const wert = (BERATUNG_TEXTE_SIE as unknown as Record<string, Record<string, unknown>>)[gruppe][feld];
      if (typeof wert === "string") expect(duTreffer(wert), `tx.${schluessel}: „${wert}“`).toEqual([]);
    }
  });

  it.each([
    "pages/BeratungspraesentationHV.tsx",
    "components/beratung/KonzeptFolien.tsx",
    "components/beratung/folienBausteine.tsx",
    "artefakt/SelbstauskunftArtefakt.tsx",
    "lib/beratungAntwortenPdf.ts",
  ])("hat im sichtbaren Text von %s keine Du-Anrede", (datei) => {
    const quelle = readFileSync(join(__dirname, "..", datei), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      // Test-Kennungen wie data-testid="frage-an-dich" sind nicht sichtbar.
      .replace(/data-testid="[^"]*"/g, "")
      // Der Trainer-Hinweis spricht den Berater an, nicht den Kunden.
      .replace(/Sprechskript · nur für dich sichtbar/g, "")
      // Alte Rolle aus gespeicherten Profilen, nur zum Vergleich.
      .replace(/"Dein Ansprechpartner"/g, "");
    expect(duTreffer(quelle), datei).toEqual([]);
  });
});
