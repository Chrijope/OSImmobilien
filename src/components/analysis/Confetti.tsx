import { useEffect, useState } from "react";

interface ConfettiProps {
  /** Wenn true, wird Confetti einmalig ausgelöst. */
  trigger: boolean;
  /** Anzahl der Konfetti-Stücke. Default 24 (dezent). */
  count?: number;
}

const COLORS = [
  "hsl(43, 25%, 64%)",
  "hsl(43, 25%, 74%)",
  "hsl(142, 30%, 50%)",
  "hsl(210, 40%, 60%)",
  "hsl(43, 25%, 84%)",
];

/** Dezente, einmalige Confetti-Animation für den Hero-WOW-Effekt. */
export default function Confetti({ trigger, count = 24 }: ConfettiProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2000);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.4;
        const color = COLORS[i % COLORS.length];
        const rotate = Math.random() * 360;
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              backgroundColor: color,
              animationDelay: `${delay}s`,
              transform: `rotate(${rotate}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}
