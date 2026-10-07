import { Link } from "react-router-dom";
import logoImg from "@/assets/moreimmo-logo.png";

/**
 * Gemeinsamer Hintergrund aller Videoraum-Seiten: dunkle Buehne, feines Karo
 * wie auf den PDF-Deckblaettern, ein blauer Schein von oben. Gleiche Bauart
 * wie die Karriereseite, damit beide Seiten aus einem Guss wirken.
 */

/**
 * Undurchsichtige Flaechen fuer alles, was auf der Buehne liegt.
 *
 * Die Buehne traegt ein feines Karo. Jede durchsichtige Flaeche darauf laesst
 * es durchscheinen, und in einem Kasten wirkt das unruhig. Deshalb bekommen
 * Kaesten und die Felder darin eigene, undurchsichtige Toene: jeweils eine
 * Stufe heller als das, worauf sie liegen. Die Tiefe bleibt, das Karo bleibt
 * draussen.
 *
 * Die Werte stehen bewusst hier an einer Stelle und nicht verstreut in den
 * Seiten. Sie sind als ganze Klassennamen geschrieben, damit Tailwind sie im
 * Quelltext findet.
 *
 * Kleine Farbschimmer bleiben absichtlich durchsichtig, etwa die gruenen
 * Statuszeichen, die blauen Ziffernkacheln und die Schalter. Sie liegen auf
 * einem Kasten, hinter ihnen ist also ohnehin kein Karo mehr, und ihr Reiz ist
 * gerade der Schimmer der Farbe.
 */
/** Ein Kasten, der unmittelbar auf der Buehne liegt. */
export const FLAECHE_KASTEN = "bg-[#151E2B]";
/** Ein Feld oder eine Kachel innerhalb eines Kastens. */
export const FLAECHE_FELD = "bg-[#1D2735]";
/** Wie `FLAECHE_FELD`, aber fuer Knoepfe: beim Ueberfahren eine Stufe heller. */
export const FLAECHE_FELD_KNOPF = "bg-[#1D2735] hover:bg-[#26313F] disabled:hover:bg-[#1D2735]";
/** Der blaue Hinweiskasten. Blauer Stich, aber undurchsichtig. */
export const FLAECHE_HINWEIS = "bg-[#18283A]";

export function KaroFlaeche() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.16]"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
        backgroundSize: "74px 74px",
        WebkitMaskImage:
          "radial-gradient(ellipse 70% 60% at 50% 45%, #000 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.12) 74%, transparent 90%)",
        maskImage:
          "radial-gradient(ellipse 70% 60% at 50% 45%, #000 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.12) 74%, transparent 90%)",
      }}
    />
  );
}

export function Buehne({ children, schlank = false }: { children: React.ReactNode; schlank?: boolean }) {
  return (
    /*
      `shrink-0` ist keine Kosmetik, sondern haelt den dunklen Grund am Leben.
      Die Buehne haengt in `App.tsx` unmittelbar in `<main className="flex
      h-screen flex-col">`, ist also ein Kind einer Spalte mit fester
      Fensterhoehe. Ein Flex-Kind darf von sich aus schrumpfen, und zwar bis
      an seine Mindesthoehe. Genau das geschah: Der Grund blieb bei
      100dvh stehen, waehrend der Inhalt darueber hinauswuchs. Unter der
      Buehne stand dann ein weisser Streifen bis zum Seitenende, mitsamt der
      Fusszeile, die darin kaum lesbar war. Zu sehen war das ueberall, wo der
      Inhalt hoeher ist als das Fenster, also besonders bei den beiden
      Terminseiten mit ihrem 820 Pixel hohen Kalender.

      Gemessen am 21.09.2026 an einem Nachbau: Grund 813 Pixel, Seite 1107.
      Mit `shrink-0` sind beide 1107.
    */
    <div className="relative min-h-[100dvh] shrink-0 bg-[#0F1621] text-white">
      {/*
        Der Schmuck liegt in einer eigenen Schicht, die abschneidet. Vorher
        schnitt die Buehne selbst ab. Sobald der Inhalt hoeher war als der
        Bildschirm, liess sich der untere Teil nicht mehr erreichen: kein
        Scrollen, der Rest war schlicht weg.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="vr-atmen absolute left-1/2 top-[-330px] h-[660px] w-[1000px] -translate-x-1/2"
          style={{ background: "radial-gradient(ellipse, rgba(8,122,199,.42) 0%, rgba(8,122,199,0) 68%)" }}
        />
        <div
          className="vr-atmen-klein absolute bottom-[-260px] right-[-200px] h-[520px] w-[520px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(136,207,255,.14) 0%, rgba(136,207,255,0) 66%)" }}
        />
        <KaroFlaeche />
      </div>

      {!schlank && (
        <div className="absolute left-6 top-6 z-20 sm:left-11 sm:top-8">
          <Link to="/" aria-label="MOREImmo">
            <img src={logoImg} alt="MOREImmo" className="h-6 object-contain brightness-0 invert sm:h-7" />
          </Link>
        </div>
      )}

      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Der blaue Balken der Markenrichtlinie. */
export function Balken({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative h-[3px] w-11 overflow-hidden rounded-full bg-[#087AC7] ${className}`}
    >
      {/* Ein Glanzlicht laeuft hin und wieder darueber. Kein Blinken, nur Leben. */}
      <span
        className="vr-glanz absolute inset-y-0 w-4"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent)" }}
      />
    </div>
  );
}

export function Kennung({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#88CFFF]">{children}</div>
  );
}
