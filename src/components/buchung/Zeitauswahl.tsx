import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { FLAECHE_FELD_KNOPF } from "@/components/videoraum/Buehne";
import {
  TAGE_PRO_SEITE,
  beschriftungTag,
  beschriftungZeitKnopf,
  blaettere,
  fensterTage,
  gruppiereNachTag,
  kannVor,
  kannZurueck,
  uhrzeitInZone,
  vorausschauGrenzen,
  teileNachTageszeit,
} from "@/lib/buchungAuswahl";
import { STANDARD_SPRACHE, texteFuer, type Sprache } from "@/lib/seitenSprache";
import { BUCHUNG_BAUSTEIN_TEXTE } from "./buchungTexte";

/**
 * Die Wochenansicht mit den freien Zeiten.
 *
 * Dieselbe Auswahl braucht der Kunde zweimal: beim ersten Buchen und beim
 * Verschieben eines bestehenden Termins. Deshalb steht sie hier und nicht in
 * einer der beiden Seiten.
 *
 * Woher die Zeiten kommen, entscheidet die Seite darüber und übergibt es als
 * `lade`. Diese Komponente kennt weder Token noch Datenbank, sie ordnet nur
 * an, was sie bekommt.
 *
 * Sprache (Kundensprache, Etappe 3): `sprache`, Vorgabe Deutsch. Die
 * Bewerberseiten übergeben nichts und bleiben deutsch.
 */

export interface ZeitauswahlProps {
  /** Zeitzone des Beraters. Alle Uhrzeiten stehen in dieser Zone. */
  zeitzone: string;
  /** Wie weit im Voraus gebucht werden darf. */
  vorausschauTage?: number;
  /** Holt die freien Startzeiten eines Zeitraums. Muss stabil sein. */
  lade: (vonTag: string, bisTag: string) => Promise<string[]>;
  gewaehlt: string | null;
  aufWahl: (startISO: string) => void;
  /**
   * Zähler, der die Zeiten neu holen lässt. Wird hochgezählt, wenn eine Zeit
   * beim Buchen inzwischen vergeben war.
   */
  neuLaden?: number;
  /** Jetzt. Ausdrücklich übergebbar, damit die Anzeige prüfbar bleibt. */
  jetzt?: Date;
  /** Sprache der Beschriftungen, Vorgabe Deutsch. */
  sprache?: Sprache;
}

export function Zeitauswahl({
  zeitzone,
  vorausschauTage = 60,
  lade,
  gewaehlt,
  aufWahl,
  neuLaden = 0,
  jetzt,
  sprache = STANDARD_SPRACHE,
}: ZeitauswahlProps) {
  const t = texteFuer(BUCHUNG_BAUSTEIN_TEXTE, sprache);
  // Der Bezugspunkt darf sich nicht bei jedem Neuzeichnen verschieben, sonst
  // springt die Wochenansicht.
  const bezug = useMemo(() => jetzt ?? new Date(), [jetzt]);

  const { ersterTag, letzterTag } = useMemo(
    () => vorausschauGrenzen(bezug, zeitzone, vorausschauTage),
    [bezug, zeitzone, vorausschauTage],
  );

  // Angezeigt werden sieben Tage ab heute. Bewusst nicht ab Montag: Die
  // vergangenen Tage dieser Woche wären leere Spalten, und die erste Seite ist
  // genau die, auf der die meisten buchen.
  const [startTag, setStartTag] = useState(ersterTag);
  const [zeiten, setZeiten] = useState<string[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState(false);

  const tage = useMemo(
    () => fensterTage(startTag, TAGE_PRO_SEITE, letzterTag),
    [startTag, letzterTag],
  );

  useEffect(() => {
    if (tage.length === 0) { setZeiten([]); setLaedt(false); return; }
    let aktiv = true;
    setLaedt(true);
    setFehler(false);
    void (async () => {
      try {
        const ergebnis = await lade(tage[0], tage[tage.length - 1]);
        if (!aktiv) return;
        setZeiten(ergebnis);
      } catch {
        if (!aktiv) return;
        setZeiten([]);
        setFehler(true);
      } finally {
        if (aktiv) setLaedt(false);
      }
    })();
    return () => { aktiv = false; };
  }, [tage, lade, neuLaden]);

  const gruppen = useMemo(() => gruppiereNachTag(zeiten, zeitzone), [zeiten, zeitzone]);
  const zeitenJeTag = useMemo(() => {
    const karte = new Map<string, string[]>();
    for (const gruppe of gruppen) karte.set(gruppe.tag, gruppe.zeiten);
    return karte;
  }, [gruppen]);

  const zurueck = useCallback(() => {
    setStartTag((vorher) => blaettere(vorher, -TAGE_PRO_SEITE, ersterTag, letzterTag));
  }, [ersterTag, letzterTag]);

  const vor = useCallback(() => {
    setStartTag((vorher) => blaettere(vorher, TAGE_PRO_SEITE, ersterTag, letzterTag));
  }, [ersterTag, letzterTag]);

  const gehtZurueck = kannZurueck(startTag, ersterTag);
  const gehtVor = kannVor(startTag, TAGE_PRO_SEITE, letzterTag);
  const leer = !laedt && zeiten.length === 0;

  const spanne = tage.length > 0
    ? t.spanne(beschriftungTag(tage[0], sprache).datum, beschriftungTag(tage[tage.length - 1], sprache).datum)
    : "";

  return (
    <div>
      {/*
        `data-no-wrap`: Die mobile Regel in `index.css` lässt Zeilen mit
        `flex items-center gap-3` umbrechen. Hier rutschte dann der Vor-Knopf
        unter den Zurück-Knopf. Die Knöpfe bleiben außen, der Text bricht um.
      */}
      <div className="flex items-center justify-between gap-3" data-no-wrap>
        <BlaetterKnopf
          richtung="zurueck"
          gesperrt={!gehtZurueck}
          aufKlick={zurueck}
          beschriftung={t.wocheZurueck}
        />
        <div className="min-w-0 text-center">
          <div className="text-[14.5px] font-semibold">{spanne}</div>
          <div className="mt-0.5 text-[11px] text-white/40">
            {t.zeitzoneHinweis}
          </div>
        </div>
        <BlaetterKnopf
          richtung="vor"
          gesperrt={!gehtVor}
          aufKlick={vor}
          beschriftung={t.wocheVor}
        />
      </div>

      <div
        role="group"
        aria-label={t.freieZeiten}
        aria-busy={laedt}
        className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
      >
        {tage.map((tag) => {
          const beschriftung = beschriftungTag(tag, sprache);
          const frei = zeitenJeTag.get(tag) ?? [];
          return (
            <div key={tag} className="min-w-0">
              <div className={`mb-2 text-center ${frei.length > 0 ? "text-white/70" : "text-white/25"}`}>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em]">{beschriftung.wochentag}</div>
                <div className="text-[12.5px]">{beschriftung.datum}</div>
              </div>
              {/*
                Nach Tageszeit gruppiert. Bei einem Viertelstundenraster stehen
                sonst ueber dreissig Knoepfe untereinander, und wer "irgendwann
                nachmittags" sucht, muss die Liste durchgehen.
              */}
              <div className="flex max-h-[320px] flex-col gap-3 overflow-y-auto pr-0.5">
                {teileNachTageszeit(frei, zeitzone, sprache).map((abschnitt) => (
                  <div key={abschnitt.name}>
                    {/*
                      In schmalen Spalten (sieben Tage neben der Seitenkarte)
                      passte „NACHMITTAG“ bzw. „AFTERNOON“ nicht und wurde
                      abgeschnitten. Silbentrennung nach `<html lang>`, notfalls
                      Umbruch im Wort.
                    */}
                    <div className="mb-1.5 hyphens-auto break-words text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">
                      {abschnitt.name}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {abschnitt.zeiten.map((zeit) => {
                        const aktiv = gewaehlt === zeit;
                        return (
                          <button
                            key={zeit}
                            type="button"
                            onClick={() => aufWahl(zeit)}
                            aria-pressed={aktiv}
                            aria-label={beschriftungZeitKnopf(zeit, zeitzone, sprache)}
                            className={`h-9 rounded-[10px] border text-[13px] font-semibold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30E19E] ${
                              aktiv
                                ? "border-[#15724F] bg-[#15724F] text-white"
                                : `border-white/12 ${FLAECHE_FELD_KNOPF} text-white/80 hover:border-[#30E19E]/50`
                            }`}
                          >
                            {uhrzeitInZone(zeit, zeitzone)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div aria-live="polite" className="mt-5 min-h-[20px] text-center text-[13px] text-white/50">
        {laedt && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.zeitenLaden}
          </span>
        )}
        {!laedt && fehler && (
          <span className="text-[#FFB4AE]">
            {t.zeitenFehler}
          </span>
        )}
        {!laedt && !fehler && leer && (
          <span>
            {t.nichtsFrei}{" "}
            {gehtVor ? t.naechsteWoche : t.meldeDich}
          </span>
        )}
      </div>
    </div>
  );
}

function BlaetterKnopf({
  richtung,
  gesperrt,
  aufKlick,
  beschriftung,
}: {
  richtung: "zurueck" | "vor";
  gesperrt: boolean;
  aufKlick: () => void;
  beschriftung: string;
}) {
  const zurueck = richtung === "zurueck";
  return (
    <button
      type="button"
      onClick={aufKlick}
      disabled={gesperrt}
      aria-label={beschriftung}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 ${FLAECHE_FELD_KNOPF} text-white/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30E19E] disabled:opacity-30`}
    >
      {zurueck ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}
