import { useState } from "react";
import { cacheSet } from "@/lib/dataCache";
import { DeineProvisionKarte } from "@/components/abrechnung/DeineProvisionKarte";
import { ProvisionssatzBadges } from "@/components/abrechnung/ProvisionssatzBadges";
import { ProvisionssatzBearbeiten } from "@/components/nutzerverwaltung/ProvisionssatzBearbeiten";
import { SatzartBadge, SatzartLegende } from "@/components/abrechnung/SatzartBadge";
import { festgeschriebenerSatz, getEffectiveRateInfoForKontakt } from "@/lib/provisionssatz";
import { provisionCent } from "@/lib/abrechnungRechnung";

/*
 * Lokale Vorschau „Provision je Partner“ (15.10.2026). Nur im
 * Entwicklungsmodus erreichbar (siehe vorschauRouten.ts), ohne Anmeldung und
 * ohne Datenbank. Gezeigt werden die echten Bausteine der Seiten mit
 * erfundenen Partnern; gerechnet wird mit derselben Funktion wie in den
 * Abrechnungen.
 */

const ANNA = "00000000-0000-0000-0000-00000000a001";
const BEN = "00000000-0000-0000-0000-00000000b002";
const CEM = "00000000-0000-0000-0000-00000000c003";

const PARTNER = [
  { id: ANNA, name: "Anna Beispiel", einstellungen: { custom_provision_rate_setter: 10, custom_provision_rate_eigen: 10 } },
  { id: BEN, name: "Ben Muster", einstellungen: { custom_provision_rate_setter: 8, custom_provision_rate_eigen: 12 } },
  { id: CEM, name: "Cem Neu", einstellungen: {} },
];

const ABSCHLUESSE = [
  { kunde: "Familie Kaufmann", partner: ANNA, eigen: false, kaufpreis: 250000, meta: { lockedProvisionRate: 10, lockedProvisionRatePartner: ANNA }, hinweis: "Reserviert, Satz festgeschrieben" },
  { kunde: "Herr Lange", partner: BEN, eigen: true, kaufpreis: 300000, meta: {}, hinweis: "Vor der Reservierung, eigener Kontakt" },
  { kunde: "Frau Ost", partner: BEN, eigen: false, kaufpreis: 200000, meta: {}, hinweis: "Vor der Reservierung, zugewiesener Lead" },
  { kunde: "Herr Wolf", partner: BEN, eigen: false, kaufpreis: 180000, meta: { lockedProvisionRate: 6, lockedProvisionRatePartner: BEN }, hinweis: "Reserviert mit 6 %, Satz danach auf 8 % geändert" },
  { kunde: "Frau Neumann", partner: CEM, eigen: true, kaufpreis: 220000, meta: {}, hinweis: "Partner ohne Satz in der Nutzerverwaltung" },
];

const eur = (v: number) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function VorschauProvision() {
  // Beispiel-Einstellungen einmal in den Zwischenspeicher, bevor gerendert wird.
  useState(() => {
    cacheSet("user_settings", PARTNER.map((p) => ({ user_id: p.id, einstellungen: p.einstellungen })));
    return true;
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-8" data-lg="seite">
      <div className="rounded-lg border-2 border-dashed border-[#e5007d] bg-[#e5007d]/5 p-3 text-sm">
        <strong>Lokale Vorschau, nur auf diesem Rechner.</strong> Ohne Anmeldung und ohne Datenbank, erfundene Partner.
        Cem hat noch keinen Satz. Einladeformular und
        Nutzerprofil der Nutzerverwaltung siehst du nach dem Anmelden unter localhost in der echten Seite; das
        Satzfeld des Profils steht unten als Baustein.
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Nutzerverwaltung: Spalte „Provision“</h2>
        <div className="rounded-lg border divide-y max-w-md">
          {PARTNER.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{p.name}</span>
              <ProvisionssatzBadges userId={p.id} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Auswertungen und Abrechnungen: „Dein Provisionssatz“ statt Karriereplan und Staffel</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <DeineProvisionKarte userId={ANNA} />
          <DeineProvisionKarte userId={BEN} />
          <DeineProvisionKarte userId={CEM} />
          <DeineProvisionKarte userId={BEN} partnerName="Ben Muster" />
          <DeineProvisionKarte userId={CEM} partnerName="Cem Neu" />
          <DeineProvisionKarte alle />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Nutzerprofil: Provisionssatz (Komma erlaubt, z. B. 10,5)</h2>
        <div className="grid gap-4 md:grid-cols-2 max-w-3xl">
          <ProvisionssatzBearbeiten userId={BEN} zielName="Ben Muster" lead={8} eigen={12} darfBearbeiten />
          <ProvisionssatzBearbeiten userId={BEN} zielName="Ben Muster" lead={8} eigen={12} darfBearbeiten={false} />
        </div>
        <p className="text-xs text-muted-foreground">Links als Admin oder Inhaber, rechts als andere Rolle. Speichern geht in der Vorschau nicht (keine Datenbank).</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Abrechnungen: Satz je Abschluss</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">Kunde</th><th className="p-2">Partner</th><th className="p-2">Fall</th><th className="p-2">Satz</th><th className="p-2 text-right">Provision</th></tr>
            </thead>
            <tbody>
              {ABSCHLUESSE.map((a) => {
                const kontakt = { erstelltVonId: a.eigen ? a.partner : "buero" };
                const info = getEffectiveRateInfoForKontakt(a.partner, kontakt, festgeschriebenerSatz(a.meta, a.partner));
                return (
                  <tr key={a.kunde} className="border-t">
                    <td className="p-2">{a.kunde}</td>
                    <td className="p-2">{PARTNER.find((p) => p.id === a.partner)?.name}</td>
                    <td className="p-2 text-muted-foreground">{a.hinweis}</td>
                    <td className="p-2"><SatzartBadge art={info.quelle} satz={info.rate ?? undefined} heutigerSatz={info.heutigerSatz} /></td>
                    <td className="p-2 text-right tabular-nums">
                      {info.rate === null ? <span className="text-destructive">Satz nicht gepflegt</span> : eur(provisionCent(a.kaufpreis, info.rate) / 100)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <SatzartLegende />
      </section>
    </div>
  );
}
