import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useSeitentitel, oeffentlicherTitel } from "@/lib/seitentitel";
import { ArrowLeft, ArrowRight, Calendar, CalendarCheck, Clock, Mail, User, UserPlus, X } from "lucide-react";
import {
  Buehne, Balken, Kennung, FLAECHE_FELD, FLAECHE_FELD_KNOPF, FLAECHE_HINWEIS,
} from "@/components/videoraum/Buehne";
import { AnsprechpartnerKarte, Karte, KartenTitel } from "@/components/videoraum/Warteraum";
import {
  Beschreibungstext, BuchungLaedt, BuchungMeldung, Fehlerzeile, Feld, Hauptknopf, Nebenknopf,
  Schrittleiste,
} from "@/components/buchung/Bausteine";
import { Zeitauswahl } from "@/components/buchung/Zeitauswahl";
import { BUCHUNG_BAUSTEIN_TEXTE } from "@/components/buchung/buchungTexte";
import {
  absageUrl, buche, ladeFreieZeiten, ladeZugang, TERMINART_STANDARD,
  type BuchungZugang,
} from "@/lib/buchungStore";
import {
  beschriftungDauer, beschriftungZeitraum, deuteBuchungsfehler, istEmail,
} from "@/lib/buchungAuswahl";
import { spracheAusAdresse, texteFuer, useLinkSprache } from "@/lib/seitenSprache";
import { BUCHUNG_PUBLIC_TEXTE, type DankeTexte } from "./buchungPublicTexte";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";

/**
 * Die öffentliche Buchungsseite. Kein Konto, kein Anruf, nur ein Link.
 *
 * Der Token in der Adresse ist entweder ein persönlicher Link für genau einen
 * Kontakt oder das öffentliche Kürzel eines Mitarbeiters. Welches von beidem,
 * entscheidet die Datenbank in `buchung_zugang`, die Seite muss es nicht
 * wissen.
 *
 * Drei Schritte: Anliegen, Zeit, Kontaktdaten. Der erste entfällt, wenn es
 * ohnehin nur ein Anliegen gibt, denn eine Auswahl aus einem einzigen Eintrag
 * ist keine Auswahl.
 *
 * Sprache (Kundensprache, Etappe 3): Die Datenbank nennt die Sprache des
 * Kontakts am Link (`kundensprache_zum_link`, Art „buchung“), `?lang=` in der
 * Adresse überschreibt nur die Anzeige, Rückfall Deutsch. Was Mitarbeiter frei
 * schreiben (Begrüßung, Hinweis, Terminart, Name), bleibt wie gepflegt. Texte
 * in `buchungPublicTexte.ts`.
 */

type Phase = "laden" | "fehlt" | "leer" | "auswahl" | "fertig";

interface Ergebnis {
  absageToken: string;
  startAt: string;
  endeAt: string;
  dauerMinuten: number;
  bezeichnung: string;
  /** Videoraum, der beim Buchen mit entstanden ist. */
  raumToken?: string;
  /** Name der Begleitperson, sofern eine gespeichert wurde. */
  begleitungName?: string;
}

export default function BuchungPublic() {
  const { token = "" } = useParams();
  const { sprache, bereit } = useLinkSprache("buchung", token);
  const t = texteFuer(BUCHUNG_PUBLIC_TEXTE, sprache);
  // Steht `?lang=` in der Adresse, wandert es an den Verwaltungslink mit. Bei
  // einem offenen Link ohne Kontakt kennt die Datenbank die Sprache nicht, die
  // Verwaltungsseite spräche sonst wieder Deutsch.
  const langAusAdresse = spracheAusAdresse(useLocation().search);
  const verwaltenUrl = (url: string) =>
    langAusAdresse ? `${url}${url.includes("?") ? "&" : "?"}lang=${langAusAdresse}` : url;

  const [phase, setPhase] = useState<Phase>("laden");
  const [zugang, setZugang] = useState<BuchungZugang | null>(null);
  const [terminartId, setTerminartId] = useState<string | null>(null);
  const [gewaehlteZeit, setGewaehlteZeit] = useState<string | null>(null);
  const [schritt, setSchritt] = useState(0);
  const [neuLaden, setNeuLaden] = useState(0);

  // Nach der Buchung heisst der Tab anders: Wer die Seite offen laesst, findet
  // an der Beschriftung wieder, dass der Termin steht.
  useSeitentitel(oeffentlicherTitel(t.seitentitel, phase === "fertig" ? t.seitentitelFertig : null));

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [nachricht, setNachricht] = useState("");
  // Optionale Begleitperson, eingeklappt bis der Kunde sie hinzufügt.
  const [begleitungOffen, setBegleitungOffen] = useState(false);
  const [begleitungName, setBegleitungName] = useState("");
  const [begleitungEmail, setBegleitungEmail] = useState("");
  const [feldFehler, setFeldFehler] = useState<{
    name?: string; email?: string; begleitungName?: string; begleitungEmail?: string;
  }>({});

  const [buchtGerade, setBuchtGerade] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);

  // Zugang auflösen. Ein unbekannter, abgelaufener oder abgeschalteter Link
  // sieht von hier aus gleich aus, und das ist auch richtig so: Wer keinen
  // gültigen Link hat, soll nicht erfahren, woran es lag.
  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const daten = await ladeZugang(token);
      if (!aktiv) return;
      if (!daten) { setPhase("fehlt"); return; }
      setZugang(daten);
      if (daten.terminarten.length === 0) { setPhase("leer"); return; }
      if (daten.terminarten.length === 1) {
        setTerminartId(daten.terminarten[0].id);
        setSchritt(1);
      }
      setName(daten.vorbelegung?.name ?? "");
      setEmail(daten.vorbelegung?.email ?? "");
      setPhase("auswahl");
    })();
    return () => { aktiv = false; };
  }, [token]);

  const terminart = useMemo(
    () => zugang?.terminarten.find((a) => a.id === terminartId) ?? null,
    [zugang, terminartId],
  );

  const nurEineArt = (zugang?.terminarten.length ?? 0) === 1;
  const zeitzone = zugang?.zeitzone ?? "Europe/Berlin";

  const ladeZeiten = useCallback(
    (vonTag: string, bisTag: string) => {
      if (!terminartId) return Promise.resolve([] as string[]);
      return ladeFreieZeiten({ token, terminartId, vonTag, bisTag });
    },
    [token, terminartId],
  );

  const waehleArt = (id: string) => {
    if (id !== terminartId) setGewaehlteZeit(null);
    setTerminartId(id);
    setSchritt(1);
  };

  const abschicken = async () => {
    if (!terminartId || !gewaehlteZeit || buchtGerade) return;

    const fehlerFelder: {
      name?: string; email?: string; begleitungName?: string; begleitungEmail?: string;
    } = {};
    if (!name.trim()) fehlerFelder.name = t.fehlerName;
    if (!istEmail(email)) fehlerFelder.email = t.fehlerEmail;
    // Die Begleitung zählt nur, wenn der Bereich aufgeklappt ist und dort
    // etwas steht. Sobald eines der beiden Felder gefüllt ist, sind beide
    // Pflicht: eine Einladung ohne Adresse oder ohne Anrede geht nicht.
    const begleitungAktiv =
      begleitungOffen && (begleitungName.trim() !== "" || begleitungEmail.trim() !== "");
    if (begleitungAktiv) {
      if (!begleitungName.trim()) {
        fehlerFelder.begleitungName = t.fehlerBegleitungName;
      }
      if (!istEmail(begleitungEmail)) {
        fehlerFelder.begleitungEmail = t.fehlerBegleitungEmail;
      }
    }
    setFeldFehler(fehlerFelder);
    if (Object.keys(fehlerFelder).length > 0) return;

    setBuchtGerade(true);
    setFehler(null);
    try {
      const antwort = await buche({
        token,
        terminartId,
        startISO: gewaehlteZeit,
        name: name.trim(),
        email: email.trim(),
        telefon: telefon.trim() || undefined,
        nachricht: nachricht.trim() || undefined,
        begleitung: begleitungAktiv
          ? { name: begleitungName.trim(), email: begleitungEmail.trim() }
          : undefined,
        // Nur die ausdrücklich gewählte Sprache (`?lang=`). Ein neuer Kontakt
        // bekommt sie, sonst kämen die Mails einer englischen Buchung deutsch.
        sprache: langAusAdresse ?? undefined,
      });
      if (!antwort) {
        setFehler(t.buchungFehlgeschlagen);
        return;
      }
      setErgebnis({
        absageToken: antwort.absageToken,
        raumToken: antwort.raumToken,
        startAt: antwort.startAt,
        endeAt: antwort.endeAt,
        // Dauer und Bezeichnung aus der Antwort der Datenbank. Der Partner kann
        // die Terminart geändert haben, während der Kunde noch im Formular
        // saß. Gebucht ist dann der neue Stand, und genau der gehört auf die
        // Bestätigung.
        dauerMinuten: antwort.dauerMinuten ?? terminart?.dauer_minuten ?? 0,
        bezeichnung: antwort.bezeichnung || terminart?.bezeichnung || t.terminErsatz,
        // Nur zeigen, wenn die Begleitung wirklich gespeichert wurde. Beim
        // Rückfall ohne Begleitung wäre die Zusage auf der Dankeseite falsch.
        begleitungName:
          begleitungAktiv && antwort.begleitungUebernommen ? begleitungName.trim() : undefined,
      });
      setPhase("fertig");
    } catch (e) {
      const deutung = deuteBuchungsfehler(e, sprache);
      setFehler(deutung.text);
      if (deutung.neuLaden) {
        // Die Zeit war weg. Frische Zeiten holen und zurück zur Auswahl,
        // damit der Kunde nicht vor einem toten Formular sitzt.
        setGewaehlteZeit(null);
        setNeuLaden((z) => z + 1);
        setSchritt(1);
      }
    } finally {
      setBuchtGerade(false);
    }
  };

  // ---------------------------------------------------------------- Zustände

  // Auch auf die Sprache warten, damit die Seite nicht sichtbar umspringt.
  if (phase === "laden" || !bereit) return <BuchungLaedt sprache={sprache} />;

  if (phase === "fehlt") {
    return (
      <BuchungMeldung
        kennung={t.kennung}
        titel={t.fehltTitel}
        text={t.fehltText}
      />
    );
  }

  if (phase === "leer") {
    return (
      <BuchungMeldung
        kennung={t.kennung}
        titel={t.leerTitel}
        text={t.leerText}
      />
    );
  }

  const berater = {
    name: zugang?.berater.name || t.ansprechpartnerErsatz,
    email: zugang?.berater.email ?? undefined,
    telefon: zugang?.berater.telefon ?? undefined,
    bild: zugang?.berater.bild ?? null,
  };

  // Die Dankeseite je Anlass steht in `buchungPublicTexte.ts` (`dankeJeAnlass`).

  // ------------------------------------------------------------ Bestätigung

  if (phase === "fertig" && ergebnis) {
    const dankeTexte: Record<string, DankeTexte> = t.dankeJeAnlass;
    const danke = dankeTexte[terminart?.anlass ?? "sonstiges"] ?? t.dankeJeAnlass.sonstiges;
    return (
      <Buehne>
        <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center px-6 py-24">
          <div className="text-center">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-[#34C759]/30 bg-[#34C759]/10 px-4 py-1.5 text-xs text-[#7EE29B]">
              <CalendarCheck className="h-3.5 w-3.5" />
              {t.terminSteht}
            </span>
            <h1 className="mt-4 text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] sm:text-[38px]">
              {t.danke(name.trim().split(" ")[0] || name)}
            </h1>
            <Balken className="mx-auto mt-6" />
            <p className="mt-5 text-[15px] leading-relaxed text-white/60">
              {t.dankeText}
            </p>
          </div>

          <div className="mt-9 grid items-start gap-6 sm:grid-cols-[1fr_260px]">
            <Karte>
              <KartenTitel>{t.deinTermin}</KartenTitel>
              <div className="flex flex-col gap-4">
                <Zeile icon={<Calendar className="h-3.5 w-3.5" />} beschriftung={t.wann}>
                  {beschriftungZeitraum(ergebnis.startAt, ergebnis.dauerMinuten, zeitzone, sprache)}
                </Zeile>
                <Zeile icon={<Clock className="h-3.5 w-3.5" />} beschriftung={t.dauer}>
                  {beschriftungDauer(ergebnis.dauerMinuten, sprache)}
                </Zeile>
                <Zeile icon={<User className="h-3.5 w-3.5" />} beschriftung={t.anliegen}>
                  {ergebnis.bezeichnung}
                </Zeile>
                <Zeile icon={<Mail className="h-3.5 w-3.5" />} beschriftung={t.deineEmail}>
                  {email.trim()}
                </Zeile>
                {ergebnis.begleitungName && (
                  <Zeile icon={<UserPlus className="h-3.5 w-3.5" />} beschriftung={t.begleitung}>
                    {t.begleitungBestaetigung(ergebnis.begleitungName)}
                  </Zeile>
                )}
              </div>

              {/*
                Der Videoraum entsteht beim Buchen mit. Fehlt der Token, ist die
                Migration 20260804110000 noch nicht gelaufen, dann steht hier
                schlicht nichts.
              */}
              {ergebnis.raumToken && (
                <div className={`mt-6 rounded-[14px] border border-[#88CFFF]/15 ${FLAECHE_HINWEIS} p-4`}>
                  <p className="text-[12.5px] leading-relaxed text-white/60">
                    {t.videoraumHinweis}
                  </p>
                  <a
                    href={`/raum/${ergebnis.raumToken}`}
                    className="mt-2.5 inline-flex items-center gap-2 text-[13px] font-semibold text-[#88CFFF] hover:underline"
                  >
                    {t.zumVideoraum} <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
              <p className="mt-6 border-t border-white/10 pt-5 text-[12.5px] leading-relaxed text-white/40">
                {t.selbstAendern}
              </p>
              <a
                href={verwaltenUrl(absageUrl(ergebnis.absageToken, token))}
                className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#88CFFF] hover:underline"
              >
                {t.terminVerwalten} <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </Karte>
            <AnsprechpartnerKarte gastgeber={berater} sprache={sprache} />
          </div>

          <div className="mt-6 grid items-start gap-6 sm:grid-cols-2">
            <Karte>
              <KartenTitel>{t.wasJetzt}</KartenTitel>
              <div className="flex flex-col gap-4">
                {danke.ablauf.map((schritt, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#88CFFF]/[0.13] text-[11px] font-bold text-[#88CFFF]">
                      {i + 1}
                    </span>
                    <span className="text-[13.5px] leading-snug text-white/60">{schritt}</span>
                  </div>
                ))}
              </div>
            </Karte>

            <Karte>
              <KartenTitel>{t.vorbereitet}</KartenTitel>
              <ul className="flex flex-col gap-3">
                {danke.vorbereitung.map((punkt, i) => (
                  <li key={i} className="flex gap-3 text-[13.5px] leading-snug text-white/60">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#88CFFF]" />
                    {punkt}
                  </li>
                ))}
              </ul>
            </Karte>
          </div>

          {zugang?.hinweis && (
            <div className={`mt-6 rounded-[14px] border border-[#88CFFF]/15 ${FLAECHE_HINWEIS} p-4`}>
              <p className="text-[12.5px] leading-relaxed text-white/60">{zugang.hinweis}</p>
            </div>
          )}

          <p className="mt-10 text-center text-[11px] text-white/25">
            MOREImmo · Wendelsteinstraße 19, 83075 Bad Feilnbach
            <span aria-hidden className="mx-2 text-white/20">·</span>
            <a href="/impressum" className="hover:text-white/60 hover:underline">{t.impressum}</a>
            <span aria-hidden className="mx-2 text-white/20">·</span>
            <a href="/datenschutz" className="hover:text-white/60 hover:underline">{t.datenschutz}</a>
            <span aria-hidden className="mx-2 text-white/20">·</span>
            <CookieEinstellungenLink sprache={sprache} className="hover:text-white/60 hover:underline" />
          </p>
        </div>
      </Buehne>
    );
  }

  // -------------------------------------------------------------- Die Schritte

  const schrittNamen = nurEineArt
    ? [t.schrittZeit, t.schrittKontakt]
    : [t.schrittAnliegen, t.schrittZeit, t.schrittKontakt];
  const aktiverSchritt = nurEineArt ? schritt - 1 : schritt;

  return (
    <Buehne>
      <div className="mx-auto min-h-[100dvh] max-w-6xl px-6 py-24 sm:px-10">
        <Kennung>{t.kennung}</Kennung>
        <h1 className="mt-3 max-w-2xl text-[30px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[40px]">
          {zugang?.begruessung || t.begruessungErsatz}
        </h1>
        <Balken className="mt-6" />
        <p className="mt-5 max-w-[520px] text-[15.5px] leading-relaxed text-white/60">
          {t.einleitung}
        </p>

        <div className="mt-9">
          <Schrittleiste schritte={schrittNamen} aktiv={Math.max(0, aktiverSchritt)} sprache={sprache} />
        </div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[300px_1fr]">
          <div className="flex flex-col gap-6">
            {/*
              Solange nichts gewählt ist, steht links, mit wem man spricht.
              Sobald ein Anliegen gewählt wurde, ist die Frage beantwortet und
              der Platz gehört dem, worum es geht. So steht die Beschreibung
              beim Wählen der Zeit weiter im Blick, statt zu verschwinden.
            */}
            {terminart?.beschreibung ? (
              <Karte>
                <KartenTitel>{terminart.bezeichnung}</KartenTitel>
                <p className="mb-3 text-[12.5px] text-white/40">
                  {beschriftungDauer(terminart.dauer_minuten, sprache)}
                </p>
                <Beschreibungstext text={terminart.beschreibung} />
              </Karte>
            ) : (
              <AnsprechpartnerKarte gastgeber={berater} sprache={sprache} />
            )}
            {zugang?.hinweis && (
              <div className={`rounded-[14px] border border-[#88CFFF]/15 ${FLAECHE_HINWEIS} p-4`}>
                <p className="text-[12.5px] leading-relaxed text-white/60">{zugang.hinweis}</p>
              </div>
            )}
          </div>

          <Karte>
            {/* Schritt 1: Anliegen */}
            {schritt === 0 && (
              <>
                <KartenTitel>{t.worumGehtEs}</KartenTitel>
                <div className="flex flex-col gap-3">
                  {zugang?.terminarten.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => waehleArt(art.id)}
                      aria-pressed={art.id === terminartId}
                      className={`rounded-[14px] border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88CFFF] ${
                        art.id === terminartId
                          ? "border-[#087AC7] bg-[#087AC7]/15"
                          : `border-white/12 ${FLAECHE_FELD_KNOPF} hover:border-[#88CFFF]/40`
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-[15.5px] font-semibold">{art.bezeichnung}</span>
                        <span className="shrink-0 text-[12px] text-white/40">
                          {beschriftungDauer(art.dauer_minuten, sprache)}
                        </span>
                      </div>
                      {/*
                        Bewusst nur Titel und Dauer. Die Beschreibungen sind im
                        Alltag lang, nebeneinander waren sie nicht vergleichbar
                        und die Liste unlesbar. Der volle Text steht links,
                        sobald ein Anliegen gewählt ist.
                      */}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Schritt 2: Tag und Uhrzeit */}
            {schritt === 1 && (
              <>
                <KartenTitel>
                  {t.wannPasstEs}
                  {terminart ? ` · ${beschriftungDauer(terminart.dauer_minuten, sprache)}` : ""}
                </KartenTitel>

                <Zeitauswahl
                  zeitzone={zeitzone}
                  /*
                    Die Vorausschau der gewählten Terminart, nicht mehr fest 60
                    Tage. Fehlt sie, ist die Migration 20260804180000 noch nicht
                    gelaufen, dann bleibt es beim Standard.
                  */
                  vorausschauTage={terminart?.vorausschau_tage ?? TERMINART_STANDARD.vorausschauTage}
                  lade={ladeZeiten}
                  gewaehlt={gewaehlteZeit}
                  aufWahl={setGewaehlteZeit}
                  neuLaden={neuLaden}
                  sprache={sprache}
                />

                <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-6">
                  <Fehlerzeile text={fehler} />
                  {gewaehlteZeit && (
                    <p className="text-[13.5px] text-white/60">
                      {t.gewaehlt}{" "}
                      <b className="font-semibold text-white">
                        {beschriftungZeitraum(gewaehlteZeit, terminart?.dauer_minuten ?? 0, zeitzone, sprache)}
                      </b>
                    </p>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {!nurEineArt && (
                      <Nebenknopf aufKlick={() => setSchritt(0)}>
                        <ArrowLeft className="h-4 w-4" /> {t.zurueck}
                      </Nebenknopf>
                    )}
                    <Hauptknopf gesperrt={!gewaehlteZeit} aufKlick={() => setSchritt(2)}>
                      {t.weiter} <ArrowRight className="h-4 w-4" />
                    </Hauptknopf>
                  </div>
                </div>
              </>
            )}

            {/* Schritt 3: Kontaktdaten */}
            {schritt === 2 && (
              <form
                onSubmit={(e) => { e.preventDefault(); void abschicken(); }}
                noValidate
              >
                <KartenTitel>{t.wieErreichen}</KartenTitel>

                {gewaehlteZeit && (
                  <div className={`mb-6 rounded-[14px] border border-white/10 ${FLAECHE_FELD} p-4`}>
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
                      {t.deinTermin}
                    </div>
                    <p className="mt-2 text-[14.5px] font-semibold">
                      {beschriftungZeitraum(gewaehlteZeit, terminart?.dauer_minuten ?? 0, zeitzone, sprache)}
                    </p>
                    <p className="mt-1 text-[12.5px] text-white/50">
                      {terminart?.bezeichnung} · {beschriftungDauer(terminart?.dauer_minuten ?? 0, sprache)}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-5">
                  <Feld
                    id="buchung-name"
                    beschriftung={t.name}
                    wert={name}
                    aufWert={(w) => { setName(w); setFeldFehler((f) => ({ ...f, name: undefined })); }}
                    platzhalter={t.namePlatzhalter}
                    pflicht
                    autoVervollstaendigen="name"
                    maxLaenge={120}
                    fehler={feldFehler.name}
                  />
                  <Feld
                    id="buchung-email"
                    beschriftung={t.email}
                    art="email"
                    wert={email}
                    aufWert={(w) => { setEmail(w); setFeldFehler((f) => ({ ...f, email: undefined })); }}
                    platzhalter={t.emailPlatzhalter}
                    pflicht
                    autoVervollstaendigen="email"
                    maxLaenge={200}
                    fehler={feldFehler.email}
                  />
                  <Feld
                    id="buchung-telefon"
                    beschriftung={t.telefon}
                    art="tel"
                    wert={telefon}
                    aufWert={setTelefon}
                    platzhalter={t.telefonPlatzhalter}
                    autoVervollstaendigen="tel"
                    maxLaenge={40}
                    sprache={sprache}
                  />
                  <Feld
                    id="buchung-nachricht"
                    beschriftung={t.nachricht}
                    wert={nachricht}
                    aufWert={setNachricht}
                    platzhalter={t.nachrichtPlatzhalter}
                    maxLaenge={2000}
                    mehrzeilig
                    sprache={sprache}
                  />

                  {/*
                    Optionale Begleitperson, eingeklappt. Wer den Termin zu
                    zweit wahrnimmt, etwa mit dem Ehepartner, trägt hier Name
                    und E-Mail ein. Die Begleitung bekommt dieselbe
                    Bestätigung mit dem Zugangslink.
                  */}
                  {!begleitungOffen ? (
                    <button
                      type="button"
                      onClick={() => setBegleitungOffen(true)}
                      className={`flex items-center gap-2 rounded-[14px] border border-white/12 ${FLAECHE_FELD_KNOPF} px-4 py-3.5 text-left text-[14px] font-semibold transition-colors hover:border-[#88CFFF]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88CFFF]`}
                    >
                      <UserPlus className="h-4 w-4 text-[#88CFFF]" />
                      {t.begleitungHinzufuegen}
                      <span className="font-normal text-white/30">{texteFuer(BUCHUNG_BAUSTEIN_TEXTE, sprache).optional}</span>
                    </button>
                  ) : (
                    <div className={`rounded-[14px] border border-white/12 ${FLAECHE_FELD} p-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 text-[14px] font-semibold">
                          <UserPlus className="h-4 w-4 text-[#88CFFF]" />
                          {t.deineBegleitperson}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setBegleitungOffen(false);
                            setBegleitungName("");
                            setBegleitungEmail("");
                            setFeldFehler((f) => ({ ...f, begleitungName: undefined, begleitungEmail: undefined }));
                          }}
                          aria-label={t.begleitungEntfernen}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88CFFF]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/50">
                        {t.begleitungErklaerung}
                      </p>
                      <div className="mt-4 flex flex-col gap-5">
                        <Feld
                          id="buchung-begleitung-name"
                          beschriftung={t.begleitungName}
                          wert={begleitungName}
                          aufWert={(w) => { setBegleitungName(w); setFeldFehler((f) => ({ ...f, begleitungName: undefined })); }}
                          platzhalter={t.namePlatzhalter}
                          maxLaenge={120}
                          fehler={feldFehler.begleitungName}
                          sprache={sprache}
                        />
                        <Feld
                          id="buchung-begleitung-email"
                          beschriftung={t.begleitungEmail}
                          art="email"
                          wert={begleitungEmail}
                          aufWert={(w) => { setBegleitungEmail(w); setFeldFehler((f) => ({ ...f, begleitungEmail: undefined })); }}
                          platzhalter={t.emailPlatzhalter}
                          maxLaenge={200}
                          fehler={feldFehler.begleitungEmail}
                          sprache={sprache}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <Fehlerzeile text={fehler} />
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Nebenknopf aufKlick={() => setSchritt(1)}>
                      <ArrowLeft className="h-4 w-4" /> {t.andereZeit}
                    </Nebenknopf>
                    <Hauptknopf art="submit" laedt={buchtGerade} sprache={sprache}>
                      {t.buchen} <ArrowRight className="h-4 w-4" />
                    </Hauptknopf>
                  </div>
                </div>
              </form>
            )}
          </Karte>
        </div>

        <p className="mt-10 text-center text-[10.5px] text-white/30">
          MOREImmo · Wendelsteinstraße 19, 83075 Bad Feilnbach
          <span aria-hidden className="mx-2 text-white/20">·</span>
          <a href="/impressum" className="hover:text-white/60 hover:underline">{t.impressum}</a>
          <span aria-hidden className="mx-2 text-white/20">·</span>
          <a href="/datenschutz" className="hover:text-white/60 hover:underline">{t.datenschutz}</a>
          <span aria-hidden className="mx-2 text-white/20">·</span>
          <CookieEinstellungenLink sprache={sprache} className="hover:text-white/60 hover:underline" />
        </p>
      </div>
    </Buehne>
  );
}

function Zeile({
  icon,
  beschriftung,
  children,
}: {
  icon: React.ReactNode;
  beschriftung: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#88CFFF]/[0.13] text-[#88CFFF]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-[0.14em] text-white/40">{beschriftung}</span>
        <span className="mt-0.5 block text-[14.5px] text-white">{children}</span>
      </span>
    </div>
  );
}
