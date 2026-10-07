import { describe, it, expect, vi } from "vitest";
import {
  schaltePortalSperre, lesbarerSperrGrund, portalSperreAmServer, KUNDENPORTAL_SPERRE_FUNCTION,
  type SperrErgebnis,
} from "./kundenportalSperre";

/**
 * Sperren und Entsperren des Kundenportals melden erst, wenn der Server
 * geantwortet hat. Vorher kam „Portal gesperrt“ sofort, ein Fehlschlag stand
 * nur in der Konsole.
 *
 * Seit dem 23.09.2026 geht der Weg über die Edge Function
 * `kundenportal-sperre` statt über `merge_kontakt_meta`. Erst damit wirkt die
 * Sperre auf dem Server: Anmeldung gesperrt, Recht geprüft.
 */

function aufbau(ergebnis: SperrErgebnis | Promise<SperrErgebnis>) {
  const sperreSetzen = vi.fn(async (_gesperrt: boolean) => ergebnis);
  const melden = vi.fn();
  const neuLaden = vi.fn();
  return { sperreSetzen, melden, neuLaden };
}

describe("Portal sperren, Erfolg", () => {
  it("fragt den Server und meldet erst nach seiner Antwort", async () => {
    let antworten!: (e: SperrErgebnis) => void;
    const offen = new Promise<SperrErgebnis>((r) => { antworten = r; });
    const d = aufbau(offen);

    const lauf = schaltePortalSperre(true, d);
    await Promise.resolve();
    expect(d.sperreSetzen).toHaveBeenCalledWith(true);
    // Der Server hat noch nicht geantwortet: noch keine Meldung.
    expect(d.melden).not.toHaveBeenCalled();

    antworten({ ok: true, meta: { portalGesperrt: true } });
    await expect(lauf).resolves.toBe(true);
    expect(d.melden).toHaveBeenCalledTimes(1);
    expect(d.melden.mock.calls[0][0]).toMatchObject({ title: "Portal gesperrt" });
    expect(d.melden.mock.calls[0][0].variant).toBeUndefined();
    expect(d.neuLaden).not.toHaveBeenCalled();
  });

  it("entsperrt über denselben Weg", async () => {
    const d = aufbau({ ok: true, meta: null });
    await expect(schaltePortalSperre(false, d)).resolves.toBe(true);
    expect(d.sperreSetzen).toHaveBeenCalledWith(false);
    expect(d.melden.mock.calls[0][0]).toMatchObject({ title: "Portal entsperrt ✓" });
  });

  it("sagt laut, wenn die Anmeldung nicht mitgezogen hat", async () => {
    const d = aufbau({ ok: true, meta: null, warnung: "Die Anmeldung des Kunden ist noch gesperrt." });
    await expect(schaltePortalSperre(false, d)).resolves.toBe(true);
    const meldung = d.melden.mock.calls[0][0];
    expect(meldung.variant).toBe("destructive");
    expect(meldung.title).toBe("Portal entsperrt, Anmeldung noch gesperrt");
    expect(meldung.description).toContain("noch gesperrt");
  });
});

describe("Portal sperren, Fehlschlag", () => {
  it("meldet den Grund als Fehler und lädt den gespeicherten Stand neu", async () => {
    const d = aufbau({ ok: false, grund: "Not authorized" });
    await expect(schaltePortalSperre(true, d)).resolves.toBe(false);
    expect(d.melden).toHaveBeenCalledTimes(1);
    const meldung = d.melden.mock.calls[0][0];
    expect(meldung.variant).toBe("destructive");
    expect(meldung.title).toBe("Portal wurde nicht gesperrt");
    expect(meldung.description).toContain("Keine Berechtigung für diesen Kontakt");
    expect(d.neuLaden).toHaveBeenCalledTimes(1);
  });

  it("behandelt eine Ausnahme wie einen Fehlschlag", async () => {
    const d = aufbau({ ok: true, meta: null });
    d.sperreSetzen.mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(schaltePortalSperre(false, d)).resolves.toBe(false);
    const meldung = d.melden.mock.calls[0][0];
    expect(meldung.title).toBe("Portal wurde nicht entsperrt");
    expect(meldung.description).toContain("Keine Verbindung zum Server");
    expect(d.neuLaden).toHaveBeenCalledTimes(1);
  });

  it("reicht einen unbekannten Grund unverändert durch", () => {
    expect(lesbarerSperrGrund("Zeitüberschreitung.")).toBe("Zeitüberschreitung");
    expect(lesbarerSperrGrund("")).toBe("Unbekannter Fehler");
  });
});

/** Ein Fehler, wie ihn supabase-js bei Status ab 400 zurückgibt. */
function httpFehler(status: number, rumpf: string) {
  const fehler: Error & { context?: unknown } = new Error("Edge Function returned a non-2xx status code");
  fehler.context = {
    status,
    clone: () => ({ text: async () => rumpf }),
    text: async () => rumpf,
  };
  return fehler;
}

const KONTAKT = "11111111-1111-1111-1111-111111111111";

describe("portalSperreAmServer", () => {
  it("ruft die Function mit Kontakt und Sperrstand und gibt den neuen Stand zurück", async () => {
    const aufrufen = vi.fn(async () => ({
      data: { ok: true, gesperrt: true, meta: { portalGesperrt: true }, anmeldungFehler: 0 },
      error: null,
    }));
    const ergebnis = await portalSperreAmServer(KONTAKT, true, aufrufen);
    expect(aufrufen).toHaveBeenCalledWith(KUNDENPORTAL_SPERRE_FUNCTION, { body: { kontaktId: KONTAKT, gesperrt: true } });
    expect(ergebnis).toEqual({ ok: true, meta: { portalGesperrt: true }, warnung: undefined });
  });

  it("zeigt die Ablehnung eines fremden Partners mit dem Grund aus der Antwort", async () => {
    const grund = "Keine Berechtigung: Das Kundenportal dieses Kontakts verwalten nur der zuständige Vertriebspartner, Admin und Inhaber.";
    const aufrufen = vi.fn(async () => ({ data: null, error: httpFehler(403, JSON.stringify({ error: grund })) }));
    const ergebnis = await portalSperreAmServer(KONTAKT, true, aufrufen);
    expect(ergebnis).toEqual({ ok: false, grund });
  });

  it("sagt, wenn die Function noch nicht ausgerollt ist", async () => {
    const aufrufen = vi.fn(async () => ({
      data: null,
      error: httpFehler(404, JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" })),
    }));
    const ergebnis = await portalSperreAmServer(KONTAKT, false, aufrufen);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.grund).toContain("noch nicht ausgerollt");
  });

  it("macht aus einer Teilsperre der Anmeldung eine Warnung", async () => {
    const aufrufen = vi.fn(async () => ({ data: { ok: true, meta: {}, anmeldungFehler: 1 }, error: null }));
    const ergebnis = await portalSperreAmServer(KONTAKT, false, aufrufen);
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.ok === true && ergebnis.warnung).toContain("noch gesperrt");
  });

  it("wertet eine Antwort ohne ok nicht als Erfolg", async () => {
    const aufrufen = vi.fn(async () => ({ data: { error: "Kaputt" }, error: null }));
    expect(await portalSperreAmServer(KONTAKT, true, aufrufen)).toEqual({ ok: false, grund: "Kaputt" });
  });
});
