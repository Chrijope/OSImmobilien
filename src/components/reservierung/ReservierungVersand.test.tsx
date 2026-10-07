import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Die Erfolgsmeldung der Reservierungsvereinbarung.
 *
 * Anlass: Das Formular meldete „Unterschrift angefordert ✓“, egal was der
 * Versand zurückgab. Scheiterte er, bekam der Kunde nie eine Mail, der
 * Bearbeiter sah Erfolg, und die Pipelinestufe stand schon auf
 * „Reservierung“. Der Fehlschlag stand allein in der Entwicklerkonsole.
 *
 * Geprüft wird deshalb der Weg vom Klick bis zur Meldung, in den drei Formen,
 * die ein Fehlschlag annehmen kann:
 *
 *   1. `invoke` liefert `{ data, error }` mit gesetztem `error`
 *   2. `invoke` wirft eine Ausnahme
 *   3. `invoke` meldet Status 200, aber in `results` steht `sent: false`
 *
 * Der dritte Fall ist der heimtückische: Für `invoke` ist er Erfolg, und genau
 * so verhält sich die Funktion bei einer gesperrten Empfängeradresse.
 */

/* ── Ablage, die die Bausteine des Formulars teilen ── */
const metaFelder: Record<string, any> = {};
const investment: Record<string, any> = {
  id: "inv-1", kontaktId: "k-1", pipelineStufe: "beratungsgespraech",
};
const kontaktAenderungen: Record<string, any> = {};
const benachrichtigungen: any[] = [];

const kontakt = {
  id: "k-1",
  vorname: "Anna", nachname: "Beispiel",
  email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München",
  geburtstag: "01.01.1980", steuerId: "123/456/78901",
};

/** Was `supabase.functions.invoke` beim nächsten Klick zurückgeben soll. */
let versandAntwort: () => Promise<{ data: any; error: any }> = async () => ({
  data: { success: true, results: [{ personType: "kaeufer1", email: kontakt.email, sent: true }] },
  error: null,
});
const versandAufrufe: any[] = [];

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (id === investment.id ? investment : undefined),
  getInvestmentMetaField: (_id: string, key: string, fallback: any) => metaFelder[key] ?? fallback,
  setInvestmentMetaFields: (_id: string, felder: Record<string, any>) => { Object.assign(metaFelder, felder); },
  updateInvestment: (_id: string, felder: Record<string, any>) => { Object.assign(investment, felder); },
  getInvestmentsByKontakt: () => [{ ...investment, meta: metaFelder }],
  investmentGespeichert: async () => {},
}));

vi.mock("@/lib/objekteStore", () => ({
  getWohnungKurz: () => null,
  getObjektById: () => undefined,
  reserveWohnung: async () => {},
}));

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (_k: string, fallback: any) => fallback,
  setUserSetting: () => {},
}));

vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));

vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (id === kontakt.id ? kontakt : null),
  updateKontakt: (_id: string, felder: Record<string, any>) => { Object.assign(kontaktAenderungen, felder); },
}));

vi.mock("@/lib/notificationStore", () => ({
  addDocNotification: (n: any) => { benachrichtigungen.push(n); },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string, opts: any) => {
        versandAufrufe.push({ name, opts });
        return versandAntwort();
      },
    },
  },
}));

const hinweise: Array<{ title: string; description?: unknown }> = [];
vi.mock("@/lib/confirm", () => ({
  hinweisDialog: async (opts: any) => { hinweise.push(opts); },
  confirmDialog: async () => true,
}));

const toasts: Array<{ title?: string; description?: string; variant?: string }> = [];
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (t: any) => { toasts.push(t); } }),
  toast: (t: any) => { toasts.push(t); },
}));

const { ReservierungsForm, versandErgebnisLesen } = await import("@/components/reservierung/ReservierungsForm");

/** Das Formular bis zum letzten Schritt ausfüllen und den Knopf holen. */
function bisZumAbsenden() {
  render(
    <MemoryRouter>
      <ReservierungsForm
        kundeId="k-1"
        investmentId="inv-1"
        wohnungData={{
          weNr: "6", groesse: 60, kaufpreis: 250000, etage: "1", lage: "",
          objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof",
        }}
        verkaeuferData={{ vkArt: "firma", vkName: "Bau GmbH", vkStrasse: "Weg 1", vkPlz: "95028", vkOrt: "Hof" }}
      />
    </MemoryRouter>,
  );
  // Käufer- und Objektdaten sind vorbefüllt. Seit dem 14.09.2026 sind es zwei
  // Schritte bis zur Erklärung, der Verkäuferschritt ist entfallen. Seit dem
  // 15.09.2026 ist die IBAN Pflicht, und im Abschluss kommt die Wahl zum
  // Beginn der Reservierung dazu. Der Datenschutz-Haken ist am selben Tag
  // wieder entfallen, das Einverständnis gilt mit der Unterschrift.
  fireEvent.change(screen.getByPlaceholderText("DE00 0000 0000 0000 0000 00"), { target: { value: "DE02120300000000202051" } });
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  fireEvent.click(document.getElementById("erk")!);
  fireEvent.click(document.getElementById("widerruf-sofort")!);
}

const absendeKnopf = () => screen.getByRole("button", { name: /Unterschrift anfordern|Versand erneut versuchen|Unterschrift angefordert/ });

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(metaFelder)) delete metaFelder[k];
  // Seit 29.09.2026 prueft das Formular vorab die Selbstauskunft, wie der Server.
  metaFelder.saSigned = true;
  for (const k of Object.keys(kontaktAenderungen)) delete kontaktAenderungen[k];
  investment.pipelineStufe = "beratungsgespraech";
  benachrichtigungen.length = 0;
  versandAufrufe.length = 0;
  hinweise.length = 0;
  toasts.length = 0;
  versandAntwort = async () => ({
    data: { success: true, results: [{ personType: "kaeufer1", email: kontakt.email, sent: true }] },
    error: null,
  });
});

describe("versandErgebnisLesen: die drei Formen eines Fehlschlags", () => {
  it("erkennt den Fehler im Rückgabewert", () => {
    expect(versandErgebnisLesen(null, new Error("Edge Function returned a non-2xx status code")))
      .toEqual({ art: "fehler", text: "Edge Function returned a non-2xx status code" });
  });

  it("erkennt den Fehler im Rumpf der Antwort", () => {
    expect(versandErgebnisLesen({ error: "Zu viele Anfragen" }, null))
      .toEqual({ art: "fehler", text: "Zu viele Anfragen" });
  });

  it("erkennt den Fehlschlag, der als Status 200 zurückkommt", () => {
    const ergebnis = versandErgebnisLesen(
      { success: true, results: [{ email: "anna@beispiel.test", sent: false, grund: "email_suppressed" }] },
      null,
    );
    expect(ergebnis.art).toBe("fehler");
    expect(ergebnis.art === "fehler" && ergebnis.text).toContain("anna@beispiel.test");
    expect(ergebnis.art === "fehler" && ergebnis.text).toContain("email_suppressed");
  });

  it("nennt es teilweise, wenn nur einer von zweien nichts bekommen hat", () => {
    const ergebnis = versandErgebnisLesen(
      {
        success: true,
        results: [
          { email: "eins@test.de", sent: true },
          { email: "zwei@test.de", sent: false },
        ],
      },
      null,
    );
    expect(ergebnis.art).toBe("teilweise");
  });

  it("ist nur dann in Ordnung, wenn jeder Empfänger bestätigt ist", () => {
    expect(versandErgebnisLesen({ success: true, results: [{ email: "a@b.de", sent: true }] }, null))
      .toEqual({ art: "ok" });
  });

  it("wertet eine leere Empfängerliste als Fehlschlag", () => {
    expect(versandErgebnisLesen({ success: true, results: [] }, null).art).toBe("fehler");
  });
});

describe("Vorabprüfung wie auf dem Server (29.09.2026)", () => {
  it("schickt ohne unterschriebene Selbstauskunft nichts hinaus und ändert nichts", async () => {
    // Nach einer Korrektur: altes PDF, neue Unterschrift steht aus.
    delete metaFelder.saSigned;
    metaFelder.saPdf = "SA_alt.pdf";
    metaFelder.saNeueUnterschriftSeit = "2026-09-27T08:00:00.000Z";
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());

    await waitFor(() => expect(hinweise.length).toBe(1));
    expect(hinweise[0].title).toBe("Die Reservierung geht noch nicht");
    expect(String(hinweise[0].description)).toContain("Die Selbstauskunft ist noch nicht unterschrieben.");
    expect(versandAufrufe).toHaveLength(0);
    expect(investment.pipelineStufe).toBe("beratungsgespraech");
    expect(kontaktAenderungen).toEqual({});
  });
});

describe("Das Formular meldet keinen Erfolg, wenn nichts versendet wurde", () => {
  it("bleibt beim Fehler im Rückgabewert auf dem Knopf stehen", async () => {
    versandAntwort = async () => ({ data: null, error: new Error("Edge Function returned a non-2xx status code") });
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());

    await waitFor(() => expect(hinweise.length).toBe(1));
    expect(hinweise[0].title).toBe("Die Unterschrift wurde nicht angefordert");
    // Kein Erfolgstoast, sondern eine deutliche Fehlermeldung.
    expect(toasts.some(t => t.title?.startsWith("Unterschrift angefordert"))).toBe(false);
    expect(toasts.some(t => t.title === "Nicht versendet" && t.variant === "destructive")).toBe(true);
    // Der Knopf springt nicht auf „gesendet“, sondern bietet die Wiederholung an.
    expect(await screen.findByRole("button", { name: /Versand erneut versuchen/ })).toBeInTheDocument();
    // Keine Benachrichtigung über einen Vorgang, den es nicht gibt.
    expect(benachrichtigungen.length).toBe(0);
  });

  it("fängt auch die geworfene Ausnahme ab", async () => {
    versandAntwort = async () => { throw new Error("Failed to fetch"); };
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());

    await waitFor(() => expect(hinweise.length).toBe(1));
    expect(String(hinweise[0].description)).toContain("Failed to fetch");
    expect(toasts.some(t => t.title?.startsWith("Unterschrift angefordert"))).toBe(false);
  });

  it("erkennt den Fehlschlag, den die Funktion mit Status 200 zurückgibt", async () => {
    versandAntwort = async () => ({
      data: { success: true, results: [{ personType: "kaeufer1", email: kontakt.email, sent: false, grund: "email_suppressed" }] },
      error: null,
    });
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());

    await waitFor(() => expect(hinweise.length).toBe(1));
    expect(toasts.some(t => t.title?.startsWith("Unterschrift angefordert"))).toBe(false);
    expect(await screen.findByRole("button", { name: /Versand erneut versuchen/ })).toBeInTheDocument();
  });

  /*
   * Bis zum 14.09.2026 stand in der Meldung nur „Edge Function returned a
   * non-2xx status code“. Der eigentliche Grund liegt im Rumpf der Antwort,
   * und den liest supabase-js nicht. Damit sahen das stündliche Versandlimit,
   * eine abgelaufene Anmeldung und ein fehlendes Pflichtfeld am Bildschirm
   * alle gleich aus, und niemand konnte sagen, was zu tun ist.
   */
  it("zeigt den Grund aus der Antwort statt des englischen Sammelsatzes", async () => {
    versandAntwort = async () => {
      const fehler: any = new Error("Edge Function returned a non-2xx status code");
      fehler.context = {
        status: 429,
        clone: () => ({
          text: async () => JSON.stringify({
            error: "Stündliches Limit erreicht. Bitte später erneut versuchen.",
            rate_limited: true,
          }),
        }),
        text: async () => "",
      };
      return { data: null, error: fehler };
    };
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());

    await waitFor(() => expect(hinweise.length).toBe(1));
    expect(String(hinweise[0].description)).toContain("Stündliches Limit erreicht");
    expect(String(hinweise[0].description)).not.toContain("non-2xx");
    // Der stehende Kasten über dem Knopf nennt denselben Grund.
    expect(await screen.findByText(/Stündliches Limit erreicht/)).toBeInTheDocument();
  });

  it("nennt im Hinweis, was trotzdem schon geschehen ist", async () => {
    versandAntwort = async () => ({ data: null, error: new Error("kaputt") });
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());

    await waitFor(() => expect(hinweise.length).toBe(1));
    const text = String(hinweise[0].description);
    expect(text).toContain("Pipelinestufe");
    expect(text).toContain("qualifiziert");
    // Die Daten sind auch wirklich geschrieben, der Hinweis sagt also die Wahrheit.
    expect(investment.pipelineStufe).toBe("reservierung");
    expect(kontaktAenderungen.status).toBe("qualifiziert");
  });
});

describe("Wiederholung ohne das Formular erneut auszufüllen", () => {
  it("versendet beim zweiten Klick erneut und legt nichts doppelt an", async () => {
    versandAntwort = async () => ({ data: null, error: new Error("kaputt") });
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(hinweise.length).toBe(1));

    versandAntwort = async () => ({
      data: { success: true, results: [{ personType: "kaeufer1", email: kontakt.email, sent: true }] },
      error: null,
    });
    fireEvent.click(await screen.findByRole("button", { name: /Versand erneut versuchen/ }));

    await waitFor(() => expect(toasts.some(t => t.title?.startsWith("Unterschrift angefordert"))).toBe(true));
    expect(versandAufrufe.length).toBe(2);
    // Die Vorbereitung lief nur einmal, sonst stünde hier eine zweite Benachrichtigung.
    expect(benachrichtigungen.length).toBe(1);
    expect(await screen.findByRole("button", { name: /Unterschrift angefordert/ })).toBeInTheDocument();
  });
});

describe("Der gelungene Versand meldet weiterhin Erfolg", () => {
  it("zeigt den Erfolgstoast und keinen Hinweis", async () => {
    bisZumAbsenden();
    fireEvent.click(absendeKnopf());

    await waitFor(() => expect(toasts.some(t => t.title?.startsWith("Unterschrift angefordert"))).toBe(true));
    expect(hinweise.length).toBe(0);
    expect(benachrichtigungen.length).toBe(1);
    expect(versandAufrufe[0].name).toBe("send-reservation-signature");
  });
});

/*
 * Seit dem 14.09.2026 zeigt das Formular die Verkäuferdaten nicht mehr, es
 * reicht sie aber weiter ans Investment. Von dort holt sie der
 * Notar-Aufnahmebogen. Dieser Weg ist damit unsichtbar geworden, und genau
 * solche Wege brechen still: Niemand merkt am Bildschirm, dass nichts mehr
 * ankommt. Deshalb dieser Wächter.
 */
describe("Die Verkäuferdaten erreichen das Investment auch ohne eigenen Schritt", () => {
  it("schreibt sie beim Absenden zurück, obwohl das Formular sie nicht zeigt", async () => {
    bisZumAbsenden();
    // Kein Feld auf dem Schirm trägt den Verkäufernamen.
    expect(screen.queryByDisplayValue("Bau GmbH")).toBeNull();

    fireEvent.click(absendeKnopf());
    await waitFor(() => expect(toasts.some(t => t.title?.startsWith("Unterschrift angefordert"))).toBe(true));

    expect(metaFelder.objektVerkaeufer?.name).toBe("Bau GmbH");
    expect(metaFelder.objektVerkaeufer?.strasse).toBe("Weg 1");
    expect(metaFelder.objektVerkaeufer?.plz).toBe("95028");
    expect(metaFelder.objektVerkaeufer?.ort).toBe("Hof");
  });
});
