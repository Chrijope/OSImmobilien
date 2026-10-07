import { describe, it, expect, vi } from "vitest";
import {
  pruefeVersionsnotiz, istNotizFuerRolle, zaehleUngeleseneNotizen, notizLeseId,
  entscheideNeuladen, ladeVersionsnotiz, type VersionsnotizEintrag,
  istNotizSichtbar, notizFreigabeStand, pruefeNotizFreigaben, FREIGABE_PFLICHT_AB_NR,
  type NotizBetrachter, type NotizFreigaben,
} from "./versionsnotiz";
import {
  hatNeuImCrm, NEU_IM_CRM_FUER_ALLE, istNeuImCrmFreigeber, neuImCrmBetrachter, NEU_IM_CRM_TEST_KENNUNGEN,
  NEU_IM_CRM_TEST_ADRESSEN,
} from "./neuImCrmZugang";
import { ROLES } from "@/types/user";
import notizDatei from "../../public/versionsnotiz.json";

function eintrag(nr: number, teil: Partial<VersionsnotizEintrag> = {}): VersionsnotizEintrag {
  return {
    nr, datum: "2026-09-26", art: "neu", titel: `Eintrag ${nr}`,
    zielrollen: ["alle"], kurztext: "Text", kritisch: false, ...teil,
  };
}

describe("Versionsnotiz im Repo", () => {
  it("ist gueltig, fortlaufend nummeriert und ohne Gedankenstriche", () => {
    const eintraege = pruefeVersionsnotiz(notizDatei);
    expect(eintraege).not.toBeNull();
    expect(eintraege!.length).toBe((notizDatei as unknown[]).length);
    expect(eintraege!.map((e) => e.nr)).toEqual(eintraege!.map((_, i) => i + 1));
    expect(JSON.stringify(notizDatei)).not.toMatch(/[–—]/);
  });

  // Ein Tippfehler im Rollennamen machte einen Eintrag für diese Rolle
  // unsichtbar, ohne dass es jemand merkt.
  it("nennt nur Rollen, die es im Projekt gibt", () => {
    const echte = new Set<string>(["alle", ...ROLES.map((r) => r.id)]);
    for (const e of pruefeVersionsnotiz(notizDatei)!) {
      for (const r of e.zielrollen) expect(echte, `Eintrag ${e.nr}: ${r}`).toContain(r);
    }
  });

  it("zeigt jeder Zielrolle ihre Eintraege, Admin alle mit admin oder alle", () => {
    const eintraege = pruefeVersionsnotiz(notizDatei)!;
    const rollen = new Set(eintraege.flatMap((e) => e.zielrollen).filter((r) => r !== "alle"));
    for (const rolle of rollen) {
      const sichtbar = eintraege.filter((e) => istNotizFuerRolle(e, rolle)).map((e) => e.nr);
      const erwartet = eintraege
        .filter((e) => e.zielrollen.includes(rolle) || e.zielrollen.includes("alle"))
        .map((e) => e.nr);
      expect(sichtbar, rolle).toEqual(erwartet);
      expect(sichtbar.length, rolle).toBeGreaterThan(0);
    }
    const fuerAdmin = eintraege.filter((e) => istNotizFuerRolle(e, "admin"));
    expect(fuerAdmin.length).toBe(eintraege.filter((e) => e.zielrollen.includes("admin") || e.zielrollen.includes("alle")).length);
  });
});

describe("pruefeVersionsnotiz", () => {
  it("liefert null, wenn die Datei keine Liste ist", () => {
    expect(pruefeVersionsnotiz(null)).toBeNull();
    expect(pruefeVersionsnotiz({ eintraege: [] })).toBeNull();
  });

  it("laesst kaputte Eintraege weg und behaelt die guten", () => {
    expect(pruefeVersionsnotiz([eintrag(1), { nr: "x" }, eintrag(2, { art: "falsch" as never })]))
      .toEqual([eintrag(1)]);
  });
});

describe("Rollenfilter und Zaehler", () => {
  const liste = [
    eintrag(1, { zielrollen: ["admin", "inhaber"] }),
    eintrag(2, { zielrollen: ["alle"] }),
    eintrag(3, { zielrollen: ["tippgeber"] }),
  ];

  it("zeigt nur Eintraege fuer die eigene Rolle oder fuer alle", () => {
    expect(liste.filter((e) => istNotizFuerRolle(e, "admin")).map((e) => e.nr)).toEqual([1, 2]);
    expect(liste.filter((e) => istNotizFuerRolle(e, "tippgeber")).map((e) => e.nr)).toEqual([2, 3]);
    expect(liste.filter((e) => istNotizFuerRolle(e, undefined)).map((e) => e.nr)).toEqual([2]);
  });

  it("zaehlt nur ungelesene Eintraege der eigenen Rolle", () => {
    const als = (rolle: string): NotizBetrachter => ({ rolle, istFreigeber: false, freigaben: {} });
    expect(zaehleUngeleseneNotizen(liste, als("admin"), new Set())).toBe(2);
    expect(zaehleUngeleseneNotizen(liste, als("admin"), new Set([notizLeseId(2)]))).toBe(1);
    expect(zaehleUngeleseneNotizen(liste, als("vertriebspartner"), new Set())).toBe(1);
  });
});

describe("entscheideNeuladen", () => {
  const basis = { bekannteNr: 4, schonStillGeladen: false, betrachter: { istFreigeber: false, freigaben: {} } };

  it("zeigt den Warnstreifen, wenn ein neuer Eintrag kritisch ist", () => {
    expect(entscheideNeuladen({ ...basis, notiz: [eintrag(4), eintrag(5, { kritisch: true })] })).toBe("kritisch");
  });

  it("ein alter kritischer Eintrag loest nichts mehr aus", () => {
    expect(entscheideNeuladen({ ...basis, notiz: [eintrag(3, { kritisch: true }), eintrag(5)] })).toBe("still");
  });

  it("laedt ohne kritischen Eintrag still neu, auch ohne neuen Eintrag", () => {
    expect(entscheideNeuladen({ ...basis, notiz: [eintrag(4)] })).toBe("still");
  });

  it("laedt auch still neu, wenn die Notiz fehlt oder unlesbar ist", () => {
    expect(entscheideNeuladen({ ...basis, notiz: null })).toBe("still");
  });

  it("versucht es je Build nur einmal still, danach Ruhe statt Schleife", () => {
    expect(entscheideNeuladen({ ...basis, notiz: [eintrag(5)], schonStillGeladen: true })).toBe("nichts");
  });

  it("zeigt den Warnstreifen auch nach einem stillen Versuch, wenn es kritisch ist", () => {
    expect(entscheideNeuladen({ ...basis, notiz: [eintrag(5, { kritisch: true })], schonStillGeladen: true })).toBe("kritisch");
  });
});

describe("Freigabe ab Nr. 25", () => {
  const bestand = eintrag(24);
  const offen = eintrag(25);
  const frei = eintrag(26);
  const abgelehnt = eintrag(27);
  const nurAdmin = eintrag(28, { zielrollen: ["admin"] });
  const alterAbgelehnt = eintrag(3);
  const liste = [alterAbgelehnt, bestand, offen, frei, abgelehnt, nurAdmin];
  const freigaben: NotizFreigaben = { "26": "frei", "27": "abgelehnt", "28": "frei", "3": "abgelehnt" };
  const sichtbar = (b: Omit<NotizBetrachter, "freigaben">, f: NotizFreigaben = freigaben) =>
    liste.filter((e) => istNotizSichtbar(e, { ...b, freigaben: f })).map((e) => e.nr);

  it("beginnt bei 25", () => {
    expect(FREIGABE_PFLICHT_AB_NR).toBe(25);
  });

  it("Christian sieht alles, auch Offenes, Abgelehntes und fremde Rollen", () => {
    expect(sichtbar({ rolle: "admin", istFreigeber: true })).toEqual([3, 24, 25, 26, 27, 28]);
    expect(sichtbar({ rolle: undefined, istFreigeber: true }, {})).toEqual([3, 24, 25, 26, 27, 28]);
  });

  it("ein Partner sieht Bestand und Freigegebenes fuer seine Rolle", () => {
    expect(sichtbar({ rolle: "vertriebspartner", istFreigeber: false })).toEqual([24, 26]);
  });

  it("ein anderer Admin sieht Freigegebenes, aber nichts Offenes oder Abgelehntes", () => {
    expect(sichtbar({ rolle: "admin", istFreigeber: false })).toEqual([24, 26, 28]);
  });

  it("ohne Eintrag in app_config: Bestand bis 24 frei, ab 25 nur Christian", () => {
    expect(sichtbar({ rolle: "admin", istFreigeber: false }, {})).toEqual([3, 24]);
    expect(notizFreigabeStand(bestand, {})).toBe("frei");
    expect(notizFreigabeStand(offen, {})).toBe("offen");
  });

  it("Christian kann auch einen Bestandseintrag zurueckziehen", () => {
    expect(notizFreigabeStand(alterAbgelehnt, freigaben)).toBe("abgelehnt");
  });

  it("Badge zaehlt nur, was der Nutzer sieht", () => {
    const partner: NotizBetrachter = { rolle: "vertriebspartner", istFreigeber: false, freigaben };
    expect(zaehleUngeleseneNotizen(liste, partner, new Set())).toBe(2);
    expect(zaehleUngeleseneNotizen(liste, { ...partner, istFreigeber: true }, new Set())).toBe(6);
  });

  it("verwirft kaputte Freigabewerte", () => {
    expect(pruefeNotizFreigaben(null)).toEqual({});
    expect(pruefeNotizFreigaben([1])).toEqual({});
    expect(pruefeNotizFreigaben({ "25": "frei", "26": "ja", "27": "abgelehnt" }))
      .toEqual({ "25": "frei", "27": "abgelehnt" });
  });

  it("Warnstreifen bei kritisch erst nach Freigabe, fuer Christian schon vorher", () => {
    const kritisch = [eintrag(25, { kritisch: true })];
    const p = { notiz: kritisch, bekannteNr: 24, schonStillGeladen: false };
    expect(entscheideNeuladen({ ...p, betrachter: { istFreigeber: false, freigaben: {} } })).toBe("still");
    expect(entscheideNeuladen({ ...p, betrachter: { istFreigeber: false, freigaben: { "25": "abgelehnt" } } })).toBe("still");
    expect(entscheideNeuladen({ ...p, betrachter: { istFreigeber: false, freigaben: { "25": "frei" } } })).toBe("kritisch");
    expect(entscheideNeuladen({ ...p, betrachter: { istFreigeber: true, freigaben: {} } })).toBe("kritisch");
  });

  it("nur Christian ist Freigeber, erkannt ueber Kennung oder Adresse", () => {
    expect(NEU_IM_CRM_TEST_KENNUNGEN.length).toBeGreaterThan(0);
    expect(istNeuImCrmFreigeber(NEU_IM_CRM_TEST_KENNUNGEN[0])).toBe(true);
    expect(istNeuImCrmFreigeber(null, NEU_IM_CRM_TEST_ADRESSEN[0]?.toUpperCase())).toBe(true);
    expect(istNeuImCrmFreigeber("00000000-0000-0000-0000-000000000009", "jemand@example.com")).toBe(false);
    expect(istNeuImCrmFreigeber(undefined)).toBe(false);
  });
});

describe("ladeVersionsnotiz", () => {
  it("liefert null bei Netzfehler oder Fehlerstatus", async () => {
    expect(await ladeVersionsnotiz(vi.fn().mockRejectedValue(new Error("weg")))).toBeNull();
    expect(await ladeVersionsnotiz(vi.fn().mockResolvedValue({ ok: false }))).toBeNull();
  });

  it("holt frisch und meldet der Seitenleiste", async () => {
    const gemeldet = vi.fn();
    window.addEventListener("news-updated", gemeldet);
    const holen = vi.fn().mockResolvedValue({ ok: true, json: async () => [eintrag(1)] });
    expect(await ladeVersionsnotiz(holen)).toEqual([eintrag(1)]);
    expect(holen).toHaveBeenCalledWith("/versionsnotiz.json", { cache: "reload" });
    expect(gemeldet).toHaveBeenCalled();
    window.removeEventListener("news-updated", gemeldet);
  });
});

describe("Freischaltung", () => {
  it("gilt seit dem 26.09.2026 fuer alle, auch ohne Kennung", () => {
    expect(NEU_IM_CRM_FUER_ALLE).toBe(true);
    expect(hatNeuImCrm("00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(hatNeuImCrm("00000000-0000-0000-0000-000000000009", "jemand@example.com")).toBe(true);
    expect(hatNeuImCrm(undefined)).toBe(true);
  });
});

describe("Freigeben nur als Christian in der Admin-Rolle", () => {
  const christian = NEU_IM_CRM_TEST_KENNUNGEN[0];
  it("in der Admin-Rolle darf Christian freigeben", () => {
    expect(neuImCrmBetrachter("admin", christian, null, {}).istFreigeber).toBe(true);
  });
  it.each(["vertriebspartner", "inhaber", "vertriebsleiter", "hr"])("als %s sieht Christian die News wie diese Rolle", (rolle) => {
    expect(neuImCrmBetrachter(rolle, christian, null, {}).istFreigeber).toBe(false);
  });
  it("ein anderer Admin darf nicht freigeben", () => {
    expect(neuImCrmBetrachter("admin", "00000000-0000-0000-0000-000000000009", "jemand@example.com", {}).istFreigeber).toBe(false);
  });
});

describe("Überarbeitung eines Eintrags vor der Freigabe", () => {
  const eintrag = {
    nr: 70, datum: "2026-09-30", art: "neu" as const, titel: "Alt", zielrollen: ["admin"],
    kurztext: "alter Text", wasHeisstDasFuerDich: ["a"], soFindestDuEs: "hier", kritisch: true,
  };

  it("legt nur die Textfelder über den Eintrag, der Rest bleibt aus der Datei", async () => {
    const { mitUeberarbeitung } = await import("./versionsnotiz");
    const neu = mitUeberarbeitung(eintrag, { "70": { titel: "Neu", wasHeisstDasFuerDich: ["b", "c"] } });
    expect(neu).toMatchObject({ nr: 70, titel: "Neu", kurztext: "alter Text", wasHeisstDasFuerDich: ["b", "c"], kritisch: true, zielrollen: ["admin"] });
    expect(mitUeberarbeitung(eintrag, {})).toBe(eintrag);
  });

  it("verwirft aus der Datenbank alles, was kein Textfeld ist", async () => {
    const { pruefeNotizUeberarbeitungen } = await import("./versionsnotiz");
    expect(pruefeNotizUeberarbeitungen(null)).toEqual({});
    expect(pruefeNotizUeberarbeitungen([1])).toEqual({});
    expect(pruefeNotizUeberarbeitungen({
      "70": { titel: "Neu", kritisch: false, zielrollen: ["alle"], wasHeisstDasFuerDich: ["x", 3] },
      "71": { titel: "   " },
      "72": "kaputt",
    })).toEqual({ "70": { titel: "Neu", wasHeisstDasFuerDich: ["x"] } });
  });
});
