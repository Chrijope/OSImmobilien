import { translations as zxcvbnEnglisch } from "@zxcvbn-ts/language-en";
import i18n from "@/i18n";
import { evaluatePassword } from "./passwordSecurity";

/*
 * Die Meldungen der Passwortprüfung folgen der Anzeigesprache. Die Bewertung
 * selbst hängt nicht an der Sprache.
 */

const ZXCVBN_SAETZE = new Set([
  ...Object.values(zxcvbnEnglisch.warnings),
  ...Object.values(zxcvbnEnglisch.suggestions),
]);

afterEach(async () => {
  await i18n.changeLanguage("de");
});

describe("evaluatePassword: Meldungen", () => {
  it("meldet auf Deutsch Stufe und Hinweise deutsch, nicht die englischen zxcvbn-Sätze", async () => {
    const r = await evaluatePassword("abcabcabc");
    expect(r.label).toBe("Sehr schwach");
    expect(r.feedback.length).toBeGreaterThan(0);
    for (const hinweis of r.feedback) expect(ZXCVBN_SAETZE.has(hinweis)).toBe(false);
  });

  it("meldet auf Englisch englisch, mit derselben Bewertung", async () => {
    const deutsch = await evaluatePassword("abcabcabc");
    await i18n.changeLanguage("en");
    const englisch = await evaluatePassword("abcabcabc");
    expect(englisch.label).toBe("Very weak");
    expect(englisch.score).toBe(deutsch.score);
    expect(englisch.acceptable).toBe(deutsch.acceptable);
    expect(englisch.feedback).toHaveLength(deutsch.feedback.length);
    expect(englisch.feedback).not.toEqual(deutsch.feedback);
  });

  it("zeigt einen Hinweis nur einmal, auch wenn zwei zxcvbn-Sätze auf ihn führen", async () => {
    const r = await evaluatePassword("abcdefgh");
    expect(new Set(r.feedback).size).toBe(r.feedback.length);
  });
});
