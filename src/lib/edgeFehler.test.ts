import { describe, it, expect } from "vitest";
import {
  edgeFehlerMitGrund, functionNichtAusgerolltText, functionNichtErreichbarText, functionStartetNichtText,
} from "@/lib/edgeFehler";

/**
 * Der Grund einer Fehlerantwort darf nicht verloren gehen.
 *
 * Anlass: `supabase.functions.invoke` meldet jeden Status ab 400 mit demselben
 * englischen Satz. Das stündliche Versandlimit, eine abgelaufene Anmeldung und
 * ein fehlendes Pflichtfeld sahen am Bildschirm damit gleich aus. Der Rumpf der
 * Antwort hängt ungelesen am Fehler und wurde nie geöffnet.
 */

/** Ein Fehler, wie ihn supabase-js bei Status ab 400 zurückgibt. */
function httpFehler(status: number, rumpf: string) {
  const fehler = new Error("Edge Function returned a non-2xx status code");
  (fehler as any).context = {
    status,
    clone: () => ({ text: async () => rumpf }),
    text: async () => rumpf,
  };
  return fehler;
}

describe("edgeFehlerMitGrund", () => {
  it("holt die Meldung aus dem Feld error", async () => {
    const fehler = httpFehler(429, JSON.stringify({
      error: "Stündliches Limit erreicht. Bitte später erneut versuchen.",
      rate_limited: true,
    }));
    const ergebnis = await edgeFehlerMitGrund(fehler);
    expect((ergebnis as Error).message).toBe("Stündliches Limit erreicht. Bitte später erneut versuchen.");
  });

  it("nennt bei einem Rumpf ohne Grund wenigstens den Status", async () => {
    const ergebnis = await edgeFehlerMitGrund(httpFehler(500, JSON.stringify({ irgendwas: 1 })));
    expect((ergebnis as Error).message).toBe("Die Serverfunktion hat mit Status 500 geantwortet.");
  });

  it("lässt eine HTML-Seite eines Zwischenservers stehen und nimmt den Status", async () => {
    const ergebnis = await edgeFehlerMitGrund(httpFehler(502, "<html><body>Bad Gateway</body></html>"));
    expect((ergebnis as Error).message).toBe("Die Serverfunktion hat mit Status 502 geantwortet.");
  });

  it("gibt einen Fehler ohne lesbare Antwort unverändert zurück", async () => {
    const fehler = new Error("Failed to fetch");
    expect(await edgeFehlerMitGrund(fehler)).toBe(fehler);
  });

  it("verändert nichts, wenn gar kein Fehler vorliegt", async () => {
    expect(await edgeFehlerMitGrund(null)).toBe(null);
  });

  it("überlebt einen Rumpf, der sich nicht lesen lässt", async () => {
    const fehler = new Error("Edge Function returned a non-2xx status code");
    (fehler as any).context = {
      status: 400,
      clone: () => ({ text: async () => { throw new Error("schon gelesen"); } }),
      text: async () => { throw new Error("schon gelesen"); },
    };
    expect(await edgeFehlerMitGrund(fehler)).toBe(fehler);
  });

  it("kürzt einen übermäßig langen Grund", async () => {
    const lang = "x".repeat(500);
    const ergebnis = await edgeFehlerMitGrund(httpFehler(400, JSON.stringify({ error: lang })));
    expect((ergebnis as Error).message.length).toBe(301);
    expect((ergebnis as Error).message.endsWith("…")).toBe(true);
  });
});

/*
 * Christian am 23.09.2026: „Kundenlink senden“, „Link kopieren“, und es kam
 * eine 404. Mit dem Namen der Function sagt der Helfer, ob die Plattform
 * geantwortet hat (Function fehlt oder startet nicht) oder die Function
 * selbst. Keine nackte 404 und kein englischer Satz von Supabase mehr.
 */
describe("edgeFehlerMitGrund mit Namen der Function", () => {
  const NAME = { functionName: "send-kunden-expose" };
  /** Was Supabase schickt, wenn es die Function nicht gibt. */
  const NICHT_GEFUNDEN = JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" });

  it("sagt bei der 404 von Supabase, dass die Function nicht ausgerollt ist", async () => {
    const ergebnis = (await edgeFehlerMitGrund(httpFehler(404, NICHT_GEFUNDEN), NAME)) as Error;
    expect(ergebnis.message).toBe(functionNichtAusgerolltText("send-kunden-expose"));
    expect(ergebnis.message).toBe("Die Function send-kunden-expose ist noch nicht ausgerollt. Roll sie in Lovable aus, dann klappt es.");
    expect(ergebnis.message).not.toMatch(/404|Requested function/);
  });

  it("sagt es auch bei einer 404 ohne lesbaren Rumpf", async () => {
    for (const rumpf of ["", "Not Found", "<html>404</html>"]) {
      const ergebnis = (await edgeFehlerMitGrund(httpFehler(404, rumpf), NAME)) as Error;
      expect(ergebnis.message).toBe(functionNichtAusgerolltText("send-kunden-expose"));
    }
  });

  it("gibt die eigene 404 der Function mit ihrem Grund weiter", async () => {
    const ergebnis = (await edgeFehlerMitGrund(httpFehler(404, JSON.stringify({ error: "Das Objekt gibt es nicht mehr." })), NAME)) as Error;
    expect(ergebnis.message).toBe("Das Objekt gibt es nicht mehr.");
  });

  it("sagt, wenn die Function ausgerollt ist, aber nicht startet", async () => {
    const rumpf = JSON.stringify({ code: "BOOT_ERROR", message: "Function failed to start (please check logs)" });
    const ergebnis = (await edgeFehlerMitGrund(httpFehler(503, rumpf), NAME)) as Error;
    expect(ergebnis.message).toBe(functionStartetNichtText("send-kunden-expose"));
  });

  it("sagt ohne jede Antwort, dass die Function nicht erreichbar ist", async () => {
    // So meldet supabase-js einen Aufruf, der nie ankam, etwa weil die
    // Vorabfrage des Browsers an einer nicht ausgerollten Function scheiterte.
    const fehler = Object.assign(new Error("Failed to send a request to the Edge Function"), {
      name: "FunctionsFetchError",
      context: new TypeError("Failed to fetch"),
    });
    const ergebnis = (await edgeFehlerMitGrund(fehler, NAME)) as Error;
    expect(ergebnis.message).toBe(functionNichtErreichbarText("send-kunden-expose"));
    expect(ergebnis.message).toContain("nicht ausgerollt");
  });

  it("lässt die übrigen Gründe unverändert, auch mit Namen", async () => {
    const ergebnis = (await edgeFehlerMitGrund(httpFehler(429, JSON.stringify({ error: "Stündliches Limit erreicht." })), NAME)) as Error;
    expect(ergebnis.message).toBe("Stündliches Limit erreicht.");
    const ohneGrund = (await edgeFehlerMitGrund(httpFehler(500, JSON.stringify({ irgendwas: 1 })), NAME)) as Error;
    expect(ohneGrund.message).toBe("Die Serverfunktion hat mit Status 500 geantwortet.");
  });

  it("bleibt ohne Namen beim bisherigen Verhalten", async () => {
    const ergebnis = (await edgeFehlerMitGrund(httpFehler(404, NICHT_GEFUNDEN))) as Error;
    expect(ergebnis.message).toBe("Requested function was not found");
    const fehler = Object.assign(new Error("Failed to send a request to the Edge Function"), { name: "FunctionsFetchError" });
    expect(await edgeFehlerMitGrund(fehler)).toBe(fehler);
  });

  it("schreibt in den Meldungen keine Gedankenstriche", () => {
    for (const text of [functionNichtAusgerolltText("x"), functionStartetNichtText("x"), functionNichtErreichbarText("x")]) {
      expect(text).not.toMatch(/ – | — /);
    }
  });
});
