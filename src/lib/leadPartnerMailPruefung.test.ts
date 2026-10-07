/**
 * Die Mail „Neuer Lead" geht nur an den Partner, dem der Kontakt gehoert.
 *
 * Die Regel liegt in `supabase/functions/_shared/lead-partner-mail-pruefung.ts`,
 * weil `send-lead-partner-mail` in Deno laeuft. Getestet wird von hier, wie
 * bei `vp-slug` und `lead-zuordnung`.
 */
import { describe, expect, it } from "vitest";
import {
  LEAD_MAIL_NACHLESEN_MS,
  teileNachZuordnung,
} from "../../supabase/functions/_shared/lead-partner-mail-pruefung";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("teileNachZuordnung", () => {
  it("laesst nur Kontakte durch, die dem Empfaenger zugeordnet sind", () => {
    const { zugeordnet, fremd } = teileNachZuordnung(
      [
        { id: "k1", zustaendig_id: A },
        { id: "k2", zustaendig_id: B },
        { id: "k3", zustaendig_id: null },
      ],
      A,
    );
    expect(zugeordnet.map((k) => k.id)).toEqual(["k1"]);
    expect(fremd.map((k) => k.id)).toEqual(["k2", "k3"]);
  });

  it("ein leerer Empfaenger bekommt nichts, auch nicht unzugewiesene Kontakte", () => {
    const { zugeordnet } = teileNachZuordnung([{ id: "k1", zustaendig_id: "" }, { id: "k2" }], "");
    expect(zugeordnet).toEqual([]);
  });

  it("vergleicht die Kennung ohne Leerzeichen am Rand", () => {
    const { zugeordnet } = teileNachZuordnung([{ id: "k1", zustaendig_id: ` ${A} ` }], A);
    expect(zugeordnet).toHaveLength(1);
  });
});

describe("send-lead-partner-mail", () => {
  it("prueft die Zuordnung und liest vor dem Verwerfen nach", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const quelle = readFileSync(join(process.cwd(), "supabase/functions/send-lead-partner-mail/index.ts"), "utf8");
    expect(quelle).toContain("zustaendig_id");
    expect(quelle).toContain("teileNachZuordnung(");
    expect(quelle).toContain("LEAD_MAIL_NACHLESEN_MS");
    expect(quelle).toContain('grund: "nicht_zugeordnet"');
  });

  it("wartet insgesamt hoechstens rund sechs Sekunden", () => {
    const summe = LEAD_MAIL_NACHLESEN_MS.reduce((a, b) => a + b, 0);
    expect(summe).toBeLessThanOrEqual(6_000);
  });
});
