/**
 * Der Knopf für einen neuen Link zur Selbstauskunft.
 *
 * Bis zum 16.09.2026 zeigte dieser Kasten nur einen einzigen Fall: zwei
 * Personen, eine hat unterschrieben, die andere nicht. Der häufigste Fall,
 * nämlich die versendete Selbstauskunft, die niemand angerührt hat, hatte
 * keinen Knopf. Seit der Frist von vierzehn Tagen ist das der Fall, der ihn
 * am dringendsten braucht: Läuft der Link ab, muss der Partner einen neuen
 * senden können, ohne das ganze Formular noch einmal zu durchlaufen.
 *
 * Geprüft wird deshalb:
 *   1. Der Knopf erscheint auch bei einer einzelnen offenen Unterschrift.
 *   2. Er erscheint auch dann, wenn der alte Link längst abgelaufen ist.
 *   3. Er fragt vorher nach, und ein „Abbrechen“ sendet nichts.
 *   4. Scheitert der Versand, erscheint keine Erfolgsmeldung, sondern der Grund.
 *   5. Ist alles unterschrieben, verschwindet der Kasten.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

/* ── Ablage, die die Bausteine teilen ── */
let zeilen: any[] = [];
const kontakt = {
  vorname: "Anna", nachname: "Beispiel", email: "anna@beispiel.test", meta: {},
};
const toasts: any[] = [];
const versandAufrufe: any[] = [];
let versandErgebnis: any = { art: "ok" };
let rueckfrageAntwort = true;
const rueckfragen: any[] = [];
/** Jeder Aufruf einer Edge Function, die der Kasten selbst auslöst. */
const functionAufrufe: any[] = [];

/** Kette, die jede Abfrage-Methode überlebt und am Ende die Zeilen liefert. */
function kette(ergebnis: any) {
  const o: any = {};
  for (const m of ["select", "eq", "neq", "not", "order", "limit", "is"]) o[m] = () => o;
  o.maybeSingle = async () => ergebnis;
  o.then = (aufloesen: any, ablehnen: any) => Promise.resolve(ergebnis).then(aufloesen, ablehnen);
  return o;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabelle: string) =>
      tabelle === "kontakte"
        ? kette({ data: kontakt, error: null })
        : kette({ data: zeilen, error: null }),
    functions: {
      invoke: async (...args: any[]) => { functionAufrufe.push(args); return { data: null, error: null }; },
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (t: any) => { toasts.push(t); } }),
}));

vi.mock("@/lib/confirm", () => ({
  confirmDialog: async (opts: any) => { rueckfragen.push(opts); return rueckfrageAntwort; },
}));

vi.mock("@/lib/signaturErneutSenden", () => ({
  signaturErneutSenden: async (auftrag: any) => {
    versandAufrufe.push(auftrag);
    return versandErgebnis;
  },
}));

const { SaPartialSignaturePill } = await import("./SaPartialSignaturePill");

function zeile(ueberschreiben: Partial<any> = {}) {
  return {
    id: "sig-1",
    person_type: "person1",
    name: "Anna Beispiel",
    email: "anna@beispiel.test",
    status: "pending",
    signed_at: null,
    created_at: "2026-09-01T08:00:00.000Z",
    expires_at: "2026-09-15T08:00:00.000Z",
    sa_data: { vorname: "Anna" },
    ...ueberschreiben,
  };
}

/*
 * Jeder Test bekommt ein eigenes Investment.
 *
 * Die Komponente hält einen modulweiten Zwischenspeicher, damit der Kasten
 * beim Zurückspringen sofort steht. Über Testgrenzen hinweg wäre das eine
 * Vorbelastung: Der nächste Test sähe zuerst die Zeilen des vorigen.
 */
let laufendeNummer = 0;
function zeichnen() {
  laufendeNummer += 1;
  return render(<SaPartialSignaturePill kontaktId="k-1" investmentId={`inv-${laufendeNummer}`} />);
}

beforeEach(() => {
  cleanup();
  zeilen = [zeile()];
  toasts.length = 0;
  versandAufrufe.length = 0;
  rueckfragen.length = 0;
  functionAufrufe.length = 0;
  versandErgebnis = { art: "ok" };
  rueckfrageAntwort = true;
  vi.useRealTimers();
});

describe("Der Kasten zeigt jede offene Unterschrift", () => {
  it("auch die einzelne, ohne dass schon jemand unterschrieben hat", async () => {
    zeichnen();
    expect(await screen.findByText(/Unterschrift ausstehend/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Neuen Link senden/ })).toBeTruthy();
  });

  it("nennt die Frist am Knopf, damit klar ist, was der Kunde bekommt", async () => {
    zeichnen();
    const knopf = await screen.findByRole("button", { name: /Neuen Link senden/ });
    expect(knopf.textContent).toContain("14 Tage");
  });

  it("sagt, dass der alte Link abgelaufen ist, und bleibt trotzdem bedienbar", async () => {
    zeichnen();
    expect(await screen.findByText(/abgelaufen/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Neuen Link senden/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("verschwindet, sobald alles unterschrieben ist", async () => {
    zeilen = [zeile({ status: "signed", signed_at: "2026-09-02T08:00:00.000Z" })];
    const { container } = zeichnen();
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("zählt weiterhin mit, wenn einer von zweien unterschrieben hat", async () => {
    zeilen = [
      zeile({ status: "signed", signed_at: "2026-09-02T08:00:00.000Z" }),
      zeile({ id: "sig-2", person_type: "person2", name: "Martina Beispiel", email: "m@beispiel.test" }),
    ];
    zeichnen();
    expect(await screen.findByText(/1 von 2 unterschrieben/)).toBeTruthy();
  });

  it("zeigt Person 2 als offen, wenn sie in der Selbstauskunft steht, aber keine Anfrage hat, und schickt ihr den Link", async () => {
    const mitP2 = { vorname: "Anna", person2: true, person2Data: { vorname: "Martina", nachname: "Beispiel", email: "m@beispiel.test" } };
    zeilen = [zeile({ status: "signed", signed_at: "2026-09-02T08:00:00.000Z", sa_data: mitP2 })];
    zeichnen();
    expect(await screen.findByText(/1 von 2 unterschrieben \(Martina ausstehend\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Neuen Link senden/ }));
    await waitFor(() => expect(versandAufrufe).toHaveLength(1));
    expect(versandAufrufe[0].personen).toEqual([{ name: "Martina Beispiel", personType: "person2" }]);
  });
});

describe("Vor dem Senden wird gefragt", () => {
  it("und ein Abbrechen sendet nichts", async () => {
    rueckfrageAntwort = false;
    zeichnen();
    fireEvent.click(await screen.findByRole("button", { name: /Neuen Link senden/ }));
    await waitFor(() => expect(rueckfragen.length).toBe(1));
    expect(versandAufrufe.length).toBe(0);
    expect(toasts.length).toBe(0);
  });

  it("und die Rückfrage sagt, dass der bisherige Link ungültig wird", async () => {
    rueckfrageAntwort = false;
    zeichnen();
    fireEvent.click(await screen.findByRole("button", { name: /Neuen Link senden/ }));
    await waitFor(() => expect(rueckfragen.length).toBe(1));
    expect(String(rueckfragen[0].description)).toContain("ungültig");
    expect(rueckfragen[0].confirmText).toBe("Neuen Link senden");
    expect(rueckfragen[0].cancelText).toBe("Abbrechen");
  });
});

describe("Die Rückmeldung ist ehrlich", () => {
  it("meldet Erfolg nur, wenn wirklich versendet wurde", async () => {
    zeichnen();
    fireEvent.click(await screen.findByRole("button", { name: /Neuen Link senden/ }));
    await waitFor(() => expect(versandAufrufe.length).toBe(1));
    expect(versandAufrufe[0].art).toBe("selbstauskunft");
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].title).toContain("versendet");
    expect(toasts[0].variant).toBeUndefined();
  });

  it("nennt beim Fehlschlag den Grund und feiert nichts", async () => {
    versandErgebnis = { art: "fehler", text: "Für diesen Kunden darfst du keine Unterschrift anfordern." };
    zeichnen();
    fireEvent.click(await screen.findByRole("button", { name: /Neuen Link senden/ }));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].variant).toBe("destructive");
    expect(toasts[0].description).toContain("darfst du keine Unterschrift anfordern");
    expect(toasts[0].title).not.toContain("✓");
  });
});

/*
 * Der Hintergrund-Abgleich an `finalize-selbstauskunft` ist am 26.09.2026
 * entfallen. Er schickte weder Unterschriftslink noch Geheimwort mit und wurde
 * von der Function deshalb immer abgewiesen. Die Teilunterschriften spiegelt
 * die Function selbst, wenn tatsächlich unterschrieben wird.
 */
describe("Kein Aufruf ins Leere", () => {
  it("ruft beim Anzeigen keine Function auf, auch wenn schon jemand unterschrieben hat", async () => {
    zeilen = [
      zeile({ status: "signed", signed_at: "2026-09-02T08:00:00.000Z" }),
      zeile({ id: "sig-2", person_type: "person2", name: "Martina Beispiel", email: "m@beispiel.test" }),
    ];
    zeichnen();
    expect(await screen.findByText(/1 von 2 unterschrieben/)).toBeTruthy();
    expect(functionAufrufe).toEqual([]);
  });
});
