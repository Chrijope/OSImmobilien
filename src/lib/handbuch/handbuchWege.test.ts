/**
 * Zugang, Lead-Zuordnung und die öffentlichen Wege der Handbuch-Seite.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    functions: { invoke: vi.fn() },
  },
}));

import { darfHandbuchSeite, hatHandbuchGesamtsicht, HANDBUCH_SEITE_FUER_PARTNER_FREIGESCHALTET, istHandbuchSeiteRoute, partnerFreigabeAusWert } from "./zugang";
import { isUrlAllowedForRole, istRouteGesperrt } from "@/lib/sidebarPermissions";
import { handbuchLeadRumpf } from "./leadAbsenden";
import { leseAbruf } from "./abruf";
import { leseKennzahlen } from "./kennzahlen";
import { mitKampagne } from "./kampagnenLink";
import { istOeffentlicheSeite } from "@/lib/cookieEinwilligung";
import { buildHandbuchUrl } from "@/lib/publicUrl";
import {
  glockenPlanFuerLead,
  herkunftBezeichnung,
  leadHerkunft,
  pipelineStufeFuerLead,
  waehleZuordnungsWeg,
} from "../../../supabase/functions/_shared/lead-zuordnung.ts";
import { waehleInvestment, handbuchLink, saLinkHandbuch, saVorbelegungFuer } from "../../../supabase/functions/_shared/handbuch-anlage.ts";
import { HANDBUCH_EREIGNISSE } from "../../../supabase/functions/_shared/handbuch-ereignisse.ts";
import type { HandbuchAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import type { UserRole } from "@/types/user";

const A: HandbuchAntworten = { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" };

describe("Handbuch-Seite: Gesamtsicht für Admin, Inhaber, Vertriebsleitung, eigene Sicht für Vertriebspartner", () => {
  it("ist seit dem 27.09.2026 für Vertriebspartner freigeschaltet", () => {
    expect(HANDBUCH_SEITE_FUER_PARTNER_FREIGESCHALTET).toBe(true);
  });

  it.each([
    ["admin", true],
    ["inhaber", true],
    ["vertriebspartner", true],
    ["vertriebsleiter", true],
    ["individuell", false],
    ["testaccount", false],
    ["setterin", false],
    ["kunde", false],
  ])("Rolle %s: Zugriff %s", (rolle, erwartet) => {
    expect(darfHandbuchSeite(rolle)).toBe(erwartet);
    expect(isUrlAllowedForRole("/handbuch-seite", rolle as UserRole)).toBe(erwartet);
    expect(istRouteGesperrt("/handbuch-seite", rolle as UserRole)).toBe(!erwartet);
  });

  it("HB-008: der Schalter kommt aus app_config, ohne gültigen Eintrag gilt die Konstante", () => {
    expect(partnerFreigabeAusWert({ aktiv: true })).toBe(true);
    expect(partnerFreigabeAusWert({ aktiv: false })).toBe(false);
    expect(partnerFreigabeAusWert(null)).toBe(HANDBUCH_SEITE_FUER_PARTNER_FREIGESCHALTET);
    expect(partnerFreigabeAusWert({ aktiv: "true" })).toBe(HANDBUCH_SEITE_FUER_PARTNER_FREIGESCHALTET);
  });

  it("eine eigene Berechtigung öffnet die Seite nicht am Schalter vorbei", () => {
    expect(isUrlAllowedForRole("/handbuch-seite", "setterin", ["/handbuch-seite"])).toBe(false);
  });

  it("nach der Freischaltung dürfen auch Vertriebspartner, die Gesamtsicht bleibt bei der Leitung", () => {
    expect(darfHandbuchSeite("vertriebspartner", true)).toBe(true);
    expect(darfHandbuchSeite("vertriebsleiter", true)).toBe(true);
    expect(darfHandbuchSeite("setterin", true)).toBe(false);
    expect(hatHandbuchGesamtsicht("vertriebsleiter")).toBe(true);
    expect(hatHandbuchGesamtsicht("admin")).toBe(true);
    expect(hatHandbuchGesamtsicht("inhaber")).toBe(true);
    expect(hatHandbuchGesamtsicht("vertriebspartner")).toBe(false);
  });

  it("die öffentliche Seite ist nicht die Verwaltung", () => {
    expect(istHandbuchSeiteRoute("/handbuch-seite")).toBe(true);
    expect(istHandbuchSeiteRoute("/handbuch")).toBe(false);
    expect(istHandbuchSeiteRoute("/handbuch/maria")).toBe(false);
  });
});

describe("Öffentliche Seiten und Cookie-Banner", () => {
  it("die Handbuch-Seite samt Ergebnis und Selbstauskunft ist öffentlich, die Verwaltung nicht", () => {
    expect(istOeffentlicheSeite("/handbuch")).toBe(true);
    expect(istOeffentlicheSeite("/handbuch/maria")).toBe(true);
    expect(istOeffentlicheSeite("/handbuch/ergebnis/abc")).toBe(true);
    expect(istOeffentlicheSeite("/handbuch/selbstauskunft/abc")).toBe(true);
    expect(istOeffentlicheSeite("/handbuch-seite")).toBe(false);
  });

  it("Links zeigen auf die Live-Adresse", () => {
    expect(buildHandbuchUrl("maria")).toBe("https://portal.more.immo/handbuch/maria");
    expect(buildHandbuchUrl(null)).toBe("https://portal.more.immo/handbuch");
    expect(handbuchLink("t")).toBe("https://portal.more.immo/handbuch/ergebnis/t");
    // Dieselbe Selbstauskunft wie „An Kunde senden“ (send-sa-invitation).
    expect(saLinkHandbuch("s")).toBe("https://portal.more.immo/sa/s");
    // Englisch: Die Sprache steckt im Mail-Link.
    expect(handbuchLink("t", "en")).toBe("https://portal.more.immo/handbuch/ergebnis/t?lang=en");
    expect(saLinkHandbuch("s", "en")).toBe("https://portal.more.immo/sa/s?lang=en");
    expect(saLinkHandbuch("s", "de")).toBe("https://portal.more.immo/sa/s");
  });

  it("der Kampagnenlink hängt die Kennung sauber an", () => {
    expect(mitKampagne("https://portal.more.immo/handbuch", "meta", "paid_social", "Handbuch Herbst!")).toBe(
      "https://portal.more.immo/handbuch?utm_source=meta&utm_medium=paid_social&utm_campaign=handbuch_herbst",
    );
  });
});

describe("Lead mit Partnerkürzel gehört dem Partner, ohne Kürzel in den Pool", () => {
  beforeEach(() => sessionStorage.clear());

  it("der Browser schickt nur das Kürzel, nie eine Partnerkennung", () => {
    const rumpf = handbuchLeadRumpf({
      kontakt: { vorname: " Erika ", nachname: "Muster", email: "erika@beispiel.de", telefon: "0151 23456789", einwilligung: true, werbeeinwilligung: false, hp: "" },
      antworten: A,
      beraterSlug: "maria",
      dauerMs: 42000,
      jetzt: "2026-09-26T12:00:00.000Z",
    });
    expect(rumpf.beraterSlug).toBe("maria");
    expect(rumpf).not.toHaveProperty("beraterUserId");
    expect(rumpf.quelle).toBe("Konfigurator");
    expect(rumpf.telefon).not.toBe("");
    expect(rumpf.vorname).toBe("Erika");
    expect(rumpf.handbuchFunnel).toEqual({ antworten: A, dauerMs: 42000 });
    expect((rumpf.dsgvo_consent as { version: string }).version).toBe("2026-09-handbuch-v1");
    expect(rumpf.dsgvo_consent).not.toHaveProperty("werbung");
  });

  it("ohne Pflichteinwilligung geht kein Nachweis mit", () => {
    const rumpf = handbuchLeadRumpf({
      kontakt: { vorname: "E", nachname: "M", email: "e@m.de", telefon: "0151 1234567", einwilligung: false, werbeeinwilligung: true, hp: "" },
      antworten: A,
      dauerMs: 1,
    });
    expect(rumpf.dsgvo_consent).toBeNull();
    expect(rumpf.beraterSlug).toBeUndefined();
  });

  it("der Server ordnet über das Kürzel zu, ohne Kürzel ist es der Weg der Gesellschaft", () => {
    expect(waehleZuordnungsWeg({ beraterSlug: "maria" }).weg).toBe("link_kuerzel");
    expect(waehleZuordnungsWeg({}).weg).toBe("ohne_link");
  });

  it("mit Partner: Stufe zugewiesen, Glocke an den Partner, nicht an die Leitung", () => {
    const herkunft = leadHerkunft({ beraterKennungGeprueft: true });
    expect(herkunft).toBe("partner_persoenlich");
    expect(pipelineStufeFuerLead({ istTerminLead: false, persoenlicherPartnerWeg: true })).toBe("zugewiesen");
    expect(glockenPlanFuerLead({ istTerminLead: false, persoenlicherPartnerWeg: true, hatZustaendigen: true })).toEqual({ partner: true, partnerTermin: false, leitung: false });
    expect(herkunftBezeichnung("Handbuch-Seite")).toBe("deine Handbuch-Seite");
    expect(herkunftBezeichnung("Konfigurator")).toBe("deine Handbuch-Seite");
  });

  it("ohne Partner: neuer Lead im Pool, Glocke an die Leitung", () => {
    expect(pipelineStufeFuerLead({ istTerminLead: false, persoenlicherPartnerWeg: false })).toBe("neuer_lead");
    expect(glockenPlanFuerLead({ istTerminLead: false, persoenlicherPartnerWeg: false, hatZustaendigen: false })).toEqual({ partner: false, partnerTermin: false, leitung: true });
  });
});

describe("Investment für die Selbstauskunft", () => {
  it("nimmt das jüngste ohne unterschriebene Selbstauskunft", () => {
    expect(waehleInvestment([
      { id: "alt", erstellt_am: "2026-01-01", meta: {} },
      { id: "neu", erstellt_am: "2026-09-01", meta: {} },
      { id: "fertig", erstellt_am: "2026-09-20", meta: { saSigned: true } },
    ])).toEqual({ id: "neu", saUnterschrieben: false, saEntwurf: null });
  });

  it("sind alle unterschrieben, gibt es keinen neuen Link", () => {
    expect(waehleInvestment([{ id: "x", erstellt_am: "2026-01-01", meta: { saSigned: true } }])).toEqual({ id: "x", saUnterschrieben: true, saEntwurf: null });
    expect(waehleInvestment([])).toBeNull();
  });

  it("gibt den angefangenen Stand am Investment mit, wie „An Kunde senden“", () => {
    const stand = { beruf: "Lehrerin", einkommen: { netto: "3.000,00" } };
    expect(waehleInvestment([{ id: "i", erstellt_am: "2026-09-01", meta: { saData: stand } }])?.saEntwurf).toEqual(stand);
  });
});

describe("Vorbelegung der Selbstauskunft", () => {
  const antworten = { ziel: "alter", beruf: "beamter", brutto: "50_80", ueberschuss: "500_1000", eigenkapital: "10_30", start: "sofort" } as const;

  const formularName = { vorname: " Anna Maria ", nachname: "Müller" };

  it("neuer Kontakt: Antworten, Handynummer und Name getrennt aus dem Formular", () => {
    expect(saVorbelegungFuer({ antworten, telefon: " +49 151 1234567 ", dublette: null, ...formularName }, null)).toEqual({
      beschaeftigungsart: "angestellt",
      wuenscheZiele: ["rente"],
      telefon: "+49 151 1234567",
      vorname: "Anna Maria",
      nachname: "Müller",
    });
  });

  it("Dublette: nie etwas aus dem Formular, nur der Stand am Investment und der gespeicherte Name", () => {
    const dublette = { erkanntUeber: "email" as const, gespeicherteEmail: "a@b.de" };
    expect(saVorbelegungFuer({ antworten, telefon: "0151 999", dublette, ...formularName }, null)).toEqual({});
    expect(saVorbelegungFuer({ antworten: null, telefon: "0151 999", dublette, ...formularName }, { beruf: "x" })).toEqual({ beruf: "x" });
    expect(
      saVorbelegungFuer({ antworten: null, dublette, ...formularName }, null, { vorname: "Karl Heinz", nachname: "von Berg" }),
    ).toEqual({ vorname: "Karl Heinz", nachname: "von Berg" });
  });

  it("ein Name im Entwurf hat Vorrang, ein leerer Entwurfsname nicht", () => {
    const dublette = { erkanntUeber: "email" as const, gespeicherteEmail: "a@b.de" };
    const gespeichert = { vorname: "Karl", nachname: "Berg" };
    expect(saVorbelegungFuer({ antworten: null, dublette, ...formularName }, { vorname: "Karl-Heinz", nachname: "Berg" }, gespeichert))
      .toEqual({ vorname: "Karl-Heinz", nachname: "Berg" });
    expect(saVorbelegungFuer({ antworten: null, dublette, ...formularName }, { vorname: "", nachname: "" }, gespeichert))
      .toEqual({ vorname: "Karl", nachname: "Berg" });
  });
});

describe("Abruf und Kennzahlen", () => {
  it("liest den Abruf und verwirft manipulierte Antworten", () => {
    expect(leseAbruf(null)).toEqual({ status: "unbekannt" });
    expect(leseAbruf({ abgelaufen: true, vorname: "Erika" })).toEqual({ status: "abgelaufen", vorname: "Erika" });
    expect(leseAbruf({ abgelaufen: false, antworten: { ziel: "x" } })).toEqual({ status: "fehler" });
    const ok = leseAbruf({ abgelaufen: false, vorname: "Erika", nachname: "Muster", antworten: A, beraterSlug: "maria", saToken: "t", saStatus: "offen" });
    expect(ok).toMatchObject({ status: "ok", beraterSlug: "maria", saToken: "t", saStatus: "offen" });
  });

  it("nimmt bei den Anforderungen den verlässlicheren Wert", () => {
    const k = leseKennzahlen({ tage: 90, ereignisse: { hb_seite_geoeffnet: 40, hb_handbuch_erhalten: 3 }, anforderungen: { gesamt: 5, passt: 3, saAusgefuellt: 1 } });
    expect(k).toMatchObject({ aufrufe: 40, erhalten: 5, passt: 3, saAbgeschickt: 1 });
  });

  it("die Stufen des Trichters sind vollständig und eindeutig", () => {
    expect(new Set(HANDBUCH_EREIGNISSE).size).toBe(HANDBUCH_EREIGNISSE.length);
    for (const n of [1, 2, 3, 4, 5, 6]) expect(HANDBUCH_EREIGNISSE).toContain(`hb_frage_${n}`);
    expect(HANDBUCH_EREIGNISSE).toContain("hb_sa_abgeschickt");
  });
});
