import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SteuerRechnerStrecke from "./SteuerRechnerStrecke";

const ereignis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/steuerrechnerEreignisse", () => ({ protokolliereSteuerEreignis: ereignis }));
/* Das Formular selbst ist hier nicht der Gegenstand, es hat einen eigenen
   Test. Die Attrappe merkt sich, mit welchen Angaben sie gerufen wurde, und
   bietet einen Knopf, der eine gelungene Eintragung nachstellt. Abgeschickt
   wird dabei nichts. */
const formularProps = vi.hoisted(() => ({ wert: undefined as Record<string, unknown> | undefined }));
vi.mock("./SteuerFormular", () => ({
  default: (props: {
    vorErgebnis?: boolean;
    berater?: { userId?: string };
    onAbgesendet?: () => void;
    onFertig?: () => void;
    onAnsprechpartner?: () => void;
    onWeiter?: (info: { email: string; hinweis: string | null; ersatzLink: string | null }) => void;
  }) => {
    formularProps.wert = props as unknown as Record<string, unknown>;
    return (
      <div>
        <div>Kontaktformular</div>
        <button
          type="button"
          onClick={() => {
            props.onAbgesendet?.();
            props.onFertig?.();
            /* Die echte Fassung bekommt oeffentlich kein `onWeiter` mehr. Die
               Attrappe ruft es trotzdem, falls es doch da ist: Nur so faellt
               im Test auf, wenn jemand es wieder durchreicht. */
            props.onWeiter?.({ email: "max@example.com", hinweis: null, ersatzLink: null });
          }}
        >
          Eintragung nachstellen
        </button>
        <button type="button" onClick={() => props.onAnsprechpartner?.()}>
          Wie es jetzt weitergeht
        </button>
      </div>
    );
  },
}));
vi.mock("recharts", async () => ({
  ...await vi.importActual<Record<string, unknown>>("recharts"),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// `exact` gibt es bei getByRole nicht, nur bei getByText. Ein Name als
// Zeichenkette trifft hier ohnehin genau, die Option war wirkungslos und hat
// die Typpruefung des ganzen Projekts zum Scheitern gebracht.
const weiter = () => fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  ereignis.mockClear();
  formularProps.wert = undefined;
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Die freigegebene Rechnerstrecke", () => {
  it("erlaubt eine neue Zahl ohne vorzeitiges Begrenzen und behaelt sie beim Zurueckgehen", () => {
    render(<SteuerRechnerStrecke />);
    const eingabe = screen.getByRole("textbox", { name: "Jahresbrutto in Euro" });
    fireEvent.change(eingabe, { target: { value: "9" } });
    expect(eingabe).toHaveValue("9");
    fireEvent.change(eingabe, { target: { value: "95000" } });
    fireEvent.blur(eingabe);
    expect(eingabe).toHaveValue("95.000");
    weiter();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Eine Frage zurück" }));
    expect(screen.getByRole("textbox", { name: "Jahresbrutto in Euro" })).toHaveValue("95.000");
  });

  /**
   * Der Aufbau der Spalte, nicht ihre Optik.
   *
   * Dahinter steht eine Zusage an den Nutzer: Der Weiter-Knopf soll auf jedem
   * Schritt an derselben Stelle stehen. Getragen wird sie von zwei Dingen,
   * einer festen Mindesthoehe in `steuerrechner.css` und dem eigenen Fussfach,
   * das sich an die Unterkante der Karte haengt. Die Hoehe laesst sich hier
   * nicht pruefen, jsdom misst nichts. Das Fussfach schon, und ohne das
   * Fussfach traegt die Hoehe allein gar nichts: Der Knopf stuende dann
   * mitten im Inhalt und wanderte mit ihm.
   */
  it("haelt die Schrittzaehlung und den Weiter-Knopf an ihrem Platz", () => {
    const { container } = render(<SteuerRechnerStrecke />);

    const kasten = container.querySelector(".steuer-schrittkasten");
    const frage = container.querySelector(".steuer-frage");
    expect(kasten).toBeTruthy();
    expect(frage).toBeTruthy();
    // Die Schrittzaehlung steht in ihrem eigenen Kasten, nicht in der Frage.
    expect(kasten!.textContent).toContain("Schritt 1 von");
    expect(frage!.textContent).not.toContain("Schritt 1 von");
    // Und dieser Kasten steht ueber der Frage, nicht darunter.
    expect(kasten!.compareDocumentPosition(frage!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Der Knopf haengt im Fussfach der Karte.
    const fuss = frage!.querySelector(".steuer-frage-fuss");
    expect(fuss).toBeTruthy();
    expect(fuss!.contains(screen.getByRole("button", { name: "Weiter" }))).toBe(true);
  });

  it("fuehrt durch den Partnerzweig, zeigt das Ergebnis sofort und laesst Werte aendern", () => {
    render(
      <SteuerRechnerStrecke
        berater={{ name: "Testberater", userId: "partner-test", telefon: "", email: "" }}
        variante="intern"
      />,
    );
    weiter();
    fireEvent.click(screen.getByRole("button", { name: /^Angestellt/ }));
    weiter();
    fireEvent.click(screen.getByRole("button", { name: /^Klasse III/ }));
    weiter();
    const partner = screen.getByLabelText("Jahresbrutto deines Partners");
    fireEvent.change(partner, { target: { value: "45000" } });
    weiter(); // Kinder
    weiter(); // Wohnort
    weiter(); // Bestand
    weiter(); // Zeitpunkt
    expect(screen.getByRole("button", { name: "Ergebnis berechnen" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Nur aus Neugier/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis berechnen" }));
    expect(screen.getByRole("heading", { name: "Dein Ergebnis im Überblick" })).toBeTruthy();
    expect(screen.queryByText("Dein Steuervorteil wird berechnet")).toBeNull();
    expect(ereignis).toHaveBeenCalledWith("steuer_beendet", "partner-test");
    fireEvent.click(screen.getByRole("button", { name: /Partner 45.000/ }));
    expect(screen.getByLabelText("Jahresbrutto deines Partners")).toHaveValue("45.000");
    fireEvent.click(screen.getByRole("button", { name: /85.000.*brutto/ }));
    const brutto = screen.getByRole("textbox", { name: "Jahresbrutto in Euro" });
    fireEvent.change(brutto, { target: { value: "100000" } });
    fireEvent.blur(brutto);
    expect(screen.getByRole("button", { name: /100.000.*brutto/ })).toBeTruthy();
  });
});

/**
 * Die Kontaktabfrage vor dem Ergebnis.
 *
 * Seit dem 17.09.2026 steht sie zwischen der letzten Frage und dem Ergebnis,
 * damit der Rechner Leads bringt. Intern wird sie uebersprungen, sonst traegt
 * sich der Vertriebspartner beim Ausprobieren selbst als Lead ein.
 *
 * Das Gate ist KEIN Zugriffsschutz: Gerechnet wird im Browser. Diese Tests
 * halten den Ablauf fest, nicht eine Sicherheitsgrenze.
 */
describe("Die Kontaktabfrage zwischen letzter Frage und Ergebnis", () => {
  /** Alle Fragen der ledigen Strecke beantworten und den letzten Knopf druecken. */
  const bisZumEnde = () => {
    weiter(); // Einkommen
    fireEvent.click(screen.getByRole("button", { name: /^Angestellt/ }));
    weiter(); // Beschaeftigung
    weiter(); // Steuerklasse, Klasse I steht schon
    weiter(); // Kinder
    weiter(); // Wohnsitz, ohne Kirchensteuer ohne Pflichtangabe
    weiter(); // Bestand
    fireEvent.click(screen.getByRole("button", { name: /^Nur aus Neugier/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Weiter zum letzten Schritt|Ergebnis berechnen/ }),
    );
  };

  it("zeigt oeffentlich erst das Formular und noch kein Ergebnis", () => {
    render(<SteuerRechnerStrecke berater={{ name: "Testberater", userId: "vp-1", telefon: "", email: "" }} />);
    bisZumEnde();
    expect(screen.getByText("Kontaktformular")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Dein Ergebnis im Überblick" })).toBeNull();
    // Das Formular weiss, dass es vor dem Ergebnis steht, und kennt den Partner.
    expect(formularProps.wert?.vorErgebnis).toBe(true);
    expect((formularProps.wert?.berater as { userId?: string }).userId).toBe("vp-1");
    expect(ereignis).toHaveBeenCalledWith("eintragung_gesehen", "vp-1");
  });

  /**
   * Der Kern des Umbaus vom 17.09.2026.
   *
   * Oeffentlich endet die Strecke mit der Eintragung. Das Ergebnis erscheint
   * nicht mehr auf dem Bildschirm, es kommt als PDF per Mail. Wer diesen Test
   * rot sieht, weil wieder ein `onWeiter` durchgereicht wird, hat den Grund
   * dafuer im Kopf von `SteuerRechnerStrecke` stehen.
   */
  it("zeigt nach der Eintragung oeffentlich KEIN Ergebnis und keinen Weg dorthin", () => {
    render(<SteuerRechnerStrecke berater={{ name: "Testberater", userId: "vp-1", telefon: "", email: "" }} />);
    bisZumEnde();
    // Die Strecke darf dem Formular gar keinen Weg zum Ergebnis mitgeben.
    expect(formularProps.wert?.onWeiter).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Eintragung nachstellen" }));
    expect(screen.queryByRole("heading", { name: "Dein Ergebnis im Überblick" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ergebnis ansehen" })).toBeNull();
    // Der Rueckweg in die Fragen faellt nach dem Absenden weg.
    expect(screen.queryByRole("button", { name: "Eine Frage zurück" })).toBeNull();
    expect(ereignis).toHaveBeenCalledWith("eintragung_abgesendet", "vp-1");
    expect(ereignis).toHaveBeenCalledWith("steuer_beendet", "vp-1");
  });

  /**
   * „Wie es jetzt weitergeht“ zeigt den Ansprechpartner aus dem Link.
   *
   * Christian am 17.09.2026: „dass sich der jeweilige Partner, eben angepasst
   * an diesen Link, bei ihm melden wird“. Der Einblender ist ein Dialog im
   * Projektstil, kein Browser-Fenster.
   */
  it("oeffnet den Einblender mit den Kontaktdaten des Partners", () => {
    render(
      <SteuerRechnerStrecke
        berater={{
          name: "Testberater",
          userId: "vp-1",
          telefon: "+49 89 123456",
          email: "test@example.com",
          position: "Ansprechpartner",
        }}
      />,
    );
    bisZumEnde();
    fireEvent.click(screen.getByRole("button", { name: "Wie es jetzt weitergeht" }));
    expect(screen.getByRole("heading", { name: "Wie es jetzt weitergeht" })).toBeTruthy();
    expect(screen.getByText(/Testberater meldet sich zeitnah bei dir/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /\+49 89 123456/ })).toHaveAttribute(
      "href",
      "tel:+4989123456",
    );
    expect(screen.getByRole("link", { name: /test@example.com/ })).toHaveAttribute(
      "href",
      "mailto:test@example.com",
    );
  });

  /**
   * Ohne Partner am Link wird kein Name und keine Nummer erfunden.
   * Die Faelle im Einzelnen stehen in `AnsprechpartnerEinblender.test.tsx`.
   */
  it("sagt ohne Partner nur die Rueckmeldung zu", () => {
    render(<SteuerRechnerStrecke />);
    bisZumEnde();
    fireEvent.click(screen.getByRole("button", { name: "Wie es jetzt weitergeht" }));
    expect(screen.getByText(/Wir melden uns zeitnah bei dir zurück/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^\+/ })).toBeNull();
  });

  it("ueberspringt den Schritt intern und sagt an seiner Stelle, was oeffentlich dort steht", () => {
    render(
      <SteuerRechnerStrecke
        berater={{ name: "Testberater", userId: "vp-1", telefon: "", email: "" }}
        variante="intern"
      />,
    );
    bisZumEnde();
    expect(screen.getByRole("heading", { name: "Dein Ergebnis im Überblick" })).toBeTruthy();
    expect(screen.queryByText("Kontaktformular")).toBeNull();
    expect(
      screen.getByText(/Hier steht in der veröffentlichten Fassung die Kontaktabfrage/),
    ).toBeTruthy();
    expect(ereignis).not.toHaveBeenCalledWith("eintragung_gesehen", "vp-1");
  });

  it("laesst aus dem Formular zurueck in die Strecke, ohne eine Antwort zu verlieren", () => {
    render(<SteuerRechnerStrecke />);
    bisZumEnde();
    fireEvent.click(screen.getByRole("button", { name: "Eine Frage zurück" }));
    // Zurueck auf der letzten Frage, und die Antwort von vorhin steht noch.
    expect(screen.getByRole("heading", { name: "Wann möchtest du starten?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Nur aus Neugier/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Und auch die Antwort von ganz vorne liegt noch da.
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Eine Frage zurück" }));
    }
    expect(screen.getByRole("textbox", { name: "Jahresbrutto in Euro" })).toHaveValue("85.000");
  });
});
