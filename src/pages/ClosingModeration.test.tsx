import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { KennenlernenAntworten } from "@/lib/bewerberKennenlernen";

/**
 * Die Adresse /closing-moderation.
 *
 * Bis zum 23.09.2026 stand hier eine Weiche: ohne Parameter die Moderation
 * der alten Closing-Präsentation, mit `ablauf=neu` die des Videocalls. Die
 * alte ist entfernt. Seitdem zeigt die Adresse immer die Moderation des
 * Videocalls mit den fünf Wegen (`BewerberVideocallModeration.tsx`), für
 * Bewerber im alten wie im neuen Ablauf.
 *
 * Zwei Dinge werden geprüft. Erstens, dass `App.tsx` die Adresse wirklich auf
 * die neue Seite legt; geprüft wird der Wortlaut, wie in
 * `routenTabellen.test.ts`, denn ein nachgebauter Router bestätigte nur sich
 * selbst. Zweitens, dass die Seite unter dieser Adresse mit jeder Form von
 * Link auskommt, die noch in offenen Tabs und Lesezeichen stecken kann: ohne
 * `ablauf`, mit dem alten `ablauf=neu` und mit `teil=2` aus der Zeit der
 * zwei Teile.
 *
 * Was in `ClosingModeration.tsx` übrig ist, sind die beiden Skriptbausteine
 * der Übung. Die prüft `PraesentationsUebung.test.tsx`.
 */

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

/** Ein Bewerber aus dem alten Ablauf: kein Kennzeichen `prozess`. */
const bewerber = {
  id: "b1",
  vorname: "Jonas",
  nachname: "Hellwig",
  erstgespraechSkript: {},
};

vi.mock("@/lib/bewerbungStore", () => ({
  getBewerberById: (id: string) => (id === "b1" ? bewerber : undefined),
  updateBewerber: vi.fn(),
}));

vi.mock("@/lib/dataCache", () => ({
  isTableLoaded: () => true,
  onCacheChange: () => () => {},
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Sarah", role: "hr", moreId: "" }, authUser: null }),
}));

/** Ein ausgefüllter Kennenlernbogen auf Weg 2 (Finanzberatung). */
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
  eigeneFrage: "Wie läuft der erste Monat?",
};

vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  for (const glied of ["select", "eq", "order"]) kette[glied] = () => kette;
  kette.limit = () => Promise.resolve({
    data: [{ status: "eingereicht", antworten: ANTWORTEN, created_at: "2026-09-01" }],
    error: null,
  });
  return { supabase: { from: () => ({ ...kette }) } };
});

// Die Termine liegen in einer anderen Tabelle und dürfen fehlen.
vi.mock("@/lib/bewerberTerminStore", () => ({ ladeBewerberBuchungen: async () => ({}) }));

// Die Absage-Mail wird hier nicht verschickt.
vi.mock("@/lib/bewerberAbsageMail", () => ({ sendeBewerberAbsageMail: async () => ({ ok: true }) }));

// Erst nach den Attrappen laden, sonst greifen sie nicht.
const { default: BewerberVideocallModeration } = await import("./BewerberVideocallModeration");

const APP_TSX = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const APP_EINZEILIG = APP_TSX.replace(/\s+/g, " ");

function zeichne(adresse: string) {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="/closing-moderation" element={<BewerberVideocallModeration />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  speicher.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/closing-moderation in App.tsx", () => {
  it("zeigt direkt auf die Moderation des Videocalls, hinter dem PraesentationGuard", () => {
    expect(APP_EINZEILIG).toContain(
      '<Route path="/closing-moderation" element={<PraesentationGuard nurBewerberprozess><BewerberVideocallModeration /></PraesentationGuard>} />',
    );
    expect(APP_TSX).toContain('import("./pages/BewerberVideocallModeration")');
  });

  it("lädt die alte Moderationsseite nicht mehr als Route", () => {
    expect(APP_TSX).not.toContain('import("./pages/ClosingModeration")');
    expect(APP_TSX).not.toContain("<ClosingModeration");
  });
});

describe("/closing-moderation zeigt immer die Moderation des Videocalls", () => {
  for (const [fall, adresse] of [
    ["ohne ablauf", "/closing-moderation?bewerberId=b1&teil=1"],
    ["mit dem alten ablauf=neu", "/closing-moderation?bewerberId=b1&teil=1&ablauf=neu"],
    ["mit teil=2 aus der Zeit der zwei Teile", "/closing-moderation?bewerberId=b1&teil=2"],
  ] as const) {
    it(fall, async () => {
      zeichne(adresse);
      // Die Strecke aus dem Kennenlernbogen und der Kopf des Videocalls.
      expect((await screen.findAllByText(/Ich berate zu Geld/)).length).toBeGreaterThan(0);
      expect(screen.getByText("Persönliches Gespräch")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Zurück zum Bewerberprofil/ })).toBeInTheDocument();
      // Nichts mehr von der alten Moderation mit ihrem Zwischenstopp.
      expect(screen.queryByText(/Zwischenstopp/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Teil 2 jetzt direkt anschließen/)).not.toBeInTheDocument();
    });
  }

  it("ganz ohne Parameter gibt es einen ruhigen Hinweis statt eines Absturzes", async () => {
    zeichne("/closing-moderation");
    expect(await screen.findByText("Zu dieser Adresse gibt es keinen Bewerber.")).toBeInTheDocument();
  });

  it("öffnet die Präsentation ohne ablauf in der Adresse", async () => {
    const oeffnen = vi.spyOn(window, "open").mockReturnValue(null);
    zeichne("/closing-moderation?bewerberId=b1&teil=1&ablauf=neu");
    fireEvent.click(await screen.findByRole("button", { name: /Präsentation öffnen/ }));
    expect(oeffnen).toHaveBeenCalledTimes(1);
    const adresse = String(oeffnen.mock.calls[0][0]);
    expect(adresse.startsWith("/closing-praesentation-entwurf?bewerberId=b1")).toBe(true);
    expect(adresse).not.toContain("ablauf");
  });
});
