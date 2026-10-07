/**
 * Darf dieser Aufruf den Handelsvertretervertrag weiterschalten?
 *
 * ---------------------------------------------------------------------------
 * Die Luecke (externes Audit vom 15.09.2026, Befund F03C)
 * ---------------------------------------------------------------------------
 * `finalize-vertrag` hat bis zum 16.09.2026 ueberhaupt nicht geprueft, wer sie
 * ruft. Sie las `bewerberId` und `stage` aus dem Koerper und baute sofort
 * einen Client mit dem Dienstschluessel, der alle Zugriffsregeln der Datenbank
 * umgeht. Der Token der Gegenzeichnung wurde zwar in Stufe A erzeugt und per
 * Mail an `os@os-immobilien.com` verschickt, in Stufe B aber nie wieder angesehen.
 *
 * Damit konnte jeder, der eine Bewerbungs-Id kannte, mit dem oeffentlichen
 * anon-Schluessel aus dem ausgelieferten Frontend-Code:
 *
 *  1. beliebige PDFs als "unterschriebenen Vertrag" in den Bucket `bewerbungen`
 *     legen und in die Dokumentenakte der Bewerbung eintragen,
 *  2. die Bewerbung auf `vertragStatus = "unterschrieben"` und den Status
 *     "Rechnung" setzen, also eine Gegenzeichnung vortaeuschen, die nie
 *     stattgefunden hat,
 *  3. die offene Anfrage `vertrag_kurz` auf "signed" setzen und damit die
 *     echte Gegenzeichnung verhindern,
 *  4. dem Bewerber eine Bestaetigungsmail mit Links auf genau diese
 *     untergeschobenen PDFs schicken.
 *
 * Der Befund stimmt also. Der Token war vorhanden, er wurde nur nicht
 * verlangt.
 *
 * ---------------------------------------------------------------------------
 * Die Pruefung
 * ---------------------------------------------------------------------------
 * Dasselbe Muster wie in `finalize-selbstauskunft` und `finalize-reservierung`:
 * Wer den persoenlichen Unterschriftslink besitzt, darf handeln, und zwar nur
 * fuer den Vorgang, zu dem der Link gehoert. Drei Schloesser muessen dafuer
 * gleichzeitig aufgehen:
 *
 *  1. Den Token muss es in `signature_requests` geben.
 *  2. Seine `kontakt_id` muss genau die uebergebene Bewerbungs-Id sein. Sonst
 *     koennte der Inhaber eines eigenen, gueltigen Links fremde Vertraege
 *     abschliessen.
 *  3. Sein `person_type` muss zur Stufe passen: `vertrag` fuer den Schritt des
 *     Bewerbers, `vertrag_kurz` fuer die Gegenzeichnung. Ohne diese Bedingung
 *     koennte der Bewerber mit seinem eigenen Link die Gegenzeichnung
 *     durchfuehren, also beide Unterschriften allein leisten.
 *
 * Dazu kommt die Frist: Ein Token aus einem alten Postfach soll nichts mehr
 * ausloesen.
 *
 * Bewusst NICHT geprueft wird der Status der Zeile:
 *
 *  - In Stufe A steht die Anfrage des Bewerbers in genau diesem Augenblick
 *    schon auf "signed", ein Statusfilter wuerde also den einzigen Fall
 *    abweisen, fuer den der Weg gebaut ist.
 *  - In Stufe B setzt die Function die Zeile am Ende selbst auf "signed".
 *    Bricht der Lauf nach dem Hochladen ab, muss der Inhaber des Links den
 *    Vorgang wiederholen koennen. Der Inhaber ist die gegenzeichnende Person,
 *    ein zweiter Lauf bringt also nichts Neues in fremde Hand.
 *
 * Genauso wie in `kontakt-signatur-zugriff.ts` wird ausnahmslos auf
 * `=== true` beziehungsweise auf echte Gleichheit geprueft. `null` und
 * `undefined` gelten nie als "erlaubt".
 */

/** Neutrale Ablehnung. Immer derselbe Text, egal warum abgelehnt wurde. */
export const GEGENZEICHNUNG_ABGELEHNT =
  "Dieser Link berechtigt nicht dazu, den Vertrag abzuschliessen."

/** So viel vom Supabase-Client, wie hier gebraucht wird. */
export interface LeseClient {
  from: (tabelle: string) => {
    select: (spalten: string) => {
      eq: (feld: string, wert: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>
      }
    }
  }
}

/** Welcher `person_type` gehoert zu welcher Stufe? */
export function personTypZurStufe(stufe: string): "vertrag" | "vertrag_kurz" {
  return stufe === "kurz" ? "vertrag_kurz" : "vertrag"
}

/**
 * Ist die Frist noch offen?
 *
 * Wie in `kontakt-signatur-zugriff.ts`: Alles, was nicht eindeutig ein
 * Zeitpunkt in der Zukunft ist, gilt als abgelaufen. Eine leere Frist ist
 * dagegen erlaubt, denn aeltere Anfragen aus der Zeit vor den befristeten
 * Links tragen `expires_at = null`. Sie sollen nicht nachtraeglich ungueltig
 * werden.
 */
function fristOffen(expiresAt: unknown): boolean {
  if (expiresAt === null || expiresAt === undefined) return true
  if (typeof expiresAt !== "string" || !expiresAt.trim()) return true
  const frist = new Date(expiresAt).getTime()
  if (Number.isNaN(frist)) return false
  return frist > Date.now()
}

/**
 * Gehoert dieser Token zu genau diesem Vorgang?
 *
 * Gelesen wird mit dem Dienstschluessel, weil beim Unterschreiben niemand
 * angemeldet ist und die Zeile sonst gar nicht sichtbar waere.
 */
export async function tokenGiltFuerVertrag(
  dienstClient: LeseClient,
  bewerberId: string,
  token: unknown,
  erwarteterPersonTyp: "vertrag" | "vertrag_kurz",
): Promise<boolean> {
  const wert = String(token ?? "").trim()
  if (!wert || !bewerberId) return false

  const { data, error } = await dienstClient
    .from("signature_requests")
    .select("kontakt_id, person_type, expires_at")
    .eq("token", wert)
    .maybeSingle()

  if (error) {
    console.error("Unterschrifts-Token nicht pruefbar:", error)
    return false
  }
  if (!data) return false

  const zeile = data as { kontakt_id?: unknown; person_type?: unknown; expires_at?: unknown }

  const gehoertZu = String(zeile.kontakt_id ?? "")
  if (!gehoertZu || gehoertZu !== bewerberId) {
    console.warn("Unterschrifts-Token gehoert zu einer anderen Bewerbung als der angefragten.")
    return false
  }

  if (String(zeile.person_type ?? "") !== erwarteterPersonTyp) {
    console.warn("Unterschrifts-Token gehoert zu einem anderen Schritt des Vertrags.")
    return false
  }

  if (!fristOffen(zeile.expires_at)) {
    console.warn("Unterschrifts-Token ist abgelaufen.")
    return false
  }

  return true
}

/*
 * ---------------------------------------------------------------------------
 * Welche Unterschrift wird gegengezeichnet? (Codex-Pruefung 27.09.2026,
 * Befunde A4-04 und A4-05)
 * ---------------------------------------------------------------------------
 * Bis zum 27.09.2026 gab Stufe A den Link der Gegenzeichnung an den Browser
 * des Bewerbers zurueck, er konnte Stufe B also selbst ausloesen. Und Stufe B
 * uebernahm die Vertragsfassung aus dem Entwurf am Bewerber, nicht aus der
 * Anfrage, die tatsaechlich unterschrieben wurde. Lag neben einer alten
 * unterschriebenen Anfrage ein neuer Entwurf, galt der alte Vertrag als in
 * der neuen Fassung unterschrieben.
 *
 * Jetzt gilt:
 *  - Der Link der Gegenzeichnung geht nur per Mail und Glocke an den
 *    Gegenzeichner, nie in die Antwort an den Bewerber.
 *  - Die Anfrage der Gegenzeichnung nennt die Anfrage des Bewerbers
 *    (`sa_data.bewerberRequestId`), das ist Pflicht. Aeltere Anfragen ohne
 *    diesen Verweis traegt Migration 20260927080000 nach und gibt ihnen
 *    dabei einen neuen Token (NB-02). Ohne Verweis wird neutral abgelehnt.
 *  - Gegengezeichnet wird nur, solange die Anfrage der Gegenzeichnung offen
 *    ist, die des Bewerbers unterschrieben und keine neuere Anfrage an den
 *    Bewerber verschickt wurde (ein Testversand zaehlt nicht).
 *  - Die Fassung kommt aus der unterschriebenen Anfrage. Ohne Kennung gehoert
 *    sie zur langen Altfassung, wie in `bewerberMitFassungAusAnfrage`.
 */

/** Kennung der langen Altfassung, wie VERTRAGS_FASSUNG_ALT im Browser. */
export const VERTRAGS_FASSUNG_ALT_KENNUNG = "2026-09-01-lang"

export interface VertragsAnfrage {
  id: string
  person_type: string
  status: string
  created_at?: string | null
  signed_at?: string | null
  sa_data?: Record<string, unknown> | null
}

export type GegenzeichnungsBefund =
  | { ok: true; bewerberAnfrage: VertragsAnfrage; fassung: string }
  | { ok: false; grund: "gegenzeichnung_nicht_offen" | "bewerber_nicht_unterschrieben" | "ueberholt" }

function istTestversand(a: VertragsAnfrage): boolean {
  return (a.sa_data ?? {}).testversand === true
}

/** Die unterschriebene Fassung einer Anfrage des Bewerbers. */
export function fassungDerAnfrage(a: VertragsAnfrage): string {
  const daten = (a.sa_data ?? {}).bewerberData as { vertragFassung?: unknown } | null | undefined
  const k = typeof daten?.vertragFassung === "string" ? daten.vertragFassung.trim() : ""
  return k || VERTRAGS_FASSUNG_ALT_KENNUNG
}

/**
 * Entscheidet aus der Anfrage der Gegenzeichnung und allen Vertragsanfragen
 * derselben Bewerbung, ob gegengezeichnet werden darf und welche Fassung
 * damit gilt.
 */
export function pruefeGegenzeichnung(
  kurz: VertragsAnfrage,
  anfragen: VertragsAnfrage[],
): GegenzeichnungsBefund {
  if (kurz.person_type !== "vertrag_kurz" || kurz.status !== "pending") {
    return { ok: false, grund: "gegenzeichnung_nicht_offen" }
  }
  const echte = anfragen.filter((a) => a.person_type === "vertrag" && !istTestversand(a))
  const verweis = String((kurz.sa_data ?? {}).bewerberRequestId ?? "")
  const bewerberAnfrage = verweis ? echte.find((a) => a.id === verweis) : undefined
  if (!bewerberAnfrage || bewerberAnfrage.status !== "signed") {
    return { ok: false, grund: "bewerber_nicht_unterschrieben" }
  }
  if (gibtNeuereEchteAnfrage(bewerberAnfrage, echte)) return { ok: false, grund: "ueberholt" }
  return { ok: true, bewerberAnfrage, fassung: fassungDerAnfrage(bewerberAnfrage) }
}

/** Gibt es nach dieser Anfrage eine neuere echte, nicht ueberholte? */
function gibtNeuereEchteAnfrage(anfrage: VertragsAnfrage, echte: VertragsAnfrage[]): boolean {
  return echte.some((a) =>
    a.id !== anfrage.id
    && a.status !== "ueberholt"
    && String(a.created_at ?? "") > String(anfrage.created_at ?? ""))
}

export type BewerberStufenBefund =
  | "aktuell"
  | "schon_unterschrieben"
  | "testversand"
  | "nicht_unterschrieben"
  | "ueberholt"

/**
 * Darf Stufe A (Unterschrift des Bewerbers) den gemeinsamen Zustand aendern,
 * also Bewerbung und offene Gegenzeichnungen? Nur fuer die aktuelle echte
 * Anfrage: unterschrieben, kein Testversand, keine neuere echte Anfrage
 * (Codex-Pruefung 27.09.2026, NB-03). Ein wieder eingespielter alter Token
 * ist damit wirkungslos, ein Testversand aendert nichts, und nach der
 * Gegenzeichnung bleibt alles, wie es ist.
 */
export function pruefeBewerberStufe(
  anfrage: VertragsAnfrage,
  anfragen: VertragsAnfrage[],
  vertragStatus: unknown,
): BewerberStufenBefund {
  if (vertragStatus === "unterschrieben") return "schon_unterschrieben"
  if (anfrage.person_type !== "vertrag") return "nicht_unterschrieben"
  if (istTestversand(anfrage)) return "testversand"
  if (anfrage.status !== "signed") return "nicht_unterschrieben"
  const echte = anfragen.filter((a) => a.person_type === "vertrag" && !istTestversand(a))
  if (gibtNeuereEchteAnfrage(anfrage, echte)) return "ueberholt"
  return "aktuell"
}
