import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * Der Notar-Aufnahmebogen als Wizard, sechs Schritte.
 *
 * Geprüft wird dasselbe, was beim Objektfenster wichtig war: dass der Bogen in
 * Schritten läuft, dass er auch unvollständig speichert, und dass er benennt,
 * was fehlt. Dazu die Vorbefüllung, denn genau die spart das doppelte Tippen.
 *
 * Verriegelt ist nur der Vollmacht-Upload. Auch das wird geprüft, sonst hebelt
 * ein späterer Umbau die einzige echte Sperre versehentlich aus.
 */

// jsdom bringt hier keinen localStorage mit, derselbe Behelf wie in
// AnlageVSendenDialog.test.tsx.
const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  },
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: null }),
        upload: async () => ({ error: null }),
      }),
    },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: toastMock }));

const { KaufvertragForm, notarbogenGeaendert } = await import("@/components/notar/KaufvertragForm");
const { NOTARBOGEN_PFLICHTFELDER, notarbogenLuecken, pflichtfelderImSchritt } =
  await import("@/lib/notarbogenFelder");

const GESAMT = NOTARBOGEN_PFLICHTFELDER.length;

function zeige(initialData: Record<string, unknown> = {}, onSave = vi.fn()) {
  render(
    <KaufvertragForm
      initialData={initialData}
      onSave={onSave}
      investmentId="inv-1"
      kundeId="k-1"
      kundeName="Erika Muster"
    />,
  );
  return onSave;
}

const knopf = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  speicher.clear();
  toastMock.mockClear();
});

describe("Das Verzeichnis der Pflichtangaben", () => {
  it("verteilt alle Pflichtangaben auf genau sechs Schritte", () => {
    const summe = [0, 1, 2, 3, 4, 5].reduce((n, s) => n + pflichtfelderImSchritt(s).length, 0);
    expect(summe).toBe(GESAMT);
    // Kein Schritt ohne Pflichtangabe, sonst wäre der Schnitt willkürlich.
    for (const s of [0, 1, 2, 3, 4, 5]) {
      expect(pflichtfelderImSchritt(s).length).toBeGreaterThan(0);
    }
  });

  it("nennt zu jeder Lücke, wofür die Angabe gebraucht wird", () => {
    const luecken = notarbogenLuecken({});
    expect(luecken.length).toBe(GESAMT);
    for (const l of luecken) {
      expect(l.wofuer.length).toBeGreaterThan(5);
      expect(l.label.length).toBeGreaterThan(2);
    }
  });

  it("zählt eine ausgefüllte Angabe nicht mehr als Lücke", () => {
    expect(notarbogenLuecken({ vk_name: "Musterbau GmbH" }).length).toBe(GESAMT - 1);
    // Nur Leerzeichen zählt als leer.
    expect(notarbogenLuecken({ vk_name: "   " }).length).toBe(GESAMT);
  });
});

describe("Der Bogen läuft in Schritten", () => {
  it("beginnt beim Verkäufer und zeigt den Fortschritt", () => {
    zeige();
    expect(screen.getAllByText("Verkäufer").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Schritt/).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Nachname des Verkäufers")).toBeTruthy();
    // Das Vertragsobjekt kommt erst später und ist jetzt noch nicht da.
    expect(screen.queryByPlaceholderText("Zuständiges Amtsgericht")).toBeNull();
  });

  it("kommt über Weiter zum Käufer und über Zurück wieder hin", () => {
    zeige();
    fireEvent.click(knopf("Weiter"));
    expect(screen.getByPlaceholderText("Nachname des Käufers")).toBeTruthy();
    fireEvent.click(knopf("Zurück"));
    expect(screen.getByPlaceholderText("Nachname des Verkäufers")).toBeTruthy();
  });

  it("lässt über die Sprungmarken direkt in einen späteren Schritt springen", () => {
    zeige();
    // Die Punkte der Fortschrittsleiste tragen den Namen des Schritts.
    fireEvent.click(screen.getByRole("button", { name: /Vertragsobjekt/ }));
    expect(screen.getByPlaceholderText("Zuständiges Amtsgericht")).toBeTruthy();
  });

  it("bietet im letzten Schritt das Speichern mit PDF an", () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: /Beteiligte/ }));
    expect(knopf("Speichern und PDF erstellen")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
  });
});

describe("Speichern geht auch unvollständig", () => {
  it("speichert den leeren Bogen und sagt, wie viel offen ist", () => {
    const onSave = zeige();
    fireEvent.click(knopf("Speichern und später ergänzen"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining(`${GESAMT} Pflichtfelder offen`) }),
    );
  });

  it("gibt weiter, was eingetippt wurde", () => {
    const onSave = zeige();
    fireEvent.change(screen.getByPlaceholderText("Nachname des Verkäufers"), {
      target: { value: "Musterbau GmbH" },
    });
    fireEvent.click(knopf("Speichern und später ergänzen"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ vk_name: "Musterbau GmbH" }));
  });

  it("hält nur den fehlenden Vollmacht-Upload auf", () => {
    const onSave = zeige();
    fireEvent.click(screen.getByRole("button", { name: /Vollmacht vorhanden/ }));
    fireEvent.click(knopf("Speichern und später ergänzen"));
    expect(onSave).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Vollmacht-Dokument fehlt" }),
    );
  });
});

describe("Der Kasten zeigt, was offen ist", () => {
  it("zählt die Lücken dieses Schritts auf und nennt den Grund", () => {
    zeige();
    const offen = pflichtfelderImSchritt(0).length;
    expect(screen.getByText(new RegExp(`Noch offen: ${offen} von ${offen}`))).toBeTruthy();
    // Der Grund steht zweimal: unter dem Feld und im Kasten.
    expect(screen.getAllByText(/Ladungsanschrift des Notariats/).length).toBe(2);
    expect(screen.getByText(/Speichern geht trotzdem/)).toBeTruthy();
  });

  it("weist auf die Lücken der anderen Schritte hin", () => {
    zeige();
    expect(screen.getByText(/In anderen Schritten offen/)).toBeTruthy();
  });

  it("meldet einen vollständigen Schritt als vollständig", () => {
    zeige({
      vk_art: "person",
      vk_name: "Mustermann", vk_vorname: "Klaus", vk_geburtsdatum: "01.01.1970",
      vk_anschrift: "Beispielallee 12, 83022 Rosenheim", vk_telefon: "+49 8031 000000",
      vk_email: "kontakt@beispiel.test", vk_hrb: "HRB 12345",
    });
    expect(screen.getByText(/ist alles eingetragen, was der Notar braucht/)).toBeTruthy();
  });

  it("verlangt bei einer Firma keinen Vornamen", () => {
    // Eine GmbH hat keinen Vornamen. Bliebe er Pflicht, stünde der erste
    // Schritt bei jedem Bauträger dauerhaft auf unvollständig.
    zeige({
      vk_art: "firma",
      vk_name: "Musterbau Projektentwicklung GmbH", vk_geburtsdatum: "01.01.1970",
      vk_anschrift: "Beispielallee 12, 83022 Rosenheim", vk_telefon: "+49 8031 000000",
      vk_email: "kontakt@beispiel.test", vk_hrb: "HRB 12345",
    });
    expect(screen.getByText(/ist alles eingetragen, was der Notar braucht/)).toBeTruthy();
  });
});

describe("Firma oder Privatperson", () => {
  it("fragt die Wahl, bevor jemand tippt", () => {
    zeige();
    expect(screen.getByText("Wer verkauft?")).toBeTruthy();
    expect(knopf("Firma")).toBeTruthy();
    expect(knopf("Privatperson")).toBeTruthy();
  });

  it("zeigt bei einer Firma genau ein Namensfeld", () => {
    zeige();
    fireEvent.click(knopf("Firma"));
    expect(screen.getByPlaceholderText("Firmierung laut Handelsregister")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Vorname des Verkäufers")).toBeNull();
  });

  it("zeigt bei einer Privatperson Vorname und Nachname getrennt", () => {
    zeige();
    fireEvent.click(knopf("Privatperson"));
    expect(screen.getByPlaceholderText("Nachname des Verkäufers")).toBeTruthy();
    expect(screen.getByPlaceholderText("Vorname des Verkäufers")).toBeTruthy();
  });

  it("teilt einen Firmennamen nicht mehr", () => {
    // Vorher stand hier Nachname „GmbH“ und Vorname „Musterbau
    // Projektentwicklung“, und genau so ging der Bogen zum Notar.
    const onSave = zeige({ vk_name: "Musterbau Projektentwicklung GmbH" });
    fireEvent.click(knopf("Firma"));
    fireEvent.click(knopf("Speichern und später ergänzen"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      vk_art: "firma",
      vk_name: "Musterbau Projektentwicklung GmbH",
      vk_vorname: "",
    }));
  });

  it("holt eine bereits geschehene Teilung mit einem Klick zurück", () => {
    // Ein bestehender Bogen trägt die beiden Hälften. „Firma“ setzt sie
    // wieder zusammen, statt den Vornamen unsichtbar liegen zu lassen.
    const onSave = zeige({ vk_vorname: "Musterbau Projektentwicklung", vk_name: "GmbH" });
    fireEvent.click(knopf("Firma"));
    fireEvent.click(knopf("Speichern und später ergänzen"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      vk_name: "Musterbau Projektentwicklung GmbH",
      vk_vorname: "",
    }));
  });

  it("lässt einen bestehenden Eintrag ohne Wahl unangetastet stehen", () => {
    const onSave = zeige({ vk_name: "Musterbau Projektentwicklung GmbH" });
    // Ohne Wahl bleiben beide Felder sichtbar, damit nichts verschwindet.
    expect(screen.getByDisplayValue("Musterbau Projektentwicklung GmbH")).toBeTruthy();
    expect(screen.getByPlaceholderText("Vorname des Verkäufers")).toBeTruthy();
    fireEvent.click(knopf("Speichern und später ergänzen"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      vk_name: "Musterbau Projektentwicklung GmbH",
    }));
  });
});

describe("Die Wohnung steht im Bogen", () => {
  it("führt Wohneinheit und Wohnungsnummer getrennt", () => {
    zeige({
      obj_adresse: "Roonstraße 3, 95028 Hof",
      obj_wohneinheit: "6",
      obj_wohnungsnummer: "Nr. 12",
    });
    fireEvent.click(screen.getByRole("button", { name: /Vertragsobjekt/ }));
    // Die Adresse benennt das Haus, die beiden Nummern die Wohnung darin.
    expect(screen.getByDisplayValue("Roonstraße 3, 95028 Hof")).toBeTruthy();
    expect(screen.getByDisplayValue("6")).toBeTruthy();
    expect(screen.getByDisplayValue("Nr. 12")).toBeTruthy();
  });

  it("zählt die fehlende Wohnungsnummer als Lücke im Vertragsobjekt", () => {
    const ohne = notarbogenLuecken({ obj_wohnungsnummer: "" }, 2);
    expect(ohne.some(l => l.feld === "obj_wohnungsnummer")).toBe(true);
    const mit = notarbogenLuecken({ obj_wohnungsnummer: "Nr. 12" }, 2);
    expect(mit.some(l => l.feld === "obj_wohnungsnummer")).toBe(false);
  });

  it("gibt beide Angaben beim Speichern weiter", () => {
    const onSave = zeige({ obj_wohneinheit: "6", obj_wohnungsnummer: "Nr. 12" });
    fireEvent.click(knopf("Speichern und später ergänzen"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      obj_wohneinheit: "6", obj_wohnungsnummer: "Nr. 12",
    }));
  });
});

describe("Die Vorbefüllung kommt an", () => {
  it("übernimmt Käufer, Objekt und Grundbuch aus dem Investment", () => {
    zeige({
      k_name: "Muster", k_vorname: "Erika",
      obj_adresse: "Roonstraße 3, 95028 Hof", kaufpreis: "189000",
      amtsgericht: "Hof", gemarkung: "Hof", blatt: "12345", flnr: "412/7",
    });

    // Schritt 2: der Käufer
    fireEvent.click(screen.getByRole("button", { name: /Käufer/ }));
    expect(screen.getByDisplayValue("Muster")).toBeTruthy();
    expect(screen.getByDisplayValue("Erika")).toBeTruthy();

    // Schritt 3: Objekt samt Grundbuch, seit 09/2026 aus der Objektauswahl
    fireEvent.click(screen.getByRole("button", { name: /Vertragsobjekt/ }));
    expect(screen.getByDisplayValue("Roonstraße 3, 95028 Hof")).toBeTruthy();
    expect(screen.getByDisplayValue("189.000")).toBeTruthy();
    // Amtsgericht und Gemarkung heißen hier beide Hof.
    expect(screen.getAllByDisplayValue("Hof").length).toBe(2);
    expect(screen.getByDisplayValue("12345")).toBeTruthy();
    expect(screen.getByDisplayValue("412/7")).toBeTruthy();
  });

  it("sagt, wie viele Pflichtangaben schon dastanden", () => {
    zeige({ k_name: "Muster", k_vorname: "Erika", obj_adresse: "Roonstraße 3, 95028 Hof" });
    expect(screen.getByText(new RegExp(`3 von ${GESAMT} Pflichtangaben`))).toBeTruthy();
  });

  it("bleibt bei dieser Zahl, auch wenn danach getippt wird", () => {
    zeige({ k_name: "Muster" });
    fireEvent.change(screen.getByPlaceholderText("Nachname des Verkäufers"), {
      target: { value: "Musterbau GmbH" },
    });
    // Die Zeile sagt, was der Bogen mitgebracht hat, nicht was gerade dasteht.
    expect(screen.getByText(new RegExp(`1 von ${GESAMT} Pflichtangaben`))).toBeTruthy();
  });
});

/**
 * Der Zurueckweg oben im Bogen.
 *
 * Christian am 22.09.2026: Oben fehlt ein Zurueck-Knopf, und er soll fragen,
 * ob die Daten gespeichert werden sollen oder verloren gehen duerfen.
 *
 * Wichtig ist beides: Die Rueckfrage muss kommen, wenn etwas zu verlieren ist,
 * und sie muss ausbleiben, wenn nichts zu verlieren ist. Eine Rueckfrage, die
 * immer kommt, klickt man nach drei Tagen blind weg.
 */
describe("Der Zurueckweg fragt nur nach, wenn etwas zu verlieren ist", () => {
  function zeigeMitZurueck(initialData: Record<string, unknown> = {}) {
    const onZurueck = vi.fn();
    render(
      <KaufvertragForm
        initialData={initialData}
        onSave={vi.fn()}
        onZurueck={onZurueck}
        investmentId="inv-1"
        kundeId="k-1"
        kundeName="Erika Muster"
      />,
    );
    return onZurueck;
  }

  const tippeEtwas = () =>
    fireEvent.change(screen.getByPlaceholderText("Nachname des Verkäufers"), {
      target: { value: "Musterbau GmbH" },
    });

  it("zeigt den Knopf oben, sobald es einen Rueckweg gibt", () => {
    zeigeMitZurueck();
    expect(knopf("Zurück zum Kundenprofil")).toBeTruthy();
  });

  it("zeigt keinen Knopf, wo es keinen Rueckweg gibt", () => {
    zeige();
    expect(screen.queryByRole("button", { name: "Zurück zum Kundenprofil" })).toBeNull();
  });

  it("geht ohne Rueckfrage zurueck, wenn nichts geaendert wurde", () => {
    const onZurueck = zeigeMitZurueck({ vk_name: "Musterbau GmbH" });
    fireEvent.click(knopf("Zurück zum Kundenprofil"));
    expect(onZurueck).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Aufnahmebogen verlassen?")).toBeNull();
  });

  it("fragt nach, sobald etwas eingetragen wurde", () => {
    const onZurueck = zeigeMitZurueck();
    tippeEtwas();
    fireEvent.click(knopf("Zurück zum Kundenprofil"));
    expect(screen.getByText("Aufnahmebogen verlassen?")).toBeTruthy();
    // Solange nicht geantwortet ist, geht nichts zurueck.
    expect(onZurueck).not.toHaveBeenCalled();
  });

  it("fragt nicht nach, wenn ein Feld nur angetippt und wieder geleert wurde", () => {
    const onZurueck = zeigeMitZurueck();
    tippeEtwas();
    fireEvent.change(screen.getByPlaceholderText("Nachname des Verkäufers"), {
      target: { value: "" },
    });
    fireEvent.click(knopf("Zurück zum Kundenprofil"));
    expect(onZurueck).toHaveBeenCalledTimes(1);
  });

  it("nennt drei Knoepfe, die sagen, was sie tun", () => {
    zeigeMitZurueck();
    tippeEtwas();
    fireEvent.click(knopf("Zurück zum Kundenprofil"));
    expect(knopf("Weiter ausfüllen")).toBeTruthy();
    expect(knopf("Zwischenspeichern und schließen")).toBeTruthy();
    expect(knopf("Verwerfen")).toBeTruthy();
    // Kein OK und kein Abbrechen.
    expect(screen.queryByRole("button", { name: "OK" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abbrechen" })).toBeNull();
  });

  it("behaelt den Entwurf beim Zwischenspeichern", () => {
    const onZurueck = zeigeMitZurueck();
    tippeEtwas();
    fireEvent.click(knopf("Zurück zum Kundenprofil"));
    fireEvent.click(knopf("Zwischenspeichern und schließen"));
    expect(onZurueck).toHaveBeenCalledTimes(1);
    const entwurf = speicher.get("mi_kaufvertrag_draft_k-1_inv-1");
    expect(entwurf).toBeTruthy();
    expect(JSON.parse(entwurf as string).vk_name).toBe("Musterbau GmbH");
  });

  it("wirft den Entwurf beim Verwerfen wirklich weg", () => {
    const onZurueck = zeigeMitZurueck();
    tippeEtwas();
    fireEvent.click(knopf("Zurück zum Kundenprofil"));
    fireEvent.click(knopf("Verwerfen"));
    expect(onZurueck).toHaveBeenCalledTimes(1);
    // Sonst staende die verworfene Eingabe beim naechsten Oeffnen wieder da.
    expect(speicher.get("mi_kaufvertrag_draft_k-1_inv-1")).toBeUndefined();
  });
});

describe("Der Vergleich mit dem Ausgangsstand", () => {
  it("meldet nichts, solange nichts angefasst wurde", () => {
    const stand = { vk_name: "Musterbau GmbH", k_name: "Muster" };
    expect(notarbogenGeaendert(stand, { ...stand })).toBe(false);
  });

  it("meldet eine Aenderung, sobald ein Feld anders lautet", () => {
    const stand = { vk_name: "Musterbau GmbH" };
    expect(notarbogenGeaendert(stand, { ...stand, vk_name: "Andere GmbH" })).toBe(true);
    expect(notarbogenGeaendert(stand, { ...stand, k_name: "Muster" })).toBe(true);
  });

  it("haelt leer, fehlend und leerer Text fuer dasselbe", () => {
    expect(notarbogenGeaendert({ vk_name: "" }, {})).toBe(false);
    expect(notarbogenGeaendert({}, { vk_name: "" })).toBe(false);
    expect(notarbogenGeaendert({ vk_name: undefined }, { vk_name: "" })).toBe(false);
  });

  it("vergleicht verschachtelte Angaben ueber ihren Inhalt", () => {
    expect(notarbogenGeaendert({ liste: ["a"] } as never, { liste: ["a"] } as never)).toBe(false);
    expect(notarbogenGeaendert({ liste: ["a"] } as never, { liste: ["b"] } as never)).toBe(true);
  });
});
