import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { KennenlernenAntworten } from "@/lib/bewerberKennenlernen";

/*
 * Ob die Präsentation hängt, entscheidet in der Moderation darüber, ob der
 * Zurückweg nachfragt. Im Test gibt es kein zweites Fenster, deshalb dieser
 * Schalter: Er schaltet nur `istVerbunden` hart auf wahr, alles andere aus
 * dem Modul bleibt echt.
 */
let praesentationHaengt = false;
vi.mock("@/lib/praesentationsKopplung", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/praesentationsKopplung")>();
  return {
    ...echt,
    istVerbunden: (...args: Parameters<typeof echt.istVerbunden>) =>
      praesentationHaengt || echt.istVerbunden(...args),
  };
});

// jsdom bringt hier keinen localStorage mit, der Entwurfsspeicher braucht ihn.
const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  },
});

const bewerber = {
  id: "b1",
  vorname: "Jonas",
  nachname: "Hellwig",
  prozess: "neu",
  erstgespraechSkript: {},
};

vi.mock("@/lib/bewerbungStore", () => ({
  getBewerberById: () => bewerber,
  updateBewerber: vi.fn(),
}));

vi.mock("@/lib/dataCache", () => ({
  isTableLoaded: () => true,
  onCacheChange: () => () => {},
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Sarah", role: "hr", moreId: "" }, authUser: null }),
}));

/** Der ausgefüllte Bogen eines Bewerbers auf Weg 2 (Finanzberatung). */
const ANTWORTEN: KennenlernenAntworten = {
  weg: "weg2",
  hintergrund: ["beratung"],
  wegAntwort1: ["baufi", "vorsorge"],
  wegAntwort2: "empfehlung",
  passung: ["selbststaendig", "variabel"],
  verstaendnisFixum: "nein",
  verstaendnisProvision: "nein",
  zeitProWoche: "10_bis_20",
  perspektive: "spaeter_haupt",
  leadPraeferenz: "leads",
  startzeitpunkt: "vier_wochen",
  gewerbe: "ja",
  erlaubnis34c: "nein",
  themen: ["einstieg", "verdienst"],
  eigeneFrage: "Wie viel macht ihr mit, wenn ein Kunde bei der Finanzierung kippt?",
};

/*
 * Der Bogen kommt als Liste, absteigend nach created_at, und die juengste
 * EINGEREICHTE Zeile zaehlt. Die zweite Zeile hier ist eine leere Einladung,
 * die nach dem Ausfuellen hinausging: genau der Fall, an dem die alte Pruefung
 * gescheitert ist (Chris Test).
 */
vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  for (const glied of ["select", "eq", "order"]) kette[glied] = () => kette;
  kette.limit = () => Promise.resolve({
    data: [
      { status: "offen", antworten: {}, created_at: "2026-09-05" },
      { status: "eingereicht", antworten: ANTWORTEN, created_at: "2026-09-01" },
    ],
    error: null,
  });
  return { supabase: { from: () => ({ ...kette }) } };
});

// Die Termine liegen in einer anderen Tabelle und duerfen fehlen.
vi.mock("@/lib/bewerberTerminStore", () => ({ ladeBewerberBuchungen: async () => ({}) }));

// Die Absage-Mail wird hier nicht verschickt.
vi.mock("@/lib/bewerberAbsageMail", () => ({ sendeBewerberAbsageMail: async () => ({ ok: true }) }));

// Erst nach den Attrappen laden, sonst greifen sie nicht.
const { default: BewerberVideocallModeration } = await import("./BewerberVideocallModeration");

/** Steht für das Bewerberprofil und verrät, mit welcher Adresse es aufging. */
function Bewerberprofil() {
  const ort = useLocation();
  return <div>Bewerberprofil{ort.search}</div>;
}

function zeichne() {
  return render(
    <MemoryRouter initialEntries={["/closing-moderation?bewerberId=b1&ablauf=neu"]}>
      <Routes>
        <Route path="/closing-moderation" element={<BewerberVideocallModeration />} />
        <Route path="/bewerberprozess" element={<Bewerberprofil />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BewerberVideocallModeration", () => {
  beforeEach(() => {
    speicher.clear();
    praesentationHaengt = false;
  });

  it("zeigt die Strecke, die Dauer und den ersten Kernbaustein", async () => {
    zeichne();
    // Mehrfach, weil die kleine Folienvorschau dieselben Angaben zeigt.
    expect((await screen.findAllByText(/Ich berate zu Geld/)).length).toBeGreaterThan(0);
    // Weg 2 laeuft mit zwei gesetzten Modulen: der Bruecke und dem zweiten Produkt.
    expect(screen.getAllByText(/36 Minuten/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Folie 1 von 8/).length).toBeGreaterThan(0);
  });

  it("vor dem Gespräch steht kein Punktwert und keine Empfehlung", async () => {
    zeichne();
    await screen.findByText(/Statt einer Punktzahl/);
    expect(screen.queryByText(/Gesamtpunktwert:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Empfehlung A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vorab-Score/)).not.toBeInTheDocument();
  });

  it("zeigt die nicht gewählten Module, damit sie im Gespräch greifbar bleiben", async () => {
    zeichne();
    const nichtGewaehlt = (await screen.findByText("Nicht gewählt")).closest("div");
    expect(nichtGewaehlt).not.toBeNull();
    const bereich = within(nichtGewaehlt!.parentElement as HTMLElement);
    // Auf Weg 2 sind Modul 2 und Modul 7 gesetzt, die anderen stehen daneben.
    expect(bereich.getByText(/M1 Objektangebot/)).toBeInTheDocument();
    expect(bereich.getByText(/M3 Langer Zyklus/)).toBeInTheDocument();
    expect(bereich.getByText(/M5 Lernplan/)).toBeInTheDocument();
    expect(bereich.queryByText(/M2 Übergang aus der Beratung/)).not.toBeInTheDocument();
    expect(bereich.queryByText(/M7 Zweites Produkt/)).not.toBeInTheDocument();
  });

  it("ein nicht gewähltes Modul lässt sich im Gespräch einschieben und zurücknehmen", async () => {
    zeichne();
    const knopf = await screen.findByTitle("Modul 6 einschieben");
    fireEvent.click(knopf);
    // Aus acht Folien werden neun, aus 36 Minuten werden 41.
    await waitFor(() => expect(screen.getAllByText(/Folie 1 von 9/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/41 Minuten/).length).toBeGreaterThan(0);
    expect(screen.getByText("Im Gespräch zugeschaltet")).toBeInTheDocument();
    // Die Modulwahl ist ein Vorschlag: Wer ihn ändert, schreibt den Grund dazu.
    expect(screen.getByPlaceholderText("Warum diese Änderung?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("zurücknehmen"));
    await waitFor(() => expect(screen.getAllByText(/Folie 1 von 8/).length).toBeGreaterThan(0));
  });

  it("erfasst geklärte Punkte mit einem Klick", async () => {
    zeichne();
    const feld = await screen.findByPlaceholderText("Was ist geklärt?");
    fireEvent.change(feld, { target: { value: "Unterstützung im Kundengespräch, er ist zufrieden" } });
    fireEvent.keyDown(feld, { key: "Enter" });
    expect(await screen.findByText("Unterstützung im Kundengespräch, er ist zufrieden")).toBeInTheDocument();
  });

  /**
   * Das freie Notizfeld: ein Text für das ganze Gespräch. Er übersteht den
   * Folienwechsel, die Folie schreibt sich von selbst dazu, und gespeichert
   * wird sofort im Browser.
   */
  it("hält eine Notiz über alle Folien hinweg und vermerkt die Folie von selbst", async () => {
    zeichne();
    const feld = (await screen.findByLabelText("Notiz zum Gespräch")) as HTMLTextAreaElement;
    fireEvent.change(feld, { target: { value: "Er fragt nach der Anlaufzeit" } });
    await waitFor(() =>
      expect(feld.value).toMatch(/^Folie 1, .+\nEr fragt nach der Anlaufzeit$/),
    );

    // Eine Folie weiter: Der Text bleibt stehen.
    fireEvent.click(screen.getByRole("button", { name: /Weiter/ }));
    await waitFor(() => expect(screen.getAllByText(/Folie 2 von 8/).length).toBeGreaterThan(0));
    expect(feld.value).toContain("Er fragt nach der Anlaufzeit");

    // Der nächste Eintrag bekommt die neue Folie ohne Zutun dazu.
    fireEvent.change(feld, { target: { value: `${feld.value} und nach dem Lernplan` } });
    await waitFor(() => expect(feld.value).toMatch(/Folie 2, /));
    expect(feld.value).toContain("Er fragt nach der Anlaufzeit");

    // Sofort im Browser abgelegt, als Schutz gegen ein Neuladen.
    const entwurf = JSON.parse(speicher.get("bewerber_videocall_draft_b1") ?? "{}");
    expect(String(entwurf.notiz)).toContain("und nach dem Lernplan");
  });

  it("die Maske bietet kein Feld für Stimme, Auftreten oder Kamerahintergrund", async () => {
    zeichne();
    await screen.findByText("Beobachtung, arbeitsbezogen");
    for (const wort of [/Stimme/, /Ersteindruck/, /Kamerahintergrund/, /Energie/]) {
      expect(screen.queryByText(wort)).not.toBeInTheDocument();
    }
  });

  it("trennt unsere Einschätzung von dem, was der Bewerber will", async () => {
    zeichne();
    // Unsere Einschätzung, die drei Möglichkeiten der letzten Folie.
    expect(await screen.findByText("Zusammenarbeit möglich")).toBeInTheDocument();
    expect(screen.getByText("Noch Klärung erforderlich")).toBeInTheDocument();
    expect(screen.getByText("Nicht möglich, mit Grund")).toBeInTheDocument();
    // Sein Wunsch, die drei Türen derselben Folie.
    expect(screen.getByText("Will starten")).toBeInTheDocument();
    expect(screen.getByText("Möchte die Unterlagen")).toBeInTheDocument();
    expect(screen.getByText("Passt für ihn nicht")).toBeInTheDocument();
  });

  it("bietet am Ende dieselben vier Knöpfe wie der Reiter", async () => {
    zeichne();
    expect(await screen.findByRole("button", { name: /Persönliches Gespräch abschließen/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zwischenspeichern/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kein Interesse/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abgelehnt/ })).toBeInTheDocument();
  });

  it("fragt die Adressen erst, wenn der Wunsch zu einem Schriftstück führt", async () => {
    zeichne();
    await screen.findByText("Will starten");
    expect(screen.queryByLabelText(/Vertragsanschrift, mit Name/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Will starten"));
    expect(await screen.findByLabelText(/Vertragsanschrift, mit Name/)).toBeInTheDocument();
    // Bei „Passt für ihn nicht" entsteht kein Schriftstück, also auch keine Adresse.
    fireEvent.click(screen.getByText("Passt für ihn nicht"));
    await waitFor(() =>
      expect(screen.queryByLabelText(/Vertragsanschrift, mit Name/)).not.toBeInTheDocument(),
    );
  });

  it("zeigt die vollständige Antwortübersicht, aufklappbar", async () => {
    zeichne();
    const knopf = await screen.findByRole("button", { name: /Alle Antworten/ });
    // Zugeklappt ist die Erreichbarkeit noch nicht zu sehen.
    expect(screen.queryByText("So möchte er starten")).not.toBeInTheDocument();
    fireEvent.click(knopf);
    expect(await screen.findByText("So möchte er starten")).toBeInTheDocument();
    // Die beiden Verständnisfragen erschienen bisher nirgends in der Akte.
    expect(screen.getByText(/Verständnis Fixum/)).toBeInTheDocument();
    expect(screen.getByText(/Verständnis Provision/)).toBeInTheDocument();
  });
  /*
   * Punkt 7 vom 22.09.2026. Die Übersicht stand vorher nur in der
   * Vorbereitung, und die klappt weg, sobald das Gespräch losgeht. Sie war
   * damit genau dann nicht erreichbar, wenn jemand etwas nachschlägt.
   */
  it("hält die Antwortübersicht auch dann bereit, wenn die Vorbereitung zugeklappt ist", async () => {
    zeichne();
    fireEvent.click(await screen.findByRole("button", { name: /Alle Antworten/ }));
    expect(await screen.findByText("So möchte er starten")).toBeInTheDocument();

    // Die Vorbereitung wegklappen, so wie es die Moderatorin zu Beginn tut.
    fireEvent.click(screen.getByRole("button", { name: "Vorbereitung zuklappen" }));
    await waitFor(() => expect(screen.queryByText(/Statt einer Punktzahl/)).not.toBeInTheDocument());
    expect(screen.getByText("So möchte er starten")).toBeInTheDocument();

    // Und über den Folienwechsel hinweg bleibt sie aufgeklappt.
    fireEvent.click(screen.getByRole("button", { name: /Weiter/ }));
    await waitFor(() => expect(screen.getAllByText(/Folie 2 von 8/).length).toBeGreaterThan(0));
    expect(screen.getByText("So möchte er starten")).toBeInTheDocument();
  });

  /*
   * Der Weg zurück. Aus der Moderation führte bis dahin nichts ins Profil,
   * und ein allgemeiner Sprung in die Bewerberliste wäre keiner: Gesucht ist
   * genau der Bewerber, dessen Gespräch gerade lief.
   */
  it("führt über den Zurückknopf zu genau diesem Bewerber", async () => {
    zeichne();
    fireEvent.click(await screen.findByRole("button", { name: "Zurück zum Bewerberprofil" }));
    const ziel = await screen.findByText(/^Bewerberprofil/);
    expect(ziel.textContent).toContain("openBewerber=b1");
    // Derselbe Reiter, aus dem die Moderation aufgegangen ist.
    expect(ziel.textContent).toContain("detailTab=erstgespraech");
  });

  it("fragt ohne laufende Präsentation nicht nach", async () => {
    zeichne();
    fireEvent.click(await screen.findByRole("button", { name: "Zurück zum Bewerberprofil" }));
    expect(screen.queryByText("Die Präsentation läuft noch")).not.toBeInTheDocument();
    expect(await screen.findByText(/^Bewerberprofil/)).toBeInTheDocument();
  });

  it("fragt nach, solange die Präsentation hängt, und bleibt auf Wunsch stehen", async () => {
    praesentationHaengt = true;
    zeichne();
    fireEvent.click(await screen.findByRole("button", { name: "Zurück zum Bewerberprofil" }));
    expect(await screen.findByText("Die Präsentation läuft noch")).toBeInTheDocument();
    expect(screen.queryByText(/^Bewerberprofil/)).not.toBeInTheDocument();

    // „Im Gespräch bleiben" lässt die Moderation stehen.
    fireEvent.click(screen.getByRole("button", { name: "Im Gespräch bleiben" }));
    await waitFor(() =>
      expect(screen.queryByText("Die Präsentation läuft noch")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Bewerberprofil/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Folie 1 von 8/).length).toBeGreaterThan(0);
  });

  it("verlässt die Moderation erst nach der Bestätigung", async () => {
    praesentationHaengt = true;
    zeichne();
    fireEvent.click(await screen.findByRole("button", { name: "Zurück zum Bewerberprofil" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Zurück zum Bewerberprofil" }));
    const ziel = await screen.findByText(/^Bewerberprofil/);
    expect(ziel.textContent).toContain("openBewerber=b1");
  });
});
