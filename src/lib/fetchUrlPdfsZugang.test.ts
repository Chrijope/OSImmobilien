/**
 * Wer darf `fetch-url-pdfs` aufrufen?
 *
 * Die Function hat keinen Eintrag in `supabase/config.toml`, es gilt also
 * `verify_jwt = true`. Das reicht nicht: Der oeffentliche anon-Schluessel ist
 * selbst ein gueltiges, vom Projekt signiertes JWT und steht im
 * ausgelieferten Frontend-Code. Jeder, der die Seite einmal geladen hat, kam
 * damit durch. Ein Aufruf holt bis zu 20 Dateien zu je 20 MB.
 *
 * Seit dem 16.09.2026 verlangt die Function eine echte Sitzung und begrenzt
 * die Zahl der Abrufe je Nutzer.
 *
 * Deno-Code laeuft nicht im Vitest-Prozess, deshalb wird die Quelle gelesen,
 * wie in `automatikSchutz.test.ts`. Geprueft wird das, was hier leicht
 * verlorengeht: dass die Pruefung ueberhaupt da ist und dass sie vor dem
 * ersten Abruf steht.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const quelle = readFileSync(
  join(process.cwd(), "supabase", "functions", "fetch-url-pdfs", "index.ts"),
  "utf8",
);

describe("fetch-url-pdfs verlangt eine echte Anmeldung", () => {
  it("der anon-Schluessel allein reicht nicht", () => {
    expect(quelle).toContain('Deno.env.get("SUPABASE_ANON_KEY")');
    // Genau dieser Vergleich unterscheidet den oeffentlichen Schluessel von
    // einer Sitzung. Faellt er weg, ist die Huerde wieder null.
    expect(quelle).toMatch(/if \(jwt === anonKey\) return null/);
    expect(quelle).toContain("auth.getUser()");
  });

  it("ohne Nutzer kommt ein 401 und kein Abruf", () => {
    expect(quelle).toMatch(/if \(!nutzerId\)/);
    expect(quelle).toContain("status: 401");
  });

  it("die Pruefung steht vor allem anderen", () => {
    const zeilen = quelle.split("\n");
    const einstieg = zeilen.findIndex((z) => z.includes("serve(async (req)"));
    const pruefung = zeilen.findIndex((z) => z.includes("await angemeldeterNutzer(req)"));
    const nutzlast = zeilen.findIndex((z) => z.includes("await req.json()"));
    const ersterAbruf = zeilen.findIndex((z) => z.includes("pruefeZieladresse(url)"));

    expect(einstieg).toBeGreaterThanOrEqual(0);
    expect(pruefung).toBeGreaterThan(einstieg);
    // Erst anmelden, dann die Nutzlast lesen, dann abrufen.
    expect(pruefung).toBeLessThan(nutzlast);
    expect(pruefung).toBeLessThan(ersterAbruf);

    // Dazwischen darf nur die OPTIONS-Behandlung liegen.
    const dazwischen = zeilen.slice(einstieg + 1, pruefung).join("\n");
    expect(dazwischen).not.toMatch(/sichereAbfrage|req\.json\(\)|\.from\(|\.rpc\(/);
  });

  it("keine Rollenliste, denn die Seite ist fuer viele Rollen erreichbar", () => {
    // Eine Liste wuerde mit hoher Wahrscheinlichkeit jemanden aussperren, der
    // die Objektseite zu Recht benutzt. Bewusste Entscheidung, siehe Kopf der
    // Function.
    expect(quelle).not.toContain("is_internal_role");
    expect(quelle).not.toContain("is_admin_role");
  });
});

describe("fetch-url-pdfs begrenzt den Aufwand je Nutzer", () => {
  it("nutzt den gemeinsamen Helfer", () => {
    expect(quelle).toContain("../_shared/edge-rate-limit.ts");
    expect(quelle).toMatch(/checkEdgeRateLimit\(\{/);
    expect(quelle).toContain('scope: "fetch-url-pdfs"');
  });

  it("das Kontingent haengt am Nutzer, nicht an der IP", () => {
    // Im Buero teilen sich mehrere Mitarbeiter eine Adresse. Eine IP-Grenze
    // wuerde sie gegenseitig ausbremsen.
    expect(quelle).toMatch(/key: nutzerId/);
    expect(quelle).not.toContain("clientIp");
  });

  it("die Grenzen stehen als benannte Zahlen im Code", () => {
    expect(quelle).toMatch(/const ANZAHL_PRO_STUNDE = 15;/);
    expect(quelle).toMatch(/const ANZAHL_PRO_TAG = 60;/);
    expect(quelle).toMatch(/perHour: ANZAHL_PRO_STUNDE/);
    expect(quelle).toMatch(/perDay: ANZAHL_PRO_TAG/);
  });

  it("wer darueber liegt, bekommt einen 429 mit deutschem Text", () => {
    expect(quelle).toContain("status: 429");
    expect(quelle).toMatch(/Bitte versuch es später noch einmal/);
  });
});

describe("der Aufrufer bleibt arbeitsfaehig", () => {
  const aufrufer = readFileSync(
    join(process.cwd(), "src", "components", "objekte", "ObjektUploadAnalyse.tsx"),
    "utf8",
  );

  it("ruft weiterhin ueber den angemeldeten Supabase-Client", () => {
    // `supabase.functions.invoke` gibt das Sitzungstoken mit. Ein eigener
    // `fetch` mit dem anon-Schluessel wuerde ab jetzt abgewiesen.
    expect(aufrufer).toContain('supabase.functions.invoke("fetch-url-pdfs"');
    expect(aufrufer).toContain('from "@/integrations/supabase/client"');
  });

  it("zeigt den echten Grund statt des englischen Sammelsatzes", () => {
    // Ohne `edgeFehlerMitGrund` stuende bei 401 und 429 nur „Edge Function
    // returned a non-2xx status code“ im Hinweis.
    expect(aufrufer).toContain("edgeFehlerMitGrund");
  });
});
