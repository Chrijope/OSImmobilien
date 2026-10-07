/**
 * MORE Lotse, Stand vom 05.10.2026: Namen in der Frage, feste Zahlen der
 * Einheit (Hausgeld gesamt, Rücklage, Steuer- und Neubauangaben), „fehlt“
 * statt 0 in der Kalkulation, Rendite wie im Exposé, Sanierungsstand,
 * Stand des ganzen Hauses und der Eingangskorb der Warteschlange.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  baueLotsePrompt, frageMitKundennamen, frageMitKundendaten, LOTSE_KUNDENNAME_TEXT, LOTSE_VORSCHLAEGE, LOTSE_VORSCHLAG_LAGE,
  pruefeKalkulation,
} from "../../supabase/functions/_shared/lotse-regeln";
import { festeZahlenEinheit, sanierungStand } from "../../supabase/functions/_shared/lotse-feste-zahlen";
import { lotseBegruessung } from "@/components/objektseite/lotse/ObjektLotse";

const prompt = (k: Partial<Parameters<typeof baueLotsePrompt>[0]> = {}) =>
  baueLotsePrompt({ heute: "2026-10-05T10:00:00Z", objekt: { id: "o1" }, kalkulation: null, unterlagen: [], nichtGelesen: {}, ...k });

describe("Namen in der Frage", () => {
  it.each([
    "Was zahlt Herr Vogl im Monat?",
    "Passt das für Fr. Schmidt?",
    "Rechne das bitte für Thomas Müller.",
    "Kundin Yilmaz fragt nach der Miete.",
    "Familie Weber will wissen, ob die Wohnung frei ist.",
  ])("lehnt ab: %s", (frage) => {
    expect(frageMitKundennamen(frage)).toBe(true);
  });

  it.each([
    ...LOTSE_VORSCHLAEGE, LOTSE_VORSCHLAG_LAGE,
    "Wie weit ist es zur Frauenkirche?",
    "Liegt die Wohnung an der Peter Behrens Straße?",
    "Wie weit ist es zur Karl-Marx-Straße?",
    "Gibt es einen Supermarkt in der Thomas-Mann-Allee?",
    "Ist die Max Planck Schule in der Nähe?",
    "Welche Sanierungen sind erledigt, welche stehen an?",
    "Passt die Wohnung zu einer Familie mit Kindern?",
    "Wie hoch ist das Hausgeld der Einheit?",
    "Was steht im Herrenhaus Gutachten?",
    "Wie viele Kunden fragen nach Stellplätzen?",
  ])("kein Fehlalarm: %s", (frage) => {
    expect(frageMitKundennamen(frage)).toBe(false);
    expect(frageMitKundendaten(frage)).toBe(false);
  });

  it("sagt freundlich, worum es geht", () => {
    expect(LOTSE_KUNDENNAME_TEXT).toContain("Bitte frag ohne Kundennamen");
    expect(LOTSE_KUNDENNAME_TEXT).not.toMatch(/[–—]/);
  });
});

describe("Feste Zahlen der Einheit", () => {
  const meta = {
    hausgeldNichtUmlagefaehigEuro: 35.52,
    ruecklageZufuehrungMonat: 10,
    investagonRaw: {
      operation_cost_tenant_apartment: 100, share_monument: 0, depreciation_special_7b_onoff: 1, depreciation_special_7b_base: 0,
      end_building_phase_date: "2028-01-01T00:00:00+00:00", power_consumption: "103", degressive_depreciation_building_onoff: -1,
    },
  };

  it("rechnet das Hausgeld gesamt selbst und nennt deutsche Namen", () => {
    const { werte, fehlt } = festeZahlenEinheit(meta);
    expect(werte["Hausgeld gesamt je Monat in Euro"]).toBe(145.52);
    expect(werte["Rücklage (Zuführung) je Monat in Euro"]).toBe(10);
    expect(werte["Fertigstellung"]).toBe("01.01.2028");
    expect(werte["Sonder-AfA nach § 7b EStG"]).toBe("ja");
    expect(werte["Degressive AfA"]).toBe("nein");
    expect(werte["Energiekennwert in kWh je m² und Jahr"]).toBe(103);
    // Ohne Denkmalangaben steht auch nichts zum Denkmal in „fehlt“.
    expect(fehlt).toEqual(["Bemessungsgrundlage Sonder-AfA § 7b in Euro"]);
  });

  it("eine 0 ist nie ein Wert, sondern fehlt", () => {
    const { werte, fehlt } = festeZahlenEinheit({ hausgeldNichtUmlagefaehigEuro: 0, investagonRaw: { operation_cost_tenant_apartment: 100 } });
    expect(werte).not.toHaveProperty("Hausgeld nicht umlagefähig je Monat in Euro");
    expect(fehlt).toEqual(expect.arrayContaining(["Hausgeld nicht umlagefähig je Monat in Euro", "Hausgeld gesamt je Monat in Euro"]));
  });

  it("steht im Prompt samt Rücklage in den Einheitsdaten", () => {
    const text = prompt({ einheit: { id: "w1", objekt_id: "o1", meta } });
    expect(text).toContain("FESTE ZAHLEN DER EINHEIT");
    expect(text).toContain("- Hausgeld gesamt je Monat in Euro: 145.52");
    expect(text).toContain('"ruecklageZufuehrungMonat": 10');
  });

  it("die Begrüßung zählt Hausgeld gesamt und Rücklage nur auf, wenn erfasst", () => {
    expect(lotseBegruessung("Christian Peetz", true, meta)).toContain("das Hausgeld gesamt, das nicht umlagefähige Hausgeld und die Rücklage");
    const ohne = lotseBegruessung("Christian Peetz", true);
    expect(ohne).toContain("das nicht umlagefähige Hausgeld, die Verwaltungskosten");
    expect(ohne).not.toContain("Rücklage");
  });
});

describe("Kalkulation: fehlt statt 0, keine zweite Rendite", () => {
  it("nimmt 0 bei Rücklage und Kaufpreis als fehlend und lässt die Bruttorendite weg", () => {
    const k = pruefeKalkulation({ annahmen: "standard", kaufpreis: 0, ruecklage_monat: 0, kaltmiete_monat: 640, bruttorendite_prozent: 4.1, fehlt: ["x"] });
    expect(k).not.toHaveProperty("kaufpreis");
    expect(k).not.toHaveProperty("bruttorendite_prozent");
    expect(k?.fehlt).toEqual(["kaufpreis", "ruecklage_monat"]);
    expect(k?.fehlt).not.toContain("kaltmiete_monat");
    const text = prompt({ kalkulation: k });
    expect(text).toContain("Fehlt in der Kalkulation");
    expect(text).not.toContain("Bruttomietrendite");
  });

  it("Rendite heißt die der Einheit wie im Exposé, dazu die Hinweise zu Beratung und Zins", () => {
    const text = prompt();
    expect(text).toContain("Rendite heißt die Rendite der Einheit wie im Exposé");
    expect(text).toContain("MOREImmo vermittelt Immobilien und berät nicht zu Geldanlage, Versicherung oder Steuern");
    expect(text).toContain("Zins und Tilgung in der Rechnung sind Rechenannahmen, kein Finanzierungsangebot");
    expect(text).toContain("Objekttexten");
  });
});

describe("Sanierungen", () => {
  const heute = new Date("2026-10-05T10:00:00Z");
  it("ein Plan mit vergangenem Jahr ist nie erledigt", () => {
    expect(sanierungStand({ jahr: "2024", massnahme: "Dachsanierung geplant" }, heute)).toBe("Stand unklar, bitte prüfen");
    expect(sanierungStand({ jahr: 2027, massnahme: "Fassade" }, heute)).toBe("geplant");
    expect(sanierungStand({ jahr: "2019", massnahme: "Fenster erneuert" }, heute)).toBeUndefined();
  });

  it("steht so im Prompt, ohne Koordinaten und englische Texte", () => {
    const text = prompt({
      objekt: {
        id: "o1",
        meta: {
          sanierungen: [{ jahr: "2025", massnahme: "Heizung soll erneuert werden" }],
          koordinaten: { lat: 50.123, lng: 11.987, quelle: "nominatim" },
          objekttexteKiEn: { kurzbeschreibung: "Bright flat" },
        },
      },
    });
    expect(text).toContain("Stand unklar, bitte prüfen");
    expect(text).not.toContain("50.123");
    expect(text).not.toContain("Bright flat");
  });
});

describe("Stand des ganzen Hauses", () => {
  it("nennt ein teilweise reserviertes Globalobjekt nicht frei", () => {
    const text = prompt({ haus: { stand: "teilweise_reserviert", belegt: 3, gesamt: 6 } });
    expect(text).toContain("STAND DES GANZEN HAUSES");
    expect(text).toContain("teilweise reserviert, nicht verfügbar, 3 von 6 Einheiten reserviert oder verkauft");
    expect(prompt()).not.toContain("STAND DES GANZEN HAUSES (Globalobjekt");
  });
});

describe("Eingangskorb: Warteschlange der Auswertung", () => {
  const datei = "20261005123000_lotse_auswertung_warteschlange.sql";
  const sql = readFileSync(`supabase/migrations/${datei}`, "utf8");
  it("liegt als Kopie im Eingangskorb und in der Sammeldatei", () => {
    expect(readFileSync(`supabase/migrations-inbox/${datei}`, "utf8")).toBe(sql);
    expect(readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8")).toContain(sql.trim());
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(datei);
  });

  it("Tabelle nur für die Dienstrolle, Auslöser blockiert nie, Zeitplan mit Geheimwort", () => {
    expect(sql).toContain("REVOKE ALL ON public.lotse_auswertung_warteschlange FROM anon, authenticated;");
    expect(sql).toContain("EXCEPTION WHEN OTHERS THEN");
    expect(sql).toContain("'x-internal-secret', public.automatik_geheimnis()");
    expect(sql).not.toMatch(/DELETE FROM|UPDATE public\.(objekt|wohnungs)_dokumente/);
  });

  it("Prüfzeilen 87.1 bis 87.3, nur die letzte Zeile endet mit Semikolon", () => {
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    for (const nr of ["87.1", "87.2", "87.3"]) expect(pruefung).toContain(`SELECT '${nr} `);
    const schluss = pruefung.split("\n").filter((z) => !z.trim().startsWith("--") && z.trimEnd().endsWith(";"));
    expect(schluss).toHaveLength(1);
  });

  it("die Function wertet im Zeitplan nur mit strengem Geheimwort aus und schließt die Kategorie intern aus", () => {
    const code = readFileSync("supabase/functions/objekt-lotse/index.ts", "utf8");
    expect(code).toContain('automatikSchutz(req, "objekt-lotse", corsHeaders, { streng: true })');
    expect(code).toContain('zeile.kategorie === "intern" || internVonHandAusZeile(zeile)');
    expect(code).toContain('["admin", "inhaber"].includes(rolleAlle)');
  });
});

describe("Keine Rechnung für einen Kunden im Lotsen (05.10.2026)", () => {
  it("der Prompt antwortet mit dem festen Satz statt auf eine Karte zu verweisen", async () => {
    const { LOTSE_KUNDENRECHNUNG_TEXT, LOTSE_KUNDENDATEN_TEXT } = await import("../../supabase/functions/_shared/lotse-regeln");
    const p = prompt();
    expect(p).toContain(`antworte nur: „${LOTSE_KUNDENRECHNUNG_TEXT}“`);
    expect(p).not.toContain("oben in der Karte");
    for (const t of [LOTSE_KUNDENRECHNUNG_TEXT, LOTSE_KUNDENDATEN_TEXT, LOTSE_KUNDENNAME_TEXT]) {
      expect(t).toContain("Investmentkalkulation");
      expect(t).not.toContain("Kundenprofil");
      expect(t).not.toMatch(/[–—]/);
    }
  });
  it("Karte und Rechenlogik sind entfernt", () => {
    expect(readFileSync("src/pages/EinheitSeite.tsx", "utf8")).not.toContain("KundenRechnungKarte");
    expect(readFileSync("src/components/objektseite/lotse/ObjektLotse.tsx", "utf8")).not.toMatch(/\bkopf\b/);
  });
});
