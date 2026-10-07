import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, CalendarCheck, CalendarClock } from "lucide-react";
import { useSeitentitel, oeffentlicherTitel } from "@/lib/seitentitel";
import { Buehne, Balken, Kennung, FLAECHE_FELD, FLAECHE_HINWEIS } from "@/components/videoraum/Buehne";
import { Karte, KartenTitel } from "@/components/videoraum/Warteraum";
import { BuchungLaedt, BuchungMeldung, Fehlerzeile, Hauptknopf } from "@/components/buchung/Bausteine";
import { einbettbar, istKalenderAdresse, kalenderAdresse } from "@/lib/kalenderEinbetten";
import { heuteBerlinIso, langesDatumAusIso } from "@/lib/datumsformate";
import { ZweiKlickEinbettung } from "@/components/cookie/ZweiKlickEinbettung";
import { KOOPERATION_KALENDER_URL } from "../../supabase/functions/_shared/bewerber-kooperationsgespraech-mail";
import {
  bestaetigeKennenlerntermin,
  ladeKennenlerntermin,
  type KennenlerntereminStand,
} from "@/lib/kennenlerntermin";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import { meldeLinkAufruf } from "@/lib/bewerberMailTracking";

/**
 * Die Terminseite für das Kennenlerngespräch, unter `/kennenlerngespraech/:token`.
 *
 * ## Warum es diese Seite gibt
 *
 * Der Knopf in der Einladungsmail führte zuerst auf unsere eigene
 * Buchungsstrecke, seit dem 21.09.2026 auf Calendly. Beides hatte einen Haken:
 * Die eigene Strecke lief nicht zuverlässig, und Calendly meldet uns nichts
 * zurück, sodass die HR-Managerin jeden Termin von Hand nachtragen musste.
 *
 * Christians Lösung, und die Seite setzt genau sie um: Der fremde Kalender
 * steckt in unserer eigenen Seite, und daneben bestätigt der Bewerber die Zeit,
 * die er gerade gebucht hat. Damit steht sie sofort im Profil.
 *
 * ## Warum sie aussieht wie die Terminseite des Partners
 *
 * Christian am 21.09.2026: Beide Seiten tun dasselbe, beide bekommt jemand per
 * Link, ohne sich anzumelden. Sie sollen deshalb auch gleich aussehen, im
 * dunklen Haus-Design mit dem Karomuster. Der Aufbau ist eins zu eins von
 * `src/pages/PartnerTermin.tsx` übernommen: links der Kalender über die breite
 * Spalte, rechts in einer schmalen Spalte die Bestätigung, oben festgeklebt.
 *
 * ## Warum die Bestätigung neben dem Kalender steht
 *
 * Der eingebettete Kalender könnte uns melden, dass gebucht wurde. Diese
 * Meldung enthält aber keine Uhrzeit, und Christian hat entschieden, ohne sie
 * zu bauen. Die Seite kann also nicht wissen, wann jemand gebucht hat, und
 * fragt danach. Das Feld klebt oben fest, damit es nach dem Buchen noch im
 * Blick ist: Der Kalender daneben ist hoch und scrollt innen.
 *
 * ## Warum nichts erzwungen wird
 *
 * Wer die Bestätigung überspringt, hat trotzdem gebucht. Die Seite sagt das
 * auch. Ein Pflichtfeld hinter einer bereits erfolgten Buchung lässt Leute
 * glauben, die Buchung sei nicht durchgegangen, und sie buchen ein zweites Mal.
 */

export default function BewerberKennenlerntermin() {
  const { token = "" } = useParams<{ token: string }>();
  useSeitentitel(oeffentlicherTitel("Kennenlerngespräch"));

  const [stand, setStand] = useState<KennenlerntereminStand | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [datum, setDatum] = useState("");
  const [uhrzeit, setUhrzeit] = useState("");
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Nach dem Bestätigen zeigt die Seite das Ergebnis. Über „Zeit korrigieren"
  // geht es zurück in die Eingabe, ohne dass der Kalender neu geladen wird.
  const [korrigiert, setKorrigiert] = useState(false);

  const holen = useCallback(async () => {
    const s = await ladeKennenlerntermin(token);
    setStand(s);
    setDatum(s?.datum || "");
    setUhrzeit(s?.uhrzeit || "");
    setLaedt(false);
  }, [token]);

  useEffect(() => { void holen(); }, [holen]);
  // Den Aufruf des Links aus der Einladung zählen, statt eines Zählpixels.
  useEffect(() => { meldeLinkAufruf(); }, []);

  const bestaetigen = async () => {
    if (arbeitet) return;
    setFehler(null);
    setArbeitet(true);
    const ergebnis = await bestaetigeKennenlerntermin(token, datum, uhrzeit);
    setArbeitet(false);
    if (ergebnis.ok !== true) {
      setFehler(ergebnis.grund);
      return;
    }
    setStand((alt) => ({
      vorname: alt?.vorname || "",
      datum,
      uhrzeit,
      quelle: "bewerber",
      kalender: alt?.kalender ?? null,
    }));
    setKorrigiert(false);
  };

  if (laedt) return <BuchungLaedt />;

  /*
    Kein Zugang. Das ist derselbe Text für ein unbekanntes Token, einen nicht
    eingereichten Bogen und eine noch nicht gelaufene Migration. Absichtlich:
    Ein unbekanntes Token soll nicht verraten, ob es das Token gibt.
  */
  if (!stand) {
    return (
      <BuchungMeldung
        kennung="Kennenlerngespräch"
        titel="Dieser Link ist nicht mehr gültig"
        text="Antworte einfach kurz auf unsere Mail, dann klären wir den Termin direkt."
      />
    );
  }

  /*
    Die Kalenderadresse kommt seit dem 21.09.2026 aus dem Profil der
    zuständigen HR-Person, siehe Migration 20260921260000. `null` heisst: Die
    Datenbankfunktion kennt das Feld noch nicht, weil die Migration in Supabase
    noch nicht gelaufen ist. Solange gilt die bisherige feste Adresse, sonst
    stünde der Bewerber in der Zwischenzeit vor einer Seite ohne Kalender.

    Diese eine Zeile darf weg, sobald die Migration gelaufen ist.
  */
  const kalender = stand.kalender === null ? KOOPERATION_KALENDER_URL : stand.kalender;
  const kalenderNutzbar = istKalenderAdresse(kalender);

  const bestaetigt = !!stand.datum && !!stand.uhrzeit && !korrigiert;

  // ───────────────────────────────────────────────── Der bestätigte Termin

  if (bestaetigt) {
    return (
      <Buehne>
        <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center px-6 py-24">
          <div className="text-center">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-[#34C759]/30 bg-[#34C759]/10 px-4 py-1.5 text-xs text-[#7EE29B]">
              <CalendarCheck className="h-3.5 w-3.5" />
              Termin steht
            </span>
            <h1 className="mt-4 text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] sm:text-[38px]">
              {stand.vorname ? `Danke, ${stand.vorname}.` : "Vielen Dank."}
            </h1>
            <Balken className="mx-auto mt-6" />
          </div>

          <div className="mx-auto mt-9 w-full max-w-[460px]">
            <Karte>
              <KartenTitel>Dein Termin</KartenTitel>
              <Zeile icon={<CalendarClock className="h-3.5 w-3.5" />} beschriftung="Wann">
                {langesDatumAusIso(stand.datum)}, {stand.uhrzeit} Uhr
              </Zeile>

              {/*
                Den Zugangslink verschickt der Kalender selbst, zusammen mit
                seiner Terminbestätigung, und zwar sofort nach dem Buchen. Der
                Satz stand hier einmal im Futur („schicken wir dir kurz
                vorher"), und der Bewerber wartete auf eine Mail, die längst in
                seinem Postfach lag. Der Hinweis auf den Spam-Ordner steht
                bewusst da: Eine Mail eines fremden Kalenderdienstes landet dort
                häufiger als unsere eigene.
              */}
              <div className={`mt-6 rounded-[14px] border border-[#88CFFF]/15 ${FLAECHE_HINWEIS} p-4`}>
                <p className="text-[12.5px] leading-relaxed text-white/60">
                  Den Zugang zum Videocall hast du bereits per E-Mail bekommen, zusammen mit der
                  Terminbestätigung. Schau bitte kurz in deinem Posteingang nach, und wenn dort
                  nichts ist, im Spam-Ordner. Vorbereiten musst du nichts.
                </p>
              </div>

              <p className="mt-6 border-t border-white/10 pt-5 text-[12.5px] leading-relaxed text-white/40">
                Hast du die Zeit falsch eingetragen?
              </p>
              <button
                type="button"
                onClick={() => setKorrigiert(true)}
                className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#88CFFF] hover:underline"
              >
                Zeit korrigieren <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </Karte>
          </div>

          <Fussleiste />
        </div>
      </Buehne>
    );
  }

  // ─────────────────────────────── Kalender links, Bestätigung rechts

  return (
    <Buehne>
      <div className="mx-auto min-h-[100dvh] max-w-6xl px-6 py-24 sm:px-10">
        <Kennung>Kennenlerngespräch</Kennung>
        <h1 className="mt-3 max-w-2xl text-[30px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[40px]">
          {stand.vorname ? `${stand.vorname}, such dir eine Zeit aus.` : "Such dir eine Zeit aus."}
        </h1>
        <Balken className="mt-6" />
        <p className="mt-5 max-w-[540px] text-[15.5px] leading-relaxed text-white/60">
          Du buchst im Kalender und trägst die Zeit gleich daneben ein. Zusammen keine zwei Minuten.
        </p>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Karte>
            <KartenTitel>Zeit im Kalender aussuchen</KartenTitel>

            {!kalenderNutzbar ? (
              /*
                Es ist keine Kalenderadresse hinterlegt. Ein leerer Rahmen sähe
                nach einem Fehler des Bewerbers aus, deshalb sagt die Seite,
                was los ist, und bleibt beim Weg über die Mail. Die Bestätigung
                daneben bleibt trotzdem bedienbar: Wer über einen anderen Weg
                schon gebucht hat, soll die Zeit eintragen können.
              */
              <div className={`rounded-[14px] border border-white/12 ${FLAECHE_FELD} p-6 text-center`}>
                <p className="text-[15px] font-semibold">Der Kalender ist gerade nicht erreichbar</p>
                <p className="mx-auto mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-white/60">
                  Antworte einfach kurz auf unsere Einladungsmail, dann schlagen wir dir zwei
                  Zeiten vor. Hast du bereits eine Zeit vereinbart, trag sie gern gleich daneben
                  ein.
                </p>
              </div>
            ) : einbettbar(kalender) ? (
              <div className="overflow-hidden rounded-[14px] border border-white/10 bg-white">
                {/*
                  Der Kalender als eingebettete Seite. Die Sicherheitsregel in
                  `public/_headers` erlaubt fremde Seiten über HTTPS
                  ausdrücklich. Die Höhe ist fest, weil eine eingebettete fremde
                  Seite ihre eigene Höhe nicht an uns melden kann.

                  Weißer Grund: Die Kalenderdienste liefern selbst eine helle
                  Seite. Ohne ihn blitzt beim Laden der dunkle Hintergrund durch
                  und es sieht nach einem Fehler aus.
                */}
                {/* Erst nach einem Klick, siehe `ZweiKlickEinbettung`. */}
                <ZweiKlickEinbettung url={kalender}>
                  <iframe
                    src={kalenderAdresse(kalender)}
                    title="Termin aussuchen"
                    className="block h-[820px] w-full border-0"
                    loading="lazy"
                  />
                </ZweiKlickEinbettung>
              </div>
            ) : (
              /*
                Dieser Kalenderdienst erlaubt das Einbetten nicht, siehe
                NICHT_EINBETTBAR in `kalenderEinbetten.ts`. Statt eines leeren
                Rahmens mit der Meldung "hat die Verbindung abgelehnt" steht
                hier ein Knopf, der ihn in einem eigenen Fenster öffnet. Der
                Ablauf bleibt derselbe. Heute nutzt die zuständige Person
                Calendly, das sich einbetten lässt; wechselt sie einmal, steht
                der Bewerber trotzdem nicht vor einem toten Kasten.
              */
              <div className={`rounded-[14px] border border-white/12 ${FLAECHE_FELD} p-6 text-center`}>
                <p className="text-[15px] font-semibold">Der Kalender öffnet sich in einem eigenen Fenster</p>
                <p className="mx-auto mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-white/60">
                  Such dir dort eine Zeit aus und komm anschließend hierher zurück, um sie zu
                  bestätigen.
                </p>
                <div className="mx-auto mt-5 max-w-[280px]">
                  <Hauptknopf aufKlick={() => window.open(kalender, "_blank", "noopener,noreferrer")}>
                    Kalender öffnen <ArrowRight className="h-4 w-4" />
                  </Hauptknopf>
                </div>
              </div>
            )}
          </Karte>

          {/*
            Die Bestätigung klebt auf breiten Bildschirmen oben fest. Der
            Kalender daneben ist hoch und scrollt innen; ohne das Kleben wäre
            das Feld nach dem Buchen wieder aus dem Blick.
          */}
          <div className="lg:sticky lg:top-8">
            <Karte>
              <form onSubmit={(e) => { e.preventDefault(); void bestaetigen(); }} noValidate>
                <KartenTitel>Gebuchte Zeit bestätigen</KartenTitel>
                <p className="mb-5 text-[13.5px] leading-relaxed text-white/60">
                  Sobald du gebucht hast, trag die Zeit hier kurz ein. Dann haben wir sie sofort
                  und müssen nicht nachfragen.
                </p>

                {/*
                  Nebeneinander nur dort, wo Platz ist. In der schmalen rechten
                  Spalte stünden zwei Felder sonst gequetscht nebeneinander.
                */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <label htmlFor="kennenlerntermin-datum" className="block text-xs font-semibold text-white/60">
                      Datum
                    </label>
                    <input
                      id="kennenlerntermin-datum"
                      type="date"
                      value={datum}
                      min={heuteBerlinIso()}
                      onChange={(e) => { setDatum(e.target.value); setFehler(null); }}
                      className={`mt-2 h-[48px] w-full rounded-xl border border-white/15 ${FLAECHE_FELD} px-4 text-[15px] text-white outline-none focus:border-[#88CFFF]`}
                    />
                  </div>
                  <div>
                    <label htmlFor="kennenlerntermin-uhrzeit" className="block text-xs font-semibold text-white/60">
                      Uhrzeit
                    </label>
                    <input
                      id="kennenlerntermin-uhrzeit"
                      type="time"
                      value={uhrzeit}
                      onChange={(e) => { setUhrzeit(e.target.value); setFehler(null); }}
                      className={`mt-2 h-[48px] w-full rounded-xl border border-white/15 ${FLAECHE_FELD} px-4 text-[15px] text-white outline-none focus:border-[#88CFFF]`}
                    />
                  </div>
                </div>

                {datum && uhrzeit && (
                  <p className="mt-4 text-[13.5px] text-white/60">
                    Gewählt:{" "}
                    <b className="font-semibold text-white">
                      {langesDatumAusIso(datum)}, {uhrzeit} Uhr
                    </b>
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3">
                  <Fehlerzeile text={fehler} />
                  <Hauptknopf art="submit" laedt={arbeitet} gesperrt={!datum || !uhrzeit}>
                    Termin bestätigen <ArrowRight className="h-4 w-4" />
                  </Hauptknopf>
                  <p className="text-center text-[12.5px] leading-relaxed text-white/40">
                    Dein Termin im Kalender steht auch ohne diesen Schritt. Er erspart uns nur die
                    Nachfrage.
                  </p>
                </div>
              </form>
            </Karte>
          </div>
        </div>

        <Fussleiste />
      </div>
    </Buehne>
  );
}

/*
  Fußzeile und Zeile stehen auch in `PartnerTermin.tsx`. An dieser Datei wird
  parallel gearbeitet, sie durfte am 21.09.2026 nicht angefasst werden. Sobald
  sie frei ist, gehören beide Kleinteile nach `components/buchung/Bausteine`,
  damit es nur eine Wahrheit gibt.
*/
function Fussleiste() {
  return (
    <p className="mt-10 text-center text-[10.5px] text-white/30">
      MOREImmo · Wendelsteinstraße 19, 83075 Bad Feilnbach
      <span aria-hidden className="mx-2 text-white/20">·</span>
      <a href="/impressum" className="hover:text-white/60 hover:underline">Impressum</a>
      <span aria-hidden className="mx-2 text-white/20">·</span>
      <a href="/datenschutz" className="hover:text-white/60 hover:underline">Datenschutz</a>
      <span aria-hidden className="mx-2 text-white/20">·</span>
      <CookieEinstellungenLink className="hover:text-white/60 hover:underline" />
    </p>
  );
}

function Zeile({
  icon,
  beschriftung,
  children,
}: {
  icon: React.ReactNode;
  beschriftung: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#88CFFF]/[0.13] text-[#88CFFF]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-[0.14em] text-white/40">{beschriftung}</span>
        <span className="mt-0.5 block text-[14.5px] text-white">{children}</span>
      </span>
    </div>
  );
}
