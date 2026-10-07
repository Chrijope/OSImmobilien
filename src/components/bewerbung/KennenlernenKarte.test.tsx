import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * Die Kennenlernen-Karte im Reiter Übersicht des neuen Bewerberprozesses.
 *
 * Sie ist der einzige Teil, den das bestehende Bewerbungsmanagement nicht hat,
 * und sie trägt die drei fertigen Bausteine, die beim Umbau nicht verloren
 * gehen dürfen: das Verschicken der Einladung, den Stand des Bogens und die
 * Erinnerungskette. Geprüft wird deshalb, dass alle drei aus der Akte heraus
 * erreichbar sind.
 */

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/confirm", () => ({ confirmDialog: vi.fn(async () => false) }));

/*
 * Der Bogen: mehrere Zeilen je Bewerber, absteigend nach created_at, über die
 * übliche Kette .select().eq().order().limit(). Mehrere sind es, weil jede
 * verschickte Einladung eine eigene Zeile anlegt; genau daran ist die alte
 * Prüfung gescheitert.
 */
let formularZeilen: Record<string, unknown>[] = [];

/*
 * Was die Function antwortet, und womit sie aufgerufen wurde. Beides braucht
 * der Test zum Versand: Der Nutzer soll erfahren, warum nichts hinausging.
 */
let invokeAntwort: { data: unknown; error: unknown } = {
  data: { ok: true, versandt: true },
  error: null,
};
const invokeAufrufe: Array<{ name: string; args: { body?: Record<string, unknown> } }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const kette = {
    select: () => kette,
    eq: () => kette,
    order: () => kette,
    limit: async () => ({ data: formularZeilen, error: null }),
  };
  return {
    supabase: {
      from: () => kette,
      functions: {
        invoke: vi.fn(async (name: string, args: { body?: Record<string, unknown> }) => {
          invokeAufrufe.push({ name, args });
          return invokeAntwort;
        }),
      },
    },
  };
});

// Die Termine liegen in einer anderen Tabelle und dürfen fehlen, solange die
// Migration 20260906120000 nicht gelaufen ist.
vi.mock("@/lib/bewerberTerminStore", () => ({ ladeBewerberBuchungen: async () => ({}) }));

/*
 * Die Einladung zum persönlichen Gespräch und die Absage.
 *
 * Beide gehen über eigene Module, damit die Karte weder den Zwischenspeicher
 * noch die Versandfunktion selbst kennen muss. Für den Test genügt, dass sie
 * an der richtigen Stelle und mit dem richtigen Token gerufen werden.
 */
let einladungAntwort: { ok: boolean; grund?: string } = { ok: true };
let einladungVermerkt = "";
const einladungsAufrufe: Array<{ id: string; token: string }> = [];
vi.mock("@/lib/bewerberEinladung", () => ({
  sendeKooperationsEinladung: vi.fn(async (b: { id: string }, token: string) => {
    einladungsAufrufe.push({ id: b.id, token });
    return einladungAntwort;
  }),
  vermerkeKooperationsEinladung: vi.fn(async (_id: string, zeitpunkt: string) => {
    einladungVermerkt = zeitpunkt;
  }),
  leseKooperationsEinladung: vi.fn(() => einladungVermerkt),
}));

let absageAntwort: { ok: boolean; grund?: string } = { ok: true };
const absageAufrufe: string[] = [];
vi.mock("@/lib/bewerberAbsageMail", () => ({
  sendeKennenlernAbsageMail: vi.fn(async (b: { id: string }) => {
    absageAufrufe.push(b.id);
    return absageAntwort;
  }),
}));

const statusWechsel: Array<{ id: string; status: string }> = [];
vi.mock("@/lib/bewerbungStore", () => ({
  changeBewerberStatus: vi.fn((id: string, status: string) => {
    statusWechsel.push({ id, status });
  }),
}));

import { KennenlernenKarte } from "./KennenlernenKarte";
import type { Bewerber } from "@/lib/bewerbungStore";
import { toast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { sendeKennenlernAbsageMail } from "@/lib/bewerberAbsageMail";

function bewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "b-1", vorname: "Max", nachname: "Muster",
    email: "max@example.org", status: "Eingang",
    ...teil,
  } as Bewerber;
}

beforeEach(() => {
  formularZeilen = [];
  invokeAufrufe.length = 0;
  invokeAntwort = { data: { ok: true, versandt: true }, error: null };
  einladungAntwort = { ok: true };
  einladungVermerkt = "";
  einladungsAufrufe.length = 0;
  absageAntwort = { ok: true };
  absageAufrufe.length = 0;
  statusWechsel.length = 0;
  vi.mocked(toast).mockClear();
  vi.mocked(confirmDialog).mockResolvedValue(false);
});

/** Die eine ausgefüllte Zeile, wie sie „Chris Test" hinterlassen hat. */
const AUSGEFUELLT = {
  token: "abc123", status: "eingereicht", antworten: { weg: "weg1" },
  created_at: "2026-09-01T10:00:00Z", expires_at: "2026-09-15T10:00:00Z",
};

/** Auf „Kennenlernen verschicken" klicken und die Rückfrage bejahen. */
async function verschicken() {
  vi.mocked(confirmDialog).mockResolvedValue(true);
  const knopf = await screen.findByRole("button", { name: /schicken/ });
  fireEvent.click(knopf);
  await waitFor(() => expect(invokeAufrufe.length).toBe(1));
}

/** Der zuletzt gezeigte Hinweis, als ein Text. */
function letzterHinweis(): string {
  const rufe = vi.mocked(toast).mock.calls;
  const letzter = rufe[rufe.length - 1]?.[0] as { title?: string; description?: string };
  return `${letzter?.title ?? ""} ${letzter?.description ?? ""}`;
}

describe("KennenlernenKarte", () => {
  it("bietet das Verschicken der Einladung an, solange nichts hinausging", async () => {
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    expect(await screen.findByRole("button", { name: /Kennenlernen verschicken/ })).toBeEnabled();
    expect(screen.getByText("Noch nicht verschickt")).toBeInTheDocument();
  });

  it("sperrt das Verschicken ohne Mailadresse", async () => {
    render(<KennenlernenKarte bewerber={bewerber({ email: "" })} canEdit />);
    expect(await screen.findByRole("button", { name: /Kennenlernen verschicken/ })).toBeDisabled();
  });

  it("zeigt den offenen Link samt Kopiermöglichkeit", async () => {
    formularZeilen = [{
      token: "abc123", status: "offen", antworten: { bogen: "kennenlernen" },
      created_at: "2026-09-01T10:00:00Z", expires_at: "2027-03-01T10:00:00Z",
    }];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Link offen")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Noch einmal schicken/ })).toBeInTheDocument();
  });

  it("zeigt den knappen Auszug und den passenden nächsten Schritt, sobald der Bogen ausgefüllt ist", async () => {
    formularZeilen = [{
      token: "abc123", status: "eingereicht",
      // `weg` ist das Merkmal, an dem `istKennenlernen` den neuen Bogen erkennt.
      antworten: { weg: "weg1", themen: ["verdienst"] },
      created_at: "2026-09-01T10:00:00Z", expires_at: "2026-09-15T10:00:00Z",
    }];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());
    expect(screen.getByText(/Minuten/)).toBeInTheDocument();
    // Der gewählte Weg und die Tagesordnung bleiben: Sie tragen den nächsten
    // Schritt, und nach ihnen sieht man beim Überfliegen der Akte.
    expect(screen.getByText(/Sein Weg/)).toBeInTheDocument();
    expect(screen.getByText(/Seine Tagesordnung/)).toBeInTheDocument();
  });

  /*
   * Die ausführliche Antwortliste stand bis zum 08.09.2026 zweimal in derselben
   * Akte: hier und im Reiter Videocall, dort sogar vollständiger. Hier bleibt
   * nur der Verweis.
   */
  it("zeigt die ausführliche Antwortliste nicht mehr, sondern verweist auf den Videocall", async () => {
    formularZeilen = [{
      token: "abc123", status: "eingereicht",
      antworten: { weg: "weg1", zeitProWoche: "vollzeit", gewerbe: "ja" },
      created_at: "2026-09-01T10:00:00Z", expires_at: "2026-09-15T10:00:00Z",
    }];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());

    // Die Gruppentitel des Überblicks und eine Antwort daraus dürfen hier
    // nicht mehr stehen.
    expect(screen.queryByText("So möchtest du starten")).not.toBeInTheDocument();
    expect(screen.queryByText("Das klären wir im Gespräch")).not.toBeInTheDocument();
    expect(screen.queryByText(/hauptberuflich machen/)).not.toBeInTheDocument();

    expect(screen.getByText(/Reiter Videocall/)).toBeInTheDocument();
  });

  it("nennt die Erinnerungskette immer, auch wenn noch nichts verschickt wurde", async () => {
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    expect(await screen.findByText("Und wenn nichts passiert")).toBeInTheDocument();
  });

  /*
   * Der Fehler bei Chris Test: Nach dem Ausfüllen ging noch einmal eine
   * Einladung hinaus. Die jüngste Zeile ist damit leer, und die Karte behauptete
   * „Noch nicht verschickt", obwohl der Bogen vorliegt.
   */
  it("erkennt den ausgefüllten Bogen auch nach einer erneuten Einladung", async () => {
    formularZeilen = [
      {
        token: "neu-999", status: "offen", antworten: { bogen: "kennenlernen" },
        created_at: "2026-09-05T09:00:00Z", expires_at: "2027-03-05T09:00:00Z",
      },
      {
        token: "abc123", status: "eingereicht", antworten: { weg: "weg1" },
        created_at: "2026-09-01T10:00:00Z", expires_at: "2026-09-15T10:00:00Z",
      },
    ];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());
    expect(screen.getByText(/Minuten/)).toBeInTheDocument();
  });

  /*
   * Der Fehler, an dem die Vorführung an „Chris Test" gescheitert ist: Sein
   * Kennenlernen lag ausgefüllt vor, und die Function lehnte jeden weiteren
   * Versand mit „bereits ausgefuellt" ab. Ein ausdrücklich bestätigter Klick
   * aus der Akte heraus soll durchgehen.
   */
  it("schickt auf ausdrückliche Bestätigung auch dann, wenn der Bogen vorliegt", async () => {
    formularZeilen = [AUSGEFUELLT];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());
    await verschicken();
    expect(invokeAufrufe[0].args.body).toEqual({ bewerbungId: "b-1", erneutSenden: true });
  });

  it("sagt beim ersten Versand ausdrücklich, dass es keine Wiederholung ist", async () => {
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await verschicken();
    expect(invokeAufrufe[0].args.body).toEqual({ bewerbungId: "b-1", erneutSenden: false });
  });

  it("meldet „Noch einmal schicken“ als ausdrückliche Wiederholung, auch bei offenem Bogen", async () => {
    formularZeilen = [{
      token: "abc123", status: "offen", antworten: { bogen: "kennenlernen" },
      created_at: "2026-09-01T10:00:00Z", expires_at: "2027-03-01T10:00:00Z",
    }];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await screen.findByRole("button", { name: /Noch einmal schicken/ });
    await verschicken();
    expect(invokeAufrufe[0].args.body).toEqual({ bewerbungId: "b-1", erneutSenden: true });
  });

  /*
   * Der Fehler vom 15.09.2026: Bewerber aus dem Altbestand hatten nur den
   * früheren Vorabbogen bekommen. Dessen Zeile ist die jüngste, und die Karte
   * baute daraus einen Kennenlern-Link, der auf „abgelaufen" lief.
   */
  describe("Altbestand mit dem früheren Vorabbogen", () => {
    /** Der Vorabbogen legt seine Zeile ohne Antworten an, und sie ist längst abgelaufen. */
    const VORABBOGEN = {
      token: "vorab-alt", status: "offen", antworten: {},
      created_at: "2026-08-01T10:00:00Z", expires_at: "2026-08-15T10:00:00Z",
    };

    /** Die Zwischenablage, wie jsdom sie nicht hat. */
    function zwischenablage(): string[] {
      const geschrieben: string[] = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (t: string) => { geschrieben.push(t); } },
      });
      return geschrieben;
    }

    it("hält den Vorabbogen nicht für die Einladung zum Kennenlernen", async () => {
      formularZeilen = [VORABBOGEN];
      render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
      expect(await screen.findByText("Noch nicht verschickt")).toBeInTheDocument();
      expect(screen.getByText(/nur der frühere Vorabbogen/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Kennenlernen verschicken/ })).toBeEnabled();
      // Kopieren und Ansehen bleiben, sie erzeugen bei Bedarf einen Link.
      expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /So sieht es aus/ })).toBeInTheDocument();
    });

    it("erzeugt bei „Link kopieren“ still einen neuen Kennenlern-Link, ohne Mail", async () => {
      formularZeilen = [VORABBOGEN];
      invokeAntwort = {
        data: { ok: true, link: "https://portal.more.immo/kennenlernen/neu-1" },
        error: null,
      };
      const geschrieben = zwischenablage();
      render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
      fireEvent.click(await screen.findByRole("button", { name: /Link kopieren/ }));
      await waitFor(() => expect(geschrieben).toEqual(["https://portal.more.immo/kennenlernen/neu-1"]));
      expect(invokeAufrufe[0].name).toBe("send-bewerber-kennenlernen");
      expect(invokeAufrufe[0].args.body).toEqual({ bewerbungId: "b-1", nurLink: true, ohneMail: true });
      expect(letzterHinweis()).toMatch(/Neuer Link erzeugt/);
    });

    it("kopiert einen gültigen Link, ohne einen neuen zu erzeugen", async () => {
      formularZeilen = [
        {
          token: "kl-1", status: "offen", antworten: { bogen: "kennenlernen" },
          created_at: "2026-09-10T10:00:00Z", expires_at: "2027-03-09T10:00:00Z",
        },
        VORABBOGEN,
      ];
      const geschrieben = zwischenablage();
      render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
      fireEvent.click(await screen.findByRole("button", { name: /Link kopieren/ }));
      await waitFor(() => expect(geschrieben).toEqual(["https://portal.more.immo/kennenlernen/kl-1"]));
      expect(invokeAufrufe).toHaveLength(0);
    });

    it("bietet ohne Bearbeitungsrecht keinen Knopf an, der einen Link erzeugen würde", async () => {
      formularZeilen = [VORABBOGEN];
      render(<KennenlernenKarte bewerber={bewerber()} canEdit={false} />);
      expect(await screen.findByText("Noch nicht verschickt")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Link kopieren/ })).not.toBeInTheDocument();
    });

    it("zeigt einen abgelaufenen Kennenlern-Link als abgelaufen, nicht als offen", async () => {
      formularZeilen = [{
        token: "kl-alt", status: "offen", antworten: { bogen: "kennenlernen" },
        created_at: "2026-03-01T10:00:00Z", expires_at: "2026-08-28T10:00:00Z",
      }];
      render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
      expect(await screen.findByText("Link abgelaufen")).toBeInTheDocument();
    });
  });

  it("nennt die Sperrliste, wenn der Link steht, die Mail aber nicht hinausging", async () => {
    invokeAntwort = {
      data: { ok: true, versandt: false, versandGrund: "Adresse steht auf der Sperrliste" },
      error: null,
    };
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await verschicken();
    await waitFor(() => expect(letzterHinweis()).toMatch(/Sperrliste/));
  });

  it("gibt den Grund einer abgelehnten Einladung im Klartext weiter", async () => {
    invokeAntwort = {
      data: { ok: false, grund: "Am Bewerber steht keine E-Mail-Adresse." },
      error: null,
    };
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await verschicken();
    await waitFor(() => expect(letzterHinweis()).toMatch(/keine E-Mail-Adresse/));
  });

  it("stürzt nicht ab, wenn die Tabelle fehlt", async () => {
    formularZeilen = [];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    expect(await screen.findByText("Kennenlernen")).toBeInTheDocument();
  });

  /**
   * Die Rechteprüfung am Versandknopf (08.09.2026).
   *
   * Er löst eine echte Mail an einen Bewerber aus und hing bis dahin an
   * keiner Prüfung. Jetzt gilt dieselbe wie an den beiden Knöpfen darunter:
   * `kannBewerberVerwalten`, also HR, Admin und Inhaber. Der ausgeblendete
   * Knopf ist dabei nur die halbe Miete, die andere Hälfte ist die Prüfung im
   * Klickbehandler und die Zugriffskontrolle in der Function.
   */
  it("zeigt den Versandknopf nur einem Konto mit Bearbeitungsrecht", async () => {
    render(<KennenlernenKarte bewerber={bewerber()} canEdit={false} />);
    // Die Karte selbst bleibt lesbar, nur der Knopf ist weg.
    expect(await screen.findByText("Kennenlernen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kennenlernen verschicken/ })).not.toBeInTheDocument();
  });

  it("lässt auch den Link nur lesen, wenn das Bearbeitungsrecht fehlt", async () => {
    formularZeilen = [{
      token: "abc123", status: "offen", antworten: { bogen: "kennenlernen" },
      created_at: "2026-09-01T10:00:00Z", expires_at: "2027-03-01T10:00:00Z",
    }];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit={false} />);
    await waitFor(() => expect(screen.getByText("Link offen")).toBeInTheDocument());
    // Kopieren und Ansehen bleiben, das ist Lesen.
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Noch einmal schicken/ })).not.toBeInTheDocument();
  });
});

/**
 * Die beiden Knöpfe, mit denen über einen Bewerber entschieden wird.
 *
 * Sie ersetzen die Selbstbuchung am Ende des Kennenlernbogens: Nicht mehr der
 * Bewerber sucht sich unaufgefordert einen Termin, sondern wir laden ein,
 * nachdem wir seine Antworten gelesen haben. Der zweite Ausgang derselben
 * Entscheidung ist die Absage.
 */
describe("Einladen und Absagen aus der Akte", () => {
  /** Ein eingereichter Bogen, die Voraussetzung für beide Knöpfe. */
  const EINGEREICHT = {
    token: "tok-42", status: "eingereicht", antworten: { weg: "weg1" },
    created_at: "2026-09-01T10:00:00Z", expires_at: "2026-09-15T10:00:00Z",
  };

  /** Den Knopf drücken und die Rückfrage bejahen. */
  async function bestaetige(name: RegExp) {
    vi.mocked(confirmDialog).mockResolvedValue(true);
    fireEvent.click(await screen.findByRole("button", { name }));
  }

  it("zeigt beide Knöpfe erst, wenn ein eingereichter Bogen vorliegt", async () => {
    formularZeilen = [{
      token: "tok-42", status: "offen", antworten: { bogen: "kennenlernen" },
      created_at: "2026-09-01T10:00:00Z", expires_at: "2027-03-01T10:00:00Z",
    }];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Link offen")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /persönlichen Gespräch einladen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Absagen/ })).not.toBeInTheDocument();
  });

  /*
   * Ein ausgeblendeter Knopf ist keine Zugriffskontrolle, das bleibt die
   * Zeilensicherheit. Er verhindert aber, dass jemand mit reinem Leserecht
   * eine echte Mail an einen Bewerber auslöst.
   */
  it("bleibt für ein Konto ohne Bearbeitungsrecht unsichtbar", async () => {
    formularZeilen = [EINGEREICHT];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit={false} />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /persönlichen Gespräch einladen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Absagen/ })).not.toBeInTheDocument();
  });

  it("verschickt die Einladung mit dem Token des eingereichten Bogens", async () => {
    formularZeilen = [EINGEREICHT];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());

    await bestaetige(/persönlichen Gespräch einladen/);
    await waitFor(() => expect(einladungsAufrufe.length).toBe(1));
    // Dasselbe Token wie beim Kennenlernen. Ein eigenes wäre ein zweiter
    // Buchungsmechanismus mit einer zweiten Gültigkeit.
    expect(einladungsAufrufe[0]).toEqual({ id: "b-1", token: "tok-42" });
  });

  /*
   * Ging nach dem Ausfüllen noch einmal eine Einladung hinaus, ist die jüngste
   * Zeile leer. Ihr Token führte auf eine Buchungsseite, die sagt „sobald deine
   * Angaben bei uns sind", obwohl sie längst da sind.
   */
  it("nimmt das Token der eingereichten Zeile, nicht das der jüngsten", async () => {
    formularZeilen = [
      {
        token: "neu-999", status: "offen", antworten: { bogen: "kennenlernen" },
        created_at: "2026-09-05T09:00:00Z", expires_at: "2027-03-05T09:00:00Z",
      },
      EINGEREICHT,
    ];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());

    await bestaetige(/persönlichen Gespräch einladen/);
    await waitFor(() => expect(einladungsAufrufe.length).toBe(1));
    expect(einladungsAufrufe[0].token).toBe("tok-42");
  });

  it("vermerkt den Versand und beschriftet den Knopf danach als Wiederholung", async () => {
    formularZeilen = [EINGEREICHT];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());

    await bestaetige(/persönlichen Gespräch einladen/);
    await waitFor(() => expect(einladungVermerkt).not.toBe(""));
    // Ein zweiter Versand bleibt möglich, Mails gehen verloren. Er ist aber
    // sichtbar eine Wiederholung.
    expect(await screen.findByRole("button", { name: /Einladung noch einmal schicken/ })).toBeEnabled();
  });

  it("meldet einen gescheiterten Versand und vermerkt dann nichts", async () => {
    formularZeilen = [EINGEREICHT];
    einladungAntwort = { ok: false, grund: "Adresse steht auf der Sperrliste" };
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());

    await bestaetige(/persönlichen Gespräch einladen/);
    await waitFor(() => expect(letzterHinweis()).toMatch(/Sperrliste/));
    expect(einladungVermerkt).toBe("");
  });

  it("lädt ohne Mailadresse gar nicht erst ein", async () => {
    formularZeilen = [EINGEREICHT];
    render(<KennenlernenKarte bewerber={bewerber({ email: "" })} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /persönlichen Gespräch einladen/ })).toBeDisabled();
  });

  it("verschickt beim Absagen die Fassung ohne Gespräch und setzt Abgelehnt", async () => {
    formularZeilen = [EINGEREICHT];
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());

    await bestaetige(/Absagen, weil es nicht passt/);
    await waitFor(() => expect(statusWechsel.length).toBe(1));
    // Ausdrücklich `sendeKennenlernAbsageMail` und nicht die Absage des
    // Videocalls: Die spricht von „unserem Gespräch", und geführt wurde keines.
    expect(vi.mocked(sendeKennenlernAbsageMail)).toHaveBeenCalled();
    expect(absageAufrufe).toEqual(["b-1"]);
    expect(statusWechsel[0]).toEqual({ id: "b-1", status: "Abgelehnt" });
  });

  /*
   * Der Statuswechsel darf am Mailversand nicht scheitern. Sonst steht der
   * Bewerber weiter im laufenden Prozess, obwohl die Entscheidung gefallen ist,
   * und die nächste Erinnerung geht an jemanden, dem gerade abgesagt wurde.
   */
  it("setzt Abgelehnt auch dann, wenn die Absagemail nicht hinausgeht", async () => {
    formularZeilen = [EINGEREICHT];
    absageAntwort = { ok: false, grund: "Adresse unbekannt" };
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());

    await bestaetige(/Absagen, weil es nicht passt/);
    await waitFor(() => expect(statusWechsel.length).toBe(1));
    expect(statusWechsel[0].status).toBe("Abgelehnt");
    expect(letzterHinweis()).toMatch(/Adresse unbekannt/);
  });

  it("tut nichts, wenn die Rückfrage verneint wird", async () => {
    formularZeilen = [EINGEREICHT];
    vi.mocked(confirmDialog).mockResolvedValue(false);
    render(<KennenlernenKarte bewerber={bewerber()} canEdit />);
    await waitFor(() => expect(screen.getByText("Ausgefüllt")).toBeInTheDocument());

    // Die Aufrufzählung wird zwischen den Prüfungen nicht zurückgesetzt, nur
    // die Antwort. Deshalb hier ausdrücklich leeren.
    vi.mocked(confirmDialog).mockClear();
    fireEvent.click(screen.getByRole("button", { name: /persönlichen Gespräch einladen/ }));
    fireEvent.click(screen.getByRole("button", { name: /Absagen, weil es nicht passt/ }));
    await waitFor(() => expect(vi.mocked(confirmDialog)).toHaveBeenCalledTimes(2));
    expect(einladungsAufrufe.length).toBe(0);
    expect(absageAufrufe.length).toBe(0);
    expect(statusWechsel.length).toBe(0);
  });
});
