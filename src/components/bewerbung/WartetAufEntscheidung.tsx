import { Hourglass, MailWarning, MailPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { wartetAufEntscheidung, type KettenStand } from "@/lib/kennenlernenErinnerungen";
import {
  SAMMELMAIL_ERKLAERUNG,
  SAMMELMAIL_TEXTE,
  type SammelmailKennzeichen,
} from "@/lib/bewerberSammelmailStand";

/**
 * Was bei einem Bewerber liegen geblieben ist, als Kennzeichen in der Liste
 * und als Satz in der Akte.
 *
 * **Das Problem war nicht die fehlende Automatik, sondern die
 * Unsichtbarkeit.** Diese Bewerber lagen im Eingang wie jeder frische, ohne
 * Kennzeichen, und bei ihnen geschah nichts mehr. In der Liste ließen sie sich
 * von denen, bei denen alles seinen Gang geht, nicht unterscheiden.
 *
 * Drei Gründe, eine Anzeige. Bewusst eine und nicht drei nebeneinander: Wer
 * über eine Liste schaut, soll eine Frage beantworten können, nämlich „liegt
 * hier etwas". Was genau, steht im Zeigetext und in der Akte.
 *
 * 1. **Adresse gesperrt.** An diese Adresse geht keine Mail mehr hinaus. Das
 *    steht zuoberst, denn es macht jede andere Überlegung gegenstandslos:
 *    Auch der nächste Versand erreicht ihn nicht.
 * 2. **Wartet auf Entscheidung.** Die Erinnerungskette steht dauerhaft, weil
 *    der Bewerber nicht angerufen werden will oder sich selbst melden möchte.
 *    Gerechnet wird das in `wartetAufEntscheidung` in der geteilten Datei der
 *    Kette, nicht hier: Sonst sagte die Oberfläche „wartet", während der
 *    Zeitplan munter weiter Mails schickt.
 * 3. **Sammelmail fehlt.** Er würde beim nächsten Versand angeschrieben.
 *    Kommt aus derselben Vorschau, die der Versanddialog benutzt, siehe
 *    `bewerberSammelmailStand.ts`.
 *
 * Aufbau wie `NachfassBausteine`: ein Badge für die Liste, ein Satz für die
 * Akte, beides im Projektstil und niemals als Browser-Fenster.
 */

type OffenerPunkt = {
  kurz: string;
  lang: string;
  /** Tailwind-Klassen des Badges. */
  farbe: string;
  Symbol: typeof Hourglass;
};

/**
 * Der eine Punkt, der angezeigt wird. `null`, wenn nichts liegen geblieben ist.
 *
 * Die Reihenfolge ist die Rangfolge. Wer pausiert hat und obendrein die
 * Sammelmail nicht bekam, ist kein Versandfall: Ihm jetzt eine Aufforderung zu
 * schicken wäre das Gegenteil dessen, worum er gebeten hat.
 */
function offenerPunkt(
  stand: KettenStand,
  sammelmail?: SammelmailKennzeichen | null,
  hatMailZumBogen = false,
): OffenerPunkt | null {
  if (sammelmail === "adresse_gesperrt") {
    return {
      kurz: SAMMELMAIL_TEXTE.adresse_gesperrt,
      lang: SAMMELMAIL_ERKLAERUNG.adresse_gesperrt,
      farbe:
        "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200",
      Symbol: MailWarning,
    };
  }

  const wartet = wartetAufEntscheidung(stand);
  if (wartet) {
    return {
      kurz: "wartet auf Entscheidung",
      lang: `Bei diesem Bewerber geschieht von selbst nichts mehr. ${wartet.text}.`,
      farbe:
        "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200",
      Symbol: Hourglass,
    };
  }

  /*
   * „Fehlt" heißt: Dieser Bewerber hat noch KEINE Mail mit dem Link zum
   * Kennenlernbogen, auf keinem Weg.
   *
   * Die Vorschau allein reicht dafür nicht. Sie führt jeden als Empfänger, der
   * keinen Vermerk vom Sammelversand trägt, und das trifft auch jeden neu
   * Dazugekommenen: Der hat seinen Link längst automatisch beim Anlegen
   * bekommen, die Sammelmail lief nur einmal. Am 14.09.2026 stand das
   * Kennzeichen deshalb bei zehn Bewerbern, die alle versorgt waren.
   *
   * Ob eine Eingangsmail hinausging, weiß die Bewerberzeile selbst, siehe
   * `kennenlernMailAm`. Erst beide Angaben zusammen ergeben die Aussage.
   */
  if (sammelmail === "fehlt" && !hatMailZumBogen) {
    return {
      kurz: SAMMELMAIL_TEXTE.fehlt,
      lang: SAMMELMAIL_ERKLAERUNG.fehlt,
      farbe:
        "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200",
      Symbol: MailPlus,
    };
  }

  return null;
}

/** Das Kennzeichen neben dem Namen in der Bewerberliste. */
export function WartetAufEntscheidungBadge({
  stand,
  sammelmail,
  hatMailZumBogen,
}: {
  stand: KettenStand;
  /** Ist auf irgendeinem Weg schon eine Mail mit dem Link hinausgegangen? */
  hatMailZumBogen?: boolean;
  /**
   * Was die Vorschau der Sammelmail über diesen Bewerber sagt. Fehlt sie,
   * bleiben die beiden Mailfälle einfach weg: Ein Kennzeichen auf Verdacht
   * wäre schlimmer als keines.
   */
  sammelmail?: SammelmailKennzeichen | null;
}) {
  const punkt = offenerPunkt(stand, sammelmail, hatMailZumBogen);
  if (!punkt) return null;
  const { Symbol } = punkt;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] font-medium ${punkt.farbe}`} title={punkt.lang}>
      <Symbol className="h-3 w-3" aria-hidden />
      {punkt.kurz}
    </Badge>
  );
}

/**
 * Der Grund im Klartext, für die Akte.
 *
 * Steht in der Kennenlernen-Karte unter „Und wenn nichts passiert", also genau
 * dort, wo sonst der nächste Schritt der Kette steht. Ohne Kasten und ohne
 * eigene Überschrift: Die Karte hat schon eine, und ein zweiter Rahmen um zwei
 * Zeilen sieht nach mehr Bedeutung aus, als die Sache hat.
 */
export function WartetAufEntscheidungGrund({
  stand,
  sammelmail,
  hatMailZumBogen,
}: {
  stand: KettenStand;
  sammelmail?: SammelmailKennzeichen | null;
  hatMailZumBogen?: boolean;
}) {
  const punkt = offenerPunkt(stand, sammelmail, hatMailZumBogen);
  if (!punkt) return null;
  const { Symbol } = punkt;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground/80">
      <Symbol className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span>
        <span className="font-medium capitalize">{punkt.kurz}.</span> {punkt.lang}
      </span>
    </p>
  );
}
