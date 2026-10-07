/**
 * Das Portal startet in der Profilsprache, der Umschalter ändert sie nicht.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 1 und Entscheidung 3:
 *   - Bei der Anmeldung gilt `kontakte.meta.kundenSprache`, nicht die Sprache,
 *     die dieser Browser zuletzt gezeigt hat.
 *   - Der Umschalter oben ist eine reine Anzeigehilfe. Er schreibt nichts an
 *     den Kontakt; Mails und Dokumente folgen weiter dem Profil. Im Menü steht,
 *     welche Sprache das Profil hat.
 *
 * Supabase ist eine Attrappe, die jede Abfrage aufzeichnet. So lässt sich
 * prüfen, dass nach dem Umschalten nichts geschrieben wurde.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In dieser Testumgebung gibt es keinen localStorage. Eine kleine Attrappe,
// früh genug angelegt, damit auch i18next ihn beim Start findet.
vi.hoisted(() => {
  const speicher = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => speicher.get(k) ?? null,
      setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
      removeItem: (k: string) => { speicher.delete(k); },
      clear: () => speicher.clear(),
      key: (i: number) => [...speicher.keys()][i] ?? null,
      get length() { return speicher.size; },
    },
  });
});
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import { PROFILSPRACHE_ANMELDUNG_SCHLUESSEL } from "@/i18n/portalSprache";

const NUTZER_ID = "00000000-0000-4000-8000-0000000000aa";

const db = vi.hoisted(() => ({
  profil: { kundenSprache: "en", kundenSpracheGesetztAm: "2026-09-25T10:00:00Z" } as Record<string, unknown>,
  anmeldung: "2026-09-25T09:00:00Z",
  schreibzugriffe: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => {
  // Eine Kette, die jede Methode annimmt und am Ende die passenden Zeilen liefert.
  const kette = (tabelle: string) => {
    const ergebnis = () => {
      if (tabelle === "kontakte") {
        return { data: [{ vorname: "Erika", nachname: "Beispiel", zustaendig_id: null, berater: null, meta: { ...db.profil, authUserId: NUTZER_ID } }], error: null };
      }
      if (tabelle === "user_roles") return { data: [{ role: "kunde" }], error: null };
      return { data: [], error: null };
    };
    const k: Record<string, unknown> = {};
    for (const m of ["select", "or", "eq", "order", "limit", "in", "maybeSingle", "single"]) k[m] = () => k;
    for (const m of ["update", "insert", "upsert", "delete"]) {
      k[m] = () => {
        db.schreibzugriffe.push(`${m}:${tabelle}`);
        return k;
      };
    }
    k.then = (ok: (w: unknown) => unknown) => Promise.resolve(ergebnis()).then(ok);
    return k;
  };
  return {
    supabase: {
      from: (tabelle: string) => kette(tabelle),
      rpc: (name: string) => {
        if (name !== "get_kunde_vp_profile") db.schreibzugriffe.push(`rpc:${name}`);
        return Promise.resolve({ data: [], error: null });
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => undefined,
    },
  };
});

// Wie im echten UserContext bleibt das Nutzerobjekt über Renderläufe gleich.
// Ein neues Objekt je Aufruf würde die Effekte des Layouts endlos neu starten.
const sitzung = vi.hoisted(() => ({
  wert: null as null | { authUser: { id: string; last_sign_in_at: string }; user: { role: string; name: string }; logout: () => void; setRole: () => void },
}));
function neueSitzung(anmeldung: string) {
  sitzung.wert = {
    authUser: { id: NUTZER_ID, last_sign_in_at: anmeldung },
    user: { role: "kunde", name: "Erika Beispiel" },
    logout: () => undefined,
    setRole: () => undefined,
  };
}
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => sitzung.wert,
}));
vi.mock("./useUngeleseneChats", () => ({ useUngeleseneChats: () => 0 }));
vi.mock("./PortalVpContact", () => ({ PortalVpContact: () => null }));
vi.mock("./HellDunkelSchalter", () => ({ HellDunkelSchalter: () => null }));
vi.mock("@/components/kunde/VpBewertungPrompt", () => ({ VpBewertungPrompt: () => null }));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: () => null,
}));
// In jsdom hängen geöffnete Radix-Menüs; die Einträge stehen deshalb offen da.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" role="menuitem" onClick={onClick}>
      {children}
    </button>
  ),
}));

const { KundePortalLayout } = await import("./KundePortalLayout");

function zeigePortal() {
  return render(
    <MemoryRouter initialEntries={["/kunde/stammdaten"]}>
      <KundePortalLayout>
        <p>Inhalt</p>
      </KundePortalLayout>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  db.schreibzugriffe = [];
  db.profil = { kundenSprache: "en", kundenSpracheGesetztAm: "2026-09-25T10:00:00Z" };
  db.anmeldung = "2026-09-25T09:00:00Z";
  neueSitzung(db.anmeldung);
  window.localStorage.removeItem(PROFILSPRACHE_ANMELDUNG_SCHLUESSEL);
  await i18n.changeLanguage("de");
});
afterEach(async () => {
  window.localStorage.removeItem(PROFILSPRACHE_ANMELDUNG_SCHLUESSEL);
  await i18n.changeLanguage("de");
});

describe("Kundenportal: Sprache aus dem Profil", () => {
  it("startet nach der Anmeldung in der Profilsprache Englisch, obwohl der Browser Deutsch zeigte", async () => {
    zeigePortal();
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));
    expect(document.documentElement.lang).toBe("en");
    expect(await screen.findByTestId("sprachwechsel-hinweis")).toHaveTextContent(
      "Emails and documents: English. To change this, ask your contact at MOREImmo.",
    );
  });

  it("ein deutsches Profil stellt ein zuletzt englisches Portal zurück auf Deutsch", async () => {
    db.profil = {};
    await i18n.changeLanguage("en");
    zeigePortal();
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("de"));
    expect(await screen.findByTestId("sprachwechsel-hinweis")).toHaveTextContent(
      "E-Mails und Dokumente: Deutsch. Ändern über deinen Ansprechpartner.",
    );
  });

  it("der Umschalter ändert nur die Anzeige, nicht die Profilsprache", async () => {
    zeigePortal();
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Deutsch/ }));
    });

    expect(i18n.resolvedLanguage).toBe("de");
    // Der Hinweis nennt weiter die Profilsprache, jetzt auf Deutsch.
    expect(screen.getByTestId("sprachwechsel-hinweis")).toHaveTextContent("E-Mails und Dokumente: English.");
    // Nichts wurde geschrieben: kein update am Kontakt, kein merge_kontakt_meta.
    expect(db.schreibzugriffe).toEqual([]);
  });

  it("nach dem Neuladen bleibt die Wahl, bei der nächsten Anmeldung gilt wieder das Profil", async () => {
    const erste = zeigePortal();
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Deutsch/ }));
    });
    erste.unmount();

    // Neuladen, dieselbe Anmeldung
    const zweite = zeigePortal();
    await screen.findByTestId("sprachwechsel-hinweis");
    expect(i18n.resolvedLanguage).toBe("de");
    zweite.unmount();

    // Neue Anmeldung
    db.anmeldung = "2026-09-26T08:00:00Z";
    neueSitzung(db.anmeldung);
    zeigePortal();
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));
  });
});
