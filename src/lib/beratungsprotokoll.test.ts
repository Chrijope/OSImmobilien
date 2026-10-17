import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  BERATUNGSPROTOKOLL_VORLAGE, entwurfErgaenzen, feldSetzen, istBeratungsprotokoll, offenePflichtfelder,
  protokollStatus, TEXTE, vorbelegen, type CrmQuellen,
} from "./beratungsprotokoll";
import { erzeugeBeratungsprotokollPdf } from "./beratungsprotokollPdf";

// Schrift und Logo kommen im Test nicht aus dem Netz, das PDF entsteht mit Helvetica.
vi.stubGlobal("fetch", () => Promise.reject(new Error("kein Netz im Test")));

const quellen: CrmQuellen = {
  kunde: { vorname: "Max", nachname: "Mustermann", strasse: "Beispielweg", hausnummer: "1", plz: "10115", ort: "Berlin", quelle: "Empfehlung", berater: "Beispiel Partner", erstgespraechDatum: "05.08.2026" },
  person2: { vorname: "Erika", nachname: "Mustermann" },
  objekt: { strasse: "Musterallee 12", plz: "04109", ort: "Leipzig", weNr: "5", kaufpreis: 249000, wohnflaeche: 62, etage: "2. OG" },
  stellplatz: { art: "garage", nr: "G22" },
  mieter: { kaltmiete: 760 },
  nutzerName: "Angemeldeter Nutzer",
  heute: "2026-10-17",
};

describe("Vorausfüllung aus dem CRM", () => {
  it("übernimmt Käufer, zweite Person, Objekt, Garage und Mieter", () => {
    const d = vorbelegen(quellen);
    expect(d.vorlage).toBe(BERATUNGSPROTOKOLL_VORLAGE);
    expect(d.kaeuferName).toBe("Max Mustermann");
    expect(d.kaeuferAnschrift).toBe("Beispielweg 1, 10115 Berlin");
    expect(d.weitereKaeufer).toBe("Erika Mustermann");
    expect(d.objektAdresse).toBe("Musterallee 12, 04109 Leipzig");
    expect(d.objektLage).toBe("2. OG");
    expect(d.einheitNr).toBe("5");
    expect(d.groesse).toBe("62");
    expect(d.verkaufspreis).toBe("249.000,00");
    expect(d.kaufangebot).toBe("249.000,00");
    expect(d.stellplatz).toBe("Garage G22");
    expect(d.mietverhaeltnis).toBe("vermietet");
    expect(d.nettokaltmiete).toBe("760,00");
    expect(d.vertriebDurch).toBe("Beispiel Partner");
    expect(d.erstgespraechDatum).toBe("2026-08-05");
    expect(d.datum).toBe("2026-10-17");
    expect(d.vorausgefuellt).toContain("kaeuferName");
    // Datum der Unterzeichnung ist ein Vorschlag, keine CRM-Angabe.
    expect(d.vorausgefuellt).not.toContain("datum");
  });

  it("erfindet nichts: ohne Angaben bleiben die Felder leer", () => {
    const d = vorbelegen({ kunde: {}, objekt: {}, heute: "2026-10-17" });
    expect(d.kaeuferName).toBe("");
    expect(d.verkaufspreis).toBe("");
    expect(d.stellplatz).toBe("");
    expect(d.mietverhaeltnis).toBe("");
    expect(d.nutzung).toBe("");
    expect(d.besichtigung).toBe("");
    expect(d.vorausgefuellt).toEqual([]);
  });

  it("nimmt den angemeldeten Nutzer, wenn am Kontakt kein Berater steht", () => {
    expect(vorbelegen({ ...quellen, kunde: { ...quellen.kunde, berater: "" } }).vertriebDurch).toBe("Angemeldeter Nutzer");
  });
});

describe("Entwurf", () => {
  it("behält Eingaben und ergänzt nur leere Felder aus dem CRM", () => {
    const crm = vorbelegen(quellen);
    let entwurf = feldSetzen(vorbelegen({ kunde: {}, objekt: {}, heute: "2026-10-01" }), "kaeuferName", "Max M. Mustermann");
    entwurf = feldSetzen(entwurf, "nutzung", "vermietung");
    const d = entwurfErgaenzen(entwurf, crm);
    expect(d.kaeuferName).toBe("Max M. Mustermann");
    expect(d.nutzung).toBe("vermietung");
    expect(d.stellplatz).toBe("Garage G22");
    expect(d.vorausgefuellt).toContain("stellplatz");
    expect(d.vorausgefuellt).not.toContain("kaeuferName");
    expect(d.datum).toBe("2026-10-01");
  });

  it("nimmt einen fremden oder alten Entwurf nicht als Protokoll", () => {
    const crm = vorbelegen(quellen);
    expect(entwurfErgaenzen({ kaeuferName: "Alt" } as never, crm)).toBe(crm);
    expect(istBeratungsprotokoll({ leistungen: { mieterwechsel: true } })).toBe(false);
  });

  it("eine Änderung nimmt die Markierung „aus dem CRM“ weg", () => {
    const d = feldSetzen(vorbelegen(quellen), "einheitNr", "6");
    expect(d.einheitNr).toBe("6");
    expect(d.vorausgefuellt).not.toContain("einheitNr");
  });
});

describe("Pflichtangaben", () => {
  it("verlangt Nutzung, Besichtigung, Mietverhältnis und Ort", () => {
    const d = vorbelegen(quellen);
    expect(offenePflichtfelder(d)).toEqual(["Art der Nutzung", "Besichtigung", "Ort der Unterzeichnung"]);
    const fertig = { ...d, nutzung: "vermietung" as const, besichtigung: "beauftragt" as const, ort: "Leipzig" };
    expect(offenePflichtfelder(fertig)).toEqual(["Name der/des Beauftragten"]);
    expect(offenePflichtfelder({ ...fertig, beauftragter: "Anna Muster" })).toEqual([]);
  });
});

describe("Stand am Investment", () => {
  it("wie bisher: frei ab dem Notartermin, danach nach Unterschriften", () => {
    expect(protokollStatus({}, undefined, "2026-10-17")).toBe("gesperrt");
    expect(protokollStatus({}, "2026-10-18", "2026-10-17")).toBe("gesperrt");
    expect(protokollStatus({}, "17.10.2026", "2026-10-17")).toBe("offen");
    expect(protokollStatus({ vpSignedAt: "x" }, "2026-10-01", "2026-10-17")).toBe("wartet_auf_kunde");
    expect(protokollStatus({ kundeSignedAt: "x" }, "2026-10-01", "2026-10-17")).toBe("abgeschlossen");
  });
});

describe("PDF", () => {
  it("enthält alle 17 Abschnitte und die eingesetzten Werte", async () => {
    const d = { ...vorbelegen(quellen), nutzung: "vermietung" as const, besichtigung: "selbst" as const, ort: "Leipzig" };
    const doc = await erzeugeBeratungsprotokollPdf(d);
    const roh = doc.output();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    for (const titel of ["Angaben zum K", "Objektdaten", "Erwerbsnebenkosten", "Art der Nutzung", "Haftungsregelung", "Ablauf der Beratung", "Schlussbest"]) {
      expect(roh, titel).toContain(titel);
    }
    for (const wert of ["Max Mustermann", "Musterallee 12", "Garage G22", "Beispiel Partner", "Leipzig, 17.10.2026"]) {
      expect(roh, wert).toContain(wert);
    }
  });

  it("setzt die Unterschriften ein", async () => {
    // 1×1 Pixel PNG
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const doc = await erzeugeBeratungsprotokollPdf(vorbelegen(quellen), {
      vp: { name: "Beispiel Partner", signatureData: png, signedAt: "2026-10-17T10:00:00Z" },
      kunde: { name: "Max Mustermann", signatureData: png, signedAt: "2026-10-17T11:00:00Z" },
    });
    expect(doc.output()).toContain("/Subtype /Image");
    expect(doc.output()).toContain("Elektronisch unterschrieben am");
  });

  it("duzt in der Einleitung und hat keine Gedankenstriche", () => {
    expect(TEXTE.einleitung).toContain("mit dir geführten");
    expect(TEXTE.einleitung).toContain("Bitte lies");
    const alle = JSON.stringify(TEXTE);
    expect(alle).not.toMatch(/\s[–—]\s/);
    expect(alle).not.toMatch(/\bSie\b|\bIhnen\b/);
  });
});

describe("Signaturablauf", () => {
  it("Signaturseite schickt das fertige PDF mit der Kundenunterschrift", () => {
    const seite = readFileSync("src/pages/SignaturSeite.tsx", "utf8");
    expect(seite).toMatch(/phase: "kunde", signature: signatureData, signerName: request\.name, \.\.\.\(protokollPdfBase64 \? \{ pdfBase64: protokollPdfBase64 \}/);
  });

  it("die Function erkennt das Protokoll an derselben Vorlagenkennung und legt das PDF ab", () => {
    const fn = readFileSync("supabase/functions/finalize-aftersales-beratung/index.ts", "utf8");
    expect(fn).toContain(`vorlage === "${BERATUNGSPROTOKOLL_VORLAGE}"`);
    expect(fn).toMatch(/pdfAusBase64\(pdfBase64\)/);
    expect(fn).toContain('startsWith("%PDF-")');
  });
});
