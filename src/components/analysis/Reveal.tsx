import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

interface RevealProps {
  children: ReactNode;
  /** Verzögerung in ms, bevor das Element sichtbar wird. */
  delay?: number;
  className?: string;
}

/** Blendet Kinder beim Scrollen sanft ein (IntersectionObserver). */
export default function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const style: CSSProperties = { transitionDelay: `${delay}ms` };

  return (
    <div ref={ref} className={`analyse-reveal ${visible ? "is-visible" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}
