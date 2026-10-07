import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, within } from "@testing-library/react";
import {
  AUSSTIEG_TEXTE,
  KONDITIONEN_ANSICHT,
  WEGE,
  anschlussFuer,
  anschlussUnten,
  ansichtenFuer,
} from "@/lib/bewerberKennenlernen";

/**
 * Das Kennenlernen als begehbarer Weg.
 *
 * Geprüft werden die Dinge, die diese Fassung ausmachen und die man beim
 * Umbauen am leichtesten kaputt macht: der Spannungsbogen (keine Zahl zum
 * eigenen Verdienst vor den Konditionen), der Nebenweg auf Ansicht 1, die
 * Verzweigung auf die fünf Wege mit ihren eigenen Überschriften, der
 * Schieberegler und der Ausstieg von jeder Ansicht aus.
 */

/** jsdom bringt hier keinen localStorage mit, deshalb ein kleiner Ersatz. */
function stubLocalStorage() {
  const speicher = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (speicher.has(k) ? (speicher.get(k) as string) : null),
      setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
      removeItem: (k: string) => { speicher.delete(k); },
      clear: () => speicher.clear(),
    },
  });
}

const TOKEN = "a".repeat(64);

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useParams: () => ({ token: TOKEN }) };
});

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, functions: { invoke } },
}));

import { MemoryRouter } from "react-router-dom";
import BewerberKennenlernen from "./BewerberKennenlernen";

const IN_ZWEI_WOCHEN = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

async function oeffne() {
  await act(async () => {
    render(<MemoryRouter><BewerberKennenlernen /></MemoryRouter>);
  });
  // Mehrere Runden: Zugang, freie Zeiten und der Kalender hängen aneinander.
  for (let i = 0; i < 5; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

const weiter = () => screen.getByRole("button", { name: /^Weiter$/ }) as HTMLButtonElement;

/**
 * Eine Ansicht ausfüllen, so weit nötig, und weiterklicken.
 *
 * Bewusst nicht Frage für Frage von Hand: Der Bogen ist neunzehn Ansichten
 * lang, und ein Test, der jede Antwort einzeln kennt, geht bei jeder
 * inhaltlichen Änderung kaputt, ohne dass etwas Falsches passiert wäre.
 */
function fuelleUndWeiter() {
  for (const gruppe of screen.queryAllByRole("radiogroup")) {
    const radios = within(gruppe).queryAllByRole("radio");
    if (radios.length && !radios.some((r) => r.getAttribute("aria-checked") === "true")) {
      fireEvent.click(radios[0]);
    }
  }
  for (const gruppe of screen.queryAllByRole("group")) {
    const kaesten = within(gruppe).queryAllByRole("checkbox");
    if (kaesten.length && !kaesten.some((k) => k.getAttribute("aria-checked") === "true")) {
      fireEvent.click(kaesten[0]);
    }
  }
  for (const feld of screen.queryAllByRole("textbox")) {
    if (!(feld as HTMLInputElement).value) fireEvent.change(feld, { target: { value: "Etwas" } });
  }
  for (const regler of screen.queryAllByRole("slider")) {
    if (regler.getAttribute("aria-valuetext") === "noch nichts gewählt") {
      fireEvent.change(regler, { target: { value: "2" } });
    }
  }
  fireEvent.click(weiter());
}

/** Bis zu der Ansicht mit dieser Überschrift durchklicken. */
function bisZurAnsicht(titel: string | RegExp) {
  for (let i = 0; i < 25; i++) {
    if (screen.queryByRole("heading", { name: titel })) return;
    if (screen.queryByRole("button", { name: /Los geht es/ })) {
      fireEvent.click(screen.getByRole("button", { name: /Los geht es/ }));
      continue;
    }
    fuelleUndWeiter();
  }
  throw new Error(`Ansicht „${titel}" nicht erreicht`);
}

/**
 * Der Bogen ruft zwei verschiedene Datenbankfunktionen.
 *
 * `get_bewerber_formular` liefert den Bogen selbst, `bewerber_termin_zugang`
 * den Kalender für die Terminwahl am Ende. Der Ersatz unterscheidet sie am
 * Namen, sonst bekäme die Terminwahl die Antwort des Bogens zu sehen und
 * hielte sie für einen Kalender.
 *
 * Vorgabe für den Kalender ist `null`, also: es gibt keinen. Das ist der
 * Zustand, solange die Migration 20260906120000 nicht gelaufen ist, und die
 * Tests, die den Termin nicht meinen, sollen sich damit nicht befassen müssen.
 */
let formularZeile: Record<string, unknown> = {};
let terminZugang: unknown = null;
let freieZeiten: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  stubLocalStorage();
  window.scrollTo = vi.fn();
  formularZeile = { vorname: "Max", status: "offen", expires_at: IN_ZWEI_WOCHEN };
  terminZugang = null;
  freieZeiten = [];
  rpc.mockImplementation((name: string) => {
    if (name === "bewerber_termin_zugang") return Promise.resolve({ data: terminZugang, error: null });
    if (name === "bewerber_termin_freie_zeiten") return Promise.resolve({ data: freieZeiten, error: null });
    if (name === "bewerber_termin_buchen") {
      return Promise.resolve({ data: { id: "b1", start_at: freieZeiten[0] }, error: null });
    }
    return Promise.resolve({ data: [formularZeile], error: null });
  });
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("Ansicht 1, der Einstieg", () => {
  it("nennt die Art der Zusammenarbeit und keine einzige Zahl zum Verdienst", async () => {
    await oeffne();
    expect(screen.getByRole("heading", { name: /Hallo Max/ })).toBeInTheDocument();
    expect(screen.getByText(/selbstständige Tätigkeit auf Provision und keine Anstellung/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/4 Prozent|12\.000|150 Euro/);
  });

  it("zeigt das Kapitel mit Namen, nicht nur mit Nummer", async () => {
    await oeffne();
    expect(screen.getByText("Kapitel 1 von 7 · Ankommen")).toBeInTheDocument();
    expect(screen.getByText("Ansicht 1 von 21")).toBeInTheDocument();
  });

  /*
   * Der Nebenweg zu den Konditionen ist am 08.09.2026 entfallen.
   *
   * Er sparte dem Ungeduldigen vier Ansichten und kostete ihn genau das, was
   * den Bogen trägt: wer wir sind, für wen wir arbeiten und womit. Wer bei
   * der Provision einsteigt, liest sie ohne diesen Zusammenhang. Der Bogen
   * wird deshalb einmal ganz durchgeklickt.
   */
  it("bietet keinen Sprung zu den Konditionen mehr an", async () => {
    await oeffne();
    expect(screen.queryByRole("button", { name: /Kapitel 5/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/spring gleich/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Los geht es/ })).toBeInTheDocument();
  });
});

describe("Die Verzweigung auf Ansicht 2", () => {
  /*
   * Die Weiche stand bis zum 09.09.2026 auf Ansicht 5, hinter den drei
   * Ansichten über das Haus. Seit dem Kapiteltausch folgt sie unmittelbar auf
   * den Einstieg: erst sagt der Bewerber, wo er herkommt, danach erst erzählen
   * wir von uns.
   */
  async function bisZurVerzweigung() {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: /Los geht es/ }));
  }

  it("stellt genau die fünf Wege zur Wahl, als Einfachauswahl", async () => {
    await bisZurVerzweigung();
    expect(screen.getByText("Ansicht 2 von 21")).toBeInTheDocument();
    for (const w of WEGE) {
      expect(screen.getByRole("radio", { name: w.label })).toBeInTheDocument();
    }
  });

  it("sperrt Weiter, bis ein Weg gewählt ist", async () => {
    await bisZurVerzweigung();
    expect(weiter()).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: WEGE[2].label }));
    expect(weiter()).not.toBeDisabled();
  });

  it("zeigt danach die Ansicht dieser Strecke, mit ihrer eigenen Überschrift", async () => {
    await bisZurVerzweigung();
    const weg = WEGE[0];
    fireEvent.click(screen.getByRole("radio", { name: weg.label }));
    fireEvent.click(weiter());
    const erste = weg.ansichten[0];
    expect(screen.getByRole("heading", { name: erste.titel })).toBeInTheDocument();
    expect(screen.getByText(erste.frage!.frage)).toBeInTheDocument();
  });

  /*
   * Der gemeldete Fehler: Die Überschrift stand fest im Bogen und lautete auf
   * allen fünf Wegen „Deine Erfahrung, genauer". Bei „Beides ist neu für mich"
   * stand sie über der Frage, was den Bewerber an der Arbeit reizt.
   */
  it("gibt jedem Weg eigene Überschriften und eigene Fragen", async () => {
    for (const weg of WEGE) {
      await bisZurVerzweigung();
      fireEvent.click(screen.getByRole("radio", { name: weg.label }));
      fireEvent.click(weiter());
      for (const [i, eigene] of weg.ansichten.entries()) {
        expect(
          screen.getByRole("heading", { name: eigene.titel }),
          `${weg.id}, Ansicht ${i + 1}`,
        ).toBeInTheDocument();
        if (eigene.frage) expect(screen.getByText(eigene.frage.frage)).toBeInTheDocument();
        if (i < weg.ansichten.length - 1) {
          // Ohne Antwort geht es nicht weiter, außer die Ansicht hat keine Frage.
          if (eigene.frage?.typ === "text") {
            fireEvent.change(screen.getByRole("textbox"), { target: { value: "Etwas" } });
          } else if (eigene.frage) {
            const rolle = eigene.frage.typ === "mehrfach" ? "checkbox" : "radio";
            fireEvent.click(screen.getAllByRole(rolle)[0]);
          }
          fireEvent.click(weiter());
        }
      }
      cleanup();
      window.localStorage.clear();
    }
  });

  it("gibt dem Quereinstieg zusätzlich die Erklärung zum Kapitalanlage-Vertrieb", async () => {
    await bisZurVerzweigung();
    const weg = WEGE[4];
    fireEvent.click(screen.getByRole("radio", { name: weg.label }));
    fireEvent.click(weiter());
    expect(screen.getByText("Was ein Kapitalanlage-Vertrieb macht")).toBeInTheDocument();
  });

  /*
   * Die Freitextergänzung hinter „Bei mir liegt es anders" (08.09.2026). Ohne
   * das Feld wäre die Auswahl eine Sackgasse: Der Bewerber sagt, dass es bei
   * ihm anders liegt, und kann nirgends sagen, wie.
   */
  it("öffnet auf dem Quereinstieg ein Textfeld hinter „Bei mir liegt es anders“", async () => {
    await bisZurVerzweigung();
    fireEvent.click(screen.getByRole("radio", { name: WEGE[4].label }));
    fireEvent.click(weiter());
    // Ansicht 6 beantworten, dann steht Ansicht 7 da.
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(weiter());

    // Der Hinweis, dass niemand kündigen soll, steht vor der Frage.
    expect(screen.getByText(/soll dafür nicht kündigen/)).toBeInTheDocument();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Bei mir liegt es anders" }));
    const feld = screen.getByRole("textbox");
    expect(screen.getByText("Wie liegt es bei dir?")).toBeInTheDocument();
    // Solange nichts dasteht, geht es nicht weiter.
    expect(weiter()).toBeDisabled();
    fireEvent.change(feld, { target: { value: "Ich bin angestellt und habe keine Eile." } });
    expect(weiter()).not.toBeDisabled();
  });

  it("zeigt die Rückmeldung erst nach der Antwort", async () => {
    await bisZurVerzweigung();
    const weg = WEGE[0];
    fireEvent.click(screen.getByRole("radio", { name: weg.label }));
    fireEvent.click(weiter());
    const rueckmeldung = weg.ansichten[0].rueckmeldung!;
    // Vorher steht der Kasten nicht da. Er kommentierte sonst eine Antwort,
    // die noch gar nicht gegeben ist.
    expect(screen.queryByText(rueckmeldung.text)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("radio")[0]);
    expect(screen.getByText(rueckmeldung.text)).toBeInTheDocument();
  });
});

/*
 * Die Leitregel des Umbaus auf dem Bildschirm: Tatsachen bleiben für jeden
 * wörtlich gleich, nur der Anschluss wechselt. Der Test läuft jede der fünf
 * Gruppen einmal bis zur Erlaubnisansicht durch und liest unterwegs an fünf
 * Stellen nach, was dort steht.
 */
describe("Die Anschlusssätze im begangenen Bogen", () => {
  /** Bis hinter die Weiche, auf der Strecke dieser Gruppe. */
  async function starteMit(weg: (typeof WEGE)[number]) {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: /Los geht es/ }));
    fireEvent.click(screen.getByRole("radio", { name: weg.label }));
    fireEvent.click(weiter());
  }

  const ansichtAuf = (wegId: string, id: string) =>
    ansichtenFuer({ weg: wegId }).find((a) => a.id === id)!;

  it("zeigt jeder Gruppe ihren eigenen Satz und allen dieselben Tatsachen", async () => {
    for (const weg of WEGE) {
      await starteMit(weg);

      bisZurAnsicht("Wer wir sind");
      expect(
        screen.getByText(anschlussFuer(ansichtAuf(weg.id, "wersind"), { weg: weg.id })!),
        weg.id,
      ).toBeInTheDocument();
      // Die Tatsache darüber steht für jede Gruppe wörtlich gleich da.
      expect(screen.getByText(/Wir helfen Menschen, ihre persönlichen Wünsche/), weg.id)
        .toBeInTheDocument();

      bisZurAnsicht("Unsere Zielgruppe");
      expect(
        screen.getByText(anschlussFuer(ansichtAuf(weg.id, "zielgruppe"), { weg: weg.id })!),
        weg.id,
      ).toBeInTheDocument();
      expect(screen.getByText(/ab 3\.500 Euro netto im Monat/), weg.id).toBeInTheDocument();

      bisZurAnsicht("So läuft eine Abwicklung bei uns ab");
      const kasten = anschlussUnten(ansichtAuf(weg.id, "abwicklung"), { weg: weg.id })!;
      expect(screen.getByText("Und was das für dich heißt"), weg.id).toBeInTheDocument();
      expect(screen.getByText(kasten.text), weg.id).toBeInTheDocument();

      bisZurAnsicht("Was du verdienst");
      expect(
        screen.getByText(anschlussUnten(ansichtAuf(weg.id, "verdienst"), { weg: weg.id })!.text),
        weg.id,
      ).toBeInTheDocument();
      // Die Provision ist eine Tatsache und steht überall gleich.
      expect(screen.getByText(/4 Prozent Provision vom Kaufpreis/), weg.id).toBeInTheDocument();

      bisZurAnsicht("Gewerbe und Erlaubnis");
      expect(
        screen.getByText(anschlussFuer(ansichtAuf(weg.id, "erlaubnis"), { weg: weg.id })!),
        weg.id,
      ).toBeInTheDocument();
      expect(screen.getByText(/Für das Kennenlernen brauchst du noch keine Nachweise/), weg.id)
        .toBeInTheDocument();

      cleanup();
      window.localStorage.clear();
    }
    /*
     * Eigene Frist statt der voreingestellten fünf Sekunden.
     *
     * Dieser eine Test klickt alle fünf Gruppen bis zur Erlaubnisansicht
     * durch, das sind rund achtzig gerenderte Ansichten. Allein läuft er in
     * knapp zwei Sekunden; im vollen Lauf teilen sich mehrere hundert
     * Testdateien die Rechenzeit, und seit der Bogen eine Frage mehr stellt
     * (E8) und zwei Gruppen mehr die Leadfelder sehen (E9), reichte die
     * Voreinstellung nicht mehr. Gemessen wird hier Inhalt und nicht
     * Geschwindigkeit, deshalb die höhere Frist statt eines kleineren Tests.
     *
     * Nachtrag vom 09.09.2026: Mit zwanzig Sekunden ist er im vollen Lauf
     * einmal von 4463 Tests gescheitert und beim nächsten Lauf wieder grün
     * gewesen. Ein Test, der mal rot und mal grün ist, ist schlimmer als
     * einer, der immer rot ist, weil man ihm irgendwann nicht mehr glaubt.
     * Deshalb vierzig Sekunden. Sie kosten nichts, denn die Frist ist nur
     * eine Obergrenze und der Test braucht allein zwei Sekunden.
     */
  }, 40_000);

  /*
   * Der Vorsatz muss über den beiden Fragen stehen und nicht darunter: Der
   * Berater mit einer 34d soll ihn lesen, bevor er „Ja, habe ich" ankreuzt.
   */
  it("stellt den Vorsatz zur Erlaubnis vor die Fragen", async () => {
    await starteMit(WEGE[1]);
    bisZurAnsicht("Gewerbe und Erlaubnis");
    const vorsatz = screen.getByText(/Antworte hier bitte nur für die 34c/);
    const frage = screen.getByText("Hast du ein Gewerbe angemeldet?");
    expect(vorsatz.compareDocumentPosition(frage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Die Pause ist kein Abbruch", () => {
  /** Auf Ansicht 2 pausieren und dabei die Wahl treffen. */
  async function pausiere(wahl: RegExp) {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: /Los geht es/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ich mache später weiter/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: wahl }));
    });
  }

  it("bietet vier Möglichkeiten an und verspricht, dass keine davon einen Anruf auslöst", async () => {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: /Los geht es/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ich mache später weiter/ }));
    expect(screen.getByRole("heading", { name: /Du willst es dir noch überlegen\?/ })).toBeInTheDocument();
    for (const wahl of [/in einer Woche/, /in einem Monat/, /Erinnere mich nicht/, /Bewerbung beenden/]) {
      expect(screen.getByRole("button", { name: wahl })).toBeInTheDocument();
    }
    expect(screen.getByText(/Niemand ruft dich an, weil du hier pausiert hast/)).toBeInTheDocument();
  });

  it("meldet die Pause an den Server, bevor sie etwas verspricht", async () => {
    await pausiere(/in einer Woche/);

    /*
     * Der wichtigste Test dieser Datei. Auf dem nächsten Bildschirm steht
     * „ein Anruf kommt deswegen nicht". Der Satz stimmt nur, wenn die Pause
     * beim Server angekommen ist und die Erinnerungskette anhält.
     */
    expect(invoke).toHaveBeenCalledWith(
      "bewerber-seite",
      expect.objectContaining({ body: expect.objectContaining({ aktion: "pause", wahl: "woche", token: TOKEN }) }),
    );
    expect(screen.getByRole("heading", { name: /Alles gut, wir warten/ })).toBeInTheDocument();
    expect(screen.getByText(/Eine Pause ist keine Absage, und ein Anruf kommt deswegen nicht/)).toBeInTheDocument();
  });

  it("bleibt auf der Wahl stehen, wenn der Server nicht antwortet", async () => {
    invoke.mockRejectedValueOnce(new Error("Netz weg"));
    await pausiere(/in einer Woche/);
    // Kein Versprechen ohne Vermerk: Der alte Fehler war genau dieser Wechsel.
    expect(screen.queryByRole("heading", { name: /Alles gut, wir warten/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Das hat leider nicht geklappt/)).toBeInTheDocument();
  });

  it("beendet über die vierte Möglichkeit, und das ist keine Pause", async () => {
    await pausiere(/Bewerbung beenden/);
    expect(invoke).toHaveBeenCalledWith(
      "bewerber-seite",
      expect.objectContaining({ body: expect.objectContaining({ aktion: "ausstieg" }) }),
    );
    expect(screen.getByRole("heading", { name: /Danke für deine Offenheit/ })).toBeInTheDocument();
  });

  it("lässt sich zurücknehmen, und auch das erfährt der Server", async () => {
    await pausiere(/in einer Woche/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Doch weitermachen/ }));
    });
    expect(invoke).toHaveBeenCalledWith(
      "bewerber-seite",
      expect.objectContaining({ body: expect.objectContaining({ aktion: "weiter" }) }),
    );
    expect(screen.getByText("Ansicht 2 von 21")).toBeInTheDocument();
  });
});

describe("Abgelaufene und unbekannte Links", () => {
  it("erklärt den abgelaufenen Link, ohne den Bewerber abzuweisen", async () => {
    formularZeile = { vorname: "Max", status: "offen", expires_at: new Date(Date.now() - 1000).toISOString() };
    await oeffne();
    expect(screen.getByRole("heading", { name: /Dieser Link ist abgelaufen/ })).toBeInTheDocument();
  });

  it("zeigt den bereits ausgefüllten Bogen als erledigt", async () => {
    formularZeile = { vorname: "Max", status: "eingereicht", expires_at: IN_ZWEI_WOCHEN };
    await oeffne();
    expect(screen.getByRole("heading", { name: /Das hast du schon erledigt/ })).toBeInTheDocument();
  });
});

/**
 * Der Abschluss am Ende, seit dem 08.09.2026 ohne Terminwahl.
 *
 * Vorher suchte sich der Bewerber hier selbst seine Zeit aus, und der Termin
 * stand, bevor irgendjemand seine Antworten gelesen hatte. Eingeladen wird
 * jetzt aus dem Bewerberprofil heraus; der Kalender liegt allein in der
 * Buchungsstrecke `/kooperationsgespraech/:token`.
 *
 * Geprüft wird deshalb dreierlei: dass hier kein Kalender mehr steht, dass der
 * Text sagt, wann und worüber wir uns melden, und dass ein schon gebuchter
 * Termin nicht verloren geht.
 */
const ZUGANG = {
  gastgeber: { name: "Sarah Kaiser-Thom", email: "os@os-immobilien.com" },
  zeitzone: "Europe/Berlin",
  dauer_minuten: 30,
  bezeichnung: "Bewerbergespräch",
  beschreibung: null,
  vorausschau_tage: 30,
  buchbar: true,
  buchung: null,
};

/** Die Knöpfe, die im Monatskalender einen Tag tragen. */
const kalendertage = () =>
  screen.queryAllByRole("button").filter((b) => /^\d{1,2}$/.test(b.textContent || ""));

describe("Der Abschluss ohne Terminwahl", () => {
  it("bietet nach dem Absenden keinen Kalender an, auch wenn es einen gäbe", async () => {
    formularZeile = { vorname: "Max", status: "eingereicht", expires_at: IN_ZWEI_WOCHEN };
    // Der Kalender ist buchbar und es sind Zeiten frei. Trotzdem darf hier
    // nichts davon erscheinen: Buchen darf nur, wen wir eingeladen haben.
    terminZugang = ZUGANG;
    const heute = new Date();
    const tag = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate() + 2, 8, 0));
    freieZeiten = [tag.toISOString(), new Date(tag.getTime() + 3600_000).toISOString()];
    await oeffne();

    expect(kalendertage()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /10:00 Uhr/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Such dir/ })).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("bewerber_termin_freie_zeiten", expect.anything());
  });

  it("sagt stattdessen, wann und worüber wir uns melden, und lässt beide Ausgänge offen", async () => {
    formularZeile = { vorname: "Max", status: "offen", expires_at: IN_ZWEI_WOCHEN };
    terminZugang = ZUGANG;
    await oeffne();
    bisZurAnsicht(/Fast geschafft/);

    // Der Knopf sagt nur noch, was er tut.
    expect(screen.getByRole("button", { name: /^Angaben absenden$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Termin aussuchen/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/./, { selector: "input[type=checkbox]" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Angaben absenden$/ }));
    });
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });

    expect(screen.getByRole("heading", { name: /Danke, Max/ })).toBeInTheDocument();
    const text = document.body.textContent || "";
    expect(text).toMatch(/Hören wirst du von uns/);
    // Beide Ausgänge, damit das Schweigen keiner wird.
    expect(text).toMatch(/persönliches Gespräch/);
    expect(text).toMatch(/wenn es nicht passt/i);
    // Und keine Dauer und keine Gastgeberin: Beides ist noch nicht entschieden.
    expect(text).not.toMatch(/\d+ Minuten/);
    expect(kalendertage()).toHaveLength(0);
    // Die Zusammenfassung geht per Mail hinaus, deshalb der Hinweis auf Absender und Spam-Ordner.
    expect(screen.getByTestId("spam-hinweis")).toHaveTextContent("Unsere Mail kommt von noreply@os-immobilien.com.");
  });

  it("hält einen schon gebuchten Termin und führt zum Verschieben in die Buchungsstrecke", async () => {
    /*
     * Wer vor der Umstellung selbst gebucht hat, behält seinen Termin. Ohne
     * diesen Fall liefe jeder alte Link ins Leere.
     */
    formularZeile = { vorname: "Max", status: "eingereicht", expires_at: IN_ZWEI_WOCHEN };
    terminZugang = {
      ...ZUGANG,
      buchung: {
        id: "b1",
        start_at: "2026-09-07T08:00:00Z",
        ende_at: "2026-09-07T08:30:00Z",
        dauer_minuten: 30,
        status: "offen",
        bezeichnung: "Persönliches Gespräch",
        raum_token: "raumtoken",
      },
    };
    await oeffne();

    expect(screen.getByRole("heading", { name: /Dein Termin steht/ })).toBeInTheDocument();
    expect(screen.getByText(/Montag, 7\. September 2026, 10:00 bis 10:30 Uhr/)).toBeInTheDocument();
    /*
     * Punkt C2: Der Raumlink stand hier direkt nach dem Buchen, Wochen vor dem
     * Termin, und führte in einen leeren Raum. Jetzt kommt er per Mail.
     */
    expect(screen.queryByRole("link", { name: /Gesprächsraum/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("/raum/raumtoken");
    expect(screen.getByText(/Den Link zum Videoraum bekommst du per E-Mail/)).toBeInTheDocument();

    const verwalten = screen.getByRole("link", { name: /Termin verschieben oder absagen/ });
    expect(verwalten).toHaveAttribute("href", `/kooperationsgespraech/${TOKEN}`);
    expect(kalendertage()).toHaveLength(0);
  });
});

/**
 * Der Schieberegler für das Einkommensziel (Punkt P3).
 *
 * Vorher standen dort vier Kacheln, die nur wie eine Skala aussahen. Geprüft
 * wird, dass es jetzt ein echter Regler ist: mit Rolle, mit Pfeiltasten und
 * mit „Weiß ich noch nicht" als eigenem Knopf daneben statt als fünfter Stufe.
 */
describe("Der Schieberegler für das Einkommensziel", () => {
  /** Bis zur Ansicht „Deine ersten Kunden und dein Ziel" durchklicken. */
  async function bisZumRegler() {
    await oeffne();
    bisZurAnsicht("Deine ersten Kunden und dein Ziel");
  }

  it("ist ein echter Regler mit vier Stufen und beschriftet sich für Screenreader", async () => {
    await bisZumRegler();
    const regler = screen.getByRole("slider") as HTMLInputElement;
    expect(regler.min).toBe("1");
    expect(regler.max).toBe("4");
    expect(regler.step).toBe("1");
    expect(regler).toHaveAttribute("aria-valuetext", "noch nichts gewählt");

    fireEvent.change(regler, { target: { value: "3" } });
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "5.000 bis 10.000 Euro");
    // Der gewählte Wert steht groß darüber und an seiner Stufe.
    expect(screen.getAllByText("5.000 bis 10.000 Euro").length).toBeGreaterThan(0);
  });

  it("hält „Weiß ich noch nicht“ aus der Skala heraus", async () => {
    await bisZumRegler();
    const regler = screen.getByRole("slider") as HTMLInputElement;
    expect(regler.max).toBe("4");
    const knopf = screen.getByRole("button", { name: /Weiß ich noch nicht/ });
    fireEvent.click(knopf);
    expect(screen.getByRole("button", { name: /Weiß ich noch nicht/ })).toHaveAttribute("aria-pressed", "true");
  });
});

/**
 * Der Ausstieg von jeder Ansicht aus (Punkt P11).
 *
 * Vorher stand er nur auf Ansicht 1. Wer auf Ansicht 12 merkte, dass es nicht
 * passt, musste entweder bis zum Ende klicken oder in einer alten Mail nach
 * dem Abmeldelink suchen.
 */
describe("Kein Interesse, von jeder Ansicht aus", () => {
  it("steht auf Ansicht 1 und ebenso auf einer späteren Ansicht", async () => {
    await oeffne();
    expect(screen.getByRole("button", { name: AUSSTIEG_TEXTE.link })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Los geht es/ }));
    // Auf Ansicht 2 steht die Weiche. Weiter geht es erst mit einer Antwort.
    fireEvent.click(screen.getByRole("radio", { name: WEGE[0].label }));
    fireEvent.click(weiter());
    expect(screen.getByText("Ansicht 3 von 21")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AUSSTIEG_TEXTE.link })).toBeInTheDocument();
  });

  it("fragt nach dem Grund, meldet ihn an den Server und bestätigt danach", async () => {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: AUSSTIEG_TEXTE.link }));

    expect(screen.getByRole("heading", { name: AUSSTIEG_TEXTE.titel })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(AUSSTIEG_TEXTE.platzhalter)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(AUSSTIEG_TEXTE.platzhalter), {
      target: { value: "Der Zeitpunkt passt gerade nicht." },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUSSTIEG_TEXTE.beenden }));
    });

    /*
     * Derselbe Weg wie auf der persönlichen Bewerberseite: Die Function setzt
     * den Status auf KeinInteresse, schreibt den Grund nach
     * meta.selbstAbgemeldetGrund und hält die Erinnerungsketten an.
     */
    expect(invoke).toHaveBeenCalledWith(
      "bewerber-seite",
      expect.objectContaining({
        body: expect.objectContaining({
          aktion: "ausstieg",
          token: TOKEN,
          text: "Der Zeitpunkt passt gerade nicht.",
        }),
      }),
    );
    expect(screen.getByRole("heading", { name: /Danke für deine Offenheit/ })).toBeInTheDocument();
  });

  it("bringt „Doch weitermachen“ auf dieselbe Ansicht zurück", async () => {
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: /Los geht es/ }));
    // Über die Weiche auf Ansicht 2 hinweg, sonst bleibt Weiter gesperrt.
    fireEvent.click(screen.getByRole("radio", { name: WEGE[0].label }));
    fireEvent.click(weiter());
    fireEvent.click(screen.getByRole("button", { name: AUSSTIEG_TEXTE.link }));
    fireEvent.click(screen.getByRole("button", { name: AUSSTIEG_TEXTE.weiter }));
    expect(screen.getByText("Ansicht 3 von 21")).toBeInTheDocument();
  });

  it("beendet nichts, wenn der Server nicht antwortet", async () => {
    invoke.mockRejectedValueOnce(new Error("Netz weg"));
    await oeffne();
    fireEvent.click(screen.getByRole("button", { name: AUSSTIEG_TEXTE.link }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUSSTIEG_TEXTE.beenden }));
    });
    expect(screen.queryByRole("heading", { name: /Danke für deine Offenheit/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Das hat leider nicht geklappt/)).toBeInTheDocument();
  });

  it("steht auch auf der Terminwahl, nach dem Absenden", async () => {
    formularZeile = { vorname: "Max", status: "eingereicht", expires_at: IN_ZWEI_WOCHEN };
    terminZugang = ZUGANG;
    await oeffne();
    expect(screen.getByRole("button", { name: AUSSTIEG_TEXTE.link })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: AUSSTIEG_TEXTE.link }));
    expect(screen.getByRole("heading", { name: AUSSTIEG_TEXTE.titel })).toBeInTheDocument();
  });
});
