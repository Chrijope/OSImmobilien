/**
 * Hat die Sitzung des Aufrufers den zweiten Faktor wirklich benutzt?
 *
 * ---------------------------------------------------------------------------
 * Die Luecke (externes Audit vom 15.09.2026, Befund F04)
 * ---------------------------------------------------------------------------
 * Die Aktion `generate_recovery_codes` in `manage-mfa` hat bis zum 16.09.2026
 * nur geprueft, DASS jemand angemeldet ist. Sie loescht als Erstes alle
 * vorhandenen Wiederherstellungscodes des Kontos und stellt danach zehn neue
 * aus. Wer eine uebernommene Sitzung hatte, konnte sich damit frische Codes
 * geben lassen und den echten Besitzer aussperren: Dessen Zettel im Tresor war
 * ab diesem Augenblick wertlos.
 *
 * ---------------------------------------------------------------------------
 * Was Supabase dazu mitliefert
 * ---------------------------------------------------------------------------
 * Im Anmeldetoken steht die erreichte Sicherheitsstufe:
 *
 *   aal1  nur Passwort
 *   aal2  der zweite Faktor wurde in dieser Sitzung durchlaufen
 *
 * Sie steht als Anspruch `aal`. Daneben steht in `amr` die Liste der
 * tatsaechlich benutzten Nachweise, etwa `[{ method: "password" },
 * { method: "totp" }]`. `aal` ist die massgebliche Angabe; `amr` wird nur als
 * Rueckfall gelesen, falls `aal` einmal fehlt.
 *
 * ---------------------------------------------------------------------------
 * Warum hier ohne Signaturpruefung gelesen wird
 * ---------------------------------------------------------------------------
 * Der Aufrufer wird vorher mit `auth.getUser()` gegen Supabase geprueft. Erst
 * wenn das einen Nutzer liefert, ist der Token echt und unveraendert. Danach
 * werden hier die Ansprueche GENAU DIESES Tokens gelesen. Ein gefaelschter
 * Token kaeme gar nicht bis hierher.
 *
 * Deshalb gilt die Reihenfolge streng: erst `getUser()`, dann diese Pruefung.
 * Nie umgekehrt.
 *
 * ---------------------------------------------------------------------------
 * Fail closed
 * ---------------------------------------------------------------------------
 * Alles, was nicht eindeutig `aal2` ist, gilt als "zweiter Faktor nicht
 * benutzt". Ein fehlender Kopf, ein unlesbarer Token, ein fehlender Anspruch:
 * jedes davon ist ein Nein, nie ein Ja.
 */

/** Maschinenlesbare Kennung der Ablehnung. Die Oberflaeche schaltet daran. */
export const ZWEITER_FAKTOR_NOETIG = "zweiter_faktor_noetig"

/**
 * Der Text der Ablehnung. Er sagt dem Nutzer, was er tun muss, und nicht nur,
 * dass es nicht geht.
 */
export const ZWEITER_FAKTOR_TEXT =
  "Neue Wiederherstellungscodes gibt es nur, wenn du dich in dieser Sitzung mit "
  + "dem zweiten Faktor angemeldet hast. Bitte melde dich ab, melde dich neu an "
  + "und gib dabei den Code aus deiner Authenticator-App ein. Danach kannst du "
  + "dir neue Codes ausstellen lassen."

/** Ein Abschnitt eines base64url-Tokens in Text. Wirft nie. */
function abschnittLesen(abschnitt: string): unknown {
  try {
    const base64 = abschnitt.replace(/-/g, "+").replace(/_/g, "/")
    const gefuellt = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
    const roh = atob(gefuellt)
    // Umlaute in Anspruechen kommen als UTF-8 an. Ohne diesen Umweg wuerde
    // JSON.parse an einem Namen mit Umlaut scheitern.
    const bytes = Uint8Array.from(roh, (z) => z.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

/**
 * Die Ansprueche aus dem Anmeldetoken im Authorization-Kopf.
 *
 * Gibt `null` zurueck, wenn der Kopf fehlt, nicht mit `Bearer ` beginnt oder
 * der Token nicht aus drei Teilen besteht.
 */
export function ansprueche(authHeader: string | null | undefined): Record<string, unknown> | null {
  const kopf = String(authHeader ?? "").trim()
  if (!kopf) return null

  const token = kopf.toLowerCase().startsWith("bearer ") ? kopf.slice(7).trim() : kopf
  const teile = token.split(".")
  if (teile.length !== 3) return null

  const inhalt = abschnittLesen(teile[1])
  if (!inhalt || typeof inhalt !== "object" || Array.isArray(inhalt)) return null
  return inhalt as Record<string, unknown>
}

/**
 * Die Sicherheitsstufe der Sitzung, so wie sie im Token steht.
 *
 * `null`, wenn sie sich nicht ermitteln laesst. Der Rueckfall ueber `amr`
 * greift nur, wenn `aal` fehlt: Steht dort ausdruecklich `aal1`, bleibt es
 * dabei, auch wenn in `amr` irgendetwas nach einem zweiten Faktor aussieht.
 */
export function sitzungsStufe(authHeader: string | null | undefined): string | null {
  const inhalt = ansprueche(authHeader)
  if (!inhalt) return null

  const aal = inhalt.aal
  if (typeof aal === "string" && aal.trim()) return aal.trim().toLowerCase()

  // Rueckfall: Steht der zweite Faktor in der Nachweisliste, war er im Spiel.
  const amr = inhalt.amr
  if (Array.isArray(amr)) {
    const zweiterFaktor = amr.some((eintrag) => {
      const methode = typeof eintrag === "string"
        ? eintrag
        : String((eintrag as Record<string, unknown> | null)?.method ?? "")
      const klein = methode.trim().toLowerCase()
      return klein === "totp" || klein === "mfa/totp" || klein.endsWith("/totp")
    })
    if (zweiterFaktor) return "aal2"
  }

  return null
}

/**
 * Wurde der zweite Faktor in dieser Sitzung benutzt?
 *
 * Nur ein ausdrueckliches `aal2` zaehlt. Siehe "Fail closed" im Kopf.
 */
export function hatZweitenFaktor(authHeader: string | null | undefined): boolean {
  return sitzungsStufe(authHeader) === "aal2"
}

/**
 * Darf dieses Konto die Zwei-Faktor-Anmeldung selbst ausschalten?
 *
 * Nur Kundenkonten: Rolle `kunde`, hoechstens zusaetzlich `tippgeber`. Fuer
 * sie ist die Zwei-Faktor-Anmeldung seit dem 25.09.2026 freiwillig. Wer
 * daneben eine interne Rolle hat, faellt unter die interne Pflicht und darf
 * es nicht. Dieselbe Abgrenzung steht in der Datenbankfunktion
 * `public.kunde_zweiter_faktor_erfuellt()`.
 */
export function istReinesKundenkonto(rollen: readonly string[]): boolean {
  return rollen.includes("kunde") && rollen.every((r) => r === "kunde" || r === "tippgeber")
}
