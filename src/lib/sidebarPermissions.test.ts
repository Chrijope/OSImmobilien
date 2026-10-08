import { describe, it, expect, vi } from "vitest";

// Der Supabase-Client wird beim Import angezogen und würde im Test einen
// Realtime-Kanal öffnen. Für die reine Regellogik reicht eine Attrappe.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { isUrlAllowedForRole, istRouteGesperrt, darfEinheitInvestmentrechner } = await import("@/lib/sidebarPermissions");

describe("Reiter Investmentrechner auf der Einheitenseite", () => {
  it("verlangt beides: Zugang zum Objektbereich und Freigabe für den Rechner", () => {
    expect(darfEinheitInvestmentrechner("admin")).toBe(true);
    expect(darfEinheitInvestmentrechner("inhaber")).toBe(true);
    // Seit dem 05.10.2026 wie der Admin; den Vertriebspartner lässt die
    // Einheitenseite nur mit Testfreischaltung herein.
    expect(darfEinheitInvestmentrechner("vertriebspartner")).toBe(true);
    expect(darfEinheitInvestmentrechner("vertriebsleiter")).toBe(true);
    // Freigabe für den Rechner allein genügt nicht, die Einheitenseite
    // bleibt für diese Rollen zu.
    expect(darfEinheitInvestmentrechner("objektpartner")).toBe(false);
    expect(darfEinheitInvestmentrechner("finanzierungspartner")).toBe(false);
    expect(darfEinheitInvestmentrechner("backoffice")).toBe(false);
    expect(darfEinheitInvestmentrechner("hausverwaltung")).toBe(false);
    expect(darfEinheitInvestmentrechner(undefined)).toBe(false);
  });
});

describe("Bonitätsrechner", () => {
  it("ist für jede Rolle ausgeblendet, auch für Admin und Inhaber", () => {
    const rollen = ["admin", "inhaber", "vertriebspartner", "vertriebsleiter", "backoffice", "hausverwaltung"] as const;
    for (const rolle of rollen) {
      expect(isUrlAllowedForRole("/bonitaetsrechner", rolle), rolle).toBe(false);
      expect(istRouteGesperrt("/bonitaetsrechner", rolle), rolle).toBe(true);
    }
  });

  it("lässt sich auch durch eine individuelle Berechtigung nicht aufheben", () => {
    expect(isUrlAllowedForRole("/bonitaetsrechner", "vertriebspartner", ["/bonitaetsrechner"])).toBe(false);
  });

  it("sperrt auch Unterseiten", () => {
    expect(isUrlAllowedForRole("/bonitaetsrechner/detail", "admin")).toBe(false);
  });

  it("lässt andere Rechner unangetastet", () => {
    expect(isUrlAllowedForRole("/afa-rechner", "vertriebspartner")).toBe(true);
  });
});

describe("Steuerrechner, Stand 24.09.2026", () => {
  /*
   * Christian hat entschieden: Der Steuerrechner unter "Tools" steht jedem
   * Vertriebspartner offen, auf jeder Karrierestufe. Geprueft wird
   * `isUrlAllowedForRole`, denn genau diese Funktion entscheidet sowohl ueber
   * den Eintrag in der Seitenleiste (`AppSidebar`) als auch ueber den
   * Routenwaechter (`DashboardLayout`). Sieht der Partner den Eintrag, kommt
   * er also auch auf die Seite.
   *
   * Der Test laeuft gegen den Rueckfall im Code, die Datenbank ist hier
   * abgeklemmt. Ob die Tabelle `role_permissions` die Zeile ebenfalls traegt,
   * pruefen die Tests nicht, siehe den Bericht zur Freigabe.
   */
  const STUFEN = [null, "tippgeber", "vertriebspartner", "manager", "vertriebsfirma"];

  it("Vertriebspartner sieht den Steuerrechner", () => {
    expect(isUrlAllowedForRole("/steuerrechner", "vertriebspartner")).toBe(true);
  });

  it("gilt fuer jede Karrierestufe, auch bei eingeschaltetem Stufen-Gating", () => {
    for (const stufe of STUFEN) {
      expect(isUrlAllowedForRole("/steuerrechner", "vertriebspartner", [], stufe), String(stufe)).toBe(true);
    }
  });

  it("oeffnet dabei nicht das Analysetool mit, das bleibt ab Lizenzpartner", () => {
    expect(isUrlAllowedForRole("/analysetool", "vertriebspartner", [], "vertriebspartner")).toBe(false);
    expect(isUrlAllowedForRole("/analysetool", "vertriebspartner", [], "vertriebsfirma")).toBe(true);
  });

  it("bleibt fuer Rollen ohne Freigabe zu", () => {
    expect(isUrlAllowedForRole("/steuerrechner", "tippgeber")).toBe(false);
    expect(isUrlAllowedForRole("/steuerrechner", "kunde")).toBe(false);
    expect(isUrlAllowedForRole("/steuerrechner", "hr")).toBe(false);
  });
});

describe("Beratungspräsentation", () => {
  const praesentationen = [
    "/beratungspraesentation-moreimmo",
    "/beratungspraesentation",
    "/beratungspraesentation-wg",
  ];

  it("ist für jede Rolle offen, die die Präsentationsseite sehen darf", () => {
    // Ohne diese Vererbung filterte die Präsentationsseite ihre eigenen
    // Einträge weg und der Abschnitt Präsentation blieb im Vertrieb leer.
    const rollen = ["vertriebsleiter", "backoffice"] as const;
    for (const url of praesentationen) {
      for (const rolle of rollen) {
        expect(isUrlAllowedForRole(url, rolle), `${url} / ${rolle}`).toBe(true);
      }
    }
  });

  it("folgt beim Vertriebspartner der Karrierestufe der Präsentationsseite", () => {
    for (const url of praesentationen) {
      const seite = isUrlAllowedForRole("/praesentation", "vertriebspartner", undefined, "senior");
      expect(isUrlAllowedForRole(url, "vertriebspartner", undefined, "senior"), url).toBe(seite);
    }
  });

  it("bleibt Rollen ohne Präsentationsseite verschlossen", () => {
    for (const url of praesentationen) {
      expect(isUrlAllowedForRole(url, "hausverwaltung"), url).toBe(false);
    }
  });
});

describe("Unterlagen-Unterseiten", () => {
  // Jede Kachel der Unterlagen-Seite mit interner Route muss fuer die
  // Rollen aufrufbar sein, die die Unterlagen-Seite sehen. Sonst zeigt die
  // Seite den Eintrag, der Klick landet aber per Route-Guard auf dem
  // Dashboard (so geschehen bei den Leadarbeit-Seiten).
  it("jede interne Route aus dem Unterlagen-Seed ist fuer Vertrieb und Backoffice erlaubt", async () => {
    const { seedUnterlagen } = await import("@/lib/unterlagenSeed");
    // Werkzeuge mit eigenem, bewusst rollen-beschraenktem Sidebar-Eintrag
    // (z. B. Zielplanung) sind ausgenommen: Fuer sie blendet die
    // Unterlagen-Seite den Oeffnen-Knopf rollenabhaengig aus.
    const eigeneEintraege = new Set([
      "/afa-rechner", "/zielplanung",
      "/academy", "/immobilien-lexikon", "/chat", "/support-kontaktieren",
    ]);
    const routen = seedUnterlagen()
      .flatMap((a) => a.dokumente)
      .map((d) => d.interneRoute)
      .filter((r): r is string => !!r && !eigeneEintraege.has(r));
    expect(routen.length).toBeGreaterThan(0);
    for (const rolle of ["vertriebspartner", "vertriebsleiter", "backoffice"] as const) {
      for (const url of routen) {
        expect(isUrlAllowedForRole(url, rolle), `${rolle}: ${url}`).toBe(true);
      }
    }
  });
});


describe("Veröffentlichte Vertriebsakademie", () => {
  it("ist kein Entwurf mehr", async () => {
    const { isDraftRoute } = await import("@/lib/draftRoutes");
    expect(isDraftRoute("/vertriebsakademie-neu")).toBe(false);
    expect(isDraftRoute("/vertriebsakademie")).toBe(false);
  });
  it("erhält die bestehenden Rollenrechte auch für Vorschau-Links", () => {
    for (const rolle of ["admin", "inhaber", "vertriebspartner", "vertriebsleiter", "buchhaltung", "setterin", "kunde", "objektpartner", "tippgeber"] as const) {
      for (const suffix of ["", "/grundlagen", "/training", "/admin", "/kultur?lektion=kultur-werte"]) {
        expect(isUrlAllowedForRole("/vertriebsakademie-neu" + suffix, rolle)).toBe(isUrlAllowedForRole("/vertriebsakademie" + suffix, rolle));
      }
    }
    expect(isUrlAllowedForRole("/vertriebsakademie", "vertriebspartner")).toBe(true);
  });
});


describe("Seitenleiste der Rolle hr, Stand 11.09.2026", () => {
  const SICHTBAR = [
    "/teampartner",   // war eingetragen, scheiterte am adminOnly-Riegel
    "/chat",          // steht im Abschnitt Support
    "/kultur",        // Wissen: Unsere Kultur
    "/unterlagen",
    "/praesentation",
    "/marketing",
    "/shop",          // noch Entwurf, die Freigabe steht trotzdem schon
    "/wettbewerb",    // Auswertung
  ];

  it("zeigt die freigegebenen Punkte", () => {
    for (const url of SICHTBAR) {
      expect(isUrlAllowedForRole(url, "hr"), url).toBe(true);
    }
  });

  it("blendet das Immobilien-Lexikon aus", () => {
    expect(isUrlAllowedForRole("/immobilien-lexikon", "hr")).toBe(false);
  });

  it("oeffnet die uebrigen Auswertungen nicht mit", () => {
    for (const url of ["/auswertungen", "/abrechnungen", "/zielplanung", "/marktanalyse"]) {
      expect(isUrlAllowedForRole(url, "hr"), url).toBe(false);
    }
  });

  it("laesst die Statistiken unveraendert offen, sie haengen an den Reitern", () => {
    // Nicht an der Rollenliste: `/statistiken` entscheidet ueber
    // `getVisibleStatistikTabs`, und hr hat dort seit jeher den Reiter
    // "recruiting". Das war vor dieser Aenderung so und bleibt so.
    expect(isUrlAllowedForRole("/statistiken", "hr")).toBe(true);
  });

  it("laesst den Entzug der Nutzerverwaltung vom 10.09.2026 bestehen", () => {
    expect(isUrlAllowedForRole("/nutzerverwaltung", "hr")).toBe(false);
  });
});

describe("Keine andere Rolle sieht nach der hr-Aenderung mehr oder weniger", () => {
  /*
   * Festgehaltener Stand vom 11.09.2026, unmittelbar **vor** der Aenderung
   * an der Rolle hr erhoben. Nur die Zeile `hr` durfte sich bewegen. Schlaegt
   * dieser Test an einer anderen Rolle an, hat eine Freigabe die falsche
   * Liste getroffen.
   */
  const VORHER: Record<string, string[]> = {
    inhaber: ["/teampartner", "/chat", "/kultur", "/unterlagen", "/praesentation", "/immobilien-lexikon", "/marketing", "/shop", "/wettbewerb"],
    admin: ["/teampartner", "/chat", "/kultur", "/unterlagen", "/praesentation", "/immobilien-lexikon", "/marketing", "/shop", "/wettbewerb"],
    vertriebsleiter: ["/teampartner", "/chat", "/unterlagen", "/praesentation", "/immobilien-lexikon", "/marketing", "/wettbewerb"],
    vertriebspartner: ["/teampartner", "/chat", "/unterlagen", "/praesentation", "/immobilien-lexikon", "/marketing", "/wettbewerb"],
    buchhaltung: ["/chat"],
    backoffice: ["/teampartner", "/chat", "/unterlagen", "/praesentation", "/immobilien-lexikon"],
    individuell: ["/teampartner", "/chat", "/kultur", "/unterlagen", "/praesentation", "/immobilien-lexikon", "/marketing", "/shop", "/wettbewerb"],
    objektpartner: ["/chat"],
    finanzierungspartner: ["/chat"],
    hausverwaltung: ["/chat", "/immobilien-lexikon"],
    setterin: ["/chat"],
    versicherungsexperte: ["/chat"],
    kunde: [],
    tippgeber: [],
    marketing: [],
    bewerber: [],
    testaccount: ["/teampartner", "/chat", "/kultur", "/unterlagen", "/praesentation", "/immobilien-lexikon", "/marketing", "/shop", "/wettbewerb"],
  };

  const GEPRUEFTE_URLS = [
    "/teampartner", "/chat", "/kultur", "/unterlagen", "/praesentation",
    "/immobilien-lexikon", "/marketing", "/shop", "/wettbewerb",
  ];

  it("liefert fuer jede Rolle ausser hr denselben Stand wie vorher", () => {
    for (const [rolle, erwartet] of Object.entries(VORHER)) {
      const jetzt = GEPRUEFTE_URLS.filter((url) => isUrlAllowedForRole(url, rolle as any));
      expect(jetzt, rolle).toEqual(erwartet);
    }
  });
});


describe("Riegel adminOnly in der Seitenleiste", () => {
  const teampartner = { adminOnly: true, auchFuer: ["hr"] };
  const nutzerverwaltung = { adminOnly: true };
  const ansprechpartner = {};

  it("laesst die Rollen aus auchFuer durch", async () => {
    const { greiftAdminRiegel } = await import("@/lib/sidebarPermissions");
    expect(greiftAdminRiegel(teampartner, "hr")).toBe(false);
    expect(greiftAdminRiegel(teampartner, "admin")).toBe(false);
    expect(greiftAdminRiegel(teampartner, "inhaber")).toBe(false);
  });

  it("blendet den Eintrag fuer alle anderen Rollen weiter aus", async () => {
    const { greiftAdminRiegel } = await import("@/lib/sidebarPermissions");
    for (const rolle of ["vertriebspartner", "vertriebsleiter", "backoffice", "setterin", undefined]) {
      expect(greiftAdminRiegel(teampartner, rolle), String(rolle)).toBe(true);
    }
  });

  it("oeffnet ohne auchFuer nichts Zusaetzliches", async () => {
    const { greiftAdminRiegel } = await import("@/lib/sidebarPermissions");
    expect(greiftAdminRiegel(nutzerverwaltung, "hr")).toBe(true);
    expect(greiftAdminRiegel(nutzerverwaltung, "admin")).toBe(false);
  });

  it("laesst Eintraege ohne adminOnly unberuehrt", async () => {
    const { greiftAdminRiegel } = await import("@/lib/sidebarPermissions");
    expect(greiftAdminRiegel(ansprechpartner, "hr")).toBe(false);
    expect(greiftAdminRiegel(ansprechpartner, "vertriebspartner")).toBe(false);
  });
});


describe("Helpdesk wechselt die Zustaendigkeit, Stand 16.09.2026", () => {
  /*
   * Im Helpdesk laufen die Stoerungsmeldungen aus dem Vertrieb auf. An einem
   * Ticket aus dem Fehler-Dreieck haengt der technische Anhang: besuchte
   * Adresse, Konsolenmeldungen, Bildschirmabzug. Darin stehen regelmaessig
   * Kundendaten.
   *
   * Christian hat am 16.09.2026 entschieden: hr verliert die Seite, das
   * Bewerbermanagement ist dafuer nicht zustaendig. Die Vertriebsleitung
   * bekommt sie, sie darf die Tickets ihrer eigenen Partner sehen.
   *
   * Welche Tickets dort erscheinen, entscheidet die Leseregel in der
   * Datenbank (Migration 20260916110000), nicht diese Liste. Hier wird nur
   * festgehalten, wer die Seite ueberhaupt oeffnen darf.
   */

  it("hr kommt nicht mehr an den Helpdesk", () => {
    expect(isUrlAllowedForRole("/helpdesk", "hr")).toBe(false);
  });

  it("hr schreibt und verfolgt eigene Tickets weiterhin", () => {
    expect(isUrlAllowedForRole("/support-kontaktieren", "hr")).toBe(true);
  });

  it("die Vertriebsleitung kommt an den Helpdesk", () => {
    expect(isUrlAllowedForRole("/helpdesk", "vertriebsleiter")).toBe(true);
  });

  it("Backoffice behaelt den Helpdesk", () => {
    expect(isUrlAllowedForRole("/helpdesk", "backoffice")).toBe(true);
  });

  it("der Vertriebspartner bekommt ihn nicht mit dazu", () => {
    expect(isUrlAllowedForRole("/helpdesk", "vertriebspartner")).toBe(false);
  });
});

describe("Individuelle Berechtigungen nur in internen Rollen", () => {
  // Seit dem 27.09.2026: Die gespeicherte Freigabe haengt an der Person, gilt
  // aber nur, solange die aktive Rolle eine interne ist.
  const EIGENE = ["/pipeline", "/marketing"];

  it("oeffnet in einer internen Rolle zusaetzliche Seiten", () => {
    expect(isUrlAllowedForRole("/marketing", "buchhaltung")).toBe(false);
    expect(isUrlAllowedForRole("/marketing", "buchhaltung", EIGENE)).toBe(true);
  });

  it("oeffnet als Kunde, Tippgeber oder Bewerber nichts", () => {
    for (const rolle of ["kunde", "tippgeber", "bewerber"] as const) {
      for (const url of EIGENE) {
        expect(isUrlAllowedForRole(url, rolle, EIGENE), `${rolle} ${url}`).toBe(false);
      }
    }
  });

  it("oeffnet den Videocall nie", () => {
    expect(isUrlAllowedForRole("/videocall", "backoffice", ["/videocall"])).toBe(false);
    expect(isUrlAllowedForRole("/videocall/buchungen", "kunde", ["/videocall/buchungen"])).toBe(false);
  });
});

describe("Mietsubvention", () => {
  it("steht denselben Rollen offen wie das Ankaufstool", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter"] as const) {
      expect(isUrlAllowedForRole("/mietsubvention", rolle)).toBe(true);
    }
    for (const rolle of ["vertriebspartner", "backoffice", "objektpartner", "kunde", "tippgeber"] as const) {
      expect(isUrlAllowedForRole("/mietsubvention", rolle)).toBe(false);
    }
  });
});

describe("Ankaufstool", () => {
  it("steht der Hausleitung und der Vertriebsleitung offen, sonst niemandem", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter"] as const) {
      expect(isUrlAllowedForRole("/ankaufstool", rolle)).toBe(true);
    }
    for (const rolle of ["vertriebspartner", "backoffice", "objektpartner", "kunde", "tippgeber"] as const) {
      expect(isUrlAllowedForRole("/ankaufstool", rolle)).toBe(false);
    }
  });
});
