/**
 * Die Content-Security-Policy lebt an genau einer Stelle: im meta-Tag von
 * index.html. Lovable wertet public/_headers nicht aus. Stünde dort trotzdem
 * eine zweite Fassung, gälte bei einem Hosting, das _headers kennt, nur die
 * Schnittmenge beider Regeln. So war es bis zum 26.09.2026: _headers erlaubte
 * weder reCAPTCHA noch das Meta-Pixel.
 *
 * Außerdem sichert der Test ab, dass die Website keine Schriften mehr bei
 * Google holt (keine Besucher-IP an fonts.googleapis.com/fonts.gstatic.com).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const wurzel = resolve(__dirname, "..", "..");
const indexHtml = readFileSync(join(wurzel, "index.html"), "utf8");
const headers = readFileSync(join(wurzel, "public", "_headers"), "utf8");

function cspAusIndexHtml(): string[] {
  const treffer = [...indexHtml.matchAll(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/g)];
  return treffer.map((t) => t[1]);
}

function direktive(csp: string, name: string): string[] {
  const teil = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));
  return teil ? teil.split(/\s+/).slice(1) : [];
}

function cssDateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return cssDateien(pfad);
    return pfad.endsWith(".css") ? [pfad] : [];
  });
}

const GOOGLE_FONTS = /fonts\.(googleapis|gstatic)\.com/;

describe("Content-Security-Policy", () => {
  it("steht genau einmal in index.html", () => {
    expect(cspAusIndexHtml()).toHaveLength(1);
  });

  it("hat in public/_headers keine zweite Fassung", () => {
    const zeilen = headers.split("\n").filter((z) => !z.trim().startsWith("#"));
    expect(zeilen.some((z) => /Content-Security-Policy\s*:/i.test(z))).toBe(false);
  });

  it("erlaubt reCAPTCHA und das Meta-Pixel", () => {
    const skripte = direktive(cspAusIndexHtml()[0], "script-src");
    expect(skripte).toContain("https://www.google.com/recaptcha/");
    expect(skripte).toContain("https://www.gstatic.com/recaptcha/");
    expect(skripte).toContain("https://connect.facebook.net");
  });

  it("nennt keine Google-Fonts-Quelle mehr", () => {
    expect(cspAusIndexHtml()[0]).not.toMatch(GOOGLE_FONTS);
    expect(direktive(cspAusIndexHtml()[0], "font-src")).toEqual(["'self'", "data:"]);
  });

  it("enthält kein frame-ancestors, das im meta-Tag nur einen Konsolenfehler erzeugt", () => {
    expect(cspAusIndexHtml()[0]).not.toContain("frame-ancestors");
  });
});

describe("Schriften ohne Google", () => {
  it("index.html lädt nichts von Google Fonts", () => {
    expect(indexHtml).not.toMatch(GOOGLE_FONTS);
  });

  it("kein Stylesheet unter src lädt von Google Fonts", () => {
    const mitGoogle = cssDateien(join(wurzel, "src")).filter((datei) => GOOGLE_FONTS.test(readFileSync(datei, "utf8")));
    expect(mitGoogle).toEqual([]);
  });
});
