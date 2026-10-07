import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * Das Erstgesprächs-Skript als Liste: alle Punkte untereinander auf einer
 * Seite, jeder mit ausformuliertem Sprechtext, Häkchen, Eingabefeldern und
 * Notizen.
 *
 * Christian hat am 21.09.2026 den Wizard zurückgebaut, weil ein Schritt zur
 * Zeit im Gespräch nicht funktioniert hat. Diese Datei prüft seitdem das, was
 * dabei kaputtgehen konnte: dass wirklich alle Punkte gleichzeitig dastehen,
 * dass der Sprechtext offen sichtbar ist und nicht erst auf Klick erscheint,
 * und dass Notizen alter Gespräche weiter angezeigt werden.
 *
 * Store, Supabase und Kontext sind gemockt, damit kein Netz- oder
 * Cache-Zugriff passiert.
 */

function baueSpeicher() {
  const speicher = new Map<string, string>();
  return {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  };
}
Object.defineProperty(window, "localStorage", { writable: true, value: baueSpeicher() });
Object.defineProperty(window, "sessionStorage", { writable: true, value: baueSpeicher() });

/** Die zuletzt an die Edge Function geschickte Payload, für den Wächter unten. */
let letztePayload: Record<string, unknown> | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (_name: string, opts?: { body?: Record<string, unknown> }) => {
        letztePayload = opts?.body ?? null;
        return { data: { summary: "Zusammenfassung aus dem Test" }, error: null };
      }),
    },
  },
}));

vi.mock("@/lib/kundenStore", () => ({
  updateKontakt: vi.fn(),
  mergeKontaktMeta: vi.fn().mockResolvedValue(true),
}));

/** Der gespeicherte Skriptstand, den die Investment-Ablage zurückgibt. */
let gespeicherterStand: unknown = undefined;

vi.mock("@/lib/investmentsStore", () => ({
  setInvestmentMetaFields: vi.fn(),
  getInvestmentMetaField: (_id: string, feld: string, fallback: unknown) =>
    (feld === "setterSkript" ? gespeicherterStand ?? fallback : fallback),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Lisa Muster" } }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import {
  SetterErstgespraechsSkript,
  ERSTGESPRAECH_SCHRITTE_DETAIL,
  UEBERNAHME_ZIELE,
  type SetterErstgespraechsSkriptHandle,
} from "./SetterErstgespraechsSkript";
import type { KundeData } from "@/lib/kundenStore";
import { createRef, type ReactNode } from "react";

const KUNDE = {
  id: "k1",
  vorname: "Max",
  nachname: "Beispiel",
  anrede: "Herr",
} as unknown as KundeData;

/** Ein Gespräch, das schon Notizen und Antworten trägt. */
const ALTBESTAND = {
  antworten: {
    beruf: "Angestellt",
    arbeitgeber: "Musterfirma, seit 2019",
    mitentscheider: "Ehefrau, soll dabei sein",
  },
  notizen: {
    warmup: "Steuerlast gestiegen",
    familiaere_situation: "Frau arbeitet Teilzeit",
    schufa: "Alles glatt",
    pattern_interrupt: "Muss mit der Frau sprechen",
  },
  ziele: ["Altersvorsorge"],
  erledigt: { einleitung: true, warmup: true },
  einleitungBestaetigt: true,
  anrede: "du",
};

function zeichne(stand?: unknown, terminSlot?: ReactNode) {
  gespeicherterStand = stand;
  return render(
    <SetterErstgespraechsSkript
      kunde={KUNDE}
      onUpdate={() => {}}
      investmentId="inv1"
      isFirstInvestment
      terminSlot={terminSlot}
    />,
  );
}

beforeEach(() => {
  gespeicherterStand = undefined;
  letztePayload = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("Alle Punkte stehen gleichzeitig da", () => {
  it("zeigt jeden Punkt des Skripts, nicht einen nach dem anderen", () => {
    zeichne();

    /*
      Der Kern des Rückbaus. Im Wizard war genau ein Punkt sichtbar, hier sind
      es alle. Geprüft gegen die Schrittliste selbst, damit der Test nicht
      auseinanderläuft, wenn ein Punkt dazukommt oder wegfällt.
    */
    for (const s of ERSTGESPRAECH_SCHRITTE_DETAIL) {
      const nummer = s.nrText ?? String(s.nr);
      expect(
        screen.getByText(`${nummer}. ${s.titel}`),
        `Punkt ${nummer} (${s.titel}) fehlt in der Liste`,
      ).toBeInTheDocument();
    }
  });

  it("nennt die Anzahl der Punkte im Kopf", () => {
    zeichne();

    expect(screen.getByText(new RegExp(`${ERSTGESPRAECH_SCHRITTE_DETAIL.length} Schritte`))).toBeInTheDocument();
  });

  it("hat keine Weiter- und Zurueck-Knoepfe mehr", () => {
    zeichne();

    expect(screen.queryByRole("button", { name: /^Weiter$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Zurück$/ })).not.toBeInTheDocument();
  });
});

describe("Der Sprechtext steht offen da", () => {
  it("zeigt den Wortlaut ohne Klick auf einen Formulierungsvorschlag", () => {
    zeichne();

    // Punkt 3, der erste Punkt in der gewählten Anrede. Stand in der
    // Stichpunktfassung hinter einem zugeklappten Kasten.
    expect(screen.getByText(/Kurz zum Ablauf: Ich stelle/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Formulierungsvorschlag/ })).not.toBeInTheDocument();
  });

  it("schaltet den Wortlaut auf die Sie-Form um", () => {
    zeichne();

    fireEvent.click(screen.getByRole("button", { name: /Sie-Form/ }));

    expect(screen.getByText(/Ich stelle Ihnen ein paar Fragen/)).toBeInTheDocument();
  });
});

describe("Eingaben und Notizen", () => {
  it("zeigt die Abhak-Haekchen je Punkt wieder an", () => {
    zeichne();

    expect(screen.getAllByRole("checkbox").length).toBeGreaterThanOrEqual(
      ERSTGESPRAECH_SCHRITTE_DETAIL.length,
    );
  });

  it("zeigt das Haekchen Lead hat Zeit wieder an", () => {
    zeichne();

    expect(screen.getByRole("button", { name: /Lead hat Zeit/ })).toBeInTheDocument();
  });

  it("oeffnet ein vorhandenes Gespraech und zeigt seine Notizen an", () => {
    zeichne(ALTBESTAND);

    expect(screen.getByDisplayValue("Steuerlast gestiegen")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alles glatt")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Muss mit der Frau sprechen")).toBeInTheDocument();
  });

  it("zeigt die gespeicherten Antwortfelder an", () => {
    zeichne(ALTBESTAND);

    // Der Beruf ist ein Auswahlfeld, kein Eingabefeld. Sein Wert steht als
    // Text im Knopf, nicht als Wert eines Eingabefelds.
    expect(screen.getByText("Angestellt")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Musterfirma, seit 2019")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ehefrau, soll dabei sein")).toBeInTheDocument();
  });

  it("nimmt die Zielauswahl entgegen und zeigt sie angehakt", () => {
    zeichne(ALTBESTAND);

    const ziel = screen.getByRole("button", { name: /Altersvorsorge/ });
    expect(ziel.className).toMatch(/border-primary|bg-primary/);
  });
});

describe("Eingebettete Bloecke", () => {
  it("zeigt den Terminblock im Punkt Terminvereinbarung", () => {
    zeichne(undefined, <div>Terminblock hier</div>);

    expect(screen.getByText("Terminblock hier")).toBeInTheDocument();
  });
});

/**
 * Der Wächter über die Weiterverarbeitung.
 *
 * Christian hat beim Rückbau am 21.09.2026 verlangt, dass keine Eingabe still
 * liegen bleibt. Die Zusammenfassung im Kundenprofil prüft
 * `erstgespraechZusammenfassung.test.ts`. Hier geht es um den zweiten Weg: die
 * Payload, die beim Abschluss des Gesprächs an die Edge Function
 * `erstgespraech-zusammenfassung` geht und aus der die KI-Fassung entsteht.
 */
describe("Alles Ausgefüllte landet in der KI-Zusammenfassung", () => {
  /** Ein Gespräch, in dem jedes Feld und jede Notiz einen erkennbaren Wert trägt. */
  function vollerStand() {
    const antworten: Record<string, string> = {};
    const notizen: Record<string, string> = {};
    for (const s of ERSTGESPRAECH_SCHRITTE_DETAIL) {
      for (const f of s.felder) {
        antworten[f.key] = f.werte ? Object.keys(f.werte)[0] : `Wert-${f.key}`;
      }
      if (s.hatNotiz) notizen[s.id] = `Notiz-${s.id}`;
    }
    return { antworten, notizen, ziele: ["Altersvorsorge", "Steuern sparen"], anrede: "du" };
  }

  async function erzeugeZusammenfassung() {
    const stand = vollerStand();
    const ref = createRef<SetterErstgespraechsSkriptHandle>();
    gespeicherterStand = stand;
    render(
      <SetterErstgespraechsSkript
        ref={ref}
        kunde={{ ...KUNDE, qualEinkommen: "3.800 Euro", qualEigenkapital: "45.000 Euro" } as unknown as KundeData}
        onUpdate={() => {}}
        investmentId="inv1"
        isFirstInvestment
      />,
    );
    await act(async () => {
      await ref.current!.generateAiSummary();
    });
    return stand;
  }

  it("schickt jeden ausgefüllten Feldwert mit", async () => {
    const stand = await erzeugeZusammenfassung();
    const alsText = JSON.stringify(letztePayload);

    for (const [key, wert] of Object.entries(stand.antworten)) {
      expect(alsText, `Feldwert „${key}" fehlt in der Payload`).toContain(wert);
    }
  });

  it("schickt jede Notiz mit, benannt nach ihrem Punkt", async () => {
    const stand = await erzeugeZusammenfassung();
    const benannt = String((letztePayload as Record<string, unknown>).notizenBenannt ?? "");

    for (const [id, text] of Object.entries(stand.notizen)) {
      const titel = ERSTGESPRAECH_SCHRITTE_DETAIL.find((s) => s.id === id)?.titel ?? id;
      expect(benannt, `Notiz aus „${id}"`).toContain(text);
      expect(benannt, `Notiz aus „${id}" ohne ihren Punkttitel`).toContain(titel);
    }
  });

  it("schickt Ziele, Netto und Eigenkapital mit", async () => {
    await erzeugeZusammenfassung();
    const p = letztePayload as Record<string, unknown>;

    // Die drei Werte stehen nicht in den Antworten: Ziele kommen aus der
    // Kachelauswahl, Netto und Eigenkapital aus den Qualifizierungsfeldern.
    expect(p.ziele).toBe("Altersvorsorge, Steuern sparen");
    expect(p.nettoEinkommen).toBe("3.800 Euro");
    expect(p.eigenkapital).toBe("45.000 Euro");
  });
});

/**
 * Die vier Pflichtangaben.
 *
 * Christian hat am 21.09.2026 verlangt, dass Beruf, Nettoeinkommen,
 * Eigenkapital und Ziele orange umrandet sind, damit sie sofort auffallen, und
 * dass sonst nichts wie ein Pflichtfeld aussieht. Beides prüft dieser Block:
 * die vier müssen markiert sein, und es dürfen genau vier sein.
 *
 * Die zweite Hälfte ist die wichtigere. Wer später ein Feld ergänzt und dabei
 * aus Gewohnheit die Pflichtmarke mitkopiert, macht aus einer freiwilligen
 * Angabe still eine Pflicht, und niemand merkt es.
 */
describe("Die vier Pflichtangaben sind markiert, sonst nichts", () => {
  /** Alle Stellen, an denen „Pflichtangabe" steht, mit dem Text ihres Etiketts. */
  function pflichtEtiketten(): string[] {
    return screen.getAllByText(/^Pflichtangabe/).map((el) => el.parentElement?.textContent ?? "");
  }

  it("markiert Beruf, Netto, Eigenkapital und Ziele", () => {
    zeichne();
    const etiketten = pflichtEtiketten().join(" | ");

    expect(etiketten).toMatch(/beruflich/i);
    expect(etiketten).toMatch(/Netto-Einkommen/);
    expect(etiketten).toMatch(/Eigenkapital/);
    expect(etiketten).toMatch(/Ziele/);
  });

  it("markiert genau vier Angaben und keine fünfte", () => {
    zeichne();

    expect(pflichtEtiketten()).toHaveLength(4);
  });

  it("markiert keine der Notizen als Pflicht", () => {
    zeichne();

    for (const etikett of pflichtEtiketten()) {
      expect(etikett, "eine Notiz ist zur Pflicht geworden").not.toMatch(/^Notiz/);
    }
  });

  it("zeigt am ausgefüllten Pflichtfeld einen Haken", () => {
    // Die Umrandung allein trägt die Information nicht: Wer Farben nicht
    // unterscheiden kann, liest das Wort daneben.
    gespeicherterStand = ALTBESTAND;
    render(
      <SetterErstgespraechsSkript
        kunde={{ ...KUNDE, qualEinkommen: "3.800 Euro" } as unknown as KundeData}
        onUpdate={() => {}}
        investmentId="inv1"
        isFirstInvestment
      />,
    );

    const mitHaken = screen.getAllByText("Pflichtangabe ✓").map((el) => el.parentElement?.textContent ?? "");
    expect(mitHaken.join(" | ")).toMatch(/Netto-Einkommen/);
    // Ziele sind im Altbestand gesetzt, Eigenkapital nicht.
    expect(mitHaken.join(" | ")).toMatch(/Ziele/);
    expect(screen.getAllByText("Pflichtangabe").map((el) => el.parentElement?.textContent ?? "").join(" | "))
      .toMatch(/Eigenkapital/);
  });
});

/**
 * Christian am 29.09.2026: Wer mit einem eigenen Skript telefoniert, soll
 * sofort sehen, welche Antworten das CRM weiterverarbeitet. Diese Felder
 * tragen einen Rahmen im Marken-Orange und das Etikett „wird übernommen“.
 * Reine Notizen bleiben ohne.
 */
describe("Antworten, die das CRM übernimmt", () => {
  const rahmenUm = (el: Element) => el.closest("[data-uebernahme]")?.getAttribute("data-uebernahme") ?? null;

  it("rahmt jede übernommene Angabe genau einmal ein", () => {
    const { container } = zeichne(ALTBESTAND);
    const markiert = [...container.querySelectorAll("[data-uebernahme]")].map((el) => el.getAttribute("data-uebernahme"));
    expect(markiert.sort()).toEqual(Object.keys(UEBERNAHME_ZIELE).sort());
    expect(screen.getAllByText("wird übernommen")).toHaveLength(Object.keys(UEBERNAHME_ZIELE).length);
  });

  it("markiert Einkommen, Eigenkapital und monatliche Investitionsbereitschaft", () => {
    zeichne(ALTBESTAND);
    expect(rahmenUm(screen.getByPlaceholderText("z.B. 3.000-3.500"))).toBe("qualEinkommen");
    expect(rahmenUm(screen.getByPlaceholderText("z.B. 30.000-50.000"))).toBe("qualEigenkapital");
    expect(rahmenUm(screen.getByPlaceholderText("z.B. 300-500 €"))).toBe("investitionMonat");
    expect(rahmenUm(screen.getByText("Steuern sparen"))).toBe("ziele");
    expect(rahmenUm(screen.getByText("Sie-Form"))).toBe("anrede");
  });

  it("lässt Notizen und Antworten ohne Weiterverarbeitung unmarkiert", () => {
    zeichne(ALTBESTAND);
    for (const notiz of screen.getAllByPlaceholderText("Deine Notiz zu diesem Punkt...")) {
      expect(rahmenUm(notiz)).toBeNull();
    }
    // Arbeitgeber und Sparformen gehen nur in die Zusammenfassung.
    expect(rahmenUm(screen.getByPlaceholderText("z.B. Siemens AG, seit 2019"))).toBeNull();
    expect(rahmenUm(screen.getByPlaceholderText("z.B. ETFs, Tagesgeld, Bausparvertrag, Aktien..."))).toBeNull();
  });

  it("nennt im Hinweis, wohin die Angabe geht", () => {
    zeichne(ALTBESTAND);
    const knoepfe = screen.getAllByRole("button", { name: "Wohin wird diese Angabe übernommen?" });
    expect(knoepfe).toHaveLength(Object.keys(UEBERNAHME_ZIELE).length);
  });
});
