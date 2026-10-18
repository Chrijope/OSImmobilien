/**
 * Der Baum der Markenfamilie (Konzept C): oben die OS Immobilien Holding als
 * Dach, darunter Real Estate, Verwaltung und Finanzierung.
 *
 * Gemeinsam genutzt von der Beratungspräsentation (Folie „Die
 * Unternehmensgruppe") und der öffentlichen Stellenanzeige. Die Schrift ist
 * hell, der Baum braucht also einen dunkelgrünen Grund. Texte in
 * `OS_TEXTE.gruppe` (`beratungOsDaten.ts`).
 */
import { FARBE } from "@/components/beratung/folienBausteine";
import type { OS_TEXTE } from "@/lib/beratungOsDaten";
import osZeichen from "@/assets/beratung/os-zeichen-gold.png";

type Gruppe = Pick<(typeof OS_TEXTE)["gruppe"], "dach" | "dachText" | "marken">;

/** Logo der Markenfamilie: OS-Zeichen in Gold, darunter der Name (Konzept C). */
function MarkenLogo({ name, zusatz, farbe, gross }: { name: string; zusatz: string; farbe: string; gross?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <img src={osZeichen} alt="" aria-hidden className={gross ? "h-14 md:h-16 w-auto" : "h-10 md:h-11 w-auto"} />
      <p
        className={`uppercase mt-2 ${gross ? "text-lg md:text-xl tracking-[0.42em]" : "text-sm md:text-[0.95rem] tracking-[0.32em]"}`}
        style={{ color: farbe }}
      >
        {name}
      </p>
      <p className="uppercase text-[0.55rem] tracking-[0.28em] mt-1" style={{ color: "rgba(243,247,245,0.65)" }}>
        {zusatz}
      </p>
      <div className={`mt-2 h-[2px] ${gross ? "w-36" : "w-24"}`} style={{ background: farbe }} />
    </div>
  );
}

export function Markenfamilie({ gruppe }: { gruppe: Gruppe }) {
  return (
    <div data-testid="markenfamilie">
      <div className="mt-10 flex flex-col items-center">
        <MarkenLogo name="Immobilien" zusatz="Berlin · Brandenburg" farbe={FARBE.hellText} gross />
        <p className="mt-5 text-sm text-center" style={{ color: FARBE.hellGedaempft }}>
          <strong className="font-semibold" style={{ color: FARBE.hellText }}>
            {gruppe.dach}
          </strong>{" "}
          · {gruppe.dachText}
        </p>
      </div>
      {/* Verbindungslinien nur ab Tablet; auf dem Handy stehen die Marken untereinander. */}
      <div aria-hidden className="hidden md:block mx-auto mt-6 w-2/3 h-6 border-x border-t" style={{ borderColor: "rgba(204,172,5,0.6)" }} />
      <div className="mt-6 md:mt-4 grid md:grid-cols-3 gap-10 md:gap-6">
        {gruppe.marken.map((m) => (
          <div key={m.name} className="text-center">
            <MarkenLogo name={m.name} zusatz={m.zusatz} farbe={m.farbe} />
            <p className="mt-4 text-sm leading-relaxed max-w-xs mx-auto" style={{ color: FARBE.hellGedaempft }}>
              {m.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
