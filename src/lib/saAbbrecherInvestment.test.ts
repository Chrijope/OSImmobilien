/**
 * H2 vom 04.10.2026: `send-sa-abbrecher-reminder` las `investment_id` nicht
 * mit. Die Pruefung "schon unterschrieben?" fragte deshalb nach einer leeren
 * Kennung und fand nie etwas, und wer schon unterschrieben hatte, bekam
 * trotzdem die Erinnerung.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const text = readFileSync(
  join(process.cwd(), "supabase", "functions", "send-sa-abbrecher-reminder", "index.ts"),
  "utf8",
);

describe("send-sa-abbrecher-reminder", () => {
  it("liest investment_id mit den offenen Tokens", () => {
    const auswahl = text.match(/\.from\("sa_fill_tokens"\)[\s\S]*?\.select\("([^"]+)"\)/)?.[1] || "";
    expect(auswahl.split(",").map((s) => s.trim())).toContain("investment_id");
  });

  it("prueft das Investment und bricht bei einem Lesefehler ab", () => {
    expect(text).toContain('.eq("id", t.investment_id)');
    expect(text).toContain("if (invError) throw invError;");
  });
});
