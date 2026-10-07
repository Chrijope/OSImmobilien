import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BeraterMicroseite from "./BeraterMicroseite";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: {}, isLoggedIn: false, authUser: null }) }));
vi.mock("@/lib/chatStore", () => ({ getProfilePic: () => null }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/components/landing/BeraterMicrositeContent", () => ({ default: ({ onOpenFunnel }: { onOpenFunnel: () => void }) => <button onClick={onOpenFunnel}>Beratung öffnen</button> }));
vi.mock("@/components/landing/LeadFunnelDialog", () => ({ default: (props: { open: boolean; beraterUserId: string; tippgeberId: string; tippgeberName: string; beraterSlug: string }) => props.open ? <div role="dialog">{JSON.stringify(props)}</div> : null }));

beforeEach(() => {
  sessionStorage.clear();
  rpc.mockReset();
  // Wie der echte PostgREST-Builder: .then ist vorhanden, .catch nicht.
  rpc.mockImplementation((name: string) => {
    const result = Promise.resolve({ data: name === "resolve_tippgeber_slug"
      ? [{ id: "tippgeber-id", vorname: "Max", nachname: "Beispiel" }] : null });
    return { then: result.then.bind(result) };
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: "Maria Muster", userId: "berater-id", slug: "maria", email: "maria@example.com", telefon: "123456" }) }));
});
afterEach(() => vi.unstubAllGlobals());

function Seite() {
  return <MemoryRouter initialEntries={["/vp/maria?tg=max-beispiel"]}><Routes><Route path="/vp/:slug" element={<BeraterMicroseite />} /></Routes></MemoryRouter>;
}

it("öffnet Empfehlungslinks mit PostgREST-Thenables und übergibt die Zuordnung an den Funnel", async () => {
  const { unmount } = render(<Seite />);
  fireEvent.click(await screen.findByRole("button", { name: "Beratung öffnen" }));
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent('"tippgeberId":"tippgeber-id"'));
  expect(screen.getByRole("dialog")).toHaveTextContent('"beraterUserId":"berater-id"');
  expect(screen.getByRole("dialog")).toHaveTextContent('"beraterSlug":"maria"');
  expect(screen.getByRole("dialog")).toHaveTextContent('"tippgeberName":"Max Beispiel"');
  // Gezählt wird mit Partner- und Tippgeberkürzel, der alte Weg bleibt unberührt.
  const klicks = () => rpc.mock.calls.filter(([name]) => name === "tippgeber_klick_zaehlen");
  expect(klicks()).toEqual([["tippgeber_klick_zaehlen", { _vp_slug: "maria", _tg: "max-beispiel" }]]);
  expect(rpc.mock.calls.filter(([name]) => name === "increment_tippgeber_klick")).toHaveLength(0);
  unmount();
  render(<Seite />);
  await screen.findByRole("button", { name: "Beratung öffnen" });
  expect(klicks()).toHaveLength(1);
});

it("zeigt bei gesperrtem oder unbekanntem Partner keine Daten und verweist auf osimmobilien.netlify.app", async () => {
  // get-vp-microsite antwortet für einen gesperrten Partner wie für ein unbekanntes Kürzel.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "Berater nicht gefunden" }) }));
  render(<Seite />);
  // Die Seitensprache folgt dem Browser, im Test ist das Englisch.
  expect(await screen.findByText(/Vertriebspartner nicht gefunden|Sales partner not found/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /osimmobilien\.netlify\.app/ })).toHaveAttribute("href", "https://osimmobilien.netlify.app");
  expect(screen.queryByRole("button", { name: "Beratung öffnen" })).not.toBeInTheDocument();
});
