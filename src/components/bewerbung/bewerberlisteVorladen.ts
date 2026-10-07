import { wennTabellenGeladen } from "@/lib/dataCache";
import { getBewerber } from "@/lib/bewerbungStore";
import { ABLAUF_NEU } from "@/lib/bewerberArbeitsplatz";
import { KENNENLERN_MAILS } from "@/lib/bewerberMailTracking";
import { ladeSammelmailStand } from "@/lib/bewerberSammelmailStand";
import { ladeVorabScores } from "./useVorabScores";
import { ladeKennenlernVersand } from "./useKennenlernVersand";
import { ladeMailOeffnungsStand } from "./useMailOeffnungen";
import { ladeBuchungenStand } from "./useBewerberVideocall";

/**
 * Die Angaben der Bewerberliste im Hintergrund holen, bevor jemand die Seite
 * oeffnet.
 *
 * ## Warum
 *
 * Die Liste wartet beim ersten Aufbau auf fuenf Angaben, die nicht im
 * `dataCache` liegen (Scores, Versand, Mailoeffnungen, Buchungen, fehlende
 * Eingangsmail). Ohne Vorladen stand deshalb beim ersten Klick nach dem Login
 * ein bis zwei Sekunden lang eine Ladeanzeige. Christian hat am 26.09.2026
 * verlangt, dass die Seite immer sofort erscheint.
 *
 * Hier werden genau dieselben Fragen gestellt wie in den Hooks, ueber dieselben
 * Ladefunktionen. Die Antworten landen im `nachladeSpeicher`, und die Seite
 * findet sie beim Oeffnen fertig vor. Oeffnet sie jemand, waehrend das
 * Vorladen noch laeuft, tritt sie der laufenden Abfrage bei.
 *
 * ## Wann
 *
 * Einmal je Sitzung, angestossen vom App-Rahmen, und nur fuer Rollen, die den
 * Bewerberprozess sehen (`darfBewerberprozess`). Gewartet wird, bis die
 * Tabelle `bewerbungen` ohnehin im Zwischenspeicher liegt; sie kommt ueber den
 * Ladeplan beim Start (`routenTabellen.ts`), dieses Modul drängelt nicht vor.
 * Die Zugriffsrechte aendern sich dadurch nicht: Es laufen dieselben Abfragen
 * mit denselben Rechten, nur frueher.
 */

let _angestossen = false;

export function bewerberlisteVorladen(): void {
  if (_angestossen) return;
  _angestossen = true;
  wennTabellenGeladen(["bewerbungen"], () => {
    // Dieselbe Liste wie auf der Seite, sonst passte der gemerkte Schluessel
    // nicht zu dem, was die Seite fragt.
    const ids = ABLAUF_NEU.liste(getBewerber()).map((b) => b.id);
    void ladeVorabScores(ids);
    void ladeKennenlernVersand(ids);
    void ladeMailOeffnungsStand(ids, KENNENLERN_MAILS);
    void ladeBuchungenStand();
    void ladeSammelmailStand();
  });
}

/** Nur fuer Tests: wieder in den Anfangszustand. */
export function setzeVorladenZurueck(): void {
  _angestossen = false;
}
