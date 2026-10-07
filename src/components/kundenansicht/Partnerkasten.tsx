import { Mail, Phone } from "lucide-react";
import type { Person } from "@/lib/exposeInhalt";
import { initialen } from "@/lib/exposeAnsprechpartner";
import { telefonAnzeige } from "@/lib/phoneUtils";
import { useKundenTexte } from "./kundenansichtTexte";

/**
 * „Dein Ansprechpartner“: derselbe Kasten im Kunden-Exposé und in der
 * Kundenansicht (Bauplan vom 23.09.2026, Frage 8).
 *
 * Genau vier Angaben: Bild (sonst Initialen), Name, Telefon und E-Mail. Kein
 * Buchungslink, keine Rolle außer einer, die mehr sagt als „Ansprechpartner“.
 * Was hineinkommt, hat der Server schon auf diese vier Angaben gekürzt
 * (`oeffentlicherAnsprechpartner`).
 *
 * Gestaltet wird der Kasten über `premiumExpose.css` (`.premium-expose
 * .kunden-partner`). Außerhalb des Exposés steht er deshalb in einem Rahmen
 * mit dieser Klasse.
 */
export function Partnerkasten({ person }: { person: Person }) {
  // Im Exposé und in der Kundenansicht in der Sprache der Seite (Kundensprache, Etappe 3).
  const { t, sprache } = useKundenTexte();
  // Eine eigene Rolle ist ein deutscher Freitext aus dem Profil; auf Englisch bleibt sie weg.
  const rolle = sprache === "de" && person.rolle && !/ansprechpartner/i.test(person.rolle) ? person.rolle : "";
  return (
    <section className="kunden-partner" data-testid="kunden-ansprechpartner" aria-label={t.partner.titel}>
      <div className="kp-person">
        {person.avatarUrl
          ? <img src={person.avatarUrl} alt={person.name} className="kp-bild" />
          : <span className="kp-bild kp-initialen" aria-hidden="true">{initialen(person.name)}</span>}
        <div>
          <span className="kp-eyebrow">{t.partner.titel}</span>
          <strong>{person.name}</strong>
          {rolle && <small>{rolle}</small>}
        </div>
      </div>
      {(person.telefon || person.email) && (
        <div className="kp-wege">
          {/* Angezeigt gruppiert, gewählt ohne Leerzeichen. */}
          {person.telefon && <a className="btn" href={`tel:${person.telefon.replace(/\s+/g, "")}`} data-testid="kp-telefon"><Phone size={14} /> <span className="kp-text">{telefonAnzeige(person.telefon) || person.telefon}</span></a>}
          {person.email && <a className="btn primary" href={`mailto:${person.email}`} data-testid="kp-email"><Mail size={14} /> <span className="kp-text">{person.email}</span></a>}
        </div>
      )}
    </section>
  );
}
