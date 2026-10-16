import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  provisionssatzAblehnung,
  provisionssatzAusEinladung,
} from "../../supabase/functions/_shared/einladung-konditionen";
import { parseProvisionssatz } from "./provisionssatz";

/*
 * Seit 15.10.2026: Vertriebspartner nur mit Lead- und Eigen-Satz anlegen,
 * Browser und invite-user mit derselben Regel.
 */

describe("Provisionssatz aus einer Eingabe", () => {
  const faelle: Array<[unknown, number | null]> = [
    ["10,5", 10.5], ["10.5", 10.5], [10.5, 10.5], ["100", 100], [" 4 ", 4],
    ["0", null], [0, null], ["100,01", null], ["-3", null], ["abc", null], ["1e2", null], ["", null], [null, null],
  ];
  for (const [eingabe, erwartet] of faelle) {
    it(`${JSON.stringify(eingabe)} ergibt ${erwartet}`, () => {
      expect(provisionssatzAusEinladung(eingabe)).toBe(erwartet);
      if (typeof eingabe === "string" || typeof eingabe === "number" || eingabe === null) {
        expect(parseProvisionssatz(eingabe as string | number | null)).toBe(erwartet);
      }
    });
  }
});

describe("invite-user: Pflicht bei Vertriebspartnern", () => {
  it("lehnt einen Vertriebspartner ohne Satz ab, auch als eine von mehreren Rollen", () => {
    expect(provisionssatzAblehnung({ rollen: ["vertriebspartner"], lead: null, eigen: 10 })).toContain("zwischen 0 und 100 Prozent");
    expect(provisionssatzAblehnung({ rollen: ["backoffice", "vertriebspartner"], lead: 10, eigen: null })).not.toBeNull();
  });

  it("lässt andere Rollen, erneutes Senden und vollständige Sätze durch", () => {
    expect(provisionssatzAblehnung({ rollen: ["tippgeber"], lead: null, eigen: null })).toBeNull();
    expect(provisionssatzAblehnung({ rollen: ["vertriebspartner"], resend: true, lead: null, eigen: null })).toBeNull();
    expect(provisionssatzAblehnung({ rollen: ["vertriebspartner"], lead: 10, eigen: 10.5 })).toBeNull();
  });

  const fn = readFileSync("supabase/functions/invite-user/index.ts", "utf8");

  it("antwortet mit 400, nach der Rechteprüfung und vor der Kontoanlage", () => {
    const pruefung = fn.indexOf("provisionssatzAblehnung({");
    expect(pruefung).toBeGreaterThan(fn.indexOf("if (forbidden.length > 0)"));
    expect(pruefung).toBeLessThan(fn.indexOf("// Pre-fill user_settings"));
    expect(fn.slice(pruefung, pruefung + 400)).toContain("status: 400");
  });

  it("schreibt keine Karrierestufe, keinen allgemeinen Satz und keine Sidebar-Sperre mehr", () => {
    expect(fn).not.toContain("karriere_override");
    expect(fn).not.toContain("karriere_gating_active");
    expect(fn).not.toContain("newEinstellungen.custom_provision_rate =");
    expect(fn).toContain("newEinstellungen.custom_provision_rate_setter = leadSatz");
    expect(fn).toContain("newEinstellungen.custom_provision_rate_eigen = eigenSatz");
  });
});

describe("Oberfläche: keine Karrierestufe beim Anlegen", () => {
  it("Nutzerverwaltung sperrt Einladen ohne gültige Sätze und vergibt keine Stufe", () => {
    const quelle = readFileSync("src/pages/Nutzerverwaltung.tsx", "utf8");
    expect(quelle).toContain('(formRollen.includes("vertriebspartner") && !provisionssaetzeGueltig) || inviting');
    const einladung = quelle.slice(quelle.indexOf('functions.invoke("invite-user"'), quelle.indexOf("if (error) throw error;", quelle.indexOf('functions.invoke("invite-user"')));
    expect(einladung).toContain("customProvisionRateSetter: brauchtSatz ? leadSatz : undefined");
    expect(einladung).not.toMatch(/karriereStufe|karriereGatingActive|customProvisionRate:/);
    expect(quelle).not.toMatch(/karriereGatingActive|Karrierestufe \*/);
  });

  it("Aktivierung aus dem Bewerberweg vergibt keine Karrierestufe", () => {
    const quelle = readFileSync("src/components/bewerbung/AktivierungTab.tsx", "utf8");
    expect(quelle).not.toMatch(/karriere_override|karriereStufe:|KARRIERE_STUFEN/);
    expect(quelle).toContain("customProvisionRateSetter: brauchtSatz ? leadSatz : undefined");
  });

  it("die Sidebar-Sperre nach Karrierestufe ist weg", () => {
    for (const datei of ["src/components/AppSidebar.tsx", "src/components/DashboardLayout.tsx", "src/components/GlobaleSuche.tsx", "src/components/HeaderBar.tsx", "src/pages/TeampartnerProfil.tsx"]) {
      expect(readFileSync(datei, "utf8"), datei).not.toContain("karriere_gating_active");
    }
    expect(readFileSync("src/lib/sidebarPermissions.ts", "utf8")).not.toContain("isUrlAllowedForVPStufe");
  });
});
