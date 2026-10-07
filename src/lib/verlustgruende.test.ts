import { describe, it, expect } from "vitest";
import {
  VERLUST_GRUENDE,
  VERLUST_GRUPPEN,
  grundAusFreitext,
  auswaehlbareGruppen,
  gruendeDerGruppe,
  istFreitextGrund,
  verlustGrundById,
  verlustGrundLabel,
  verlustGruppeVon,
  wiederAnsprechbarAm,
} from "@/lib/verlustgruende";

describe("Katalog der Verlustgründe", () => {
  it("hat acht Gruppen mit eindeutigen IDs", () => {
    expect(VERLUST_GRUPPEN.length).toBe(8);
    expect(new Set(VERLUST_GRUPPEN.map((g) => g.id)).size).toBe(8);
  });

  it("jeder Grund gehört zu einer bekannten Gruppe", () => {
    const gruppen = new Set(VERLUST_GRUPPEN.map((g) => g.id));
    for (const g of VERLUST_GRUENDE) {
      expect(gruppen.has(g.gruppe), `${g.id} -> ${g.gruppe}`).toBe(true);
    }
  });

  it("jede auswählbare Gruppe hat mindestens einen Grund", () => {
    for (const gruppe of auswaehlbareGruppen()) {
      expect(gruendeDerGruppe(gruppe.id).length, gruppe.id).toBeGreaterThan(0);
    }
  });

  it("bietet den Sammelposten nicht als festen Grund zur Auswahl an", () => {
    // Der Katalog selbst bleibt frei von Freitext-Gründen. Die Auswahl
    // "Sonstiges" mit Pflichttext hängt der Dialog (VerlustGrundAuswahl)
    // selbst an, deshalb taucht die Gruppe hier nicht auf.
    const auswaehlbar = auswaehlbareGruppen().flatMap((gr) => gruendeDerGruppe(gr.id));
    expect(auswaehlbar.some((g) => g.id === "so_sonstiges")).toBe(false);
    expect(auswaehlbareGruppen().some((gr) => gr.id === "sonstiges")).toBe(false);
    expect(auswaehlbar.length).toBeGreaterThanOrEqual(20);
  });

  it("Gründe haben eindeutige IDs und ein Label", () => {
    expect(new Set(VERLUST_GRUENDE.map((g) => g.id)).size).toBe(VERLUST_GRUENDE.length);
    for (const g of VERLUST_GRUENDE) {
      expect(g.label.trim().length, g.id).toBeGreaterThan(0);
    }
  });

  it("wer wieder ansprechbar ist, hat auch eine Frist", () => {
    for (const g of VERLUST_GRUENDE) {
      if (g.wiederAnsprechbar) {
        expect(g.wiedervorlageMonate, `${g.id} ohne Frist`).toBeGreaterThan(0);
      }
    }
  });

  it("der Sammelposten Sonstiges ist nicht auswählbar", () => {
    expect(verlustGrundById("so_sonstiges")?.nurAutomatisch).toBe(true);
  });

  it("jeder Grund ist entweder uns oder extern zugeordnet", () => {
    for (const g of VERLUST_GRUENDE) {
      expect(["uns", "extern"], g.id).toContain(g.verantwortung);
    }
  });

  it("falsche Kontaktdaten sind nicht wieder ansprechbar", () => {
    expect(verlustGrundById("ne_daten_falsch")?.wiederAnsprechbar).toBe(false);
  });
});

describe("Alte Freitexte zuordnen", () => {
  const faelle: [string, string][] = [
    ["4x nicht erreicht", "ne_mehrfach"],
    ["Nach 4 Versuchen nicht erreicht (automatisch)", "ne_mehrfach"],
    ["Kontaktdaten falsch", "ne_daten_falsch"],
    ["Kein Interesse", "kb_kein_interesse"],
    ["Bonität nicht ausreichend", "nf_bonitaet"],
    ["Vermögensaufbau geeignet", "pn_vermoegensaufbau"],
    ["Kunde hat kein Eigenkapital", "nf_eigenkapital"],
    ["Bank hat abgelehnt", "nf_bank_abgelehnt"],
    ["Meldet sich später wieder", "ti_spaeter"],
    ["Steuerberater hat abgeraten", "pv_steuerberater"],
    ["Ist ihm zu teuer", "pv_preis"],
    ["Hat bei einem anderen Anbieter gekauft", "we_wettbewerber"],
  ];

  for (const [text, erwartet] of faelle) {
    it(`ordnet "${text}" zu ${erwartet}`, () => {
      const { grundId, sicher } = grundAusFreitext(text);
      expect(grundId).toBe(erwartet);
      expect(sicher).toBe(true);
    });
  }

  it("landet bei Unbekanntem in Sonstiges und meldet Unsicherheit", () => {
    const r = grundAusFreitext("hat sich einfach nicht mehr gemeldet trotz allem");
    expect(r.grundId).toBe("so_sonstiges");
    expect(r.sicher).toBe(false);
  });

  it("behandelt leeren Text als Sonstiges", () => {
    expect(grundAusFreitext("").grundId).toBe("so_sonstiges");
    expect(grundAusFreitext(null).sicher).toBe(false);
  });
});

describe("Sonstiges mit Freitext", () => {
  // Die Auswahl "Sonstiges" im Dialog speichert den eingetippten Text selbst
  // in `verlorenGrund`. Die Lesestellen müssen ihn von Katalog-IDs
  // unterscheiden und unverändert anzeigen können.
  it("erkennt Katalog-IDs nicht als Freitext", () => {
    expect(istFreitextGrund("ne_mehrfach")).toBe(false);
    expect(istFreitextGrund("so_sonstiges")).toBe(false);
  });

  it("erkennt eigene Texte als Freitext", () => {
    expect(istFreitextGrund("Kunde ist ins Ausland gezogen")).toBe(true);
  });

  it("behandelt Leeres nicht als Freitext", () => {
    expect(istFreitextGrund("")).toBe(false);
    expect(istFreitextGrund("   ")).toBe(false);
    expect(istFreitextGrund(null)).toBe(false);
    expect(istFreitextGrund(undefined)).toBe(false);
  });

  it("zeigt den Freitext unverändert als Grund an", () => {
    expect(verlustGrundLabel("Kunde ist ins Ausland gezogen")).toBe("Kunde ist ins Ausland gezogen");
  });

  it("führt nicht zuordenbaren Freitext in der Gruppe Sonstiges", () => {
    expect(verlustGruppeVon("Kunde ist ins Ausland gezogen").id).toBe("sonstiges");
  });
});

describe("Anzeige und Ableitung", () => {
  it("zeigt bei Sonstiges den Freitext statt des Katalognamens", () => {
    expect(verlustGrundLabel("so_sonstiges", "Wollte doch ein Haus")).toBe("Wollte doch ein Haus");
    expect(verlustGrundLabel("so_sonstiges", "")).toBe("Sonstiges (Freitext)");
  });

  it("zeigt bei Altbestand den gespeicherten Text", () => {
    expect(verlustGrundLabel("Irgendein alter Freitext")).toBe("Irgendein alter Freitext");
    expect(verlustGrundLabel(null, null)).toBe("Kein Grund angegeben");
  });

  it("leitet auch für Altbestand eine Gruppe ab", () => {
    expect(verlustGruppeVon("nf_bonitaet").id).toBe("nicht_finanzierbar");
    expect(verlustGruppeVon("Bonität war zu schlecht").id).toBe("nicht_finanzierbar");
    expect(verlustGruppeVon("völlig unklarer Text").id).toBe("sonstiges");
  });

  it("rechnet die Wiedervorlage aus Grund und Verlustdatum", () => {
    const d = wiederAnsprechbarAm("ti_spaeter", "2026-01-15T10:00:00.000Z");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6); // Januar plus 6 Monate ist Juli
  });

  it("gibt nichts zurück, wenn der Grund nicht wieder ansprechbar ist", () => {
    expect(wiederAnsprechbarAm("ne_daten_falsch", "2026-01-15T10:00:00.000Z")).toBeNull();
  });

  it("gibt nichts zurück, wenn das Verlustdatum fehlt", () => {
    expect(wiederAnsprechbarAm("ti_spaeter", null)).toBeNull();
  });
});

describe("Fest verdrahtete Gründe im Code", () => {
  // Jede Stelle, die einen Verlustgrund setzt, muss eine Katalog-ID benutzen.
  // Sonst taucht in der Auswertung wieder ein Einzeltext auf, den niemand
  // zusammenfassen kann.
  const DATEIEN = [
    "src/pages/KundenDetail.tsx",
    "src/pages/Pipeline.tsx",
    "src/components/setter/SetterSkript.tsx",
    "src/lib/testDemoSeed.ts",
  ];

  it("setzt überall eine bekannte Katalog-ID", async () => {
    const { readFileSync } = await import("node:fs");
    const gefunden: string[] = [];
    for (const datei of DATEIEN) {
      const inhalt = readFileSync(datei, "utf8");
      for (const treffer of inhalt.matchAll(/verlorenGrund:\s*"([^"]+)"/g)) {
        gefunden.push(treffer[1]);
      }
    }
    expect(gefunden.length).toBeGreaterThan(0);
    for (const id of gefunden) {
      expect(verlustGrundById(id), `${id} steht nicht im Katalog`).toBeTruthy();
    }
  });
});
