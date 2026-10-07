import { useLayoutEffect, useRef } from "react";

/**
 * Hält die Chatkarte auf der Höhe des sichtbaren Fensters.
 *
 * Begrenzt nur die Darstellung. Nachrichten, Entwürfe und Versand bleiben im
 * Chat.
 *
 * WARUM DAS SCROLLEN HIER NICHT MITGEMESSEN WIRD
 *
 * Bis zum 19.09.2026 horchte diese Funktion auch auf `scroll`. Die Höhe ergibt
 * sich aus "Sichtende minus Oberkante der Karte", und die Oberkante wandert
 * beim Scrollen. Die Karte wurde dadurch beim Hochscrollen immer größer und
 * beim Runterscrollen kleiner. Von außen sah das aus, als wüchse der Chat
 * mit, und genau das hat gestört.
 *
 * Jetzt wird beim Öffnen einmal gemessen und danach nur noch, wenn sich
 * wirklich etwas an der Größe ändert: Fenstergröße, Umklappen des Geräts oder
 * die Tastatur auf dem Handy. Die Karte behält damit eine ruhige, feste Höhe,
 * und gescrollt wird ausschließlich im Nachrichtenbereich darin.
 */
export function useChatSichthoehe() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const karte = ref.current;
    if (!karte) return;
    let frame = 0;
    const sichtEnde = () => (window.visualViewport?.height ?? window.innerHeight) + (window.visualViewport?.offsetTop ?? 0);
    const messen = () => {
      const hoehe = Math.max(180, Math.floor(sichtEnde() - Math.max(0, karte.getBoundingClientRect().top) - 16));
      if (karte.style.height !== `${hoehe}px`) karte.style.height = `${hoehe}px`;
    };
    const planen = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(messen); };
    // Auf kleinen Bildschirmen liegen die Kontaktdaten vor dem Chat.
    // Beim Öffnen direkt den Schreibbereich erreichbar machen.
    if (sichtEnde() - karte.getBoundingClientRect().top < 240) karte.scrollIntoView({ block: "start", behavior: "instant" });
    messen();
    const observer = new ResizeObserver(planen);
    if (karte.parentElement) observer.observe(karte.parentElement);
    window.addEventListener("resize", planen);
    window.visualViewport?.addEventListener("resize", planen);
    window.visualViewport?.addEventListener("scroll", planen);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", planen);
      window.visualViewport?.removeEventListener("resize", planen);
      window.visualViewport?.removeEventListener("scroll", planen);
    };
  }, []);
  return ref;
}
