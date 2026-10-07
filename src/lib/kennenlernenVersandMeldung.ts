/**
 * Was nach einem Versand der Kennenlern-Einladung auf dem Schirm steht.
 *
 * Diese Texte standen bis zum 14.09.2026 nur in `KennenlernenKarte.tsx`, also
 * beim Knopf im Bewerberprofil. Der Dialog „Bewerber erfassen" rief dieselbe
 * Function auf, prüfte aber nur, ob der Aufruf technisch durchkam, und meldete
 * sonst Erfolg. Das ist die gefährlichste Art von Fehler: Der Bewerber bekommt
 * nichts, und niemand erfährt es.
 *
 * Denn die Function antwortet in drei verschiedenen Lagen mit Status 200:
 *
 *   1. `ok: false`                      sie hat bewusst nichts verschickt,
 *                                       etwa weil der Bogen schon vorliegt
 *   2. `ok: true, versandt: false`      der Link steht, die Mail kam nicht
 *                                       hinaus, etwa wegen der Sperrliste
 *   3. `ok: true, versandt: true`       alles gut
 *
 * Nur der dritte Fall ist Erfolg. Wer bloß auf `error` schaut, hält alle drei
 * dafür.
 *
 * Deshalb liegt die Deutung jetzt hier, einmal für alle Aufrufer.
 */

/** Die Antwort der Function `send-bewerber-kennenlernen`. */
export interface VersandAntwort {
  ok?: boolean;
  grund?: string;
  versandt?: boolean;
  versandGrund?: string;
}

/** Was der Aufrufer anzeigen soll. */
export interface VersandMeldung {
  /** Nur wahr, wenn die Mail den Bewerber wirklich erreicht hat. */
  gelungen: boolean;
  titel: string;
  text: string;
}

/**
 * Was der Nutzer nach einem gescheiterten Versand lesen soll.
 *
 * Vorher stand hier immer „Bitte in einem Moment noch einmal versuchen".
 * Das ist bei der häufigsten Ursache schlicht falsch: Ist die Versandfunktion
 * in Supabase noch nicht veröffentlicht, hilft kein Abwarten, und der Nutzer
 * versucht es zehnmal, ohne je zu erfahren, woran es liegt. Der technische
 * Wortlaut steht zusätzlich in der Browser-Konsole.
 */
export function versandFehlerText(fehler: unknown, detail = ""): string {
  const roh = fehler instanceof Error ? fehler.message : String(fehler ?? "");
  const text = roh.toLowerCase();

  // Der Wortlaut aus der Antwort der Function, sofern es ihn gibt. Er ist
  // immer genauer als „Edge Function returned a non-2xx status code".
  if (detail.trim()) return detail.trim();

  // Die Funktion selbst fehlt. Supabase meldet das je nach Weg als 404 oder
  // als „Failed to send a request to the Edge Function".
  if (text.includes("not found") || text.includes("404") || text.includes("failed to send a request")) {
    return "Die Versandfunktion ist in Supabase offenbar noch nicht veröffentlicht. " +
      "Wiederholen hilft dann nicht, sie muss erst bereitgestellt werden.";
  }
  if (text.includes("unauthorized") || text.includes("401") || text.includes("403")) {
    return "Die Anmeldung wurde nicht akzeptiert. Bitte einmal ab und wieder anmelden.";
  }
  if (text.includes("timeout") || text.includes("network") || text.includes("fetch")) {
    return "Die Verbindung kam nicht zustande. Hier hilft ein zweiter Versuch.";
  }
  return roh
    ? `Meldung aus dem System: ${roh}`
    : "Ohne nähere Meldung. Der technische Wortlaut steht in der Browser-Konsole.";
}

/**
 * Den Klartext aus einer fehlgeschlagenen Function-Antwort holen.
 *
 * `supabase.functions.invoke` wirft bei jedem Status ab 400 einen Fehler, dessen
 * `message` immer gleich lautet: „Edge Function returned a non-2xx status code".
 * Der eigentliche Grund steht im Rumpf der Antwort, und der hängt als `context`
 * am Fehler. Ohne diesen Griff bleibt jeder Serverfehler der Function für den
 * Nutzer namenlos.
 */
export async function fehlerDetail(fehler: unknown): Promise<string> {
  const ursache = (fehler as { context?: unknown })?.context;
  if (!(ursache instanceof Response)) return "";
  try {
    const koerper = await ursache.clone().json();
    const k = koerper as { grund?: unknown; error?: unknown };
    const grund = typeof k?.grund === "string" ? k.grund : "";
    const fehlertext = typeof k?.error === "string" ? k.error : "";
    return [fehlertext, grund].filter(Boolean).join(": ");
  } catch {
    return "";
  }
}

/**
 * Warum die Function den Versand abgelehnt hat, in einem Satz.
 *
 * Der Aufruf war erfolgreich, die Function hat aber `ok: false` geliefert. Die
 * neuen Fassungen schicken den Grund schon als lesbaren deutschen Satz mit; die
 * beiden Kurzformen darunter stammen aus der Fassung, die vor dem 08.09.2026 in
 * Supabase lag. Sie stehen hier, damit die Meldung auch dann verständlich ist,
 * wenn die Function noch nicht neu bereitgestellt wurde. Genau dieser Fall hat
 * die Vorführung gekostet.
 */
export function abbruchText(grund?: string): string {
  const roh = (grund || "").trim();
  if (roh === "bereits ausgefuellt") {
    return "Das Kennenlernen ist schon ausgefüllt. Damit es sich trotzdem noch einmal " +
      "verschicken lässt, muss die Function send-bewerber-kennenlernen in Supabase " +
      "neu bereitgestellt werden.";
  }
  if (roh === "keine E-Mail-Adresse") return "Am Bewerber steht keine E-Mail-Adresse.";
  return roh || "Ohne nähere Meldung. Der technische Wortlaut steht in der Browser-Konsole.";
}

/**
 * Warum die Mail nicht zugestellt wurde, obwohl der Link steht.
 *
 * Der häufigste Fall ist die Sperrliste: Kam eine Mail an diese Adresse schon
 * einmal zurück oder wurde sie abgemeldet, nimmt `send-transactional-email` den
 * Versand stillschweigend zurück und meldet trotzdem Status 200. Vorher stand
 * hier nur „Bitte im Protokoll nachsehen", und niemand wusste, wonach.
 */
export function zustellFehlerText(grund?: string): string {
  const roh = (grund || "").trim();
  if (!roh) {
    return "Der Link steht, der Versand hat nicht geklappt. Der Grund steht im Protokoll " +
      "der Function send-bewerber-kennenlernen.";
  }
  if (roh.toLowerCase().includes("sperrliste")) {
    return "Der Link steht. Die Mail ging nicht hinaus, weil die Adresse auf der Sperrliste " +
      "steht. Das passiert, wenn eine frühere Mail zurückkam oder sich jemand abgemeldet " +
      "hat. Die Adresse muss in suppressed_emails entfernt werden.";
  }
  return `Der Link steht, die Mail ging nicht hinaus: ${roh}`;
}

/**
 * Die drei Lagen aus dem Dateikopf zu einer Meldung zusammenfassen.
 *
 * `wer` erscheint im Erfolgstext und ist der Vorname des Bewerbers, damit auf
 * dem Schirm steht, wen es betrifft. Ohne Angabe bleibt der Satz allgemein.
 */
export function versandMeldung(antwort: VersandAntwort | null, wer = ""): VersandMeldung {
  if (!antwort?.ok) {
    return {
      gelungen: false,
      titel: "Nicht verschickt",
      text: abbruchText(antwort?.grund),
    };
  }
  if (!antwort.versandt) {
    return {
      gelungen: false,
      titel: "Link angelegt, Mail nicht zugestellt",
      text: zustellFehlerText(antwort.versandGrund),
    };
  }
  const name = wer.trim();
  return {
    gelungen: true,
    titel: "Mail ist raus",
    text: name
      ? `${name} bekommt jetzt die Einladung zum Kennenlernen.`
      : "Die Einladung zum Kennenlernen ist unterwegs.",
  };
}
