import { useSearchParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { reservierungUntertitel } from "@/lib/reservierungKopf";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { ReservierungsForm } from "@/components/reservierung/ReservierungsForm";
import { istVerkaeuferArt } from "@/lib/verkaeuferName";
import { rueckweg, rueckwegBeschriftung } from "@/lib/reservierungRueckweg";
import { useCacheReady } from "@/hooks/useCacheReady";
import { getKontaktById } from "@/lib/kundenStore";
import { getInvestmentById, getInvestmentMetaField } from "@/lib/investmentsStore";
import { getObjektById } from "@/lib/objekteStore";
import { istGlobalobjekt } from "@/lib/objektKlassen";

/**
 * Die Reservierungsvereinbarung.
 *
 * **Warum in der Adresszeile keine Kundendaten mehr stehen.** Bis zum
 * 16.09.2026 trug diese Adresse Name, Mailadresse, Telefonnummer, Anschrift
 * und Geburtsdatum des Kunden im Klartext, dazu Objekt, Kaufpreis und Miete.
 * Aufgefallen ist das an einem echten Fehlerticket an diesem Tag: Die volle
 * Adresse stand darin und war damit für jeden lesbar, der das Ticket öffnet.
 * Solche Adressen landen außerdem im Browserverlauf, in Lesezeichen, in
 * Serverprotokollen und in den Weiterleitungs-Kopfzeilen fremder Seiten.
 *
 * Nötig war davon nichts: Die Adresse trägt ohnehin die Kennung des Kunden
 * und die des Investments, und aus beiden lässt sich jede dieser Angaben aus
 * dem eigenen Bestand nachschlagen. Genau das tut die Seite jetzt.
 *
 * In der Adresse stehen nur noch Kennungen ohne Aussagekraft und der
 * Rückweg: `kunde`, `investmentId`, `zurueck`, dazu `objektId` und
 * `wohnungId` für den Weg über die Objekt- und die Wohnungsseite. Diese
 * beiden sind reine Kennungen, aus denen niemand etwas ablesen kann, und sie
 * stehen beim Aufruf von dort noch nicht am Investment.
 */

/**
 * Was die Seite aus dem Zwischenspeicher liest.
 *
 * Kontakt und Investment für die Vorbefüllung, Objekte und Wohnungen für den
 * Weg über die Objektseite. Ohne sie steht das Formular leer da, denn seine
 * Vorbefüllung entsteht genau einmal beim Aufbau.
 */
const RESERVIERUNG_TABELLEN = ["kontakte", "investments", "objekte", "wohnungen"];

const Reservierung = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const kundeId = searchParams.get("kunde") || "";
  const investmentId = searchParams.get("investmentId") || undefined;
  /*
   * Wohin der Zurückweg führt.
   *
   * In dieses Formular führen drei Wege: das Kundenprofil, die Objektseite und
   * die Wohnungsseite. Jeder von ihnen hängt seine eigene Adresse als „zurück“
   * an. Der Verlauf des Browsers trägt hier nicht: Die Seite lässt sich auch
   * direkt aufrufen oder als Lesezeichen speichern, dann gibt es keinen
   * Verlauf, und nach dem Versand stünde die Reservierung selbst darin.
   *
   * Fehlt die Angabe, bleibt das Kundenprofil aus der Adresszeile, und ohne
   * Kunden die Kontaktliste. Beides entscheidet das Formular selbst.
   */
  const zurueckZiel = searchParams.get("zurueck") || undefined;

  const bereit = useCacheReady(RESERVIERUNG_TABELLEN);

  const kontakt = bereit && kundeId ? getKontaktById(kundeId) : undefined;
  const investment = bereit && investmentId ? getInvestmentById(investmentId) : undefined;

  /*
   * Die Kennungen von Objekt und Wohnung.
   *
   * Am Investment stehen sie erst, wenn die Reservierung abgeschickt wurde.
   * Beim Weg über die Objekt-, die Wohnungs- oder die Einheitsseite reisen sie
   * deshalb in der Adresse mit.
   *
   * Steht eine Wohnung in der Adresse, gewinnt sie seit dem 23.09.2026 samt
   * ihrem Objekt. Sie ist die Einheit, die gerade ausgewählt wurde und für die
   * das Formular gleich vormerkt. Vorher hatte das Investment Vorrang: Trug es
   * noch eine frühere Wohnung, stand im Formular diese statt der gewählten,
   * und vorgemerkt worden wäre die falsche. Ohne Wohnung in der Adresse, etwa
   * aus dem Kundenprofil, bleibt es beim Investment.
   */
  const wohnungAusAdresse = searchParams.get("wohnungId") || undefined;
  const objektAusAdresse = searchParams.get("objektId") || undefined;
  /*
   * Reservierung des ganzen Hauses (Globalobjekt), seit dem 23.09.2026.
   *
   * Von der Objektseite kommt `gesamtobjekt=1` samt `objektId`. Dann gewinnt
   * dieses Objekt, wie sonst die gewählte Wohnung. Aus dem Kundenprofil kommt
   * nur das Investment; trägt es das Kennzeichen „Globalobjekt“ und keine
   * Wohnung in der Adresse, geht es ebenfalls um das ganze Haus.
   *
   * Gilt nur, wenn das Objekt wirklich ein Globalobjekt ist. Sonst bleibt es
   * bei der Einzelwohnung, denn nur ein Globalobjekt wird als Ganzes verkauft.
   */
  const gesamtobjektAusAdresse = searchParams.get("gesamtobjekt") === "1" && !!objektAusAdresse;
  const objektId = (gesamtobjektAusAdresse && objektAusAdresse)
    || (wohnungAusAdresse && objektAusAdresse)
    || investment?.objektId || objektAusAdresse || undefined;

  const objekt = bereit && objektId ? getObjektById(objektId) : undefined;
  const investmentIstGlobal = !!investmentId && !wohnungAusAdresse && bereit
    && getInvestmentMetaField<boolean>(investmentId, "globalObjekt", false) === true;
  const gesamtobjekt = istGlobalobjekt(objekt) && (gesamtobjektAusAdresse || investmentIstGlobal);
  // Beim ganzen Haus gibt es keine Wohnung, auch keine frühere am Investment.
  const wohnungId = gesamtobjekt ? undefined : (wohnungAusAdresse || investment?.wohnungId || undefined);
  const bestandsWohnung = wohnungId ? objekt?.wohnungen?.find(w => w.id === wohnungId) : undefined;

  /*
   * Der Übergang für alte Links.
   *
   * Eine Adresse von vor dem 16.09.2026 kann in einem Lesezeichen oder in
   * einer offenen Mail stehen. Sie soll weiter funktionieren, deshalb werden
   * die alten Parameter noch gelesen. Sie sind aber nur der Rückfall: Sobald
   * Kunde, Investment oder Bestandswohnung geladen werden können, gewinnen
   * die geladenen Daten. Erzeugt wird eine solche Adresse nirgends mehr.
   */
  const alt = (schluessel: string) => searchParams.get(schluessel) || "";
  const altZahl = (schluessel: string) => (alt(schluessel) ? Number(alt(schluessel)) : 0);

  const altKundeData = alt("kVorname") ? {
    vorname: alt("kVorname"), nachname: alt("kNachname"), email: alt("kEmail"),
    telefon: alt("kTelefon"), strasse: alt("kStrasse"), hausnummer: alt("kHausnummer"),
    plz: alt("kPlz"), ort: alt("kOrt"), geburtsdatum: alt("kGeburtsdatum"),
  } : undefined;

  const altWohnungData = (alt("weNr") || alt("objAdresse") || altZahl("kaufpreis") > 0) ? {
    weNr: alt("weNr"), groesse: altZahl("groesse"), kaufpreis: altZahl("kaufpreis"),
    etage: alt("etage"), lage: alt("lage"), zimmer: altZahl("zimmer"),
    miete: altZahl("miete"), rendite: altZahl("rendite"),
    objAdresse: alt("objAdresse"), objPlz: alt("objPlz"), objOrt: alt("objOrt"),
  } : undefined;

  const altVkArt = alt("vkArt");
  const altVerkaeuferData = alt("vkName") ? {
    // „firma“ oder „person“, sonst leer. Ein Fremdwert aus der Adresszeile
    // darf keine Wahl vortäuschen, die niemand getroffen hat.
    vkArt: istVerkaeuferArt(altVkArt) ? altVkArt : ("" as const),
    vkVorname: alt("vkVorname"), vkName: alt("vkName"),
    vkStrasse: alt("vkStrasse"), vkPlz: alt("vkPlz"), vkOrt: alt("vkOrt"),
  } : undefined;

  /**
   * Die Wohnung aus dem eigenen Bestand.
   *
   * Genau die Angaben, die früher aus der Objekt- und der Wohnungsseite in
   * die Adresse geschrieben wurden, jetzt direkt aus dem Zwischenspeicher.
   */
  const bestandWohnungData = bestandsWohnung && objekt ? {
    weNr: bestandsWohnung.weNr || "",
    groesse: bestandsWohnung.groesse || 0,
    kaufpreis: bestandsWohnung.vkGesamt || 0,
    etage: bestandsWohnung.etage || "",
    lage: bestandsWohnung.lage || "",
    zimmer: bestandsWohnung.zimmer || 0,
    miete: bestandsWohnung.mieteGesamt || 0,
    rendite: bestandsWohnung.rendite || 0,
    objAdresse: objekt.adresse || "",
    objPlz: objekt.plz || "",
    objOrt: objekt.ort || "",
  } : undefined;

  /**
   * Konnten die Objektangaben geladen werden?
   *
   * Das Investment trägt sie in seinen eigenen Feldern, die das Formular
   * selbst über `vorhandeneObjektDaten` liest. Deshalb genügt hier die Frage,
   * ob es das Investment gibt.
   */
  const objektGeladen = !!investment || !!bestandWohnungData;

  const wohnungData = bestandWohnungData || (objektGeladen ? undefined : altWohnungData);
  const verkaeuferData = objektGeladen ? undefined : altVerkaeuferData;
  const kundeData = kontakt ? undefined : altKundeData;

  const objektTitel = objekt?.titel || investment?.objektTitel || alt("objekt") || undefined;
  const kundeName = kontakt
    ? `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim()
    : [altKundeData?.vorname, altKundeData?.nachname].filter(Boolean).join(" ");

  const zurueckAdresse = rueckweg(zurueckZiel, kundeId);

  /*
   * Solange der Zwischenspeicher lädt, wird nichts gezeigt, was danach
   * anders aussähe. Das Formular baut seine Vorbefüllung genau einmal auf;
   * würde es zu früh erscheinen, bliebe es dauerhaft leer.
   */
  if (!bereit) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <PageHeader title="Reservierungsvereinbarung" subtitle="Daten werden geladen" />
          <Card className="p-6 space-y-4">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Der Kunde steht in der Adresse, ist aber nicht auffindbar, und es gibt
  // auch keinen alten Link, aus dem sich seine Daten noch ergäben.
  const kundeFehlt = !!kundeId && !kontakt && !altKundeData;
  // Dasselbe für das Investment. Das blockiert nicht: Die Objektdaten lassen
  // sich im Formular von Hand eintragen, die Käuferdaten stehen ja.
  const investmentFehlt = !!investmentId && !investment && !altWohnungData;

  if (kundeFehlt) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <PageHeader title="Reservierungsvereinbarung" subtitle="Kunde nicht gefunden" />
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Dieser Kunde ist nicht auffindbar</AlertTitle>
            <AlertDescription>
              Zu der Kennung in der Adresse gibt es keinen Kontakt. Möglich ist, dass er
              gelöscht wurde oder dass du ihn nicht sehen darfst. Bitte öffne die
              Reservierung erneut aus dem Kundenprofil.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => navigate(zurueckAdresse)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {rueckwegBeschriftung(zurueckAdresse)}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Reservierungsvereinbarung"
          subtitle={reservierungUntertitel(kundeName, objektTitel)}
        />
        {investmentFehlt && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Die Objektdaten konnten nicht geladen werden</AlertTitle>
            <AlertDescription>
              Zu der Kennung in der Adresse gibt es kein Investment. Die Angaben zum Objekt
              bleiben leer und müssen im nächsten Schritt von Hand eingetragen werden.
            </AlertDescription>
          </Alert>
        )}
        <ReservierungsForm
          kundeId={kundeId}
          objektTitel={objektTitel}
          wohnungData={wohnungData}
          verkaeuferData={verkaeuferData}
          kundeData={kundeData}
          investmentId={investmentId}
          wohnungId={wohnungId}
          objektId={objektId}
          gesamtobjekt={gesamtobjekt}
          zurueckZiel={zurueckZiel}
          onComplete={() => {
            // Nach dem Versand denselben Weg zurück wie über den Zurückknopf.
            // Dieselbe Rechnung, damit beide nicht auseinanderlaufen.
            navigate(rueckweg(zurueckZiel, kundeId));
          }}
        />
      </div>
    </DashboardLayout>
  );
};

export default Reservierung;
