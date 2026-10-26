import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NaechsterSchritt } from "@/components/kunden/NaechsterSchritt";
import { getKontaktById } from "@/lib/kundenStore";
import { investmentStufenText } from "@/lib/kontaktPipeline";
import { normalizeTelefon } from "@/lib/phoneUtils";
import { formatDatum } from "@/lib/utils";
import { tarnEmail, tarnName, tarnTelefon } from "@/lib/vorfuehrmodus";

/*
 * Ein Kontakt in kompakter Fassung, die rechte Spalte von Liste und Detail
 * (B3, 26.10.2026), wie die Detailspalte einer `NavigationSplitView`.
 *
 * Zeigt nur, was zum schnellen Weiterarbeiten reicht: Name, Stufe, Telefon,
 * E-Mail, nächster Schritt. Alles Weitere steht im Profil, ein Knopf führt
 * dorthin. Hängt an Inbox und Alle Kontakte.
 */
export function KontaktKompakt({ kontaktId }: { kontaktId: string | null }) {
  const { pathname } = useLocation();
  // In der lokalen Vorschau bleibt der Weg ins Profil in der Vorschau.
  const basis = pathname.startsWith("/vorschau/crm") ? "/vorschau/crm" : "";
  // Der Kontakt kann nach dem ersten Zeichnen erst aus dem Speicher kommen.
  const [k, setK] = useState(() => (kontaktId ? getKontaktById(kontaktId) : undefined));
  useEffect(() => { setK(kontaktId ? getKontaktById(kontaktId) : undefined); }, [kontaktId]);

  if (!kontaktId || !k) {
    return (
      <div data-ui="leer" className="flex h-40 items-center justify-center rounded-xl border border-dashed text-hinweis text-muted-foreground">
        Wähle links einen Eintrag.
      </div>
    );
  }

  const name = tarnName(`${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()) || "Ohne Namen";
  const initialen = name.split(" ").map((t) => t[0]).join("").slice(0, 2).toUpperCase();
  const stufe = investmentStufenText(k);
  const zeilen: [string, string][] = [
    ["Telefon", k.telefon ? tarnTelefon(normalizeTelefon(k.telefon)) : "–"],
    ["E-Mail", k.email ? tarnEmail(k.email) : "–"],
    ["Stufe", stufe || "–"],
    ["Angelegt", formatDatum(k.erstellt_am)],
  ];

  return (
    <section aria-label={`Kontakt ${name}`} data-ui="kontakt-kompakt" className="space-y-4 rounded-xl border bg-card p-4">
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-ueberschrift text-primary">{initialen}</span>
        <div className="min-w-0">
          <h2 className="truncate text-titel2">{name}</h2>
          <p className="truncate text-hinweis text-muted-foreground">{stufe || "Kontakt"}{k.ort ? ` · ${k.ort}` : ""}</p>
        </div>
      </header>
      <div className="flex gap-2">
        {k.telefon && (
          <Button variant="tinted" size="sm" className="flex-1" asChild>
            <a href={`tel:${normalizeTelefon(k.telefon)}`}><Phone className="h-4 w-4" />Anrufen</a>
          </Button>
        )}
        {k.email && (
          <Button variant="tinted" size="sm" asChild>
            <a href={`mailto:${k.email}`} aria-label="E-Mail schreiben"><Mail className="h-4 w-4" /></a>
          </Button>
        )}
      </div>
      <dl className="divide-y rounded-lg border">
        {zeilen.map(([l, w]) => (
          <div key={l} className="px-3 py-2">
            <dt className="text-bildunterschrift text-muted-foreground">{l}</dt>
            <dd className="text-fliesstext font-medium [overflow-wrap:anywhere]">{w}</dd>
          </div>
        ))}
      </dl>
      <div className="text-hinweis"><NaechsterSchritt kunde={k} /></div>
      <Button className="w-full" asChild>
        <Link to={`${basis}/kunden/${k.id}`}>Profil öffnen</Link>
      </Button>
    </section>
  );
}
