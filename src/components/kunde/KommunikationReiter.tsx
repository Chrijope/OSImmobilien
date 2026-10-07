import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lock, MessageCircle, ExternalLink, FolderOpen, Paperclip, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createChat,
  getChats,
  getInitials,
  getUnreadChatCountForChat,
  type ChatData,
  type ChatParticipant,
} from "@/lib/chatStore";
import { cacheGet } from "@/lib/dataCache";
import { berufsbezeichnung, BERUF_IMMOBILIENBERATER } from "@/lib/berufsbezeichnung";
import { useLiveVersion } from "@/hooks/useLiveData";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "@/hooks/use-toast";
import { stufenFilterLabel } from "@/lib/pipelineStufen";
import { ChatVerlauf, type ChatVerlaufHandle, type ChatVerlaufKennzahlen } from "@/components/chat/ChatVerlauf";
import { ChatTeilnehmerLeiste } from "@/components/chat/ChatTeilnehmerLeiste";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** Welcher der beiden Verläufe gerade offen ist. */
export type VerlaufSchluessel = "intern" | "kunde";

export interface KommunikationReiterProps {
  kontaktId: string;
  kundeName: string;
  kundeStatus: string;
  /** Ohne freigeschaltetes Kundenportal bleibt der Kundenchat gesperrt. */
  portalFreigeschalten: boolean;
  /** Der Versicherungsexperte sieht den Kundenchat gar nicht. */
  darfKundenchatSehen: boolean;
  investments: { id: string; nummer: number; pipelineStufe: string }[];
  /** Öffnet den Reiter "Investments" mit genau diesem Vorgang. */
  onInvestmentOeffnen: (investmentId: string) => void;
  /** Vorauswahl aus der Adresse, etwa von einem alten `?tab=chat-kunde`. */
  vorauswahl?: VerlaufSchluessel | null;
}

/** Stufen, in denen ein Investment nicht mehr laeuft. */
const RUHENDE_STUFEN = new Set(["abgeschlossen", "verloren", "archiviert"]);

/**
 * Feste Hoehe des Chatfensters, fuer internen Chat und Kundenchat gleich.
 *
 * Bis zum 05.10.2026 mass `useChatSichthoehe` "Fensterunterkante minus
 * Oberkante der Karte". Im Kundenprofil sitzt die Karte aber unter Kopf,
 * Kennzahlen und Reitern, also blieb oft nur die Untergrenze von 180 Pixeln,
 * und schon eine Blase wurde abgeschnitten. Jetzt gilt eine feste Hoehe,
 * unabhaengig von der Lage der Karte und vom Inhalt der linken Spalte.
 * Kopf und Eingabe stehen fest, darin scrollt nur der Nachrichtenbereich.
 * Auf dem Handy mindestens 60 Prozent des Bildschirms.
 */
const CHATFENSTER_HOEHE = "h-[min(70vh,720px)] min-h-[60vh] lg:min-h-[480px]";
/** Die linke Spalte wird nie hoeher als der Chat, sondern scrollt. */
const LINKE_SPALTE_HOEHE = "lg:max-h-[min(70vh,720px)] lg:overflow-y-auto";

/**
 * Der Reiter "Kommunikation" im Kundenprofil.
 *
 * Vorher waren "Interner Chat" und "Kundenchat" keine echten Reiter, sondern
 * Weiterleitungen: Ein Klick sprang auf `/chat` und das Profil war weg. Wer
 * nur kurz nachsehen wollte, was zuletzt geschrieben wurde, verlor damit
 * jedes Mal den Zusammenhang und musste zurücknavigieren.
 *
 * Jetzt stehen beide Verläufe hier, mit dem Kundenkontext daneben. Der
 * Verlauf selbst ist derselbe Baustein wie auf der Chatseite, siehe
 * `components/chat/ChatVerlauf.tsx`.
 */
export function KommunikationReiter({
  kontaktId,
  kundeName,
  kundeStatus,
  portalFreigeschalten,
  darfKundenchatSehen,
  investments,
  onInvestmentOeffnen,
  vorauswahl,
}: KommunikationReiterProps) {
  const { user, authUser } = useUser();
  const myId = authUser?.id || "current";
  const liveVersion = useLiveVersion(["chat_gruppen", "chat_nachrichten", "chat_teilnehmer"]);

  const [aktiv, setAktiv] = useState<VerlaufSchluessel>(() =>
    vorauswahl === "kunde" && darfKundenchatSehen ? "kunde" : "intern",
  );
  const verlaufRef = useRef<ChatVerlaufHandle>(null);
  const [kennzahlen, setKennzahlen] = useState<ChatVerlaufKennzahlen>({ dateien: 0, markierte: 0 });
  /** Zählt eigene Schreibvorgänge, damit die frisch angelegte Gruppe sofort gefunden wird. */
  const [eigeneVersion, setEigeneVersion] = useState(0);
  /** Chatbauarten, für die das Anlegen schon läuft. Verhindert zwei Gruppen. */
  const anlageLaeuft = useRef<Set<string>>(new Set());

  const kundenchatGesperrt = !portalFreigeschalten;

  /**
   * Die beiden Verläufe dieses Kunden, sofern sie schon angelegt sind.
   *
   * Gibt es zu einem Kunden mehrere Gruppen derselben Art, gewinnt die
   * ÄLTESTE. Das ist keine Kosmetik: Die Datenbankfunktion
   * `kundenchat_starten`, über die der Kunde in seinem Portal schreibt, wählt
   * ebenfalls die älteste. Ohne dieselbe Regel auf beiden Seiten landet der
   * Kunde in der einen Gruppe und sein Berater in der anderen, beide sehen
   * einen leeren Verlauf und halten den Chat für kaputt. `getChats` liefert in
   * der Reihenfolge des Zwischenspeichers, also ungeordnet, und `find` nahm
   * damit schlicht die erste beste.
   *
   * Dass es überhaupt mehrere geben kann, ist Altbestand: Bis zum 19.09.2026
   * legte jeder Klick auf "Chat starten" im Portal eine neue Gruppe an.
   */
  const chats = useMemo(() => {
    const alle = getChats();
    const passt = (typ: ChatData["typ"]) =>
      alle
        .filter((c) => c.kundeId === kontaktId && c.typ === typ && !c.kind)
        .sort((a, b) => (a.erstelltAm || "").localeCompare(b.erstelltAm || ""))[0];
    return { intern: passt("intern"), kunde: passt("kundenkommunikation") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kontaktId, liveVersion, eigeneVersion]);

  const ungelesen = {
    intern: chats.intern ? getUnreadChatCountForChat(chats.intern.id, myId) : 0,
    kunde: chats.kunde ? getUnreadChatCountForChat(chats.kunde.id, myId) : 0,
  };

  /*
   * Die Gruppe bei Bedarf anlegen.
   *
   * Diese Logik stand bis zur dritten Welle in `handleOpenInternalChat` und
   * `handleOpenKundenChat` in `KundenDetail.tsx` und lief direkt vor dem
   * Sprung auf die Chatseite. Der Sprung entfällt, das Anlegen bleibt: Ohne
   * Gruppe gibt es nichts zu zeigen und nichts zu schreiben.
   *
   * Angelegt wird erst, wenn der jeweilige Verlauf wirklich offen ist. Sonst
   * entstünde beim bloßen Öffnen des Reiters auch eine Kundengruppe, die
   * niemand braucht.
   */
  useEffect(() => {
    if (aktiv === "kunde" && (kundenchatGesperrt || !darfKundenchatSehen)) return;
    if (chats[aktiv]) return;
    if (anlageLaeuft.current.has(aktiv)) return;
    anlageLaeuft.current.add(aktiv);

    let abgebrochen = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id || "current";

      if (aktiv === "intern") {
        await createChat(kontaktId, `${kundeName} (Intern)`, kundeStatus, user.name, "intern", undefined, authUserId);
      } else {
        // Die Kennung des Kunden steht im `meta` seiner Kontaktzeile. Ohne sie
        // hat er noch keinen Zugang und kann den Verlauf nicht sehen.
        const rawKontakt = (cacheGet<any>("kontakte") || []).find((k: any) => k.id === kontaktId);
        const kundeAuthUserId = rawKontakt?.meta?.authUserId;
        const teilnehmer: ChatParticipant[] = [
          { id: authUserId, name: user.name, initials: getInitials(user.name), role: berufsbezeichnung(user.role) || BERUF_IMMOBILIENBERATER },
        ];
        if (kundeAuthUserId) {
          teilnehmer.push({
            id: kundeAuthUserId,
            name: kundeName,
            initials: getInitials(kundeName),
            role: "Kunde",
          });
        }
        await createChat(kontaktId, kundeName, kundeStatus, user.name, "kundenkommunikation", teilnehmer, authUserId);
        if (!kundeAuthUserId) {
          toast({
            title: "Kundenportal nicht aktiviert",
            description: "Der Kunde hat noch keinen Zugang. Er kann den Chat erst nach Freischaltung des Kundenportals nutzen.",
          });
        }
      }
      if (!abgebrochen) setEigeneVersion((v) => v + 1);
      anlageLaeuft.current.delete(aktiv);
    })();

    return () => { abgebrochen = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, kontaktId, chats.intern?.id, chats.kunde?.id, kundenchatGesperrt, darfKundenchatSehen]);

  /** Das Investment, um das es gerade geht. */
  const laufendesInvestment = useMemo(() => {
    if (investments.length === 0) return null;
    return investments.find((inv) => !RUHENDE_STUFEN.has(inv.pipelineStufe)) || investments[investments.length - 1];
  }, [investments]);

  const offenerChat = chats[aktiv];
  const kundenchatOffen = aktiv === "kunde";

  const eintraege: { key: VerlaufSchluessel; titel: string; unterzeile: string; ungelesen: number; gesperrt: boolean }[] = [
    {
      key: "intern",
      titel: "Interner Chat",
      unterzeile: "nur Team",
      ungelesen: ungelesen.intern,
      gesperrt: false,
    },
    ...(darfKundenchatSehen
      ? [{
          key: "kunde" as const,
          titel: "Kundenchat",
          unterzeile: `mit ${kundeName}`,
          ungelesen: ungelesen.kunde,
          gesperrt: kundenchatGesperrt,
        }]
      : []),
  ];

  return (
    /* Zwei Spalten statt drei: Der Chat ist das Arbeitsobjekt und bekommt die
       Breite. Kundenkontext und Dateien stehen seit dem 19.09.2026 links unter
       den Verlaeufen, sie sind Beiwerk und brauchen keine eigene Spalte. */
    <div className="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-4 items-start">
      {/* Links: die Verläufe */}
      <Card className={cn("p-2 overflow-hidden", LINKE_SPALTE_HOEHE)}>
        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Verläufe
        </p>
        <div className="space-y-1">
          {eintraege.map((e) => {
            const istAktiv = aktiv === e.key;
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => setAktiv(e.key)}
                className={cn(
                  "w-full flex items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                  istAktiv ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {e.key === "intern" ? (
                  <Lock className={cn("h-4 w-4 mt-0.5 shrink-0", istAktiv ? "opacity-90" : "text-muted-foreground")} />
                ) : (
                  <MessageCircle className={cn("h-4 w-4 mt-0.5 shrink-0", istAktiv ? "opacity-90" : "text-muted-foreground")} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{e.titel}</span>
                    {e.ungelesen > 0 && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-5 shrink-0",
                          istAktiv ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                        )}
                      >
                        {e.ungelesen}
                      </Badge>
                    )}
                  </span>
                  <span className={cn("block text-[11px] truncate", istAktiv ? "opacity-80" : "text-muted-foreground")}>
                    {e.gesperrt ? "gesperrt" : e.unterzeile}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/*
          Kundenkontext und Chatdateien, seit dem 19.09.2026 hier links unter
          den Verlaeufen statt in einer eigenen dritten Spalte. Der Chat ist
          das Arbeitsobjekt und bekommt die Breite.
        */}
        <div className="mt-3 space-y-3 border-t pt-3">
          <div className="px-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Kundenkontext
            </p>
            {laufendesInvestment ? (
              <div className="mt-1.5 space-y-1.5">
                <p className="text-sm font-medium">Investment {laufendesInvestment.nummer}</p>
                <Badge variant="outline" className="text-[10px]">
                  {stufenFilterLabel(laufendesInvestment.pipelineStufe)}
                </Badge>
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs block"
                  onClick={() => onInvestmentOeffnen(laufendesInvestment.id)}
                >
                  Investment öffnen
                </Button>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Zu diesem Kunden ist noch kein Investment angelegt.
              </p>
            )}
          </div>

          {/*
            Hier standen bis zum 19.09.2026 ALLE Unterlagen des Kunden, also
            auch Vertraege und Exposes, die mit dem Chat nichts zu tun haben.
            Im Reiter Kommunikation interessiert aber genau eines: was in
            diesem Verlauf ausgetauscht wurde. Der Klick oeffnet dieselbe
            Uebersicht wie die Bueroklammer oben, damit es nur einen Ort dafuer
            gibt.
          */}
          <button
            type="button"
            onClick={() => verlaufRef.current?.oeffneDateien()}
            disabled={!offenerChat || kennzahlen.dateien === 0}
            className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dateien in diesem Chat
            </p>
            <span className="mt-1.5 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm">
                {kennzahlen.dateien === 0
                  ? "Noch keine Datei"
                  : `${kennzahlen.dateien} ${kennzahlen.dateien === 1 ? "Datei" : "Dateien"} ansehen`}
              </span>
            </span>
          </button>
        </div>
      </Card>

      {/* Mitte: der gewählte Verlauf */}
      <Card data-kundenprofil-chat className={cn("flex flex-col overflow-hidden", CHATFENSTER_HOEHE)}>
        <div className="flex items-center justify-between gap-2 p-3 border-b shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate">
              {kundenchatOffen ? `Kundenchat, mit ${kundeName}` : "Interner Chat, nur Team"}
            </h3>
            {kundenchatOffen ? (
              <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 border-green-300 text-green-700 bg-green-50">
                Für den Kunden sichtbar
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 border-blue-300 text-blue-700 bg-blue-50">
                Der Kunde sieht das nicht
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/*
              Dieselbe Leiste wie auf der Chatseite, aus
              `components/chat/ChatTeilnehmerLeiste.tsx`. Bis zum 19.09.2026
              standen hier nur Stern und Bueroklammer: Wer im Kundenprofil
              arbeitete, sah weder die Teilnehmer noch konnte er jemanden
              dazuholen und musste dafuer die Seite wechseln.

              Anpinnen, Stummschalten, Archivieren, Verlassen und Loeschen
              bleiben bewusst auf der Chatseite. Das sind Aktionen auf dem Chat
              als Ganzem und nicht auf diesem Kunden.
            */}
            {offenerChat && (
              <ChatTeilnehmerLeiste
                chat={offenerChat}
                kennzahlen={kennzahlen}
                myId={myId}
                rolle={user.role}
                // Ein Kundenchat ist zu zweit und nimmt niemanden dazu.
                einladenErlaubt={!kundenchatOffen}
                onDateien={() => verlaufRef.current?.oeffneDateien()}
                onMarkierte={() => verlaufRef.current?.oeffneMarkierte()}
                onGeaendert={() => setEigeneVersion((v) => v + 1)}
                zusatzMenue={
                  <DropdownMenuItem asChild>
                    <Link to={`/chat?id=${offenerChat.id}`}>
                      <ExternalLink className="h-4 w-4 mr-2" /> In der Chatseite öffnen
                    </Link>
                  </DropdownMenuItem>
                }
              />
            )}
          </div>
        </div>

        {kundenchatOffen && kundenchatGesperrt ? (
          <div className="p-4">
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertTitle>Kundenchat noch gesperrt</AlertTitle>
              <AlertDescription>
                Solange das Kundenportal nicht freigeschaltet ist, kann der Kunde keine Nachrichten empfangen.
                Schalte zuerst das Portal frei, die Karte „Kundenportal“ steht im Reiter Übersicht. Danach steht
                der Verlauf hier zur Verfügung.
              </AlertDescription>
            </Alert>
          </div>
        ) : offenerChat ? (
          /*
            Bewusst ohne `key`: Der Baustein bleibt beim Wechsel zwischen den
            beiden Verlaeufen stehen und behaelt so den angefangenen Satz je
            Verlauf, genau wie auf der Chatseite.
          */
          <ChatVerlauf
            ref={verlaufRef}
            chatId={offenerChat.id}
            sendeKnopfText={kundenchatOffen ? "An Kunden senden" : "Senden"}
            onKennzahlen={setKennzahlen}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6">
            Der Verlauf wird vorbereitet.
          </div>
        )}
      </Card>


    </div>
  );
}

export default KommunikationReiter;
