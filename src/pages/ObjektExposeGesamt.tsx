import { useCallback, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import type { ObjektData } from "@/lib/objekteStore";
import type { ExposeAnnahmen } from "@/lib/exposeAnnahmen";
import { annahmenVorbelegen } from "@/lib/exposeInhalt";
import { baueObjektExposeInhalt, objektExposeRecheneinheit, wieImKundenlink } from "@/lib/exposePublicDaten";
import { exposePfad, KUNDENANSICHT_PARAM, KUNDENANSICHT_WERT, type ExposeKunde } from "@/lib/objektExposeStore";
import { springtInDieEinheit } from "@/lib/objektseiteDaten";
import { ExposeAnsicht, RECHNER_HINWEIS_OHNE_SPEICHERN } from "@/components/expose/ExposeAnsicht";
import { ExposeErzeugenDialog } from "@/components/expose/ExposeErzeugenDialog";
import { investagonErgaenzung } from "@/components/expose/exposeInvestagon";
import { useExposeAnsprechpartner, useExposeKunde, useExposeObjekt, useExposeStandort, useGrundrissAdressen } from "@/components/expose/useExposeObjekt";
import type { AnnahmenHerkunftKarte } from "@/components/expose/ExposeRechner";

/**
 * Das Exposé eines ganzen Objekts, interne Ansicht.
 *
 * Adresse `/objekte/:id/expose`, optional `?kunde=`. Der Knopf „Exposé
 * anzeigen“ auf der Objektseite eines Globalobjekts zeigt hierhin. Beim
 * Globalobjekt rechnet das Exposé mit Kaufpreis, Fläche und Miete des ganzen
 * Hauses (`objektExposeRecheneinheit`), die Einheiten stehen als Mietenspiegel
 * darin, ohne Einzelpreis: Verkauft wird nur das Haus (Entscheidung vom
 * 10.09.2026). Bei einem Objekt mit einzeln verkauften Einheiten ist es die
 * Projektübersicht mit Links auf die Exposés der Einheiten.
 *
 * Eine Einzelwohnung oder WG hat keine Objektseite, ihr Exposé ist das der
 * Einheit. Wer diese Adresse dafür aufruft, landet dort.
 *
 * Wie das Exposé der Einheit im eigenen Tab ohne CRM-Rahmen; „Zum Objekt im
 * CRM“ führt im selben Tab zurück auf die Objektseite.
 *
 * Die Rechnerannahmen gelten nur in dieser Ansicht und werden nicht
 * gespeichert. Senden lässt sich das Exposé des ganzen Objekts trotzdem:
 * „An Kunden senden“ legt über `send-kunden-expose` eine Zeile ohne Einheit
 * an (`objekt_exposes.wohnung_id` ist seit Migration 20260923151000
 * optional), der Kundenlink lautet dann `/expose/<objektId>?token=…` und
 * rechnet mit neutralen Standardannahmen.
 */
export function ObjektExposeGesamt({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kundeId = params.get("kunde");
  const kundenansicht = params.get(KUNDENANSICHT_PARAM) === KUNDENANSICHT_WERT;
  const { objekt, objektMitAdressen, bereit } = useExposeObjekt(id);
  // Für Vertriebspartner nur ein eigener oder vertretener Kunde, siehe `useExposeKunde`.
  const kunde = useExposeKunde(kundeId, bereit, objekt);

  if (objekt && springtInDieEinheit(objekt)) {
    return <Navigate to={exposePfad(objekt.id, objekt.wohnungen[0].id, kundeId, kundenansicht)} replace />;
  }

  if (!objektMitAdressen) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background py-20">
        {bereit && !objekt ? (
          <>
            <p className="text-muted-foreground">Objekt nicht gefunden.</p>
            <Button variant="outline" onClick={() => navigate("/objekte")}>Zur Objektliste</Button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Exposé wird geladen…</p>
        )}
      </div>
    );
  }

  return <GesamtSeite objekt={objektMitAdressen} kunde={kunde} kundenansicht={kundenansicht} />;
}

/** `kundenansicht` wie in `ObjektExpose.tsx`: so, wie der Kunde es über den Link sieht. */
function GesamtSeite({ objekt, kunde, kundenansicht = false }: { objekt: ObjektData; kunde: ExposeKunde | null; kundenansicht?: boolean }) {
  const { user } = useUser();
  const [sendenOffen, setSendenOffen] = useState(false);
  // Die Standortdatenbank ist im Kundenlink nicht lesbar, siehe `ObjektExpose.tsx`.
  const { standort, standortArbeitgeber } = useExposeStandort(kundenansicht ? undefined : objekt.ort);
  const partnerIntern = useExposeAnsprechpartner(kunde);
  const ansprechpartner = kundenansicht ? wieImKundenlink(partnerIntern) : partnerIntern;
  const ansprechpartnerSchluessel = JSON.stringify(ansprechpartner);

  const recheneinheit = useMemo(() => objektExposeRecheneinheit(objekt), [objekt]);
  const vorbelegung = useMemo(() => annahmenVorbelegen(objekt, recheneinheit, null), [objekt, recheneinheit]);
  // Nur die Änderungen am Rechner werden gehalten; die Vorbelegung bleibt live.
  const [aenderungen, setAenderungen] = useState<Partial<ExposeAnnahmen>>({});
  const annahmen = useMemo(() => ({ ...vorbelegung.annahmen, ...aenderungen }), [vorbelegung, aenderungen]);
  const onAnnahmen = useCallback((a: Partial<ExposeAnnahmen>) => setAenderungen((alt) => ({ ...alt, ...a })), []);
  const herkunft = useMemo(() => {
    const h: AnnahmenHerkunftKarte = {};
    for (const k of vorbelegung.ausObjekt) if (!(k in aenderungen)) h[k] = "objekt";
    return h;
  }, [vorbelegung, aenderungen]);

  const inhaltMitZeigern = useMemo(
    () => baueObjektExposeInhalt({ objekt, standort, standortArbeitgeber, kundeName: kunde?.name, ersteller: ansprechpartner }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objekt, standort, standortArbeitgeber, kunde?.name, ansprechpartnerSchluessel],
  );
  // Die Grundrisse mit befristeter Adresse (Investagon-Kopien liegen geschützt).
  const inhalt = useGrundrissAdressen(inhaltMitZeigern);

  // Besonderheiten und Merkmale aus Investagon, auf Objektebene. Die
  // Grundrisse stehen in `inhalt.grundriss` (`grundrisseFuerExpose`).
  const investagon = useMemo(
    () => investagonErgaenzung({ objekt, einheit: null }),
    [objekt],
  );

  const kopfRechts = (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" className="gap-1.5" onClick={() => setSendenOffen(true)} data-testid="an-kunden-senden">
        <Send className="h-3.5 w-3.5" /> An Kunden senden
      </Button>
      <Badge variant="outline" className="border-primary/30 bg-accent font-semibold text-primary" data-testid="kopf-kunde">
        {kunde ? `für ${kunde.name}, erstellt von ${user.name}` : `Vorschau ohne Kunden, ${user.name}`}
      </Badge>
    </span>
  );
  const leisteObenLinks = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground max-md:min-h-[40px]">
      <Link to={`/objekte/${objekt.id}`} data-testid="zum-crm"><ArrowLeft className="h-3.5 w-3.5" /> Zum Objekt im CRM</Link>
    </Button>
  );
  // Derselbe Satz wie in der Kundenansicht, aus `ExposeAnsicht` übernommen statt kopiert.
  const rechnerHinweis = inhalt.wirtschaftlichkeit.verfuegbar ? (
    <p className="mb-3 text-xs text-muted-foreground" data-testid="speicher-status">
      {RECHNER_HINWEIS_OHNE_SPEICHERN}
    </p>
  ) : undefined;

  if (kundenansicht) {
    return (
      <ExposeAnsicht
        inhalt={inhalt}
        rechner={{ annahmen, onAnnahmen, herkunft }}
        pdfAktiv
        investagon={investagon}
        kundenAnsprechpartner={ansprechpartner}
        einheitLink={(wohnungId) => exposePfad(objekt.id, wohnungId, kunde?.id, true)}
      />
    );
  }

  return (
    <>
    <ExposeAnsicht
      inhalt={inhalt}
      rechner={{ annahmen, onAnnahmen, herkunft, eigenkapitalEuro: vorbelegung.eigenkapitalEuro }}
      kopfRechts={kopfRechts}
      leisteObenLinks={leisteObenLinks}
      rechnerHinweis={rechnerHinweis}
      fussText="Interne Vorschau"
      investagon={investagon}
      kundenAnsprechpartner={kunde ? ansprechpartner : undefined}
      einheitLink={(wohnungId) => exposePfad(objekt.id, wohnungId, kunde?.id)}
    />
    {sendenOffen && (
      <ExposeErzeugenDialog objekt={objekt} ganzesObjekt vorgewaehlterKundeId={kunde?.id ?? null} offen={sendenOffen} onOpenChange={setSendenOffen} />
    )}
    </>
  );
}
