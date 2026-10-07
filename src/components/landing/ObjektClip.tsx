import { useEffect, useRef, useState } from "react";

/**
 * Kurzer, stummer Rundgang eines Objekttyps im Kopf der Konzeptkarte.
 *
 * Grundlage sind echte Aufnahmen aus dem Bestand, aus denen je eine Fahrt
 * montiert wurde: ein Rundgang durch die WG-Wohnung, ein Weg von aussen nach
 * innen beim Neubau und ein Drohnenanflug ueber die sanierte Anlage. Bewegt
 * wird ausschliesslich die Kamera — kein Gebaeude und kein Moebelstueck wurde
 * veraendert. Ein erfundenes Objekt unter der Zeile "sanierter Bestand" waere
 * eine Aussage ueber etwas, das es nicht gibt.
 *
 * Das Video traegt dieselbe Klasse wie zuvor das Standbild, damit die
 * bestehenden Regeln in beraterMicroseite.css weiter greifen: randlos im
 * Kartenkopf, 220 px hoch, oben abgerundet.
 *
 * Es liegt immer im DOM und startet selbst (autoPlay + muted). Es an einen
 * IntersectionObserver zu haengen, der es erst einhaengt, hat sich als
 * unzuverlaessig erwiesen: in einem Hintergrundtab pausiert der Browser diese
 * Rueckrufe, und es blieb stumm beim Standbild, ohne dass etwas kaputt aussah.
 * Der Beobachter haelt jetzt nur noch an, sobald die Karte aus dem Bild ist.
 */

type Props = {
  /** Dateiname ohne Endung, etwa "typ-neubau". */
  name: string;
  /** Zugangstext fuer Vorleseprogramme. */
  alt: string;
  /**
   * Erst laden, wenn die Karte in die Naehe kommt (Handbuch-Seite, seit dem
   * 26.09.2026). Dann ohne `autoPlay` und mit `preload="none"`: Bis der
   * Beobachter `play()` ruft, liegt nur das Standbild da. Gestartet wird
   * immer stumm.
   */
  lazy?: boolean;
  /** Eigene Klasse statt `investment-photo`, etwa auf der Handbuch-Seite. */
  className?: string;
};

const ObjektClip = ({ name, alt, lazy = false, className = "investment-photo" }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduziert, setReduziert] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduziert(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || reduziert) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          const versuch = v.play();
          if (versuch) versuch.catch(() => undefined);
        } else {
          v.pause();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [reduziert]);

  if (reduziert) {
    return (
      <img className={className} src={`/video/${name}.jpg`} alt={alt} loading="lazy" width="640" height="420" />
    );
  }

  return (
    <video
      ref={videoRef}
      className={className}
      src={`/video/${name}.mp4`}
      poster={`/video/${name}.jpg`}
      aria-label={alt}
      autoPlay={!lazy}
      muted
      loop
      playsInline
      preload={lazy ? "none" : "metadata"}
      width="640"
      height="420"
    />
  );
};

export default ObjektClip;
