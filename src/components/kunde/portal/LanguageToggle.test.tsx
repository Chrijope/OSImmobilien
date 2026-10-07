import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageToggle } from "./LanguageToggle";

/*
 * Der Sprachumschalter hat zwei Betriebsarten. Ohne Props schaltet er das
 * Kundenportal (i18n). Mit `value` und `onChange` ist er gesteuert, so nutzt
 * ihn die Beratungspräsentation, und dann darf er i18n nicht anfassen.
 *
 * Das Radix-Menü ist durch ein Double ersetzt: In dieser jsdom-Umgebung
 * hängen geöffnete Radix-Menüs. Geprüft wird die Verdrahtung.
 */

const i18n = vi.hoisted(() => ({
  language: "de",
  resolvedLanguage: "de",
  changeLanguage: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n, t: (schluessel: string) => (schluessel === "portal.header.language" ? "Sprache" : schluessel) }),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" role="menuitem" onClick={onClick}>
      {children}
    </button>
  ),
}));

beforeEach(() => i18n.changeLanguage.mockReset());

describe("LanguageToggle, gesteuert", () => {
  it("zeigt den übergebenen Wert und meldet die Wahl, ohne i18n umzuschalten", () => {
    const onChange = vi.fn();
    render(<LanguageToggle value="en" onChange={onChange} label="Language" />);

    const schalter = screen.getByTestId("sprachwechsel");
    expect(schalter).toHaveTextContent("EN");
    expect(schalter).toHaveAccessibleName("Language");

    fireEvent.click(screen.getByRole("menuitem", { name: /Deutsch/ }));

    expect(onChange).toHaveBeenCalledWith("de");
    expect(i18n.changeLanguage).not.toHaveBeenCalled();
  });
});

describe("LanguageToggle, Kundenportal", () => {
  it("schaltet ohne Props weiter die Portalsprache", () => {
    render(<LanguageToggle />);
    expect(screen.getByTestId("sprachwechsel")).toHaveTextContent("DE");
    expect(screen.getByTestId("sprachwechsel")).toHaveAccessibleName("Sprache");
    fireEvent.click(screen.getByRole("menuitem", { name: /English/ }));
    expect(i18n.changeLanguage).toHaveBeenCalledWith("en");
  });
});
