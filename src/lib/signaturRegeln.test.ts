/**
 * `public.signature_requests` darf keinen offenen Zugriff ohne Anmeldung haben.
 *
 * In dieser Tabelle liegt das Heikelste, was das System kennt: die
 * vollstaendige Selbstauskunft in `sa_data`, das Bild der Unterschrift in
 * `signature_data`, dazu Name, Mailadresse und IP-Adresse. Eine Regel wie
 *
 *   CREATE POLICY "..." ON public.signature_requests
 *   FOR SELECT TO anon, authenticated USING (true);
 *
 * gibt all das jedem heraus, der die Adresse der Datenbank kennt. Genau so
 * eine Regel stand hier zweimal in der Geschichte. Sie ist beide Male wieder
 * entfernt worden, das zweite Mal am 16.09.2026 durch
 * 20260916200000_signature_requests_dichtmachen.sql.
 *
 * Wer ohne Anmeldung unterschreiben soll, braucht keine Regel: Der Weg laeuft
 * ueber `get_signature_request` und `sign_signature_request`, beide sind
 * SECURITY DEFINER und umgehen die Zeilensicherheit. Eine offene Regel macht
 * ausserdem die Absicherungen in `get_signature_request` wirkungslos, denn wer
 * die Tabelle direkt lesen kann, braucht die Funktion nicht.
 *
 * Dieser Test faellt um, sobald jemand wieder eine solche Regel anlegt.
 *
 * Die schwierige Stelle beim Lesen der Migrationen: Eine Regel verschwindet
 * nicht nur durch ein DROP POLICY mit ihrem eigenen Namen. Sie kann auch einem
 * Block zum Opfer fallen, der ueber `pg_policies` laeuft und alles wegraeumt,
 * dessen Bedingung `true` lautet. Genau das ist den beiden historischen Regeln
 * passiert, und wer nur nach den Namen sucht, haelt sie faelschlich fuer noch
 * aktiv. Die Auswertung unten kennt beide Wege.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONEN = join(process.cwd(), "supabase", "migrations");
const TABELLE = "signature_requests";

/** Migrationen in Laufreihenfolge, ohne die iCloud-Kopien. */
function alleMigrationen(): string[] {
  return readdirSync(MIGRATIONEN)
    .filter((n) => n.endsWith(".sql"))
    .filter((n) => !/ \d+\.sql$/.test(n))
    .sort();
}

/**
 * Kommentare entfernen, sonst zaehlt der Test zitierte Regeln mit.
 *
 * Die Migration vom 16.09.2026 zitiert die beiden alten Regeln im
 * Kommentarkopf im Wortlaut, damit nachvollziehbar bleibt, worum es ging.
 * Ohne diesen Schritt wuerde der Test genau an dieser Erklaerung umfallen.
 */
function ohneKommentare(sql: string): string {
  return sql
    .split("\n")
    .map((zeile) => {
      const stelle = zeile.indexOf("--");
      return stelle === -1 ? zeile : zeile.slice(0, stelle);
    })
    .join("\n");
}

type Regel = { name: string; datei: string; block: string };

/** Gilt diese Regel auch fuer den nicht angemeldeten Zugriff? */
function giltFuerAnon(block: string): boolean {
  const zuweisung = block.match(/\bTO\s+([A-Za-z_ ,\t\n]+?)(?:\bUSING\b|\bWITH\b|$)/i);
  // Ohne TO-Angabe gilt eine Regel fuer alle, also auch fuer anon.
  if (!zuweisung) return true;
  return /\b(anon|public)\b/i.test(zuweisung[1]);
}

/** Ist die Bedingung offen, laesst sie also jede Zeile durch? */
function istOffen(block: string): boolean {
  return (
    /\bUSING\s*\(\s*true\s*\)/i.test(block) ||
    /\bWITH\s+CHECK\s*\(\s*true\s*\)/i.test(block)
  );
}

/**
 * Raeumt eine Datei Regeln dynamisch weg, statt sie namentlich zu nennen?
 *
 * Erkennungsmerkmal ist ein Block, der `pg_policies` nach dieser Tabelle
 * durchsucht und die Treffer per EXECUTE loescht. Solche Blocke gibt es zwei:
 * den vom 02.04.2026 und den vom 16.09.2026.
 */
function hatRiegel(sql: string): boolean {
  return (
    sql.includes("pg_policies") &&
    sql.includes(TABELLE) &&
    /EXECUTE\s+format\s*\(\s*'DROP POLICY/i.test(sql)
  );
}

/**
 * Die Regeln, die am Ende der Chronologie wirklich auf der Tabelle liegen.
 *
 * Spaetere Migrationen ersetzen fruehere, deshalb wird von vorn nach hinten
 * gelaufen und bei jedem Schritt angelegt beziehungsweise entfernt.
 */
function regelnAmEnde(): Map<string, Regel> {
  const stand = new Map<string, Regel>();

  for (const datei of alleMigrationen()) {
    const sql = ohneKommentare(readFileSync(join(MIGRATIONEN, datei), "utf8"));
    if (!sql.includes(TABELLE)) continue;

    // Namentlich entfernen. Laeuft vor dem Anlegen, weil eine Migration
    // ueblicherweise erst droppt und dann dieselbe Regel neu anlegt.
    const drop = new RegExp(
      `DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?"([^"]+)"\\s+ON\\s+public\\.${TABELLE}`,
      "gi",
    );
    let treffer: RegExpExecArray | null;
    while ((treffer = drop.exec(sql)) !== null) stand.delete(treffer[1]);

    // Anlegen.
    const create = new RegExp(
      `CREATE\\s+POLICY\\s+"([^"]+)"\\s+ON\\s+public\\.${TABELLE}\\b([\\s\\S]*?);`,
      "gi",
    );
    while ((treffer = create.exec(sql)) !== null) {
      stand.set(treffer[1], { name: treffer[1], datei, block: treffer[2] });
    }

    // Der dynamische Riegel raeumt hinterher alles Offene weg.
    if (hatRiegel(sql)) {
      for (const [name, regel] of [...stand]) {
        if (istOffen(regel.block)) stand.delete(name);
      }
    }
  }

  return stand;
}

describe("signature_requests hat keinen offenen Zugriff ohne Anmeldung", () => {
  it("keine geltende Regel verbindet anon mit einer offenen Bedingung", () => {
    const offen = [...regelnAmEnde().values()].filter(
      (r) => giltFuerAnon(r.block) && istOffen(r.block),
    );

    // Die Meldung nennt Regel und Datei, damit der Befund ohne Suchen
    // nachvollziehbar ist.
    expect(
      offen.map((r) => `${r.name} (${r.datei})`),
      "Offene Regel fuer anon auf signature_requests",
    ).toEqual([]);
  });

  it("ueberhaupt keine geltende Regel nennt anon", () => {
    // Schaerfer als der Test darueber: Auch eine eingeschraenkte anon-Regel
    // soll es hier nicht geben. Der oeffentliche Weg laeuft ueber die beiden
    // SECURITY DEFINER-Funktionen, nicht ueber die Tabelle.
    const fuerAnon = [...regelnAmEnde().values()].filter((r) =>
      /\bTO\s+[A-Za-z_ ,\t\n]*\banon\b/i.test(r.block),
    );
    expect(fuerAnon.map((r) => `${r.name} (${r.datei})`)).toEqual([]);
  });

  it("die beiden gemeldeten Regeln sind namentlich entfernt", () => {
    const riegel = readFileSync(
      join(MIGRATIONEN, "20260916200000_signature_requests_dichtmachen.sql"),
      "utf8",
    );
    for (const name of ["Anon lesen per Token", "Anon aktualisieren per Token"]) {
      expect(riegel).toContain(`DROP POLICY IF EXISTS "${name}" ON public.signature_requests;`);
    }
  });
});

describe("die berechtigten Wege bleiben offen", () => {
  const stand = regelnAmEnde();

  it("Mitarbeiter lesen nur eigene Kunden, Loeschen bleibt beim Admin (seit 29.09.2026)", () => {
    const lesen = stand.get("Interne sehen Signaturanfragen eigener Kunden")?.block ?? "";
    expect(lesen).toMatch(/FOR\s+SELECT/i);
    expect(lesen).toContain("darf_alle_kunden_sehen");
    expect(lesen).toContain("ist_eigener_kontakt");
    // Partnervertraege liest der Bewerberbereich, auch die Rolle hr.
    expect(lesen).toContain("darf_bewerberbereich");
    expect(stand.has("Interne sehen Signatur-Requests")).toBe(false);
    expect(stand.get("Admins loeschen Signatur-Requests")?.block).toContain("is_admin_role");
  });

  it("der angemeldete Kunde sieht seine eigenen Zeilen", () => {
    const regel = stand.get("Kunden sehen eigene Signaturanfragen");
    expect(regel, "Ohne diese Regel sieht der Kunde im Portal seine eigenen Unterschriften nicht").toBeDefined();
    expect(regel!.block).toContain("ist_kunde_des_kontakts");
    // Nur lesen. Unterschrieben wird ueber sign_signature_request.
    expect(regel!.block).toMatch(/FOR\s+SELECT/i);
    expect(regel!.block).toMatch(/TO\s+authenticated/i);
    expect(regel!.block).not.toMatch(/\banon\b/i);
  });

  it("die Pruefung des Kunden kann nicht unbekannt liefern", () => {
    // FALSE OR NULL ist NULL, und eine Sperre auf NULL greift nicht. Diese
    // Fehlerklasse war am 16.09.2026 schon an fuenf Stellen die Ursache.
    const riegel = readFileSync(
      join(MIGRATIONEN, "20260916200000_signature_requests_dichtmachen.sql"),
      "utf8",
    );
    const rumpf = riegel.slice(riegel.indexOf("FUNCTION public.ist_kunde_des_kontakts"));
    expect(rumpf).toContain("COALESCE");
    expect(rumpf).toContain("SECURITY DEFINER");
    // Ohne Anmeldung darf die Funktion gar nicht erst aufrufbar sein.
    expect(riegel).toContain(
      "REVOKE ALL ON FUNCTION public.ist_kunde_des_kontakts(uuid, uuid) FROM anon;",
    );
  });

  it("die Unterschriftsseite fasst die Tabelle nicht direkt an", () => {
    // Sie arbeitet ueber die SECURITY DEFINER-Funktionen und ist deshalb von
    // den Zugriffsregeln unabhaengig. Ein Direktzugriff hier waere ohne
    // Anmeldung sofort tot.
    const seite = readFileSync(join(process.cwd(), "src", "pages", "SignaturSeite.tsx"), "utf8");
    expect(seite).not.toContain(`from("${TABELLE}")`);
    expect(seite).toContain('rpc("get_signature_request"');
    expect(seite).toContain('rpc("sign_signature_request"');
  });
});

/**
 * Seit dem 29.09.2026 schreibt kein angemeldeter Nutzer mehr direkt in die
 * Tabelle (Christians Entscheidung). Anlegen und Aendern laufen ueber Edge
 * Functions mit Dienstschluessel und SECURITY-DEFINER-Funktionen, die pruefen,
 * ob der Kunde zum Nutzer gehoert.
 */
describe("signature_requests: Schreiben nur serverseitig", () => {
  const stand = regelnAmEnde();
  const MIGRATION = join(MIGRATIONEN, "20260929200000_signaturanfragen_nur_serverseitig.sql");

  it("keine erlaubende INSERT- oder UPDATE-Regel mehr", () => {
    const schreibend = [...stand.values()].filter(
      (r) => /FOR\s+(INSERT|UPDATE|ALL)\b/i.test(r.block) && !/AS\s+RESTRICTIVE/i.test(r.block),
    );
    expect(schreibend.map((r) => `${r.name} (${r.datei})`)).toEqual([]);
  });

  it("die alten Schreibregeln sind namentlich entfernt, auch die doppelte", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    for (const name of [
      "Interne erstellen Signatur",
      "Interne erstellen Signatur-Requests",
      "Interne bearbeiten Signatur-Requests",
    ]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${name}" ON public.signature_requests;`);
    }
    // Der Riegel trifft nur erlaubende Regeln, die einschraenkenden bleiben.
    expect(sql).toContain("permissive = 'PERMISSIVE'");
  });

  it("die einschraenkende Regel fuer Partnervertraege bleibt", () => {
    expect(stand.get("Partnervertraege nur Bewerberbereich")?.block).toMatch(/AS\s+RESTRICTIVE/i);
  });

  it("aftersales_signatur_anlegen prueft den Kunden und ist nur fuer Angemeldete", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const rumpf = sql.slice(sql.indexOf("FUNCTION public.aftersales_signatur_anlegen"));
    expect(rumpf).toContain("SECURITY DEFINER");
    expect(rumpf).toContain("SET search_path = public");
    // Der Kontakt kommt aus dem Investment, nicht aus dem Aufruf.
    expect(rumpf).toMatch(/SELECT i\.kunde_id,[^\n]*\n\s+INTO _kontakt_id, _vp_unterschrieben\s+FROM public\.investments i/);
    expect(rumpf).toContain("ist_eigener_kontakt(_uid, _kontakt_id::text)");
    expect(rumpf).toContain("darf_alle_kunden_sehen(_uid)");
    // NULL aus einer Rollenfunktion heisst "nein".
    expect(rumpf).toMatch(/NOT COALESCE\(/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.aftersales_signatur_anlegen(uuid, jsonb, text) FROM anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.aftersales_signatur_anlegen(uuid, jsonb, text) TO authenticated;");
  });

  it("im Browser schreibt nur noch der Rueckfall bis zur Migration direkt", () => {
    // Alle Dateien unter src, die die Tabelle anfassen, ohne Tests.
    const treffer: string[] = [];
    const lauf = (ordner: string) => {
      for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = join(ordner, eintrag.name);
        if (eintrag.isDirectory()) { lauf(pfad); continue; }
        if (!/\.(ts|tsx)$/.test(eintrag.name) || /\.test\./.test(eintrag.name)) continue;
        if (pfad.includes(join("integrations", "supabase"))) continue;
        const text = readFileSync(pfad, "utf8");
        const schreibt = new RegExp(
          `from\\(\\s*["']${TABELLE}["']\\s*\\)[\\s\\S]{0,80}?\\.(insert|update|upsert)\\(`,
        );
        if (schreibt.test(text)) treffer.push(pfad.slice(process.cwd().length + 1));
      }
    };
    lauf(join(process.cwd(), "src"));
    expect(treffer).toEqual([join("src", "lib", "aftersalesSignatur.ts")]);

    const dialog = readFileSync(
      join(process.cwd(), "src", "components", "kunde", "investments", "AftersalesBeratungDialog.tsx"),
      "utf8",
    );
    expect(dialog).not.toContain(`from("${TABELLE}")`);
    expect(dialog).toContain("aftersalesSignaturAnlegen(");
    expect(dialog).toContain("aftersalesVpUnterschreiben(");
  });
});

/**
 * Nachbesserung aus der Gegenpruefung vom 29.09.2026: Mit dem Token laesst
 * sich ueber die oeffentliche Seite im Namen des Kunden unterschreiben. Der
 * Browser liest ihn deshalb nicht mehr, und nur zwei erlaubende Leseregeln
 * bleiben stehen.
 */
describe("signature_requests: Token nur auf dem Server, genau zwei Leseregeln", () => {
  const sql = readFileSync(
    join(MIGRATIONEN, "20260929200000_signaturanfragen_nur_serverseitig.sql"),
    "utf8",
  );
  const stand = regelnAmEnde();

  it("genau zwei erlaubende SELECT-Regeln, jede weitere raeumt der Riegel weg", () => {
    const lesend = [...stand.values()]
      .filter((r) => /FOR\s+SELECT/i.test(r.block) && !/AS\s+RESTRICTIVE/i.test(r.block))
      .map((r) => r.name)
      .sort();
    expect(lesend).toEqual([
      "Interne sehen Signaturanfragen eigener Kunden",
      "Kunden sehen eigene Signaturanfragen",
    ]);
    expect(sql).toMatch(/cmd = 'SELECT'\s+AND policyname NOT IN \('Interne sehen Signaturanfragen eigener Kunden',\s+'Kunden sehen eigene Signaturanfragen'\)/);
  });

  it("Tabellenrechte: kein Schreiben, Lesen spaltenweise ohne token", () => {
    expect(sql).toContain("REVOKE ALL ON public.signature_requests FROM anon;");
    expect(sql).toMatch(/REVOKE SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER\s+ON public\.signature_requests FROM authenticated;/);
    // Am Zeilenanfang: Der Kommentarkopf erwaehnt GRANT SELECT (...) auch.
    const grant = sql.match(/^GRANT SELECT \(([\s\S]*?)\) ON public\.signature_requests TO authenticated;/m);
    expect(grant, "spaltenweises Leserecht fehlt").not.toBeNull();
    const spalten = grant![1].split(",").map((s) => s.trim());
    expect(spalten).not.toContain("token");
    expect(spalten).toEqual(expect.arrayContaining(["id", "kontakt_id", "person_type", "status", "created_at", "sa_data"]));
  });

  it("kein Browser-Select liest token oder alle Spalten", () => {
    const treffer: string[] = [];
    const lauf = (ordner: string) => {
      for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = join(ordner, eintrag.name);
        if (eintrag.isDirectory()) { lauf(pfad); continue; }
        if (!/\.(ts|tsx)$/.test(eintrag.name) || /\.test\./.test(eintrag.name)) continue;
        const text = readFileSync(pfad, "utf8");
        const muster = new RegExp(`from\\(\\s*["']${TABELLE}["']\\s*\\)\\s*\\.select\\(\\s*["'\`]([^"'\`]*)["'\`]`, "g");
        let m: RegExpExecArray | null;
        while ((m = muster.exec(text)) !== null) {
          if (/\btoken\b|\*/.test(m[1])) treffer.push(`${pfad.slice(process.cwd().length + 1)}: ${m[1]}`);
        }
      }
    };
    lauf(join(process.cwd(), "src"));
    expect(treffer).toEqual([]);
  });

  it("Aftersales: Obergrenze fuer das Formular, alte offene Anfragen werden ueberholt", () => {
    const rumpf = sql.slice(sql.indexOf("FUNCTION public.aftersales_signatur_anlegen"));
    expect(rumpf).toMatch(/octet_length\(COALESCE\(_formular, '\{\}'::jsonb\)::text\) > 32768/);
    expect(rumpf).toMatch(/SET status = 'ueberholt'[\s\S]*?person_type IN \('aftersales_vp', 'aftersales_kunde'\)[\s\S]*?AND status = 'pending'/);
    // Erst abloesen, dann anlegen.
    expect(rumpf.indexOf("'ueberholt'")).toBeLessThan(rumpf.indexOf("INSERT INTO public.signature_requests"));
  });

  it("finalize-aftersales-beratung nimmt nur den Token, der zur Phase passt", () => {
    const fn = readFileSync(
      join(process.cwd(), "supabase", "functions", "finalize-aftersales-beratung", "index.ts"),
      "utf8",
    );
    expect(fn).toContain('const erwartet = phase === "vp" ? "aftersales_vp" : "aftersales_kunde";');
    expect(fn).toContain("sigReq.person_type === erwartet");
  });

  it("der erneute Versand liest den Token nur auf dem Server und prueft den Aufrufer", () => {
    const fn = readFileSync(
      join(process.cwd(), "supabase", "functions", "signatur-link-erinnern", "index.ts"),
      "utf8",
    );
    // Aftersales: Sichtbarkeit des Investments mit den Rechten des Aufrufers.
    expect(fn).toContain('userClient.from("investments").select("id, kunde_id")');
    // Partnervertrag: nur der Bewerberbereich.
    expect(fn).toContain('admin.rpc("darf_bewerberbereich", { _uid: uid })');
    // Empfaenger nie aus dem Aufruf.
    expect(fn).not.toMatch(/recipientEmail:\s*body/);
    const card = readFileSync(
      join(process.cwd(), "src", "components", "kunde", "investments", "AftersalesBeratungCard.tsx"),
      "utf8",
    );
    expect(card).not.toContain(`from("${TABELLE}")`);
    expect(card).toContain('signaturLinkErinnern({ art: "aftersales_kunde"');
  });
});

/** Zweitpruefung vom 29.09.2026: B2, H1, H2, H3. */
describe("signature_requests: kein Token an den Browser, Aftersales-Ablauf dicht", () => {
  const lies = (...teile: string[]) => readFileSync(join(process.cwd(), ...teile), "utf8");

  it("die Versand-Functions geben keinen Token an den Browser zurueck", () => {
    for (const fn of ["send-signature-request", "send-reservation-signature"]) {
      const text = lies("supabase", "functions", fn, "index.ts");
      const pushes = text.match(/results\.push\(\{[\s\S]*?\}\);/g) ?? [];
      expect(pushes.length, fn).toBeGreaterThan(0);
      for (const p of pushes) expect(p, fn).not.toMatch(/\btoken\b/);
      expect(text, fn).not.toMatch(/const results: \{[^}]*\btoken\b/);
    }
    const vertrag = lies("supabase", "functions", "send-vertrag-signature", "index.ts");
    expect(vertrag).not.toMatch(/JSON\.stringify\(\{\s*success: true,\s*token\b/);
    // Die Oberflaeche liest aus der Antwort nur sent, email, personType und grund.
    const ergebnis = lies("src", "lib", "versandErgebnis.ts");
    expect(ergebnis).not.toMatch(/\.token\b/);
  });

  it("die Signaturseite schliesst die Aftersales-Beratung mit phase kunde ab", () => {
    const seite = lies("src", "pages", "SignaturSeite.tsx");
    expect(seite).toContain('...(isAftersalesKunde ? { phase: "kunde", signature: signatureData, signerName: request.name } : {}),');
  });

  it("finalize-aftersales-beratung nimmt keinen abgeloesten oder abgelaufenen Token", () => {
    const fn = lies("supabase", "functions", "finalize-aftersales-beratung", "index.ts");
    expect(fn).toContain('.select("kontakt_id, investment_id, person_type, status, expires_at")');
    expect(fn).toContain('const statusOk = sigReq?.status === "pending" || sigReq?.status === "signed";');
    expect(fn).toMatch(/sigReq\.person_type === erwartet && statusOk && nichtAbgelaufen/);
  });

  it("aftersales_signatur_anlegen bricht ab, wenn der Partner schon unterschrieben hat", () => {
    const sql = readFileSync(join(MIGRATIONEN, "20260929200000_signaturanfragen_nur_serverseitig.sql"), "utf8");
    const rumpf = sql.slice(sql.indexOf("FUNCTION public.aftersales_signatur_anlegen"));
    expect(rumpf).toContain("i.meta -> 'aftersalesBeratung' ->> 'vpSignedAt'");
    expect(rumpf).toMatch(/FOR UPDATE;/);
    expect(rumpf).toMatch(/IF _vp_unterschrieben IS NOT NULL THEN\s+RAISE EXCEPTION/);
    // Die Pruefung steht vor dem Abloesen alter Anfragen.
    expect(rumpf.indexOf("_vp_unterschrieben IS NOT NULL")).toBeLessThan(rumpf.indexOf("'ueberholt'"));
  });

  it("die Reihenfolge Push, Ausrollen, Publish, Migration steht in Migration und Eingangskorb", () => {
    const sql = readFileSync(join(MIGRATIONEN, "20260929200000_signaturanfragen_nur_serverseitig.sql"), "utf8");
    // Seit dem 30.09.2026 ausgefuehrt und aus dem Eingangskorb entfernt; die
    // Reihenfolge bleibt in der Migration selbst dokumentiert.
    expect(sql).toMatch(/1\. Push nach main\.[\s\S]*2\. In Lovable ausrollen[\s\S]*3\. Publish in Lovable\.[\s\S]*4\. Erst dann diese Migration/);
  });
});
