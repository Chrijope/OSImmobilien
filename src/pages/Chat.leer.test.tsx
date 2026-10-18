/**
 * Chatseite ohne Chats.
 *
 * Christian am 18.10.2026: Gibt es noch keinen Chat, stand rechts "Wähle
 * einen Chat aus". Es gibt aber nichts zu wählen. Stattdessen soll dort
 * stehen, wo Chats eröffnet werden: im Kundenprofil unter "Kommunikation".
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Chat from "./Chat";

const { stand } = vi.hoisted(() => ({ stand: { chats: [] as unknown[], spaet: false, aufrufe: 0, rolle: "vertriebspartner" } }));

vi.mock("@/components/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/chat/ChatVerlauf", () => ({ ChatVerlauf: () => <div>Verlauf</div> }));
vi.mock("@/components/kunden/profil/useChatSichthoehe", () => ({ useChatSichthoehe: () => ({ current: null }) }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/lib/dataCache", () => ({ cacheGet: () => [], cacheInsert: vi.fn() }));
vi.mock("@/lib/chatEinladung", () => ({ einladbareTeilnehmer: () => [], ladeTeilnehmerEin: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Vera Partner", role: stand.rolle }, authUser: { id: "vp-1" } }),
}));
vi.mock("@/lib/chatStore", async (original) => ({
  ...(await original<typeof import("@/lib/chatStore")>()),
  // `spaet`: Der erste Aufruf (Startzustand) liefert noch nichts, wie vor der Ladewelle.
  getChats: () => (stand.spaet && stand.aufrufe++ === 0 ? [] : stand.chats),
}));

const chat = {
  id: "chat-1",
  kundeName: "Max Muster",
  kundeId: "k-1",
  typ: "kundenkommunikation",
  teilnehmer: [{ id: "vp-1", name: "Vera Partner", initials: "VP", role: "vertriebspartner" }],
  nachrichten: [{ id: "n1", senderId: "k-1", senderName: "Max Muster", text: "Hallo", timestamp: "2026-10-18T10:00:00Z" }],
  erstelltAm: "2026-10-18T09:00:00Z",
};

const zeige = () =>
  render(
    <MemoryRouter initialEntries={["/chat"]}>
      <TooltipProvider><Chat /></TooltipProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  stand.chats = [];
  stand.spaet = false;
  stand.aufrufe = 0;
  stand.rolle = "vertriebspartner";
});

it("zeigt ohne Chats den Hinweis auf das Kundenprofil statt der Auswahlaufforderung", () => {
  zeige();
  expect(screen.queryByText("Wähle einen Chat aus")).toBeNull();
  expect(screen.getAllByText(/im Kundenprofil unter „Kommunikation"/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/unter „Ansprechpartner" mit „Chat eröffnen"/).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Zu den Kontakten" }).length).toBeGreaterThan(0);
});

it("nennt das Kundenprofil nicht, wenn die Rolle keine Kunden öffnen darf", () => {
  stand.rolle = "hr";
  zeige();
  expect(screen.queryByText(/im Kundenprofil/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Zu den Kontakten" })).toBeNull();
  expect(screen.getAllByText(/„Ansprechpartner"/).length).toBeGreaterThan(0);
});

it("behält mit vorhandenen Chats ohne Auswahl die bisherige Aufforderung", async () => {
  // Treffen die Chats erst nach dem Aufbau ein, ist keiner vorgewählt.
  stand.chats = [chat];
  stand.spaet = true;
  zeige();
  expect(await screen.findByText("Wähle einen Chat aus")).toBeTruthy();
  expect(screen.getByText("Max Muster")).toBeTruthy();
  expect(screen.queryByText(/im Kundenprofil unter/)).toBeNull();
});
