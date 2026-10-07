/**
 * Welche Unterschrift unter der Selbstauskunft gilt (26.09.2026).
 *
 * Nach einer Korrektur einer schon unterschriebenen Selbstauskunft blieb der
 * Merker „liegt vor“ (`saPdf`) stehen, und das Kundenprofil zeigte die
 * Selbstauskunft weiter als erledigt, obwohl die neue Unterschrift fehlte.
 * Außerdem mischte `finalize-selbstauskunft` die alten Unterschriften unter
 * die neue Fassung. Die Regel liegt in
 * `supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts` und
 * wird von Server und Oberfläche gleichermaßen gelesen.
 */
import { describe, it, expect } from "vitest";
import {
  geltendeSaAnfragen,
  saGeltendeUnterschriftenAusMeta,
  saKorrekturMetaPatch,
  saNeueUnterschriftAusstehend,
  saUnterschriftenStand,
  type SaAnfrage,
} from "../../supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts";
import { objektauswahlFreigeschaltet } from "./investmentFreischaltung";
import { stufeErreicht } from "./pipelineStufen";

const ALT = "2026-09-01T08:00:00.000Z";
const NEU = "2026-09-20T08:00:00.000Z";
const JETZT = "2026-09-26T10:00:00.000Z";

function anfrage(u: Partial<SaAnfrage> & { person_type: string }): SaAnfrage {
  return { status: "pending", created_at: NEU, ...u };
}

/** Zwei Personen haben am 01.09. unterschrieben, am 20.09. kam die Korrektur. */
function nachKorrektur(): SaAnfrage[] {
  return [
    anfrage({ person_type: "person1", status: "signed", created_at: ALT, signature_data: "p1-alt", sa_data: { fassung: "alt" } }),
    anfrage({ person_type: "person2", status: "signed", created_at: ALT, signature_data: "p2-alt", sa_data: { fassung: "alt" } }),
    anfrage({ person_type: "person1", status: "pending", created_at: NEU, sa_data: { fassung: "neu" } }),
    anfrage({ person_type: "person2", status: "pending", created_at: NEU, sa_data: { fassung: "neu" } }),
  ];
}

describe("geltendeSaAnfragen", () => {
  it("nimmt je Person nur die jüngste Anfrage", () => {
    const geltend = geltendeSaAnfragen(nachKorrektur());
    expect(geltend).toHaveLength(2);
    expect(geltend.every((r) => r.created_at === NEU)).toBe(true);
  });

  it("verträgt eine leere oder fehlende Liste", () => {
    expect(geltendeSaAnfragen([])).toEqual([]);
    expect(geltendeSaAnfragen(null)).toEqual([]);
  });

  it("nimmt bei gleichem oder fehlendem Datum die spätere in der Liste", () => {
    const geltend = geltendeSaAnfragen([
      anfrage({ person_type: "person1", created_at: null, signature_data: "erste" }),
      anfrage({ person_type: "person1", created_at: null, signature_data: "zweite" }),
    ]);
    expect(geltend[0].signature_data).toBe("zweite");
  });
});

describe("saUnterschriftenStand nach einer Korrektur", () => {
  it("zählt die alten Unterschriften nicht mit", () => {
    const stand = saUnterschriftenStand(nachKorrektur());
    expect(stand.alleUnterschrieben).toBe(false);
    expect(stand.unterschriften).toEqual({});
    expect(stand.anzahlGesamt).toBe(2);
    expect(stand.anzahlUnterschrieben).toBe(0);
  });

  it("mischt beim Teilstand keine alte Unterschrift von Person 2 dazu", () => {
    const anfragen = nachKorrektur();
    anfragen[2] = { ...anfragen[2], status: "signed", signature_data: "p1-neu", signed_at: JETZT };
    const stand = saUnterschriftenStand(anfragen);
    expect(stand.alleUnterschrieben).toBe(false);
    expect(Object.keys(stand.unterschriften)).toEqual(["person1"]);
    expect(stand.unterschriften.person1.signatureData).toBe("p1-neu");
  });

  it("ist erst fertig, wenn alle die neue Fassung unterschrieben haben, und liefert deren Angaben", () => {
    const anfragen = nachKorrektur();
    anfragen[2] = { ...anfragen[2], status: "signed", signature_data: "p1-neu" };
    anfragen[3] = { ...anfragen[3], status: "signed", signature_data: "p2-neu" };
    const stand = saUnterschriftenStand(anfragen);
    expect(stand.alleUnterschrieben).toBe(true);
    expect(stand.unterschriften.person1.signatureData).toBe("p1-neu");
    expect(stand.unterschriften.person2.signatureData).toBe("p2-neu");
    expect(stand.saData).toEqual({ fassung: "neu" });
  });

  it("gilt ohne Anfragen nicht als unterschrieben", () => {
    expect(saUnterschriftenStand([]).alleUnterschrieben).toBe(false);
  });

  it("verhält sich ohne Korrektur wie bisher", () => {
    const stand = saUnterschriftenStand([
      anfrage({ person_type: "person1", status: "signed", signature_data: "p1" }),
    ]);
    expect(stand.alleUnterschrieben).toBe(true);
    expect(stand.anzahlGesamt).toBe(1);
  });
});

describe("saKorrekturMetaPatch", () => {
  it("setzt einen fertigen Abschluss zurück und hebt ihn auf", () => {
    const patch = saKorrekturMetaPatch({
      saSigned: true,
      saSignedAt: ALT,
      saPdf: "Selbstauskunft_Anna.pdf",
      saPdfPath: "kundenordner/k1/i1/Selbstauskunft_Anna.pdf",
      saPdfUnterschriftAm: ALT,
      saSignatures: { person1: { signatureData: "p1-alt" } },
    }, JETZT);
    expect(patch.saPdf).toBeNull();
    expect(patch.saSignatures).toEqual({});
    expect(patch.saSignaturePartial).toBe(false);
    expect(patch.saNeueUnterschriftSeit).toBe(JETZT);
    expect(patch.saVorigeFassung).toMatchObject({
      saPdf: "Selbstauskunft_Anna.pdf",
      saPdfPath: "kundenordner/k1/i1/Selbstauskunft_Anna.pdf",
      saSignedAt: ALT,
      abgeloestAm: JETZT,
    });
  });

  it("räumt auch die hochgeladene Papier-Selbstauskunft ab, die neue Fassung geht vor", () => {
    const patch = saKorrekturMetaPatch({ saPdf: "scan.pdf", saPapierUpload: "selbstauskunft-papier/k1/i1/scan.pdf" }, JETZT);
    expect(patch.saPapierUpload).toBeNull();
    expect((patch.saVorigeFassung as Record<string, unknown>).saPapierUpload).toBe("selbstauskunft-papier/k1/i1/scan.pdf");
  });

  it("lässt den ersten Versand und einen neuen Link zu einer offenen Anfrage unberührt", () => {
    expect(saKorrekturMetaPatch({}, JETZT)).toEqual({});
    expect(saKorrekturMetaPatch({ saSigned: false, saSignaturePending: true, saNeueUnterschriftSeit: ALT }, JETZT)).toEqual({});
    expect(saKorrekturMetaPatch(null, JETZT)).toEqual({});
  });
});

describe("saNeueUnterschriftAusstehend", () => {
  it("erkennt den Vermerk, den der Versand nach einer Korrektur setzt", () => {
    expect(saNeueUnterschriftAusstehend({ saSigned: false, saSignaturePending: true, saNeueUnterschriftSeit: JETZT })).toBe(true);
  });

  it("lässt den Bestand vor dem 26.09.2026 unverändert (Entscheidung Christian)", () => {
    expect(saNeueUnterschriftAusstehend({ saSigned: false, saSignedAt: null, saSignaturePending: true, saPdf: "SA_k1_i1_1.pdf" })).toBe(false);
  });

  it("gilt nicht, sobald wieder unterschrieben ist", () => {
    expect(saNeueUnterschriftAusstehend({ saSigned: true, saNeueUnterschriftSeit: JETZT, saPdf: "x.pdf" })).toBe(false);
  });

  it("gilt nicht für den ersten Versand ohne früheren Abschluss", () => {
    expect(saNeueUnterschriftAusstehend({ saSigned: false, saSignaturePending: true })).toBe(false);
    expect(saNeueUnterschriftAusstehend(null)).toBe(false);
  });

  it("gilt nicht für die hochgeladene Papier-Selbstauskunft", () => {
    expect(saNeueUnterschriftAusstehend({
      saSigned: false, saSignaturePending: true, saPdf: "scan.pdf", saPapierUpload: "selbstauskunft-papier/k1/i1/scan.pdf",
    })).toBe(false);
  });

  it("gilt nicht für einen normalen Abschluss", () => {
    expect(saNeueUnterschriftAusstehend({ saSigned: true, saSignaturePending: false, saPdf: "x.pdf" })).toBe(false);
  });
});

describe("saGeltendeUnterschriftenAusMeta", () => {
  it("lässt die Unterschriften im Bestand unverändert (Entscheidung Christian)", () => {
    const sigs = { person1: { signatureData: "p1-alt" } };
    expect(saGeltendeUnterschriftenAusMeta({
      saSigned: false, saSignaturePending: true, saPdf: "alt.pdf", saSignatures: sigs,
    })).toEqual(sigs);
  });

  it("behält nach dem Zurücksetzen die Unterschriften zur neuen Fassung", () => {
    const sigs = { person1: { signatureData: "p1-neu", signedAt: JETZT, name: "Anna" } };
    expect(saGeltendeUnterschriftenAusMeta({ saSigned: false, saNeueUnterschriftSeit: JETZT, saSignatures: sigs })).toEqual(sigs);
  });

  it("gibt bei einem normalen Stand die Unterschriften unverändert zurück", () => {
    const sigs = { person1: { signatureData: "p1", signedAt: ALT, name: "Anna" } };
    expect(saGeltendeUnterschriftenAusMeta({ saSigned: true, saSignatures: sigs })).toEqual(sigs);
    expect(saGeltendeUnterschriftenAusMeta({})).toEqual({});
    expect(saGeltendeUnterschriftenAusMeta({ saSignatures: [] })).toEqual({});
  });
});

describe("Ablauf: Abschluss, Korrektur, neue Unterschrift", () => {
  it("zeigt zwischen Korrektur und neuer Unterschrift „ausstehend“ und danach wieder erledigt", () => {
    // 1. Abgeschlossen, wie finalize-selbstauskunft es hinterlässt.
    let meta: Record<string, unknown> = {
      saSigned: true, saSignedAt: ALT, saSignaturePending: false, saPdf: "SA.pdf", saPdfPath: "kundenordner/k1/i1/SA.pdf",
      saPdfUnterschriftAm: ALT, saSignatures: { person1: { signatureData: "p1-alt" } }, docStatuses: { Selbstauskunft: "approved" },
    };
    expect(saNeueUnterschriftAusstehend(meta)).toBe(false);

    // 2. Korrektur geht neu zur Unterschrift, wie send-signature-request es schreibt.
    meta = { ...meta, ...saKorrekturMetaPatch(meta, JETZT), saSigned: false, saSignedAt: null, saSignaturePending: true };
    expect(saNeueUnterschriftAusstehend(meta)).toBe(true);
    expect(meta.saPdf).toBeNull();
    expect(saGeltendeUnterschriftenAusMeta(meta)).toEqual({});

    // 3. Alle haben neu unterschrieben, wie finalize-selbstauskunft es schreibt.
    meta = { ...meta, saSigned: true, saSignedAt: NEU, saSignaturePending: false, saNeueUnterschriftSeit: null, saPdf: "SA_neu.pdf" };
    expect(saNeueUnterschriftAusstehend(meta)).toBe(false);
  });
});

describe("Die Freischaltung der Objektauswahl bleibt bei laufenden Vorgängen", () => {
  it("offen, wenn der Vorgang schon auf Objektauswahl oder weiter steht", () => {
    for (const stufe of ["objektauswahl", "reservierung", "bonitaetsunterlagen", "notar"]) {
      expect(objektauswahlFreigeschaltet({ saLiegtVor: false, stufeErreicht: stufeErreicht(stufe, "objektauswahl") })).toBe(true);
    }
  });

  it("gesperrt, wenn der Vorgang noch vor der Objektauswahl steht und keine gültige Selbstauskunft vorliegt", () => {
    expect(objektauswahlFreigeschaltet({ saLiegtVor: false, stufeErreicht: stufeErreicht("selbstauskunft", "objektauswahl") })).toBe(false);
  });
});
