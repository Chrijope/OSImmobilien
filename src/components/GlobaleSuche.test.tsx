/**
 * Die globale Suche in der Kopfleiste.
 *
 * Erster Anlass war Christians Meldung vom 17.09.2026: Die Liste nahm auf dem
 * Handy nur etwa ein Drittel der Bildschirmbreite ein, weil sie ihre Breite
 * vom Suchfeld erbte. Geprueft werden dafuer Klassennamen und keine
 * gemessenen Pixel, weil jsdom kein Layout rechnet.
 *
 * Seit dem 28.09.2026 findet die Suche auch Seiten und Reiter, gefiltert nach
 * der aktiven Rolle. Die Rollenregeln selbst prueft `sucheZiele.test.ts`
 * gegen die Seitenleiste; hier geht es um das, was man am Bildschirm tut:
 * tippen, Pfeiltasten, Enter, Strg+K, und dass Kontakte und Objekte wie
 * bisher gefunden werden.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

// Ohne Datenbank gilt die Rueckfallliste der Rollenfreigaben.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

let rolle = "admin";
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: rolle }, authUser: { id: "u-test", email: "test@example.org" } }),
}));
vi.mock("@/hooks/useVideocallFreigabe", () => ({ useVideocallFreigabe: () => ({ darf: false, laedt: false }) }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: (_k: string, fallback: unknown) => fallback }));
vi.mock("@/lib/handbuch/zugang", async (original) => ({
  ...(await original<typeof import("@/lib/handbuch/zugang")>()),
  handbuchPartnerFreigeschaltet: () => true,
}));

// Erfundene Kontakte und Objekte, keine echten Personen.
vi.mock("@/lib/kundenStore", () => ({
  getKontakte: () => [
    { id: "k1", vorname: "Otto", nachname: "Beispiel", email: "otto@example.org", telefon: "", ort: "Musterstadt", pipelineStufe: "" },
    { id: "k2", vorname: "Erika", nachname: "Muster", email: "erika@example.org", telefon: "", ort: "", pipelineStufe: "" },
  ],
}));
vi.mock("@/lib/objekteStore", () => ({
  getObjekte: () => [{ id: "o1", titel: "Wohnpark Test", adresse: "Teststrasse 1", plz: "12345", ort: "Musterstadt" }],
}));
vi.mock("@/lib/objektseiteDaten", () => ({ zielRouteFuerObjekt: (o: { id: string }) => `/objekte/${o.id}` }));

// Simuliert die Freischaltung des Eintrags „Objekte" für einzelne Rollen
// (wie `auchFuer` am Eintrag). Leer heißt: Stand heute, nur Admin und Inhaber.
const objekteFrei = vi.hoisted(() => ({ auchFuer: [] as string[] }));
vi.mock("@/lib/sidebarPermissions", async (original) => {
  const echt = await original<typeof import("@/lib/sidebarPermissions")>();
  return {
    ...echt,
    greiftAdminRiegel: (e: { url?: string; adminOnly?: boolean; auchFuer?: string[] }, r: string) =>
      e.url === "/objekte" && objekteFrei.auchFuer.includes(r) ? false : echt.greiftAdminRiegel(e, r),
  };
});

const { SuchFeld } = await import("./GlobaleSuche");

// In dieser Testumgebung gibt es keinen `localStorage`. Die Komponente kommt
// damit zurecht, sie faengt den Zugriff ab, aber dann liesse sich die Gruppe
// "Zuletzt geöffnet" nicht fuellen. Deshalb ein Ablagefach im Arbeitsspeicher.
const ablage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => ablage.get(k) ?? null,
  setItem: (k: string, v: string) => void ablage.set(k, v),
  removeItem: (k: string) => void ablage.delete(k),
  clear: () => ablage.clear(),
});

function Ort() {
  const l = useLocation();
  return <output data-testid="ort">{l.pathname + l.search}</output>;
}

function zeige(start = "/inbox") {
  render(
    <MemoryRouter initialEntries={[start]}>
      <SuchFeld />
      <Ort />
    </MemoryRouter>,
  );
  return screen.getByLabelText("Globale Suche") as HTMLInputElement;
}

function tippe(eingabe: string) {
  const feld = zeige();
  fireEvent.focus(feld);
  fireEvent.change(feld, { target: { value: eingabe } });
  return feld;
}

/** Die Ueberschriften der Gruppen, in ihrer Reihenfolge. */
const gruppen = () =>
  within(screen.getByRole("listbox"))
    .queryAllByText(/^(Seiten|Kontakte|Objekte|Aktionen|Zuletzt geöffnet|Schnellzugriff)$/)
    .map((e) => e.textContent);

const optionen = () => screen.getAllByRole("option").map((o) => o.textContent || "");

describe("Globale Suche", () => {
  beforeEach(() => {
    localStorage.clear();
    rolle = "admin";
    objekteFrei.auchFuer = [];
  });

  describe("Seiten", () => {
    it("findet über „Handbuch“ die Handbuch-Seite", () => {
      tippe("Handbuch");
      expect(gruppen()[0]).toBe("Seiten");
      expect(optionen().some((t) => t.startsWith("Handbuch-Seite"))).toBe(true);
      expect(optionen().some((t) => t.startsWith("Vertriebshandbuch"))).toBe(true);
    });

    it("findet über „statistik“ die Statistiken samt Reitern mit Pfad", () => {
      tippe("statistik");
      const liste = optionen();
      expect(liste[0]).toContain("Statistiken");
      expect(liste.some((t) => t.includes("Statistiken > Übersicht"))).toBe(true);
    });

    it("findet „ubersicht“ ohne Umlaut", () => {
      rolle = "vertriebspartner";
      tippe("ubersicht");
      expect(optionen().some((t) => t.includes("Statistiken > Übersicht"))).toBe(true);
    });

    it("zeigt dem Vertriebspartner keine Admin-Seiten", () => {
      rolle = "vertriebspartner";
      tippe("audit");
      expect(screen.queryAllByRole("option").some((o) => o.textContent?.includes("Audit-Log"))).toBe(false);
      rolle = "admin";
    });

    it("zeigt dem Tippgeber nur sein Portal", () => {
      rolle = "tippgeber";
      tippe("konditionen");
      expect(optionen()[0]).toContain("Konditionen");
      // Kontakte und Objekte gibt es fuer ihn nicht.
      fireEvent.change(screen.getByLabelText("Globale Suche"), { target: { value: "otto" } });
      expect(screen.queryByText("Kontakte")).toBeNull();
    });
  });

  describe("Tastatur", () => {
    it("Pfeil runter und Enter oeffnen den zweiten Treffer", () => {
      const feld = tippe("statistik");
      const zweiter = screen.getAllByRole("option")[1];
      fireEvent.keyDown(feld, { key: "ArrowDown" });
      expect(zweiter.getAttribute("aria-selected")).toBe("true");
      expect(feld.getAttribute("aria-activedescendant")).toBe(zweiter.id);
      fireEvent.keyDown(feld, { key: "Enter" });
      expect(screen.getByTestId("ort").textContent).toMatch(/^\/statistiken\?tab=/);
      // Nach dem Sprung ist die Liste zu und das Feld leer.
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(feld.value).toBe("");
    });

    it("Enter ohne Pfeil oeffnet den besten Treffer", () => {
      const feld = tippe("Statistik");
      fireEvent.keyDown(feld, { key: "Enter" });
      expect(screen.getByTestId("ort").textContent).toBe("/statistiken");
    });

    it("Pfeil hoch springt vom ersten zum letzten Treffer", () => {
      const feld = tippe("statistik");
      fireEvent.keyDown(feld, { key: "ArrowUp" });
      const alle = screen.getAllByRole("option");
      expect(alle[alle.length - 1].getAttribute("aria-selected")).toBe("true");
    });

    it("Strg+K setzt den Fokus ins Feld und oeffnet die Vorschlaege, Escape schliesst", () => {
      const feld = zeige();
      fireEvent.keyDown(document, { key: "k", ctrlKey: true });
      expect(document.activeElement).toBe(feld);
      expect(screen.getByRole("listbox")).toBeTruthy();
      fireEvent.keyDown(feld, { key: "Escape" });
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  describe("Vorschlaege ohne Eingabe", () => {
    it("zeigt ohne Verlauf die ersten Seiten der eigenen Leiste", () => {
      rolle = "vertriebspartner";
      const feld = zeige("/nirgends");
      fireEvent.focus(feld);
      expect(gruppen()).toContain("Seiten");
      expect(optionen()[0]).toContain("Dashboard");
    });

    it("merkt sich besuchte Seiten je Nutzer", () => {
      const feld = zeige("/abrechnungen");
      fireEvent.focus(feld);
      expect(gruppen()[0]).toBe("Zuletzt geöffnet");
      expect(optionen()[0]).toContain("Abrechnungen");
      expect(ablage.has("mi_suche_zuletzt:u-test")).toBe(true);
    });

    it("laesst Seiten aus dem Verlauf weg, die die aktive Rolle nicht mehr darf", () => {
      localStorage.setItem(
        "mi_suche_zuletzt:u-test",
        JSON.stringify([{ id: "seite-/audit-log", titel: "Sicherheit & Audit > Audit-Log", url: "/audit-log" }]),
      );
      rolle = "vertriebspartner";
      const feld = zeige("/nirgends");
      fireEvent.focus(feld);
      expect(screen.queryByText(/Audit-Log/)).toBeNull();
    });
  });

  describe("Kontakte und Objekte wie bisher", () => {
    it("findet einen Kontakt ueber den Namen und oeffnet sein Profil", () => {
      const feld = tippe("otto");
      expect(gruppen()[0]).toBe("Kontakte");
      expect(optionen()[0]).toContain("Otto Beispiel");
      fireEvent.keyDown(feld, { key: "Enter" });
      expect(screen.getByTestId("ort").textContent).toBe("/kunden/k1");
    });

    it("findet einen Kontakt unscharf und ueber die E-Mail", () => {
      tippe("ott bsp");
      expect(optionen()[0]).toContain("Otto Beispiel");
      fireEvent.change(screen.getByLabelText("Globale Suche"), { target: { value: "erika@" } });
      expect(optionen()[0]).toContain("Erika Muster");
    });

    it("findet ein Objekt ueber die Adresse", () => {
      tippe("Teststrasse");
      expect(gruppen()).toContain("Objekte");
      expect(optionen().some((t) => t.includes("Wohnpark Test"))).toBe(true);
    });

    it("zeigt einem Vertriebspartner keine Objekte, solange „Objekte“ für ihn zu ist", () => {
      rolle = "vertriebspartner";
      tippe("Teststrasse");
      expect(screen.queryByText("Wohnpark Test")).toBeNull();
      expect(screen.queryByText("Objekte")).toBeNull();
    });

    it("findet Objekte für eine Rolle, für die „Objekte“ freigeschaltet ist", () => {
      rolle = "vertriebsleiter";
      objekteFrei.auchFuer = ["vertriebsleiter"];
      tippe("Teststrasse");
      expect(optionen().some((t) => t.includes("Wohnpark Test"))).toBe(true);
    });

    it("laesst ein Objekt aus dem Verlauf weg, wenn „Objekte“ für die Rolle zu ist", () => {
      localStorage.setItem(
        "mi_suche_zuletzt:u-test",
        JSON.stringify([{ id: "objekt-o1", titel: "Wohnpark Test", url: "/objekte/o1" }]),
      );
      rolle = "vertriebspartner";
      const feld = zeige("/nirgends");
      fireEvent.focus(feld);
      expect(screen.queryByText("Wohnpark Test")).toBeNull();
    });

    it("sucht Kontakte erst ab zwei Zeichen", () => {
      tippe("o");
      expect(screen.queryByText("Kontakte")).toBeNull();
    });
  });

  describe("auf dem Handy", () => {
    it("fuellt den Schirm unter der Kopfleiste statt an der Feldbreite zu haengen", () => {
      const feld = zeige();
      fireEvent.focus(feld);
      const klassen = screen.getByRole("listbox").className;

      // Unterhalb von `sm` loest sich die Liste aus der Kopfleiste und
      // fuellt die volle Breite und die Hoehe unter der Leiste.
      expect(klassen).toContain("fixed");
      expect(klassen).toContain("inset-x-0");
      expect(klassen).toContain("top-20");
      expect(klassen).toContain("h-[calc(100dvh-5rem)]");
      // Kein `bottom-0`: Die Leiste ist der Bezugsrahmen fuer `fixed`.
      expect(klassen.split(/\s+/)).not.toContain("bottom-0");

      // Auf dem Schreibtisch bleibt alles, wie es war.
      expect(klassen).toContain("sm:absolute");
      expect(klassen).toContain("sm:w-full");
      expect(klassen).toContain("sm:max-w-[28rem]");

      // Der Rueckfall waere ein `w-full` ohne Haltepunkt: genau das gab dem
      // Handy die 120 Pixel des Suchfeldes.
      expect(klassen.split(/\s+/)).not.toContain("w-full");
    });

    it("hat einen Knopf zum Schliessen", () => {
      const feld = zeige();
      fireEvent.focus(feld);
      fireEvent.mouseDown(screen.getByRole("button", { name: /Schließen/ }));
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("laesst dem Namen Vorrang vor dem Hinweis und ist gross genug zum Antippen", () => {
      const feld = zeige();
      fireEvent.focus(feld);
      const eintrag = screen.getByText("Neuen Kontakt anlegen").closest("button");
      expect(eintrag).toBeTruthy();
      // 10 Pixel oben und unten plus Zeilenhoehe ergeben die geforderten 40
      // Pixel Antippflaeche, auf dem Schreibtisch bleibt es bei 8.
      expect(eintrag!.className).toContain("py-2.5");
      expect(eintrag!.className).toContain("sm:py-2");
    });

    it("kuerzt den Hinweis statt des Namens", () => {
      localStorage.setItem(
        "mi_suche_zuletzt:u-test",
        JSON.stringify([{ id: "kontakt-k1", titel: "Otto Beispiel", hinweis: "Finanzierung · Musterstadt", url: "/kunden/k1" }]),
      );
      const feld = zeige("/nirgends");
      fireEvent.focus(feld);

      const hinweis = screen.getByText("Finanzierung · Musterstadt");
      expect(hinweis.className).toContain("shrink");
      expect(hinweis.className).toContain("sm:shrink-0");
      // `shrink-0` ohne Haltepunkt war die Ursache der abgeschnittenen Namen.
      expect(hinweis.className.split(/\s+/)).not.toContain("shrink-0");

      expect(screen.getByText("Otto Beispiel").className).toContain("min-w-0");
    });
  });
});
