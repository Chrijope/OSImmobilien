import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { IMPRESSUM_TELEFON, IMPRESSUM_EMAIL } from "@/lib/impressumKontakt";
import { VORRANGKLAUSEL } from "@/lib/zweisprachig";

/**
 * Die englische Fassung des Impressums (Plan Kundensprache, D9).
 *
 * Eine Übersetzung von `Impressum.tsx`. Die Pflichtangaben selbst (Anschrift,
 * Steuernummer, USt-ID) sind dieselben; übersetzt sind die Beschriftungen und
 * die Absätze zur Haftung. Maßgeblich bleibt die deutsche Fassung.
 *
 * Aufgerufen über `/impressum?lang=en`.
 */
export default function ImpressumEn() {
  return (
    <div data-lg="seite" lang="en" className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">Legal notice (Impressum)</h1>
          <Link to="/impressum" className="text-sm text-primary hover:underline shrink-0">Deutsche Fassung</Link>
        </div>

        <div className="mb-8 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm space-y-1">
          <p>This is an English translation of our legal notice. {VORRANGKLAUSEL.en}</p>
          <p lang="de" className="text-muted-foreground">Dies ist eine englische Übersetzung unseres Impressums. {VORRANGKLAUSEL.de}</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">
          <div>
            <p className="font-semibold">OS Immobilien</p>
            <p className="text-sm text-muted-foreground">OS Immobilien Holding GmbH</p>
            <p>Am Ostbahnhof 1<br />15749 Mittenwalde<br />Germany</p>
            {IMPRESSUM_TELEFON && <p>Telephone: <a href={`tel:${IMPRESSUM_TELEFON.replace(/\s/g, "")}`} className="text-primary hover:underline">{IMPRESSUM_TELEFON}</a></p>}
            <p>
              Email: <a href={`mailto:${IMPRESSUM_EMAIL}`} className="text-primary hover:underline">{IMPRESSUM_EMAIL}</a>
            </p>
            <p>Tax number: 134 | 178 | 41478</p>
            <p>&nbsp;</p>
            <p>VAT identification number under Section 27a of the German VAT Act (UStG):&nbsp;&nbsp;DEINE-UST-ID</p>
            <p>Responsible for content under Section 55(2) of the German Interstate Broadcasting Treaty (RStV): Christian Kurz</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">EU dispute resolution</h2>
            <p>The European Commission provides a platform for online dispute resolution (ODR): <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://ec.europa.eu/consumers/odr</a>.</p>
            <p>You will find our email address above in this legal notice.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">Consumer dispute resolution / universal arbitration board</h2>
            <p>We are neither willing nor obliged to participate in dispute resolution proceedings before a consumer arbitration board.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">Liability for content</h2>
            <p>As a service provider, we are responsible for our own content on these pages in accordance with Section 7(1) of the German Telemedia Act (TMG) and general law. Under Sections 8 to 10 TMG, however, we as a service provider are not obliged to monitor transmitted or stored third-party information or to investigate circumstances that indicate unlawful activity.</p>
            <p>Obligations to remove or block the use of information under general law remain unaffected. Liability in this respect is, however, only possible from the time at which we become aware of a specific infringement. As soon as we become aware of such infringements, we will remove this content immediately.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">Liability for links</h2>
            <p>Our website contains links to external third-party websites over whose content we have no influence. We therefore cannot accept any liability for this third-party content. The respective provider or operator of the linked pages is always responsible for their content.</p>
            <p>Permanent monitoring of the content of the linked pages is, however, not reasonable without concrete indications of an infringement. As soon as we become aware of infringements, we will remove such links immediately.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mt-8 mb-3">Copyright</h2>
            <p>The content and works created by the site operators on these pages are subject to German copyright law. Reproduction, editing, distribution and any kind of use outside the limits of copyright law require the written consent of the respective author or creator. Downloads and copies of this site are permitted only for private, non-commercial use.</p>
          </div>
        </div>

        <div className="border-t mt-12 pt-6 text-xs text-muted-foreground text-center space-x-4">
          <span>© {new Date().getFullYear()} OS Immobilien Holding GmbH</span>
          <Link to="/datenschutz?lang=en" className="hover:underline">Privacy policy</Link>
        </div>
      </div>
    </div>
  );
}
