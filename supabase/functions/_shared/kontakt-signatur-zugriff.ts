/**
 * Darf dieser angemeldete Nutzer fuer diesen Kontakt eine Unterschrift
 * anfordern, und an welche Adresse geht sie?
 *
 * ---------------------------------------------------------------------------
 * Die Luecke (externes Audit vom 15.09.2026, Befund F03A)
 * ---------------------------------------------------------------------------
 * `send-signature-request` und `send-reservation-signature` haben bis zum
 * 16.09.2026 nur geprueft, DASS jemand angemeldet ist, nicht WER er ist und ob
 * er mit der uebergebenen `kontaktId` ueberhaupt etwas zu tun hat. Direkt
 * danach bauen beide einen Client mit dem Service-Role-Schluessel, der alle
 * Zugriffsregeln der Datenbank umgeht. Damit war moeglich:
 *
 *  1. Ein beliebiger angemeldeter Kunde ruft die Function mit einer fremden
 *     `kontaktId` auf und gibt in `persons` seine eigene Mailadresse an. Er
 *     bekommt einen gueltigen Unterschriftslink zu einem fremden Vertrag.
 *  2. `send-signature-request` loescht zu Beginn alle offenen Signaturanfragen
 *     des Kontakts. Ein Fremder konnte damit laufende Unterschriftsvorgaenge
 *     anderer Kunden zerstoeren, die bereits verschickten Links hoerten auf zu
 *     funktionieren.
 *
 * Das vorhandene Rate-Limit bremst den Massenmissbrauch, nicht den gezielten
 * Einzelfall. Es ersetzt keine Berechtigungspruefung.
 *
 * ---------------------------------------------------------------------------
 * Warum die Pruefung so aussieht
 * ---------------------------------------------------------------------------
 * Sie ist wortwoertlich die Summe der Regeln, die auf der Tabelle `kontakte`
 * ohnehin gelten (zuletzt gesetzt in
 * `20260916190000_kundenzugriff_rollenentscheidung.sql`):
 *
 *   Regel 1/2 "Admin und interne Rollen sehen/bearbeiten Kontakte"
 *       darf_alle_kunden_sehen(uid)
 *   Regel 5/6 "Vertriebspartner sehen/bearbeiten eigene Kontakte"
 *       has_role(uid, 'vertriebspartner') AND is_vp_owner_of_kontakt(...)
 *
 * Dazu kommt der Kunde selbst, der in den RLS-Regeln ueber
 * `meta->>'authUserId'` beziehungsweise `meta->'person2'->>'authUserId'`
 * erkannt wird. Das Kundenportal laeuft in derselben Anwendung wie das CRM,
 * ein Kunde kann eine Seite wie `/reservierung` also aufrufen und dort fuer
 * sich selbst eine Unterschrift ausloesen. Ohne diesen Zweig waere genau
 * dieser erlaubte Fall gesperrt.
 *
 * Wichtig: `is_internal_role` schliesst die Rolle `vertriebspartner`
 * ausdruecklich MIT ein (siehe 20260403110042) und dazu Rollen ohne
 * Kundenzugriff wie Marketing oder HR. Deshalb fragt die Pruefung seit dem
 * 05.10.2026 `darf_alle_kunden_sehen` und hat fuer Vertriebspartner einen
 * eigenen, zeilenbezogenen Zweig.
 *
 * Warum `is_vp_owner_of_kontakt` und nicht `is_vp_eigentuemer_of_kontakt`:
 * Die zweite Funktion laesst eine laufende Vertretung bewusst aussen vor. Sie
 * ist fuer das Loeschen gedacht, "eine Vertretung soll aushelfen, nicht
 * aufraeumen" (20260807150000). Eine Unterschrift anzufordern ist aber genau
 * das Aushelfen: Ist der zustaendige Partner im Urlaub, muss die Vertretung
 * den Vorgang weiterfuehren duerfen, sie darf den Kontakt ohnehin sehen und
 * bearbeiten. Mit der strengeren Funktion stuende der Vorgang bis zur
 * Rueckkehr still. Deshalb dieselbe Funktion, die auch die SELECT- und
 * UPDATE-Regel auf `kontakte` verwendet.
 *
 * Bewusst NICHT geprueft:
 *  - ob das Investment zum Kontakt gehoert. Das ist eine eigene Frage und
 *    waere eine zweite Aenderung im selben Schritt. Der Schaden aus F03A
 *    haengt am Kontakt, nicht am Investment.
 *  - ob die Pipelinestufe einen Versand hergibt. Das ist Ablauf, nicht
 *    Berechtigung, und wird in der Oberflaeche entschieden.
 *  - der Tippgeber. Er sieht seine Empfehlungen (eigene RLS-Regel), soll aber
 *    keine Vertraege zur Unterschrift verschicken duerfen.
 *
 * ---------------------------------------------------------------------------
 * Der dritte Weg: der Nachweis-Token (16.09.2026)
 * ---------------------------------------------------------------------------
 * Es gibt einen erlaubten Aufruf, hinter dem ueberhaupt kein angemeldeter
 * Nutzer steht. Unterschreibt ein Ehepaar die Selbstauskunft und sitzt der
 * zweite Kaeufer nicht mit am Bildschirm, kann angekreuzt werden, dass er
 * seine Unterschrift per Mail bekommt. Dann ruft `submit-sa-signature` die
 * Function `send-signature-request` auf, und zwar mit dem
 * Service-Role-Schluessel. In dessen Authorization-Kopf steht kein Nutzer,
 * `auth.getUser()` liefert nichts, und die Mail wurde mit 401 abgewiesen. Das
 * ist ein alter Fehler, er bestand schon vor den Sicherheitsaenderungen vom
 * 16.09.2026; frueher fiel er nur nicht auf, weil die Function jeden
 * Angemeldeten durchliess und der Fehlschlag anschliessend nur ins Protokoll
 * geschrieben wurde.
 *
 * Statt dafuer die Anmeldepflicht aufzuweichen, reicht `submit-sa-signature`
 * den kundenbezogenen Nachweis durch, den sie ohnehin schon in der Hand hat:
 * den Token aus dem Link, mit dem der Kunde die Selbstauskunft geoeffnet hat.
 * Dieser Token wird hier erneut gegen die Datenbank geprueft und nicht
 * geglaubt.
 *
 * Zwei Schloesser muessen dafuer gleichzeitig aufgehen:
 *
 *  1. Die Anfrage muss das gemeinsame Geheimwort im Kopf tragen
 *     (`x-internal-secret` gegen `INGEST_SHARED_SECRET`, dasselbe Muster wie
 *     in `finalize-selbstauskunft`). Das entscheidet die aufrufende Function
 *     und gibt es als `vonFunctionZuFunction` herein. Ohne dieses Merkmal wird
 *     der Token nicht einmal angesehen. Ein Angreifer aus dem Internet kann
 *     den Nachweis also gar nicht erst anbringen.
 *  2. Der Token muss zu einer Zeile gehoeren, deren `kontakt_id` genau die
 *     angefragte `kontaktId` ist. Damit kann selbst ein Aufruf mit Geheimwort
 *     nur fuer den Kontakt handeln, zu dem der Token gehoert, und nicht fuer
 *     einen fremden.
 *
 * Bewusst NICHT geprueft wird der Status der Zeile. Genau in diesem Augenblick
 * hat der erste Kaeufer unterschrieben: Der Fill-Token wird gleich auf "used"
 * gesetzt, die eben angelegte Signaturanfrage steht schon auf "signed". Ein
 * Statusfilter wuerde also ausgerechnet den einen Fall abweisen, fuer den der
 * Weg gebaut ist. Die Ablauffrist wird dagegen geprueft: Sie gilt im
 * regulaeren Ablauf immer (der Fill-Token wurde soeben in
 * `submit-sa-signature` gegen dieselbe Frist geprueft, die Signaturanfrage ist
 * Sekunden alt), kostet dort also nichts, schliesst aber den Fall aus, dass
 * ein uralter Token aus einem Postfach noch einmal etwas ausloest.
 *
 * ---------------------------------------------------------------------------
 * Dreiwertige Logik
 * ---------------------------------------------------------------------------
 * Alle Rollenfunktionen koennen NULL liefern. `is_vp_owner_of_kontakt` ist
 * eine Kette aus Vergleichen; steht `zustaendig_id` auf NULL und fehlen die
 * meta-Schluessel, ist das Ergebnis weder wahr noch falsch, sondern unbekannt.
 * Ueber PostgREST kommt daraus `null`. Genau dieser Fehler hat am 16.09.2026
 * an drei Stellen die Sperren ausgehebelt (siehe
 * `20260916100000_rpc_sperren_dreiwertige_logik.sql`). Deshalb wird hier
 * ausnahmslos auf `=== true` geprueft: `null` und `undefined` gelten als
 * "nicht erlaubt", nie als "erlaubt".
 */

/** Neutrale Ablehnung. Immer derselbe Text, egal warum abgelehnt wurde. */
export const ZUGRIFF_ABGELEHNT =
  "Fuer diesen Kontakt darf keine Unterschrift angefordert werden."

/**
 * Die Felder des Kontakts, die fuer Pruefung und Versand gebraucht werden.
 * Bewusst knapp gehalten: Der Service-Role-Client umgeht RLS, also wird nur
 * geladen, was hier auch wirklich gebraucht wird.
 */
export interface KontaktZeile {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  zustaendig_id: string | null
  meta: Record<string, unknown> | null
}

export interface ZugriffErgebnis {
  /** Nur bei true darf weitergearbeitet werden. */
  erlaubt: boolean
  /** Der geladene Kontakt. Null, wenn es ihn nicht gibt. */
  kontakt: KontaktZeile | null
}

/** So viel vom Supabase-Client, wie hier gebraucht wird. */
interface LeseClient {
  from: (tabelle: string) => {
    select: (spalten: string) => {
      eq: (feld: string, wert: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>
      }
    }
  }
}

interface RpcClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

/**
 * Der Nachweis aus einem Aufruf von Function zu Function.
 *
 * `vonFunctionZuFunction` entscheidet die aufrufende Function anhand des
 * gemeinsamen Geheimworts im Kopf der Anfrage. Steht es nicht auf genau
 * `true`, wird der Token nicht einmal angesehen.
 */
export interface Nachweis {
  token: string
  vonFunctionZuFunction: boolean
}

/** Tabellen, in denen ein Nachweis-Token stehen kann, in dieser Reihenfolge. */
const NACHWEIS_TABELLEN = ["signature_requests", "sa_fill_tokens"]

/**
 * Ist die Frist noch offen?
 *
 * Alles, was nicht eindeutig ein Zeitpunkt in der Zukunft ist, gilt als
 * abgelaufen. `null`, ein leeres Feld oder ein unlesbares Datum duerfen nie
 * als "noch gueltig" durchgehen.
 */
function nochGueltig(expiresAt: unknown): boolean {
  if (typeof expiresAt !== "string" || !expiresAt.trim()) return false
  const frist = new Date(expiresAt).getTime()
  if (Number.isNaN(frist)) return false
  return frist > Date.now()
}

/**
 * Prueft den mitgeschickten Nachweis-Token gegen die Datenbank.
 *
 * Er zaehlt nur, wenn es ihn wirklich gibt und die Zeile zu genau diesem
 * Kontakt gehoert. Die Begruendung steht ausfuehrlich im Kopf dieser Datei.
 *
 * Gelesen wird mit dem Service-Role-Client, weil zu diesem Zeitpunkt kein
 * Nutzer angemeldet ist und die Zeile sonst gar nicht sichtbar waere.
 */
export async function nachweisGiltFuerKontakt(
  dienstClient: LeseClient,
  kontaktId: string,
  nachweis: Nachweis | null | undefined,
): Promise<boolean> {
  // Siehe Kopf: nur ein ausdrueckliches true zaehlt, nie null oder undefined.
  if (nachweis?.vonFunctionZuFunction !== true) return false

  const token = String(nachweis.token ?? "").trim()
  if (!token || !kontaktId) return false

  for (const tabelle of NACHWEIS_TABELLEN) {
    const { data, error } = await dienstClient
      .from(tabelle)
      .select("kontakt_id, expires_at")
      .eq("token", token)
      .maybeSingle()

    if (error) {
      console.error(`Nachweis-Token in ${tabelle} nicht pruefbar:`, error)
      return false
    }
    // Nicht gefunden: in der naechsten Tabelle weitersuchen.
    if (!data) continue

    const zeile = data as { kontakt_id?: unknown; expires_at?: unknown }
    // Gefunden. Ab hier wird nicht mehr weitergesucht: Der Token gehoert zu
    // dieser Zeile, und wenn sie nicht passt, passt er ueberhaupt nicht.
    const gehoertZu = String(zeile.kontakt_id ?? "")
    if (!gehoertZu || gehoertZu !== kontaktId) {
      console.warn(
        `Nachweis-Token gehoert zu einem anderen Kontakt als dem angefragten (${tabelle}).`,
      )
      return false
    }
    if (!nochGueltig(zeile.expires_at)) {
      console.warn(`Nachweis-Token ist abgelaufen (${tabelle}).`)
      return false
    }
    return true
  }

  return false
}

/**
 * Eine einzelne Rollenabfrage.
 *
 * Ein Fehler wird als "nicht erlaubt" gewertet und nicht als Ausnahme
 * weitergereicht. Faellt die Rollenpruefung aus, soll der Versand
 * unterbleiben, nicht durchrutschen.
 */
async function frage(client: RpcClient, name: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await client.rpc(name, args)
    if (error) {
      console.error(`Rollenpruefung ${name} fehlgeschlagen:`, error)
      return false
    }
    // Siehe Kopf: null und undefined sind kein "ja".
    return data === true
  } catch (fehler) {
    console.error(`Rollenpruefung ${name} abgebrochen:`, fehler)
    return false
  }
}

/**
 * Laedt den Kontakt und beantwortet, ob der Aufrufer fuer ihn handeln darf.
 *
 * @param dienstClient Client mit Service-Role. Laedt den Kontakt. Noetig,
 *   damit die Antwort nicht davon abhaengt, ob der Aufrufer die Zeile sehen
 *   darf: Sonst waere aus "Kontakt nicht gefunden" ablesbar, welche Kennungen
 *   es gibt.
 * @param aufruferClient Client mit dem Token des Aufrufers. Er fuehrt die
 *   Rollenabfragen aus, laeuft also als `authenticated`. Genau diesen Rollen
 *   sind `is_vp_owner_of_kontakt` und `hat_breiten_kontaktzugriff` per GRANT
 *   zugaenglich, dem Service-Role-Schluessel ausdruecklich nicht.
 * @param nachweis Optional. Der Nachweis-Token aus einem Aufruf von Function
 *   zu Function. Nur dann gesetzt, wenn gar kein Nutzer angemeldet ist, siehe
 *   "Der dritte Weg" im Kopf dieser Datei.
 * @param optionen.ohneKunde Der Kunde selbst zaehlt nicht (Zweig 2 entfaellt).
 *   Fuer Aktionen, die nur das CRM ausloest, etwa die Einladung zur
 *   Selbstauskunft (seit 07.10.2026).
 */
export async function pruefeKontaktZugriff(
  dienstClient: LeseClient,
  aufruferClient: RpcClient,
  kontaktId: string,
  aufruferId: string,
  nachweis?: Nachweis | null,
  optionen: { ohneKunde?: boolean } = {},
): Promise<ZugriffErgebnis> {
  const mitNachweis = nachweis?.vonFunctionZuFunction === true
    && String(nachweis.token ?? "").trim() !== ""

  if (!kontaktId) return { erlaubt: false, kontakt: null }
  // Ohne Nutzer geht es nur mit Nachweis. Umgekehrt ersetzt der Nachweis den
  // Nutzer, deshalb ist eine fehlende Nutzerkennung hier kein Ausschluss mehr.
  if (!aufruferId && !mitNachweis) return { erlaubt: false, kontakt: null }

  const { data, error } = await dienstClient
    .from("kontakte")
    .select("id, vorname, nachname, email, zustaendig_id, meta")
    .eq("id", kontaktId)
    .maybeSingle()

  if (error) {
    console.error("Kontakt fuer die Berechtigungspruefung nicht ladbar:", error)
    return { erlaubt: false, kontakt: null }
  }
  if (!data) return { erlaubt: false, kontakt: null }

  const kontakt = data as KontaktZeile
  const meta = (kontakt.meta ?? {}) as Record<string, unknown>
  const person2 = (meta.person2 ?? {}) as Record<string, unknown>

  /*
   * 1) Der Nachweis-Token aus einem Aufruf von Function zu Function.
   *    Steht bewusst ganz vorne, denn in diesem Fall gibt es ueberhaupt keinen
   *    angemeldeten Nutzer, nach dem sich fragen liesse.
   */
  if (mitNachweis && await nachweisGiltFuerKontakt(dienstClient, kontaktId, nachweis)) {
    return { erlaubt: true, kontakt }
  }

  /*
   * Ab hier wird mit der Nutzerkennung verglichen. Ohne Kennung darf keiner
   * der folgenden Vergleiche mehr laufen: Ein leerer Wert waere sonst gleich
   * einem leeren `authUserId` am Kontakt und damit ein Treffer.
   */
  if (!aufruferId) return { erlaubt: false, kontakt }

  /*
   * 2) Der Kunde selbst. Kostet keine Abfrage und deckt den Weg aus dem
   *    Kundenportal ab. Verglichen wird auf Gleichheit mit dem echten Wert,
   *    ein fehlender Schluessel ist `undefined` und damit nie gleich einer
   *    Nutzerkennung.
   */
  if (!optionen.ohneKunde) {
    if (meta.authUserId === aufruferId) return { erlaubt: true, kontakt }
    if (person2.authUserId === aufruferId) return { erlaubt: true, kontakt }
  }

  /*
   * 3) Die Rollen. Die drei Fragen haengen nicht voneinander ab und laufen
   *    deshalb gemeinsam, sonst waeren es drei Wartezeiten hintereinander.
   */
  const [istAdmin, siehtAlle, istVertriebspartner] = await Promise.all([
    frage(aufruferClient, "is_admin_role", { _user_id: aufruferId }),
    frage(aufruferClient, "darf_alle_kunden_sehen", { _user_id: aufruferId }),
    frage(aufruferClient, "has_role", { _user_id: aufruferId, _role: "vertriebspartner" }),
  ])

  if (istAdmin) return { erlaubt: true, kontakt }

  /*
   * Rollen, die laut RLS jeden Kunden sehen (seit 16.09.2026
   * `darf_alle_kunden_sehen`: Leitung, Backoffice, Finanzierung, Buchhaltung
   * und wenige mehr). Bis zum 05.10.2026 stand hier `is_internal_role` ohne
   * Vertriebspartner; damit kamen auch Marketing, HR, Hausverwaltung und
   * Objektpartner an fremde Kontakte, die sie in der Datenbank gar nicht sehen.
   */
  if (siehtAlle) return { erlaubt: true, kontakt }

  // Vertriebspartner nur am eigenen Kontakt, Vertretung eingeschlossen.
  if (istVertriebspartner) {
    const eigenerKontakt = await frage(aufruferClient, "is_vp_owner_of_kontakt", {
      _user_id: aufruferId,
      _zustaendig_id: kontakt.zustaendig_id,
      _meta: kontakt.meta ?? {},
    })
    if (eigenerKontakt) return { erlaubt: true, kontakt }
  }

  return { erlaubt: false, kontakt }
}

/**
 * Gehoert dieser personType zur zweiten Person?
 *
 * Gewachsene Schreibweisen: die Selbstauskunft schickt `person1`/`person2`
 * und in Altbestaenden `partner`, die Reservierung `kaeufer1`/`kaeufer2`.
 */
function istZweitePerson(personType: unknown): boolean {
  const wert = String(personType ?? "").trim().toLowerCase()
  return wert === "partner" || wert.endsWith("2")
}

export interface Empfaenger {
  name: string
  email: string
}

/**
 * Die Empfaengeradresse aus dem gespeicherten Kontakt holen, nie aus dem
 * Aufruf.
 *
 * Das ist der zweite Teil von F03A: Selbst mit richtiger Berechtigung liesse
 * sich sonst eine Anfrage an eine beliebige Adresse umleiten, etwa an die
 * eigene. Der Kontakt ist die einzige Quelle, die nicht vom Aufrufer kommt.
 *
 * Person 2 faellt auf die Adresse von Person 1 zurueck. Das ist kein
 * Zugestaendnis, sondern genau das Verhalten der Oberflaeche seit jeher:
 * Ehepaare teilen sich oft eine Adresse, und beide Links gehen dann an
 * dasselbe Postfach. Die Adresse stammt weiterhin aus dem Kontakt.
 */
export function empfaengerAusKontakt(kontakt: KontaktZeile, personType: unknown): Empfaenger {
  const meta = (kontakt.meta ?? {}) as Record<string, any>
  const person2 = (meta.person2 ?? {}) as Record<string, any>
  // Leerzeichen am Rand entfernen: Eine Adresse mit Leerzeichen am Ende wird
  // vom Mailversand mit 403 recipient_mismatch abgelehnt.
  const emailPerson1 = String(kontakt.email ?? "").trim()

  if (istZweitePerson(personType)) {
    const name = `${person2.vorname ?? ""} ${person2.nachname ?? ""}`.trim()
    const email = String(person2.email ?? "").trim() || emailPerson1
    return { name, email }
  }

  return {
    name: `${kontakt.vorname ?? ""} ${kontakt.nachname ?? ""}`.trim(),
    email: emailPerson1,
  }
}

/** Dieselbe Pruefung wie in der Oberflaeche, damit beide dasselbe ablehnen. */
export function emailIstBrauchbar(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}
