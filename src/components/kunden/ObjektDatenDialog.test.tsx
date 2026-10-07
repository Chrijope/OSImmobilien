import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

/**
 * Das Fenster der Objektauswahl, vier Schritte.
 *
 * Seit 09/2026 ist auch Schritt 2 „Kennzahlen“ Pflicht, Verkäufer und Später
 * bleiben freiwillig. Pflicht heißt gekennzeichnet und aufgezählt, nicht
 * verriegelt: Gespeichert wird weiterhin, sobald Schritt 1 steht, sonst
 * scheitert jeder, der das Exposé gerade nicht zur Hand hat, und trägt
 * Fantasiewerte ein.
 *
 * Geprüft wird deshalb beides: dass das Fenster die Lücken benennt, und dass
 * es trotzdem speichert und bis Schritt 4 durchlässt.
 */

const metaFelder: Record<string, any> = {};
const investment: Record<string, any> = { id: "inv-1", kontaktId: "k-1", pipelineStufe: "beratungsgespraech" };

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (id === investment.id ? investment : undefined),
  getInvestmentMetaField: (_id: string, key: string, fallback: any) => metaFelder[key] ?? fallback,
  setInvestmentMetaFields: (_id: string, felder: Record<string, any>) => { Object.assign(metaFelder, felder); },
  updateInvestment: () => {},
  getInvestmentsByKontakt: () => [],
}));

vi.mock("@/lib/objekteStore", () => ({ getWohnungKurz: () => null }));

/** Zählt die Uploads, damit jedes Bild eine eigene Adresse bekommt. */
let hochgeladen = 0;

vi.mock("@/lib/objektBildUpload", () => ({
  ladeObjektBildHoch: async () => {
    hochgeladen += 1;
    return { ok: true, url: `https://example.org/bild${hochgeladen}.jpg` };
  },
  loescheObjektBild: async () => {},
  ERLAUBTE_BILD_FORMATE: "image/jpeg,image/png,image/webp",
}));

const { ObjektDatenDialog } = await import("@/components/kunden/ObjektDatenDialog");

const tippe = (platzhalter: string, wert: string) =>
  fireEvent.change(screen.getByPlaceholderText(platzhalter), { target: { value: wert } });

const speichernKnopf = () => screen.getByRole("button", { name: "Speichern und später ergänzen" });

function zeige() {
  return render(
    <ObjektDatenDialog offen investmentId="inv-1" onAbbrechen={() => {}} onGespeichert={() => {}} />,
  );
}

/*
  Seit dem 22.09.2026 verlangt der Dialog beim Anlegen mindestens ein Bild,
  entschieden von Christian: Ein Kaufvorgang ohne Bild sieht im Kundenportal
  nach nichts aus. Die Tests hier legen fast alle ein neues Objekt an und
  brauchen deshalb eines, bevor der Speichern-Knopf freigibt.

  Genommen wird das letzte Dateifeld im Dokument: Manche Tests rendern den
  Dialog ein zweites Mal, und dann steht das erste Feld noch im alten Baum.
*/
async function bildAnhaengen() {
  const felder = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const feld = felder[felder.length - 1];
  await act(async () => {
    fireEvent.change(feld, { target: { files: [new File(["x"], "bild.jpg", { type: "image/jpeg" })] } });
  });
}

beforeEach(() => {
  for (const k of Object.keys(metaFelder)) delete metaFelder[k];
  investment.pipelineStufe = "beratungsgespraech";
  hochgeladen = 0;
});

describe("Schritt 1 allein genügt", () => {
  it("beginnt beim ersten Schritt", () => {
    zeige();
    // Der Name des Schritts steht zweimal, in der Überschrift und am Punkt.
    expect(screen.getAllByText("Wo liegt sie").length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("z. B. Roonstraße 3")).toBeTruthy();
    expect(screen.getByText(/Schritt/)).toBeTruthy();
  });

  it("lässt erst speichern, wenn die fünf Angaben und ein Bild stehen", async () => {
    zeige();
    expect(speichernKnopf()).toBeDisabled();
    tippe("z. B. Roonstraße 3", "Roonstraße 3");
    tippe("Hof", "Hof");
    tippe("z. B. 6", "6");
    tippe("z. B. 189000", "189.000");
    // Vier von fünf: Die PLZ fehlt noch, und sie ist jetzt Pflicht.
    expect(speichernKnopf()).toBeDisabled();
    tippe("95028", "95028");
    /*
      Fünf von fünf, und trotzdem grau: Seit dem 22.09.2026 gehört beim
      Anlegen mindestens ein Bild dazu. Ein Kaufvorgang ohne Bild sieht im
      Kundenportal nach nichts aus.
    */
    expect(speichernKnopf()).toBeDisabled();
    await bildAnhaengen();
    expect(speichernKnopf()).not.toBeDisabled();
  });

  it("verlangt bei einem bestehenden Investment kein Bild", async () => {
    /*
      Sonst käme niemand mehr an den Kaufpreis eines Vorgangs, der lange vor
      dieser Regel entstanden ist, ohne vorher ein Foto zu suchen.
    */
    metaFelder.kaufpreis = 189000;
    metaFelder.rvVirtualWohnung = {
      objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof", weNr: "6", kaufpreis: 189000,
    };
    zeige();
    expect(speichernKnopf()).not.toBeDisabled();
  });

  it("speichert die fünf Angaben und liest den Preis mit Tausenderpunkten richtig", async () => {
    zeige();
    tippe("z. B. Roonstraße 3", "Roonstraße 3");
    tippe("95028", "95028");
    tippe("Hof", "Hof");
    tippe("z. B. 6", "6");
    tippe("z. B. 189000", "189.000");
    await bildAnhaengen();
    fireEvent.click(speichernKnopf());
    expect(metaFelder.kaufpreis).toBe(189000);
    expect(metaFelder.rvVirtualWohnung.objAdresse).toBe("Roonstraße 3");
    expect(metaFelder.rvVirtualWohnung.objPlz).toBe("95028");
    expect(metaFelder.rvVirtualWohnung.weNr).toBe("6");
  });
});

describe("Die weiteren Schritte", () => {
  beforeEach(async () => {
    zeige();
    tippe("z. B. Roonstraße 3", "Roonstraße 3");
    tippe("95028", "95028");
    tippe("Hof", "Hof");
    tippe("z. B. 6", "6");
    tippe("z. B. 189000", "189.000");
    await bildAnhaengen();
  });

  it("sagt an jedem Feld, was es bewirkt", () => {
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByText("Portal-Kachel Zimmer")).toBeTruthy();
    expect(screen.getByText("Abschreibungssatz im Steuer-Cockpit. Beim Neubau bleibt es leer.")).toBeTruthy();
  });

  it("rechnet die Rendite mit, statt ein Eingabefeld anzubieten", () => {
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    tippe("620", "620");
    expect(screen.getByText("3,94 %")).toBeTruthy();
    expect(screen.getByText("Wird gerechnet, nicht getippt")).toBeTruthy();
  });

  it("trägt Kennzahlen, Verkäufer und Grundbuch bis in die Ablage", () => {
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Neubau" }));
    tippe("62", "62");
    tippe("2", "2");
    tippe("1996", "1996");
    tippe("620", "620");
    tippe("185", "185");

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    tippe("Musterbau Projektentwicklung GmbH", "Musterbau Projektentwicklung GmbH");
    tippe("Beispielallee 12", "Beispielallee 12");
    tippe("83022", "83022");
    tippe("Rosenheim", "Rosenheim");
    tippe("HRB 12345", "HRB 12345");

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    tippe("412/7", "412/7");
    tippe("2,41", "2,41");
    tippe("18", "18");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(metaFelder.rvVirtualWohnung.objektart).toBe("neubau");
    expect(metaFelder.rvVirtualWohnung.zimmer).toBe(2);
    expect(metaFelder.rvVirtualWohnung.baujahr).toBe(1996);
    expect(metaFelder.rvVirtualWohnung.miete).toBe(620);
    expect(metaFelder.rvVirtualWohnung.hausgeld).toBe(185);
    expect(metaFelder.rvVirtualWohnung.rendite).toBe(3.94);
    expect(metaFelder.jahresnettomiete).toBe(7440);
    expect(metaFelder.objektVerkaeufer.name).toBe("Musterbau Projektentwicklung GmbH");
    expect(metaFelder.objektVerkaeufer.handelsregister).toBe("HRB 12345");
    expect(metaFelder.objektGrundbuch.flurstueck).toBe("412/7");
    expect(metaFelder.objektGrundbuch.miteigentumsanteil).toBe(2.41);
    expect(metaFelder.grundstueckAnteil).toBe(18);
  });

  it("merkt sich beim Verkäufer, ob es eine Firma oder eine Privatperson ist", () => {
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    // Die Wahl steht vor den Namensfeldern.
    expect(screen.getByText("Wer verkauft?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Firma" }));
    tippe("Musterbau Projektentwicklung GmbH", "Musterbau Projektentwicklung GmbH");
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(metaFelder.objektVerkaeufer.art).toBe("firma");
    expect(metaFelder.objektVerkaeufer.name).toBe("Musterbau Projektentwicklung GmbH");
    // Eine Firma hat keinen Vornamen, und keiner wird erfunden.
    expect(metaFelder.objektVerkaeufer.vorname).toBe("");
  });

  it("führt eine Privatperson mit Vor- und Nachnamen getrennt", () => {
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Privatperson" }));
    tippe("Erika", "Erika");
    tippe("Mustermann", "Mustermann");
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(metaFelder.objektVerkaeufer.art).toBe("person");
    expect(metaFelder.objektVerkaeufer.vorname).toBe("Erika");
    expect(metaFelder.objektVerkaeufer.name).toBe("Mustermann");
  });

  it("lässt den Namen stehen, solange niemand gewählt hat", () => {
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    // Ohne Wahl gibt es ein neutrales Namensfeld, so wie bisher.
    tippe("Musterbau Projektentwicklung GmbH", "Musterbau Projektentwicklung GmbH");
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(metaFelder.objektVerkaeufer.art).toBe("");
    expect(metaFelder.objektVerkaeufer.name).toBe("Musterbau Projektentwicklung GmbH");
  });
});

describe("Schritt 2 ist Pflicht, aber keine Sperre", () => {
  const pflichtAngaben = async () => {
    tippe("z. B. Roonstraße 3", "Roonstraße 3");
    tippe("95028", "95028");
    tippe("Hof", "Hof");
    tippe("z. B. 6", "6");
    tippe("z. B. 189000", "189.000");
    await bildAnhaengen();
  };

  /** Die Kennzahlen, ohne Baujahr und ohne Fertigstellung. */
  const kennzahlenOhneJahr = () => {
    fireEvent.click(screen.getByRole("button", { name: "Sanierter Bestand" }));
    tippe("62", "62");
    tippe("2", "2");
    tippe("2. OG", "2. OG");
    tippe("links oder Südwest", "links");
    tippe("620", "620");
    tippe("185", "185");
  };

  it("zählt auf, was in Schritt 2 noch fehlt, und wofür", async () => {
    zeige();
    await pflichtAngaben();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByText("Noch offen: 8 von 8 Kennzahlen")).toBeTruthy();
    // Zweimal: als Beschriftung über den drei Knöpfen und in der Lückenliste.
    expect(screen.getAllByText("Nutzungsart").length).toBe(2);
    expect(screen.getByText("Wohnfläche")).toBeTruthy();
    expect(screen.getByText("Baujahr oder Fertigstellung")).toBeTruthy();
    expect(screen.getByText("Hausgeld")).toBeTruthy();
  });

  it("meldet Vollständigkeit, sobald alle acht stehen", async () => {
    zeige();
    await pflichtAngaben();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    kennzahlenOhneJahr();
    tippe("1996", "1996");
    expect(screen.queryByText(/Noch offen:/)).toBeNull();
    expect(screen.getByText(/Objektkachel/)).toBeTruthy();
  });

  it("lässt das Baujahr weg, wenn eine Fertigstellung eingetragen ist", async () => {
    zeige();
    await pflichtAngaben();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    kennzahlenOhneJahr();
    expect(screen.getByText("Noch offen: 1 von 8 Kennzahlen")).toBeTruthy();
    tippe("nur bei Neubau, z. B. Q3 2024", "Q3 2024");
    expect(screen.queryByText(/Noch offen:/)).toBeNull();
  });

  it("speichert auch mit unvollständigen Kennzahlen", async () => {
    zeige();
    await pflichtAngaben();
    expect(speichernKnopf()).not.toBeDisabled();
    fireEvent.click(speichernKnopf());
    expect(metaFelder.kaufpreis).toBe(189000);
    expect(metaFelder.rvVirtualWohnung.etage).toBe("");
  });

  it("kommt trotz leerer Kennzahlen bis Schritt 4", async () => {
    zeige();
    await pflichtAngaben();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByPlaceholderText("412/7")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Speichern" })).not.toBeDisabled();
  });

  it("nennt die Lücke auch außerhalb von Schritt 2", async () => {
    zeige();
    await pflichtAngaben();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    // In Schritt 2 selbst steht die ausführliche Liste, nicht die Kurzzeile.
    expect(screen.queryByText("Kennzahlen unvollständig:")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByText("Kennzahlen unvollständig:")).toBeTruthy();
    // Der Weg zurück ist einen Klick weit.
    fireEvent.click(screen.getByRole("button", { name: "Zu den Kennzahlen" }));
    expect(screen.getByText("Noch offen: 8 von 8 Kennzahlen")).toBeTruthy();
  });

  it("schweigt, solange Schritt 1 noch leer ist", () => {
    zeige();
    expect(screen.queryByText("Kennzahlen unvollständig:")).toBeNull();
  });
});

/**
 * Die Nutzungsart, drei Knöpfe in Schritt 2.
 *
 * Sie ist der einzige Weg, ein von Hand eingetragenes Objekt als Sanierten
 * Bestand, Neubau oder WG zu kennzeichnen. Vorher gab es das Kennzeichen nur
 * am Objekt des eigenen Bestands, und an der Karte blieb es leer.
 */
describe("Die Nutzungsart", () => {
  const pflichtAngaben = async () => {
    tippe("z. B. Roonstraße 3", "Roonstraße 3");
    tippe("95028", "95028");
    tippe("Hof", "Hof");
    tippe("z. B. 6", "6");
    tippe("z. B. 189000", "189.000");
    await bildAnhaengen();
  };

  const zeigeSchritt2 = async () => {
    zeige();
    await pflichtAngaben();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  };

  it("stellt genau die drei Arten zur Wahl", async () => {
    await zeigeSchritt2();
    expect(screen.getByRole("button", { name: "Sanierter Bestand" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Neubau" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "WG und Co-Living" })).toBeTruthy();
  });

  it("bietet KfW 40 nicht an, auf ausdrückliche Entscheidung", async () => {
    await zeigeSchritt2();
    expect(screen.queryByRole("button", { name: /KfW/i })).toBeNull();
  });

  it("merkt sich die Wahl und speichert sie am Investment", async () => {
    await zeigeSchritt2();
    const knopf = screen.getByRole("button", { name: "WG und Co-Living" });
    expect(knopf.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(knopf);
    expect(screen.getByRole("button", { name: "WG und Co-Living" }).getAttribute("aria-pressed"))
      .toBe("true");
    fireEvent.click(speichernKnopf());
    expect(metaFelder.rvVirtualWohnung.objektart).toBe("wg_coliving");
  });

  it("füllt eine gespeicherte Art beim nächsten Öffnen wieder vor", () => {
    metaFelder.kaufpreis = 189000;
    metaFelder.rvVirtualWohnung = {
      objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof", weNr: "6",
      kaufpreis: 189000, objektart: "neubau",
    };
    zeige();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("button", { name: "Neubau" }).getAttribute("aria-pressed")).toBe("true");
  });

  /*
   * Bestehende Investments haben die Angabe nicht. Sie dürfen dadurch weder
   * als fehlerhaft gelten noch am Speichern gehindert werden, genau wie die
   * übrigen Kennzahlen.
   */
  it("blockiert ein bestehendes Investment ohne Angabe nicht", () => {
    metaFelder.kaufpreis = 189000;
    metaFelder.rvVirtualWohnung = {
      objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof", weNr: "6", kaufpreis: 189000,
    };
    zeige();
    expect(speichernKnopf()).not.toBeDisabled();
    fireEvent.click(speichernKnopf());
    expect(metaFelder.rvVirtualWohnung.objAdresse).toBe("Roonstraße 3");
    expect(metaFelder.rvVirtualWohnung.objektart).toBe("");
  });
});

/**
 * Die Rückfrage vor dem Ersetzen eines eingetragenen Objekts.
 *
 * Sie darf nur dort erscheinen, wo wirklich etwas ersetzt wird. Wer ein
 * Objekt zum ersten Mal einträgt oder nur das Hausgeld nachreicht, soll keine
 * Frage weggeklicken müssen, sonst liest sie beim echten Wechsel niemand mehr.
 */
describe("Rückfrage beim Objektwechsel", () => {
  /** Ein Investment, an dem bereits ein Objekt hängt. */
  const bereitsEingetragen = () => {
    metaFelder.kaufpreis = 189000;
    metaFelder.rvVirtualWohnung = {
      objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof", weNr: "6", kaufpreis: 189000,
    };
  };

  const ersetzenKnopf = () => screen.getByRole("button", { name: "Objekt ersetzen" });

  it("fragt nicht, wenn noch kein Objekt eingetragen ist", async () => {
    zeige();
    tippe("z. B. Roonstraße 3", "Roonstraße 3");
    tippe("95028", "95028");
    tippe("Hof", "Hof");
    tippe("z. B. 6", "6");
    tippe("z. B. 189000", "189.000");
    await bildAnhaengen();
    fireEvent.click(speichernKnopf());
    expect(screen.queryByText("Objekt wirklich ersetzen?")).toBeNull();
    expect(metaFelder.rvVirtualWohnung.objAdresse).toBe("Roonstraße 3");
  });

  it("fragt nicht, wenn nur der Kaufpreis korrigiert wird", () => {
    bereitsEingetragen();
    zeige();
    tippe("z. B. 189000", "195.000");
    fireEvent.click(speichernKnopf());
    expect(screen.queryByText("Objekt wirklich ersetzen?")).toBeNull();
    expect(metaFelder.kaufpreis).toBe(195000);
  });

  it("nennt beide Objekte beim Namen, sobald die Adresse wechselt", () => {
    bereitsEingetragen();
    zeige();
    tippe("z. B. Roonstraße 3", "Musterweg 9");
    fireEvent.click(speichernKnopf());
    expect(screen.getByText("Objekt wirklich ersetzen?")).toBeTruthy();
    expect(screen.getByText("Roonstraße 3, 95028 Hof, WE 6")).toBeTruthy();
    expect(screen.getByText("Musterweg 9, 95028 Hof, WE 6")).toBeTruthy();
    // Solange gefragt wird, ist noch nichts geschrieben.
    expect(metaFelder.rvVirtualWohnung.objAdresse).toBe("Roonstraße 3");
  });

  it("schreibt nichts, wenn das bisherige Objekt behalten wird", () => {
    bereitsEingetragen();
    zeige();
    tippe("z. B. Roonstraße 3", "Musterweg 9");
    fireEvent.click(speichernKnopf());
    fireEvent.click(screen.getByRole("button", { name: "Bisheriges Objekt behalten" }));
    expect(metaFelder.rvVirtualWohnung.objAdresse).toBe("Roonstraße 3");
    expect(metaFelder.objektVerlauf).toBeUndefined();
  });

  it("legt beim Ersetzen das alte Objekt in den Verlauf und das neue nach oben", () => {
    bereitsEingetragen();
    zeige();
    tippe("z. B. Roonstraße 3", "Musterweg 9");
    fireEvent.click(speichernKnopf());
    fireEvent.click(ersetzenKnopf());
    expect(metaFelder.rvVirtualWohnung.objAdresse).toBe("Musterweg 9");
    expect(metaFelder.objektVerlauf).toHaveLength(1);
    expect(metaFelder.objektVerlauf[0].strasse).toBe("Roonstraße 3");
    expect(metaFelder.objektVerlauf[0].weNr).toBe("6");
    expect(metaFelder.objektVerlauf[0].kaufpreis).toBe(189000);
  });

  it("warnt vor der unterschriebenen Reservierungsvereinbarung, die stehen bleibt", () => {
    bereitsEingetragen();
    metaFelder.rvPdf = "rv-inv-1.pdf";
    metaFelder.rvSigned = true;
    zeige();
    tippe("z. B. 6", "7");
    fireEvent.click(speichernKnopf());
    expect(screen.getByText("Die unterschriebene Reservierungsvereinbarung")).toBeTruthy();
    expect(screen.getByText(/nicht gelöscht und nennt weiter das bisherige Objekt/)).toBeTruthy();
  });

  it("schweigt zur Reservierungsvereinbarung, solange es keine gibt", () => {
    bereitsEingetragen();
    zeige();
    tippe("z. B. 6", "7");
    fireEvent.click(speichernKnopf());
    expect(screen.getByText("Objekt wirklich ersetzen?")).toBeTruthy();
    expect(screen.queryByText("Die vorhandene Reservierungsvereinbarung")).toBeNull();
    expect(screen.queryByText("Die unterschriebene Reservierungsvereinbarung")).toBeNull();
  });
});

/*
  Christian am 22.09.2026: Ein Kaufvorgang trägt jetzt mehrere Bilder, nicht
  mehr nur eines. Das erste ist das Titelbild, und es lässt sich durch Ziehen
  bestimmen, statt alle löschen und neu hochladen zu müssen.
*/
describe("Mehrere Bilder am Kaufvorgang", () => {
  /** Die Bildkacheln in ihrer Reihenfolge, am Greifen-Zeiger erkannt. */
  const kacheln = () => Array.from(document.querySelectorAll<HTMLElement>(".cursor-grab"));
  /** Die Adressen der angezeigten Bilder, in ihrer Reihenfolge. */
  const bildQuellen = () =>
    Array.from(document.querySelectorAll<HTMLImageElement>('img[alt$="der Immobilie"]')).map((b) =>
      b.getAttribute("src"),
    );

  async function bilderAnhaengen(anzahl: number) {
    const felder = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const feld = felder[felder.length - 1];
    const dateien = Array.from({ length: anzahl }, (_, i) =>
      new File(["x"], `bild${i}.jpg`, { type: "image/jpeg" }),
    );
    await act(async () => {
      fireEvent.change(feld, { target: { files: dateien } });
    });
  }

  it("nimmt mehrere Bilder in einem Rutsch auf", async () => {
    zeige();
    await bilderAnhaengen(3);
    expect(screen.getAllByAltText(/^Bild \d der Immobilie$/)).toHaveLength(3);
    // Das erste trägt das Kennzeichen, die anderen nicht.
    expect(screen.getAllByText("Titelbild")).toHaveLength(1);
  });

  it("speichert die Liste, das erste Bild zusätzlich als Titelbild", async () => {
    zeige();
    tippe("z. B. Roonstraße 3", "Roonstraße 3");
    tippe("95028", "95028");
    tippe("Hof", "Hof");
    tippe("z. B. 6", "6");
    tippe("z. B. 189000", "189.000");
    await bilderAnhaengen(2);
    fireEvent.click(speichernKnopf());

    expect(metaFelder.rvVirtualWohnung.bilder).toEqual([
      "https://example.org/bild1.jpg",
      "https://example.org/bild2.jpg",
    ]);
    /*
      Kundenportal, Mails und Exposé lesen weiterhin nur dieses eine Feld.
      Stünde hier nichts, verschwände das Bild dort, obwohl zwei gespeichert
      sind.
    */
    expect(metaFelder.rvVirtualWohnung.bildUrl).toBe("https://example.org/bild1.jpg");
  });

  it("macht das gezogene Bild zum Titelbild", async () => {
    zeige();
    await bilderAnhaengen(3);

    // Das dritte Bild nach vorne ziehen.
    const nutzlast = { dataTransfer: { types: [] as string[], setData: vi.fn(), effectAllowed: "", dropEffect: "" } };
    const vorher = bildQuellen();
    const felder = kacheln();
    fireEvent.dragStart(felder[2], nutzlast);
    fireEvent.dragOver(felder[0], nutzlast);
    fireEvent.drop(felder[0], nutzlast);

    // Verschoben, nicht getauscht: Das bisherige erste rückt auf Platz zwei.
    expect(bildQuellen()).toEqual([vorher[2], vorher[0], vorher[1]]);
  });

  it("entfernt ein einzelnes Bild, ohne die anderen anzutasten", async () => {
    zeige();
    await bilderAnhaengen(3);
    const vorher = bildQuellen();

    fireEvent.click(screen.getByRole("button", { name: "Bild 2 entfernen" }));

    expect(bildQuellen()).toEqual([vorher[0], vorher[2]]);
  });
});

/*
  Offene Pflichtfelder sind orange umrandet, wie in der Selbstauskunft.

  Der Rahmen hängt am Behälter um das Eingabefeld, deshalb wird dort
  nachgesehen. Die Verkäuferfelder sind keine Pflicht und bekommen ihn nie.
*/
describe("Orange Rahmen um offene Pflichtfelder", () => {
  const RAHMEN = "[&>*]:border-orange-400";
  const umrandet = (platzhalter: string) =>
    screen.getByPlaceholderText(platzhalter).parentElement!.className.includes(RAHMEN);

  it("umrandet ein leeres Pflichtfeld und nimmt den Rahmen nach der Eingabe weg", () => {
    zeige();
    expect(umrandet("z. B. Roonstraße 3")).toBe(true);
    expect(screen.getByPlaceholderText("z. B. Roonstraße 3")).toHaveAttribute("aria-required", "true");
    tippe("z. B. Roonstraße 3", "Roonstraße 3");
    expect(umrandet("z. B. Roonstraße 3")).toBe(false);
  });

  it("lässt Leerzeichen und eine 0 nicht als ausgefüllt gelten, wie die Pflichtprüfung", () => {
    zeige();
    tippe("Hof", "   ");
    expect(umrandet("Hof")).toBe(true);
    tippe("z. B. 189000", "0");
    expect(umrandet("z. B. 189000")).toBe(true);
  });

  it("nimmt beim Paar Baujahr und Fertigstellung beide Rahmen weg, sobald eines steht", () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(umrandet("1996")).toBe(true);
    expect(umrandet("nur bei Neubau, z. B. Q3 2024")).toBe(true);
    tippe("nur bei Neubau, z. B. Q3 2024", "Q3 2024");
    expect(umrandet("1996")).toBe(false);
    expect(umrandet("nur bei Neubau, z. B. Q3 2024")).toBe(false);
  });

  it("umrandet die Verkäuferfelder nie", () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    for (const platzhalter of ["Musterbau Projektentwicklung GmbH", "83022", "Beispielallee 12", "Rosenheim", "HRB 12345"]) {
      expect(umrandet(platzhalter)).toBe(false);
      expect(screen.getByPlaceholderText(platzhalter)).not.toHaveAttribute("aria-required");
    }
  });
});
