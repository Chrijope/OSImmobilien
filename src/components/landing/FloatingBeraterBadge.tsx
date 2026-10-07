import { useState } from "react";
import { Phone, Mail, MessageCircle, X, CalendarDays } from "lucide-react";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE, positionFuerAnzeige } from "./mikroseiteAbschlussTexte";

export interface BeraterInfo {
  name: string;
  position?: string;
  telefon?: string;
  email?: string;
  bild?: string | null;
  buchungslink?: string;
}

interface FloatingBeraterBadgeProps {
  berater: BeraterInfo | null;
  onContactClick?: () => void;
}

const FloatingBeraterBadge = ({ berater, onContactClick }: FloatingBeraterBadgeProps) => {
  const [open, setOpen] = useState(false);
  const t = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE).schwebend;
  const sprache = useSeitenSprache();

  if (!berater) return null;
  const initials = (berater.name || "?")
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {/* Karte */}
      {open && (
        <div
          className="fixed z-50 bottom-24 right-4 md:right-6 w-[88vw] max-w-[340px] rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 bg-card"
        >
          <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-primary/15 to-card">
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t.kopf}
              </p>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors -mt-1 -mr-1 p-1"
                aria-label={t.schliessen}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              {berater.bild ? (
                <img
                  src={berater.bild}
                  alt={berater.name}
                  className="w-14 h-14 rounded-full object-cover border-2 border-border"
                />
              ) : (
                <div className="w-14 h-14 rounded-full flex items-center justify-center bg-primary/15 border-2 border-border">
                  <span className="text-base font-bold text-primary">{initials}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-foreground text-sm leading-tight truncate">{berater.name}</h4>
                <p className="text-xs text-muted-foreground leading-tight truncate mt-0.5">{positionFuerAnzeige(berater.position, sprache)}</p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-2">
            {berater.telefon && (
              <a
                href={`tel:${berater.telefon}`}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm font-medium"
              >
                <Phone className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{berater.telefon}</span>
              </a>
            )}
            {berater.email && (
              <a
                href={`mailto:${berater.email}`}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-border text-foreground hover:bg-primary/10 transition-colors text-sm font-medium"
              >
                <Mail className="w-4 h-4 flex-shrink-0 text-primary" />
                <span className="truncate">{berater.email}</span>
              </a>
            )}
            {berater.buchungslink && (
              <a
                href={berater.buchungslink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all bg-primary text-primary-foreground hover:brightness-95"
              >
                <CalendarDays className="w-4 h-4" /> {t.buchen}
              </a>
            )}
            {onContactClick && (
              <button
                onClick={() => {
                  setOpen(false);
                  onContactClick();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border border-border text-foreground hover:bg-primary/10"
              >
                ℹ️ {t.mehr}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="fixed z-50 bottom-4 right-4 md:bottom-6 md:right-6 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl transition-all duration-300 hover:scale-105 bg-primary text-primary-foreground"
        aria-label={t.knopf}
      >
        {berater.bild ? (
          <img src={berater.bild} alt="" className="w-8 h-8 rounded-full object-cover -ml-1" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center -ml-1">
            <span className="text-xs font-bold">{initials}</span>
          </div>
        )}
        <span className="font-medium text-sm hidden md:inline">{t.knopf}</span>
        <MessageCircle className="w-4 h-4 md:hidden" />
      </button>
    </>
  );
};

export default FloatingBeraterBadge;
