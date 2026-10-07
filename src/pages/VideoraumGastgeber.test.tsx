import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Wer die Gastgeberansicht des Videoraums sehen darf.
 *
 * Diese Seite prüfte das bis zum 11.09.2026 als einzige selbst, mit einer
 * eigenen Abfrage auf Admin und Inhaber. Alle sieben anderen Stellen im
 * Videocall-Bereich fragen `useVideocallFreigabe`, und dort gehört die Rolle
 * `hr` seit dem 10.09.2026 ausdrücklich dazu: Die HR-Managerin ist laut
 * `bewerber_termin_gastgeber()` Gastgeberin jedes Bewerbergesprächs. Sie
 * durfte den Buchungskalender pflegen und den Raum in der Übersicht sehen,
 * stand aber genau im Raum vor "Noch nicht freigegeben".
 *
 * Die Tests halten beides fest: Wer freigegeben ist, kommt herein, und für
 * alle anderen bleibt der Hinweis Wort für Wort stehen.
 */

// jsdom bringt hier keinen localStorage mit, die Seite liest daraus den
// Notizentwurf. Dasselbe Muster wie in AkademieQuiz.test.tsx.
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

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useParams: () => ({ id: "raum-1" }), useNavigate: () => vi.fn() };
});

const freigabe = vi.hoisted(() => ({ darf: true, laedt: false }));
vi.mock("@/hooks/useVideocallFreigabe", () => ({
  useVideocallFreigabe: () => freigabe,
}));

const ladeRaum = vi.hoisted(() => vi.fn());
vi.mock("@/lib/videoraumStore", () => ({
  ladeRaum,
  beobachteTeilnehmer: () => () => { /* nichts */ },
  setzeTeilnehmerStatus: vi.fn(),
  sendeEinlass: vi.fn(),
  raumUrl: (token: string) => `https://example.org/raum/${token}`,
  beendeTeilnehmerImRaum: vi.fn(),
  setzeRaumStatus: vi.fn(),
  speichereRaumNotiz: vi.fn(),
  holeSignalGeheimnis: vi.fn(),
  sendeMitschriftHinweis: vi.fn(),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Sarah Sommer", role: "hr" } }),
}));

vi.mock("@/contexts/VideoraumContext", () => ({
  useVideoraum: () => ({
    aktiv: null,
    minimiert: false,
    lokalerStream: null,
    gegenstellen: [],
    zustand: "bereit",
    verbindung: null,
    medienFehler: null,
    beende: vi.fn(),
    starte: vi.fn(),
    oeffne: vi.fn(),
    minimiere: vi.fn(),
    setzeGegenName: vi.fn(),
  }),
}));

vi.mock("@/hooks/useGeraeteListe", () => ({
  useGeraeteListe: () => ({ kameras: [], mikrofone: [], lautsprecher: [] }),
}));

vi.mock("@/lib/videocallHintergrundStore", () => ({
  listeHintergrundBilder: async () => ({ bilder: [] }),
  hintergrundBildUrl: async () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

/*
 * Womit der Gastgeber startet. Die Seite liest das Profil beim Oeffnen, damit
 * vor dem Betreten dasteht, ob Mikrofon oder Kamera ab Werk aus sind.
 */
const profil = vi.hoisted(() => ({ beitrittStumm: false, beitrittOhneKamera: false }));
const speichereVideocallProfil = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/videocallEinstellungen", () => ({
  ladeVideocallProfilSicher: async () => ({
    ...profil, spiegeln: true, hintergrund: { art: "aus" }, leisteVideosOffen: false,
  }),
  speichereVideocallProfil,
}));

import VideoraumGastgeber from "./VideoraumGastgeber";

function raum() {
  return {
    id: "raum-1",
    token: "abc",
    art: "bewerbergespraech",
    titel: "Persönliches Gespräch · test test",
    status: "offen",
    gastgeber_snapshot: { name: "Sarah Sommer" },
    kontakt_id: null,
    investment_id: null,
    agenda: [],
    meta: {},
  };
}

describe("VideoraumGastgeber, Zugang", () => {
  beforeEach(() => {
    freigabe.darf = true;
    freigabe.laedt = false;
    ladeRaum.mockReset();
    ladeRaum.mockResolvedValue(raum());
    profil.beitrittStumm = false;
    profil.beitrittOhneKamera = false;
    speichereVideocallProfil.mockClear();
  });

  it("lässt herein, wen die gemeinsame Freigabe herein lässt, etwa die Rolle hr", async () => {
    render(<VideoraumGastgeber />);
    expect(await screen.findByText("Persönliches Gespräch · test test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Raum betreten/ })).toBeInTheDocument();
    expect(screen.queryByText("Noch nicht freigegeben")).toBeNull();
  });

  it("zeigt allen übrigen Rollen den unveränderten Hinweis", async () => {
    freigabe.darf = false;
    render(<VideoraumGastgeber />);
    expect(await screen.findByText("Noch nicht freigegeben")).toBeInTheDocument();
    expect(screen.getByText("Der eigene Videoraum wird gerade getestet und ist noch nicht für alle freigeschaltet.")).toBeInTheDocument();
    expect(ladeRaum).not.toHaveBeenCalled();
  });

  it("urteilt nicht, solange die Freigabe noch geholt wird", () => {
    freigabe.darf = false;
    freigabe.laedt = true;
    render(<VideoraumGastgeber />);
    // Weder Absage noch Raum: erst fragen, dann urteilen.
    expect(screen.queryByText("Noch nicht freigegeben")).toBeNull();
    expect(ladeRaum).not.toHaveBeenCalled();
  });
});

/*
 * Der Hinweis vor dem Betreten.
 *
 * "Mit stummem Mikrofon beitreten" und "Ohne Kamera beitreten" wirken erst
 * beim naechsten Gespraech, und beim Betreten war davon nichts zu sehen.
 * Christian am 18.09.2026: Seine eigene Kachel trug ein Stummzeichen, und die
 * Suche nach dem Fehler ging ins Leere, weil es keiner war.
 */
describe("VideoraumGastgeber, womit man startet", () => {
  beforeEach(() => {
    freigabe.darf = true;
    freigabe.laedt = false;
    ladeRaum.mockReset();
    ladeRaum.mockResolvedValue(raum());
    profil.beitrittStumm = false;
    profil.beitrittOhneKamera = false;
    speichereVideocallProfil.mockClear();
  });

  it("schweigt, wenn Mikrofon und Kamera ganz normal anspringen", async () => {
    render(<VideoraumGastgeber />);
    expect(await screen.findByRole("button", { name: /Raum betreten/ })).toBeInTheDocument();
    expect(screen.queryByText(/Du startest ohne/)).toBeNull();
  });

  it("sagt vor dem Betreten, dass das Mikrofon aus bleibt", async () => {
    profil.beitrittStumm = true;
    render(<VideoraumGastgeber />);
    expect(await screen.findByText("Du startest ohne Mikrofon.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mit Kamera starten/ })).toBeNull();
  });

  it("nennt beides, wenn beides aus ist", async () => {
    profil.beitrittStumm = true;
    profil.beitrittOhneKamera = true;
    render(<VideoraumGastgeber />);
    expect(await screen.findByText("Du startest ohne Mikrofon und ohne Kamera.")).toBeInTheDocument();
  });

  it("stellt an Ort und Stelle um, ohne Umweg ueber die Einstellungen", async () => {
    profil.beitrittStumm = true;
    render(<VideoraumGastgeber />);
    const knopf = await screen.findByRole("button", { name: /Mit Mikrofon starten/ });
    fireEvent.click(knopf);
    expect(speichereVideocallProfil).toHaveBeenCalledWith({ beitrittStumm: false });
    await waitFor(() => expect(screen.queryByText(/Du startest ohne/)).toBeNull());
  });
});
