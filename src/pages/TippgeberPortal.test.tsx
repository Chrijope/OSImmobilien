import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NeuerKontaktTab } from "./TippgeberPortal";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: {}, authUser: null }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function ausfuellen() {
  const felder = screen.getAllByRole("textbox");
  // Reihenfolge im Formular: Vorname, Nachname, E-Mail, Telefon.
  ["Max", "Muster", "max@example.com", "0170 1234567"].forEach((wert, i) =>
    fireEvent.change(felder[i], { target: { value: wert } }),
  );
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ error: null });
});

it("sendet ohne Häkchen nicht und meldet es am Häkchen", async () => {
  render(<NeuerKontaktTab onCreated={() => {}} />);
  ausfuellen();
  const haken = screen.getByRole("checkbox", { name: /Ich bestätige, dass Max mit der Weitergabe/ });
  expect(haken).toHaveAttribute("aria-required", "true");
  expect(haken).not.toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: /Empfehlung absenden/ }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/Bitte bestätige/);
  expect(haken).toHaveAttribute("aria-invalid", "true");
  expect(rpc).not.toHaveBeenCalled();
});

it("sendet mit Häkchen samt Fassung und Wortlaut", async () => {
  const onCreated = vi.fn();
  render(<NeuerKontaktTab onCreated={onCreated} />);
  ausfuellen();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /Empfehlung absenden/ }));

  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  expect(rpc).toHaveBeenCalledWith(
    "create_tippgeber_lead",
    expect.objectContaining({
      _vorname: "Max",
      _einverstaendnis: true,
      _einverstaendnis_fassung: "2026-09-tippgeber-einverstaendnis-v1",
      _einverstaendnis_wortlaut: expect.stringMatching(/^Ich bestätige, dass Max /),
    }),
  );
  expect(screen.queryByRole("alert")).toBeNull();
});
