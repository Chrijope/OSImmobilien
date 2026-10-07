/**
 * Provisionsfelder aus Investagon nur für Admin, Inhaber und Buchhaltung, die
 * Eigenprovisionsvereinbarungen des Käufers dagegen für alle Objektrollen
 * (Vorgabe und Korrektur Christian vom 05.10.2026): Migration 20261005120000,
 * Eingangskorb, Kundenweg, Grundrisse und MORE Lotse.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  darfZumKunden, freigabeDokumentAusZeile, istInterneInvestagonUnterlage, internVonHandAusZeile,
} from "../../supabase/functions/_shared/dokument-freigabe";
import { grundrissStaerke } from "../../supabase/functions/_shared/grundriss-erkennung";
import { antwortNenntProvision, frageNachProvision } from "../../supabase/functions/_shared/lotse-regeln";
import { vorabGesperrt } from "../../supabase/functions/_shared/lotse-faktenauszug";
import { objektUnterlagenEintraege } from "./objektUnterlagenRegeln";
import type { ObjektDokument } from "./objekteStore";

const lies = (pfad: string) => readFileSync(pfad, "utf8");

const DATEI = "20261005120000_provision_intern_sperren.sql";
const SQL = lies(`supabase/migrations/${DATEI}`);
const ohneKommentare = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

/** Die Provisionsfelder, ermittelt aus den echten Daten am 05.10.2026. */
const FELDER = [
  "commission", "commission_comment", "userCommissions",
  "selling_price_commission", "selling_price_commission_manual", "sellingPriceCommission",
  "transaction_broker_rate", "listing_broker",
];

const position = (text: string) => {
  const i = ohneKommentare.indexOf(text);
  expect(i, text).toBeGreaterThanOrEqual(0);
  return i;
};

describe(`${DATEI}: Provisionsfelder raus aus meta`, () => {
  it("trennt genau die Provisionsfelder ab, Dateien, Kaufpreis und Miteigentumsanteil bleiben", () => {
    const werte = /WITH felder\(k\) AS \(\s*VALUES ([\s\S]*?)\n\s*\)\n/.exec(ohneKommentare)?.[1] ?? "";
    expect([...werte.matchAll(/\('([^']+)'\)/g)].map((t) => t[1])).toEqual(FELDER);
    const liste = `ARRAY[${FELDER.map((f) => `'${f}'`).join(",")}]`;
    expect(ohneKommentare.split(liste)).toHaveLength(3);
    expect(ohneKommentare).not.toMatch(/purchase_price|object_share_owner|files|objekt_dokumente|wohnungs_dokumente|storage\./);
  });

  it("läuft als eine Transaktion unter Sperre: kopieren, vergleichen, Auslöser, entfernen", () => {
    const anfang = position("BEGIN;");
    const sperre = position("LOCK TABLE public.objekte, public.wohnungen IN SHARE ROW EXCLUSIVE MODE;");
    const kopie = position("INSERT INTO public.investagon_intern (objekt_id, felder)\nSELECT");
    const vergleich = position("RAISE EXCEPTION 'Kopie unvollstaendig");
    const ausloeser = position("CREATE TRIGGER trg_investagon_intern_abtrennen\n  BEFORE INSERT OR UPDATE OF meta ON public.wohnungen");
    const entfernen = position("UPDATE public.wohnungen w\n   SET meta = jsonb_set(w.meta, '{investagonRaw}'");
    const ende = position("COMMIT;");
    expect([anfang, sperre, kopie, vergleich, ausloeser, entfernen, ende]).toEqual(
      [anfang, sperre, kopie, vergleich, ausloeser, entfernen, ende].slice().sort((a, b) => a - b),
    );
    expect(ohneKommentare.match(/\bBEGIN;|\bCOMMIT;/g)).toHaveLength(2);
  });

  it("führt die Felder zusammen, statt sie zu ersetzen, im Auslöser und beim Bestand", () => {
    expect(ohneKommentare.match(/SET felder = investagon_intern\.felder \|\| EXCLUDED\.felder/g)).toHaveLength(4);
    expect(ohneKommentare).not.toMatch(/SET felder = EXCLUDED\.felder/);
    expect(ohneKommentare).toContain("i.felder @> t.intern");
  });

  it("ist wiederholbar und überschreibt die Kopie beim zweiten Lauf nicht", () => {
    expect(ohneKommentare).toContain("CREATE TABLE IF NOT EXISTS public.investagon_intern");
    expect(ohneKommentare.match(/CREATE TRIGGER/g)).toHaveLength(ohneKommentare.match(/DROP TRIGGER IF EXISTS/g)!.length);
    expect(ohneKommentare.match(/AND t\.intern <> '\{\}'::jsonb\nON CONFLICT/g)).toHaveLength(2);
  });
});

describe(`${DATEI}: der Import schreibt nicht mehr in meta`, () => {
  it("trennt beim Anlegen und bei jedem Schreiben von meta ab, an Objekt und Einheit", () => {
    for (const tabelle of ["objekte", "wohnungen"]) {
      expect(ohneKommentare).toContain(
        `CREATE TRIGGER trg_investagon_intern_abtrennen\n  BEFORE INSERT OR UPDATE OF meta ON public.${tabelle}\n  FOR EACH ROW EXECUTE FUNCTION public.investagon_intern_abtrennen();`,
      );
    }
    expect(ohneKommentare).toContain("NEW.meta := jsonb_set(NEW.meta, '{investagonRaw}', teile.oeffentlich);");
  });

  it("nur die Dienstrolle pflegt die Kopie, aus dem Browser wird nur verworfen", () => {
    const funktion = ohneKommentare.slice(position("CREATE OR REPLACE FUNCTION public.investagon_intern_abtrennen()"), position("INSERT INTO public.investagon_intern (objekt_id, felder)\nSELECT"));
    expect(funktion).toContain("SECURITY DEFINER");
    expect(funktion.indexOf("IF auth.uid() IS NULL THEN")).toBeLessThan(funktion.indexOf("INSERT INTO public.investagon_intern"));
  });

  it("der Import umgeht den Auslöser nicht", () => {
    for (const datei of ["index.ts", "verkaeufe.ts", "bilder.ts", "sichtbarkeit.ts"]) {
      expect(lies(`supabase/functions/investagon-import/${datei}`)).not.toMatch(/session_replication_role|DISABLE TRIGGER/i);
    }
  });

  it("investagon_intern lesen nur Admin, Inhaber und Buchhaltung, schreiben kann der Browser nicht", () => {
    expect(ohneKommentare).toContain("REVOKE ALL ON public.investagon_intern FROM anon, authenticated;");
    expect(ohneKommentare).toContain("GRANT SELECT ON public.investagon_intern TO authenticated;");
    expect(ohneKommentare.match(/CREATE POLICY [^\n]*\n\s*ON public\.investagon_intern/g)).toHaveLength(1);
    expect(ohneKommentare).toContain("public.is_admin_role(auth.uid())\n    OR public.has_role(auth.uid(), 'buchhaltung'::public.app_role)");
  });
});

describe("Eingangskorb", () => {
  it("hat die Prüfzeilen 88.1 bis 88.4, nur die letzte Zeile endet mit Semikolon", () => {
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    for (const nr of ["88.1", "88.2", "88.3", "88.4"]) expect(pruefung).toContain(`SELECT '${nr} `);
    expect(pruefung).toContain("'fehlt (20261005120000 ausfuehren)'");
    const schluss = pruefung.split("\n").filter((z) => !z.trim().startsWith("--") && z.trimEnd().endsWith(";"));
    expect(schluss).toHaveLength(1);
  });

  it("liegt, solange offen, unverändert im Korb, in der Sammeldatei und im README", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    if (!existsSync(korb)) return;
    expect(lies(korb)).toBe(SQL);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(SQL.trim());
    expect(lies("supabase/migrations-inbox/README.md")).toContain(`\`${DATEI}\``);
  });
});

describe("Eigenprovisionsvereinbarung: Objektrollen ja, Kunde nur mit Freigabe", () => {
  const EIGEN = { name: "Eigenprovisionsvereinbarung WE 3", url: "/investagon-dokument/o1/epv.pdf", kategorie: "intern" };

  it("wird an Titel oder Dateiname erkannt, nur bei Dateien aus Investagon", () => {
    expect(istInterneInvestagonUnterlage(EIGEN)).toBe(true);
    expect(istInterneInvestagonUnterlage({ name: "Anlage 3", url: "/investagon-dokument/o1/Eigenprovision_WE3.pdf" })).toBe(true);
    // Die Kategorie allein zählt nicht: Vor dem 24.09.2026 legte der Import jede Datei als „intern“ ab.
    expect(istInterneInvestagonUnterlage({ name: "Teilungserklärung", url: "/investagon-dokument/o1/te.pdf" })).toBe(false);
    expect(internVonHandAusZeile({ name: "Teilungserklärung", url: "/investagon-dokument/o1/te.pdf", kategorie: "intern" })).toBe(false);
    expect(istInterneInvestagonUnterlage({ name: "Eigenprovisionsvereinbarung", url: "/objekt-dokument/x.pdf" })).toBe(false);
  });

  it("geht ohne Freigabe nie zum Kunden, mit ausdrücklicher Freigabe schon", () => {
    expect(internVonHandAusZeile(EIGEN)).toBe(true);
    expect(darfZumKunden(freigabeDokumentAusZeile(EIGEN, "tabelle", "other_broker"))).toBe(false);
    expect(darfZumKunden(freigabeDokumentAusZeile({ ...EIGEN, name: "Grundriss Eigenprovisionsvereinbarung" }, "tabelle", "layout"))).toBe(false);
    expect(darfZumKunden(freigabeDokumentAusZeile({ ...EIGEN, kunden_freigabe: "frei" }, "tabelle", "other_broker"))).toBe(true);
    // Eine Freigabe aus meta.dokumente zählt nicht, die darf jede interne Rolle schreiben.
    expect(darfZumKunden(freigabeDokumentAusZeile({ ...EIGEN, kunden_freigabe: "frei" }, "meta", "other_broker"))).toBe(false);
  });

  it("ist nie ein Grundriss, auch nicht unter „Grundriss Eigenprovisionsvereinbarung“", () => {
    expect(grundrissStaerke({ name: "Grundriss Eigenprovisionsvereinbarung", dateiname: "epv.pdf", investagonKategorie: null })).toBe(0);
    expect(grundrissStaerke({ name: "Grundriss WE 3", dateiname: "gr.pdf", investagonKategorie: null })).toBe(3);
  });

  it("steht für Vertriebspartner und alle Objektrollen in den Unterlagen", () => {
    const dok = (id: string, teil: Partial<ObjektDokument>): ObjektDokument =>
      ({ id, name: id, url: `/objekt-dokument/${id}.pdf`, typ: "standard", kategorie: "objektunterlagen", sichtbar: true, ...teil });
    const eintraege = objektUnterlagenEintraege({ dokumente: [dok(EIGEN.name, { url: EIGEN.url, kategorie: "intern" })], meta: {} });
    expect(eintraege.map((e) => [e.name, e.kundeSieht])).toEqual([[EIGEN.name, false]]);
  });
});

describe("MORE Lotse: Eigenprovision ja, Vertriebsprovision nein", () => {
  it.each([
    "Wie hoch ist die Eigenprovision?",
    "Wie viel Prozent Eigenprovision bekommt der Käufer?",
    "Wann wird die Eigenprovision ausgezahlt?",
    "Welche Bedingungen hat die Eigenprovisionsvereinbarung?",
    "Kann der Kunde die Kaufnebenkosten über die Eigenprovision finanzieren?",
  ])("beantwortet: %s", (frage) => {
    expect(frageNachProvision(frage)).toBe(false);
  });

  it.each([
    "Welche Provision bekommt MORE Immo?",
    "Wie hoch ist die Innenprovision?",
    "Was verdient der Vertrieb an der Wohnung?",
    "Wie hoch ist die Courtage?",
    "Wie hoch ist mein Provisionssatz als Partner?",
    "Wie hoch ist die Eigenprovision und was verdient MORE Immo daran?",
    "Was zahlt der Bauträger an MOREImmo?",
  ])("sperrt weiter: %s", (frage) => {
    expect(frageNachProvision(frage)).toBe(true);
  });

  it("lässt die Eigenprovision in der Antwort stehen, nicht aber, was MORE Immo oder der Vertrieb bekommt", () => {
    expect(antwortNenntProvision("Laut Eigenprovisionsvereinbarung erhältst du eine Eigenprovision von 3 % des Kaufpreises. Sie wird nach Zahlung des Kaufpreises ausgezahlt.\nQUELLEN: Eigenprovisionsvereinbarung WE 3")).toBe(false);
    expect(antwortNenntProvision("MOREImmo zahlt dem Käufer eine Eigenprovision von 3.000 €.")).toBe(false);
    expect(antwortNenntProvision("MOREImmo erhält 6 % vom Kaufpreis, davon gehen 3 % als Eigenprovision an den Käufer.")).toBe(true);
    expect(antwortNenntProvision("Die Eigenprovision ist Teil der Innenprovision von 6 %.")).toBe(true);
    expect(antwortNenntProvision("Der Vertrieb erhält 6 % vom Kaufpreis.")).toBe(true);
  });

  it("wertet die Eigenprovisionsvereinbarung aus, Vertriebs- und Provisionsvereinbarungen weiter nicht", () => {
    expect(vorabGesperrt({ name: "Eigenprovisionsvereinbarung WE 3" })).toBe(false);
    expect(vorabGesperrt({ name: "Provisionsvereinbarung Bauträger" })).toBe(true);
    expect(vorabGesperrt({ name: "Vertriebsvereinbarung" })).toBe(true);
  });

  it("liest sie nur auf der Einheitenseite und nie die einer anderen Einheit", () => {
    const lotse = lies("supabase/functions/objekt-lotse/index.ts");
    expect(lotse).toContain("const eigenprovision = istInterneInvestagonUnterlage(zeile);");
    expect(lotse).toContain("if (eigenprovision ? !bezug.wohnungId || nenntFremdeEinheit(name, weNr) : zeile.kategorie === \"intern\" || internVonHandAusZeile(zeile)) continue;");
    // Seit Stufe 2 (05.10.2026) gehen gelbe Unterlagen in die Inhaltseinordnung, die Eigenprovision bleibt beim bisherigen Weg.
    expect(lotse).toContain('const gelberWeg = ampel !== "rot" && !eigenprovision && (ampel === "gelb" || "ausschluss" in einordnung);');
  });
});

describe("Rechner und KI-Objekttexte lesen keine internen Unterlagen", () => {
  it("der Rechner auf dem Server lässt sie weg", () => {
    const unterlagen = lies("supabase/functions/_shared/lotse-unterlagen.ts");
    expect(unterlagen).toContain('z.kategorie !== "intern"');
  });

  it("die KI-Objekttexte lassen sie weg", () => {
    const lauf = lies("supabase/functions/objekt-texte-ki/lauf.ts");
    expect(lauf.match(/\.filter\(nichtIntern\)/g)).toHaveLength(2);
  });
});
