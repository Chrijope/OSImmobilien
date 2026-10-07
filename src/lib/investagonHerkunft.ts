/**
 * Stammt dieses Objekt, diese Einheit aus Investagon?
 *
 * WARUM DAS ZAEHLT
 *
 * Was Investagon liefert, gehoert Investagon. Der Abgleich laeuft alle 15
 * Minuten und schreibt die Felder neu. Wer im CRM daran etwas aendert, sieht
 * seine Aenderung beim naechsten Lauf wieder verschwinden, ohne Hinweis und
 * ohne Fehlermeldung. Ein Knopf, der verlaesslich folgenlos bleibt, ist
 * schlimmer als kein Knopf: Er kostet Zeit und Vertrauen.
 *
 * Christian hat am 16.09.2026 verlangt, dass "Objekt bearbeiten",
 * "Objektangaben pflegen", "Wohnung bearbeiten" und "Einheit pflegen" bei
 * uebernommenen Objekten gar nicht erst erscheinen und nur bei selbst
 * angelegten sichtbar sind.
 *
 * WORAN MAN ES ERKENNT
 *
 * Der Import legt zu jedem Datensatz den Originaldatensatz unter
 * `meta.investagonRaw` ab und zusaetzlich die Kennung `meta.investagonId`
 * beziehungsweise `meta.investagonVollSyncVersion` am Objekt. Es genuegt eine
 * davon: Aeltere Einheiten aus der Zeit vor dem vollen Abgleich tragen nur die
 * Kennung, ohne den Rohdatensatz.
 *
 * Bewusst KEIN eigenes Datenbankfeld. Ein zweites Merkmal neben den
 * vorhandenen muesste gepflegt werden und koennte auseinanderlaufen; diese
 * Frage laesst sich aus dem beantworten, was ohnehin da ist.
 */

/** Was diese Datei von einem Datensatz braucht. */
export interface MitMeta {
  meta?: Record<string, unknown> | null;
  /** Manche Store-Typen reichen die Kennung schon ausgepackt durch. */
  investagonId?: string;
}

/**
 * Kommt der Datensatz aus Investagon?
 *
 * Im Zweifel `false`. Ein falsches Ja blendet die Pflegeknoepfe bei einem
 * selbst angelegten Objekt aus, und dann kann niemand mehr etwas eintragen.
 * Ein falsches Nein zeigt einen Knopf, der nichts bewirkt; aergerlich, aber
 * reparabel.
 */
export function ausInvestagon(d: MitMeta | null | undefined): boolean {
  if (!d) return false;
  if (typeof d.investagonId === "string" && d.investagonId.trim()) return true;
  const meta = d.meta;
  if (!meta || typeof meta !== "object") return false;
  return (
    !!meta.investagonRaw ||
    !!meta.investagonId ||
    !!meta.investagonVollSyncVersion ||
    !!meta.api_property_id
  );
}

/**
 * Darf an diesem Datensatz von Hand gepflegt werden?
 *
 * Die Umkehrung, als eigene Funktion, weil die Aufrufstellen so lesbarer sind:
 * `if (darfGepflegtWerden(objekt))` statt `if (!ausInvestagon(objekt))`.
 */
export function darfGepflegtWerden(d: MitMeta | null | undefined): boolean {
  return !ausInvestagon(d);
}

/** Der Satz, der erklaert, warum hier nichts zu bearbeiten ist. */
export const PFLEGE_GESPERRT_HINWEIS =
  "Dieses Objekt kommt aus Investagon und wird dort gepflegt. Änderungen hier würden beim nächsten Abgleich überschrieben.";
