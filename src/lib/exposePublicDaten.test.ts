import { describe, expect, it, vi } from "vitest";
import * as cache from "./dataCache";
import { ansprechpartnerAusAntwort, exposePayloadZuObjekt, baueObjektExposeInhalt, gesamtobjektZahlen, grundrisseAusAntwort, objektExposeRecheneinheit, wieImKundenlink } from "./exposePublicDaten";
import { baueExposeInhalt } from "./exposeInhalt";

function payload() {
  return {
    objekt: { id: "o1", titel: "Objekt am Park", adresse: "Parkstraße 8", plz: "86150", ort: "Augsburg", sichtbar: true, bild_url: "https://example.org/cover.jpg", global_baujahr: 1984, meta: { verwaltungLeistungen: ["Mieterbetreuung"], standortargumente: ["Gute Anbindung. Öffentliche Verkehrsmittel in der Nähe."] } },
    bilder: [{ id:"b1", url:"https://example.org/object.jpg", reihenfolge:1 }],
    dokumente: [
      { id:"d1", name:"Energieausweis", url:"https://example.org/energy.pdf", kategorie:"objektunterlagen", sichtbar:true },
      { id:"d2", name:"Intern", url:"https://example.org/secret.pdf", kategorie:"intern", sichtbar:true },
      { id:"d3", name:"Unsichtbar", url:"https://example.org/hidden.pdf", kategorie:"objektunterlagen", sichtbar:false },
      { id:"d4", name:"Grundriss WE 8", url:"https://example.org/we8.pdf", kategorie:"objektunterlagen", sichtbar:true },
    ],
    wohnungen: [
      { id:"w7", we_nr:"7", groesse:65, zimmer:3, vk_gesamt:240000, miete_gesamt:800, status:"frei", meta:{ stellplatzPreis:10000, bilder:[{id:"bw",url:"https://example.org/unit.jpg",reihenfolge:0}], dokumente:[{id:"dw",name:"Grundriss WE 7",url:"https://example.org/we7.pdf",kategorie:"wohnungsunterlagen"},{id:"private",name:"Intern",url:"https://example.org/tenant.pdf",kategorie:"intern"}] } },
      { id:"w8", we_nr:"8", groesse:80, zimmer:4, vk_gesamt:310000, miete_gesamt:950, status:"verkauft", meta:{} },
    ],
  };
}

describe("Live Exposé-Daten", () => {
  it("übernimmt Einheitspreis, Stellplatz und Bilder aus den Daten und ergänzt gemeinsame Bilder", () => {
    const o = exposePayloadZuObjekt(payload());
    const c = baueExposeInhalt({objekt:o,wohnung:o.wohnungen[0]});
    expect(c.wirtschaftlichkeit.objektdaten.kaufpreis).toBe(240000);
    expect(c.wirtschaftlichkeit.objektdaten.stellplatzpreis).toBe(10000);
    expect(c.start.bilder.map(b=>b.url)).toEqual(["https://example.org/unit.jpg","https://example.org/object.jpg","https://example.org/cover.jpg"]);
    expect(c.verwaltung.leistungen).toEqual(["Mieterbetreuung"]);
  });
  it("übernimmt Änderungen beim erneuten Datenaufbau ohne statische Beispieldaten", () => {
    const p = payload();
    p.wohnungen[0].vk_gesamt=278000;
    p.wohnungen[0].meta.bilder[0].url="https://example.org/new.jpg";
    const o=exposePayloadZuObjekt(p), c=baueExposeInhalt({objekt:o,wohnung:o.wohnungen[0]});
    expect(c.wirtschaftlichkeit.objektdaten.kaufpreis).toBe(278000);
    expect(c.start.bilder[0].url).toBe("https://example.org/new.jpg");
  });
  it("liest für öffentliche Exposés niemals private Dokumente aus dem lokalen Cache", () => {
    const spy=vi.spyOn(cache,"cacheFilter");
    const o=exposePayloadZuObjekt(payload());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    const c=baueExposeInhalt({objekt:o,wohnung:o.wohnungen[0]});
    expect(c.dokumente?.map(d=>d.name)).toEqual(["Grundriss WE 7","Energieausweis"]);
    expect(c.grundriss.dokumente.map(d=>d.url)).toEqual(["https://example.org/we7.pdf"]);
  });
  it("verwendet in einer Projektübersicht keine beliebige Einheit als Gesamtobjekt", () => {
    const c=baueObjektExposeInhalt({objekt:exposePayloadZuObjekt(payload())});
    expect(c.kopf.weNr).toBe("");
    expect(c.kopf.titel).toBe("Objekt am Park");
    expect(c.wirtschaftlichkeit.verfuegbar).toBe(false);
    expect(c.einheiten).toHaveLength(2);
    expect(c.start.kennzahlen.find(k=>k.label==="Verfügbar")?.wert).toBe("1");
    expect(c.objektdaten.zeilen.some(k=>k.label==="Vermietung")).toBe(false);
  });
  it("rechnet beim Gesamtverkauf mit hinterlegten Globalzahlen", () => {
    const p=payload();
    Object.assign(p.objekt,{global_objekt:true,global_verkaufspreis:1400000,global_jahresnettomiete:72000,global_gesamt_qm:650});
    const c=baueObjektExposeInhalt({objekt:exposePayloadZuObjekt(p)});
    expect(c.wirtschaftlichkeit.verfuegbar).toBe(true);
    expect(c.wirtschaftlichkeit.objektdaten.kaufpreis).toBe(1400000);
    expect(c.wirtschaftlichkeit.objektdaten.kaltmieteMonat).toBe(6000);
  });
  it("erfindet keine Verwaltungstätigkeiten und rechnet nicht mit fehlendem Kaufpreis", () => {
    const p=payload(); delete p.objekt.meta.verwaltungLeistungen; p.wohnungen[0].vk_gesamt=0;
    const o=exposePayloadZuObjekt(p), c=baueExposeInhalt({objekt:o,wohnung:o.wohnungen[0]});
    expect(c.verwaltung.leistungen).toEqual([]);
    expect(c.wirtschaftlichkeit.verfuegbar).toBe(false);
  });
});

describe("Globalobjekt und Kundenlink seit dem 23.09.2026", () => {
  it("zeigt beim Globalobjekt Kaufpreis, Fläche, Miete und Hausgeld des ganzen Hauses und einen Mietenspiegel", () => {
    const p = payload();
    Object.assign(p.objekt, { global_objekt: true, global_verkaufspreis: 1400000, global_jahresnettomiete: 72000, global_gesamt_qm: 650, global_hausgeld_monat: 900 });
    const c = baueObjektExposeInhalt({ objekt: exposePayloadZuObjekt(p) });
    expect(c.struktur).toBe("globalobjekt");
    // „Einheiten“ nur mit gepflegter Zahl (`meta.einheitenImHaus`), seit 24.09.2026.
    expect(c.start.kennzahlen.map((k) => k.label)).toEqual(["Kaufpreis Gesamtobjekt", "Wohnfläche gesamt", "Jahresnettokaltmiete", "Mietrendite"]);
    (p.objekt.meta as Record<string, unknown>).einheitenImHaus = 6;
    const mitZahl = baueObjektExposeInhalt({ objekt: exposePayloadZuObjekt(p) });
    expect(mitZahl.start.kennzahlen.find((k) => k.label === "Einheiten")?.wert).toBe("6");
    expect(mitZahl.objektdaten.zeilen.find((z) => z.label === "Einheiten")?.wert).toBe("6");
    const zeile = (label: string) => c.objektdaten.zeilen.find((z) => z.label === label);
    expect(zeile("Kaufpreis je m²")?.wert).toMatch(/2\.154\s€/);
    expect(zeile("Hausgeld je Monat")?.unter).toBe("ganzes Haus");
    expect(c.einheiten?.[0]).toMatchObject({ nummer: "7", miete: 800 });
    // Seit dem 23.09.2026 steht im Zeitstrahl keine Gebühr mehr, nur die kurze
    // Angabe der Vorlage; der Betrag steht allein in der Reservierungsvereinbarung.
    expect(c.zeitplan[0]).toMatchObject({ titel: "Reservierung", frist: "Mit Anzahlung wirksam", zahlung: true });
    expect(JSON.stringify(c.zeitplan)).not.toMatch(/€|Werkvertrag/);
    // Kopf: die Adresse des Hauses ohne Wohneinheit, der Objektname darunter.
    expect(c.kopf.ueberschrift).toBe("Parkstraße 8, 86150 Augsburg");
    expect(c.kopf.ortszeile).toEqual(["Augsburg", "Objekt am Park", "Gesamtobjekt"]);
  });

  it("nimmt beim Globalobjekt ohne gepflegte Fläche und Miete die Summe der Einheiten, nie einen summierten Kaufpreis", () => {
    const p = payload();
    Object.assign(p.objekt, { global_objekt: true });
    const o = exposePayloadZuObjekt(p);
    const z = gesamtobjektZahlen(o);
    expect(z).toMatchObject({ kaufpreis: 0, flaeche: 145, flaecheAusEinheiten: true, mieteJahr: 1750 * 12, mieteAusEinheiten: true });
    const c = baueObjektExposeInhalt({ objekt: o });
    expect(c.wirtschaftlichkeit.verfuegbar).toBe(false);
    expect(c.start.kennzahlen.find((k) => k.label === "Kaufpreis Gesamtobjekt")).toBeUndefined();
    expect(c.objektdaten.zeilen.find((k) => k.label === "Wohnfläche gesamt")?.unter).toBe("Summe der Einheiten");
  });

  it("setzt beim Globalobjekt den nicht umlegbaren Hausgeldanteil des ganzen Hauses", () => {
    const p = payload();
    Object.assign(p.objekt, { global_objekt: true, global_verkaufspreis: 1400000, global_hausgeld_monat: 1000 });
    const einheit = objektExposeRecheneinheit(exposePayloadZuObjekt(p));
    expect(einheit.hausgeldMonat).toBe(1000);
    expect(einheit.hausgeldNichtUmlagefaehigEuro).toBe(300);
  });

  it("zeigt den Partner in der Vorschau nur mit dem, was auch der Kundenlink herausgibt", () => {
    const intern = { name: "Paula Partner", rolle: "Vertriebspartnerin", telefon: "+49 89 1", email: "p@example.com", buchungslink: "https://cal.example/p", avatarUrl: "https://example.org/p.jpg" };
    expect(wieImKundenlink(intern)).toEqual({ name: "Paula Partner", rolle: "Dein Ansprechpartner", telefon: "+49 89 1", email: "p@example.com", avatarUrl: "https://example.org/p.jpg" });
  });

  it("liest den Ansprechpartner aus der Antwort nur mit Name, Telefon, E-Mail und https-Bild", () => {
    expect(ansprechpartnerAusAntwort({ name: "Paula Partner", telefon: "+49 89 1", email: "p@example.com", bild: "https://example.org/p.jpg", id: "u2" }))
      .toEqual({ name: "Paula Partner", rolle: "Dein Ansprechpartner", telefon: "+49 89 1", email: "p@example.com", avatarUrl: "https://example.org/p.jpg" });
    expect(ansprechpartnerAusAntwort({ name: "Ohne", bild: "javascript:alert(1)" })?.avatarUrl).toBeUndefined();
    expect(ansprechpartnerAusAntwort({ name: " " })).toBeUndefined();
    expect(ansprechpartnerAusAntwort(undefined)).toBeUndefined();
  });
});

describe("Grundrisse im Kundenlink seit dem 23.09.2026", () => {
  it("liest nur Kennung, Bereich, Einheit, Name und Bildangabe, nie eine Adresse", () => {
    const liste = grundrisseAusAntwort([
      { id: "wd-g7", bereich: "wohnung", wohnungId: "w7", name: " Grundriss WE 7 ", istBild: true, url: "https://tool.investagon.com/files/g.png", ablage: { eimer: "investagon-dokumente", pfad: "o1/g.png" } },
      { id: "od-haus", bereich: "objekt", wohnungId: "w7", name: "Pläne Haus 9", istBild: "ja" },
    ]);
    expect(liste).toEqual([
      { id: "wd-g7", bereich: "wohnung", wohnungId: "w7", name: "Grundriss WE 7", istBild: true },
      { id: "od-haus", bereich: "objekt", wohnungId: null, name: "Pläne Haus 9", istBild: false },
    ]);
    expect(JSON.stringify(liste)).not.toMatch(/investagon|https|ablage/);
  });

  it("verwirft Einträge ohne Kennung, mit fremdem Bereich, ohne Namen und doppelte", () => {
    expect(grundrisseAusAntwort([
      { bereich: "objekt", name: "ohne Kennung" },
      { id: "../x", bereich: "objekt", name: "Pfad als Kennung" },
      { id: "k1", bereich: "kunde", name: "fremder Bereich" },
      { id: "k2", bereich: "objekt", name: "  " },
      { id: "k3", bereich: "objekt", name: "Plan" },
      { id: "k3", bereich: "objekt", name: "Plan doppelt" },
      null, 3, "text",
    ]).map((g) => g.id)).toEqual(["k3"]);
    expect(grundrisseAusAntwort(undefined)).toEqual([]);
    expect(grundrisseAusAntwort({ id: "k1" })).toEqual([]);
  });
});
