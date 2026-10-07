import { CalendarDays, Mail, Phone } from "lucide-react";
import { ladeBerater, type BeraterProfile } from "@/lib/beraterProfil";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE, positionFuerAnzeige } from "./mikroseiteAbschlussTexte";

interface Props {
  berater?: BeraterProfile;
  onOpenFunnel: () => void;
  /** Kompakte Variante für die Seitenspalte neben den FAQ. */
  kompakt?: boolean;
}

/**
 * Der persönliche Ansprechpartner als eigenständige Karte.
 * Wird in der FAQ-Spalte mitgescrollt-fixiert eingesetzt: Während der Besucher
 * die Fragen durchgeht, bleibt das Gesicht und der Kontakt im Blick.
 */
const AnsprechpartnerCard = ({ berater, onOpenFunnel, kompakt = false }: Props) => {
  const texte = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE);
  const t = texte.ansprechpartner;
  const sprache = useSeitenSprache();
  const b = ladeBerater(berater);
  // `ladeBerater` setzt ohne Profil einen deutschen Platzhalter als Namen.
  const name = !berater && b.name === MIKROSEITE_ABSCHLUSS_TEXTE.de.ansprechpartner.ersatzName ? t.ersatzName : b.name;
  const initialen = (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={`rounded-2xl border border-[hsl(220,15%,90%)] bg-white shadow-[0_12px_40px_-12px_hsla(220,30%,20%,0.15)] ${
        kompakt ? "p-6 md:p-7" : "p-8 md:p-10"
      }`}
    >
      <div className="flex items-start gap-4 md:gap-5 mb-5">
        {b.bild ? (
          <img
            src={b.bild}
            alt={name}
            loading="lazy"
            className={`rounded-full object-cover border-2 border-primary/30 shrink-0 ${
              kompakt ? "w-16 h-16 md:w-20 md:h-20" : "w-20 h-20 md:w-24 md:h-24"
            }`}
          />
        ) : (
          <div
            className={`rounded-full flex items-center justify-center bg-primary/10 border-2 border-primary/30 shrink-0 ${
              kompakt ? "w-16 h-16 md:w-20 md:h-20" : "w-20 h-20 md:w-24 md:h-24"
            }`}
          >
            <span className="text-xl font-bold text-primary">{initialen}</span>
          </div>
        )}
        <div className="min-w-0 flex-1 text-left">
          <p className="text-xs uppercase tracking-wider text-[hsl(220,10%,46%)] mb-1.5 font-semibold">
            {t.oberzeile}
          </p>
          <h3
            className={`font-extrabold text-[hsl(220,25%,10%)] tracking-tight ${
              kompakt ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"
            }`}
          >
            {name}
          </h3>
          <p className="text-sm text-[hsl(220,10%,46%)] mt-0.5">{positionFuerAnzeige(b.position, sprache)}</p>
        </div>
      </div>

      <div className="relative pl-5 border-l-2 border-primary mb-6">
        <p
          className={`text-[hsl(220,15%,25%)] leading-relaxed italic ${
            kompakt ? "text-sm md:text-base" : "text-base md:text-lg"
          }`}
        >
          {t.zitat}
        </p>
      </div>

      <div className={`grid gap-3 ${kompakt ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {b.buchungslink ? (
          <a
            href={b.buchungslink}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-cta inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-medium text-sm"
          >
            <CalendarDays className="w-4 h-4" /> {texte.erstberatungKnopf}
          </a>
        ) : (
          <button
            onClick={onOpenFunnel}
            className="lp-cta inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-medium text-sm"
          >
            {texte.erstberatungKnopf}
          </button>
        )}
        {b.email && (
          <a
            href={`mailto:${b.email}`}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-[hsl(220,15%,90%)] text-[hsl(220,25%,10%)] hover:bg-primary/5 hover:border-primary/40 transition-colors text-sm font-medium"
          >
            <Mail className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{b.email}</span>
          </a>
        )}
        {b.telefon && (
          <a
            href={`tel:${b.telefon}`}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-[hsl(220,15%,90%)] text-[hsl(220,25%,10%)] hover:bg-primary/5 hover:border-primary/40 transition-colors text-sm font-medium"
          >
            <Phone className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{b.telefon}</span>
          </a>
        )}
      </div>
    </div>
  );
};

export default AnsprechpartnerCard;
