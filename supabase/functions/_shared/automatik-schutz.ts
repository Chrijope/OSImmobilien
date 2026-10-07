/**
 * Schutz fuer die reinen Automatiken (pg_cron-Laeufe).
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * In `supabase/config.toml` steht bei den Zeitplan-Functions
 * `verify_jwt = false`. Das muss so sein, denn pg_cron ruft ohne Anmeldetoken
 * auf; mit Anmeldepflicht bliebe jede Nacht ein 401 stehen. Der Preis dafuer:
 * Die Adressen folgen einem festen Schema, viele stehen im Frontend-Code, und
 * ohne weitere Pruefung kann sie jeder aus dem Internet starten. Das reicht
 * von tausend Mails an echte Kunden bis zu Schreibvorgaengen in der Pipeline.
 *
 * Der Schutz ist deshalb ein gemeinsames Geheimwort im Kopf der Anfrage.
 * Uebernommen wird das Muster, das im Projekt schon laeuft: der Kopfzeilenname
 * `x-internal-secret`, wie in `dsgvo-purge-expired`, `dsgvo-hard-delete`,
 * `finalize-aftersales-beratung`, `finalize-selbstauskunft`,
 * `security-cockpit`, `send-bewerber-kennenlernen`, `submit-lead` und
 * `submit-sa-signature`. Zusaetzlich wird `Authorization: Bearer <Geheimwort>`
 * akzeptiert, so wie es `kennzahlen-mcp` mit seinem eigenen Geheimwort macht.
 *
 * WARUM EIN EIGENER NAME UND NICHT `INGEST_SHARED_SECRET`
 *
 * Der Kopf ist derselbe, der Wert bewusst nicht. `INGEST_SHARED_SECRET` ist
 * seit langem in Betrieb und liegt ausserhalb des Hauses: Damit signieren
 * Lead-Partner ihre Aufrufe an `submit-lead`, und daran haengt der
 * Zapier-Eingang von `send-bewerber-kennenlernen`. Wer dieses Geheimwort
 * kennt, koennte sonst zusaetzlich alle 18 Automatiken starten, und beim
 * Wechseln des Wortes fiele beides zugleich aus. Zwei Verwendungszwecke
 * gehoeren getrennt, deshalb `AUTOMATIK_GEHEIMWORT`.
 *
 * Der eigene Name hat einen zweiten Vorteil: Er ist garantiert noch nicht
 * gesetzt. Nur deshalb greift die Uebergangsregel weiter unten ueberhaupt.
 *
 * ---------------------------------------------------------------------------
 * UEBERGANG, MUSS WIEDER VERSCHWINDEN
 * ---------------------------------------------------------------------------
 *
 * Solange `AUTOMATIK_GEHEIMWORT` in der Umgebung gar nicht gesetzt ist, laesst
 * dieser Schutz jede Anfrage durch und schreibt eine deutliche Warnung ins
 * Protokoll. Das ist Absicht und nur fuer den Uebergang gedacht: Die Functions
 * und die Zeitplaene in der Datenbank werden nicht im selben Augenblick
 * umgestellt. Waere der Schutz sofort scharf, stuenden zwischen beiden
 * Schritten saemtliche Automatiken still, und das waere schlimmer als die
 * Luecke. Mit dieser Regelung ist die Reihenfolge egal, und der Schutz greift
 * genau in dem Moment, in dem das Geheimwort hinterlegt wird.
 *
 * Ist das Geheimwort gesetzt, verschwindet die Warnung von selbst. Steht sie
 * nach der Umstellung weiter im Protokoll, ist die Umgebungsvariable nicht
 * angekommen, und die Function steht weiter offen. Dann gehoert sie
 * nachgetragen, nicht ignoriert.
 */

/** Vergleich in gleichbleibender Zeit, damit sich das Geheimwort nicht
 *  Zeichen fuer Zeichen erraten laesst. Die Laengenpruefung vorweg verraet
 *  die Laenge; das ist bewusst hingenommen und harmlos, solange das Geheimwort
 *  zufaellig und lang genug ist. Gleiche Umsetzung wie in `kennzahlen-mcp`. */
function gleichInFesterZeit(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) {
    unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return unterschied === 0;
}

/**
 * Liest das mitgeschickte Geheimwort. Zwei Wege sind erlaubt:
 *   x-internal-secret: <Geheimwort>
 *   Authorization: Bearer <Geheimwort>
 *
 * Beide Seiten werden getrimmt. Ein Kopfwert kommt ohne Leerzeichen an den
 * Enden an, der Wert aus der Umgebung nicht: Ein einziges Leerzeichen beim
 * Einfuegen haette den Weg sonst lautlos geschlossen.
 */
function ausweisAusKopf(req: Request): string {
  const direkt = req.headers.get("x-internal-secret");
  if (direkt && direkt.trim()) return direkt.trim();

  const bearer = req.headers.get("authorization") || "";
  if (bearer.toLowerCase().startsWith("bearer ")) return bearer.slice(7).trim();

  return "";
}

/**
 * Prueft, ob diese Anfrage die Automatik starten darf.
 *
 * Rueckgabe:
 *   null      -> darf weiterlaufen
 *   Response  -> 401, unveraendert zurueckgeben und nichts weiter tun
 *
 * Aufruf am Anfang des Handlers, nach der OPTIONS-Behandlung:
 *
 *   const abgewiesen = automatikSchutz(req, "send-birthday-emails", corsHeaders);
 *   if (abgewiesen) return abgewiesen;
 */
export function automatikSchutz(
  req: Request,
  name: string,
  corsHeaders: Record<string, string> = {},
  /**
   * `streng`: Ohne Geheimwort wird immer abgewiesen, auch im Uebergang. Fuer
   * Automatiken ohne Zeitplan, bei denen der Durchlass nichts am Laufen
   * haelt (daily-backup, auto-purge-papierkorb, seit 04.10.2026).
   */
  optionen: { streng?: boolean } = {},
): Response | null {
  const geheimwort = (Deno.env.get("AUTOMATIK_GEHEIMWORT") || "").trim();
  if (!geheimwort && optionen.streng) {
    console.error(`[${name}] AUTOMATIK_GEHEIMWORT ist nicht gesetzt, Aufruf abgewiesen (streng).`);
    return new Response(
      JSON.stringify({ error: "Nicht autorisiert" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Uebergang: kein Geheimwort hinterlegt, also offen, aber laut.
  if (!geheimwort) {
    console.warn(
      `[${name}] UEBERGANG: AUTOMATIK_GEHEIMWORT ist nicht gesetzt. ` +
        `Diese Automatik steht bis dahin fuer jeden im Internet offen. ` +
        `Geheimwort in den Function-Secrets hinterlegen, dann verschwindet diese Warnung.`,
    );
    return null;
  }

  const mitgeschickt = ausweisAusKopf(req);
  if (gleichInFesterZeit(mitgeschickt, geheimwort)) return null;

  // Der Grund gehoert ins Protokoll. „Nicht autorisiert" allein sagt nicht,
  // ob ueberhaupt ein Ausweis mitkam und nur nicht passte. Der Wert selbst
  // wird nicht protokolliert, nur seine Laenge.
  console.warn(
    `[${name}] Abgewiesen: ${
      mitgeschickt
        ? `Ausweis passt nicht (Laenge ${mitgeschickt.length}, erwartet ${geheimwort.length})`
        : "kein Ausweis mitgeschickt"
    }`,
  );

  return new Response(
    JSON.stringify({ error: "Nicht autorisiert" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
