import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import ImpressumEn from "./ImpressumEn";
import { normalisiereSprache } from "../../supabase/functions/_shared/kunden-sprache.ts";
import { IMPRESSUM_TELEFON, IMPRESSUM_EMAIL } from "@/lib/impressumKontakt";

export default function Impressum() {
  /*
   * Englische Fassung über `?lang=en` (Plan Kundensprache, Etappe 4). Mails,
   * Portal und Kundenseiten hängen den Parameter an, wenn der Kunde Englisch
   * hat. Ohne Parameter bleibt alles wie bisher deutsch.
   */
  const [params] = useSearchParams();
  if (normalisiereSprache(params.get("lang")) === "en") return <ImpressumEn />;
  return (
    <div data-lg="seite" className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Link>

        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">Impressum</h1>
          <Link to="/impressum?lang=en" lang="en" className="text-sm text-primary hover:underline shrink-0">English version</Link>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">
          <div>
             <p className="font-semibold">OS Immobilien</p>
             <p className="text-sm text-muted-foreground">OS Immobilien Holding GmbH</p>
             <p>Am Ostbahnhof 1<br />15749 Mittenwalde</p>
            {/* Telefon und Mail stehen in `impressumKontakt.ts`, sie gehören auch in die Widerrufsbelehrung. Leere Nummer heißt: keine Zeile. */}
            {IMPRESSUM_TELEFON && <p>Telefon: <a href={`tel:${IMPRESSUM_TELEFON.replace(/\s/g, "")}`} className="text-primary hover:underline">{IMPRESSUM_TELEFON}</a></p>}
            <p>
              Mail: <a href={`mailto:${IMPRESSUM_EMAIL}`} className="text-primary hover:underline">{IMPRESSUM_EMAIL}</a>
            </p>
            <p>Steuernummer: 134 | 178 | 41478</p>
            <p>&nbsp;</p>
            <p>Umsatzsteuer-ID gemäß § 27 a UStG:&nbsp;&nbsp;DEINE-UST-ID</p>
            <p>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV: Christian Kurz</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">EU-Streitschlichtung</h2>
            <p>Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://ec.europa.eu/consumers/odr</a>.</p>
            <p>Unsere E-Mail-Adresse finden Sie oben im Impressum.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
            <p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">Haftung für Inhalte</h2>
            <p>Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.</p>
            <p>Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">Haftung für Links</h2>
            <p>Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.</p>
            <p>Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">Urheberrecht</h2>
            <p>Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet.</p>
          </div>
        </div>

        <div className="border-t mt-12 pt-6 text-xs text-muted-foreground text-center space-x-4">
          <span>© {new Date().getFullYear()} OS Immobilien Holding GmbH</span>
          <Link to="/datenschutz" className="hover:underline">Datenschutz</Link>
        </div>
      </div>
    </div>
  );
}
