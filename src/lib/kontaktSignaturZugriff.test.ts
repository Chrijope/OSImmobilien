/**
 * Wer darf eine Unterschrift anfordern, und an welche Adresse geht sie?
 *
 * Die Logik liegt in `supabase/functions/_shared/kontakt-signatur-zugriff.ts`,
 * weil `send-signature-request` und `send-reservation-signature` sie beide
 * brauchen. Geprüft wird sie hier, denn die Edge Functions selbst laufen unter
 * Deno und kommen im Testlauf nicht vor.
 *
 * Anlass: externes Audit vom 15.09.2026, Befund F03A. Beide Functions haben
 * nur geprüft, DASS jemand angemeldet ist, nicht WER. Ein angemeldeter Kunde
 * konnte damit einen Unterschriftslink zu einem fremden Vertrag anfordern und
 * die offenen Anfragen des fremden Kontakts löschen.
 */

import { describe, it, expect } from "vitest";
import {
  emailIstBrauchbar,
  empfaengerAusKontakt,
  nachweisGiltFuerKontakt,
  pruefeKontaktZugriff,
  type KontaktZeile,
} from "../../supabase/functions/_shared/kontakt-signatur-zugriff.ts";

const KONTAKT_ID = "11111111-1111-1111-1111-111111111111";
const VP_ID = "22222222-2222-2222-2222-222222222222";
const FREMDER_ID = "33333333-3333-3333-3333-333333333333";
const KUNDE_ID = "44444444-4444-4444-4444-444444444444";

function kontaktZeile(ueberschreiben: Partial<KontaktZeile> = {}): KontaktZeile {
  return {
    id: KONTAKT_ID,
    vorname: "Otto",
    nachname: "Hans",
    email: "otto@example.de",
    zustaendig_id: VP_ID,
    meta: {},
    ...ueberschreiben,
  };
}

/** Service-Role-Client, der genau eine Kontaktzeile kennt. */
function dienstClient(zeile: KontaktZeile | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: zeile, error: null }),
        }),
      }),
    }),
  } as any;
}

/**
 * Client des Aufrufers. `antworten` bildet Funktionsname auf Antwort ab.
 * Alles, was nicht aufgeführt ist, antwortet mit `null`. Das ist der
 * dreiwertige Fall aus Postgres und muss als "nicht erlaubt" gelten.
 */
function aufruferClient(antworten: Record<string, unknown>) {
  const aufrufe: string[] = [];
  return {
    aufrufe,
    client: {
      rpc: async (name: string) => {
        aufrufe.push(name);
        return { data: name in antworten ? antworten[name] : null, error: null };
      },
    } as any,
  };
}

describe("Berechtigung: wer darf für diesen Kontakt unterschreiben lassen", () => {
  it("lässt den Kunden selbst durch (Weg aus dem Kundenportal)", async () => {
    const zeile = kontaktZeile({ meta: { authUserId: KUNDE_ID } });
    const { client } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(dienstClient(zeile), client, KONTAKT_ID, KUNDE_ID);
    expect(ergebnis.erlaubt).toBe(true);
  });

  it("lässt auch die zweite Person des Kontakts durch", async () => {
    const zeile = kontaktZeile({ meta: { person2: { authUserId: KUNDE_ID } } });
    const { client } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(dienstClient(zeile), client, KONTAKT_ID, KUNDE_ID);
    expect(ergebnis.erlaubt).toBe(true);
  });

  it("fragt für den Kunden selbst gar nicht erst nach Rollen", async () => {
    const zeile = kontaktZeile({ meta: { authUserId: KUNDE_ID } });
    const { client, aufrufe } = aufruferClient({});
    await pruefeKontaktZugriff(dienstClient(zeile), client, KONTAKT_ID, KUNDE_ID);
    expect(aufrufe).toEqual([]);
  });

  it("ohneKunde (Einladung zur Selbstauskunft): der Kunde selbst und Person 2 kommen nicht durch (07.10.2026)", async () => {
    for (const meta of [{ authUserId: KUNDE_ID }, { person2: { authUserId: KUNDE_ID } }]) {
      const { client } = aufruferClient({});
      const ergebnis = await pruefeKontaktZugriff(dienstClient(kontaktZeile({ meta })), client, KONTAKT_ID, KUNDE_ID, null, { ohneKunde: true });
      expect(ergebnis.erlaubt).toBe(false);
    }
    const { client } = aufruferClient({ is_admin_role: true });
    const admin = await pruefeKontaktZugriff(dienstClient(kontaktZeile()), client, KONTAKT_ID, FREMDER_ID, null, { ohneKunde: true });
    expect(admin.erlaubt).toBe(true);
  });

  it("lässt Admins durch", async () => {
    const { client } = aufruferClient({ is_admin_role: true, is_internal_role: true });
    const ergebnis = await pruefeKontaktZugriff(dienstClient(kontaktZeile()), client, KONTAKT_ID, FREMDER_ID);
    expect(ergebnis.erlaubt).toBe(true);
  });

  it("lässt Rollen mit Zugriff auf alle Kunden durch", async () => {
    const { client } = aufruferClient({ darf_alle_kunden_sehen: true, has_role: false });
    const ergebnis = await pruefeKontaktZugriff(dienstClient(kontaktZeile()), client, KONTAKT_ID, FREMDER_ID);
    expect(ergebnis.erlaubt).toBe(true);
  });

  it("sperrt interne Rollen ohne Kundenzugriff, etwa Marketing (05.10.2026)", async () => {
    const { client } = aufruferClient({ is_internal_role: true, darf_alle_kunden_sehen: false, has_role: false });
    const ergebnis = await pruefeKontaktZugriff(dienstClient(kontaktZeile()), client, KONTAKT_ID, FREMDER_ID);
    expect(ergebnis.erlaubt).toBe(false);
  });

  it("lässt den zuständigen Vertriebspartner durch", async () => {
    const { client } = aufruferClient({
      is_internal_role: true,
      has_role: true,
      is_vp_owner_of_kontakt: true,
    });
    const ergebnis = await pruefeKontaktZugriff(dienstClient(kontaktZeile()), client, KONTAKT_ID, VP_ID);
    expect(ergebnis.erlaubt).toBe(true);
  });

  /*
   * Der eigentliche Befund: Ein Vertriebspartner hat eine interne Rolle,
   * `is_internal_role` sagt also ja. Ohne den zweiten Schritt käme damit jeder
   * Partner an jeden Kontakt.
   */
  it("sperrt den Vertriebspartner an einem fremden Kontakt", async () => {
    const { client } = aufruferClient({
      is_internal_role: true,
      has_role: true,
      is_vp_owner_of_kontakt: false,
    });
    const ergebnis = await pruefeKontaktZugriff(dienstClient(kontaktZeile()), client, KONTAKT_ID, FREMDER_ID);
    expect(ergebnis.erlaubt).toBe(false);
  });

  it("sperrt einen angemeldeten Fremden ohne jede Rolle", async () => {
    const { client } = aufruferClient({ is_admin_role: false, is_internal_role: false, has_role: false });
    const ergebnis = await pruefeKontaktZugriff(dienstClient(kontaktZeile()), client, KONTAKT_ID, FREMDER_ID);
    expect(ergebnis.erlaubt).toBe(false);
  });

  /*
   * Dreiwertige Logik: `is_vp_owner_of_kontakt` ist eine Kette aus
   * Vergleichen. Steht `zustaendig_id` auf NULL und fehlen die meta-Schlüssel,
   * ist das Ergebnis unbekannt und kommt als `null` an. Genau dieser Fall hat
   * am 16.09.2026 an drei anderen Stellen die Sperre ausgehebelt.
   */
  it("wertet ein unbekanntes Ergebnis (null) als nicht erlaubt", async () => {
    const { client } = aufruferClient({ is_internal_role: true, has_role: true });
    const zeile = kontaktZeile({ zustaendig_id: null, meta: {} });
    const ergebnis = await pruefeKontaktZugriff(dienstClient(zeile), client, KONTAKT_ID, FREMDER_ID);
    expect(ergebnis.erlaubt).toBe(false);
  });

  it("sperrt, wenn der Kontakt gar nicht existiert", async () => {
    const { client } = aufruferClient({ is_admin_role: true });
    const ergebnis = await pruefeKontaktZugriff(dienstClient(null), client, KONTAKT_ID, FREMDER_ID);
    expect(ergebnis.erlaubt).toBe(false);
    // Neutral: Der Aufrufer bekommt keine Kontaktdaten, auch nicht als Admin.
    expect(ergebnis.kontakt).toBeNull();
  });

  it("sperrt ohne Kontaktkennung und ohne Nutzerkennung", async () => {
    const { client } = aufruferClient({ is_admin_role: true });
    expect((await pruefeKontaktZugriff(dienstClient(kontaktZeile()), client, "", FREMDER_ID)).erlaubt).toBe(false);
    expect((await pruefeKontaktZugriff(dienstClient(kontaktZeile()), client, KONTAKT_ID, "")).erlaubt).toBe(false);
  });

  it("wertet einen leeren oder fehlenden authUserId-Eintrag nicht als Treffer", async () => {
    const leer = kontaktZeile({ meta: { authUserId: "", person2: { authUserId: "" } } });
    const { client } = aufruferClient({});
    expect((await pruefeKontaktZugriff(dienstClient(leer), client, KONTAKT_ID, FREMDER_ID)).erlaubt).toBe(false);

    const ohne = kontaktZeile({ meta: null });
    expect((await pruefeKontaktZugriff(dienstClient(ohne), client, KONTAKT_ID, FREMDER_ID)).erlaubt).toBe(false);
  });
});

/*
 * Der dritte Zweig: der Nachweis-Token aus einem Aufruf von Function zu
 * Function.
 *
 * Anlass: Unterschreibt ein Ehepaar gemeinsam und sitzt der zweite Käufer
 * nicht mit am Bildschirm, ruft `submit-sa-signature` die Function
 * `send-signature-request` mit dem Service-Role-Schlüssel auf. Dahinter steht
 * kein angemeldeter Nutzer, die Anfrage wurde deshalb mit 401 abgewiesen und
 * die Mail an Person 2 ging nie hinaus. Dieser Fehler bestand schon vor den
 * Sicherheitsänderungen vom 16.09.2026.
 */
const FILL_TOKEN = "fill-0000-aaaa";
const SIG_TOKEN = "sig-0000-bbbb";

/** Ein Zeitpunkt in der Zukunft beziehungsweise in der Vergangenheit. */
const IN_ZUKUNFT = new Date(Date.now() + 3600_000).toISOString();
const IN_VERGANGENHEIT = new Date(Date.now() - 3600_000).toISOString();

/**
 * Service-Role-Client, der mehrere Tabellen kennt. Je Tabelle wird eine
 * Funktion hinterlegt, die zum gesuchten Token die Zeile liefert oder null.
 */
function dienstClientMitTabellen(
  kontakt: KontaktZeile | null,
  tabellen: Record<string, Record<string, unknown>>,
) {
  const aufrufe: string[] = [];
  return {
    aufrufe,
    client: {
      from: (tabelle: string) => ({
        select: () => ({
          eq: (_feld: string, wert: unknown) => ({
            maybeSingle: async () => {
              aufrufe.push(tabelle);
              if (tabelle === "kontakte") return { data: kontakt, error: null };
              const treffer = tabellen[tabelle];
              if (!treffer || treffer.token !== wert) return { data: null, error: null };
              return { data: treffer, error: null };
            },
          }),
        }),
      }),
    } as any,
  };
}

describe("Nachweis-Token aus einem Aufruf von Function zu Function", () => {
  it("lässt den Aufruf durch, wenn der Fill-Token zu genau diesem Kontakt gehört", async () => {
    const { client } = dienstClientMitTabellen(kontaktZeile(), {
      sa_fill_tokens: { token: FILL_TOKEN, kontakt_id: KONTAKT_ID, expires_at: IN_ZUKUNFT },
    });
    const { client: rpc } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: FILL_TOKEN,
      vonFunctionZuFunction: true,
    });
    expect(ergebnis.erlaubt).toBe(true);
  });

  it("lässt auch einen Token aus einer Signaturanfrage desselben Kontakts durch", async () => {
    const { client } = dienstClientMitTabellen(kontaktZeile(), {
      signature_requests: { token: SIG_TOKEN, kontakt_id: KONTAKT_ID, expires_at: IN_ZUKUNFT },
    });
    const { client: rpc } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: SIG_TOKEN,
      vonFunctionZuFunction: true,
    });
    expect(ergebnis.erlaubt).toBe(true);
  });

  /*
   * Der Status wird bewusst nicht geprüft: Genau in diesem Augenblick steht
   * der Fill-Token gleich auf "used" und die eben angelegte Signaturanfrage
   * schon auf "signed". Ein Statusfilter würde ausgerechnet den Fall
   * abweisen, für den der Weg gebaut ist.
   */
  it("stört sich nicht am Status der Zeile", async () => {
    const { client } = dienstClientMitTabellen(kontaktZeile(), {
      sa_fill_tokens: { token: FILL_TOKEN, kontakt_id: KONTAKT_ID, expires_at: IN_ZUKUNFT, status: "used" },
    });
    const { client: rpc } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: FILL_TOKEN,
      vonFunctionZuFunction: true,
    });
    expect(ergebnis.erlaubt).toBe(true);
  });

  /*
   * Das erste Schloss: Ohne das gemeinsame Geheimwort im Kopf der Anfrage
   * setzt die Function `vonFunctionZuFunction` nicht auf true. Der Token wird
   * dann gar nicht erst angesehen. Genau das verhindert, dass ein Angreifer
   * von außen einen Token mitschickt.
   */
  it("sieht den Token ohne Geheimwort nicht einmal an", async () => {
    const { client, aufrufe } = dienstClientMitTabellen(kontaktZeile(), {
      sa_fill_tokens: { token: FILL_TOKEN, kontakt_id: KONTAKT_ID, expires_at: IN_ZUKUNFT },
    });
    const { client: rpc } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: FILL_TOKEN,
      vonFunctionZuFunction: false,
    });
    expect(ergebnis.erlaubt).toBe(false);
    expect(aufrufe).not.toContain("sa_fill_tokens");
  });

  /*
   * Das zweite Schloss: Selbst mit Geheimwort zählt der Token nur für den
   * Kontakt, zu dem er gehört.
   */
  it("sperrt einen Token, der zu einem anderen Kontakt gehört", async () => {
    const { client } = dienstClientMitTabellen(kontaktZeile(), {
      sa_fill_tokens: { token: FILL_TOKEN, kontakt_id: "99999999-9999-9999-9999-999999999999", expires_at: IN_ZUKUNFT },
    });
    const { client: rpc } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: FILL_TOKEN,
      vonFunctionZuFunction: true,
    });
    expect(ergebnis.erlaubt).toBe(false);
  });

  it("sperrt einen abgelaufenen Token", async () => {
    const { client } = dienstClientMitTabellen(kontaktZeile(), {
      sa_fill_tokens: { token: FILL_TOKEN, kontakt_id: KONTAKT_ID, expires_at: IN_VERGANGENHEIT },
    });
    const { client: rpc } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: FILL_TOKEN,
      vonFunctionZuFunction: true,
    });
    expect(ergebnis.erlaubt).toBe(false);
  });

  it("sperrt einen Token, den es nirgends gibt", async () => {
    const { client } = dienstClientMitTabellen(kontaktZeile(), {});
    const { client: rpc } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: "frei-erfunden",
      vonFunctionZuFunction: true,
    });
    expect(ergebnis.erlaubt).toBe(false);
  });

  /*
   * Fehlende oder unlesbare Fristen dürfen nie als "noch gültig" gelten.
   * Dieser Fehler war am 16.09.2026 schon an vier Stellen die Ursache.
   */
  it("wertet eine fehlende oder unlesbare Frist als abgelaufen", async () => {
    for (const frist of [null, "", "irgendwas", undefined]) {
      const erlaubt = await nachweisGiltFuerKontakt(
        dienstClientMitTabellen(null, {
          sa_fill_tokens: { token: FILL_TOKEN, kontakt_id: KONTAKT_ID, expires_at: frist },
        }).client,
        KONTAKT_ID,
        { token: FILL_TOKEN, vonFunctionZuFunction: true },
      );
      expect(erlaubt).toBe(false);
    }
  });

  it("wertet eine leere kontakt_id nicht als Treffer", async () => {
    const erlaubt = await nachweisGiltFuerKontakt(
      dienstClientMitTabellen(null, {
        sa_fill_tokens: { token: FILL_TOKEN, kontakt_id: null, expires_at: IN_ZUKUNFT },
      }).client,
      "",
      { token: FILL_TOKEN, vonFunctionZuFunction: true },
    );
    expect(erlaubt).toBe(false);
  });

  it("zählt einen leeren Token nicht, auch mit Geheimwort", async () => {
    const { client } = dienstClientMitTabellen(kontaktZeile(), {
      sa_fill_tokens: { token: "", kontakt_id: KONTAKT_ID, expires_at: IN_ZUKUNFT },
    });
    const { client: rpc } = aufruferClient({});
    const ergebnis = await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: "   ",
      vonFunctionZuFunction: true,
    });
    expect(ergebnis.erlaubt).toBe(false);
  });

  /*
   * Ohne Nutzerkennung darf kein Vergleich mit `authUserId` mehr laufen.
   * Sonst wäre ein leerer Eintrag am Kontakt gleich der leeren Kennung und
   * damit ein Treffer, und ein untauglicher Nachweis-Token käme über diesen
   * Umweg doch noch durch.
   */
  it("fällt bei ungültigem Nachweis nicht auf einen leeren authUserId zurück", async () => {
    const zeile = kontaktZeile({ meta: { authUserId: "", person2: { authUserId: "" } } });
    const { client } = dienstClientMitTabellen(zeile, {});
    const { client: rpc } = aufruferClient({ is_admin_role: true, is_internal_role: true });
    const ergebnis = await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: "frei-erfunden",
      vonFunctionZuFunction: true,
    });
    expect(ergebnis.erlaubt).toBe(false);
  });

  it("fragt für den Nachweis keine Rollen ab", async () => {
    const { client } = dienstClientMitTabellen(kontaktZeile(), {
      sa_fill_tokens: { token: FILL_TOKEN, kontakt_id: KONTAKT_ID, expires_at: IN_ZUKUNFT },
    });
    const { client: rpc, aufrufe } = aufruferClient({});
    await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "", {
      token: FILL_TOKEN,
      vonFunctionZuFunction: true,
    });
    expect(aufrufe).toEqual([]);
  });

  it("bleibt ohne Nachweis beim bisherigen Verhalten", async () => {
    const { client } = dienstClientMitTabellen(kontaktZeile(), {});
    const { client: rpc } = aufruferClient({ is_admin_role: true });
    expect((await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, FREMDER_ID)).erlaubt).toBe(true);
    // Ohne Nutzer und ohne Nachweis bleibt es bei der Sperre.
    expect((await pruefeKontaktZugriff(client, rpc, KONTAKT_ID, "")).erlaubt).toBe(false);
  });
});

describe("Empfängeradresse kommt aus dem Kontakt, nicht aus dem Aufruf", () => {
  it("nimmt für Person 1 die Adresse des Kontakts", () => {
    expect(empfaengerAusKontakt(kontaktZeile(), "person1")).toEqual({
      name: "Otto Hans",
      email: "otto@example.de",
    });
  });

  it("nimmt für Käufer 1 der Reservierung dieselbe Adresse", () => {
    expect(empfaengerAusKontakt(kontaktZeile(), "kaeufer1").email).toBe("otto@example.de");
  });

  it("nimmt für Person 2 deren eigene Adresse", () => {
    const zeile = kontaktZeile({
      meta: { person2: { vorname: "Eva", nachname: "Hans", email: "eva@example.de" } },
    });
    expect(empfaengerAusKontakt(zeile, "person2")).toEqual({ name: "Eva Hans", email: "eva@example.de" });
    expect(empfaengerAusKontakt(zeile, "kaeufer2").email).toBe("eva@example.de");
    // Alte Schreibweise aus Bestandsdaten.
    expect(empfaengerAusKontakt(zeile, "partner").email).toBe("eva@example.de");
  });

  it("fällt für Person 2 ohne eigene Adresse auf Person 1 zurück", () => {
    const zeile = kontaktZeile({ meta: { person2: { vorname: "Eva", nachname: "Hans" } } });
    expect(empfaengerAusKontakt(zeile, "person2").email).toBe("otto@example.de");
  });

  it("entfernt Leerzeichen am Rand, sonst lehnt der Mailversand ab", () => {
    const zeile = kontaktZeile({ email: "  otto@example.de " });
    expect(empfaengerAusKontakt(zeile, "person1").email).toBe("otto@example.de");
  });

  it("liefert eine leere Adresse, wenn am Kontakt keine steht", () => {
    const zeile = kontaktZeile({ email: null });
    expect(empfaengerAusKontakt(zeile, "person1").email).toBe("");
    expect(emailIstBrauchbar("")).toBe(false);
  });

  it("erkennt brauchbare und unbrauchbare Adressen", () => {
    expect(emailIstBrauchbar("otto@example.de")).toBe(true);
    expect(emailIstBrauchbar("otto@example")).toBe(false);
    expect(emailIstBrauchbar("otto example.de")).toBe(false);
  });
});
