/**
 * Wachhund über den Abbruchbedingungen der Selbstauskunft-Erinnerungen.
 *
 * Die Logik liegt in `supabase/functions/_shared/sa-erinnerung-stopp.ts`, weil
 * die Edge Function in Deno läuft und nichts aus `src/` importieren kann.
 * Getestet wird von hier, so wie bei `notar-zeitpunkt` und `standort-messung`.
 *
 * Worum es geht: Eine Erinnerung an jemanden, der die Selbstauskunft längst
 * ausgefüllt hat oder gar kein Kunde mehr ist, richtet mehr Schaden an als eine
 * ausgebliebene Erinnerung. Vorher wurde nur auf die Unterschrift geprüft, ein
 * verlorener Kunde bekam also weiter Post. Jede der Bedingungen hier ist ein
 * Fall, der in der Praxis vorkommt und den man nur mit Tests im Griff behält.
 */
import { describe, it, expect } from "vitest";
import {
  saErinnerungStoppen,
  tokenAusFillUrl,
} from "../../supabase/functions/_shared/sa-erinnerung-stopp";

/** Ein Miniatur-Client, der genau die zwei abgefragten Tabellen bedient. */
function db(zeilen: { investments?: unknown; kontakte?: unknown }) {
  return {
    from: (tabelle: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: tabelle === "investments" ? (zeilen.investments ?? null) : (zeilen.kontakte ?? null),
            error: null,
          }),
        }),
      }),
    }),
  };
}

describe("saErinnerungStoppen", () => {
  it("lässt die Erinnerung laufen, solange nichts dagegen spricht", async () => {
    const e = await saErinnerungStoppen(
      db({ investments: { meta: { pipelineStufe: "selbstauskunft" } }, kontakte: { status: "kunde" } }),
      "inv-1",
      "k-1",
    );
    expect(e.stoppen).toBe(false);
  });

  it("stoppt bei unterschriebener Selbstauskunft", async () => {
    const e = await saErinnerungStoppen(db({ investments: { meta: { saSigned: true } } }), "inv-1", null);
    expect(e.stoppen).toBe(true);
  });

  it("stoppt schon bei ausgefüllter Selbstauskunft, nicht erst bei der Unterschrift", async () => {
    const e = await saErinnerungStoppen(
      db({ investments: { meta: { saPdfFilename: "SA_Max_Muster.pdf" } } }),
      "inv-1",
      null,
    );
    expect(e.stoppen).toBe(true);
  });

  it("stoppt, wenn die Selbstauskunft bereits zur Unterschrift beim Kunden liegt", async () => {
    const e = await saErinnerungStoppen(
      db({ investments: { meta: { saSignaturePending: true } } }),
      "inv-1",
      null,
    );
    expect(e.stoppen).toBe(true);
  });

  it("stoppt, wenn das Investment die Selbstauskunft längst hinter sich hat", async () => {
    const e = await saErinnerungStoppen(
      db({ investments: { meta: { pipelineStufe: "objektauswahl" } } }),
      "inv-1",
      null,
    );
    expect(e.stoppen).toBe(true);
  });

  it("stoppt beim als verloren markierten Kunden", async () => {
    const e = await saErinnerungStoppen(db({ kontakte: { status: "verloren" } }), null, "k-1");
    expect(e.stoppen).toBe(true);
  });

  it("stoppt beim archivierten und beim gelöschten Kunden", async () => {
    expect((await saErinnerungStoppen(db({ kontakte: { archiviert: true } }), null, "k-1")).stoppen).toBe(true);
    expect((await saErinnerungStoppen(db({ kontakte: { geloescht: true } }), null, "k-1")).stoppen).toBe(true);
  });

  it("stoppt beim abgeschlossenen Investment", async () => {
    const e = await saErinnerungStoppen(
      db({ investments: { meta: {}, status: "abgeschlossen" } }),
      "inv-1",
      null,
    );
    expect(e.stoppen).toBe(true);
  });

  it("läuft weiter, wenn gar nichts nachschlagbar ist", async () => {
    // Ohne Bezug lässt sich nichts prüfen. Dann soll die geplante Erinnerung
    // ihren Lauf nehmen, statt an einer fehlenden Angabe hängenzubleiben.
    const e = await saErinnerungStoppen(db({}), null, null);
    expect(e.stoppen).toBe(false);
  });

  it("läuft weiter, wenn die Abfrage scheitert", async () => {
    const kaputt = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.reject(new Error("weg")) }) }) }),
    };
    const e = await saErinnerungStoppen(kaputt, "inv-1", "k-1");
    expect(e.stoppen).toBe(false);
  });
});

describe("tokenAusFillUrl", () => {
  it("zieht den Token aus der Ausfüll-Adresse", () => {
    expect(tokenAusFillUrl("https://portal.more.immo/sa/abc123def")).toBe("abc123def");
  });

  it("liefert nichts, wenn keine Adresse oder keine passende vorliegt", () => {
    expect(tokenAusFillUrl(null)).toBeNull();
    expect(tokenAusFillUrl("")).toBeNull();
    expect(tokenAusFillUrl("https://portal.more.immo/kunden/123")).toBeNull();
  });
});
