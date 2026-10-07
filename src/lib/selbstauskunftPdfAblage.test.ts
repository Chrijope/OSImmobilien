import { describe, expect, it } from "vitest";
import {
  SA_PDF_HOECHSTGROESSE,
  aktuellerSaPdfPfad,
  base64ZuBytes,
  pruefeSaPdf,
  saPdfDateiname,
  saPdfFehlt,
  saPdfMetaPatch,
  saPdfPfad,
} from "../../supabase/functions/_shared/selbstauskunft-pdf-ablage.ts";
import { unterschriftenFuerPdf } from "./selbstauskunftPdfAblage";

const UNTERSCHRIEBEN = "2026-09-26T10:15:00.000Z";

describe("Ablageort der unterschriebenen Selbstauskunft", () => {
  it("liegt im Kundenordner des Investments, den der Kunde lesen, aber nicht ändern darf", () => {
    expect(saPdfPfad("k1", "i1", "x.pdf")).toBe("kundenordner/k1/i1/x.pdf");
  });

  it("trägt Namen und Tag der letzten Unterschrift im Dateinamen", () => {
    expect(saPdfDateiname("Max Müller", UNTERSCHRIEBEN)).toBe("Selbstauskunft_unterschrieben_Max_Müller_2026-09-26.pdf");
  });

  it("entfernt Zeichen, die im Speicherpfad stören", () => {
    expect(saPdfDateiname("A/B ../C", UNTERSCHRIEBEN)).toBe("Selbstauskunft_unterschrieben_AB_C_2026-09-26.pdf");
    expect(saPdfDateiname("", UNTERSCHRIEBEN)).toBe("Selbstauskunft_unterschrieben_Kunde_2026-09-26.pdf");
  });
});

describe("Gehört die Datei zur geltenden Unterschrift?", () => {
  const abgelegt = {
    saSigned: true,
    saSignedAt: UNTERSCHRIEBEN,
    saPdfPath: "kundenordner/k1/i1/x.pdf",
    saPdfUnterschriftAm: UNTERSCHRIEBEN,
  };

  it("ja, wenn sie zum Zeitpunkt der Unterschrift abgelegt wurde", () => {
    expect(aktuellerSaPdfPfad(abgelegt)).toBe("kundenordner/k1/i1/x.pdf");
    expect(saPdfFehlt(abgelegt)).toBe(false);
  });

  it("nein nach einer Korrektur, die die Unterschrift zurücksetzt", () => {
    const korrigiert = { ...abgelegt, saSigned: false, saSignedAt: null };
    expect(aktuellerSaPdfPfad(korrigiert)).toBeNull();
    // Solange nicht neu unterschrieben ist, fehlt auch nichts.
    expect(saPdfFehlt(korrigiert)).toBe(false);
  });

  it("nein nach einer neuen Unterschrift, dann fehlt die neue Datei", () => {
    const neu = { ...abgelegt, saSignedAt: "2026-10-01T08:00:00.000Z" };
    expect(aktuellerSaPdfPfad(neu)).toBeNull();
    expect(saPdfFehlt(neu)).toBe(true);
  });

  it("fehlt beim Bestand: unterschrieben, aber nur der alte Merker in saPdf", () => {
    expect(saPdfFehlt({ saSigned: true, saSignedAt: UNTERSCHRIEBEN })).toBe(true);
  });

  it("fehlt nicht, solange noch nicht alle unterschrieben haben", () => {
    expect(saPdfFehlt({ saSigned: false, saSignedAt: null })).toBe(false);
    expect(saPdfFehlt(null)).toBe(false);
  });
});

describe("Prüfung der nachgereichten Datei", () => {
  const pdf = new TextEncoder().encode("%PDF-1.3\n...");

  it("nimmt eine PDF an", () => {
    expect(pruefeSaPdf(pdf)).toEqual({ ok: true });
  });

  it("lehnt Leeres, Fremdes und Übergroßes ab", () => {
    expect(pruefeSaPdf(null).ok).toBe(false);
    expect(pruefeSaPdf(new Uint8Array())).toEqual({ ok: false, grund: "Leere Datei" });
    expect(pruefeSaPdf(new TextEncoder().encode("<html>"))).toEqual({ ok: false, grund: "Keine PDF-Datei" });
    const gross = new Uint8Array(SA_PDF_HOECHSTGROESSE + 1);
    gross.set(pdf);
    expect(pruefeSaPdf(gross)).toEqual({ ok: false, grund: "Datei zu groß" });
  });

  it("liest Base64 aus dem Browser und erkennt Unsinn", () => {
    const b64 = btoa("%PDF-1.3");
    expect(pruefeSaPdf(base64ZuBytes(b64))).toEqual({ ok: true });
    expect(base64ZuBytes("%%%kein base64%%%")).toBeNull();
  });
});

describe("Vermerk am Investment", () => {
  it("bindet die Datei an die Unterschrift und fasst docFileUrls nicht an", () => {
    const patch = saPdfMetaPatch(
      { saSigned: true, saSignedAt: UNTERSCHRIEBEN },
      { pfad: "kundenordner/k1/i1/x.pdf", dateiname: "x.pdf", jetzt: "2026-09-26T10:16:00.000Z" },
    );
    expect(patch).toEqual({
      saPdf: "x.pdf",
      saPdfPath: "kundenordner/k1/i1/x.pdf",
      saPdfUnterschriftAm: UNTERSCHRIEBEN,
      saPdfAbgelegtAm: "2026-09-26T10:16:00.000Z",
    });
    // Nach dem Vermerk gilt die Datei als aktuell.
    expect(aktuellerSaPdfPfad({ saSigned: true, saSignedAt: UNTERSCHRIEBEN, ...patch })).toBe("kundenordner/k1/i1/x.pdf");
  });
});

describe("Unterschriften für das PDF", () => {
  it("übernimmt Person 1 und Person 2 und liest die ältere Bezeichnung partner", () => {
    expect(unterschriftenFuerPdf({
      person1: { signatureData: "a", signedAt: "t1", name: "A" },
      partner: { signatureData: "b", signedAt: "t2" },
    })).toEqual({
      person1: { signatureData: "a", signedAt: "t1" },
      person2: { signatureData: "b", signedAt: "t2" },
    });
  });

  it("liefert ohne Unterschriften ein leeres Objekt", () => {
    expect(unterschriftenFuerPdf(undefined)).toEqual({});
  });
});
