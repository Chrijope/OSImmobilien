import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Die Bewerberliste soll fertig erscheinen und sich danach nicht mehr umbauen.
 *
 * Christian hat am 17.09.2026 gemeldet: „Wenn ich auf Bewerberprozess klicke,
 * wird die Seite zuerst ungefiltert angezeigt und dann ändert sie sich nach
 * einer Sekunde noch." Die Ursache war die Reihenfolge der Zeilen. Die Liste
 * teilt sich in zwei Bereiche, oben die Bewerber mit ausgefülltem
 * Kennenlernbogen. Woher der Bogen kommt, steht in `bewerber_formular`, einer
 * Tabelle außerhalb des Zwischenspeichers. Bis ihre Antwort da war, stand
 * niemand im oberen Bereich, und danach sprang die Reihenfolge.
 *
 * Am 26.09.2026 kam die Gegenrichtung: „Wenn ich in der Sidebar auf
 * Bewerberprozess klicke, kommt zuerst ein kleiner Ladebalken. Das soll nicht
 * sein." Die Seite soll also fertig erscheinen und trotzdem sofort.
 *
 * Geprüft werden deshalb diese Zusagen:
 *
 *   1. Solange beim allerersten Aufbau eine der Abfragen offen ist, erscheint
 *      keine Liste, sondern ein ruhiges Skelett ohne Ladehinweis.
 *   2. Sind alle Antworten da, steht die Reihenfolge sofort richtig und ändert
 *      sich danach nicht mehr.
 *   3. Beim zweiten Öffnen der Seite erscheint kein Skelett, auch dann nicht,
 *      wenn inzwischen ein Bewerber dazugekommen ist.
 *   4. Eine offene Liste springt nicht zurück ins Skelett.
 *   5. Nach dem Vorladen im App-Rahmen steht die Liste schon beim ersten
 *      Öffnen sofort da.
 *   6. Den Knopf „Ablauf umstellen" gibt es nicht mehr.
 */

/** Die offenen Abfragen, die der Test von Hand beantwortet. */
const steuerung = vi.hoisted(() => ({
  offen: [] as (() => void)[],
  formularZeilen: [] as Record<string, unknown>[],
}));

/** Alle wartenden Abfragen beantworten. */
async function antworten() {
  await act(async () => {
    const jetzt = steuerung.offen;
    steuerung.offen = [];
    jetzt.forEach((f) => f());
    // Zwei Runden: Die Hooks rechnen nach der Antwort noch einmal weiter.
    await Promise.resolve();
    await Promise.resolve();
  });
}

vi.mock("@/integrations/supabase/client", () => {
  const ergebnis = (tabelle: string) =>
    tabelle === "bewerber_formular"
      ? { data: steuerung.formularZeilen, error: null }
      : { data: [], error: null };
  const kette = (tabelle: string) => {
    const selbst: Record<string, unknown> = {};
    for (const name of ["select", "in", "eq", "not", "order", "limit"]) {
      selbst[name] = () => selbst;
    }
    selbst.then = (weiter: (w: unknown) => unknown, fehler?: (f: unknown) => unknown) =>
      new Promise((aufloesen) => {
        steuerung.offen.push(() => aufloesen(ergebnis(tabelle)));
      }).then(weiter, fehler);
    return selbst;
  };
  return {
    supabase: {
      from: (tabelle: string) => kette(tabelle),
      functions: {
        invoke: () =>
          new Promise((aufloesen) => {
            steuerung.offen.push(() => aufloesen({ data: { empfaenger: [], ausgeschlossen: [] }, error: null }));
          }),
      },
      channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
      removeChannel: () => undefined,
    },
  };
});

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "u1", role: "admin", name: "Test", email: "test@example.com" }, authUser: null }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Die Bewerber liegen im Test immer im Zwischenspeicher. Geprüft wird hier das
// Warten auf die Abfragen daneben, nicht das Laden der Tabelle selbst.
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/dataCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dataCache")>()),
  // Das Vorladen wartet auf die Tabelle; im Test liegt sie schon da.
  wennTabellenGeladen: (_tabellen: string[], aktion: () => void) => {
    aktion();
    return () => {};
  },
}));

const bestand = vi.hoisted(() => ({ liste: [] as unknown[] }));
vi.mock("@/lib/bewerbungStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bewerbungStore")>()),
  getBewerber: () => bestand.liste,
}));

const { BewerberArbeitsplatz } = await import("./BewerberArbeitsplatz");
const { ABLAUF_NEU } = await import("@/lib/bewerberArbeitsplatz");
const { leereNachladeSpeicher } = await import("@/components/bewerbung/nachladeSpeicher");
const { setzeSammelmailStandZurueck } = await import("@/lib/bewerberSammelmailStand");
const { setzeVersandRundeZurueck } = await import("@/lib/bewerberVersandRunde");
const { bewerberlisteVorladen, setzeVorladenZurueck } = await import("@/components/bewerbung/bewerberlisteVorladen");

/** Ein Bewerber im Eingang, so schlank wie die Liste ihn braucht. */
function bewerber(id: string, nachname: string, erstelltAm: string) {
  return {
    id,
    vorname: "Test",
    nachname,
    email: `${id}@example.com`,
    telefon: "",
    ort: "",
    quelle: "",
    stelleId: "",
    stelleTitel: "",
    status: "Eingang",
    bewertung: 0,
    erstelltAm,
    beworben: erstelltAm,
    dokumente: [],
    notizenLog: [],
    benachrichtigungen: [],
    meta: {},
    prozess: "neu",
  };
}

/** Ein eingereichter Kennenlernbogen, stark genug für eine Zahl über null. */
const KENNENLERNEN = {
  bogen: "kennenlernen",
  weg: "weg1",
  hintergrund: ["immo"],
  zeitProWoche: "vollzeit",
  perspektive: "sofort_haupt",
  leadPraeferenz: "beides",
  einkommensziel: "5000_10000",
  startzeitpunkt: "sofort",
  gewerbe34c: "beides",
  verstaendnisFixum: "nein",
  verstaendnisProvision: "nein",
  wegAntwort1: "ueber_10",
  wegAntwort3: "anleger",
};

function seiteZeigen() {
  return render(
    <MemoryRouter initialEntries={["/bewerberprozess"]}>
      {/* Wie in `App.tsx`: Die Zeigetexte der Liste brauchen den Anbieter. */}
      <TooltipProvider>
        <BewerberArbeitsplatz ablauf={ABLAUF_NEU} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

/** Die Nachnamen in der Reihenfolge, in der sie auf der Seite stehen. */
function reihenfolge(): string[] {
  const html = document.body.innerHTML;
  return ["Adler", "Bogen", "Celle"]
    .map((name) => ({ name, stelle: html.indexOf(name) }))
    .filter((x) => x.stelle >= 0)
    .sort((a, b) => a.stelle - b.stelle)
    .map((x) => x.name);
}

describe("Bewerberliste: erst vollständig, dann sichtbar", () => {
  beforeEach(() => {
    cleanup();
    // Diese Umgebung bringt keinen localStorage mit, mehrere Store-Module
    // greifen aber darauf zu. Ein schlichter Ersatz genügt.
    const inhalt = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => inhalt.get(k) ?? null,
      setItem: (k: string, v: string) => { inhalt.set(k, v); },
      removeItem: (k: string) => { inhalt.delete(k); },
      clear: () => inhalt.clear(),
    });
    steuerung.offen = [];
    leereNachladeSpeicher();
    setzeVorladenZurueck();
    setzeSammelmailStandZurueck();
    setzeVersandRundeZurueck();
    // Adler ist der jüngste Eingang, Bogen liegt in der Mitte, Celle ist der
    // älteste. Nach Eingangsdatum stünde Bogen also in der Mitte. Nur Bogen hat
    // den Kennenlernbogen ausgefüllt und gehört damit nach oben.
    bestand.liste = [
      bewerber("a", "Adler", "2026-09-15T08:00:00.000Z"),
      bewerber("b", "Bogen", "2026-09-10T08:00:00.000Z"),
      bewerber("c", "Celle", "2026-09-05T08:00:00.000Z"),
    ];
    steuerung.formularZeilen = [
      {
        bewerbung_id: "b",
        antworten: KENNENLERNEN,
        eingereicht_am: "2026-09-16T09:00:00.000Z",
        created_at: "2026-09-11T09:00:00.000Z",
        status: "eingereicht",
      },
    ];
  });

  it("zeigt bis zur letzten Antwort das Skelett und danach die fertige Reihenfolge", async () => {
    seiteZeigen();

    // 1. Noch keine Antwort: keine Zeile, sondern das Skelett. Einen
    //    Ladehinweis mit Text gibt es nicht mehr, der Titel steht schon da.
    expect(screen.getByTestId("bewerberliste-skelett")).toBeInTheDocument();
    expect(screen.queryByText(/werden geladen/)).not.toBeInTheDocument();
    expect(screen.getByText(ABLAUF_NEU.titel)).toBeInTheDocument();
    expect(screen.queryByText(/Adler/)).not.toBeInTheDocument();

    // 2. Alle Abfragen beantworten. Es sind mehrere Runden, weil eine Antwort
    //    die nächste Abfrage auslösen kann.
    for (let runde = 0; runde < 4 && steuerung.offen.length > 0; runde += 1) {
      await antworten();
    }

    // 3. Die Liste steht, und zwar sofort in der endgültigen Reihenfolge:
    //    Bogen oben, weil sein Kennenlernbogen vorliegt.
    expect(screen.queryByTestId("bewerberliste-skelett")).not.toBeInTheDocument();
    // Bogen oben, darunter die beiden ohne Bogen nach Eingangsdatum.
    expect(reihenfolge()).toEqual(["Bogen", "Adler", "Celle"]);

    // 4. Und sie bleibt so. Nichts kommt mehr nach, das sie umbaut.
    const vorher = document.body.innerHTML;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.innerHTML).toBe(vorher);
  });

  it("zeigt beim zweiten Öffnen der Seite kein Skelett mehr", async () => {
    const ersteAnsicht = seiteZeigen();
    for (let runde = 0; runde < 4 && steuerung.offen.length > 0; runde += 1) {
      await antworten();
    }
    expect(screen.queryByTestId("bewerberliste-skelett")).not.toBeInTheDocument();

    ersteAnsicht.unmount();
    seiteZeigen();

    // Die Antworten von eben sind gemerkt, die Liste steht also sofort da.
    // Gefragt wird trotzdem noch einmal, aber im Hintergrund.
    expect(screen.queryByTestId("bewerberliste-skelett")).not.toBeInTheDocument();
    expect(screen.queryAllByText(/Bogen/).length).toBeGreaterThan(0);
  });

  it("zeigt auch nach einem neuen Bewerber seit dem letzten Besuch sofort die Liste", async () => {
    const ersteAnsicht = seiteZeigen();
    for (let runde = 0; runde < 4 && steuerung.offen.length > 0; runde += 1) {
      await antworten();
    }
    ersteAnsicht.unmount();

    // Inzwischen hat sich jemand über die Website beworben. Bis zum
    // 26.09.2026 passte die gemerkte Antwort dann nicht mehr, und die Liste
    // wartete wieder von vorn.
    bestand.liste = [...bestand.liste, bewerber("d", "Dorn", "2026-09-20T08:00:00.000Z")];
    seiteZeigen();

    expect(screen.queryByTestId("bewerberliste-skelett")).not.toBeInTheDocument();
    expect(screen.queryAllByText(/Dorn/).length).toBeGreaterThan(0);
    // Die bekannten Bewerber stehen weiter richtig: Bogen oben.
    expect(reihenfolge()).toEqual(["Bogen", "Adler", "Celle"]);
  });

  it("springt nicht ins Skelett zurück, wenn während der Arbeit ein Bewerber dazukommt", async () => {
    seiteZeigen();
    for (let runde = 0; runde < 4 && steuerung.offen.length > 0; runde += 1) {
      await antworten();
    }
    expect(screen.queryByTestId("bewerberliste-skelett")).not.toBeInTheDocument();

    await act(async () => {
      bestand.liste = [...bestand.liste, bewerber("d", "Dorn", "2026-09-20T08:00:00.000Z")];
      window.dispatchEvent(new Event("bewerbung-updated"));
    });

    expect(screen.queryByTestId("bewerberliste-skelett")).not.toBeInTheDocument();
    expect(screen.queryAllByText(/Dorn/).length).toBeGreaterThan(0);
  });

  it("zeigt nach dem Vorladen schon beim ersten Öffnen sofort die Liste", async () => {
    // Das tut der App-Rahmen gleich nach dem Login.
    bewerberlisteVorladen();
    for (let runde = 0; runde < 4 && steuerung.offen.length > 0; runde += 1) {
      await antworten();
    }

    seiteZeigen();

    expect(screen.queryByTestId("bewerberliste-skelett")).not.toBeInTheDocument();
    expect(reihenfolge()).toEqual(["Bogen", "Adler", "Celle"]);
  });

  it("hat oben rechts keinen Knopf „Ablauf umstellen\" mehr", async () => {
    seiteZeigen();
    for (let runde = 0; runde < 4 && steuerung.offen.length > 0; runde += 1) {
      await antworten();
    }
    expect(screen.queryByTestId("bewerberliste-skelett")).not.toBeInTheDocument();
    // Die übrigen Knöpfe im Kopf sind da, der zum Umstellen nicht.
    expect(screen.getByText("Handbuch")).toBeInTheDocument();
    expect(screen.queryByText(/Ablauf umstellen/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /umstellen/i })).not.toBeInTheDocument();
  });
});
