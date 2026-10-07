/**
 * Das Handbuch als gebundenes Heft auf der Handbuch-Seite (seit dem
 * 27.09.2026, ersetzt die Magazin-Grafik; dieselbe Komposition wie im
 * Handbuch-Abschnitt der Website osimmobilien.netlify.app).
 *
 * Vorn das Heft mit dem echten Deckblatt, leicht gedreht, mit Buchrücken und
 * Kantenlicht; dahinter die Seiten zu Kapitel 4, 5 und 8, nach rechts hinten
 * gefächert. Links schweben drei Kacheln, darunter eine handschriftliche
 * Notiz mit Pfeil. Die Seitenbilder sind Renderings des Beispiel-Handbuchs
 * (fiktiv „Max Beispiel“), deshalb die Plakette „Beispielwerte“.
 *
 * Gestaltung in `handbuchSeite.css` unter `.hb-heft`. Nicht `.hb-buch`: Die
 * Klasse gehört dem Handbuch auf der Ergebnisseite. Keine eigene Bewegung,
 * das sanfte Einblenden übernimmt `useEinblenden`, das „weniger Bewegung“
 * beachtet.
 */
import { BookOpen, FileText, Target } from "lucide-react";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";
import deckblatt from "@/assets/handbuch/heft-deckblatt.webp";
import kapitel4 from "@/assets/handbuch/heft-kapitel-4.webp";
import kapitel5 from "@/assets/handbuch/heft-kapitel-5.webp";
import kapitel8 from "@/assets/handbuch/heft-kapitel-8.webp";

// Die drei Innenseiten hinter dem Heft, von hinten nach vorn. Lage und
// Drehung relativ zum Heft; gedreht um die linke untere Ecke nach rechts.
const SEITEN = [
  { bild: kapitel8, links: "42%", breite: "80%", dreh: 14 },
  { bild: kapitel5, links: "30%", breite: "84%", dreh: 9 },
  { bild: kapitel4, links: "18%", breite: "88%", dreh: 4.5 },
];

const SYMBOLE = [BookOpen, FileText, Target];

export function HandbuchHeft({ kapitelAnzahl }: { kapitelAnzahl: number }) {
  const T = useSeitenTexte(HANDBUCH_SEITEN_TEXTE).landing.vorschau.buch;

  return (
    <div className="hb-heft">
      <div className="hb-heft-buehne">
        {/* Heft und Seiten: ein Bild für Vorleseprogramme */}
        <div className="hb-heft-stapel" role="img" aria-label={T.beschreibung}>
          {SEITEN.map((s) => (
            <img
              key={s.bild}
              className="hb-heft-seite"
              src={s.bild}
              alt=""
              width={700}
              height={989}
              loading="lazy"
              decoding="async"
              style={{ left: s.links, width: s.breite, transform: `rotate(${s.dreh}deg)` }}
            />
          ))}
          <div className="hb-heft-deckel">
            <div className="hb-heft-ruecken" aria-hidden="true" />
            <img src={deckblatt} alt="" width={900} height={1272} loading="lazy" decoding="async" />
            <div className="hb-heft-licht" aria-hidden="true" />
          </div>
        </div>

        <span className="hb-heft-plakette">{T.beispielwerte}</span>

        <div className="hb-heft-notiz">
          <p>{T.notiz}</p>
          <svg aria-hidden="true" viewBox="0 0 70 56" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 50 C 22 50, 40 40, 50 14" />
            <path d="M41 19 L 50 12 L 54 23" />
          </svg>
        </div>
      </div>

      {/* Kacheln: auf dem Handy unter dem Heft, sonst schwebend links daneben */}
      <ul className="hb-heft-kacheln">
        {T.kacheln(kapitelAnzahl).map((k, i) => {
          const Symbol = SYMBOLE[i] ?? BookOpen;
          return (
            <li key={k.titel}>
              <span className="sym">
                <Symbol aria-hidden="true" />
              </span>
              <span>
                <b>{k.titel}</b>
                <span className="unter">{k.unter}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
