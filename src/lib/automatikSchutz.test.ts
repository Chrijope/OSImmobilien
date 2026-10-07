import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Der Schutz der reinen Automatiken (Audit-Befund F08).
 *
 * Diese 18 Edge Functions stehen in `supabase/config.toml` mit
 * `verify_jwt = false`, weil pg_cron ohne Anmeldetoken aufruft. Sie waren
 * damit fuer jeden im Internet startbar: Mails an echte Kunden und Bewerber,
 * Schreibvorgaenge in der Pipeline. Seit dem 16.09.2026 verlangen sie das
 * Geheimwort aus `AUTOMATIK_GEHEIMWORT`.
 *
 * Hier wird nicht das Verhalten geprueft, sondern dass der Schutz ueberhaupt
 * an der richtigen Stelle steht. Genau das ist der Fehler, den niemand
 * bemerkt: Eine neue Automatik entsteht, der Einbau wird vergessen, und die
 * Luecke ist wieder da. Deno-Code laeuft nicht im Vitest-Prozess, deshalb
 * wird die Quelle gelesen.
 */

/** Die Automatiken, die das Geheimwort verlangen muessen. */
const AUTOMATIKEN = [
  "check-document-reminders",
  "eigene-investments-reminders",
  "lead-eskalation-check",
  "mail-nachzuegler",
  "recompute-pipeline",
  "send-aftersales-beratung-reminders",
  "send-bewerber-closing-reminders",
  "send-bewerber-erstgespraech-reminders",
  "send-bewerber-formular-erinnerungen",
  "send-bewerber-kennenlernen-erinnerungen",
  "send-birthday-emails",
  "send-followup-overdue-nudges",
  "send-reservierung-eskalation",
  "send-sla-inactivity-nudges",
  // Seit dem 04.10.2026, Zeitplan in 20261004190000.
  "send-termin-erinnerungen",
  "send-vertrag-hr-eskalation",
  "signatur-erinnerung",
  "system-health-check",
  "weekly-pipeline-mahnreport",
];

/**
 * Geschuetzt seit dem 04.10.2026, streng (ohne Uebergang). daily-backup
 * bekommt mit 20261004195000 einen Zeitplan mit dem Kopf x-internal-secret,
 * auto-purge-papierkorb bewusst keinen (der Papierkorb bleibt).
 */
const OHNE_ZEITPLAN = ["auto-purge-papierkorb", "daily-backup"];

/**
 * Bewusst offen, weil der Aufrufer kein Konto hat. Ein Geheimwort waere hier
 * ein kaputter Bewerberweg beziehungsweise ein kaputter Rechner auf der
 * Website. Ihr Schutz liegt im Token, im Honigtopf und im Rate-Limit.
 * Steht hier eines Tages doch `automatikSchutz`, ist das kein Fortschritt,
 * sondern ein Ausfall.
 */
const BEWUSST_OFFEN = [
  "bewerber-kein-interesse",
  "bewerber-seite",
  "steuer-auswertung-versand",
  "submit-bewerber-formular",
];

function quelle(name: string): string {
  return readFileSync(
    join(process.cwd(), "supabase", "functions", name, "index.ts"),
    "utf8",
  );
}

describe("Schutz der Automatiken", () => {
  it("der gemeinsame Helfer laesst im Uebergang durch, aber nur ohne Geheimwort", () => {
    const helfer = readFileSync(
      join(process.cwd(), "supabase", "functions", "_shared", "automatik-schutz.ts"),
      "utf8",
    );

    // Der Kopf ist der im Projekt uebliche.
    expect(helfer).toContain("x-internal-secret");

    /*
     * Der Wert aber ein eigener. `INGEST_SHARED_SECRET` signiert die Aufrufe
     * der Lead-Partner an `submit-lead` und traegt den Zapier-Eingang von
     * `send-bewerber-kennenlernen`. Wer es kennt, duerfte sonst zusaetzlich
     * alle Automatiken starten, und ein Wechsel riss beides zugleich ab.
     */
    expect(helfer).toContain('Deno.env.get("AUTOMATIK_GEHEIMWORT")');
    expect(helfer).not.toMatch(/Deno\.env\.get\("INGEST_SHARED_SECRET"\)/);

    // Der Uebergang: leere Umgebungsvariable heisst durchlassen und warnen.
    expect(helfer).toContain("if (!geheimwort)");
    expect(helfer).toContain("UEBERGANG");
    expect(helfer).toMatch(/console\.warn/);

    // Und danach ein 401, kein stilles Weiterlaufen.
    expect(helfer).toContain("status: 401");

    // Der Vergleich darf nicht Zeichen fuer Zeichen abbrechen.
    expect(helfer).toContain("gleichInFesterZeit");
    expect(helfer).not.toMatch(/mitgeschickt === geheimwort/);
  });

  it.each([...AUTOMATIKEN, ...OHNE_ZEITPLAN])("%s verlangt das Geheimwort", (name) => {
    const text = quelle(name);
    expect(text).toContain("../_shared/automatik-schutz.ts");
    expect(text).toContain(`automatikSchutz(req, `);
    expect(text).toMatch(/if \(abgewiesen\) return abgewiesen/);
  });

  it.each([...AUTOMATIKEN, ...OHNE_ZEITPLAN])("%s prueft, bevor es irgendetwas tut", (name) => {
    const zeilen = quelle(name).split("\n");
    const serve = zeilen.findIndex((z) => z.includes("Deno.serve("));
    const schutz = zeilen.findIndex((z) => z.includes("automatikSchutz(req,"));

    expect(serve).toBeGreaterThanOrEqual(0);
    expect(schutz).toBeGreaterThan(serve);

    /*
     * Hoechstens ein paar Zeilen hinter dem Einstieg. Dazwischen darf nur die
     * OPTIONS-Behandlung liegen. Rutscht die Pruefung hinter den ersten
     * Datenbankzugriff, ist sie wirkungslos.
     */
    expect(schutz - serve).toBeLessThanOrEqual(8);

    const dazwischen = zeilen.slice(serve + 1, schutz).join("\n");
    expect(dazwischen).not.toMatch(/createClient\(|\.from\(|sendeVorlage|\.rpc\(/);
  });

  it.each(BEWUSST_OFFEN)("%s bleibt offen, denn der Aufrufer hat kein Konto", (name) => {
    expect(quelle(name)).not.toContain("automatik-schutz.ts");
  });

  it("die Migration stellt genau dieselben Zeitplaene um", () => {
    // Spaeter dazugekommene Automatiken stellen eigene Migrationen um.
    const migration = [
      "20260916130000_automatiken_geheimwort.sql",
      "20261004190000_termin_erinnerungen_kopf.sql",
    ]
      .map((datei) => readFileSync(join(process.cwd(), "supabase", "migrations", datei), "utf8"))
      .join("\n");

    // Jede geschuetzte Automatik muss in der Liste der Migration stehen, sonst
    // ruft ihr Zeitplan ab dem Scharfschalten ohne Ausweis auf und faellt aus.
    for (const name of AUTOMATIKEN) {
      expect(migration).toContain(`'${name}'`);
    }

    // Das Geheimwort darf nicht in der Datei stehen, nur der Weg zu ihm.
    expect(migration).toContain("public.automatik_geheimnis()");
    expect(migration).toContain("vault.decrypted_secrets");

    // Und der Tresor muss denselben Namen tragen wie die Umgebungsvariable,
    // sonst schickt der Zeitplan ein anderes Wort als die Function erwartet.
    expect(migration).toContain("WHERE name = 'AUTOMATIK_GEHEIMWORT'");

    // app_config scheidet aus: dort darf jeder Angemeldete lesen.
    expect(migration).not.toMatch(/FROM public\.app_config/);
  });

  it("nur die Sicherung bekommt einen Zeitplan, mit Geheimwort und ohne Schluessel in der Datei", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20261004195000_sicherung_zeitplan.sql"),
      "utf8",
    );
    expect(migration).toContain("PERFORM cron.schedule(\n    'sicherung-taeglich',\n    '0 1 * * *',");
    expect(migration).toContain("'x-internal-secret', public.automatik_geheimnis()");
    // Der Papierkorb bleibt: kein Zeitplan, ein vorhandener wird entfernt.
    expect(migration).not.toContain("functions/v1/auto-purge-papierkorb");
    expect(migration).toContain("PERFORM cron.unschedule('papierkorb-leeren-taeglich');");
    // Kein Schluessel als Literal, er kommt zur Laufzeit aus cron.job.
    expect(migration).not.toMatch(/'eyJ[A-Za-z0-9_-]{20,}/);
    expect(migration).toContain("->> 'role' = 'anon'");
    // Ohne Geheimwort oder Schluessel wird nichts angelegt.
    expect(migration).toContain("IF public.automatik_geheimnis() = '' THEN");
    expect(migration).toContain("IF _anon IS NULL THEN");
    const kopie = readFileSync(
      join(process.cwd(), "supabase", "migrations-inbox", "20261004195000_sicherung_zeitplan.sql"),
      "utf8",
    );
    expect(kopie).toBe(migration);
  });
});
