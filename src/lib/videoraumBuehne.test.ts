import { describe, it, expect } from "vitest";
import { bestimmeBuehne, merkeTeilende } from "@/lib/videoraumBuehne";
import type { Gegenstelle } from "@/lib/videoraumVerbindung";

/**
 * Die Regie der Buehne.
 *
 * Der Anlass: Waehrend des Teilens sah der Gastgeber in seiner eigenen Kachel
 * weiter die Kamera und den geteilten Inhalt ueberhaupt nicht. Er konnte also
 * nicht pruefen, ob er das richtige Fenster erwischt hat, und haette im
 * schlimmsten Fall sein Postfach gezeigt, ohne es zu merken. Beim Gast fuellte
 * der Bildschirm die Flaeche nur zufaellig, weil dort eine einzige Gegenstelle
 * stand. Ab zwei Gaesten rutschte er in eine Rasterkachel.
 *
 * Seitdem entscheidet diese eine Funktion fuer beide Seiten.
 */

/** Ein Strom, der nur zum Unterscheiden da ist. Angefasst wird er nie. */
const strom = (kennzeichen: string) => ({ kennzeichen }) as unknown as MediaStream;

function gegenstelle(kennung: string, name: string, mitStrom = true): Gegenstelle {
  return { kennung, name, stream: mitStrom ? strom(kennung) : null, zustand: "verbunden" };
}

/**
 * Eine Gegenstelle, die nach dem neuen Weg teilt: Gesicht und Bildschirm als
 * zwei Stroeme. `bildschirmErwartet` ist die Ankuendigung aus dem Rundruf,
 * `bildschirm` die Spur, sobald sie da ist.
 */
function teilendeGegenstelle(
  kennung: string,
  name: string,
  bildschirmDa = true,
): Gegenstelle {
  return {
    kennung,
    name,
    stream: strom(kennung),
    bildschirm: bildschirmDa ? strom(`${kennung}-schirm`) : null,
    bildschirmErwartet: true,
    zustand: "verbunden",
  };
}

describe("bestimmeBuehne, Alltag ohne Teilen", () => {
  it("stapelt bei genau zwei im Raum beide Bilder gleich gross", () => {
    // Christian am 18.09.2026: „kannst du wenn nur zwei im videoraum sind,
    // dann in der gastgebersicht diese beide untereinander anzeigen." Damit
    // sieht sich jeder in voller Groesse, ohne dass ein kleines Fenster dem
    // Gegenueber im Bild steht.
    const bild = bestimmeBuehne({
      gegenstellen: [gegenstelle("gast-a", "Martina Brandl")],
      teilendeGegenstellen: [],
      eigenesTeilen: false,
    });
    expect(bild.art).toBe("gestapelt");
    expect(bild.geteilt).toBeNull();
    expect(bild.eigenesBild).toBe("kachel");
    expect(bild.kameras.map((k) => k.kennung)).toEqual(["gast-a"]);
  });

  it("laesst das eigene Bild in der Ecke, solange niemand da ist", () => {
    // Allein im Raum gibt es nichts zu stapeln, da steht der Wartehinweis.
    const bild = bestimmeBuehne({ gegenstellen: [], teilendeGegenstellen: [], eigenesTeilen: false });
    expect(bild.art).toBe("kameras");
    expect(bild.eigenesBild).toBe("ecke");
  });

  it("haelt auch mehrere Gegenstellen zusammen", () => {
    const bild = bestimmeBuehne({
      gegenstellen: [gegenstelle("gast-a", "A"), gegenstelle("gast-b", "B"), gegenstelle("gast-c", "C")],
      teilendeGegenstellen: [],
      eigenesTeilen: false,
    });
    // Ab drei Personen teilt das Raster den Platz schon auf, das eigene Bild
    // geht zurueck in die Ecke.
    expect(bild.art).toBe("kameras");
    expect(bild.kameras).toHaveLength(3);
    expect(bild.eigenesBild).toBe("ecke");
  });
});

describe("bestimmeBuehne, ich teile selbst", () => {
  it("stellt meine Vorschau gross und mein Bild in die Reihe", () => {
    const bildschirm = strom("eigener-bildschirm");
    const bild = bestimmeBuehne({
      gegenstellen: [gegenstelle("gast-a", "Martina Brandl")],
      teilendeGegenstellen: [],
      eigenesTeilen: true,
      eigenerBildschirm: bildschirm,
    });
    expect(bild.art).toBe("teilen");
    expect(bild.geteilt?.eigen).toBe(true);
    expect(bild.geteilt?.stream).toBe(bildschirm);
    expect(bild.eigenesBild).toBe("reihe");
  });

  it("stellt die eigene Vorschau stumm, sonst hoerte man sich selbst", () => {
    const bild = bestimmeBuehne({
      gegenstellen: [], teilendeGegenstellen: [], eigenesTeilen: true, eigenerBildschirm: strom("b"),
    });
    expect(bild.geteilt?.stumm).toBe(true);
  });

  it("laesst alle Gegenstellen als kleine Kacheln stehen", () => {
    const bild = bestimmeBuehne({
      gegenstellen: [gegenstelle("gast-a", "A"), gegenstelle("gast-b", "B")],
      teilendeGegenstellen: [],
      eigenesTeilen: true,
      eigenerBildschirm: strom("b"),
    });
    expect(bild.kameras.map((k) => k.kennung)).toEqual(["gast-a", "gast-b"]);
  });

  it("zeigt den Rahmen auch, solange die Vorschau noch fehlt", () => {
    // Sonst haette der Gastgeber einen Moment lang sein Kamerabild gross vor
    // sich, obwohl schon ein Bildschirm hinausgeht.
    const bild = bestimmeBuehne({
      gegenstellen: [], teilendeGegenstellen: [], eigenesTeilen: true, eigenerBildschirm: null,
    });
    expect(bild.art).toBe("teilen");
    expect(bild.geteilt?.stream).toBeNull();
  });
});

/**
 * Der Regelfall seit dem 18.09.2026: Wer teilt, schickt Gesicht und
 * Bildschirm zugleich. Christian: „der Gast soll mich beim Teilen auch noch
 * weiter sehen können."
 */
describe("bestimmeBuehne, jemand anderes teilt mit zwei Stroemen", () => {
  it("stellt den Bildschirm gross und laesst sein Gesicht in der Reihe stehen", () => {
    const gastgeber = teilendeGegenstelle("gastgeber", "Christian Peetz");
    const bild = bestimmeBuehne({
      gegenstellen: [gastgeber],
      teilendeGegenstellen: ["gastgeber"],
      eigenesTeilen: false,
    });
    expect(bild.art).toBe("teilen");
    expect(bild.geteilt?.eigen).toBe(false);
    expect(bild.geteilt?.name).toBe("Christian Peetz");
    // Genau der zweite Strom, nicht das Gesicht.
    expect(bild.geteilt?.stream).toBe(gastgeber.bildschirm);
    expect(bild.geteilt?.stream).not.toBe(gastgeber.stream);
    // Er faellt NICHT aus der Reihe. Genau das war der Auftrag.
    expect(bild.kameras.map((k) => k.kennung)).toEqual(["gastgeber"]);
    expect(bild.eigenesBild).toBe("reihe");
  });

  it("stellt die grosse Flaeche stumm, weil die Stimme in der Kachel sitzt", () => {
    // Der Ton haengt am Alltagsstrom, und der steht in der Kamerakachel. Waere
    // die grosse Flaeche nicht stumm, liefe dieselbe Stimme zweimal.
    const bild = bestimmeBuehne({
      gegenstellen: [teilendeGegenstelle("gastgeber", "Christian Peetz")],
      teilendeGegenstellen: ["gastgeber"],
      eigenesTeilen: false,
    });
    expect(bild.geteilt?.stumm).toBe(true);
  });

  it("zeigt den Rahmen schon, bevor die Bildschirmspur da ist", () => {
    /*
     * Zwischen der Ankuendigung und der fertigen Aushandlung liegen ein paar
     * hundert Millisekunden. In dieser Zeit darf nicht das Gesicht gross unter
     * der Ueberschrift „Bildschirm von …" stehen, sondern der leere Rahmen mit
     * dem Hinweis, dass die Vorschau aufgebaut wird.
     */
    const bild = bestimmeBuehne({
      gegenstellen: [teilendeGegenstelle("gastgeber", "Christian Peetz", false)],
      teilendeGegenstellen: ["gastgeber"],
      eigenesTeilen: false,
    });
    expect(bild.art).toBe("teilen");
    expect(bild.geteilt?.stream).toBeNull();
    expect(bild.geteilt?.name).toBe("Christian Peetz");
    expect(bild.kameras.map((k) => k.kennung)).toEqual(["gastgeber"]);
  });

  it("geht nach dem Beenden zurueck auf den Stapel, mit demselben Gesicht", () => {
    const danach = bestimmeBuehne({
      gegenstellen: [gegenstelle("gastgeber", "Christian Peetz")],
      teilendeGegenstellen: [],
      eigenesTeilen: false,
    });
    expect(danach.art).toBe("gestapelt");
    expect(danach.eigenesBild).toBe("kachel");
    expect(danach.kameras.map((k) => k.kennung)).toEqual(["gastgeber"]);
  });
});

describe("bestimmeBuehne, jemand anderes teilt", () => {
  it("stellt den fremden Bildschirm gross und laesst seine Kamerakachel weg", () => {
    // Ein aelterer Stand auf der Gegenseite tauscht die Videospur aus, statt
    // eine zweite zu schicken: In seinem Strom steckt der Bildschirm, sein
    // Gesicht gibt es gerade nicht. Er kuendigt deshalb auch nichts an.
    const bild = bestimmeBuehne({
      gegenstellen: [gegenstelle("gast-a", "Martina Brandl"), gegenstelle("gast-b", "Peter Huber")],
      teilendeGegenstellen: ["gast-a"],
      eigenesTeilen: false,
    });
    expect(bild.art).toBe("teilen");
    expect(bild.geteilt?.eigen).toBe(false);
    expect(bild.geteilt?.name).toBe("Martina Brandl");
    expect(bild.geteilt?.stumm).toBe(false);
    expect(bild.kameras.map((k) => k.kennung)).toEqual(["gast-b"]);
    expect(bild.eigenesBild).toBe("reihe");
  });

  it("bleibt beim Alltagsbild, solange von ihm noch kein Strom da ist", () => {
    const bild = bestimmeBuehne({
      gegenstellen: [gegenstelle("gast-a", "Martina Brandl", false)],
      teilendeGegenstellen: ["gast-a"],
      eigenesTeilen: false,
    });
    expect(bild.art).toBe("gestapelt");
  });

  it("gibt dem eigenen Bildschirm Vorrang, wenn beide teilen", () => {
    // Wer etwas hinausgibt, muss sehen, was hinausgeht.
    const bild = bestimmeBuehne({
      gegenstellen: [gegenstelle("gast-a", "Martina Brandl")],
      teilendeGegenstellen: ["gast-a"],
      eigenesTeilen: true,
      eigenerBildschirm: strom("eigener"),
    });
    expect(bild.geteilt?.eigen).toBe(true);
  });

  it("waehlt bei mehreren Freigaben die erste, damit beide Seiten dieselbe waehlen", () => {
    const bild = bestimmeBuehne({
      gegenstellen: [gegenstelle("gast-a", "A"), gegenstelle("gast-b", "B")],
      teilendeGegenstellen: ["gast-b", "gast-a"],
      eigenesTeilen: false,
    });
    expect(bild.geteilt?.name).toBe("A");
  });
});

describe("bestimmeBuehne, Rueckweg", () => {
  it("springt nach dem Beenden wieder auf das Alltagsbild um", () => {
    const gaeste = [gegenstelle("gast-a", "Martina Brandl")];
    const waehrend = bestimmeBuehne({
      gegenstellen: gaeste, teilendeGegenstellen: [], eigenesTeilen: true, eigenerBildschirm: strom("b"),
    });
    const danach = bestimmeBuehne({
      gegenstellen: gaeste, teilendeGegenstellen: [], eigenesTeilen: false, eigenerBildschirm: null,
    });
    expect(waehrend.art).toBe("teilen");
    expect(danach.art).toBe("gestapelt");
    expect(danach.eigenesBild).toBe("kachel");
    expect(danach.kameras.map((k) => k.kennung)).toEqual(["gast-a"]);
  });

  it("springt auch dann um, wenn die Gegenstelle das Teilen beendet", () => {
    const gaeste = [gegenstelle("gast-a", "Martina Brandl")];
    const danach = bestimmeBuehne({ gegenstellen: gaeste, teilendeGegenstellen: [], eigenesTeilen: false });
    expect(danach.art).toBe("gestapelt");
    expect(danach.kameras).toHaveLength(1);
  });
});

describe("bestimmeBuehne, beide Seiten desselben Raums", () => {
  /*
   * Gast und Gastgeber fragen dieselbe Funktion, nur mit ihrer jeweiligen
   * Sicht. Herauskommen muss dieselbe Anordnung, sonst sitzt jeder vor einem
   * anderen Bild und redet an der Ecke des anderen vorbei.
   */
  const ausSichtDesGastgebers = { gegenstellen: [gegenstelle("gast-a", "Martina Brandl")] };
  const ausSichtDesGastes = { gegenstellen: [gegenstelle("gastgeber", "Christian Peetz")] };

  it("gibt ohne Teilen beiden denselben Stapel", () => {
    // Der gemeldete Fehler: „Weder der Gastgeber noch der Gast sehen in einer
    // kleinen Kamera ihr eigenes Bild." Und Christians Vorgabe dazu: „und bei
    // der gastversion genau das gleiche."
    const gastgeber = bestimmeBuehne({ ...ausSichtDesGastgebers, teilendeGegenstellen: [], eigenesTeilen: false });
    const gast = bestimmeBuehne({ ...ausSichtDesGastes, teilendeGegenstellen: [], eigenesTeilen: false });
    expect(gastgeber.eigenesBild).toBe("kachel");
    expect(gast.eigenesBild).toBe("kachel");
    expect(gastgeber.art).toBe("gestapelt");
    expect(gast.art).toBe("gestapelt");
  });

  it("gibt beim Teilen beiden die Reihe, egal wer von beiden teilt", () => {
    // Der Gastgeber teilt: Bei ihm ist es die eigene Vorschau, beim Gast der
    // fremde Bildschirm. Das eigene Bild rutscht bei beiden aus der Ecke, sonst
    // laege es dem einen wie dem anderen auf dem geteilten Inhalt.
    const gastgeber = bestimmeBuehne({
      ...ausSichtDesGastgebers, teilendeGegenstellen: [], eigenesTeilen: true, eigenerBildschirm: strom("schirm"),
    });
    const gast = bestimmeBuehne({
      ...ausSichtDesGastes, teilendeGegenstellen: ["gastgeber"], eigenesTeilen: false,
    });
    expect(gastgeber.art).toBe("teilen");
    expect(gast.art).toBe("teilen");
    expect(gastgeber.eigenesBild).toBe("reihe");
    expect(gast.eigenesBild).toBe("reihe");
  });
});

describe("merkeTeilende", () => {
  it("merkt sich eine Freigabe und nimmt sie wieder zurueck", () => {
    const eins = merkeTeilende([], "gast-a", true, ["gast-a"]);
    expect(eins).toEqual(["gast-a"]);
    expect(merkeTeilende(eins, "gast-a", false, ["gast-a"])).toEqual([]);
  });

  it("merkt sich niemanden doppelt", () => {
    const eins = merkeTeilende(["gast-a"], "gast-a", true, ["gast-a"]);
    expect(eins).toEqual(["gast-a"]);
  });

  it("vergisst, wer den Raum verlassen hat", () => {
    // Sonst haenge die Buehne bei der naechsten Freigabe an einem Teilnehmer,
    // den es nicht mehr gibt.
    expect(merkeTeilende(["gast-a"], "gast-b", true, ["gast-b"])).toEqual(["gast-b"]);
  });
});

describe("bestimmeBuehne, schmale Ansicht auf dem Telefon", () => {
  /*
   * Christian am 18.09.2026: „und wenn man mobil in den videoraum eingeloggt
   * ist dann bei zwei soll der bildschirm sich teilen, oben ist gastgeber und
   * unten ueber die breite ist gast, wenn drei oder 4 im videoraum sind dann
   * bitte den bildschirm 4 teilen."
   */
  const ohneTeilen = { teilendeGegenstellen: [], eigenesTeilen: false };

  it("stellt zu zweit den Gastgeber oben, auf beiden Seiten", () => {
    const beimGastgeber = bestimmeBuehne({
      ...ohneTeilen, gegenstellen: [gegenstelle("gast-a", "Martina Brandl")], schmal: true, istGastgeber: true,
    });
    expect(beimGastgeber.art).toBe("gestapelt");
    expect(beimGastgeber.eigenesOben).toBe(true);

    // Beim Gast steht oben sein Gegenueber, und das ist der Gastgeber.
    const beimGast = bestimmeBuehne({
      ...ohneTeilen, gegenstellen: [gegenstelle("gastgeber", "Christian Peetz")], schmal: true,
    });
    expect(beimGast.eigenesOben).toBe(false);
  });

  it("gibt den beiden Haelften die volle Breite", () => {
    const bild = bestimmeBuehne({
      ...ohneTeilen, gegenstellen: [gegenstelle("gast-a", "Martina Brandl")], schmal: true,
    });
    expect(bild.fuellend).toBe(true);
  });

  it("viertelt ab drei Personen und nimmt das eigene Bild ins Raster", () => {
    const drei = bestimmeBuehne({
      ...ohneTeilen,
      gegenstellen: [gegenstelle("a", "Martina"), gegenstelle("b", "Peter")],
      schmal: true,
    });
    expect(drei.art).toBe("kameras");
    expect(drei.eigenesBild).toBe("raster");

    const vier = bestimmeBuehne({
      ...ohneTeilen,
      gegenstellen: [gegenstelle("a", "Martina"), gegenstelle("b", "Peter"), gegenstelle("c", "Hermann")],
      schmal: true,
    });
    expect(vier.eigenesBild).toBe("raster");
  });

  it("aendert am Rechner nichts", () => {
    const zweit = bestimmeBuehne({
      ...ohneTeilen, gegenstellen: [gegenstelle("gast-a", "Martina Brandl")], istGastgeber: true,
    });
    expect(zweit.eigenesBild).toBe("kachel");
    expect(zweit.fuellend).toBe(false);
    // Auch beim Gastgeber steht am Rechner das Gegenueber oben.
    expect(zweit.eigenesOben).toBe(false);

    const dritt = bestimmeBuehne({
      ...ohneTeilen, gegenstellen: [gegenstelle("a", "Martina"), gegenstelle("b", "Peter")],
    });
    expect(dritt.eigenesBild).toBe("ecke");
  });

  it("laesst das Bildschirmteilen auch auf dem Telefon, wie es ist", () => {
    const bild = bestimmeBuehne({
      gegenstellen: [gegenstelle("gast-a", "Martina Brandl")],
      teilendeGegenstellen: [],
      eigenesTeilen: true,
      eigenerBildschirm: strom("schirm"),
      schmal: true,
      istGastgeber: true,
    });
    expect(bild.art).toBe("teilen");
    expect(bild.eigenesBild).toBe("reihe");
    expect(bild.fuellend).toBe(false);
    expect(bild.eigenesOben).toBe(false);
  });

  it("laesst den allein Wartenden in der Ecke", () => {
    // Ein Raster mit einer einzigen Kachel waere kein Raster.
    const bild = bestimmeBuehne({ ...ohneTeilen, gegenstellen: [], schmal: true });
    expect(bild.eigenesBild).toBe("ecke");
  });
});
