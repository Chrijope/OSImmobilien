import type { VerlaufSchluessel } from "@/components/kunde/KommunikationReiter";

/*
 * Aus `pages/KundenDetail.tsx` herausgelöst (18.10.2026), damit Reiter,
 * Startreiter und alte Adressen ohne die ganze Profilseite prüfbar sind.
 */

/**
 * Die Reiter des Kundenprofils an genau einer Stelle.
 *
 * Sie stehen hier als Funktion und nicht mehr direkt in der Komponente, weil
 * zwei Stellen dieselbe Antwort brauchen: die Reiterleiste und die Pruefung
 * von `?tab=` aus der Adresse. Ohne eine gemeinsame Quelle koennte eine
 * Setterin ueber die Adresse einen Reiter oeffnen, den ihre Rolle gar nicht
 * hat, etwa die Dokumente.
 *
 * Reihenfolge: Uebersicht, Investments, Dokumente, Kommunikation,
 * Aktivitaeten. Den Reiter Stammdaten gibt es seit dem 18.10.2026 nicht mehr,
 * die Stammdaten stehen in der linken Spalte. Die Rollenabweichungen bleiben:
 * Die Setterin sieht nur die Investments und Empfehlungen, der Versicherungsexperte weder
 * den Kundenchat noch die Investment-Reiter. Der Kundenchat ist seit Welle 3
 * kein eigener Reiter mehr, deshalb faellt er fuer ihn innerhalb des Reiters
 * "Kommunikation" weg und nicht mehr an der Reiterleiste.
 *
 * Seit Welle 3 steht hier ein einziger Reiter "Kommunikation" statt der beiden
 * Chat-Eintraege. Die waren keine Reiter, sondern Weiterleitungen: Ein Klick
 * sprang auf `/chat` und das Profil war weg.
 *
 * Seit Welle 2 steht hier ein einziger Reiter "Investments" mit der Anzahl als
 * Zaehler. Vorher bekam jedes Investment einen eigenen Reiter, bei drei
 * Investments standen also drei Reiter nebeneinander und die Leiste wuchs mit
 * jedem neuen Vorgang weiter. Welches Investment offen ist, entscheidet jetzt
 * die Auswahl im Reiter selbst.
 */
export function baueReiter(
  rolle: string,
  investments: { id: string; nummer: number }[],
  ungeleseneNachrichten = 0,
): { key: string; label: string; draft?: boolean; anzahl?: number; neu?: number }[] {
  const investmentReiter = [
    { key: "investments", label: "Investments", anzahl: investments.length },
  ];
  if (rolle === "setterin") {
    return [...investmentReiter, { key: "empfehlungen", label: "Empfehlungen" }];
  }
  const istVersicherungsexperte = rolle === "versicherungsexperte";
  return [
    { key: "uebersicht", label: "Übersicht" },
    // `neu` ist die Zahl ungelesener Nachrichten beider Verlaeufe zusammen,
    // dieselbe Art Zaehler, die die Seitenleiste an ihren Eintraegen zeigt.
    { key: "kommunikation", label: "💬 Kommunikation", neu: ungeleseneNachrichten },
    { key: "dokumente", label: "📁 Dokumente" },
    ...(istVersicherungsexperte ? [] : investmentReiter),
    { key: "empfehlungen", label: "Empfehlungen" },
    { key: "aktivitaeten", label: "Aktivitäten" },
  ];
}

/**
 * Darf diese Rolle den Reiter ueberhaupt oeffnen?
 *
 * Gebraucht fuer `?tab=` aus der Adresse. Ob es das Investment wirklich gibt,
 * klaert spaeter der Sprung ins Investment beziehungsweise `renderContent`.
 */
export function istErlaubterReiter(schluessel: string, rolle: string): boolean {
  return baueReiter(rolle, []).some((t) => t.key === schluessel);
}

/**
 * Alte Adressen weiter verstehen.
 *
 * Bis Welle 2 hiess der Reiter eines Investments `inv-<id>`, und genau das
 * stand in `?tab=`. Bis Welle 3 gab es ausserdem `chat-intern` und
 * `chat-kunde`, dazu das ins Leere zeigende `chat` aus dem Kundenportal. Wer
 * sich so eine Adresse gemerkt oder verschickt hat, soll nicht auf einer
 * leeren Uebersicht landen. Rueckgabe: der heutige Reiter, das gemeinte
 * Investment und der gemeinte Verlauf.
 */
export function leseReiterAusAdresse(gewuenscht: string | null): {
  tab: string | null;
  investment: string | null;
  verlauf: VerlaufSchluessel | null;
} {
  if (!gewuenscht) return { tab: null, investment: null, verlauf: null };
  if (gewuenscht.startsWith("inv-")) {
    return { tab: "investments", investment: gewuenscht.slice(4), verlauf: null };
  }
  if (gewuenscht === "chat-intern") return { tab: "kommunikation", investment: null, verlauf: "intern" };
  if (gewuenscht === "chat-kunde") return { tab: "kommunikation", investment: null, verlauf: "kunde" };
  if (gewuenscht === "chat") return { tab: "kommunikation", investment: null, verlauf: null };
  // Seit dem 18.10.2026 ohne eigenen Reiter: Alte Links landen auf dem Startreiter.
  if (gewuenscht === "stammdaten") return { tab: null, investment: null, verlauf: null };
  return { tab: gewuenscht, investment: null, verlauf: null };
}

/**
 * Der Reiter, mit dem das Profil aufgeht, wenn die Adresse nichts vorgibt.
 *
 * Seit dem 18.10.2026 die Investments, die Stammdaten stehen links. Der
 * Versicherungsexperte hat keinen Investment-Reiter, er startet mit den
 * Dokumenten, dem ersten Reiter seiner Leiste.
 */
export function standardReiter(rolle: string): string {
  return rolle === "versicherungsexperte" ? "dokumente" : "investments";
}
