import { useId, useState } from "react";

export function KundenprofilNotiz({ text, className = "" }: { text: string; className?: string }) {
  const [offen, setOffen] = useState(false);
  const id = useId();
  const zeichen = Array.from(text || "");
  const lang = zeichen.length > 100;
  return <div className={`whitespace-pre-wrap break-words ${className}`}>
    <span id={id}>{offen || !lang ? text : `${zeichen.slice(0, 100).join("")}…`}</span>
    {lang && <button type="button" className="ml-1 text-xs text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-expanded={offen} aria-controls={id} onClick={() => setOffen((wert) => !wert)}>{offen ? "weniger" : "mehr"}</button>}
  </div>;
}
