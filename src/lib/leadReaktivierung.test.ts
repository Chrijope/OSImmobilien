/**
 * M16 vom 04.10.2026, mit der Gegenpruefung vom selben Tag: Fragt ein
 * archivierter oder verlorener Kontakt neu an, wird er wieder aktiv. Nie
 * ueber die Kaufphase hinweg und nie zu einem anderen Partner.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { istOffenerPoolLead } from "@/lib/leadPool";
import { describeActivityAction } from "@/lib/activityLog";
import {
  istInKaufphase,
  istRuhenderKontakt,
  reaktivierungFuerAnfrage,
  zustaendigNachReaktivierung,
} from "../../supabase/functions/_shared/lead-zuordnung.ts";

const JETZT = "2026-10-04T10:00:00.000Z";

describe("istRuhenderKontakt", () => {
  it("erkennt archivierte und verlorene Kontakte", () => {
    expect(istRuhenderKontakt({ archiviert: true, status: "neu", meta: {} })).toBe(true);
    expect(istRuhenderKontakt({ archiviert: false, status: "verloren", meta: {} })).toBe(true);
    expect(istRuhenderKontakt({ archiviert: false, status: "kontaktiert", meta: { pipelineStufe: "verloren" } })).toBe(true);
  });

  it("lässt aktive Kontakte und Kunden mit Abschluss in Ruhe", () => {
    expect(istRuhenderKontakt({ archiviert: false, status: "kontaktiert", meta: { pipelineStufe: "beratungsgespraech" } })).toBe(false);
    expect(istRuhenderKontakt({ archiviert: true, status: "kunde", meta: {} })).toBe(false);
  });
});

describe("istInKaufphase", () => {
  it("sperrt Kontakt oder Investment ab Reservierung, auch abgeschlossen", () => {
    expect(istInKaufphase({ pipelineStufe: "reservierung" }, [])).toBe(true);
    expect(istInKaufphase({ pipelineStufe: "verloren" }, [{ meta: { pipelineStufe: "abgeschlossen" } }])).toBe(true);
    expect(istInKaufphase({ pipelineStufe: "verloren" }, [{ meta: { pipelineStufe: "bonitaetsunterlagen" } }])).toBe(true);
  });

  it("lässt leere, verlorene und frühe Stufen zu", () => {
    expect(istInKaufphase({}, [])).toBe(false);
    expect(istInKaufphase({ pipelineStufe: "verloren" }, [{ meta: { pipelineStufe: "erstgespraech" } }])).toBe(false);
    expect(istInKaufphase({ pipelineStufe: "objektauswahl" }, [])).toBe(false);
  });
});

describe("zustaendigNachReaktivierung", () => {
  it("behält den bisherigen Zuständigen, auch gegen einen fremden Partnerlink", () => {
    expect(zustaendigNachReaktivierung({ bisherId: "b", bisherGueltig: true, linkInhaberId: "a" })).toBe("b");
  });

  it("gibt einen gesperrten oder rollenlosen Zuständigen an den Pool ab", () => {
    expect(zustaendigNachReaktivierung({ bisherId: "b", bisherGueltig: false, linkInhaberId: "a" })).toBeNull();
  });

  it("nimmt ohne Zuständigen nur den geprüften Linkinhaber", () => {
    expect(zustaendigNachReaktivierung({ bisherId: null, bisherGueltig: true, linkInhaberId: "a" })).toBe("a");
    expect(zustaendigNachReaktivierung({ bisherId: null, bisherGueltig: true, linkInhaberId: null })).toBeNull();
  });
});

describe("reaktivierungFuerAnfrage", () => {
  const bisher = {
    archiviert: true,
    status: "verloren",
    zustaendig_id: "b",
    berater: "Partner B",
    meta: {
      pipelineStufe: "verloren",
      verlorenGrund: "kein_interesse",
      nichtErreichtCount: 6,
      leadTyp: "meta",
      eskalationGesendet: { neuer_lead: "2026-09-01" },
      beraterHistorie: [{ name: "Partner B", von: "2026-08-01" }],
      reaktiviertAus: [{ am: "2026-09-01" }],
    },
  };

  it("lässt die Zuständigkeit stehen, wenn sie gleich bleibt", () => {
    const { spalten, metaPatch } = reaktivierungFuerAnfrage({
      bisher, zustaendigNeu: "b", beraterNameNeu: "Partner B", pipelineStufe: "zugewiesen", leadTyp: "meta", jetzt: JETZT,
    });
    expect(spalten).toEqual({ archiviert: false, status: "neu" });
    expect(metaPatch).not.toHaveProperty("beraterHistorie");
    expect(metaPatch.offenerLead).toBe(false);
  });

  it("setzt Kontaktversuche und Eskalationsmarken zurück und hängt reaktiviertAus an", () => {
    const { metaPatch } = reaktivierungFuerAnfrage({
      bisher, zustaendigNeu: "b", beraterNameNeu: "Partner B", pipelineStufe: "zugewiesen", leadTyp: "meta", jetzt: JETZT,
    });
    expect(metaPatch.nichtErreichtCount).toBe(0);
    expect(metaPatch.eskalationGesendet).toEqual({});
    expect(metaPatch.eskalationFinalGesendet).toEqual({});
    const aus = metaPatch.reaktiviertAus as Array<Record<string, unknown>>;
    expect(aus).toHaveLength(2);
    expect(aus[1]).toMatchObject({ am: JETZT, vorherZustaendigId: "b", vorherBerater: "Partner B", pipelineStufe: "verloren" });
    expect(metaPatch).not.toHaveProperty("verlorenGrund");
  });

  it("schreibt die Beraterhistorie fort, wenn der Kontakt in den Pool geht", () => {
    const { spalten, metaPatch } = reaktivierungFuerAnfrage({
      bisher, zustaendigNeu: null, beraterNameNeu: "", pipelineStufe: "neuer_lead", leadTyp: "meta", jetzt: JETZT,
    });
    expect(spalten).toMatchObject({ zustaendig_id: null, berater: "" });
    expect(metaPatch.beraterHistorie).toEqual([{ name: "Partner B", von: "2026-08-01", bis: JETZT }]);

    // So, wie das CRM den Kontakt danach liest: im Pool sichtbar.
    const kontakt = {
      id: "k1", archiviert: false, geloescht: false, status: "neu", zustaendig_id: null, leadTyp: "meta",
      pipelineStufe: metaPatch.pipelineStufe, nichtErreichtCount: 0, beraterHistorie: metaPatch.beraterHistorie,
    } as never;
    expect(istOffenerPoolLead(kontakt, { rolle: "admin", benutzerId: "x" })).toBe(true);
  });
});

describe("submit-lead", () => {
  const text = readFileSync(join(process.cwd(), "supabase", "functions", "submit-lead", "index.ts"), "utf8");

  it("prüft Kaufphase und bisherigen Zuständigen vor einer Reaktivierung", () => {
    expect(text).toContain("istInKaufphase(bestehend.meta");
    expect(text).toContain("zustaendigNachReaktivierung({");
    expect(text).toContain("linkInhaberId: zustaendigAusUebergebenerId ? zustaendigId : null");
  });

  it("reaktiviert nur, wenn Zuständigkeit und Zeitstempel noch wie gelesen stehen", () => {
    expect(text).toContain('schreiben.eq("aktualisiert_am", bestehend.aktualisiert_am)');
    expect(text).toContain('schreiben.eq("zustaendig_id", bisherZustaendig)');
    expect(text).toContain('schreiben.is("zustaendig_id", null)');
    expect(text).toContain("(geschrieben || []).length === 0");
    expect(text).toContain("reaktivierungVerworfen = true;");
  });

  it("prüft die fremde Dublette gegen den bisherigen Zuständigen", () => {
    expect(text).toContain("bestandsZustaendigId: bisherZustaendig,");
  });

  it("schickt keine Pool-Glocke mehr an die ruhende Setter-Rolle", () => {
    expect(text).not.toContain('"setterin", "admin", "inhaber", "vertriebsleiter"');
  });

  it("zeigt den Vermerk lesbar im Verlauf", () => {
    expect(describeActivityAction("lead_reaktiviert", { quelle: "Meta Ads: Berlin" }))
      .toBe("Neue Anfrage über Meta Ads: Berlin: Kontakt war archiviert oder verloren und ist wieder offen");
  });
});
