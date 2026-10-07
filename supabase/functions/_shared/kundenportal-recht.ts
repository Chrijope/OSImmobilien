/**
 * Wer darf das Kundenportal eines Kontakts verwalten?
 *
 * Gemeint sind drei Handgriffe: Portal sperren, Portal entsperren und die
 * Einladung (erneut) versenden. Christian hat am 23.09.2026 festgelegt, dass
 * das nur drei Personengruppen duerfen:
 *
 *   1. Admin,
 *   2. Inhaber,
 *   3. der zustaendige Vertriebspartner des Kontakts.
 *
 * Vorher entschied das allein die Rolle. Sperren lief ueber die
 * Datenbankfunktion `merge_kontakt_meta`, die jede interne Rolle durchlaesst,
 * und `invite-user` liess jeden Vertriebspartner und Vertriebsleiter fuer
 * jeden beliebigen Kontakt einladen. Ein fremder Partner konnte damit einen
 * Kunden aussperren, wieder hereinlassen oder eine fremde `kontaktId` mit
 * einer Mailadresse seiner Wahl verknuepfen.
 *
 * ---------------------------------------------------------------------------
 * Was „zustaendig“ heisst
 * ---------------------------------------------------------------------------
 * Dieselbe Reihenfolge wie `kontaktBelongsToUser` im Browser
 * (`src/lib/kontaktOwnership.ts`), damit Knopf und Server dasselbe sagen:
 *
 *   - Steht `kontakte.zustaendig_id`, zaehlt sie und eine heute laufende
 *     Vertretung dieser Person (Tabelle `abwesenheiten`, wie
 *     `ist_aktive_vertretung` in der Datenbank).
 *   - Fehlt sie, zaehlt `meta.erstelltVonId`, also wer den Kontakt angelegt hat.
 *
 * Seit dem 04.10.2026 (Pruefung durch Codex) in jedem Fall nur mit einer
 * Partnerrolle (`vertriebspartner` oder `vertriebsleiter`). Tippgeber und
 * Setterin legen Kontakte an, verwalten aber nie das Portal eines Kunden,
 * auch nicht ueber den Rueckfall auf den Ersteller.
 *
 * Bewusst NICHT:
 *   - der Beratername (`berater`). Namen sind nicht eindeutig, im Haus gibt es
 *     zwei Konten mit demselben Namen. Personen gehen ueber die Kennung.
 *   - Teamleiter und Vertriebsleiter ohne eigene Zustaendigkeit.
 *
 * Admin und Inhaber zaehlen ueber `user_roles`, also jede zugewiesene Rolle,
 * nicht die gerade im Browser gewaehlte. Das ist dieselbe Quelle wie
 * `is_admin_role` in der Datenbank.
 *
 * Die Pruefung laeuft in der Edge Function und nicht in der Datenbank, damit
 * sie auch greift, solange die Migration
 * `20260923180000_kundenportal_sperre.sql` noch nicht gelaufen ist.
 */

/** Die eine Ablehnung, egal warum. Beginnt mit „Keine Berechtigung“, daran erkennt der Browser, dass ein zweiter Versuch nichts bringt. */
export const KUNDENPORTAL_ABGELEHNT =
  "Keine Berechtigung: Das Kundenportal dieses Kontakts verwalten nur der zuständige Vertriebspartner, seine Vertretung, Admin und Inhaber."

/** Wenn die Pruefung selbst nicht durchlaeuft. Auch dann wird nichts getan. */
export const KUNDENPORTAL_NICHT_PRUEFBAR =
  "Die Berechtigung für diesen Kontakt konnte nicht geprüft werden. Bitte versuche es gleich noch einmal."

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function istUuid(wert: unknown): wert is string {
  return typeof wert === "string" && UUID.test(wert.trim())
}

/** So viel vom Kontakt, wie die Pruefung und das Sperren brauchen. */
export interface PortalKontakt {
  id: string
  zustaendig_id: string | null
  meta: Record<string, unknown> | null
}

export interface RechtEingabe {
  aufruferId: string
  /** Alle Rollen des Aufrufers aus `user_roles`. */
  rollen: string[]
  kontakt: PortalKontakt | null
  /** Vertritt der Aufrufer heute den Zustaendigen? */
  vertretungAktiv?: boolean
}

/** Nur diese Rollen verwalten als Zustaendige das Portal eines Kunden. */
export const PORTAL_PARTNER_ROLLEN = ["vertriebspartner", "vertriebsleiter"] as const

/**
 * Die Entscheidung selbst, ohne Datenbank. Nur ein ausdrueckliches Ja zaehlt:
 * fehlt der Kontakt oder die Kennung, ist die Antwort nein.
 */
export function entscheideKundenportalRecht({ aufruferId, rollen, kontakt, vertretungAktiv = false }: RechtEingabe): boolean {
  if (!istUuid(aufruferId)) return false
  if (rollen.includes("admin") || rollen.includes("inhaber")) return true
  if (!kontakt) return false
  if (!rollen.some((r) => (PORTAL_PARTNER_ROLLEN as readonly string[]).includes(r))) return false

  const zustaendig = typeof kontakt.zustaendig_id === "string" ? kontakt.zustaendig_id.trim() : ""
  if (zustaendig) return zustaendig.toLowerCase() === aufruferId.toLowerCase() || vertretungAktiv

  // Rueckfall auf den Ersteller nur ohne Zustaendigen; die Partnerrolle des
  // Erstellers ist oben schon geprueft, denn hier ist er der Aufrufer.
  const ersteller = kontakt.meta?.erstelltVonId
  return typeof ersteller === "string" && ersteller.trim().toLowerCase() === aufruferId.toLowerCase()
}

/** Heutiger Kalendertag in Europe/Berlin als JJJJ-MM-TT, wie `ist_aktive_vertretung`. */
export function heuteInBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(jetzt)
}

/**
 * So viel vom Service-Role-Client, wie hier gebraucht wird. `from` liefert
 * bewusst `unknown`: Gegen eine genaue Beschreibung laesst sich der echte
 * Supabase-Client nicht pruefen, Deno bricht mit „Type instantiation is
 * excessively deep“ ab. Die Abfragekette steht deshalb als `Abfrage` hier und
 * wird beim Aufruf angelegt, die Antworten werden einzeln geprueft.
 */
export interface DienstClient {
  from: (tabelle: string) => unknown
}

type Antwort = { data: unknown; error: unknown }

interface Kette extends PromiseLike<Antwort> {
  eq: (feld: string, wert: unknown) => Kette
  maybeSingle: () => PromiseLike<Antwort>
}

interface Abfrage {
  select: (spalten: string) => {
    eq: (feld: string, wert: unknown) => Kette
  }
}

function tabelle(dienst: DienstClient, name: string): Abfrage {
  return dienst.from(name) as Abfrage
}

export interface RechtErgebnis {
  erlaubt: boolean
  /** Der geladene Kontakt, falls es ihn gibt. */
  kontakt: PortalKontakt | null
  /** Text fuer die Antwort, wenn nicht erlaubt. */
  grund?: string
  /** 403 bei fehlendem Recht, 500 wenn die Pruefung nicht lief. */
  status?: number
}

/**
 * Laedt Rollen und Kontakt mit dem Service-Role-Client und entscheidet.
 *
 * Jeder Fehler beim Laden fuehrt zu „nicht erlaubt“, nie zu einem
 * Durchlassen. Ob es den Kontakt gibt, verraet die Antwort nicht: Ein
 * unbekannter Kontakt bekommt dieselbe Ablehnung wie ein fremder.
 */
export async function pruefeKundenportalRecht(
  dienst: DienstClient,
  aufruferId: string,
  kontaktId: unknown,
): Promise<RechtErgebnis> {
  if (!istUuid(aufruferId) || !istUuid(kontaktId)) {
    return { erlaubt: false, kontakt: null, grund: KUNDENPORTAL_ABGELEHNT, status: 403 }
  }

  let rollen: string[] = []
  try {
    const antwort = await tabelle(dienst, "user_roles").select("role").eq("user_id", aufruferId)
    if (antwort.error) throw antwort.error
    rollen = Array.isArray(antwort.data)
      ? (antwort.data as Array<{ role?: unknown }>).map((r) => String(r?.role ?? ""))
      : []
  } catch (fehler) {
    console.error("kundenportal-recht: Rollen nicht lesbar", fehler)
    return { erlaubt: false, kontakt: null, grund: KUNDENPORTAL_NICHT_PRUEFBAR, status: 500 }
  }

  let kontakt: PortalKontakt | null = null
  try {
    const antwort = await tabelle(dienst, "kontakte")
      .select("id, zustaendig_id, meta").eq("id", kontaktId.trim()).maybeSingle()
    if (antwort.error) throw antwort.error
    kontakt = (antwort.data as PortalKontakt | null) ?? null
  } catch (fehler) {
    console.error("kundenportal-recht: Kontakt nicht lesbar", fehler)
    return { erlaubt: false, kontakt: null, grund: KUNDENPORTAL_NICHT_PRUEFBAR, status: 500 }
  }

  // Ohne Kontakt gibt es nichts zu verwalten, auch nicht fuer Admin.
  if (!kontakt) return { erlaubt: false, kontakt: null, grund: KUNDENPORTAL_ABGELEHNT, status: 403 }

  // Vertretung nur nachsehen, wenn sie ueberhaupt entscheiden kann.
  let vertretungAktiv = false
  const zustaendig = typeof kontakt.zustaendig_id === "string" ? kontakt.zustaendig_id.trim() : ""
  const istPartner = rollen.some((r) => (PORTAL_PARTNER_ROLLEN as readonly string[]).includes(r))
  if (istPartner && zustaendig && zustaendig.toLowerCase() !== aufruferId.toLowerCase()) {
    try {
      const antwort = await tabelle(dienst, "abwesenheiten")
        .select("von, bis").eq("user_id", zustaendig).eq("vertretung_id", aufruferId)
      if (antwort.error) throw antwort.error
      const heute = heuteInBerlin()
      vertretungAktiv = Array.isArray(antwort.data) && (antwort.data as Array<{ von?: unknown; bis?: unknown }>)
        .some((a) => typeof a.von === "string" && typeof a.bis === "string" && a.von <= heute && heute <= a.bis)
    } catch (fehler) {
      console.error("kundenportal-recht: Vertretung nicht lesbar", fehler)
      return { erlaubt: false, kontakt, grund: KUNDENPORTAL_NICHT_PRUEFBAR, status: 500 }
    }
  }

  const erlaubt = entscheideKundenportalRecht({ aufruferId, rollen, kontakt, vertretungAktiv })
  return erlaubt
    ? { erlaubt: true, kontakt }
    : { erlaubt: false, kontakt, grund: KUNDENPORTAL_ABGELEHNT, status: 403 }
}

/**
 * Die Anmeldekonten hinter einem Kontakt: Person 1 und, falls eingeladen,
 * Person 2. Beide teilen sich dasselbe Portal, also gilt die Sperre fuer beide.
 */
export function kontenDesKontakts(meta: Record<string, unknown> | null | undefined): string[] {
  const konten: string[] = []
  const person1 = meta?.authUserId
  const person2 = (meta?.person2 as Record<string, unknown> | undefined)?.authUserId
  for (const kennung of [person1, person2]) {
    if (istUuid(kennung) && !konten.includes(kennung.trim().toLowerCase())) {
      konten.push(kennung.trim().toLowerCase())
    }
  }
  return konten
}

/**
 * Fehlt eine Datenbankfunktion, weil die Migration noch nicht gelaufen ist?
 * PostgREST meldet das als PGRST202, Postgres selbst als 42883.
 */
export function fehltDatenbankfunktion(fehler: unknown): boolean {
  if (!fehler || typeof fehler !== "object") return false
  const f = fehler as { code?: unknown; message?: unknown }
  if (f.code === "PGRST202" || f.code === "42883") return true
  return typeof f.message === "string" && /could not find the function|function .* does not exist/i.test(f.message)
}
