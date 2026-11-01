import * as React from "react";

/*
 * Kennzahlen zählen beim ersten Erscheinen kurz hoch, höchstens 0,6 Sekunden
 * (01.11.2026). Der Wert kommt fertig formatiert, etwa „249 T€“ oder „12,5 %“.
 * Gezählt wird nur ein Text mit genau einer Zahl; alles andere („1 / 1“,
 * Elemente) steht sofort da. Der echte Wert ist der Standard: Ohne
 * IntersectionObserver (Tests, alte Browser), mit „Bewegung reduzieren“ oder
 * beim PDF-Export wird nicht gezählt.
 */
const MUSTER = /^(\D*?)(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)(\D*)$/;
const DAUER = 600;

export function zerlegeZahl(text: string): { vor: string; zahl: number; nach: string; nachkomma: number } | null {
  const t = MUSTER.exec(text);
  if (!t) return null;
  const roh = t[2];
  const zahl = Number(roh.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(zahl) || zahl === 0) return null;
  return { vor: t[1], zahl, nach: t[3], nachkomma: roh.includes(",") ? roh.split(",")[1].length : 0 };
}

function darfZaehlen(): boolean {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return false;
  if (document.documentElement.hasAttribute("data-pdf-freezing")) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function HochZahl({ wert }: { wert: React.ReactNode }) {
  const teile = typeof wert === "string" || typeof wert === "number" ? zerlegeZahl(String(wert)) : null;
  const [anteil, setAnteil] = React.useState(1);
  const gezaehlt = React.useRef(false);

  React.useEffect(() => {
    if (!teile || gezaehlt.current || !darfZaehlen()) return;
    gezaehlt.current = true;
    const start = performance.now();
    let raf = 0;
    const schritt = (jetzt: number) => {
      const p = Math.min((jetzt - start) / DAUER, 1);
      setAnteil(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(schritt);
    };
    setAnteil(0);
    raf = requestAnimationFrame(schritt);
    return () => {
      cancelAnimationFrame(raf);
      setAnteil(1);
    };
    // Nur beim ersten Erscheinen, spätere Werte stehen sofort da.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!teile || anteil >= 1) return <>{wert}</>;
  const zwischen = (teile.zahl * anteil).toLocaleString("de-DE", {
    minimumFractionDigits: teile.nachkomma,
    maximumFractionDigits: teile.nachkomma,
  });
  return <>{teile.vor}{zwischen}{teile.nach}</>;
}
