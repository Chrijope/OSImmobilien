/**
 * Neue Fassung und zwei Personen bei der Selbstauskunft (26.09.2026, zweiter Teil).
 *
 * 1. Eine schon unterschriebene Selbstauskunft, die über einen neuen
 *    Ausfüll-Link neu abgegeben wird, muss mit den neuen Angaben UND der
 *    neuen Unterschrift als neues PDF am Investment liegen. Bis dahin wurde
 *    die neue Unterschrift übersprungen und der alte Abschluss blieb stehen.
 * 2. Bei zwei Personen ist die Selbstauskunft erst fertig, wenn beide die
 *    geltende Fassung unterschrieben haben. Ein Neuversand an eine Person
 *    löschte vorher die offene Anfrage der anderen.
 *
 * Die Regeln liegen in `supabase/functions/_shared/`. Die Edge Functions
 * lassen sich hier nicht ausführen; der Ablauf wird mit denselben Regeln
 * nachgestellt, und der Quelltext der Functions wird darauf geprüft, dass er
 * sie benutzt.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SA_PERSON_TYPEN,
  istSaPerson,
  saAufzuraeumendePersonTypen,
  saErwartetePersonen,
  saNeueFassungMetaPatch,
  saNeueUnterschriftAusstehend,
  saUnterschriftenStand,
  type SaAnfrage,
} from "../../supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts";
import {
  aktuellerSaPdfPfad,
  saFruehereDateien,
  saPdfDateinameNeueFassung,
  saPdfMetaPatch,
  saPdfPfad,
} from "../../supabase/functions/_shared/selbstauskunft-pdf-ablage.ts";

const ALT = "2026-09-26T08:00:00.000Z";
const NEU = "2026-09-26T14:30:05.000Z";
const SPAETER = "2026-09-26T16:00:00.000Z";

const MIT_P2 = { vorname: "Max", person2: true, person2Data: { vorname: "Erika", nachname: "Muster" } };
const OHNE_P2 = { vorname: "Max", person2: false, person2Data: { vorname: "" } };

function anfrage(u: Partial<SaAnfrage> & { person_type: string }): SaAnfrage {
  return { status: "pending", created_at: ALT, ...u };
}

/** So hinterlässt finalize-selbstauskunft eine abgeschlossene, abgelegte Selbstauskunft. */
function abgeschlossen(): Record<string, unknown> {
  const pfad = saPdfPfad("k1", "i1", "Selbstauskunft_unterschrieben_Max_Muster_2026-09-26.pdf");
  return {
    saSigned: true,
    saSignedAt: ALT,
    saSignaturePending: false,
    saData: { ...OHNE_P2, fassung: "alt" },
    saSignatures: { person1: { signatureData: "p1-alt", signedAt: ALT } },
    saPdf: "Selbstauskunft_unterschrieben_Max_Muster_2026-09-26.pdf",
    saPdfPath: pfad,
    saPdfUnterschriftAm: ALT,
    docStatuses: { Selbstauskunft: "approved" },
  };
}

describe("1. Neue Fassung über einen neuen Ausfüll-Link", () => {
  it("löst den alten Abschluss ab, bevor die neue Unterschrift gespeichert wird", () => {
    const vorher = abgeschlossen();
    const patch = saNeueFassungMetaPatch(vorher, NEU);
    expect(patch).toMatchObject({
      saSigned: false,
      saSignedAt: null,
      saPdf: null,
      saSignatures: {},
      saNeueUnterschriftSeit: NEU,
      docStatuses: { Selbstauskunft: "uploaded" },
    });
    expect((patch.saVorigeFassung as Record<string, unknown>).saPdfPath).toBe(vorher.saPdfPath);
    expect(saNeueUnterschriftAusstehend({ ...vorher, ...patch })).toBe(true);
  });

  it("lässt den ersten Ausfüll-Link ohne früheren Abschluss unberührt", () => {
    expect(saNeueFassungMetaPatch({ saSigned: false }, NEU)).toEqual({});
    expect(saNeueFassungMetaPatch(null, NEU)).toEqual({});
  });

  it("endet mit einem neuen PDF, das die neuen Angaben und die neue Unterschrift trägt, die alte Datei bleibt liegen", () => {
    // Ausgangslage: abgeschlossen, alte Unterschrift liegt in signature_requests.
    let meta = abgeschlossen();
    const anfragen: SaAnfrage[] = [
      anfrage({ person_type: "person1", status: "signed", created_at: ALT, signed_at: ALT, signature_data: "p1-alt", sa_data: { ...OHNE_P2, fassung: "alt" } }),
    ];

    // submit-sa-signature: erst die neue Fassung, dann die neue Unterschrift.
    meta = { ...meta, ...saNeueFassungMetaPatch(meta, NEU) };
    anfragen.push(anfrage({
      person_type: "person1", status: "signed", created_at: NEU, signed_at: NEU,
      signature_data: "p1-neu", sa_data: { ...OHNE_P2, fassung: "neu" },
    }));

    // finalize-selbstauskunft: zählt nur die neue Unterschrift.
    const stand = saUnterschriftenStand(anfragen, {
      fassungSeit: meta.saNeueUnterschriftSeit as string,
      erwartet: saErwartetePersonen({ ...OHNE_P2, fassung: "neu" }),
    });
    expect(stand.alleUnterschrieben).toBe(true);
    expect(stand.unterschriften.person1.signatureData).toBe("p1-neu");
    expect(stand.saData).toMatchObject({ fassung: "neu" });

    // Abschluss, wie finalize ihn schreibt.
    meta = { ...meta, saSigned: true, saSignedAt: NEU, saSignatures: stand.unterschriften, saData: stand.saData, saNeueUnterschriftSeit: null };
    // Die alte Datei gehört nicht zur neuen Unterschrift, also wird eine neue abgelegt.
    expect(aktuellerSaPdfPfad(meta)).toBeNull();

    // Ablage mit eigenem Namen: die alte Datei vom selben Tag wird nicht überschrieben.
    const dateiname = saPdfDateinameNeueFassung("Max Muster", NEU, saFruehereDateien(meta));
    const pfad = saPdfPfad("k1", "i1", dateiname);
    expect(dateiname).toBe("Selbstauskunft_unterschrieben_Max_Muster_2026-09-26_14-30-05.pdf");
    expect(pfad).not.toBe(abgeschlossen().saPdfPath);

    meta = { ...meta, ...saPdfMetaPatch(meta, { pfad, dateiname, jetzt: SPAETER }) };
    // Die Anzeige zeigt die neue Datei, die alte steht als Nachweis in saVorigeFassung.
    expect(aktuellerSaPdfPfad(meta)).toBe(pfad);
    expect((meta.saVorigeFassung as Record<string, unknown>).saPdfPath).toBe(abgeschlossen().saPdfPath);
    expect(saNeueUnterschriftAusstehend(meta)).toBe(false);
  });

  it("gibt ohne frühere Datei den gewohnten Namen und bei zwei Korrekturen am selben Tag zwei verschiedene", () => {
    expect(saPdfDateinameNeueFassung("Max Muster", NEU, [])).toBe("Selbstauskunft_unterschrieben_Max_Muster_2026-09-26.pdf");
    const erste = saPdfDateinameNeueFassung("Max Muster", NEU, ["kundenordner/k1/i1/Selbstauskunft_unterschrieben_Max_Muster_2026-09-26.pdf"]);
    const zweite = saPdfDateinameNeueFassung("Max Muster", SPAETER, [`kundenordner/k1/i1/${erste}`]);
    expect(zweite).not.toBe(erste);
    expect(zweite).not.toBe("Selbstauskunft_unterschrieben_Max_Muster_2026-09-26.pdf");
  });
});

describe("2. Zwei Personen: fertig erst, wenn beide die geltende Fassung unterschrieben haben", () => {
  it("erwartet Person 2 nur, wenn sie in der Selbstauskunft steht", () => {
    expect(saErwartetePersonen(MIT_P2)).toEqual(["person1", "person2"]);
    expect(saErwartetePersonen(OHNE_P2)).toEqual(["person1"]);
    expect(saErwartetePersonen({ person2: true, person2Data: { vorname: " " } })).toEqual(["person1"]);
    expect(saErwartetePersonen(null)).toEqual(["person1"]);
  });

  it("räumt beim Neuversand an Person 1 die offene Anfrage von Person 2 nicht ab", () => {
    expect(saAufzuraeumendePersonTypen(["person1"])).toEqual(["person1"]);
    expect(saAufzuraeumendePersonTypen(["person2"]).sort()).toEqual(["partner", "person2"]);
    expect(saAufzuraeumendePersonTypen(["person1", "person2"]).sort()).toEqual(["partner", "person1", "person2"]);
  });

  it("Neuversand an Person 1 lässt Person 2 offen, Abschluss erst mit beiden", () => {
    const erwartet = saErwartetePersonen(MIT_P2);
    // Beide Anfragen offen; Person 1 bekommt einen neuen Link, die alte Anfrage
    // von Person 1 fällt weg, die von Person 2 bleibt stehen.
    const anfragen: SaAnfrage[] = [
      anfrage({ person_type: "person2", created_at: ALT, sa_data: MIT_P2 }),
      anfrage({ person_type: "person1", created_at: NEU, sa_data: MIT_P2 }),
    ];
    // Person 1 unterschreibt.
    anfragen[1] = { ...anfragen[1], status: "signed", signed_at: SPAETER, signature_data: "p1" };
    let stand = saUnterschriftenStand(anfragen, { erwartet });
    expect(stand.alleUnterschrieben).toBe(false);
    expect(stand.anzahlGesamt).toBe(2);
    expect(stand.anzahlUnterschrieben).toBe(1);

    // Person 2 unterschreibt ebenfalls.
    anfragen[0] = { ...anfragen[0], status: "signed", signed_at: SPAETER, signature_data: "p2" };
    stand = saUnterschriftenStand(anfragen, { erwartet });
    expect(stand.alleUnterschrieben).toBe(true);
    expect(Object.keys(stand.unterschriften).sort()).toEqual(["person1", "person2"]);
  });

  it("schließt nicht ab, wenn die Anfrage von Person 2 ganz fehlt (Altfall des Neuversands)", () => {
    const stand = saUnterschriftenStand(
      [anfrage({ person_type: "person1", status: "signed", signed_at: NEU, signature_data: "p1", sa_data: MIT_P2 })],
      { erwartet: saErwartetePersonen(MIT_P2) },
    );
    expect(stand.alleUnterschrieben).toBe(false);
    expect(stand.fehlend).toEqual(["person2"]);
    expect(stand.anzahlGesamt).toBe(2);
  });

  it("zählt die ältere Bezeichnung partner als Person 2", () => {
    const stand = saUnterschriftenStand(
      [
        anfrage({ person_type: "person1", status: "signed", signed_at: NEU }),
        anfrage({ person_type: "partner", status: "signed", signed_at: NEU }),
      ],
      { erwartet: ["person1", "person2"] },
    );
    expect(stand.alleUnterschrieben).toBe(true);
  });

  it("nach einer inhaltlichen Korrektur müssen beide neu unterschreiben, die alte Unterschrift von Person 2 zählt nicht", () => {
    const erwartet = saErwartetePersonen(MIT_P2);
    const anfragen: SaAnfrage[] = [
      anfrage({ person_type: "person1", status: "signed", created_at: ALT, signed_at: ALT, signature_data: "p1-alt" }),
      anfrage({ person_type: "person2", status: "signed", created_at: ALT, signed_at: ALT, signature_data: "p2-alt" }),
      // Neue Fassung über den Ausfüll-Link: Person 1 unterschreibt sofort.
      anfrage({ person_type: "person1", status: "signed", created_at: NEU, signed_at: NEU, signature_data: "p1-neu", sa_data: MIT_P2 }),
    ];
    let stand = saUnterschriftenStand(anfragen, { fassungSeit: NEU, erwartet });
    expect(stand.alleUnterschrieben).toBe(false);
    expect(Object.keys(stand.unterschriften)).toEqual(["person1"]);

    // Person 2 bekommt ihren Link und unterschreibt die neue Fassung.
    anfragen.push(anfrage({ person_type: "person2", status: "signed", created_at: SPAETER, signed_at: SPAETER, signature_data: "p2-neu", sa_data: MIT_P2 }));
    stand = saUnterschriftenStand(anfragen, { fassungSeit: NEU, erwartet });
    expect(stand.alleUnterschrieben).toBe(true);
    expect(stand.unterschriften.person2.signatureData).toBe("p2-neu");
  });

  it("verhält sich ohne Zusatzregeln wie bisher (Bestand)", () => {
    const stand = saUnterschriftenStand([anfrage({ person_type: "person1", status: "signed", signed_at: ALT })]);
    expect(stand.alleUnterschrieben).toBe(true);
    expect(stand.fehlend).toEqual([]);
  });
});

describe("Die Functions benutzen die Regeln", () => {
  const submit = readFileSync("supabase/functions/submit-sa-signature/index.ts", "utf8");
  const finalize = readFileSync("supabase/functions/finalize-selbstauskunft/index.ts", "utf8");
  const senden = readFileSync("supabase/functions/send-signature-request/index.ts", "utf8");

  it("submit-sa-signature löst den alten Abschluss vor den Unterschriften ab und zählt Doppelte nur je Fassung", () => {
    const neueFassung = submit.indexOf("saNeueFassungMetaPatch(metaVorher, now)");
    // Seit 07.10.2026 speichert `sa_link_abschliessen` (Rueckfall ohne Migration: das Einfuegen im Code).
    const einfuegen = Math.min(
      submit.indexOf('supabase.rpc("sa_link_abschliessen"'),
      submit.search(/\.from\("signature_requests"\)\n\s+\.insert\(/),
    );
    expect(neueFassung).toBeGreaterThan(0);
    expect(einfuegen).toBeGreaterThan(neueFassung);
    // Seit 07.10.2026 steckt der Versand in `p2Nachfordern`, aufgerufen nach dem Abschluss.
    expect(submit.indexOf("const p2Mail = await p2Nachfordern(saDaten);")).toBeGreaterThan(neueFassung);
    // Seit Befund HB-004 je Fassung, nicht mehr über den Zeitpunkt des Links.
    expect(submit).toContain('.eq("meta->>saFassung", saFassung)');
    expect(submit).not.toContain('dupQuery.gte("created_at"');
  });

  it("finalize-selbstauskunft prüft Fassung und erwartete Personen, und fasst Abgeschlossenes nicht an", () => {
    expect(finalize).toContain("fassungSeit: fassungsMeta?.saNeueUnterschriftSeit ?? null");
    expect(finalize).toContain("erwartet: saErwartetePersonen(angabenDerFassung)");
    expect(finalize.indexOf("fassungsMeta.saSigned === true")).toBeLessThan(finalize.indexOf("PARTIAL:"));
    expect(finalize).toContain("saPdfDateinameNeueFassung(kundeName, meta.saSignedAt, saFruehereDateien(meta))");
  });

  it("send-signature-request löscht nur offene Anfragen der angeschriebenen Personen", () => {
    expect(senden).toContain('.in("person_type", saAufzuraeumendePersonTypen(empfaenger.map((p) => p.personType)))');
  });
  it("send-signature-request lehnt fremde personType ab, bevor etwas gelöscht, geschrieben oder versendet wird", () => {
    const pruefung = senden.indexOf("if (!istSaPerson(personType))");
    expect(pruefung).toBeGreaterThan(0);
    for (const schritt of ['.from("signature_requests")', "saAeltereFassungenUeberholen(supabase", ".delete()", ".insert(", "sendeVorlage(supabase"]) {
      expect(senden.indexOf(schritt), schritt).toBeGreaterThan(pruefung);
    }
  });
});

describe("Positivliste der Selbstauskunft-Personen", () => {
  it("lässt nur person1, person2 und partner zu", () => {
    expect([...SA_PERSON_TYPEN]).toEqual(["person1", "person2", "partner"]);
    for (const typ of SA_PERSON_TYPEN) expect(istSaPerson(typ), typ).toBe(true);
    for (const typ of ["rv_kaeufer1", "rv_kaeufer2", "kaeufer1", "vertrag", "bewerber", "", "Person1", " person1"]) {
      expect(istSaPerson(typ), typ).toBe(false);
    }
  });
});
