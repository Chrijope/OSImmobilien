import { Clock, Mail, Phone } from "lucide-react";
import type { Person } from "@/lib/exposeInhalt";
import { initialen } from "@/lib/exposeAnsprechpartner";
import type { KundenlinkArt } from "../../../supabase/functions/_shared/kunden-expose";
import { STANDARD_SPRACHE, texteFuer, type Sprache } from "@/lib/seitenSprache";
import { LINK_NICHT_MEHR_GUELTIG_TEXTE, type LinkNichtMehrGueltigTexte } from "./linkNichtMehrGueltigTexte";

/**
 * Was ein Kunde sieht, wenn sein persönlicher Link abgelaufen ist oder
 * zurückgezogen wurde. Für beide Arten des Kundenlinks: das Exposé
 * (`ExposePublic`) und die Objektübersicht (`art="objektuebersicht"`, die
 * öffentliche Kundenansicht). Nur der eine Satz unterscheidet sich.
 *
 * Entscheidung von Christian (23.09.2026): ein gestalteter Hinweis mit den
 * Kontaktdaten des Partners, sonst nichts. Kein Bild, keine Zahl, kein Name
 * des Objekts: `get-expose` schickt in diesem Fall ohnehin nur die vier
 * Angaben des Partners (Positivliste). Abgelaufen und zurückgezogen sehen
 * bewusst gleich aus, der Kunde soll nicht rätseln, warum.
 *
 * Ohne Partner steht die allgemeine Adresse da, damit der Kunde nie vor einer
 * Seite ohne Ausweg steht.
 *
 * Dritte Art seit dem 23.09.2026: die abgeschaltete interaktive
 * Objektvorstellung (`ObjektvorstellungPublic`). Ihre Links laufen nicht ab,
 * es gibt die Seite schlicht nicht mehr, deshalb ein eigener Wortlaut.
 *
 * Seit dem 25.09.2026 (Kundensprache, Etappe 3) in Deutsch oder Englisch,
 * je nach `sprache`. Die Texte stehen in `linkNichtMehrGueltigTexte.ts`.
 */
type HinweisArt = KundenlinkArt | "objektvorstellung";

function hinweisTexte(art: HinweisArt, t: LinkNichtMehrGueltigTexte): { titel: string; satz: string } {
  if (art === "objektvorstellung") return { titel: t.objektvorstellungTitel, satz: t.objektvorstellungSatz };
  return {
    titel: t.abgelaufenTitel,
    satz: art === "objektuebersicht" ? t.abgelaufenSatzObjektuebersicht : t.abgelaufenSatzExpose,
  };
}

export function LinkNichtMehrGueltig({ ansprechpartner, art = "expose", sprache = STANDARD_SPRACHE }: {
  ansprechpartner?: Person;
  art?: HinweisArt;
  sprache?: Sprache;
}) {
  const mail = ansprechpartner?.email || "office@more.immo";
  const t = texteFuer(LINK_NICHT_MEHR_GUELTIG_TEXTE, sprache);
  const { titel, satz } = hinweisTexte(art, t);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12" data-testid="link-nicht-mehr-gueltig">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <img src="/images/moreimmo-logo.png" alt="MOREImmo" className="mb-8 h-7 w-auto" />
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-primary">
          <Clock className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">{titel}</h1>
        <div className="mt-2 h-[3px] w-11 rounded-full bg-primary" aria-hidden="true" />
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{satz}</p>

        {ansprechpartner ? (
          <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4" data-testid="abgelaufen-ansprechpartner">
            <div className="flex items-center gap-3">
              {ansprechpartner.avatarUrl
                ? <img src={ansprechpartner.avatarUrl} alt={ansprechpartner.name} className="h-11 w-11 rounded-full object-cover" />
                : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-sm font-semibold text-primary" aria-hidden="true">{initialen(ansprechpartner.name)}</span>}
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.ansprechpartner}</span>
                <strong className="block truncate text-sm text-foreground">{ansprechpartner.name}</strong>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {ansprechpartner.telefon && (
                <a href={`tel:${ansprechpartner.telefon.replace(/\s+/g, "")}`} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted" data-testid="abgelaufen-telefon">
                  <Phone className="h-4 w-4 text-primary" /> {ansprechpartner.telefon}
                </a>
              )}
              <a href={`mailto:${mail}`} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" data-testid="abgelaufen-email">
                <Mail className="h-4 w-4" /> {mail}
              </a>
            </div>
          </div>
        ) : (
          <a href={`mailto:${mail}`} className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" data-testid="abgelaufen-email">
            <Mail className="h-4 w-4" /> {mail}
          </a>
        )}
      </div>
    </div>
  );
}
