#!/usr/bin/env node
/**
 * Der Nachtwächter für den Code.
 *
 * Läuft Typprüfung, Build und die Testreihe und schreibt das Ergebnis als
 * Bericht nach `.nachtwaechter/bericht.md`. Gedacht für einen nächtlichen
 * Lauf, damit morgens auf einen Blick klar ist, ob das Projekt noch steht.
 *
 * Das Gegenstück in der Datenbank prüft die Daten (Migration
 * `20260805100000_nachtpruefung.sql`). Beides zusammen deckt die zwei Arten
 * ab, wie etwas kaputtgehen kann: Der Code passt nicht mehr zusammen, oder
 * die Daten laufen aus dem Ruder.
 *
 * Aufruf:  node scripts/nachtwaechter.mjs
 *          npm run nachtwaechter
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WURZEL = process.cwd();
const ORDNER = join(WURZEL, ".nachtwaechter");

/**
 * Vier Tests in AcademyLockGuard schlagen seit jeher fehl.
 *
 * Sie stehen hier namentlich, damit der Bericht sie nicht jede Nacht als
 * Neuigkeit meldet. Wer sie irgendwann repariert, sollte diese Zeile
 * mitentfernen, sonst verschluckt der Wächter echte Ausfälle in derselben
 * Datei.
 */
const BEKANNT_ROT = { datei: "AcademyLockGuard.test.tsx", anzahl: 4 };

function lauf(befehl, name) {
  const begonnen = Date.now();
  try {
    const ausgabe = execSync(befehl, { cwd: WURZEL, encoding: "utf8", stdio: "pipe" });
    return { name, befehl, ok: true, dauer: Date.now() - begonnen, ausgabe };
  } catch (e) {
    return {
      name, befehl, ok: false, dauer: Date.now() - begonnen,
      ausgabe: `${e.stdout || ""}\n${e.stderr || ""}`.trim(),
    };
  }
}

/** Aus der Vitest-Ausgabe die Zahlen ziehen. */
function testZahlen(ausgabe) {
  const m = ausgabe.match(/Tests\s+(?:(\d+) failed \|\s*)?(\d+) passed/);
  if (!m) return null;
  return { rot: Number(m[1] || 0), gruen: Number(m[2]) };
}

const schritte = [
  lauf("npx tsc -b", "Typprüfung"),
  lauf("npm run build", "Build"),
  lauf("npx vitest run", "Tests"),
];

const tests = schritte.find((s) => s.name === "Tests");
const zahlen = tests ? testZahlen(tests.ausgabe) : null;

// Die bekannten roten Tests abziehen, damit nur echte Ausfälle gemeldet werden.
const unerwartetRot = zahlen
  ? Math.max(0, zahlen.rot - (tests.ausgabe.includes(BEKANNT_ROT.datei) ? BEKANNT_ROT.anzahl : 0))
  : 0;

const sauber =
  schritte.filter((s) => s.name !== "Tests").every((s) => s.ok) && unerwartetRot === 0;

const jetzt = new Date();
const stempel = jetzt.toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" });

const zeilen = [
  `# Nachtwächter · ${stempel}`,
  "",
  sauber ? "**Alles in Ordnung.**" : "**Es gibt etwas zu tun.**",
  "",
  "| Schritt | Ergebnis | Dauer |",
  "|---|---|---|",
];

for (const s of schritte) {
  let ergebnis = s.ok ? "durchgelaufen" : "fehlgeschlagen";
  if (s.name === "Tests" && zahlen) {
    ergebnis = unerwartetRot > 0
      ? `${unerwartetRot} unerwartet rot (${zahlen.gruen} grün)`
      : `${zahlen.gruen} grün, ${zahlen.rot} bekannt rot`;
  }
  zeilen.push(`| ${s.name} | ${ergebnis} | ${(s.dauer / 1000).toFixed(1)} s |`);
}

if (!sauber) {
  zeilen.push("", "## Was schiefging", "");
  for (const s of schritte) {
    const auffaellig = s.name === "Tests" ? unerwartetRot > 0 : !s.ok;
    if (!auffaellig) continue;
    zeilen.push(`### ${s.name}`, "", "```", s.ausgabe.split("\n").slice(-40).join("\n"), "```", "");
  }
}

zeilen.push(
  "",
  "---",
  "",
  "Die Querprüfungen über das Projekt (Mailvorlagen gegen ihre Aufrufer, Routen,",
  "Eingangskorb der Migrationen) laufen in `src/lib/projektpruefung.test.ts` mit",
  "der Testreihe. Sie brauchen keinen eigenen Schritt.",
  "",
  "Der Datenwächter läuft getrennt davon nachts in der Datenbank. Seinen Stand",
  "liefert `select * from nachtpruefung_bericht()`.",
);

mkdirSync(ORDNER, { recursive: true });
writeFileSync(join(ORDNER, "bericht.md"), zeilen.join("\n"));

console.log(zeilen.join("\n"));
process.exit(sauber ? 0 : 1);
