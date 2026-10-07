import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { zeilenKlick } from "./zeilenNavigation";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function zeile(navigate: (to: string) => void) {
  const handler = (e: React.MouseEvent<HTMLElement>) => zeilenKlick(e, "/kunden/k1", navigate);
  render(
    <table>
      <tbody>
        <tr onClick={handler} onAuxClick={handler}>
          <td><button role="checkbox" aria-label="Auswählen" aria-checked="false" /></td>
          <td><span>Nur Text</span></td>
          {/* preventDefault nur, weil jsdom echte Seitenwechsel nicht kann. */}
          <td><a href="/kunden/k1" onClick={(e) => e.preventDefault()}>Name</a></td>
        </tr>
      </tbody>
    </table>,
  );
}

const mittelklick = () => new MouseEvent("auxclick", { bubbles: true, button: 1 });

describe("zeilenKlick", () => {
  it("öffnet bei normalem Klick im selben Tab", () => {
    const navigate = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    zeile(navigate);
    fireEvent.click(screen.getByText("Nur Text"));
    expect(navigate).toHaveBeenCalledWith("/kunden/k1");
    expect(open).not.toHaveBeenCalled();
  });

  it.each([["Strg", { ctrlKey: true }], ["Cmd", { metaKey: true }]])("öffnet bei %s+Klick einen neuen Tab", (_, taste) => {
    const navigate = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    zeile(navigate);
    fireEvent.click(screen.getByText("Nur Text"), taste);
    expect(open).toHaveBeenCalledWith("/kunden/k1", "_blank", "noopener");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("öffnet bei Mittelklick einen neuen Tab, bei Rechtsklick nichts", () => {
    const navigate = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    zeile(navigate);
    fireEvent(screen.getByText("Nur Text"), new MouseEvent("auxclick", { bubbles: true, button: 2 }));
    expect(open).not.toHaveBeenCalled();
    fireEvent(screen.getByText("Nur Text"), mittelklick());
    expect(open).toHaveBeenCalledWith("/kunden/k1", "_blank", "noopener");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("lässt Auswahlkästchen und Links in Ruhe", () => {
    const navigate = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    zeile(navigate);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("checkbox"), { metaKey: true });
    fireEvent.click(screen.getByRole("link"), { ctrlKey: true });
    fireEvent(screen.getByRole("link"), mittelklick());
    expect(navigate).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
