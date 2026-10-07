import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  /*
   * Gleich beim ersten Aufbau die richtige Antwort, nicht erst nach dem
   * Effekt. Sonst gilt für einen Bildmoment „kein Handy", und ein Bereich,
   * der auf dem Handy eingeklappt sein soll, blitzt offen auf, bevor er
   * zusammenklappt. Siehe die Filterleiste in `BewerberFilterLeiste.tsx`.
   */
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    () => (typeof window === "undefined" ? undefined : window.innerWidth < MOBILE_BREAKPOINT),
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
