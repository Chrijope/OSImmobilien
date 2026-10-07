import { describe, it, expect } from "vitest";
import {
  istOffenerPoolLead,
  zaehleOffenePoolLeads,
  fehlenKontaktdaten,
  CHRISTIAN_PEETZ_ID,
  POOL_LEAD_ALARM_TAGE,
  POOL_LEAD_WARNUNG_TAGE,
} from "./leadPool";
import { MAX_KONTAKTVERSUCHE } from "./kontaktversuchSchedule";
import type { KundeData } from "./kundenStore";

const admin = { rolle: "admin", benutzerId: "admin-1" };
const vp = { rolle: "vertriebspartner", benutzerId: "vp-1" };

function lead(extra: Partial<KundeData> = {}): Partial<KundeData> {
  return {
    id: "1",
    leadTyp: "meta",
    email: "a@b.de",
    telefon: "",
    erstellt_am: "2026-08-01T00:00:00Z",
    ...extra,
  };
}

describe("istOffenerPoolLead", () => {
  it("nimmt einen unzugewiesenen Lead", () => {
    expect(istOffenerPoolLead(lead(), admin)).toBe(true);
  });

  it("blendet zugewiesene Leads aus", () => {
    expect(istOffenerPoolLead(lead({ zustaendig_id: "vp-9" }), admin)).toBe(false);
  });

  it("haelt einen Lead im Pool, der nur einen Berater-Namen hat", () => {
    // Der alte Filter warf genau diese Leads raus, obwohl sie niemandem
    // gehoerten: ohne zustaendig_id sieht der genannte Berater sie gar nicht.
    expect(istOffenerPoolLead(lead({ berater: "Max Muster" }), admin)).toBe(true);
  });

  it("zeigt Leads ohne E-Mail und ohne Telefon, statt sie auszublenden", () => {
    // Frueher waren sie ausgeblendet. Das traf vor allem Foto-Leads, bei denen
    // nur ein Name erkannt wurde: angelegt, aber in keiner Arbeitsliste.
    expect(istOffenerPoolLead(lead({ email: "", telefon: "" }), admin)).toBe(true);
    expect(istOffenerPoolLead(lead({ email: "", telefon: "0170 1" }), admin)).toBe(true);
  });

  it("erkennt fehlende Kontaktdaten fuer die Kennzeichnung in der Liste", () => {
    expect(fehlenKontaktdaten(lead({ email: "", telefon: "" }))).toBe(true);
    expect(fehlenKontaktdaten(lead({ email: "   ", telefon: "  " }))).toBe(true);
    expect(fehlenKontaktdaten(lead({ email: "a@b.de", telefon: "" }))).toBe(false);
    expect(fehlenKontaktdaten(lead({ email: "", telefon: "0170 1" }))).toBe(false);
    expect(fehlenKontaktdaten(null)).toBe(false);
  });

  it("blendet verlorene Leads aus", () => {
    expect(istOffenerPoolLead(lead({ status: "verloren" }), admin)).toBe(false);
    expect(istOffenerPoolLead(lead({ pipelineStufe: "verloren" }), admin)).toBe(false);
  });

  it("blendet erst ab der maximalen Zahl an Kontaktversuchen aus", () => {
    expect(istOffenerPoolLead(lead({ nichtErreichtCount: MAX_KONTAKTVERSUCHE - 1 }), admin)).toBe(true);
    expect(istOffenerPoolLead(lead({ nichtErreichtCount: MAX_KONTAKTVERSUCHE }), admin)).toBe(false);
    // Frueher lag die Grenze in der Liste bei 5, im Zaehler bei 15.
    expect(istOffenerPoolLead(lead({ nichtErreichtCount: 5 }), admin)).toBe(true);
  });

  it("blendet archivierte und geloeschte Leads aus", () => {
    expect(istOffenerPoolLead(lead({ archiviert: true }), admin)).toBe(false);
    expect(istOffenerPoolLead(lead({ geloescht: true }), admin)).toBe(false);
  });

  it("nimmt nur Leads, keine gewoehnlichen Kontakte", () => {
    expect(istOffenerPoolLead(lead({ leadTyp: undefined }), admin)).toBe(false);
    expect(istOffenerPoolLead(lead({ leadTyp: undefined, setter: "Setterin" }), admin)).toBe(true);
  });

  it("zeigt einem Vertriebspartner nur eigene Leads", () => {
    expect(istOffenerPoolLead(lead({ erstelltVonId: "vp-1" }), vp)).toBe(true);
    expect(istOffenerPoolLead(lead({ erstelltVonId: "vp-2" }), vp)).toBe(false);
  });

  it("gibt Leads ohne jede Zuordnung nur an die Leitung und die Setterin", () => {
    expect(istOffenerPoolLead(lead(), vp)).toBe(false);
    expect(istOffenerPoolLead(lead(), { rolle: "setterin", benutzerId: "s-1" })).toBe(true);
  });

  it("richtet sich nach der aktiven Rolle, nicht nach der Person", () => {
    // Dieselbe Person: als Admin sieht sie den herrenlosen Lead, nach dem
    // Wechsel in die Rolle Vertriebspartner nicht mehr.
    expect(istOffenerPoolLead(lead(), { rolle: "admin", benutzerId: CHRISTIAN_PEETZ_ID })).toBe(true);
    expect(istOffenerPoolLead(lead(), { rolle: "vertriebspartner", benutzerId: CHRISTIAN_PEETZ_ID })).toBe(false);
  });

  it("zeigt Leads mit Setter, aber ohne Ersteller, allen internen Rollen", () => {
    expect(istOffenerPoolLead(lead({ setter: "Setterin" }), vp)).toBe(true);
  });

  it("vertraegt leere Eingaben", () => {
    expect(istOffenerPoolLead(null, admin)).toBe(false);
    expect(istOffenerPoolLead(undefined, admin)).toBe(false);
  });
});

describe("zaehleOffenePoolLeads", () => {
  it("zaehlt genau die Leads, die auch die Liste zeigt", () => {
    const alle = [
      lead({ id: "1" }),
      lead({ id: "2", zustaendig_id: "vp-9" }),
      lead({ id: "3", status: "verloren" }),
      lead({ id: "4" }),
    ];
    expect(zaehleOffenePoolLeads(alle, admin)).toBe(2);
  });

  it("vertraegt eine leere Liste", () => {
    expect(zaehleOffenePoolLeads([], admin)).toBe(0);
    expect(zaehleOffenePoolLeads(undefined, admin)).toBe(0);
  });
});

describe("Schwellen", () => {
  it("gelb kommt vor rot", () => {
    expect(POOL_LEAD_WARNUNG_TAGE).toBeLessThan(POOL_LEAD_ALARM_TAGE);
  });

  it("rot passt zur Nachtpruefung", () => {
    expect(POOL_LEAD_ALARM_TAGE).toBe(3);
  });
});

describe("Rückläufer ohne leadTyp und setter", () => {
  // Ein selbst angelegter Kontakt: kein leadTyp, kein setter.
  const kontakt = (extra: Partial<KundeData> = {}): Partial<KundeData> =>
    lead({ leadTyp: undefined, setter: undefined, ...extra });
  const zurueckgegeben = {
    beraterHistorie: [{ name: "Partner A", von: "2026-09-01T00:00:00Z", bis: "2026-09-28T10:00:00Z", grund: "kein_kontakt" }],
  } as unknown as Partial<KundeData>;

  it("erscheint als Rückläufer im Pool", () => {
    expect(istOffenerPoolLead(kontakt(zurueckgegeben), admin)).toBe(true);
    expect(istOffenerPoolLead(kontakt({ ...zurueckgegeben, erstelltVonId: "vp-1" }), { rolle: "inhaber", benutzerId: "x" })).toBe(true);
  });

  it("bleibt draußen, solange er einen Zuständigen hat", () => {
    expect(istOffenerPoolLead(kontakt({ ...zurueckgegeben, zustaendig_id: "vp-9" }), admin)).toBe(false);
  });

  it("ändert nichts an einem nie zurückgegebenen Kontakt", () => {
    // Ohne Historie wie bisher unsichtbar ...
    expect(istOffenerPoolLead(kontakt(), admin)).toBe(false);
    // ... auch mit nur offenem Eintrag, denn dann gehört er noch jemandem.
    const offen = { beraterHistorie: [{ name: "Partner A", von: "2026-09-01T00:00:00Z" }] } as unknown as Partial<KundeData>;
    expect(istOffenerPoolLead(kontakt(offen), admin)).toBe(false);
    // Ein gewöhnlicher Lead bleibt so sichtbar wie heute.
    expect(istOffenerPoolLead(lead(), admin)).toBe(true);
  });

  it("richtet sich weiter nach der aktiven Rolle", () => {
    expect(istOffenerPoolLead(kontakt(zurueckgegeben), vp)).toBe(false);
  });
});
