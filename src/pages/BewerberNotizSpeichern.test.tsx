import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Eine gespeicherte Notiz muss rechts im Reiter „Notizen" stehen bleiben.
 *
 * Christian hat am 17.09.2026 gemeldet: „wenn ich im Bewerberprofil eine Notiz
 * speicher, wird die rechts bei Aktivitaeten als Notiz nicht angezeigt,
 * beziehungsweise kurz angezeigt, aber dann verschwindet sie wieder."
 *
 * Geprüft wird der ganze Weg, so wie er in der Oberfläche läuft: runder Knopf
 * „Notiz", Text eintippen, speichern, und danach im Reiter „Notizen"
 * nachsehen. Der Zwischenspeicher ist nachgebaut wie der echte, also mit
 * sofortiger Anzeige und einem Schreibvorgang, der erst danach zurückkommt.
 */

/*
 * Ein schlichter Ersatz für den Browserspeicher. Die Seite fragt ihn an
 * mehreren Stellen ab, gemessen wird hier aber die Notiz und nicht er.
 */
const ablage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => (ablage.has(k) ? ablage.get(k)! : null),
    setItem: (k: string, v: string) => { ablage.set(k, String(v)); },
    removeItem: (k: string) => { ablage.delete(k); },
    clear: () => ablage.clear(),
    key: () => null,
    length: 0,
  },
});

// jsdom kennt kein Scrollen. Die Seite rollt das Profil beim Öffnen nach oben.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};

/** Der nachgebaute Zwischenspeicher, eine Zeile je Bewerber. */
type Zeile = { id: string; meta: Record<string, unknown> } & Record<string, unknown>;

const cache = vi.hoisted(() => ({
  rows: [] as Zeile[],
  /** Die noch offenen Schreibvorgänge, vom Test von Hand beantwortet. */
  offen: [] as (() => void)[],
  /** Lässt den Schreibvorgang scheitern, wie es das echte `cacheUpdate` tut. */
  fehlschlag: false,
}));

vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => cache.rows,
  cacheGetById: (_t: string, id: string) => cache.rows.find((r) => r.id === id),
  cacheFilter: (_t: string, p: (r: Zeile) => boolean) => cache.rows.filter(p),
  cacheUpdate: (_t: string, id: string, updates: Record<string, unknown>) => {
    const i = cache.rows.findIndex((r) => r.id === id);
    // Erst optimistisch anzeigen, genau wie im echten Zwischenspeicher.
    const vorher = i >= 0 ? cache.rows[i] : null;
    if (i >= 0) cache.rows[i] = { ...cache.rows[i], ...updates };
    return new Promise((auf, ab) =>
      cache.offen.push(() => {
        if (!cache.fehlschlag) return auf(true);
        // Und bei einem Fehlschlag die Zeile wieder zurücknehmen.
        if (i >= 0 && vorher) cache.rows[i] = vorher;
        ab(new Error("Schreibvorgang fehlgeschlagen"));
      }),
    );
  },
  cacheInsert: async (_t: string, row: Zeile) => { cache.rows.push(row); return row; },
  cacheDelete: async (_t: string, id: string) => {
    cache.rows = cache.rows.filter((r) => r.id !== id);
    return true;
  },
  cacheSet: () => {},
  cacheUpsert: async () => {},
  cacheReload: async () => {},
  cacheRefreshTable: async () => {},
  onCacheChange: () => () => {},
  isTableLoaded: () => true,
  ensureTables: async () => {},
  grosseOperationBeginnen: () => {},
  grosseOperationBeenden: () => {},
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette = () => {
    const selbst: Record<string, unknown> = {};
    for (const name of ["select", "in", "eq", "not", "order", "limit", "gte", "maybeSingle", "single"]) {
      selbst[name] = () => selbst;
    }
    selbst.then = (weiter: (w: unknown) => unknown, fehler?: (f: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(weiter, fehler);
    return selbst;
  };
  return {
    supabase: {
      from: () => kette(),
      functions: { invoke: async () => ({ data: null, error: null }) },
      channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
      removeChannel: () => undefined,
      auth: { getUser: async () => ({ data: { user: null } }) },
    },
  };
});

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    user: { id: "u1", role: "admin", name: "Jana Kirchner", email: "jana@example.com", moreId: "u1" },
    authUser: { id: "u1" },
  }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
/*
 * Die Meldungen werden abgefangen statt gezeichnet: Der Toast-Behälter hängt
 * im Seitenrahmen, den dieser Test nicht mitbringt.
 */
const meldungen = vi.hoisted(() => [] as { title?: string }[]);
vi.mock("@/hooks/use-toast", () => ({
  toast: (m: { title?: string }) => { meldungen.push(m); return { id: "1", dismiss: () => {}, update: () => {} }; },
  useToast: () => ({ toast: (m: { title?: string }) => { meldungen.push(m); }, toasts: [], dismiss: () => {} }),
}));
vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_k: string, f: unknown) => f,
  localSet: () => {},
}));

const { BewerberArbeitsplatz } = await import("./BewerberArbeitsplatz");
const { ABLAUF_NEU } = await import("@/lib/bewerberArbeitsplatz");

function zeile() {
  return {
    id: "b1",
    vorname: "Max",
    nachname: "Muster",
    email: "max@example.com",
    telefon: "0170 1234567",
    position: "",
    status: "Eingang",
    nachricht: "",
    notizen: "",
    meta: {
      _type: "bewerber",
      notizenLog: [],
      prozess: "neu",
      erstelltAm: "2026-09-01T08:00:00.000Z",
      beworben: "01.09.2026",
    },
  };
}

beforeEach(() => {
  cache.rows = [zeile()];
  cache.offen = [];
  cache.fehlschlag = false;
  meldungen.length = 0;
});

/** Alle wartenden Schreibvorgänge beantworten, wie es das Netz täte. */
async function schreibvorgaengeBeantworten() {
  await act(async () => {
    const jetzt = cache.offen;
    cache.offen = [];
    jetzt.forEach((f) => f());
    await Promise.resolve();
    await Promise.resolve();
  });
}

function zeichne() {
  return render(
    <MemoryRouter initialEntries={["/bewerberprozess?openBewerber=b1"]}>
      <TooltipProvider>
        <BewerberArbeitsplatz ablauf={ABLAUF_NEU} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

/** Die Notiz über den runden Knopf „Notiz" schreiben und speichern. */
function notizSchreiben(text: string) {
  fireEvent.click(screen.getByRole("button", { name: /Notiz zu diesem Bewerber schreiben/ }));
  fireEvent.change(screen.getByLabelText("Text der Notiz"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Notiz speichern" }));
}

it("zeigt die gespeicherte Notiz rechts, ohne dass jemand den Reiter umstellt", async () => {
  zeichne();
  await act(async () => { await Promise.resolve(); });

  notizSchreiben("Er will nebenberuflich starten.");
  await schreibvorgaengeBeantworten();

  /*
   * Ohne die Korrektur stand die rechte Spalte hier weiter auf „Aktivitäten",
   * und die frische Notiz war nirgends zu sehen. Der Knopf „Notiz" sitzt
   * links, das Fenster liegt über der ganzen Seite; die Spalte erfuhr vom
   * Speichern gar nichts.
   */
  const leiste = screen.getByTestId("bewerberprofil-aktivitaeten");
  expect(within(leiste).getByRole("tab", { name: /Notizen/ })).toHaveAttribute("aria-selected", "true");
  expect(within(leiste).getByText(/Er will nebenberuflich starten/)).toBeInTheDocument();
});

it("nimmt die Notiz nicht stillschweigend zurück, wenn der Schreibvorgang fehlschlägt", async () => {
  /*
   * Das ist der zweite Teil von Christians Beobachtung, „kurz angezeigt, aber
   * dann verschwindet sie wieder".
   *
   * `cacheUpdate` zeigt jede Änderung sofort an und nimmt sie bei einem
   * Fehlschlag wieder zurück. Bis zum 17.09.2026 wartete niemand auf den
   * Schreibvorgang, der Fehler landete in einem Versprechen, das niemand las,
   * und die Notiz verschwand ohne ein Wort. Hier wird beides geprüft: Sie ist
   * weg, weil sie wirklich nicht gespeichert wurde, und es steht dabei.
   */
  cache.fehlschlag = true;
  zeichne();
  await act(async () => { await Promise.resolve(); });

  notizSchreiben("Geht nicht durch.");
  await schreibvorgaengeBeantworten();

  expect(cache.rows[0].meta.notizenLog).toHaveLength(0);
  expect(meldungen.map((m) => m.title)).toContain("Notiz nicht gespeichert");
});

/*
 * ─── Die Übersicht nach dem Ausdünnen ───
 *
 * Christian am 17.09.2026: Die Kästen „Deine Bewertung" und „Telefonischer
 * Kontakt" sollen weg, weil er beides schon woanders hat. Bei den Sternen
 * stimmt das jetzt, sie stehen links und sind dort bedienbar. Beim Telefon
 * stimmt es nur für die beiden Knöpfe; alles andere in dem Kasten gibt es
 * sonst nirgends und muss deshalb stehen bleiben.
 */
describe("Übersicht, ausgedünnt", () => {
  async function oeffneUebersicht() {
    zeichne();
    await act(async () => { await Promise.resolve(); });
  }

  it("zeigt den Kasten mit der eigenen Bewertung nicht mehr", async () => {
    await oeffneUebersicht();
    expect(screen.queryByTestId("uebersicht-bewertung")).not.toBeInTheDocument();
    // Bewertet wird stattdessen links, an der einzigen verbliebenen Stelle.
    expect(screen.getByTestId("bewerberprofil-bewertung")).toBeInTheDocument();
  });

  it("laesst den Telefonstand stehen, aber ohne die doppelten Knoepfe", async () => {
    cache.rows[0].meta = {
      ...cache.rows[0].meta,
      kontaktversuche: [
        { id: "k1", versuch: 1, datum: "2026-09-15T09:00:00.000Z", ergebnis: "nicht_erreicht", von: "Jana", emailGesendet: true },
        { id: "k2", versuch: 2, datum: "2026-09-16T09:00:00.000Z", ergebnis: "nicht_erreicht", von: "Jana", emailGesendet: true },
      ],
    };
    await oeffneUebersicht();

    const kasten = screen.getByTestId("uebersicht-telefonstand");
    // Die Zahl der Versuche und die nächste Mail-Vorlage stehen weiter da.
    expect(kasten).toHaveTextContent("2 erfolglose Versuche, nächster: Mail-Vorlage Nr. 3");
    // Und der Verlauf ebenso.
    expect(kasten).toHaveTextContent(/Nicht erreicht \(Versuch 1\)/);
    // Die beiden Knöpfe stecken jetzt im Fenster hinter „Anrufen".
    expect(within(kasten).queryByRole("button")).not.toBeInTheDocument();
  });

  it("nennt die erfolglosen Anrufe auch links an der Telefonnummer", async () => {
    cache.rows[0].meta = {
      ...cache.rows[0].meta,
      kontaktversuche: [
        { id: "k1", versuch: 1, datum: "2026-09-15T09:00:00.000Z", ergebnis: "nicht_erreicht", von: "Jana", emailGesendet: true },
      ],
    };
    await oeffneUebersicht();
    expect(screen.getByTestId("bewerberprofil-nicht-erreicht")).toHaveTextContent("1 erfolgloser Anruf");
  });

  it("stellt den Vorab-Score nicht mehr als Karte in die Mitte", async () => {
    await oeffneUebersicht();
    expect(screen.queryByTestId("uebersicht-vorab-score")).not.toBeInTheDocument();
  });
});
