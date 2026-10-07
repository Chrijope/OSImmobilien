/**
 * Chat im Kundenportal: Aufbau und Scrollen.
 *
 * Christian am 25.09.2026: Die Nachrichtenliste wuchs mit der ganzen Seite,
 * die Eingabezeile kam erst nach allen Nachrichten. Gewollt ist es wie im
 * Chat des CRM: Nur der Verlauf scrollt, in seiner Karte, und die
 * Eingabezeile steht fest darunter.
 *
 * Die Hoehe selbst rechnet der Browser (jsdom kennt kein Layout). Geprueft
 * wird deshalb die Kette, die sie traegt, und das Verhalten beim Scrollen.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import KundeChat from "./KundeChat";

const lies = (pfad: string) => readFileSync(resolve(__dirname, "..", "..", pfad), "utf8");

const { tabellen, echtzeit } = vi.hoisted(() => ({
  tabellen: {} as Record<string, unknown[]>,
  echtzeit: {} as Record<string, (payload: unknown) => void>,
}));

// Wie der PostgREST-Builder: jede Methode verkettet, am Ende ein Thenable.
function abfrage(tabelle: string) {
  const ergebnis = Promise.resolve({ data: tabellen[tabelle] ?? [], error: null });
  const builder: Record<string | symbol, unknown> = new Proxy({}, {
    get: (_ziel, name) => (name === "then" ? ergebnis.then.bind(ergebnis) : () => builder),
  });
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabelle: string) => abfrage(tabelle),
    rpc: (name: string) =>
      Promise.resolve({ data: name === "get_kunde_vp_profile" ? [{ id: "berater-1", name: "Bea Beispiel" }] : null, error: null }),
    channel: (kanal: string) => {
      const leitung = {
        on: (_art: string, filter: { event: string }, fn: (payload: unknown) => void) => {
          echtzeit[`${kanal}:${filter.event}`] = fn;
          return leitung;
        },
        subscribe: () => leitung,
      };
      return leitung;
    },
    removeChannel: () => {},
  },
}));

// Feste Objekte: `loadData` haengt an authUser, ein neues Objekt je Aufbau
// wuerde endlos neu laden.
const nutzer = { user: { name: "Kim Kunde", role: "kunde" }, authUser: { id: "kunde-1" } };
vi.mock("@/contexts/UserContext", () => ({ useUser: () => nutzer }));
vi.mock("@/lib/chatStore", () => ({ getInitials: () => "KK" }));
vi.mock("@/lib/pushNotifications", () => ({ showPushNotification: vi.fn() }));
vi.mock("@/lib/storage", () => ({ openUnterlage: vi.fn() }));

const nachricht = (i: number, absender = "berater-1") => ({
  id: `n${i}`,
  chat_id: "chat-1",
  absender_id: absender,
  inhalt: `Nachricht ${i}`,
  gesendet_am: new Date(2026, 8, 25, 10, i).toISOString(),
  gelesen_von: [absender, "kunde-1"],
  meta: {},
});

beforeEach(() => {
  for (const k of Object.keys(echtzeit)) delete echtzeit[k];
  tabellen.kontakte = [{ id: "k1", vorname: "Kim", nachname: "Kunde", zustaendig_id: "berater-1" }];
  tabellen.chat_teilnehmer = [{ chat_id: "chat-1" }];
  tabellen.chat_gruppen = [{ id: "chat-1" }];
  tabellen.profiles_public = [];
  tabellen.chat_nachrichten = Array.from({ length: 30 }, (_, i) => nachricht(i + 1));
});

/** Gibt dem Verlauf eine Hoehe, die jsdom selbst nicht rechnet. */
function scrollbarMachen(verlauf: HTMLElement) {
  let oben = 0;
  Object.defineProperty(verlauf, "scrollHeight", { configurable: true, get: () => 2000 });
  Object.defineProperty(verlauf, "clientHeight", { configurable: true, get: () => 400 });
  Object.defineProperty(verlauf, "scrollTop", { configurable: true, get: () => oben, set: (wert: number) => { oben = wert; } });
  return verlauf;
}

async function geoeffneterChat() {
  render(<KundeChat />);
  await screen.findByText("Nachricht 30");
  return screen.getByRole("log");
}

describe("Kundenportal-Chat: Aufbau", () => {
  it("der Verlauf hat einen eigenen Scrollbereich, die Eingabe liegt ausserhalb davon", async () => {
    const verlauf = await geoeffneterChat();
    expect(verlauf).toHaveClass("overflow-y-auto", "flex-1", "min-h-0");
    expect(verlauf).toHaveTextContent("Nachricht 1");

    const eingabe = screen.getByRole("textbox");
    expect(verlauf).not.toContainElement(eingabe);

    // Karte und Verlauf teilen sich die Hoehe: die Karte ist eine Spalte,
    // die Eingabezeile schrumpft nicht und steht nach dem Verlauf.
    const karte = verlauf.parentElement!;
    expect(karte).toHaveClass("flex", "flex-col", "flex-1", "min-h-0", "overflow-hidden");
    const zeile = eingabe.closest("form")!;
    expect(zeile.parentElement).toBe(karte);
    expect(zeile).toHaveClass("shrink-0");
    expect(verlauf.compareDocumentPosition(zeile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Die Kette zur Portalhuelle: auch die Seite selbst ist eine Spalte, die
    // schrumpfen darf. Ohne `min-h-0` waechst sie wieder mit dem Verlauf.
    expect(karte.parentElement).toHaveClass("flex", "flex-col", "flex-1", "min-h-0");
  });
});

describe("Kundenportal-Chat: Scrollen", () => {
  it("wer oben alte Nachrichten liest, wird von einer neuen nicht weggerissen", async () => {
    const verlauf = scrollbarMachen(await geoeffneterChat());

    // Kunde scrollt nach oben.
    verlauf.scrollTop = 100;
    act(() => { verlauf.dispatchEvent(new Event("scroll")); });

    act(() => { echtzeit["kunde-chat-chat-1:INSERT"]({ new: nachricht(31) }); });
    await screen.findByText("Nachricht 31");
    await act(async () => { await new Promise((fertig) => requestAnimationFrame(() => fertig(null))); });
    expect(verlauf.scrollTop).toBe(100);
  });

  it("wer unten steht, springt bei einer neuen Nachricht mit", async () => {
    const verlauf = scrollbarMachen(await geoeffneterChat());

    verlauf.scrollTop = 1600; // 2000 - 400: ganz unten
    act(() => { verlauf.dispatchEvent(new Event("scroll")); });

    act(() => { echtzeit["kunde-chat-chat-1:INSERT"]({ new: nachricht(31) }); });
    await screen.findByText("Nachricht 31");
    await waitFor(() => expect(verlauf.scrollTop).toBe(2000));
  });
});

describe("Kundenportal-Chat: die Huelle endet am Bildschirmrand", () => {
  it("das Portal setzt auf der Chatroute den Vollbild-Haken", () => {
    const layout = lies("src/components/kunde/portal/KundePortalLayout.tsx");
    expect(layout).toMatch(/const chatVollbild = location\.pathname\.startsWith\("\/kunde\/chat"\)/);
    expect(layout).toMatch(/data-vollbild=\{chatVollbild \? "chat" : undefined\}/);
  });

  it("die Huelle ist so hoch wie der Bildschirm, scrollt nicht, und das Menue liegt im Fluss", () => {
    const css = lies("src/styles/kundenportal.css");
    const regel = (selektor: string) => {
      const start = css.indexOf(`${selektor} {`);
      expect(start, selektor).toBeGreaterThan(-1);
      return css.slice(start, css.indexOf("}", start));
    };
    const huelle = regel('.portal-ui[data-portal="kunde"][data-vollbild="chat"]');
    expect(huelle).toContain("height: 100dvh");
    expect(huelle).toContain("overflow: hidden");
    expect(regel('.portal-ui[data-portal="kunde"][data-vollbild="chat"] .portal-main')).toContain("min-height: 0");
    expect(regel('.portal-ui[data-portal="kunde"][data-vollbild="chat"] .portal-content')).toContain("min-height: 0");
    expect(regel('.portal-ui[data-portal="kunde"][data-vollbild="chat"] .portal-mobile-nav')).toContain("position: static");
  });
});

describe("Kundenportal-Chat: Gestaltung im Projektstil (CI-Prüfung 25.09.2026)", () => {
  it("genau ein oranger Knopf, und das ist Senden", async () => {
    await geoeffneterChat();
    const orange = document.querySelectorAll(".btn-brand");
    expect(orange).toHaveLength(1);
    expect(orange[0]).toHaveAttribute("type", "submit");
    expect(orange[0].closest("form")).toContainElement(screen.getByRole("textbox"));
  });

  it("eine Dateinachricht zeigt die Büroklammer als Symbol, nicht als Emoji", async () => {
    tabellen.chat_nachrichten = [{ ...nachricht(1), inhalt: "📎 vertrag.pdf" }];
    render(<KundeChat />);
    const text = await screen.findByText("vertrag.pdf");
    expect(text.textContent).not.toContain("📎");
    expect(text.querySelector("svg")).not.toBeNull();
  });

  it("keine Mini-Schrift unter 11 px und nichts Kursives im Verlauf", async () => {
    tabellen.chat_nachrichten = [
      nachricht(1),
      { ...nachricht(2), inhalt: "Dein Berater ist dem Chat beigetreten", meta: { isSystem: true } },
    ];
    render(<KundeChat />);
    await screen.findByText("Dein Berater ist dem Chat beigetreten");
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/text-\[(9|10)px\]/);
    expect(html).not.toMatch(/\bitalic\b/);
  });

  it("die Kopfkarte hat eine Kartenfläche", async () => {
    await geoeffneterChat();
    const kopf = screen.getByRole("heading", { level: 1 }).closest(".rounded-2xl")!;
    expect(kopf).toHaveClass("bg-card");
  });
});
