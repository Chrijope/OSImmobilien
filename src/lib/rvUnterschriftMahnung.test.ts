/**
 * Genau hier hat gefehlt, dass jemand prueft, ob der Ausloeser ueberhaupt
 * ausloest: Die beiden Vorgaenger-Erinnerungen warteten auf ein PDF, das erst
 * mit der Unterschrift entsteht, und feuerten deshalb nie.
 */
import { describe, it, expect } from "vitest";
import {
  RV_ERINNERUNG_AB,
  RV_MAHN_STUFEN,
  rvErinnerungLaeuft,
  naechsteRvMahnung,
  rvMahnTexte,
  rvSperrSchluessel,
  rvUnterschriftStand,
  rvVertriebsleitungTexte,
  rvWartetKachelText,
  tageText,
  type RvMeta,
} from "@/lib/rvUnterschriftMahnung";

/**
 * Donnerstag, 1. Oktober 2026, 10 Uhr, also nach dem Stichtag
 * `RV_ERINNERUNG_AB`. Alle Erwartungen rechnen dagegen.
 */
const VERSAND = new Date(2026, 9, 1, 10, 0);

function tagX(tage: number): Date {
  return new Date(VERSAND.getTime() + tage * 86_400_000);
}

function wartend(teil: Partial<RvMeta> = {}): RvMeta {
  return { rvSignaturePending: true, rvSigned: false, rvSignatureSentAt: VERSAND.toISOString(), ...teil };
}

/**
 * Ein Durchlauf der Kette, so wie der Hook sie fährt: Der Merkzettel der
 * bereits verschickten Stufen bleibt über alle Tage hinweg derselbe. Zurück
 * kommt je Tag die angelegte Stufe (Grundschlüssel), oder nichts.
 */
function lauf(meta: RvMeta, tage: number[], gesendet = new Set<string>()): string[][] {
  return tage.map((t) => {
    const stand = rvUnterschriftStand(meta, { jetzt: tagX(t) });
    const mahnung = naechsteRvMahnung(stand, (s) => gesendet.has(s));
    if (!mahnung) return [];
    mahnung.sperren.forEach((s) => gesendet.add(s));
    return [mahnung.stufe.schluessel];
  });
}

describe("rvUnterschriftStand", () => {
  it("erkennt die wartende Unterschrift am Versandmerkmal, nicht am PDF", () => {
    const stand = rvUnterschriftStand(wartend(), { jetzt: tagX(3) });
    expect(stand.wartet).toBe(true);
    expect(stand.tage).toBe(3);
  });

  it("wartet nicht, solange nichts versendet wurde", () => {
    expect(rvUnterschriftStand({ rvSignaturePending: false }, { jetzt: tagX(9) }).wartet).toBe(false);
    expect(rvUnterschriftStand(null, { jetzt: tagX(9) }).wartet).toBe(false);
    expect(rvUnterschriftStand({}, { jetzt: tagX(9) }).wartet).toBe(false);
  });

  it("wartet nicht mehr, sobald unterschrieben ist", () => {
    // Genau das setzt `finalize-reservierung`: rvSigned an, rvSignaturePending aus.
    expect(rvUnterschriftStand(wartend({ rvSigned: true }), { jetzt: tagX(9) }).wartet).toBe(false);
    expect(rvUnterschriftStand(wartend({ rvSignaturePending: false }), { jetzt: tagX(9) }).wartet).toBe(false);
  });

  it("wartet nicht, sobald die unterschriebene Vereinbarung als PDF vorliegt", () => {
    // Die PDF entsteht erst mit der Unterschrift. Altdaten tragen sie
    // mitunter ohne rvSigned.
    expect(rvUnterschriftStand(wartend({ rvPdf: "Reservierung (Anna Berger).pdf" }), { jetzt: tagX(9) }).wartet).toBe(false);
    expect(rvUnterschriftStand(wartend({ rvPdf: "" }), { jetzt: tagX(9) }).wartet).toBe(true);
  });

  it("wartet nicht, wenn die Reservierung entfallen ist", () => {
    const meta = wartend({ rvReservierungEntfallenAm: tagX(1).toISOString() });
    expect(rvUnterschriftStand(meta, { jetzt: tagX(9) }).wartet).toBe(false);
  });

  it("kennt ohne Zeitstempel keine Dauer", () => {
    const stand = rvUnterschriftStand(wartend({ rvSignatureSentAt: "" }), { jetzt: tagX(30) });
    expect(stand.wartet).toBe(true);
    expect(stand.tage).toBeNull();
    expect(stand.seit).toBeNull();
  });

});

describe("naechsteRvMahnung", () => {
  it("legt nach 2, 5 und 10 Tagen je genau eine Aufgabe an", () => {
    const ergebnis = lauf(wartend(), [0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 40]);
    expect(ergebnis).toEqual([
      [], [],
      ["rv_unterschrift_2d"],
      [], [],
      ["rv_unterschrift_5d"],
      [], [],
      ["rv_unterschrift_10d"],
      [], [],
    ]);
  });

  it("legt vor dem zweiten Tag gar nichts an", () => {
    expect(lauf(wartend(), [0, 1]).flat()).toEqual([]);
  });

  it("legt nach langer Abwesenheit nur die hoechste faellige Stufe an", () => {
    // Der Hook laeuft nur im geoeffneten Dashboard. Wer nach zwei Wochen
    // wiederkommt, bekommt die Eskalation, nicht drei Aufgaben auf einmal.
    const gesendet = new Set<string>();
    expect(lauf(wartend(), [14], gesendet)).toEqual([["rv_unterschrift_10d"]]);
    // Die uebersprungenen Stufen sind mitgesperrt und kommen nicht nach.
    expect(gesendet.size).toBe(3);
    expect(lauf(wartend(), [15, 20], gesendet).flat()).toEqual([]);
  });

  it("springt nach sechs Tagen Pause auf die zweite Stufe", () => {
    expect(lauf(wartend(), [1, 7, 10])).toEqual([[], ["rv_unterschrift_5d"], ["rv_unterschrift_10d"]]);
  });

  it("wiederholt keine Stufe, die schon verschickt wurde", () => {
    const gesendet = new Set(RV_MAHN_STUFEN.map((s) => rvSperrSchluessel(s, VERSAND)));
    expect(lauf(wartend(), [2, 5, 10, 30], gesendet).flat()).toEqual([]);
  });

  it("beginnt nach einem neuen Versand von vorn", () => {
    // Einheitswechsel: clearRvSignatureData loescht den Versandzeitpunkt, die
    // neue Vereinbarung geht mit einem neuen hinaus. Die alte Sperre darf
    // die neue Kette nicht verschlucken.
    const gesendet = new Set<string>();
    expect(lauf(wartend(), [2, 5, 10], gesendet).flat()).toHaveLength(3);
    const neu = wartend({ rvSignatureSentAt: tagX(20).toISOString() });
    expect(lauf(neu, [21, 22, 25, 30], gesendet)).toEqual([
      [],
      ["rv_unterschrift_2d"],
      ["rv_unterschrift_5d"],
      ["rv_unterschrift_10d"],
    ]);
  });

  it("bindet die Sperre an den Versandzeitpunkt", () => {
    expect(rvSperrSchluessel(RV_MAHN_STUFEN[0], VERSAND)).toBe(`rv_unterschrift_2d@${VERSAND.toISOString()}`);
  });

  it("schweigt, sobald der Kunde unterschrieben hat", () => {
    const gesendet = new Set<string>();
    expect(lauf(wartend(), [2], gesendet).flat()).toEqual(["rv_unterschrift_2d"]);
    // Ab hier ist unterschrieben: keine weitere Stufe mehr, auch nach Wochen.
    expect(lauf(wartend({ rvSigned: true, rvSignaturePending: false }), [5, 10, 40], gesendet).flat()).toEqual([]);
  });

  it("erzeugt ohne Zeitstempel nichts, auch nicht verspaetet", () => {
    const stand = rvUnterschriftStand(wartend({ rvSignatureSentAt: "" }), { jetzt: tagX(40) });
    expect(rvErinnerungLaeuft(stand)).toBe(false);
    expect(naechsteRvMahnung(stand, () => false)).toBeNull();
  });

  it("schickt nur die letzte Stufe an die Vertriebsleitung", () => {
    expect(RV_MAHN_STUFEN.map((s) => s.anVertriebsleitung)).toEqual([false, false, true]);
    expect(RV_MAHN_STUFEN.map((s) => s.tage)).toEqual([2, 5, 10]);
  });
});

describe("Stichtag RV_ERINNERUNG_AB", () => {
  it("liegt auf dem 25.09.2026, 00:00 Uhr deutscher Zeit", () => {
    expect(RV_ERINNERUNG_AB.toISOString()).toBe("2026-09-24T22:00:00.000Z");
    const berlin = RV_ERINNERUNG_AB.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
    expect(berlin).toBe("25.9.2026, 00:00:00");
  });

  it("laesst eine vorher versendete Vereinbarung ruhig, auch nach Wochen", () => {
    const alt = new Date(RV_ERINNERUNG_AB.getTime() - 60_000);
    const meta = wartend({ rvSignatureSentAt: alt.toISOString() });
    for (const tage of [2, 5, 10, 30, 90]) {
      const stand = rvUnterschriftStand(meta, { jetzt: new Date(alt.getTime() + tage * 86_400_000) });
      expect(stand.wartet).toBe(true);
      expect(rvErinnerungLaeuft(stand)).toBe(false);
      expect(naechsteRvMahnung(stand, () => false)).toBeNull();
    }
  });

  it("nimmt einen Versand genau zum Stichtag in die Kette auf", () => {
    const meta = wartend({ rvSignatureSentAt: RV_ERINNERUNG_AB.toISOString() });
    const stand = rvUnterschriftStand(meta, { jetzt: new Date(RV_ERINNERUNG_AB.getTime() + 2 * 86_400_000) });
    expect(naechsteRvMahnung(stand, () => false)?.stufe.schluessel).toBe("rv_unterschrift_2d");
  });
});

describe("Texte", () => {
  const angaben = { kundeName: "Anna Berger", investmentLabel: "Investment 1" };

  it("nennt in jeder Stufe die Dauer und sagt, was zu tun ist", () => {
    const [zwei, fuenf, zehn] = RV_MAHN_STUFEN.map((s, i) =>
      rvMahnTexte(s, { ...angaben, tage: [2, 5, 10][i] }),
    );
    expect(zwei.beschreibung).toContain("seit 2 Tagen");
    expect(fuenf.beschreibung).toContain("Ruf den Kunden heute an");
    expect(zehn.beschreibung).toContain("Vertriebsleitung");
    for (const t of [zwei, fuenf, zehn]) {
      expect(t.titel).toContain("Anna Berger");
      expect(t.beschreibung).toContain("Investment 1");
    }
  });

  it("gibt jeder Stufe einen eigenen Titel, damit keine die andere verdrängt", () => {
    const titel = RV_MAHN_STUFEN.map((s, i) => rvMahnTexte(s, { ...angaben, tage: [2, 5, 10][i] }).titel);
    expect(new Set(titel).size).toBe(3);
  });

  it("verwendet keine Gedankenstriche in nutzersichtbaren Texten", () => {
    for (const [i, s] of RV_MAHN_STUFEN.entries()) {
      const t = rvMahnTexte(s, { ...angaben, tage: [2, 5, 10][i] });
      expect(`${t.titel} ${t.beschreibung}`).not.toMatch(/[–—]/);
    }
    const vl = rvVertriebsleitungTexte({ ...angaben, tage: 10, partnerName: "Max Muster" });
    expect(`${vl.titel} ${vl.beschreibung} ${rvWartetKachelText(3)}`).not.toMatch(/[–—]/);
  });

  it("sagt der Vertriebsleitung, um wen es geht und wer zuständig ist", () => {
    const vl = rvVertriebsleitungTexte({ ...angaben, tage: 12, partnerName: "Max Muster" });
    expect(vl.titel).toContain("Anna Berger");
    expect(vl.beschreibung).toContain("seit 12 Tagen");
    expect(vl.beschreibung).toContain("Zuständig ist Max Muster");
    // Keine Anweisung an den Partner in der Glocke der Vertriebsleitung.
    expect(vl.beschreibung).not.toContain("Nimm heute");
    expect(rvVertriebsleitungTexte({ ...angaben, tage: 12 }).beschreibung).not.toContain("Zuständig");
  });

  it("beugt den Tag richtig", () => {
    expect(tageText(1)).toBe("1 Tag");
    expect(tageText(2)).toBe("2 Tagen");
    expect(rvWartetKachelText(3)).toBe("Reservierungsvereinbarung wartet seit 3 Tagen auf Unterschrift");
    expect(rvWartetKachelText(1)).toBe("Reservierungsvereinbarung wartet seit 1 Tag auf Unterschrift");
    expect(rvWartetKachelText(null)).toBe("Reservierungsvereinbarung versendet, wartet auf Unterschrift");
  });
});
