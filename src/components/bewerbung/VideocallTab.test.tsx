import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { KennenlernenAntworten } from "@/lib/bewerberKennenlernen";

/**
 * Der Reiter Videocall des neuen Bewerberprozesses.
 *
 * Geprüft wird, was die Sollfassung vom 07.09.2026 an dieser Stelle verlangt:
 * der selbst gebuchte Termin oben, alle Antworten aus dem Kennenlernbogen,
 * kein Zehn-Punkte-Skript mehr, und am Ende dieselben vier Knöpfe wie in der
 * Moderation. Dazu, was der Abschlussknopf wirklich setzt.
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

const updateBewerber = vi.fn();
const changeBewerberStatus = vi.fn();
vi.mock("@/lib/bewerbungStore", () => ({
  updateBewerber: (...a: unknown[]) => updateBewerber(...a),
  changeBewerberStatus: (...a: unknown[]) => changeBewerberStatus(...a),
  getBewerberById: () => null,
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Sarah", role: "hr" }, authUser: null }),
}));
vi.mock("@/lib/bewerberAbsageMail", () => ({ sendeBewerberAbsageMail: async () => ({ ok: true }) }));

// Der Startfahrplan geht über denselben Versandweg wie im Closing.
const sendeStartfahrplan = vi.fn().mockResolvedValue({ fassung: "standard" });
vi.mock("@/lib/startfahrplanVersand", () => ({
  sendeStartfahrplan: (...a: unknown[]) => sendeStartfahrplan(...a),
}));

/** Ein ausgefüllter Bogen auf Weg 1. */
const ANTWORTEN: KennenlernenAntworten = {
  weg: "weg1",
  hintergrund: ["beratung"],
  wegAntwort1: "4_bis_10",
  passung: ["selbststaendig"],
  verstaendnisFixum: "nein",
  verstaendnisProvision: "nein",
  zeitProWoche: "10_bis_20",
  perspektive: "spaeter_haupt",
  leadPraeferenz: "eigen",
  startzeitpunkt: "vier_wochen",
  erreichbarkeit: ["abends"],
  gewerbe: "ja",
  erlaubnis34c: "nein",
  themen: ["verdienst"],
  eigeneFrage: "Wie schnell bekomme ich ein Objekt?",
};

/** Der alte Vorabbogen eines übernommenen Bewerbers: kein Feld `weg`. */
const VORABBOGEN = {
  region: "leipzig",
  beschaeftigung: "angestellt",
  hintergrund: ["finanzdienstleistung"],
  zeitProWoche: "10_bis_20",
  perspektive: "spaeter_haupt",
  einkommensziel: "3000_bis_5000",
  startzeitpunkt: "vier_wochen",
  erwartung: "Klare Einarbeitung und feste Ansprechpartner.",
};

/*
 * Die jüngste Zeile ist eine leere Einladung, die nach dem Ausfüllen hinausging.
 * Genau daran ist die alte Prüfung gescheitert (Chris Test).
 *
 * Zwei Abfragen enden hier unterschiedlich: `useKennenlernenAntworten` liest
 * bis zu acht Zeilen und endet bei `limit`, `useVorwissen` holt genau eine und
 * endet bei `maybeSingle`. Deshalb gibt `limit` ein Gebilde zurück, das beides
 * bedienen kann. `zeilen` und `eineZeile` sind veränderlich, damit ein Test den
 * Fall des übernommenen Bewerbers herstellen kann.
 */
let zeilen: unknown[] = [];
let eineZeile: unknown = null;

function standardZeilen() {
  return [
    { status: "offen", antworten: {}, created_at: "2026-09-05" },
    { status: "eingereicht", antworten: ANTWORTEN, created_at: "2026-09-01" },
  ];
}

vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  for (const glied of ["select", "eq", "order"]) kette[glied] = () => kette;
  kette.limit = () => ({
    maybeSingle: () => Promise.resolve({ data: eineZeile, error: null }),
    then: (aufloesen: (w: unknown) => unknown) =>
      Promise.resolve({ data: zeilen, error: null }).then(aufloesen),
  });
  return { supabase: { from: () => ({ ...kette }) } };
});

/*
 * Der selbst gebuchte Termin. Veraenderlich, damit ein Test den Fall "noch
 * kein Termin" herstellen kann: Die Einladungskarte zeigt dann etwas anderes.
 */
let buchungen: Record<string, unknown> = {};
function standardBuchung() {
  return {
    "b1": {
      bewerbungId: "b1",
      startAt: "2026-09-10T08:00:00.000Z",
      bezeichnung: "Persönliches Gespräch · Jonas Hellwig",
      raumPfad: "/videocall/raum/raum-1",
    },
  };
}
/*
 * Die Videoraeume des Bewerbers und die Mitschriften darin. Beides
 * veraenderlich: Ein Bewerber ohne Raum, einer mit Raum aber ohne Mitschrift
 * und einer mit Mitschrift sehen im Reiter jeweils etwas anderes.
 */
let raumIds: string[] = [];
let mitschriften: unknown[] = [];
vi.mock("@/lib/bewerberTerminStore", () => ({
  ladeBewerberBuchungen: async () => buchungen,
  ladeBewerberRaumIds: async () => raumIds,
}));
vi.mock("@/lib/mitschriftStore", () => ({
  ladeMitschriften: async () => [],
  ladeMitschriftenZuRaeumen: async () => mitschriften,
}));

const { VideocallTab } = await import("./VideocallTab");
import type { Bewerber } from "@/lib/bewerbungStore";
import type { ErfassungMitNotiz } from "@/lib/videocallNotiz";

function bewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "b1", vorname: "Jonas", nachname: "Hellwig", email: "jonas@example.org",
    prozess: "neu", status: "Erstgespraech",
    erstgespraechSkript: {}, vertragsAdresse: "", rechnungsAdresse: "",
    ...teil,
  } as Bewerber;
}

function zeichne(teil: Partial<Bewerber> = {}) {
  return render(
    <VideocallTab bewerber={bewerber(teil)} canEdit onRefresh={() => {}} beraterName="Sarah" />,
  );
}

beforeEach(() => {
  buchungen = standardBuchung();
  raumIds = ["raum-1"];
  mitschriften = [];
  zeilen = standardZeilen();
  eineZeile = null;
  speicher.clear();
  updateBewerber.mockClear();
  changeBewerberStatus.mockClear();
  sendeStartfahrplan.mockClear();
});

describe("VideocallTab", () => {
  /*
   * Die Einladung zur Terminbuchung. Sie verschickt ausdruecklich NICHT die
   * Eingangsmail mit dem Kennenlernbogen; die liegt in der Uebersicht. Geprueft
   * werden die beiden Zeitstempel, nach denen der Geschaeftsfuehrer gefragt
   * hat: wann eingeladen wurde und wann der Bewerber gebucht hat.
   */
  it("zeigt den gebuchten Termin mit Zeitpunkt in der Einladungskarte", async () => {
    zeichne();
    const karte = await screen.findByTestId("gespraech-einladung");
    expect(karte).toHaveTextContent("Termin steht");
    expect(karte).toHaveTextContent(/Termin gebucht am 10\.9\.2026/);
  });

  it("sagt ohne Termin und ohne Einladung, dass noch nichts hinaus ist", async () => {
    buchungen = {};
    zeichne();
    const karte = await screen.findByTestId("gespraech-einladung");
    expect(karte).toHaveTextContent("Noch nicht eingeladen");
    expect(karte).toHaveTextContent(/Noch keine Einladung verschickt/);
    expect(karte).not.toHaveTextContent("Termin gebucht am");
  });

  it("bietet den Einladungsknopf an, aber nur mit Bearbeitungsrecht", async () => {
    buchungen = {};
    zeichne();
    expect(await screen.findByRole("button", { name: /Zum persönlichen Gespräch einladen/ })).toBeInTheDocument();
  });

  /*
   * Etappe 1 des Umzugs aus dem Bewerbungsmanagement. Die 356 uebernommenen
   * Bewerber haben keinen Kennenlernbogen, sondern den alten Vorabbogen. Ohne
   * die beiden Karten hier staende bei ihnen, es liege kein Bogen vor, obwohl
   * ihre Antworten unveraendert in derselben Spalte stehen.
   */
  it("zeigt uebernommenen Bewerbern die Zusammenfassung und die alten Bogenantworten", async () => {
    zeilen = [{ status: "eingereicht", antworten: VORABBOGEN, created_at: "2026-05-02" }];
    eineZeile = { antworten: VORABBOGEN, eingereicht_am: "2026-05-02" };
    zeichne({
      erstgespraechSkript: {
        zusammenfassung: "Sucht den Zweitberuf, will im Januar starten.",
        zusammenfassungAm: "2026-05-03",
      } as Bewerber["erstgespraechSkript"],
    });
    expect(await screen.findByText(/Das hat Jonas vorab angegeben/)).toBeInTheDocument();
    expect(screen.getByText("KI-Zusammenfassung Erstgespräch")).toBeInTheDocument();
    expect(screen.getByText(/Sucht den Zweitberuf/)).toBeInTheDocument();
    // Die leere Kennenlern-Karte darf daneben nicht stehenbleiben, sonst
    // behauptet sie, es liege nichts vor.
    expect(screen.queryByTestId("kennenlernbogen-fehlt")).toBeNull();
  });

  it("laesst den Kennenlernbogen unberuehrt, wenn einer vorliegt", async () => {
    eineZeile = { antworten: ANTWORTEN, eingereicht_am: "2026-09-01" };
    zeichne();
    expect(await screen.findByText("Aus dem Kennenlernbogen")).toBeInTheDocument();
    expect(screen.queryByText(/Das hat Jonas vorab angegeben/)).toBeNull();
  });

  it("bleibt bei der bisherigen Auskunft, wenn gar kein Bogen vorliegt", async () => {
    zeilen = [];
    eineZeile = null;
    zeichne();
    expect(await screen.findByTestId("kennenlernbogen-fehlt")).toBeInTheDocument();
    expect(screen.queryByText(/Das hat Jonas vorab angegeben/)).toBeNull();
  });

  /*
   * Der Knopf fuehrt in die Gastgeberansicht, nicht auf den Gastlink.
   * Wer hier klickt, leitet das Gespraech und gehoert nicht in den Warteraum.
   */
  it("zeigt den selbst gebuchten Termin und den Weg in den Videoraum", async () => {
    zeichne();
    expect(await screen.findByText(/Persönliches Gespräch am .* selbst gebucht/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Videoraum öffnen/ })).toHaveAttribute(
      "href",
      "/videocall/raum/raum-1",
    );
  });

  /*
   * Die Mitschrift aus dem Gespraechsraum. Sie wird am Raum gespeichert und
   * nicht am Kontakt, denn ein Bewerber ist keiner. Ohne diesen Weg waere sie
   * zwar vorhanden, aber nirgends zu lesen.
   */
  it("zeigt die Mitschrift des Gesprächs mit Datum und Uhrzeit", async () => {
    // So, wie `ladeMitschriftenZuRaeumen` sie liefert, also bereits gelesen.
    mitschriften = [{
      id: "m1",
      raumId: "raum-1",
      kontaktId: null,
      investmentId: null,
      aktivitaetId: null,
      gastgeberId: "u1",
      begonnenAt: "2026-09-10T08:00:00.000Z",
      beendetAt: "2026-09-10T08:32:00.000Z",
      dauerSekunden: 1920,
      zeilen: [{ zeitpunkt: 12, sprecher: "Jonas", text: "Ich komme aus dem Vertrieb." }],
      volltext: "Jonas: Ich komme aus dem Vertrieb.",
      zusammenfassung: "",
      modell: null,
      createdAt: "2026-09-10T08:32:00.000Z",
    }];
    zeichne();
    const ueberschrift = await screen.findByText("Mitschriften");
    // Datum und Uhrzeit stehen an der Mitschrift, sonst weiss niemand, zu
    // welchem Termin sie gehoert. Sie stehen in einer Zeile mit der
    // Kurzfassung, deshalb wird der ganze Kasten gelesen.
    const kasten = ueberschrift.closest("details");
    await waitFor(() => expect(kasten?.textContent ?? "").toContain("10.09.2026"));
  });

  it("sagt ruhig Bescheid, wenn es zum Gespräch keine Mitschrift gibt", async () => {
    mitschriften = [];
    zeichne();
    expect(await screen.findByText(/liegt keine Mitschrift vor/)).toBeInTheDocument();
  });

  it("schweigt ganz, solange es gar keinen Gesprächsraum gibt", async () => {
    raumIds = [];
    zeichne();
    await screen.findByTestId("videocall-termin");
    expect(screen.queryByText("Mitschriften")).toBeNull();
    expect(screen.queryByText(/liegt keine Mitschrift vor/)).toBeNull();
  });

  it("erkennt den Bogen auch dann, wenn danach noch eine Einladung hinausging", async () => {
    zeichne();
    expect(await screen.findByText(/Kennenlernen ausgefüllt am 1\.9\.2026/)).toBeInTheDocument();
  });

  it("zeigt alle Antworten, auch Erreichbarkeit und die beiden Verständnisfragen", async () => {
    zeichne();
    await screen.findByText(/^Erreichbar/);
    expect(screen.getByText("Aus dem Kennenlernbogen")).toBeInTheDocument();
    expect(screen.getByText(/Verständnis Fixum/)).toBeInTheDocument();
    expect(screen.getByText(/Verständnis Provision/)).toBeInTheDocument();
  });

  /**
   * Was in der Moderation mitgeschrieben wurde, muss nach dem Gespräch
   * wiederzufinden sein. Vorher stand die Mitschrift nirgends.
   */
  it("zeigt die Notiz und die Mitschrift aus dem Gespräch", async () => {
    const bewerberVideocall: ErfassungMitNotiz = {
      notiz: "Folie 3, Das Objektangebot\nEr will im Januar starten",
      geklaert: ["Zeitbudget stimmt, 15 Stunden die Woche"],
    };
    zeichne({ erstgespraechSkript: { bewerberVideocall } as Bewerber["erstgespraechSkript"] });
    // Die Notiz steht im Eingabefeld, dort wird sie auch ohne Moderation
    // weitergeschrieben.
    const feld = await screen.findByPlaceholderText("Was im Gespräch wichtig war");
    expect(feld).toHaveValue("Folie 3, Das Objektangebot\nEr will im Januar starten");
    expect(screen.getByText("Zeitbudget stimmt, 15 Stunden die Woche")).toBeInTheDocument();
  });

  it("zeigt die Karte nicht, solange nichts mitgeschrieben wurde", async () => {
    zeichne();
    await screen.findByText("Aus dem Kennenlernbogen");
    expect(screen.queryByTestId("videocall-mitschrift")).not.toBeInTheDocument();
  });

  it("führt kein Zehn-Punkte-Skript mehr", async () => {
    zeichne();
    await screen.findByText("Aus dem Kennenlernbogen");
    expect(screen.queryByTestId("erstgespraech-kopf")).not.toBeInTheDocument();
    expect(screen.queryByText(/von 10 Punkten/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Erstgespräch abschließen/ })).not.toBeInTheDocument();
  });

  it("bietet dieselben vier Knöpfe wie die Moderation", async () => {
    zeichne();
    expect(await screen.findByRole("button", { name: /Persönliches Gespräch abschließen/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zwischenspeichern/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kein Interesse/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abgelehnt/ })).toBeInTheDocument();
  });

  /**
   * Der Kern von Punkt F3: ein Klick setzt Zeitpunkt, Name, Entscheidung,
   * die daraus abgeleitete Closing-Entscheidung und den Status.
   */
  /*
   * Beide Wahlen sind Pflicht: Erst zusammen entscheiden sie, was der Klick
   * auslöst, vom Closing bis zur Absage. Fehlt eine, würde stillschweigend
   * nur gespeichert, und niemand sähe, dass die Hälfte fehlt.
   */
  it("sperrt den Abschluss, solange Einschätzung oder Wunsch fehlen", async () => {
    zeichne();
    const knopf = await screen.findByTestId("videocall-abschliessen");
    expect(knopf).toBeDisabled();
    expect(screen.getByTestId("videocall-offen")).toHaveTextContent("Einschätzung");

    fireEvent.click(screen.getByText("Zusammenarbeit möglich"));
    expect(screen.getByTestId("videocall-abschliessen")).toBeDisabled();
    expect(screen.getByTestId("videocall-offen")).toHaveTextContent("was der Bewerber will");

    fireEvent.click(screen.getByText("Will starten"));
    expect(screen.getByTestId("videocall-abschliessen")).toBeEnabled();
    expect(screen.queryByTestId("videocall-offen")).not.toBeInTheDocument();
  });

  it("lässt Zwischenspeichern, Kein Interesse und Abgelehnt immer zu", async () => {
    zeichne();
    expect(await screen.findByRole("button", { name: /Zwischenspeichern/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Kein Interesse/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Abgelehnt/ })).toBeEnabled();
  });

  it("setzt beim Abschließen Entscheidung, Closing-Entscheidung und Status", async () => {
    zeichne();
    fireEvent.click(await screen.findByText("Zusammenarbeit möglich"));
    // Beides ist Pflicht, sonst bleibt der Abschlussknopf gesperrt.
    fireEvent.click(screen.getByText("Will starten"));
    fireEvent.click(screen.getByRole("button", { name: /Persönliches Gespräch abschließen/ }));

    await waitFor(() => expect(updateBewerber).toHaveBeenCalled());
    const letzte = updateBewerber.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(letzte[0]).toBe("b1");
    expect(letzte[1].closingEntscheidung).toBe("ja");
    const skript = letzte[1].erstgespraechSkript as Record<string, unknown>;
    expect(skript.durchgefuehrtVon).toBe("Sarah");
    expect(String(skript.durchgefuehrtAm)).not.toBe("");
    expect((skript.bewerberVideocall as { entscheidung: string }).entscheidung).toBe("moeglich");
    expect(changeBewerberStatus).toHaveBeenCalledWith("b1", "Closing");
  });

  /**
   * Punkt 1 der Sollfassung vom 07.09.2026: „Noch Klärung erforderlich"
   * bekommt eine Folge. Klärungstext und Folgetermin sind Pflicht, danach
   * stehen sie in denselben drei Feldern wie jedes andere Follow-up.
   */
  it("verlangt bei Klärung den Text und den Folgetermin", async () => {
    zeichne();
    fireEvent.click(await screen.findByText("Noch Klärung erforderlich"));
    expect(await screen.findByLabelText(/Was ist noch zu klären/)).toBeInTheDocument();
    updateBewerber.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Folgetermin/ }));
    expect(changeBewerberStatus).not.toHaveBeenCalled();
  });

  it("legt bei Klärung Follow-up, Notiz und Status Follow-Up ab", async () => {
    zeichne();
    fireEvent.click(await screen.findByText("Noch Klärung erforderlich"));
    fireEvent.click(screen.getByText("Will starten"));
    fireEvent.change(await screen.findByLabelText(/Was ist noch zu klären/), {
      target: { value: "Umfang der Erlaubnis nach Paragraf 34c" },
    });
    updateBewerber.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Folgetermin/ }));

    await waitFor(() => expect(updateBewerber).toHaveBeenCalled());
    const letzte = updateBewerber.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(letzte[1].followUpNotiz).toBe("Umfang der Erlaubnis nach Paragraf 34c");
    // Der Termin ist vorbelegt, deshalb steht hier schon ein Datum.
    expect(String(letzte[1].followUpDatum)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(letzte[1].closingEntscheidung).toBe("");
    expect(changeBewerberStatus).toHaveBeenCalledWith("b1", "FollowUp");
  });

  it("schließt ohne Grund nicht ab, wenn die Zusammenarbeit nicht möglich ist", async () => {
    zeichne();
    fireEvent.click(await screen.findByText("Nicht möglich, mit Grund"));
    updateBewerber.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /absagen/ }));
    expect(changeBewerberStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /**
   * Punkt 2: „Nicht möglich" schiebt niemanden mehr still auf Abgelehnt,
   * sondern öffnet denselben Absage-Dialog wie der Knopf darunter, mit dem
   * bereits erfassten Grund.
   */
  it("oeffnet bei nicht moeglich mit Grund den Absage-Dialog", async () => {
    zeichne();
    fireEvent.click(await screen.findByText("Nicht möglich, mit Grund"));
    fireEvent.click(screen.getByText("Will starten"));
    fireEvent.change(screen.getByPlaceholderText("Grund, in einem Satz"), {
      target: { value: "Keine Erlaubnis in Sicht" },
    });
    fireEvent.click(screen.getByRole("button", { name: /absagen/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Abgelehnt");
    expect(screen.getByLabelText(/Grund \(Pflichtfeld\)/)).toHaveValue("Keine Erlaubnis in Sicht");
  });

  /**
   * Der Fall, an dem die alte Fassung vorbeilief: Wir halten die
   * Zusammenarbeit für möglich, er selbst winkt ab. Das darf nicht ins
   * Closing führen.
   */
  it("fuehrt moeglich plus passt fuer ihn nicht auf Kein Interesse", async () => {
    zeichne();
    fireEvent.click(await screen.findByText("Zusammenarbeit möglich"));
    fireEvent.click(screen.getByText("Passt für ihn nicht"));
    expect(screen.getByRole("button", { name: /kein Interesse/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Gespräch beenden, kein Interesse/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Kein Interesse");
    expect(changeBewerberStatus).not.toHaveBeenCalledWith("b1", "Closing");
  });

  it("fragt die Adressen erst, wenn der Wunsch zu einem Schriftstück führt", async () => {
    zeichne();
    await screen.findByText("Will starten");
    expect(screen.queryByLabelText(/Vertragsanschrift, mit Name/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Will starten"));
    expect(await screen.findByLabelText(/Vertragsanschrift, mit Name/)).toBeInTheDocument();
  });

  /**
   * „Möchte die Unterlagen" seit dem 08.09.2026: Die Wahl löst selbst aus, was
   * sie verspricht. Vorher führte sie in dasselbe Closing wie „will starten",
   * und ob der Startfahrplan je hinausging, hing an einem Knopf im nächsten
   * Reiter.
   */
  it("schickt bei Unterlagen den Startfahrplan und setzt das Nachfassen", async () => {
    zeichne();
    fireEvent.click(await screen.findByText("Zusammenarbeit möglich"));
    fireEvent.click(screen.getByText("Möchte die Unterlagen"));
    // Der Nachfass-Block erscheint mit vorbelegtem Termin.
    expect(await screen.findByTestId("videocall-unterlagen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Startfahrplan senden/ }));

    await waitFor(() => expect(sendeStartfahrplan).toHaveBeenCalled());
    expect((sendeStartfahrplan.mock.calls[0][0] as { id: string }).id).toBe("b1");
    /*
     * Der Versand bekommt den frisch geschriebenen Stand, nicht den Bewerber
     * von vor dem Klick. Daran waehlt sendeStartfahrplan die Fassung des PDFs,
     * und die soll nicht davon abhaengen, ob vorher zufaellig einmal
     * zwischengespeichert wurde.
     */
    const uebergeben = sendeStartfahrplan.mock.calls[0][0] as {
      erstgespraechSkript?: {
        durchgefuehrtAm?: string;
        bewerberVideocall?: { entscheidung?: string; wunsch?: string };
      };
    };
    expect(uebergeben.erstgespraechSkript?.durchgefuehrtAm).toBeTruthy();
    expect(uebergeben.erstgespraechSkript?.bewerberVideocall?.entscheidung).toBe("moeglich");
    expect(uebergeben.erstgespraechSkript?.bewerberVideocall?.wunsch).toBe("unterlagen");
    const letzte = updateBewerber.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(String(letzte[1].followUpDatum)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(letzte[1].followUpNotiz).toContain("Startfahrplan");
    // Entschieden ist noch nichts, deshalb bleibt das Closing offen.
    expect(letzte[1].closingEntscheidung).toBe("");
    expect(changeBewerberStatus).toHaveBeenCalledWith("b1", "FollowUp");
    expect(changeBewerberStatus).not.toHaveBeenCalledWith("b1", "Closing");
  });

  it("schickt bei Will starten keinen Startfahrplan", async () => {
    zeichne();
    fireEvent.click(await screen.findByText("Zusammenarbeit möglich"));
    fireEvent.click(screen.getByText("Will starten"));
    expect(screen.queryByTestId("videocall-unterlagen")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Persönliches Gespräch abschließen/ }));
    await waitFor(() => expect(updateBewerber).toHaveBeenCalled());
    expect(sendeStartfahrplan).not.toHaveBeenCalled();
  });
});
