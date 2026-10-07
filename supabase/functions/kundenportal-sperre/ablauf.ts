/**
 * Der Ablauf hinter „Portal sperren“ und „Portal entsperren“.
 *
 * Liegt getrennt von `index.ts`, damit er ohne Deno geprueft werden kann
 * (`src/lib/kundenportalSperreFunction.test.ts`). `index.ts` kuemmert sich nur
 * um Anfrage, Anmeldung und Antwort.
 *
 * Drei Schritte, in dieser Reihenfolge:
 *
 *   1. Recht pruefen. Nur Admin, Inhaber und der zustaendige Vertriebspartner
 *      (Regel und Begruendung in `../_shared/kundenportal-recht.ts`). Ohne
 *      Recht wird nichts geschrieben und kein Konto angefasst.
 *
 *   2. Sperre in der Datenbank festhalten, ueber
 *      `kundenportal_sperre_schreiben` aus der Migration
 *      `20260923180000_kundenportal_sperre.sql`. Die Funktion schreibt die
 *      Tabelle `kundenportal_sperren` (danach richten sich die
 *      Zugriffsregeln) und den Anzeigewert `meta.portalGesperrt` am Kontakt.
 *      Ist die Migration noch nicht gelaufen, fehlt die Funktion. Dann wird
 *      wie bisher nur der Anzeigewert geschrieben, mit dem Dienstschluessel
 *      ueber `merge_kontakt_meta`. Die Anmeldesperre in Schritt 3 greift
 *      trotzdem, und das Portal zeigt den Sperrhinweis.
 *
 *   3. Anmeldekonten sperren oder freigeben (`ban_duration`). Das betrifft
 *      Person 1 und Person 2 des Kontakts, aber nur Konten, die
 *      ausschliesslich die Rolle `kunde` tragen. Hat ein Mitarbeiter, ein
 *      Partner oder ein Tippgeber selbst bei uns gekauft, darf die Sperre
 *      seines Kundenportals ihn nicht aus CRM oder Tippgeber-Portal
 *      aussperren; fuer ihn sperrt nur die Portalseite (Anzeigewert).
 *      Dieselbe Regel steht in `kunde_portal_gesperrt` (seit 04.10.2026).
 *
 * Laeuft Schritt 3 nur teilweise durch, bleibt Schritt 2 bestehen und die
 * Antwort sagt es ausdruecklich (`anmeldungFehler`). Beides ist wiederholbar:
 * Ein zweiter Aufruf mit demselben Stand schreibt dasselbe noch einmal.
 */

import {
  type DienstClient,
  fehltDatenbankfunktion,
  istUuid,
  kontenDesKontakts,
  pruefeKundenportalRecht,
} from "../_shared/kundenportal-recht.ts"

/** Rund hundert Jahre. `ban_duration` kennt kein „fuer immer“. */
export const SPERRDAUER = "876000h"

type Antwort = { data: unknown; error: unknown }

/** So viel vom Service-Role-Client, wie der Ablauf braucht. */
export interface SperrDienst extends DienstClient {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Antwort>
  auth: {
    admin: {
      updateUserById: (id: string, attrs: { ban_duration: string }) => PromiseLike<{ error: unknown }>
    }
  }
}

export interface SperrErgebnis {
  status: number
  rumpf: Record<string, unknown>
}

function fehlerText(fehler: unknown): string {
  if (fehler && typeof fehler === "object" && typeof (fehler as { message?: unknown }).message === "string") {
    return (fehler as { message: string }).message
  }
  return String(fehler)
}

export async function portalSperreSetzen(
  dienst: SperrDienst,
  aufruferId: string,
  kontaktId: unknown,
  gesperrt: unknown,
  jetzt: () => string = () => new Date().toISOString(),
): Promise<SperrErgebnis> {
  if (!istUuid(kontaktId)) {
    return { status: 400, rumpf: { error: "Der Kontakt fehlt oder ist ungültig." } }
  }
  if (typeof gesperrt !== "boolean") {
    return { status: 400, rumpf: { error: "Es fehlt die Angabe, ob gesperrt oder entsperrt werden soll." } }
  }

  // 1) Recht
  const recht = await pruefeKundenportalRecht(dienst, aufruferId, kontaktId)
  if (!recht.erlaubt || !recht.kontakt) {
    console.warn(`kundenportal-sperre: abgelehnt, Nutzer ${aufruferId} fuer Kontakt ${kontaktId}`)
    return { status: recht.status ?? 403, rumpf: { error: recht.grund } }
  }

  // 2) Datenbank
  let meta: Record<string, unknown> | null = null
  let datenbanksperre = true
  const geschrieben = await dienst.rpc("kundenportal_sperre_schreiben", {
    _kontakt_id: kontaktId,
    _gesperrt: gesperrt,
    _von: aufruferId,
  })
  if (geschrieben.error) {
    if (!fehltDatenbankfunktion(geschrieben.error)) {
      console.error("kundenportal-sperre: Schreiben fehlgeschlagen", geschrieben.error)
      return { status: 500, rumpf: { error: `Die Sperre konnte nicht gespeichert werden: ${fehlerText(geschrieben.error)}` } }
    }
    // Migration noch nicht gelaufen: Anzeigewert wie bisher, nur jetzt
    // nach der Rechtepruefung oben und mit dem Dienstschluessel.
    datenbanksperre = false
    const zeitpunkt = jetzt()
    const rueckfall = await dienst.rpc("merge_kontakt_meta", {
      _kontakt_id: kontaktId,
      _updates: gesperrt
        ? { portalGesperrt: true, portalGesperrtAt: zeitpunkt }
        : { portalGesperrt: false, portalEntsperrtAt: zeitpunkt },
    })
    if (rueckfall.error) {
      console.error("kundenportal-sperre: Rueckfall ueber merge_kontakt_meta fehlgeschlagen", rueckfall.error)
      return { status: 500, rumpf: { error: `Die Sperre konnte nicht gespeichert werden: ${fehlerText(rueckfall.error)}` } }
    }
    meta = (rueckfall.data as Record<string, unknown> | null) ?? null
  } else {
    meta = (geschrieben.data as Record<string, unknown> | null) ?? null
  }

  // 3) Anmeldekonten
  const konten = kontenDesKontakts(meta ?? recht.kontakt.meta)
  let geaendert = 0
  let uebersprungen = 0
  const fehler: string[] = []
  for (const konto of konten) {
    const rollenAntwort = await (dienst.from("user_roles") as {
      select: (s: string) => { eq: (f: string, w: unknown) => PromiseLike<Antwort> }
    }).select("role").eq("user_id", konto)
    if (rollenAntwort.error || !Array.isArray(rollenAntwort.data)) {
      // Nicht pruefbar: lieber nicht anfassen als jemanden aussperren.
      fehler.push("Die Rolle eines Kontos war nicht prüfbar")
      console.error("kundenportal-sperre: Rollen nicht pruefbar", konto, rollenAntwort.error)
      continue
    }
    const weitereRolle = (rollenAntwort.data as Array<{ role?: unknown }>).some((r) => String(r?.role ?? "") !== "kunde")
    if (weitereRolle) {
      uebersprungen++
      continue
    }
    const { error } = await dienst.auth.admin.updateUserById(konto, { ban_duration: gesperrt ? SPERRDAUER : "none" })
    if (error) {
      fehler.push(fehlerText(error))
      console.error("kundenportal-sperre: Anmeldesperre nicht gesetzt", konto, error)
    } else {
      geaendert++
    }
  }

  // Protokoll. Ein Fehler hier stoppt nichts, steht aber im Log.
  try {
    const protokoll = dienst.from("audit_log") as {
      insert: (zeile: Record<string, unknown>) => PromiseLike<{ error: unknown }>
    }
    const { error } = await protokoll.insert({
      actor: aufruferId,
      action: gesperrt ? "kundenportal_gesperrt" : "kundenportal_entsperrt",
      entity: "kontakte",
      entity_id: kontaktId,
      meta: { konten: konten.length, geaendert, uebersprungen, fehler: fehler.length, datenbanksperre },
    })
    if (error) console.error("kundenportal-sperre: audit_log nicht geschrieben", error)
  } catch (e) {
    console.error("kundenportal-sperre: audit_log nicht geschrieben", e)
  }

  return {
    status: 200,
    rumpf: {
      ok: true,
      gesperrt,
      meta,
      datenbanksperre,
      konten: konten.length,
      anmeldungGeaendert: geaendert,
      anmeldungUebersprungen: uebersprungen,
      anmeldungFehler: fehler.length,
      anmeldungFehlerGrund: fehler[0] ?? null,
    },
  }
}
