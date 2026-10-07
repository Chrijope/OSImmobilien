import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { KundeData } from "@/lib/kundenStore";
import { PipelineSummenLeiste } from "@/components/pipeline/PipelineSummenLeiste";

/**
 * Die Summenleiste unter den Spalten der Kunden-Pipeline.
 *
 * Christian (25.09.2026): Die Leiste war unten abgeschnitten, am Bildschirmrand
 * stand nur ein schmaler, leerer Streifen. Die Seite rechnete ihre Hoehe mit
 * `calc(100vh-7rem)` selbst aus und war damit hoeher als der Platz; die
 * Leiste stand ausserdem im selben senkrechten Scrollbereich wie die Karten.
 *
 * Geprueft wird hier der Aufbau, den der Browser braucht, damit die Leiste
 * immer sichtbar bleibt: Jede Spalte hat ihre Summenzelle, die Zellen stehen
 * in derselben Reihenfolge wie die Spalten, und die Leiste liegt ausserhalb
 * der senkrecht scrollenden Kartenlisten. Ob sie tatsaechlich im Fenster
 * steht, misst jsdom nicht; das ist im Browser nachgemessen.
 */

const stand = vi.hoisted(() => ({ kontakte: [] as unknown[] }));

vi.mock("@/integrations/supabase/client", () => {
  const leer = async () => ({ data: [], error: null });
  const kette: Record<string, unknown> = {};
  for (const n of ["select", "eq", "in", "order", "limit", "neq", "is", "or", "not", "gte", "lte"]) kette[n] = () => kette;
  kette.then = (fertig: (w: unknown) => unknown) => leer().then(fertig);
  kette.maybeSingle = async () => ({ data: null, error: null });
  kette.single = async () => ({ data: null, error: null });
  return {
    supabase: {
      from: () => kette,
      rpc: async () => ({ data: null, error: null }),
      channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
      removeChannel: () => undefined,
      auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
    },
  };
});
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "u1", role: "admin", name: "Test", email: "" }, authUser: { id: "u1" } }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [] }));
// Die Seite wird hier so gezeichnet, wie sie in der Lovable-Vorschau laeuft.
// Dort galt bis zum 25.09.2026 ein Sonderabstand unter der Scrollleiste.
vi.mock("@/lib/previewFlag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/previewFlag")>()),
  isPreviewEnv: () => true,
}));
vi.mock("@/lib/kundenStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kundenStore")>()),
  getKontakte: () => stand.kontakte,
}));

const { default: Pipeline } = await import("./Pipeline");

function kontakt(id: string, pipelineStufe: string): KundeData {
  return {
    id, vorname: "Erika", nachname: `Muster ${id}`, email: "", telefon: "", ort: "", berater: "",
    zustaendig_id: "u1", status: "aktiv", pipelineStufe, archiviert: false, meta: {},
  } as unknown as KundeData;
}

/** Stufen vor der Objektauswahl: Dort steht unten keine Kachel. */
const OHNE_SUMME = ["neuer_lead", "nicht_erreicht", "erreicht", "follow_up", "erstgespraech_geplant", "beratungsgespraech", "selbstauskunft"];

describe("Summenleiste der Kunden-Pipeline", () => {
  /*
   * Christian (25.09.2026, zweite Runde): Unten steht nur noch die
   * Gesamtsumme, „Gesamt: 1.008.900 €", und nur unter den Spalten ab der
   * Objektauswahl. Die Anzahl wandert zurueck in den Spaltenkopf.
   */
  it("zeigt „Gesamt: … €\" nur unter Spalten mit Summe, nirgends „Leads\"", () => {
    stand.kontakte = [kontakt("k1", "neuer_lead"), kontakt("k2", "neuer_lead")];
    render(<MemoryRouter><Pipeline /></MemoryRouter>);

    const leiste = document.querySelector<HTMLElement>('[data-pruefung="pipeline-summen"]')!;
    expect(leiste.textContent).not.toMatch(/Leads?\b/);
    expect(document.body.textContent).not.toContain("Summe ab Objektauswahl");

    // Vor der Objektauswahl: keine Kachel, kein Text, keine Karte.
    for (const key of OHNE_SUMME) {
      expect(leiste.querySelector(`[data-pruefung="pipeline-summe"][data-stufe="${key}"]`)).toBeNull();
      const platz = leiste.querySelector<HTMLElement>(`[data-pruefung="pipeline-summe-leer"][data-stufe="${key}"]`)!;
      expect(platz).toBeTruthy();
      expect(platz.textContent).toBe("");
      expect(platz.getAttribute("data-ui")).toBeNull();
      expect(platz.getAttribute("aria-hidden")).toBe("true");
    }

    // Ab der Objektauswahl: eine Kachel mit „Gesamt: … €".
    for (const key of ["objektauswahl", "reservierung", "notar", "abgeschlossen"]) {
      const kachel = leiste.querySelector<HTMLElement>(`[data-pruefung="pipeline-summe"][data-stufe="${key}"]`)!;
      expect(kachel).toBeTruthy();
      expect(kachel.textContent).toMatch(/^Gesamt: 0\s€$/);
      expect(kachel.getAttribute("data-ui")).toBe("card");
    }
  });

  /*
   * Die uebrigen Kacheln bleiben buendig unter ihrer Spalte: Zu jeder Spalte
   * gibt es genau einen Platz in der Leiste (Kachel oder leerer Platzhalter),
   * in derselben Reihenfolge, gleich breit und mit demselben Abstand. jsdom
   * rechnet kein Layout, der Versatz 0 ist im Browser nachgemessen.
   */
  it("haelt die Kacheln buendig: je Spalte ein Platz in der Leiste, gleiche Breite und Hoehe", () => {
    stand.kontakte = [kontakt("k1", "neuer_lead")];
    render(<MemoryRouter><Pipeline /></MemoryRouter>);

    const spalten = [...document.querySelectorAll<HTMLElement>('[data-pruefung="pipeline-spalte"]')];
    const leiste = document.querySelector<HTMLElement>('[data-pruefung="pipeline-summen"]')!;
    const plaetze = [...leiste.children] as HTMLElement[];
    expect(spalten.length).toBeGreaterThan(8);
    expect(plaetze.map((p) => p.dataset.stufe)).toEqual(spalten.map((s) => s.dataset.stufe));
    expect(leiste.className).toContain("gap-4");
    expect(document.querySelector('[data-pruefung="pipeline-spalten"]')!.className).toContain("gap-4");
    for (const platz of plaetze) {
      expect(platz.className).toMatch(/\bw-56\b/);
      expect(platz.className).toMatch(/h-\[calc\(3\.375rem\+2px\)\]/);
      expect(platz.className).toContain("flex-shrink-0");
    }
    for (const spalte of spalten) expect(spalte.className).toMatch(/\bw-56\b/);
  });

  /*
   * Ohne Summenspalte in der Auswahl (Filter auf eine fruehe Stufe) bleibt
   * die Zeile als leerer Streifen gleicher Hoehe stehen, damit die
   * Kartenlisten beim Filterwechsel nicht springen.
   */
  it("bleibt als leerer Streifen gleicher Hoehe, wenn keine Spalte eine Summe hat", () => {
    render(
      <PipelineSummenLeiste
        spalten={[
          { key: "neuer_lead", label: "Neuer Lead", summe: null },
          { key: "erreicht", label: "Erreicht", summe: null },
        ]}
      />,
    );
    const leiste = document.querySelector<HTMLElement>('[data-pruefung="pipeline-summen"]')!;
    expect(leiste).toBeTruthy();
    expect(leiste.textContent).toBe("");
    expect(leiste.querySelectorAll('[data-pruefung="pipeline-summe"]')).toHaveLength(0);
    const plaetze = leiste.querySelectorAll<HTMLElement>('[data-pruefung="pipeline-summe-leer"]');
    expect(plaetze).toHaveLength(2);
    for (const p of plaetze) expect(p.className).toMatch(/h-\[calc\(3\.375rem\+2px\)\]/);
  });

  /*
   * Christian (25.09.2026, zweite Runde): Die Anzahl steht wieder im
   * Spaltenkopf, rechtsbuendig und als reine Zahl ohne „Leads". Punkt, Name
   * und Info-Symbol bleiben links, das Info-Symbol direkt nach dem Namen.
   */
  it("zeigt die Anzahl rechtsbuendig im Spaltenkopf, ohne „Leads\", Info-Symbol direkt nach dem Namen", () => {
    stand.kontakte = [kontakt("k1", "neuer_lead"), kontakt("k2", "neuer_lead")];
    render(<MemoryRouter><Pipeline /></MemoryRouter>);

    const koepfe = document.querySelectorAll<HTMLElement>('[data-pruefung="pipeline-kopf"]');
    expect(koepfe.length).toBe(document.querySelectorAll('[data-pruefung="pipeline-spalte"]').length);
    for (const kopf of koepfe) {
      // Kein helles Kaestchen und keine Linie darunter.
      expect(kopf.className).not.toMatch(/\bbg-/);
      expect(kopf.className).not.toMatch(/\bborder-b\b/);
      // Name, dann die Anzahl als reine Zahl, sonst nichts.
      const name = kopf.querySelector("h3")!;
      const anzahl = kopf.querySelector<HTMLElement>('[data-pruefung="pipeline-anzahl"]')!;
      expect(anzahl).toBeTruthy();
      expect(anzahl.textContent).toMatch(/^\d+$/);
      expect(kopf.textContent).toBe(`${name.textContent}${anzahl.textContent}`);
      // Kein „Leads" hinter der Zahl (der Stufenname „Neuer Lead" zaehlt nicht).
      expect(kopf.textContent).not.toMatch(/\d\s*Leads?\b/);
      // Rechtsbuendig: letztes Element im Kopf, nach rechts geschoben.
      expect(kopf.lastElementChild).toBe(anzahl);
      expect(anzahl.className).toContain("ml-auto");
      // Das Info-Symbol folgt direkt auf den Namen und steht nicht rechts aussen.
      const info = kopf.querySelector<HTMLElement>('button[aria-label^="Logik-Hinweis"]');
      if (info) {
        expect(name.nextElementSibling).toBe(info);
        expect(info.className).not.toContain("ml-auto");
      }
    }
    const kopfVon = (key: string) =>
      document.querySelector<HTMLElement>(`[data-pruefung="pipeline-spalte"][data-stufe="${key}"] [data-pruefung="pipeline-kopf"]`)!;
    expect(kopfVon("neuer_lead").querySelector('[data-pruefung="pipeline-anzahl"]')!.textContent).toBe("2");
    expect(kopfVon("reservierung").querySelector('[data-pruefung="pipeline-anzahl"]')!.textContent).toBe("0");
    expect(kopfVon("neuer_lead").querySelector('button[aria-label="Logik-Hinweis Neuer Lead"]')).toBeTruthy();
  });

  it("trennt die Stufen mit einem leichten senkrechten Strich, nicht vor der ersten", () => {
    stand.kontakte = [kontakt("k1", "neuer_lead")];
    render(<MemoryRouter><Pipeline /></MemoryRouter>);

    for (const spalte of document.querySelectorAll<HTMLElement>('[data-pruefung="pipeline-spalte"]')) {
      expect(spalte.className).toContain("before:bg-border/60");
      expect(spalte.className).toContain("before:inset-y-0");
      expect(spalte.className).toContain("first:before:hidden");
    }
  });

  it("liegt ausserhalb der scrollenden Kartenlisten, aber im selben waagerechten Scrollbereich", () => {
    stand.kontakte = [kontakt("k1", "neuer_lead")];
    render(<MemoryRouter><Pipeline /></MemoryRouter>);

    const leiste = document.querySelector<HTMLElement>('[data-pruefung="pipeline-summen"]')!;
    expect(leiste).toBeTruthy();
    // Nicht in einer Kartenliste und nicht in einer Spalte ...
    expect(leiste.closest('[data-pruefung="pipeline-karten"]')).toBeNull();
    expect(leiste.closest('[data-pruefung="pipeline-spalten"]')).toBeNull();
    for (const liste of document.querySelectorAll('[data-pruefung="pipeline-karten"]')) {
      expect(liste.className).toContain("overflow-y-auto");
      expect(liste.contains(leiste)).toBe(false);
    }
    // ... aber im selben waagerechten Scrollbereich wie die Spalten, damit jede
    // Summe beim Scrollen unter ihrer Spalte bleibt.
    const scroll = document.getElementById("pipeline-scroll")!;
    expect(scroll.contains(leiste)).toBe(true);
    expect(scroll.contains(document.querySelector('[data-pruefung="pipeline-spalten"]'))).toBe(true);
    // Die Seite rechnet ihre Hoehe nicht mehr selbst aus.
    expect(document.querySelector('[class*="100vh"]')).toBeNull();
  });

  /*
   * Christian (25.09.2026): Unter der Summenleiste standen zwei waagerechte
   * Regler uebereinander, oben die Scrollleiste des Boards, darunter ein
   * eigener Schieberegler (`input type="range"`), der dasselbe tat. Es bleibt
   * allein die Scrollleiste; ihr Aussehen steht fuer das ganze CRM in
   * `index.css` (siehe `src/styles/scrollleiste.test.ts`).
   */
  it("hat nur einen waagerechten Regler, die Scrollleiste des Boards", () => {
    stand.kontakte = [kontakt("k1", "neuer_lead")];
    render(<MemoryRouter><Pipeline /></MemoryRouter>);

    expect(document.querySelectorAll('input[type="range"], [role="slider"]')).toHaveLength(0);
    const waagerecht = document.querySelectorAll<HTMLElement>('[class*="overflow-x-auto"], [class*="overflow-x-scroll"]');
    expect(waagerecht).toHaveLength(1);
    expect(waagerecht[0].id).toBe("pipeline-scroll");
    // Am linken Rand darf ein Wischen auf dem Trackpad nicht „Zurueck" ausloesen.
    expect(waagerecht[0].className).toContain("overscroll-x-contain");
  });
});

describe("PipelineSummenLeiste", () => {
  it("zeigt „Gesamt: … €\" deutsch formatiert, ohne Summe keine Kachel", () => {
    render(
      <PipelineSummenLeiste
        spalten={[
          { key: "erstgespraech", label: "Erstgespräch", summe: null },
          { key: "reservierung", label: "Reservierung", summe: 1008900 },
          { key: "notar", label: "Notar", summe: 250000 },
        ]}
      />,
    );
    const reservierung = screen.getByLabelText(/Reservierung: Gesamt 1\.008\.900\s€/);
    expect(reservierung.textContent).toMatch(/^Gesamt: 1\.008\.900\s€$/);
    expect(reservierung.className).toContain("w-56");
    expect(reservierung.getAttribute("data-ui")).toBe("card");
    expect(screen.getByLabelText(/Notar: Gesamt 250\.000\s€/).textContent).toMatch(/^Gesamt: 250\.000\s€$/);
    // Ohne Summe: keine Kachel, kein Text, weder Anzahl noch Hinweis.
    expect(screen.queryByLabelText(/Erstgespräch/)).toBeNull();
    expect(screen.queryByText(/Leads?\b/)).toBeNull();
    expect(screen.queryByText("Summe ab Objektauswahl")).toBeNull();
    expect(document.querySelectorAll('[data-pruefung="pipeline-summe"]')).toHaveLength(2);
  });
});

/*
 * Christian (25.09.2026): Die Pipeline endet unten auf derselben Hoehe wie die
 * Seitenleiste. jsdom rechnet kein Layout, deshalb wird hier die Regel
 * geprueft; nachgemessen ist sie im Browser. Beide Stellen lesen denselben
 * Wert, damit sie nicht auseinanderlaufen koennen.
 */
describe("Unterkante der Kunden-Pipeline", () => {
  const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

  it("uebernimmt unten den Abstand der Seitenleiste", () => {
    const index = lies("src/index.css");
    expect(index).toMatch(
      /\[data-lg="spalte"\] > main:has\(#pipeline-scroll\) \{\s*padding-bottom: var\(--seitenleiste-abstand-unten, 0px\);/,
    );
    const liquid = lies("src/styles/design-liquid.css");
    expect(liquid).toMatch(/\[data-glas="liquid"\] \{ --seitenleiste-abstand-unten: 10px; \}/);
    expect(liquid).toMatch(
      /\[data-variant="sidebar"\] > \.fixed \{\s*padding: 10px 0 var\(--seitenleiste-abstand-unten\) 10px;/,
    );
  });

  it("hat unter der Summenleiste keinen eigenen Innenabstand vor der Scrollleiste", () => {
    stand.kontakte = [kontakt("k1", "neuer_lead")];
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    const leiste = document.querySelector<HTMLElement>('[data-pruefung="pipeline-summen"]')!;
    expect(leiste.className).not.toMatch(/\bpb-/);
  });

  /*
   * Christian (25.09.2026): Er testet nur in der Lovable-Vorschau. Dort stand
   * unter dem Scrollbereich ein 56px hoher Platzhalter fuer den schwebenden
   * Bearbeitungsbalken von Lovable, gemessen lag die Scrollleiste dadurch
   * rund 50px ueber der Seitenleiste. In der Vorschau gilt jetzt derselbe
   * Abstand wie auf osimmobilien.netlify.app.
   */
  it("hat in der Lovable-Vorschau keinen Sonderabstand unter der Scrollleiste", () => {
    stand.kontakte = [kontakt("k1", "neuer_lead")];
    render(<MemoryRouter><Pipeline /></MemoryRouter>);
    const scroll = document.getElementById("pipeline-scroll")!;
    // Der Scrollbereich ist das letzte Element der Seite, nichts steht darunter.
    expect(scroll.nextElementSibling).toBeNull();
    expect(scroll.className).not.toMatch(/\b(pb|mb|my|py)-/);
    // Die Seite fragt die Vorschau-Erkennung gar nicht erst ab.
    expect(lies("src/pages/Pipeline.tsx")).not.toMatch(/isPreviewEnv|previewFlag/);
  });
});
