/**
 * Tests fuer die Zuordnung eines hereinkommenden Leads.
 *
 * Die Logik liegt in `supabase/functions/_shared/lead-zuordnung.ts`, weil die
 * Edge Function in Deno laeuft und nichts aus `src/` importieren kann. Getestet
 * wird von hier, so wie bei `meta-capi` und `kontakt-dublette`.
 *
 * Zwei Dinge stehen auf dem Spiel:
 *
 *   1. Eine erfundene Nutzerkennung darf keinen Lead im Namen eines fremden
 *      Partners anlegen. Eine echte Kennung muss weiter funktionieren, der
 *      alte Linktyp `?b=` ist noch im Umlauf.
 *   2. Die Pipelinestufe haengt an der HERKUNFT: Ein Lead ueber den geprueften
 *      persoenlichen Link eines Partners heisst "zugewiesen", alles aus den
 *      Kampagnen des Hauses heisst "neuer_lead" und geht in die
 *      Lead-Verwaltung.
 */
import { describe, it, expect } from "vitest";
import {
  BERATER_ROLLEN,
  beraterAnzeigename,
  beurteileBeraterKennung,
  beurteileLinkKuerzel,
  fremdeDublettenMeldung,
  glockenPlanFuerLead,
  hatBeraterRolle,
  hatEigenenPartnerLink,
  herkunftBezeichnung,
  istFremdeDublette,
  istUuid,
  leadHerkunft,
  linkBezeichnung,
  pipelineStufeFuerLead,
  waehleZuordnungsWeg,
} from "../../supabase/functions/_shared/lead-zuordnung.ts";

const ECHTE_ID = "27ccfbab-f949-4484-90b1-7dffca6a65c9";

describe("istUuid", () => {
  it("erkennt eine Nutzerkennung", () => {
    expect(istUuid(ECHTE_ID)).toBe(true);
    expect(istUuid(ECHTE_ID.toUpperCase())).toBe(true);
  });

  it("weist alles ab, was keine ist", () => {
    for (const wert of ["", "  ", "abc", "27ccfbab-f949-4484-90b1", 42, null, undefined, {}]) {
      expect(istUuid(wert)).toBe(false);
    }
  });
});

describe("hatBeraterRolle", () => {
  it("erkennt die Rollen mit eigener Partnerseite", () => {
    for (const rolle of BERATER_ROLLEN) {
      expect(hatBeraterRolle([{ role: rolle }])).toBe(true);
    }
  });

  it("weist Rollen ohne Partnerseite ab", () => {
    expect(hatBeraterRolle([{ role: "setterin" }, { role: "kunde" }])).toBe(false);
  });

  it("kommt mit fehlenden Zeilen zurecht", () => {
    expect(hatBeraterRolle(null)).toBe(false);
    expect(hatBeraterRolle([])).toBe(false);
    expect(hatBeraterRolle([{}])).toBe(false);
  });
});

describe("beurteileBeraterKennung", () => {
  const profil = { id: ECHTE_ID, gesperrt: false };
  const rollen = [{ role: "vertriebspartner" }];

  it("nimmt die Kennung eines echten Partners an", () => {
    expect(beurteileBeraterKennung({ kennung: ECHTE_ID, profil, rollen })).toBe("ok");
  });

  it("weist eine erfundene Kennung ab", () => {
    // Der Kern von Auftrag 1: Wer eine Kennung erfindet, bekommt keinen Lead.
    expect(
      beurteileBeraterKennung({ kennung: "ich-bin-ein-partner", profil, rollen }),
    ).toBe("kein_uuid_format");
  });

  it("weist eine Kennung ohne Profil ab", () => {
    expect(beurteileBeraterKennung({ kennung: ECHTE_ID, profil: null, rollen })).toBe(
      "profil_unbekannt",
    );
  });

  it("weist ein gesperrtes Profil ab", () => {
    expect(
      beurteileBeraterKennung({ kennung: ECHTE_ID, profil: { id: ECHTE_ID, gesperrt: true }, rollen }),
    ).toBe("profil_gesperrt");
  });

  it("weist ein Profil ohne Beraterrolle ab", () => {
    // Eine echte Nutzerkennung reicht nicht. Ein Kunde ist kein Partner.
    expect(
      beurteileBeraterKennung({ kennung: ECHTE_ID, profil, rollen: [{ role: "kunde" }] }),
    ).toBe("keine_beraterrolle");
  });
});

describe("leadHerkunft", () => {
  it("erkennt den persoenlichen Weg an der geprueften Beraterkennung", () => {
    expect(leadHerkunft({ beraterKennungGeprueft: true })).toBe("partner_persoenlich");
  });

  it("haelt alles ohne geprueften Partnerlink fuer einen Weg der Gesellschaft", () => {
    expect(leadHerkunft({ beraterKennungGeprueft: false })).toBe("gesellschaft");
  });
});

describe("pipelineStufeFuerLead", () => {
  it("legt einen Lead vom persoenlichen Partnerlink direkt beim Partner ab", () => {
    expect(pipelineStufeFuerLead({ istTerminLead: false, persoenlicherPartnerWeg: true })).toBe(
      "zugewiesen",
    );
  });

  it("legt einen Lead der Gesellschaft in die Lead-Verwaltung", () => {
    expect(pipelineStufeFuerLead({ istTerminLead: false, persoenlicherPartnerWeg: false })).toBe(
      "neuer_lead",
    );
  });

  it("schickt einen Zapier-Lead mit erkanntem Beraternamen trotzdem in die Lead-Verwaltung", () => {
    // Der Kern von Auftrag 1: Zapier und Meta schicken haeufig einen
    // Beraternamen mit, der Namensabgleich fand damit einen Partner, und ein
    // Kampagnenlead des Hauses verschwand aus der Lead-Verwaltung. Ein
    // zufaellig passender Name ist kein Herkunftsnachweis. Zugewiesen sein darf
    // der Lead trotzdem, das entscheidet aber `zustaendig_id`, nicht die Stufe.
    const herkunft = leadHerkunft({ beraterKennungGeprueft: false });
    expect(
      pipelineStufeFuerLead({
        istTerminLead: false,
        persoenlicherPartnerWeg: herkunft === "partner_persoenlich",
      }),
    ).toBe("neuer_lead");
  });

  it("laesst sich vom Aufrufer nicht aushebeln, wenn der Lead vom Partnerlink kommt", () => {
    // Das oeffentliche Formular schickte frueher "neuer_lead" mit. Genau das
    // hat die Leads der Partner in die Lead-Verwaltung geschickt.
    expect(
      pipelineStufeFuerLead({
        istTerminLead: false,
        persoenlicherPartnerWeg: true,
        vorgabe: "neuer_lead",
      }),
    ).toBe("zugewiesen");
  });

  it("nimmt eine Vorgabe nur auf dem Weg der Gesellschaft an", () => {
    // Zapier und Importe duerfen den offenen Pool weiter feiner steuern.
    expect(
      pipelineStufeFuerLead({
        istTerminLead: false,
        persoenlicherPartnerWeg: false,
        vorgabe: "erreicht",
      }),
    ).toBe("erreicht");
  });

  it("laesst die Terminbuchung unberuehrt", () => {
    expect(pipelineStufeFuerLead({ istTerminLead: true, persoenlicherPartnerWeg: true })).toBe(
      "termin_gebucht",
    );
    expect(pipelineStufeFuerLead({ istTerminLead: true, persoenlicherPartnerWeg: false })).toBe(
      "termin_gebucht",
    );
  });
});

describe("herkunftBezeichnung", () => {
  it("nennt den Weg beim Namen", () => {
    expect(herkunftBezeichnung("Analysetool")).toBe("das Analysetool");
    expect(herkunftBezeichnung("Steuerrechner")).toBe("den Steuerrechner");
    expect(herkunftBezeichnung("Microseite Hermann Vogl")).toBe("deine Beraterseite");
    expect(herkunftBezeichnung("Landingpage (Tippgeber: Anna)")).toBe("deine Beraterseite");
  });

  it("erkennt die Beraterseite auch am Kuerzel, wenn die Quelle nichts hergibt", () => {
    expect(herkunftBezeichnung("Funnel Lead", "hermann-vogl")).toBe("deine Beraterseite");
  });

  it("bleibt bei unbekannter Quelle allgemein, statt etwas zu behaupten", () => {
    expect(herkunftBezeichnung("Funnel Lead")).toBe("deinen persönlichen Link");
    expect(herkunftBezeichnung(undefined)).toBe("deinen persönlichen Link");
  });
});

describe("beraterAnzeigename", () => {
  it("nimmt den Namen aus dem Profil, nicht den aus dem Formular", () => {
    // Auftrag 2: Die Spalte `berater` ist die Zeile "Vertriebspartner" in den
    // Stammdaten UND der Schluessel, mit dem das Kundenprofil prueft, ob ein
    // Kunde dem angemeldeten Partner gehoert. Eine abweichende Schreibweise
    // aus dem oeffentlichen Formular haette ihm die Rechte an seinem eigenen
    // Lead genommen.
    expect(
      beraterAnzeigename({ profilName: "Hermann Vogl", gelieferterName: "hermann vogel" }),
    ).toBe("Hermann Vogl");
  });

  it("faellt auf den gelieferten Namen zurueck, wenn im Profil keiner steht", () => {
    // Ein leeres Feld waere schlechter als ein ungenauer Name.
    expect(beraterAnzeigename({ profilName: null, gelieferterName: "Hermann Vogl" })).toBe(
      "Hermann Vogl",
    );
    expect(beraterAnzeigename({ profilName: "   ", gelieferterName: "Hermann Vogl" })).toBe(
      "Hermann Vogl",
    );
  });

  it("liefert leer, wenn es gar keinen Namen gibt", () => {
    expect(beraterAnzeigename({})).toBe("");
  });
});

describe("glockenPlanFuerLead", () => {
  it("gibt dem Partner die Glocke fuer seinen eigenen Lead", () => {
    // Auftrag 3. Bisher bekam er hierfuer bewusst gar keine.
    const plan = glockenPlanFuerLead({
      istTerminLead: false,
      persoenlicherPartnerWeg: true,
      hatZustaendigen: true,
    });
    expect(plan.partner).toBe(true);
    expect(plan.partnerTermin).toBe(false);
  });

  it("laesst die Glocke an die Fuehrung fuer einen Partner-Lead weg", () => {
    // Sie sagt "Bitte in der Lead-Verwaltung pruefen" und verlinkt dorthin,
    // wo dieser Lead gar nicht steht.
    expect(
      glockenPlanFuerLead({
        istTerminLead: false,
        persoenlicherPartnerWeg: true,
        hatZustaendigen: true,
      }).leitung,
    ).toBe(false);
  });

  it("laesst die Glocke an die Fuehrung fuer einen Lead der Gesellschaft stehen", () => {
    const plan = glockenPlanFuerLead({
      istTerminLead: false,
      persoenlicherPartnerWeg: false,
      hatZustaendigen: false,
    });
    expect(plan.leitung).toBe(true);
    expect(plan.partner).toBe(false);
  });

  it("laeutet bei einem per Namensabgleich zugewiesenen Zapier-Lead beim Partner, nicht bei der Fuehrung", () => {
    // M8 vom 04.10.2026: Steht ein Zustaendiger fest, bekommt er die Glocke.
    // Die Leitung nur ohne Zustaendigen (Regel vom 29.09.2026).
    const plan = glockenPlanFuerLead({
      istTerminLead: false,
      persoenlicherPartnerWeg: false,
      hatZustaendigen: true,
    });
    expect(plan.leitung).toBe(false);
    expect(plan.partner).toBe(true);
  });

  it("meldet eine Terminbuchung ohne Zustaendigen an die Fuehrung", () => {
    const plan = glockenPlanFuerLead({
      istTerminLead: true,
      persoenlicherPartnerWeg: false,
      hatZustaendigen: false,
    });
    expect(plan.leitung).toBe(true);
    expect(plan.partnerTermin).toBe(false);
  });

  it("laesst die Terminbuchung beim alten Weg", () => {
    const plan = glockenPlanFuerLead({
      istTerminLead: true,
      persoenlicherPartnerWeg: true,
      hatZustaendigen: true,
    });
    expect(plan.partnerTermin).toBe(true);
    // Keine zweite Glocke fuer denselben Vorgang.
    expect(plan.partner).toBe(false);
    expect(plan.leitung).toBe(false);
  });
});

describe("Wo die beiden Stufen in der Oberflaeche landen", () => {
  it("legt einen Lead ohne Partner in die Lead-Verwaltung", async () => {
    const { getProzessBereichForStufe } = await import("@/lib/kontaktPipeline");
    expect(getProzessBereichForStufe("neuer_lead")).toBe("leadverwaltung");
  });

  it("legt einen Lead mit Partner zu den Kontakten, nicht zu den Bestandskunden", async () => {
    // "zugewiesen" fehlte in der Zuordnung und fiel bis ans Ende durch, also
    // in "bestandskunden". Ein frischer Lead stand damit unter den
    // Bestandskunden.
    const { getProzessBereichForStufe } = await import("@/lib/kontaktPipeline");
    expect(getProzessBereichForStufe("zugewiesen")).toBe("kontakte");
  });

  it("laesst die Stufe eines Partner-Leads unveraendert bestehen", async () => {
    // Wuerde sie umgeschrieben, waere der Zug in die Spalte sofort wieder weg.
    const { normalizePipelineStufe } = await import("@/lib/kontaktPipeline");
    expect(normalizePipelineStufe("zugewiesen")).toBe("zugewiesen");
  });
});

/**
 * Entscheidungen vom 24.09.2026.
 *
 *   1. Der Server ermittelt den Partner aus dem Link-Kuerzel. Eine
 *      mitgeschickte fremde Kennung gibt keinen Ausschlag.
 *   3. Ein bekannter Kontakt ueber den Link eines anderen Partners loest einen
 *      Hinweis an die Admin-Rolle aus, die Zustaendigkeit bleibt.
 *   4. Die Vertriebsleitung bekommt einen eigenen Link, das Backoffice nicht.
 */
describe("Der Zuordnungsweg", () => {
  const FREMDE_ID = "99999999-8888-7777-6666-555555555555";

  it("nimmt das Kuerzel und ignoriert eine mitgeschickte fremde Kennung", () => {
    const weg = waehleZuordnungsWeg({ beraterSlug: " Maria-Muster ", beraterUserId: FREMDE_ID });
    expect(weg).toEqual({
      weg: "link_kuerzel",
      kuerzel: "maria-muster",
      kuerzelGueltig: true,
      mitgeschickteKennung: FREMDE_ID,
    });
    // Es gibt auf diesem Weg keine Kennung, die zugewiesen werden koennte.
    expect("kennung" in weg).toBe(false);
  });

  it("laesst den alten Link ohne Kuerzel weiter ueber die Kennung laufen", () => {
    expect(waehleZuordnungsWeg({ beraterUserId: ECHTE_ID })).toEqual({ weg: "alter_link", kennung: ECHTE_ID });
    expect(waehleZuordnungsWeg({ beraterSlug: "", beraterUserId: ECHTE_ID })).toEqual({
      weg: "alter_link",
      kennung: ECHTE_ID,
    });
  });

  it("kennt den Weg ohne Link", () => {
    expect(waehleZuordnungsWeg({})).toEqual({ weg: "ohne_link" });
    expect(waehleZuordnungsWeg({ beraterSlug: "  ", beraterUserId: "" })).toEqual({ weg: "ohne_link" });
  });

  it("markiert ein Kuerzel mit fremden Zeichen als ungueltig, statt auf die Kennung auszuweichen", () => {
    const weg = waehleZuordnungsWeg({ beraterSlug: "maria muster;drop", beraterUserId: ECHTE_ID });
    expect(weg.weg).toBe("link_kuerzel");
    expect(weg.weg === "link_kuerzel" && weg.kuerzelGueltig).toBe(false);
  });
});

describe("Die Pruefung des Linkinhabers", () => {
  const PROFIL = { id: ECHTE_ID, gesperrt: false };

  it("akzeptiert einen Partner mit Beraterrolle", () => {
    expect(
      beurteileLinkKuerzel({ kuerzelGueltig: true, profil: PROFIL, rollen: [{ role: "vertriebspartner" }] }),
    ).toBe("ok");
  });

  it("akzeptiert die Vertriebsleitung als Linkinhaberin", () => {
    expect(
      beurteileLinkKuerzel({ kuerzelGueltig: true, profil: PROFIL, rollen: [{ role: "vertriebsleiter" }] }),
    ).toBe("ok");
  });

  it("weist das Backoffice als Linkinhaber ab", () => {
    expect(
      beurteileLinkKuerzel({ kuerzelGueltig: true, profil: PROFIL, rollen: [{ role: "backoffice" }] }),
    ).toBe("keine_beraterrolle");
  });

  it("meldet ein unbekanntes und ein ungueltiges Kuerzel", () => {
    expect(beurteileLinkKuerzel({ kuerzelGueltig: true, profil: null, rollen: [] })).toBe("kuerzel_unbekannt");
    expect(beurteileLinkKuerzel({ kuerzelGueltig: false, profil: PROFIL, rollen: [{ role: "admin" }] })).toBe(
      "kuerzel_ungueltig",
    );
  });

  it("weist einen gesperrten Linkinhaber ab", () => {
    expect(
      beurteileLinkKuerzel({
        kuerzelGueltig: true,
        profil: { id: ECHTE_ID, gesperrt: true },
        rollen: [{ role: "vertriebspartner" }],
      }),
    ).toBe("profil_gesperrt");
  });
});

describe("Wer einen eigenen Link bekommt", () => {
  it("Vertriebspartner, Vertriebsleitung, Admin und Inhaber", () => {
    for (const rolle of ["vertriebspartner", "vertriebsleiter", "admin", "inhaber"]) {
      expect(hatEigenenPartnerLink(rolle)).toBe(true);
      expect(hatBeraterRolle([{ role: rolle }])).toBe(true);
    }
  });

  it("nicht das Backoffice und nicht die anderen Rollen, die die Seite sehen", () => {
    for (const rolle of ["backoffice", "individuell", "testaccount", "setterin", "kunde", "", undefined]) {
      expect(hatEigenenPartnerLink(rolle)).toBe(false);
    }
    expect(hatBeraterRolle([{ role: "backoffice" }])).toBe(false);
  });
});

describe("Ein bekannter Kontakt ueber den Link eines anderen Partners", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("loest den Hinweis aus, wenn der Kontakt schon einem anderen Partner gehoert", () => {
    expect(istFremdeDublette({ persoenlicherPartnerWeg: true, linkInhaberId: A, bestandsZustaendigId: B })).toBe(
      true,
    );
  });

  it("schweigt, wenn es der eigene Kontakt ist", () => {
    expect(istFremdeDublette({ persoenlicherPartnerWeg: true, linkInhaberId: A, bestandsZustaendigId: A })).toBe(
      false,
    );
  });

  it("schweigt ohne Zustaendigen im Bestand, dann laeuft die Pool-Glocke", () => {
    expect(
      istFremdeDublette({ persoenlicherPartnerWeg: true, linkInhaberId: A, bestandsZustaendigId: null }),
    ).toBe(false);
  });

  it("schweigt auf dem Weg der Gesellschaft", () => {
    expect(
      istFremdeDublette({ persoenlicherPartnerWeg: false, linkInhaberId: A, bestandsZustaendigId: B }),
    ).toBe(false);
    expect(
      istFremdeDublette({ persoenlicherPartnerWeg: true, linkInhaberId: null, bestandsZustaendigId: B }),
    ).toBe(false);
  });

  it("nennt Kontakt, bisherigen Partner und Linkinhaber, ohne Kontaktdaten und ohne Gedankenstrich", () => {
    const m = fremdeDublettenMeldung({
      kontaktName: "Max Mustermann",
      bisherBei: "Bernd Bestand",
      linkVon: "Anna Link",
      quelle: "Steuerrechner",
    });
    expect(m.titel).toContain(
      "Bekannter Kontakt über fremden Steuerrechner-Link: Max Mustermann, bisher bei Bernd Bestand, Link von Anna Link",
    );
    expect(m.text).toContain("Die Zuständigkeit bleibt bei Bernd Bestand");
    expect(`${m.titel} ${m.text}`).not.toMatch(/[–—]/);
    expect(`${m.titel} ${m.text}`).not.toContain("@");
  });

  it("benennt den Link nach dem Weg", () => {
    expect(linkBezeichnung("Steuerrechner")).toBe("Steuerrechner-Link");
    expect(linkBezeichnung("Analysetool")).toBe("Analysetool-Link");
    expect(linkBezeichnung("Microseite Maria Muster")).toBe("Beraterseiten-Link");
  });
});

/**
 * Die Function selbst laeuft in Deno. Am Quelltext wird geprueft, dass sie
 * die Regeln oben tatsaechlich anwendet und die alte Kennungspruefung nur
 * noch fuer den alten Link laeuft.
 */
describe("submit-lead wendet die Regeln an", () => {
  const lies = async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    return readFileSync(join(process.cwd(), "supabase/functions/submit-lead/index.ts"), "utf8");
  };

  it("ermittelt den Partner aus dem Kuerzel und kennzeichnet den alten Link", async () => {
    const quelle = await lies();
    expect(quelle).toContain("waehleZuordnungsWeg(");
    expect(quelle).toContain('.eq("vp_slug", zuordnungsWeg.kuerzel)');
    expect(quelle).toContain('if (zuordnungsWeg.weg === "alter_link" && zustaendigId)');
    expect(quelle).toContain('event: "berater_alter_link"');
    expect(quelle).toContain('event: "berater_kennung_ignoriert"');
    expect(quelle).toContain('event: "berater_kuerzel_verworfen"');
  });

  it("schickt bei fremder Dublette eine Glocke an die Rolle admin und verlinkt ins Kundenprofil", async () => {
    const quelle = await lies();
    const abschnitt = quelle.slice(quelle.indexOf("istFremdeDublette({"));
    expect(abschnitt).toContain('.eq("role", "admin")');
    expect(abschnitt).toContain("link: `/kunden/${bestandsId}`");
    expect(abschnitt).toContain('notif_type: "kontakt_fremder_partnerlink"');
  });
});
