import { describe, expect, it, vi } from "vitest";
import {
  OBJEKT_DOKUMENTE_BUCKET,
  eimerFuerObjektDatei,
  investagonDokumentPfad,
  objektDokumentPfad,
  objektDokumentZeiger,
  resolveUnterlagenUrl,
  unterlageHerunterladen,
} from "./storage";

/** Ein Speicher, der so tut, als wäre er Supabase Storage. */
const signaturAufrufe: Array<{ bucket: string; pfad: string }> = [];
let signaturAntwort: { signedUrl?: string; error?: { message: string } } = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(pfad: string) {
            signaturAufrufe.push({ bucket, pfad });
            return { data: signaturAntwort.signedUrl ? { signedUrl: signaturAntwort.signedUrl } : null, error: signaturAntwort.error ?? null };
          },
          getPublicUrl(pfad: string) {
            return { data: { publicUrl: `https://x.test/storage/v1/object/public/${bucket}/${pfad}` } };
          },
        };
      },
    },
  },
}));

/**
 * Welche Datei in welchen Eimer gehört.
 *
 * Diese Entscheidung kann still falsch werden: Fällt ein Grundbuchauszug
 * versehentlich in den öffentlichen Eimer, merkt das niemand, denn er lässt
 * sich weiterhin öffnen. Landet umgekehrt ein Foto im geschützten Eimer,
 * bleibt das Exposé leer. Deshalb steht jede gewachsene Pfadform hier
 * ausdrücklich als Beispiel.
 */
describe("eimerFuerObjektDatei", () => {
  it("legt Objektunterlagen geschützt ab", () => {
    expect(eimerFuerObjektDatei("objekte/obj-1/dokumente/d1_Grundbuchauszug.pdf"))
      .toBe(OBJEKT_DOKUMENTE_BUCKET);
    expect(eimerFuerObjektDatei("objekte/obj-1/dokumente/extra_x_Teilungserklaerung.pdf"))
      .toBe(OBJEKT_DOKUMENTE_BUCKET);
    expect(eimerFuerObjektDatei("objekte/obj-1/dokumente/intern_y_Ankaufspreis.pdf"))
      .toBe(OBJEKT_DOKUMENTE_BUCKET);
  });

  it("lässt den Grundriss öffentlich, alle anderen Wohnungsunterlagen nicht", () => {
    // Der Grundriss ist die eine Ausnahme von "alle Dokumente geschützt",
    // so entschieden am 10.09.2026: Er ist Verkaufsunterlage wie die Fotos
    // und steht im öffentlichen Exposé, das ein Kunde ohne Anmeldung öffnet.
    expect(eimerFuerObjektDatei("objekte/obj-1/wohnungen/we-3/wd2_Grundriss.pdf"))
      .toBe("objekt-medien");
    // Die Nachbarn in derselben Liste bleiben geschützt. Diese Zeile hält die
    // Ausnahme klein: Sie darf nicht auf die ganze Wohnung durchschlagen.
    expect(eimerFuerObjektDatei("objekte/obj-1/wohnungen/we-3/wd7_Wirtschaftsplan.pdf"))
      .toBe("objekt-dokumente");
    expect(eimerFuerObjektDatei("objekte/obj-1/wohnungen/we-3/wd9_GBA.pdf"))
      .toBe("objekt-dokumente");
    // Eine Kennung, die nur zufällig so anfängt, ist kein Grundriss.
    expect(eimerFuerObjektDatei("objekte/obj-1/wohnungen/we-3/wd21_Sonstiges.pdf"))
      .toBe("objekt-dokumente");
  });

  it("legt Wohnungsunterlagen geschützt ab", () => {
    expect(eimerFuerObjektDatei("objekte/obj-1/wohnungen/we-3/wd6_Mietvertrag.pdf"))
      .toBe(OBJEKT_DOKUMENTE_BUCKET);
    expect(eimerFuerObjektDatei("objekte/obj-1/wohnungen/we-3/custom_z_Wirtschaftsplan.pdf"))
      .toBe(OBJEKT_DOKUMENTE_BUCKET);
  });

  it("lässt Objektbilder öffentlich", () => {
    expect(eimerFuerObjektDatei("objekte/obj-1/bilder/slide-1.jpg")).toBe("objekt-medien");
  });

  it("lässt Wohnungsbilder öffentlich, obwohl sie unter derselben Wohnung liegen", () => {
    expect(eimerFuerObjektDatei("objekte/obj-1/wohnungen/we-3/bilder/b1.jpg")).toBe("objekt-medien");
  });

  it("lässt die Marketing-Präfixe unangetastet", () => {
    expect(eimerFuerObjektDatei("expose/obj-1/expose.pdf")).toBe("objekt-medien");
    expect(eimerFuerObjektDatei("wohnungsexpose/obj-1/we-3/expose-WE3.pdf")).toBe("objekt-medien");
    expect(eimerFuerObjektDatei("objektfotos/investment/foo.jpg")).toBe("objekt-medien");
  });

  it("lässt Unbekanntes öffentlich, statt es still unerreichbar zu machen", () => {
    expect(eimerFuerObjektDatei("")).toBe("objekt-medien");
    expect(eimerFuerObjektDatei("objekte/obj-1")).toBe("objekt-medien");
    expect(eimerFuerObjektDatei("irgendwas/anderes.pdf")).toBe("objekt-medien");
  });

  it("stört sich nicht an einem führenden Schrägstrich", () => {
    expect(eimerFuerObjektDatei("/objekte/obj-1/dokumente/d1.pdf")).toBe(OBJEKT_DOKUMENTE_BUCKET);
  });
});

describe("Zeiger auf geschützte Objektunterlagen", () => {
  it("führt Pfad und Zeiger verlustfrei ineinander über", () => {
    const pfad = "objekte/obj-1/dokumente/d1_Grundbuchauszug.pdf";
    expect(objektDokumentPfad(objektDokumentZeiger(pfad))).toBe(pfad);
  });

  it("erkennt fremde Werte nicht als Zeiger", () => {
    expect(objektDokumentPfad("")).toBeNull();
    expect(objektDokumentPfad(null)).toBeNull();
    expect(objektDokumentPfad("https://x.supabase.co/storage/v1/object/public/objekt-medien/a.pdf")).toBeNull();
    expect(objektDokumentPfad("/investagon-dokument/obj-1/expose.pdf")).toBeNull();
    expect(objektDokumentPfad("objekte/obj-1/dokumente/d1.pdf")).toBeNull();
  });
});

/**
 * Was ein Betrachter sieht und was nicht.
 *
 * Die zweite Stelle, die still falsch werden kann: Ein nicht angemeldeter
 * Betrachter bekommt für eine geschützte Unterlage keine Adresse. Der Eintrag
 * muss dann verschwinden und darf nicht als toter Verweis stehen bleiben.
 * Öffentliche Bilder dürfen davon nicht berührt werden.
 */
describe("befristeteDokumentAdressen", () => {
  it("macht aus dem Zeiger eine befristete Adresse und lässt Öffentliches in Ruhe", async () => {
    signaturAntwort = { signedUrl: "https://x.test/sign/abc?token=1" };
    signaturAufrufe.length = 0;
    const { befristeteDokumentAdressen } = await import("./storage");
    const ergebnis = await befristeteDokumentAdressen([
      { name: "Grundbuchauszug", url: "/objekt-dokument/objekte/o1/dokumente/d1.pdf" },
      { name: "Objektbild", url: "https://x.test/storage/v1/object/public/objekt-medien/objekte/o1/bilder/b1.jpg" },
    ]);
    expect(ergebnis.map((e) => e.name)).toEqual(["Grundbuchauszug", "Objektbild"]);
    expect(ergebnis[0].url).toBe("https://x.test/sign/abc?token=1");
    expect(ergebnis[1].url).toBe("https://x.test/storage/v1/object/public/objekt-medien/objekte/o1/bilder/b1.jpg");
    // Nur die geschützte Datei braucht eine Signatur.
    expect(signaturAufrufe).toEqual([
      { bucket: "objekt-dokumente", pfad: "objekte/o1/dokumente/d1.pdf" },
    ]);
  });

  it("lässt den Eintrag weg, wenn keine Adresse zusteht", async () => {
    signaturAntwort = { error: { message: "not authorized" } };
    signaturAufrufe.length = 0;
    const { befristeteDokumentAdressen } = await import("./storage");
    const ergebnis = await befristeteDokumentAdressen([
      { name: "Teilungserklärung", url: "/objekt-dokument/objekte/o1/dokumente/d2.pdf" },
      { name: "Objektbild", url: "https://x.test/storage/v1/object/public/objekt-medien/objekte/o1/bilder/b1.jpg" },
    ]);
    expect(ergebnis.map((e) => e.name)).toEqual(["Objektbild"]);
  });
});

describe("hatGeschuetzteUnterlagen", () => {
  it("erkennt geschützte Unterlagen am Objekt und an der Einheit", async () => {
    const { hatGeschuetzteUnterlagen } = await import("./storage");
    expect(hatGeschuetzteUnterlagen({ dokumente: [], wohnungen: [] })).toBe(false);
    expect(hatGeschuetzteUnterlagen({
      dokumente: [{ url: "https://x.test/storage/v1/object/public/objekt-medien/a.pdf" }],
      wohnungen: [{ dokumente: [] }],
    })).toBe(false);
    expect(hatGeschuetzteUnterlagen({
      dokumente: [{ url: "/objekt-dokument/objekte/o1/dokumente/d1.pdf" }],
    })).toBe(true);
    expect(hatGeschuetzteUnterlagen({
      dokumente: [],
      wohnungen: [{ dokumente: [{ url: "/objekt-dokument/objekte/o1/wohnungen/w1/wd6.pdf" }] }],
    })).toBe(true);
  });
});

/*
 * Der Klick auf „Ansehen" tat bei Investagon-Unterlagen nichts, gemeldet von
 * Christian am 16.09.2026. Der Zeiger fiel durch alle Zweige und wurde im
 * falschen Eimer gesucht. Diese Tests halten beide fehlenden Wege fest.
 */
describe("investagonDokumentPfad", () => {
  it("erkennt den Zeiger des Imports", () => {
    expect(investagonDokumentPfad("/investagon-dokument/obj-1/energieausweis.pdf"))
      .toBe("obj-1/energieausweis.pdf");
  });

  it("verwechselt ihn nicht mit dem Zeiger der Objektunterlagen", () => {
    expect(investagonDokumentPfad("/objekt-dokument/obj-1/plan.pdf")).toBeNull();
    expect(objektDokumentPfad("/investagon-dokument/obj-1/plan.pdf")).toBeNull();
  });

  it("gibt bei leerem Pfad und fehlendem Wert null zurück", () => {
    expect(investagonDokumentPfad("/investagon-dokument/")).toBeNull();
    expect(investagonDokumentPfad("")).toBeNull();
    expect(investagonDokumentPfad(null)).toBeNull();
    expect(investagonDokumentPfad(undefined)).toBeNull();
  });
});

describe("resolveUnterlagenUrl: Fremdadressen", () => {
  /*
   * Investagon liefert in `files` direkte Adressen auf tool.investagon.com.
   * Die im Eimer `unterlagen` zu suchen ergibt nie etwas.
   */
  it("reicht eine vollständige Fremdadresse unverändert durch", async () => {
    const adresse = "https://tool.investagon.com/uploads/properties_files/abc123.pdf";
    await expect(resolveUnterlagenUrl(adresse)).resolves.toBe(adresse);
  });

  it("fasst eine Supabase-Adresse weiterhin an", async () => {
    const supa = "https://xxx.supabase.co/storage/v1/object/public/unterlagen/foo/bar.pdf";
    await expect(resolveUnterlagenUrl(supa)).resolves.not.toBe(supa);
  });
});

describe("unterlageHerunterladen", () => {
  /*
   * Das Attribut `download` wirkt nur bei gleicher Herkunft. Deshalb wird die
   * Datei aus dem Speicher erst geholt und dann unter ihrem Namen gespeichert.
   */
  it("holt eine geschützte Unterlage und speichert sie unter dem lesbaren Namen", async () => {
    signaturAntwort = { signedUrl: "https://x.test/storage/v1/object/sign/objekt-dokumente/a.pdf?token=t" };
    const holen = vi.fn(async () => new Response(new Blob(["%PDF"]), { status: 200 }));
    vi.stubGlobal("fetch", holen);
    // jsdom kennt beides nicht; danach wird der alte Zustand wiederhergestellt.
    const vorher = { erzeugen: URL.createObjectURL, freigeben: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => "blob:datei");
    URL.revokeObjectURL = vi.fn();
    const geklickt: Array<{ href: string; download: string }> = [];
    const klick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      geklickt.push({ href: this.href, download: this.download });
    });
    const oeffnen = vi.spyOn(window, "open").mockImplementation(() => null);

    expect(await unterlageHerunterladen("/objekt-dokument/objekte/o1/dokumente/a.pdf", "Teilungserklärung.pdf")).toBe(true);
    expect(holen).toHaveBeenCalledWith("https://x.test/storage/v1/object/sign/objekt-dokumente/a.pdf?token=t");
    expect(geklickt).toEqual([{ href: "blob:datei", download: "Teilungserklärung.pdf" }]);
    expect(oeffnen).not.toHaveBeenCalled();

    klick.mockRestore();
    oeffnen.mockRestore();
    URL.createObjectURL = vorher.erzeugen;
    URL.revokeObjectURL = vorher.freigeben;
    vi.unstubAllGlobals();
  });

  it("öffnet eine Datei auf einem fremden Server im neuen Tab, ihren Inhalt gibt er nicht heraus", async () => {
    const holen = vi.fn();
    vi.stubGlobal("fetch", holen);
    const oeffnen = vi.spyOn(window, "open").mockImplementation(() => null);

    expect(await unterlageHerunterladen("https://tool.investagon.com/f/a.pdf", "a.pdf")).toBe(true);
    expect(oeffnen).toHaveBeenCalledWith("https://tool.investagon.com/f/a.pdf", "_blank", "noopener,noreferrer");
    expect(holen).not.toHaveBeenCalled();

    oeffnen.mockRestore();
    vi.unstubAllGlobals();
  });

  it("meldet false, wenn sich keine Adresse erzeugen lässt", async () => {
    signaturAntwort = { error: { message: "Object not found" } };
    const oeffnen = vi.spyOn(window, "open").mockImplementation(() => null);
    expect(await unterlageHerunterladen("/objekt-dokument/objekte/o1/dokumente/weg.pdf", "weg.pdf")).toBe(false);
    expect(oeffnen).not.toHaveBeenCalled();
    oeffnen.mockRestore();
  });
});
