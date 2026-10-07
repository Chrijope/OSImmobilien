import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";

// Ohne Datenbank gilt die Rueckfallliste der Rollenfreigaben, dieselbe Lage
// wie beim ersten Laden der App. Wie in `sidebarPermissions.test.ts`.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { trefferWert, zielWert, seitenWert, normalisiere, seitenFuerSuche, SUCHE_AKTIONEN } = await import("./sucheZiele");
const { navigationsGruppen, darfNavEintrag, entwurfGesperrt } = await import("./sidebarNavigation");
const { isUrlAllowedForRole } = await import("./sidebarPermissions");

type Kontext = Parameters<typeof seitenFuerSuche>[0];
const kontext = (rolle: string, mehr: Partial<Kontext> = {}): Kontext => ({ rolle, handbuchFrei: true, ...mehr });

/** Die besten Treffer für eine Eingabe, so wie die Suche sie sortiert. */
function suche(rolle: string, eingabe: string) {
  return seitenFuerSuche(kontext(rolle))
    .map((z) => ({ z, wert: seitenWert(eingabe, z.titel, z.begriffe) }))
    .filter((x) => x.wert > 0)
    .sort((a, b) => b.wert - a.wert)
    .map((x) => x.z);
}

const ROLLEN = ["vertriebspartner", "tippgeber", "kunde", "setterin", "backoffice", "admin"];

describe("Unscharfe Suche", () => {
  it("findet den Volltreffer und wertet ihn am hoechsten", () => {
    expect(trefferWert("otto hans", "Otto Hans")).toBeGreaterThan(trefferWert("otto", "Otto Hans"));
  });

  it("findet den Wortanfang", () => {
    expect(trefferWert("ott", "Otto Hans")).toBeGreaterThan(0);
  });

  it("findet auch mitten im Text, aber schwaecher als am Anfang", () => {
    const anfang = trefferWert("otto", "Otto Hans");
    const mitte = trefferWert("hans", "Otto Hans");
    expect(mitte).toBeGreaterThan(0);
    expect(anfang).toBeGreaterThan(mitte);
  });

  it("erlaubt ausgelassene Buchstaben", () => {
    expect(trefferWert("ott hns", "Otto Hans")).toBeGreaterThan(0);
  });

  it("findet nichts, wenn ein Buchstabe fehlt", () => {
    expect(trefferWert("xyz", "Otto Hans")).toBe(0);
  });

  it("ignoriert Gross- und Kleinschreibung", () => {
    expect(trefferWert("OTTO", "otto hans")).toBeGreaterThan(0);
  });

  it("gibt bei leerer Suche nichts zurueck", () => {
    expect(trefferWert("", "Otto Hans")).toBe(0);
  });

  it("bevorzugt bei Gleichstand den Titel vor einem Suchbegriff", () => {
    expect(zielWert("pipeline", "Pipeline", [])).toBeGreaterThan(zielWert("pipeline", "Irgendwas", ["pipeline"]));
  });
});

describe("Seiten finden", () => {
  it("findet die Handbuch-Seite und das Vertriebshandbuch ueber „Handbuch“", () => {
    const urls = suche("admin", "Handbuch").map((z) => z.url);
    expect(urls).toContain("/handbuch-seite");
    expect(urls).toContain("/vertriebshandbuch");
  });

  it("findet die Statistiken ueber „Statistik“ und stellt sie vor ihre Reiter", () => {
    const treffer = suche("vertriebspartner", "Statistik");
    expect(treffer[0].url).toBe("/statistiken");
    expect(treffer[0].titel).toBe("Statistiken");
    // Die Reiter kommen als eigene Treffer mit Pfad.
    expect(treffer.some((z) => z.url === "/statistiken?tab=sales" && z.titel === "Statistiken > Umsatz & Provisionen")).toBe(true);
  });

  it("findet die Synonyme aus dem Auftrag", () => {
    const erwartet: [string, string][] = [
      ["provision", "/abrechnungen"],
      ["kalender", "/kalender"],
      ["termine", "/kalender"],
      ["lotse", "/objekte-neu"],
      ["investmentrechner", "/investmentrechner"],
      ["kalkulator", "/investmentrechner"],
      ["selbstauskunft", "/alle-kontakte"],
      ["support", "/support-kontaktieren"],
      ["hilfe", "/support-kontaktieren"],
      ["passwort", "/einstellungen"],
      ["sicherheit", "/einstellungen?tab=sicherheit"],
      ["zu teuer", "/vertriebsakademie/einwaende"],
    ];
    for (const [eingabe, url] of erwartet) {
      expect(suche("admin", eingabe).map((z) => z.url), eingabe).toContain(url);
    }
  });

  it("findet Einstellungen-Bereiche mit Pfad", () => {
    const ziel = seitenFuerSuche(kontext("vertriebspartner")).find((z) => z.url === "/einstellungen?tab=sicherheit");
    expect(ziel?.titel).toBe("Einstellungen > Sicherheit");
  });
});

describe("Umlaute, Schreibweise, Tippfehler", () => {
  it("gleicht Umlaute und ihre Umschrift an", () => {
    expect(normalisiere("Übersicht")).toBe(normalisiere("uebersicht"));
    expect(normalisiere("Übersicht")).toBe(normalisiere("ubersicht"));
    expect(normalisiere("Straße")).toBe(normalisiere("strasse"));
  });

  it("„statistik“ findet „Statistiken“, auch gross geschrieben", () => {
    expect(suche("vertriebspartner", "statistik")[0].url).toBe("/statistiken");
    expect(suche("vertriebspartner", "STATISTIK")[0].url).toBe("/statistiken");
  });

  it("„ubersicht“ findet die Übersicht", () => {
    const urls = suche("vertriebspartner", "ubersicht").map((z) => z.url);
    expect(urls).toContain("/statistiken?tab=overview");
    const tippgeber = suche("tippgeber", "ubersicht").map((z) => z.url);
    expect(tippgeber[0]).toBe("/tippgeber-portal?tab=uebersicht");
  });

  it("findet Teilwoerter", () => {
    expect(suche("vertriebspartner", "abrech").map((z) => z.url)).toContain("/abrechnungen");
    expect(suche("vertriebspartner", "lexik").map((z) => z.url)).toContain("/immobilien-lexikon");
  });

  it("verzeiht einen kleinen Tippfehler", () => {
    expect(suche("vertriebspartner", "statsitik").map((z) => z.url)).toContain("/statistiken");
    expect(suche("vertriebspartner", "pipline").map((z) => z.url)).toContain("/pipeline");
  });

  it("findet bei Unsinn nichts", () => {
    expect(suche("admin", "qqqqxx")).toEqual([]);
  });
});

describe("Rollenfilter deckt sich mit Seitenleiste und Routenschutz", () => {
  /** Was die Seitenleiste zeigt und anklickbar ist, als Adressen. */
  function seitenleiste(ctx: Kontext): string[] {
    const urls: string[] = [];
    const sichtbar = (item: { url: string; draft?: boolean; adminOnly?: boolean; auchFuer?: string[] }) =>
      darfNavEintrag(item, ctx) && !entwurfGesperrt(item, String(ctx.rolle));
    for (const gruppe of navigationsGruppen(ctx)) {
      for (const item of gruppe.items) {
        if (!sichtbar(item)) continue;
        if (item.children?.length) urls.push(...item.children.filter(sichtbar).map((k) => k.url));
        else urls.push(item.url);
      }
    }
    return [...new Set(urls)];
  }

  /** Reiter und Einstellungen stehen nicht in der Leiste, sondern auf der Seite. */
  const istZusatz = (url: string) => url.startsWith("/statistiken?tab=") || url.startsWith("/einstellungen");

  for (const rolle of ROLLEN) {
    it(`zeigt fuer ${rolle} genau die Seiten der Seitenleiste`, () => {
      const ctx = kontext(rolle);
      const suchSeiten = seitenFuerSuche(ctx).map((z) => z.url);
      const leiste = seitenleiste(ctx);
      expect(suchSeiten.filter((u) => !istZusatz(u)).sort()).toEqual(leiste.filter((u) => !istZusatz(u)).sort());
    });

    it(`laesst fuer ${rolle} nur Seiten durch, die der Routenschutz oeffnet`, () => {
      for (const url of seitenFuerSuche(kontext(rolle)).map((z) => z.url)) {
        // Der Routenschutz laesst /einstellungen fuer alle ausser Kunden durch.
        if (url.startsWith("/einstellungen")) continue;
        expect(isUrlAllowedForRole(url, rolle as never), `${rolle}: ${url}`).toBe(true);
      }
    });
  }

  it("zeigt dem Tippgeber nur sein Portal und die Einstellungen", () => {
    const urls = seitenFuerSuche(kontext("tippgeber")).map((z) => z.url);
    expect(urls.every((u) => u.startsWith("/tippgeber-portal") || u.startsWith("/einstellungen"))).toBe(true);
    expect(urls).toContain("/tippgeber-portal?tab=konditionen");
  });

  it("zeigt dem Kunden nur das Kundenportal, ohne CRM-Einstellungen", () => {
    const urls = seitenFuerSuche(kontext("kunde")).map((z) => z.url);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith("/kunde/"))).toBe(true);
  });

  it("verbirgt Admin-Seiten vor Vertriebspartner, Setterin und Backoffice", () => {
    for (const rolle of ["vertriebspartner", "setterin", "backoffice"]) {
      const urls = seitenFuerSuche(kontext(rolle)).map((z) => z.url);
      expect(urls, rolle).not.toContain("/audit-log");
      expect(urls, rolle).not.toContain("/nutzerverwaltung");
      // Die eigene Objektverwaltung traegt den Admin-Riegel.
      expect(urls, rolle).not.toContain("/objekte");
    }
    expect(seitenFuerSuche(kontext("admin")).map((z) => z.url)).toEqual(
      expect.arrayContaining(["/audit-log", "/nutzerverwaltung", "/objekte", "/handbuch-seite"]),
    );
  });

  it("zeigt der Setterin ihre Leads, aber keine Abrechnungen", () => {
    const urls = seitenFuerSuche(kontext("setterin")).map((z) => z.url);
    expect(urls).toContain("/meine-leads");
    expect(urls).not.toContain("/abrechnungen");
    // Nur die Statistik-Reiter ihrer Rolle.
    expect(urls).toContain("/statistiken?tab=overview");
    expect(urls).not.toContain("/statistiken?tab=sales");
  });

  it("laesst gesperrte Entwuerfe weg, Admin sieht sie", () => {
    expect(seitenFuerSuche(kontext("vertriebspartner")).map((z) => z.url)).not.toContain("/kalender");
    expect(seitenFuerSuche(kontext("admin")).map((z) => z.url)).toContain("/kalender");
    expect(seitenFuerSuche(kontext("vertriebspartner")).map((z) => z.url)).not.toContain("/einstellungen?tab=kalender");
  });

  it("zeigt den Videocall weder ohne Freigabe noch einer fremden Person", () => {
    expect(seitenFuerSuche(kontext("admin")).map((z) => z.url)).not.toContain("/videocall/buchungen");
    // Die Gruppe allein genuegt nicht: Der Routenschutz prueft zusaetzlich
    // die Person, genau wie in der Seitenleiste.
    const fremd = kontext("admin", { videocallFreigabe: true, identitaet: { email: "test@example.org", userId: "u-test" } });
    expect(seitenFuerSuche(fremd).map((z) => z.url)).not.toContain("/videocall/buchungen");
  });

  it("zeigt die Handbuch-Seite dem Vertriebspartner nur nach der Freischaltung", () => {
    expect(seitenFuerSuche(kontext("vertriebspartner", { handbuchFrei: false })).map((z) => z.url)).not.toContain("/handbuch-seite");
    expect(seitenFuerSuche(kontext("vertriebspartner", { handbuchFrei: true })).map((z) => z.url)).toContain("/handbuch-seite");
  });
});

describe("Eine Quelle", () => {
  it("die Seitenleiste liest ihre Eintraege und Pruefungen aus sidebarNavigation", () => {
    const sidebar = readFileSync(resolve(__dirname, "../components/AppSidebar.tsx"), "utf8");
    expect(sidebar).toContain("navigationsGruppen(");
    expect(sidebar).toContain("darfNavEintrag(");
    expect(sidebar).toContain("entwurfGesperrt(");
    // Keine eigene Liste mehr in der Leiste.
    expect(sidebar).not.toMatch(/const \w+Items(Def)? = \[/);
  });

  it("es gibt keine handgepflegte Seitenliste mehr neben der Leiste", async () => {
    const modul = await import("./sucheZiele");
    expect("SUCHE_SEITEN" in modul).toBe(false);
  });
});

describe("Datenpflege", () => {
  const alleBegriffe = () => {
    const ziele = seitenFuerSuche(kontext("admin", { videocallFreigabe: true }));
    return [...ziele.map((z) => ({ titel: z.titel, begriffe: z.begriffe })), ...SUCHE_AKTIONEN];
  };

  it("hat keine doppelten Ziele", () => {
    const urls = seitenFuerSuche(kontext("admin", { videocallFreigabe: true })).map((z) => z.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("schreibt alle Suchbegriffe klein, sonst findet sie niemand", () => {
    for (const z of alleBegriffe()) {
      for (const b of z.begriffe) {
        expect(b, `${z.titel}: "${b}"`).toBe(b.toLowerCase());
      }
    }
  });

  it("beginnt jede Ziel-Adresse mit einem Schrägstrich", () => {
    for (const z of [...seitenFuerSuche(kontext("admin")), ...SUCHE_AKTIONEN]) {
      expect(z.url.startsWith("/"), `${z.titel}: ${z.url}`).toBe(true);
    }
  });
});
