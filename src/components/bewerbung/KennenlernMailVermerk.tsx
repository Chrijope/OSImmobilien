import { Mail, Check, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Bewerber } from "@/lib/bewerbungStore";
import type { BogenVersand } from "@/components/bewerbung/useKennenlernVersand";
import { OEFFNUNG_UNSICHER, mitBogenBeleg, type MailOeffnung } from "@/lib/bewerberMailTracking";

/**
 * Ob und wann dieser Bewerber die Mail mit dem Kennenlernbogen bekommen hat.
 *
 * Christian hat das am 14.09.2026 verlangt, und zwar in dieser Richtung:
 * anzeigen, wer sie HAT. Das Gegenstück, das Kennzeichen „Sammelmail fehlt" in
 * `WartetAufEntscheidung`, bleibt bestehen, taugt aber gerade nicht als
 * Überblick: Vor dem zweiten Sammelversand fehlt die Mail bei rund 120 von 154
 * Bewerbern im Eingang. Ein Warnzeichen bei fast jedem ist kein Warnzeichen
 * mehr. Nach dem Versand kehrt sich das um, dann sind es Einzelfälle und das
 * Gegenstück ist wieder das richtige Mittel. Beide Richtungen haben also ihre
 * Zeit, deshalb steht hier eine zweite, ruhige Anzeige und keine zweite Warnung.
 *
 * **Angezeigt wird das Datum, nicht bloß ein Haken.** Es kostet denselben
 * Platz und beantwortet die Frage mit, die nach „hat er" als Nächstes kommt,
 * nämlich „seit wann". Bei einem Haken müsste man dafür die Akte öffnen.
 *
 * Drei Wege führen zu derselben Mail, und alle zählen:
 *
 *   `kennenlernenGesendetAm`  die automatische Mail beim Anlegen, der
 *                             Regelfall für alle, die neu dazukommen
 *   `klNachfassMailAm`        der Sammelversand an die, die schon da waren
 *   `bogenAngelegtAm`         der Rückfall: Gibt es einen Kennenlernbogen,
 *                             ging auch eine Mail mit seinem Link hinaus,
 *                             selbst wenn kein Vermerk geschrieben wurde
 *
 * Gibt es mehrere, gilt das spätere. Es ist die Mail, auf die sich der noch
 * gültige Link bezieht.
 */

/**
 * Welchen Bogen dieser Bewerber bekommen hat, und wann.
 *
 * `null` heißt: nie eine Mail mit einem Bogen. Drei Zustände statt zwei, weil
 * die Abfrage vom 14.09.2026 gezeigt hat, dass fast alle im Eingang gar nichts
 * haben, eine Handvoll nur den alten Vorabbogen und nur elf den aktuellen
 * Kennenlernbogen. Wer die beiden Bögen gleich behandelt, verschweigt genau
 * die Frage, um die es geht.
 */
export function kennenlernMailStand(
  bewerber: Bewerber,
  bogen?: BogenVersand | null,
): { art: "kennenlernen" | "vorab"; am: string } | null {
  const lesbar = (wert?: string | null) => {
    const roh = (wert || "").trim();
    return roh && !Number.isNaN(new Date(roh).getTime()) ? roh : "";
  };
  /*
   * Die beiden Vermerke in der Bewerberzeile gehören zum Kennenlernbogen: Den
   * einen schreibt die automatische Eingangsmail, den anderen der
   * Sammelversand. Beide verschicken den aktuellen Bogen.
   */
  const kennenlernen = [
    lesbar(bewerber.kennenlernenGesendetAm),
    lesbar(bewerber.klNachfassMailAm),
    lesbar(bogen?.kennenlernenAm),
  ].filter(Boolean).sort().pop();
  if (kennenlernen) return { art: "kennenlernen", am: kennenlernen };

  const vorab = lesbar(bogen?.vorabAm);
  return vorab ? { art: "vorab", am: vorab } : null;
}

/**
 * Das maßgebliche Datum, oder `null`, wenn nie eine Mail hinausging.
 *
 * Beantwortet die gröbere Frage „ging überhaupt Post hinaus" und entscheidet
 * damit, ob das Kennzeichen „Eingangsmail fehlt" erscheint.
 */
export function kennenlernMailAm(bewerber: Bewerber, bogen?: BogenVersand | null): string | null {
  return kennenlernMailStand(bewerber, bogen)?.am ?? null;
}

/**
 * Ist der Versand der Eingangsmail gescheitert?
 *
 * `send-bewerber-kennenlernen` schreibt `gesendetAm` auch dann, wenn die Mail
 * nicht hinausging, etwa weil die Adresse auf der Sperrliste steht. Ohne diese
 * Prüfung zeigte die Liste in genau diesem Fall ein ruhiges graues Symbol, und
 * der Bewerber wartete auf Post, die es nie gab.
 *
 * Ein Fehlschlag verjährt: Ging nach ihm eine andere Mail zum selben Bogen
 * hinaus, etwa der Sammelversand, gilt die spätere. Verglichen werden deshalb
 * die Zeitpunkte, und nur ein Fehlschlag, der nicht älter ist als der jüngste
 * bekannte Versand, bleibt stehen.
 */
export function versandGescheitert(
  bewerber: Bewerber,
  bogen?: BogenVersand | null,
  bogenEingereichtAm?: string | null,
): { grund: string; am: string } | null {
  if (bewerber.kennenlernenVersandOk !== false) return null;
  /*
   * Der ausgefuellte Bogen schlaegt jeden Fehlschlag, seit dem 16.09.2026.
   *
   * Der Link zum Kennenlernbogen steht ausschliesslich in der Eingangsmail.
   * Wer den Bogen abgeschickt hat, hat also eine Mail bekommen und geoeffnet,
   * was auch immer beim Versand einmal gemeldet wurde. Ohne diese Zeile blieb
   * bei genau diesen Bewerbern dauerhaft das rote Kreuz stehen, denn das
   * Kreuz geht dem Haken vor, und ein Fehlschlag ohne Zeitstempel verjaehrt
   * nie. Der Haken erschien dort also nie, obwohl der Beleg vorlag.
   */
  if ((bogenEingereichtAm || "").trim()) return null;
  const versuch = (bewerber.kennenlernenVersandAm || "").trim();
  const stand = kennenlernMailStand(bewerber, bogen);
  // Ohne Zeitpunkt lässt sich nichts vergleichen. Dann zählt der Fehlschlag,
  // denn die einzige Aussage, die wir haben, ist „es ging nicht hinaus".
  if (stand && versuch && versuch < stand.am) return null;
  return { grund: (bewerber.kennenlernenVersandGrund || "").trim(), am: versuch || stand?.am || "" };
}

/**
 * Der Vermerk unter dem Erstelldatum in der Bewerberliste.
 *
 * Ohne Mail steht dort nichts. Eine Zeile „noch keine Mail" bei jedem zweiten
 * Bewerber wäre genau die Tapete, die dieser Anzeige den Sinn nähme; dass
 * nichts dasteht, sagt dasselbe und drängt sich nicht auf.
 *
 * ## Die drei Zustände, seit dem 14.09.2026
 *
 *   **Grau, geschlossener Umschlag.** Die Mail ist hinaus, der Link darin
 *   wurde bisher nicht aufgerufen. Ausdrücklich nicht „ungelesen": Wer die
 *   Mail liest und nicht klickt, sieht genauso aus.
 *
 *   **Grün, Umschlag mit Haken.** Der Link aus der Mail wurde aufgerufen oder
 *   der Bogen liegt vor. Seit dem 26.09.2026 gibt es kein Zählpixel mehr,
 *   siehe `bewerberMailTracking.ts`.
 *
 *   **Rot, Umschlag mit Kreuz.** Der Versand ist gescheitert. Das ist der
 *   einzige der drei Zustände, der sicher stimmt, und deshalb der wichtigste:
 *   Vorher sah er aus wie „hinausgegangen".
 *
 * Die Farbe trägt die Aussage nie allein. Jeder Zustand hat eine eigene
 * Umschlagform, und `aria-label` sagt ihn als Satz, damit eine Vorlesehilfe
 * dasselbe erfährt wie das Auge.
 */
export function KennenlernMailVermerk({
  bewerber,
  bogen,
  oeffnung,
  bogenEingereichtAm,
  vorabbogenEingereichtAm,
}: {
  bewerber: Bewerber;
  /** Was `useKennenlernVersand` über die Bögen dieses Bewerbers weiß. */
  bogen?: BogenVersand | null;
  /**
   * Was das Öffnungstracking über die Mails zum Kennenlernbogen weiß.
   * Fehlt es, bleibt es beim grauen Umschlag: Nichts gemessen ist der
   * richtige Ausgangszustand, auch wenn die Abfrage gar nicht lief.
   */
  oeffnung?: MailOeffnung | null;
  /**
   * Wann der Kennenlernbogen eingereicht wurde, ISO. Leer heißt: nicht
   * eingereicht. Liegt er vor, gilt die Mail als geöffnet, auch wenn in
   * `bewerber_mail_tracking` nichts steht. Siehe `mitBogenBeleg`.
   */
  bogenEingereichtAm?: string | null;
  /**
   * Wann der frühere Vorabbogen eingereicht wurde, ISO. Leer heißt: nicht
   * eingereicht.
   *
   * Christians Entscheidung vom 16.09.2026: Auch er belegt eine geöffnete
   * Mail, denn auch sein Link stand ausschließlich in einer Mail von uns.
   * Er steht bewusst getrennt vom Kennenlernbogen, weil er zwei Dinge NICHT
   * darf: den roten Fehlschlag der Kennenlernmail überdecken und behaupten,
   * genau diese Mail sei geöffnet worden. Der Tooltip sagt deshalb je Fall,
   * worauf der Haken beruht.
   */
  vorabbogenEingereichtAm?: string | null;
}) {
  const stand = kennenlernMailStand(bewerber, bogen);
  const fehlschlag = versandGescheitert(bewerber, bogen, bogenEingereichtAm);
  // Ein Fehlschlag zählt auch ohne Versanddatum: `submit-bewerbung` und der
  // Zapier-Webhook vermerken ihn ohne `gesendetAm`, und ohne diese Zeile bliebe
  // genau dieser Fall in der Liste unsichtbar.
  if (!stand && !fehlschlag) return null;

  const datum = (iso?: string) => {
    const d = new Date(iso || "");
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
  };
  const zeitpunkt = (iso?: string) => {
    const d = new Date(iso || "");
    if (Number.isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("de-DE")} um ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
  };

  const versandDatum = datum(stand?.am || fehlschlag?.am);
  const neu = stand?.art === "kennenlernen";
  /*
   * Der eingereichte Bogen zählt wie eine Öffnung, seit dem 16.09.2026.
   *
   * Vorher hing der Haken allein an `bewerber_mail_tracking`. Der Vermerk
   * dorthin kann aus mehreren Gründen ausbleiben, ohne dass es jemand merkt;
   * die Begründung steht bei `mitBogenBeleg`. Der Bogen selbst liegt dagegen
   * in derselben Liste vor und ist der sicherere Beleg.
   */
  /*
   * Und seit dem 16.09.2026 zählt auch der frühere Vorabbogen. Der
   * Kennenlernbogen geht vor: Liegt er vor, ist er der genauere Beleg, denn er
   * gehört zu genau der Mail, an der dieses Symbol hängt.
   */
  const belegKennenlernen = (bogenEingereichtAm || "").trim();
  const belegVorab = (vorabbogenEingereichtAm || "").trim();
  const oeffnungStand = mitBogenBeleg(oeffnung, belegKennenlernen || belegVorab);
  const geoeffnet = !!oeffnungStand && oeffnungStand.geoeffnet > 0;
  /*
   * Abgeleitet statt gemessen, seit dem 15.09.2026.
   *
   * Wer den Kennenlernbogen abgeschickt hat, hat die Mail geöffnet, denn der
   * Link steht nur dort. Das ist der sicherere der beiden Belege, aber eben
   * keine Messung. Beides gleich zu benennen würde die Zahl der gemessenen
   * Öffnungen schönen, deshalb sagt der Tooltip, welcher Fall vorliegt.
   */
  const ausBogen = geoeffnet && oeffnungStand?.quelle === "bogen";
  /*
   * Aus welchem der beiden Bögen der Beleg stammt.
   *
   * Der Unterschied gehört in den Wortlaut und nicht nur in den Code. Beim
   * Kennenlernbogen ist genau die Mail belegt, an der dieses Symbol hängt.
   * Beim Vorabbogen ist eine Mail von uns belegt, aber eine andere. Die
   * Anzeige darf das nicht gleich benennen, sonst behauptet sie mehr, als sie
   * weiß.
   *
   * Entschieden wird das hier und nicht am Vermerk in der Datenbank. Dort
   * steht nur `opened_source = 'bogen'`, also „aus einem Bogen abgeleitet",
   * und nicht, aus welchem. Nach der Migration vom 16.09.2026 trägt auch der
   * Altfall genau diesen Vermerk. Welcher Bogen vorliegt, weiß dagegen die
   * Liste selbst: `useVorabScores` lädt beide getrennt. Liegt ein Vorabbogen
   * vor und kein Kennenlernbogen, kann der abgeleitete Beleg nur aus dem
   * Vorabbogen stammen.
   */
  const ausVorabbogen = ausBogen && !!belegVorab && !belegKennenlernen;

  /*
   * Form, Farbe und Satz je Zustand, an einer Stelle.
   *
   * Der Umschlag ist immer dasselbe Grundzeichen. Der Zustand traegt ein
   * zweites Symbol daneben: ein Haken fuer geoeffnet, ein Kreuz fuer
   * gescheiterten Versand. Beide sind gross genug, um sie ohne Lupe zu
   * erkennen, anders als der kleine Haken im `MailCheck`-Umschlag.
   */
  const NebenZeichen = fehlschlag ? X : geoeffnet ? Check : null;
  /*
   * Das Gruen ist `emerald` und nicht der Token `--success`.
   *
   * Grund ist der Kontrast: `--success` steht auf hsl(142 71% 45%), also
   * #21C45D, und erreicht auf weissem Grund nur 2,33 zu 1. Fuer ein Symbol,
   * das eine Aussage traegt, sind 3 zu 1 gefordert. `emerald-700` liegt bei
   * knapp 6 zu 1, im Dunkelmodus uebernimmt `emerald-400`.
   *
   * Dasselbe Paar tragen die Satzart-Anzeige in der Abrechnung und das
   * Vorab-Score-Badge. Damit ist es das Hausmuster fuer "gut" und keine neu
   * erfundene Farbe.
   */
  const farbe = fehlschlag
    ? "text-destructive hover:text-destructive"
    : geoeffnet
      ? "text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
      : "text-muted-foreground hover:text-foreground";
  /*
   * Der Zustand als Satz, für Vorlesehilfen und als Zeigetext.
   *
   * Er nennt zuerst weiter, welcher Bogen hinausging, denn das war die Frage
   * dieser Anzeige, bevor das Öffnungstracking dazukam. Der gemessene Zustand
   * hängt hinten an, ausdrücklich als „keine Öffnung gemessen" und nicht als
   * „ungelesen".
   */
  const bogenSatz = neu
    ? `Kennenlernbogen ist am ${versandDatum} hinausgegangen`
    : `Nur der frühere Vorabbogen, am ${versandDatum}`;
  const kurz = fehlschlag
    ? `Versand gescheitert${versandDatum ? ` am ${versandDatum}` : ""}${fehlschlag.grund ? `: ${fehlschlag.grund}` : ""}. Der Bewerber hat nichts bekommen.`
    : ausVorabbogen
      ? `${bogenSatz}, früherer Vorabbogen ausgefüllt am ${datum(oeffnungStand?.geoeffnetAm)}`
      : ausBogen
      ? `${bogenSatz}, Bogen ausgefüllt am ${datum(oeffnungStand?.geoeffnetAm)}`
      : geoeffnet
        ? `${bogenSatz}, Link geöffnet am ${datum(oeffnungStand?.geoeffnetAm)}`
        : `${bogenSatz}, Link noch nicht geöffnet`;

  /*
   * Ein richtiger Tooltip statt des `title` des Browsers. Der erscheint erst
   * nach gut einer Sekunde, trägt die Schrift des Betriebssystems und lässt
   * sich nicht umbrechen; bei zwei Saetzen ist das unbrauchbar.
   *
   * `stopPropagation` ist hier keine Feinheit: Die ganze Tabellenzeile ist
   * klickbar und oeffnet die Akte. Ohne den Stopp waere das Symbol ein Knopf,
   * der etwas ganz anderes tut, als er verspricht.
   */
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={kurz}
          onClick={(e) => e.stopPropagation()}
          /*
           * Der Abstand geht nach LINKS, nicht nach oben: Das Symbol steht als
           * `inline-flex` in derselben Zeile wie das Anlegedatum, nicht unter
           * ihm. Ein erster Versuch mit `mt-2` traf deshalb die falsche Achse,
           * und „14.9.2026" klebte weiter am Umschlag.
           */
          className={`ml-1.5 inline-flex shrink-0 items-center gap-0.5 align-middle transition-colors ${farbe}`}
        >
          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {NebenZeichen && <NebenZeichen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs leading-snug" style={{ maxWidth: 300 }}>
        {fehlschlag ? (
          <>
            <p className="font-medium">Versand gescheitert</p>
            <p className="mt-0.5 text-muted-foreground">
              {versandDatum ? `Am ${versandDatum} versucht, ` : "Versucht, "}
              aber nicht zugestellt{fehlschlag.grund ? `: ${fehlschlag.grund}` : ""}. Der Bewerber
              hat nichts bekommen. Erst die Adresse prüfen, dann noch einmal verschicken.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">
              {neu ? "Aktueller Kennenlernbogen" : "Nur der frühere Vorabbogen"}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {neu
                ? `Am ${versandDatum} per Mail hinausgegangen. Der Bewerber hat den Link mit den sieben Kapiteln.`
                : `Am ${versandDatum} hinausgegangen. Den aktuellen Kennenlernbogen hat dieser Bewerber noch nicht bekommen, er würde beim nächsten Versand angeschrieben.`}
            </p>
            <p className="mt-1.5 font-medium">
              {ausVorabbogen
                ? "Vorabbogen ist ausgefüllt"
                : ausBogen
                  ? "Bogen ist ausgefüllt"
                  : geoeffnet
                    ? "Link geöffnet"
                    : "Link noch nicht geöffnet"}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {ausVorabbogen
                ? `Der frühere Vorabbogen wurde am ${zeitpunkt(oeffnungStand?.geoeffnetAm)} abgeschickt. Sein Link stand ausschließlich in einer Mail von uns, der Bewerber hat also Post von uns bekommen und den Link aufgerufen. Ob es genau die Mail oben war, sagt das nicht.`
                : ausBogen
                ? `Der Kennenlernbogen wurde am ${zeitpunkt(oeffnungStand?.geoeffnetAm)} abgeschickt. Sein Link steht nur in unseren Mails, der Bewerber hat ihn also aufgerufen.`
                : geoeffnet
                  ? `Zuletzt am ${zeitpunkt(oeffnungStand?.geoeffnetAm)}${oeffnungStand?.geoeffneteMail ? `, ${oeffnungStand.geoeffneteMail}` : ""}.` +
                    (oeffnungStand && oeffnungStand.gesendet > 1
                      ? ` Bei ${oeffnungStand.geoeffnet} von ${oeffnungStand.gesendet} Mails wurde der Link aufgerufen.`
                      : "")
                  : oeffnungStand
                    ? `${oeffnungStand.gesendet === 1 ? "Der Link aus dieser Mail wurde" : `Aus den ${oeffnungStand.gesendet} verschickten Mails wurde der Link`} bisher nicht aufgerufen. Ob er sie gelesen hat, wissen wir nicht.`
                    : "Zu dieser Mail läuft keine Linkzählung. Ob er sie gelesen hat, wissen wir nicht."}
            </p>
            {/*
              Der Hinweis gehört zur Linkzählung. Beim ausgefüllten Bogen
              wäre er überflüssig, der Beleg ist sicher.
            */}
            {!ausBogen && <p className="mt-1.5 text-muted-foreground">{OEFFNUNG_UNSICHER}</p>}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
