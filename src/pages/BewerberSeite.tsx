import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Pause,
  PhoneOff,
} from "lucide-react";
import { ladeBewerberSeite, meldeBewerberSeitenAktion } from "@/lib/bewerberSeiteStore";
import { HR_ANSPRECHPARTNERIN } from "@/lib/bewerberKontaktversuch";
import { BERUF_HR } from "@/lib/berufsbezeichnung";
import { KENNENLERNEN_GUELTIG_TAGE } from "@/lib/bewerberKennenlernen";
import {
  FRAGE_MAX,
  GRUND_MAX,
  PAUSEN_WAHLEN,
  alsDatum,
  frageOffen,
  pauseLaeuft,
  stationen,
  werAmZug,
  zustandVon,
  type BewerberSeiteStand,
  type PausenWahl,
  type SeitenAktion,
  type Station,
  type SeitenZustand,
} from "@/lib/bewerberSeite";
import {
  Eyebrow,
  FARBE_BLAU,
  FARBE_DUNKEL,
  Hauptknopf,
} from "@/components/bewerberformular/FragebogenBausteine";
import logo from "@/assets/moreimmo-logo.png";
// Liquid Glass fuer die Bewerberseiten (Huelle `.bewerber-seite`, Karte `.bewerber-karte`).
import "@/styles/lp-theme-liquid.css";

type SeitenStatus = "laedt" | "bereit" | "unbekannt" | "fehler";

/**
 * Die persönliche Seite des Bewerbers, unter seiner eigenen Adresse.
 *
 * Sie entsteht mit dem Eingang der Bewerbung und nicht erst nach dem Absenden
 * eines Bogens. Damit gibt es zwei Wege zum selben Ziel: die Eingangsmail und
 * die Erfolgsseite der Website. Landet die Mail im Spam, ist der Fall nicht
 * mehr still verloren.
 *
 * **In jedem Zustand dieselben drei Fragen.** Was ist erledigt? Wer ist gerade
 * am Zug? Was kann ich als Nächstes tun? Der Aufbau ist deshalb in allen fünf
 * Zuständen gleich: links die vier Stationen und der nächste Schritt, rechts
 * die Ansprechpartnerin, der Rahmen zum Nachlesen und der Ausstieg.
 *
 * **Wer am Zug ist, kommt aus dem Vorgang und nicht aus der Pipelinestufe.**
 * Eine offene Rückfrage macht OS Immobilien zum Zugführer, obwohl der Bewerber
 * formal in der Stufe Eingang steht. Die Herleitung steht in
 * `src/lib/bewerberSeite.ts` und wird dort geprüft; diese Datei ist nur die
 * Bühne.
 *
 * **Was sie nicht zeigt.** Keine Bewertung, keine Punktzahl, keine interne
 * Notiz und nicht die Pipeline des CRM. Die Datenbankfunktion
 * `get_bewerber_seite` gibt das alles gar nicht erst heraus.
 */
export default function BewerberSeite() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<SeitenStatus>("laedt");
  const [stand, setStand] = useState<BewerberSeiteStand | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const [frageOffenAufklappen, setFrageAufklappen] = useState(false);
  const [frageText, setFrageText] = useState("");
  const [pauseAufklappen, setPauseAufklappen] = useState(false);
  const [ausstiegAufklappen, setAusstiegAufklappen] = useState(false);
  const [ausstiegGrund, setAusstiegGrund] = useState("");
  const titelRef = useRef<HTMLHeadingElement>(null);

  // Die Seite gehört nicht in Suchmaschinen.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const lade = useCallback(async () => {
    if (!token) { setStatus("fehler"); return; }
    /*
     * Solange die Migration nicht gelaufen ist, gibt es `get_bewerber_seite`
     * nicht. Der Store meldet das als `null`, und die Seite sagt dann
     * „Diesen Link kennen wir nicht", statt mit einem technischen Fehler
     * stehen zu bleiben. Der übrige Bewerberweg läuft unverändert weiter.
     */
    const gelesen = await ladeBewerberSeite(token);
    if (!gelesen) { setStatus("unbekannt"); return; }
    setStand(gelesen);
    setStatus("bereit");
  }, [token]);

  useEffect(() => { void lade(); }, [lade]);

  useEffect(() => {
    if (status === "bereit") titelRef.current?.focus();
  }, [status]);

  /**
   * Eine Aktion an den Server schicken und den Stand neu holen.
   *
   * Bewusst immer neu laden statt den Zustand im Browser fortzuschreiben: Was
   * der Bewerber sieht, soll das sein, was tatsächlich gespeichert ist. Genau
   * daran ist die alte Fassung gescheitert, in der Pause und Ausstieg nur den
   * Bildschirm umgeschaltet haben.
   */
  const sende = async (
    aktion: SeitenAktion,
    zusatz: { text?: string; wahl?: PausenWahl } = {},
    erfolg = "",
  ) => {
    if (!token || arbeitet) return;
    setArbeitet(true);
    setFehler("");
    setMeldung("");
    const ok = await meldeBewerberSeitenAktion({ token, aktion, ...zusatz });
    if (ok) {
      await lade();
      if (erfolg) setMeldung(erfolg);
    } else {
      setFehler("Das hat leider nicht geklappt. Versuch es bitte gleich noch einmal.");
    }
    setArbeitet(false);
  };

  if (status === "laedt") {
    return (
      <Seite><Karte>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#6E6E73" }} aria-label="Lädt" />
        </div>
      </Karte></Seite>
    );
  }

  if (status !== "bereit" || !stand) {
    return (
      <Seite><Karte>
        <div className="text-center space-y-3 py-4">
          <img src={logo} alt="OS Immobilien" className="h-[26px] sm:h-[34px] mx-auto mb-5" />
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" aria-hidden />
          <h1 className="text-2xl" style={{ color: FARBE_DUNKEL }}>Diesen Link kennen wir nicht</h1>
          <p className="text-[15px] leading-relaxed" style={{ color: "#6E6E73" }}>
            Kein Problem. Schreib uns kurz an{" "}
            <a href="mailto:os@os-immobilien.com" className="underline underline-offset-[3px]" style={{ color: FARBE_BLAU }}>os@os-immobilien.com</a>,
            dann bekommst du einen neuen.
          </p>
        </div>
      </Karte></Seite>
    );
  }

  const zustand = zustandVon(stand);
  const amZug = werAmZug(stand);
  const schritte = stationen(stand);
  const pausiert = pauseLaeuft(stand.pause);
  const rueckfrage = frageOffen(stand.frage);
  const kennenlernenPfad = stand.kennenlernen.token ? `/kennenlernen/${stand.kennenlernen.token}` : "";

  return (
    <Seite>
      <div className="w-full max-w-[1040px]">
        <img src={logo} alt="OS Immobilien" className="h-[26px] sm:h-[30px] mb-6" />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-5 lg:items-start">
          <div className="space-y-4">
            <Karte>
              <Eyebrow>{kopfAugenbraue(zustand)}</Eyebrow>
              <h1
                ref={titelRef}
                tabIndex={-1}
                className="text-[26px] sm:text-[31px] leading-[1.12] mt-2 mb-2.5 focus:outline-none"
                style={{ color: FARBE_DUNKEL }}
              >
                {kopfTitel(zustand, stand)}
              </h1>
              <p className="text-[16px] leading-[1.6]" style={{ color: "#3A3A3F" }}>
                {kopfText(zustand, stand)}
              </p>

              <ul className="mt-5 space-y-2.5">
                {schritte.map((s) => <StationsZeile key={s.schluessel} station={s} />)}
              </ul>
            </Karte>

            {meldung && (
              <p className="rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed" style={{ background: "#EAF6EE", color: "#1E7A45" }}>
                {meldung}
              </p>
            )}
            {fehler && (
              <p className="rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed" style={{ background: "#FDF0EE", color: "#B23A2B" }}>
                {fehler}
              </p>
            )}

            {/* ── Der nächste Schritt, je Zustand genau einer ── */}

            {zustand === "eingang" && (
              <Karte>
                <Eyebrow>Dein nächster Schritt</Eyebrow>
                <h2 className="text-[21px] leading-snug mt-2 mb-2" style={{ color: FARBE_DUNKEL }}>
                  Die Zusammenarbeit kennenlernen.
                </h2>
                <p className="text-[15px] leading-relaxed mb-4" style={{ color: "#5A5F66" }}>
                  Sieben Kapitel. Zuerst zeigen wir dir die Tätigkeit, die Unterstützung und die
                  Konditionen, danach geht es um deinen möglichen Einstieg. Du kannst jederzeit
                  pausieren und später weitermachen.
                </p>
                {kennenlernenPfad ? (
                  <Link to={kennenlernenPfad} className="block">
                    <Hauptknopf breit>Kennenlernen beginnen</Hauptknopf>
                  </Link>
                ) : (
                  <p className="rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed" style={{ background: "#EEF5FD", color: "#156949" }}>
                    Dein Zugang zum Kennenlernen ist unterwegs. Er kommt per Mail, meist innerhalb
                    weniger Minuten.
                  </p>
                )}
              </Karte>
            )}

            {zustand === "unterbrochen" && (
              <Karte>
                {pausiert ? (
                  <>
                    <Eyebrow>Du hast pausiert</Eyebrow>
                    <h2 className="text-[21px] leading-snug mt-2 mb-2" style={{ color: FARBE_DUNKEL }}>
                      {stand.pause?.erinnerungAm
                        ? `Erinnerung am ${alsDatum(stand.pause.erinnerungAm)}, weil du sie so gewählt hast.`
                        : "Wir melden uns nicht von selbst, so wie du es gewählt hast."}
                    </h2>
                    <p className="text-[15px] leading-relaxed mb-4" style={{ color: "#5A5F66" }}>
                      Bis dahin kommt nichts von uns. Du kannst die Erinnerung hier ändern oder
                      abstellen, und du kannst jederzeit weitermachen, ohne auf sie zu warten.
                    </p>
                  </>
                ) : (
                  <>
                    <Eyebrow>Weitermachen, wo du aufgehört hast</Eyebrow>
                    <h2 className="text-[21px] leading-snug mt-2 mb-2" style={{ color: FARBE_DUNKEL }}>
                      Dein Kennenlernen wartet auf dich.
                    </h2>
                    <p className="text-[15px] leading-relaxed mb-4" style={{ color: "#5A5F66" }}>
                      Der Link führt dich zurück. Was du auf diesem Gerät beantwortet hast, steht
                      noch da.
                    </p>
                  </>
                )}
                {kennenlernenPfad && (
                  <Link to={kennenlernenPfad} className="block">
                    <Hauptknopf breit>Weitermachen</Hauptknopf>
                  </Link>
                )}
                {pausiert && (
                  <button
                    type="button"
                    onClick={() => void sende("weiter", {}, "Deine Pause ist aufgehoben.")}
                    disabled={arbeitet}
                    className="mt-3 w-full text-[14.5px] underline underline-offset-[3px] disabled:opacity-50"
                    style={{ color: FARBE_BLAU }}
                  >
                    Erinnerung abstellen
                  </button>
                )}
              </Karte>
            )}

            {zustand === "termin" && (
              <Karte>
                <Eyebrow>Dein Videocall steht</Eyebrow>
                <h2 className="text-[21px] leading-snug mt-2 mb-2" style={{ color: FARBE_DUNKEL }}>
                  {alsDatum(stand.termin.datum)}
                  {stand.termin.uhrzeit ? ` um ${stand.termin.uhrzeit} Uhr` : ""}
                </h2>
                <p className="text-[15px] leading-relaxed mb-4" style={{ color: "#5A5F66" }}>
                  Per Video. Du brauchst nichts vorzubereiten, den Link bekommst du am Morgen davor.
                  {stand.termin.berater ? ` Du sprichst mit ${stand.termin.berater}.` : ""}
                </p>
                {kennenlernenPfad && (
                  <>
                    <Link to={kennenlernenPfad} className="block">
                      <Hauptknopf breit>Verschieben oder absagen</Hauptknopf>
                    </Link>
                    <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: "#8A8F98" }}>
                      Beides geht ohne Rückfrage. Und wenn keine Zeit passt, endet es nicht still:
                      Schreib uns, an welchen Tagen es bei dir grundsätzlich ginge.
                    </p>
                  </>
                )}
              </Karte>
            )}

            {zustand === "entscheidung" && (
              <Karte>
                {stand.entscheidung ? (
                  <>
                    <Eyebrow>Von unserer Seite</Eyebrow>
                    <h2 className="text-[21px] leading-snug mt-2 mb-2" style={{ color: FARBE_DUNKEL }}>
                      {stand.entscheidung.einschaetzung || "Was wir besprochen haben, steht hier."}
                    </h2>
                    {stand.entscheidung.text && (
                      <p className="text-[15px] leading-relaxed mb-4 whitespace-pre-line" style={{ color: "#5A5F66" }}>
                        {stand.entscheidung.text}
                      </p>
                    )}
                    <p className="rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed" style={{ background: "#EAF6EE", color: "#1E7A45" }}>
                      Das ist noch kein Vertragsangebot und löst von allein nichts aus. Was als
                      Nächstes passiert, bestimmst du.
                    </p>
                  </>
                ) : (
                  <>
                    <Eyebrow>Das Gespräch ist gelaufen</Eyebrow>
                    <h2 className="text-[21px] leading-snug mt-2 mb-2" style={{ color: FARBE_DUNKEL }}>
                      Wir fassen zusammen, was besprochen wurde.
                    </h2>
                    <p className="text-[15px] leading-relaxed" style={{ color: "#5A5F66" }}>
                      {HR_ANSPRECHPARTNERIN.split(" ")[0]} schreibt dir die Zusammenfassung, sobald
                      sie sie durchgesehen hat. Du musst dafür nichts tun und nichts nachfassen.
                    </p>
                  </>
                )}
              </Karte>
            )}

            {zustand === "start" && (
              <Karte>
                <Eyebrow>Dein Start</Eyebrow>
                <h2 className="text-[21px] leading-snug mt-2 mb-2" style={{ color: FARBE_DUNKEL }}>
                  Vier Stationen, jede mit einem Namen dahinter.
                </h2>
                <ul className="mt-3 space-y-2.5">
                  {START_STATIONEN.map((s) => (
                    <li key={s.titel} className="rounded-2xl px-4 py-3" style={{ background: "#F5F5F7" }}>
                      <p className="text-[15px] font-semibold" style={{ color: FARBE_DUNKEL }}>{s.titel}</p>
                      <p className="text-[14.5px] leading-relaxed mt-0.5" style={{ color: "#5A5F66" }}>{s.text}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 rounded-2xl px-4 py-3" style={{ background: "#FDF3E8" }}>
                  <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "#A9640F" }}>
                    Was bis dahin möglich ist
                  </p>
                  <p className="text-[14.5px] leading-relaxed mt-1" style={{ color: "#5A5F66" }}>
                    Lernen ja, eigene Kundenberatung noch nicht. Solange die Voraussetzungen offen
                    sind, führst du Interessenten zu und bist in Gesprächen dabei. Das
                    Beratungsgespräch selbst führt jemand aus dem Haus, gemeinsam mit dir. Sobald
                    die Nachweise vorliegen, fällt diese Grenze.
                  </p>
                </div>
              </Karte>
            )}

            {zustand === "beendet" && (
              <Karte>
                <div className="flex items-start gap-3">
                  <Check className="h-6 w-6 shrink-0 mt-0.5" style={{ color: "#1E9E5A" }} aria-hidden />
                  <div>
                    <h2 className="text-[21px] leading-snug mb-2" style={{ color: FARBE_DUNKEL }}>
                      {stand.beendetDurch === "bewerber"
                        ? "Danke für deine Offenheit."
                        : "Deine Bewerbung ist abgeschlossen."}
                    </h2>
                    <p className="text-[15px] leading-relaxed" style={{ color: "#5A5F66" }}>
                      Von uns kommt keine weitere Nachricht. Wenn du es dir anders überlegst,
                      schreib uns gern an{" "}
                      <a href="mailto:os@os-immobilien.com" className="underline underline-offset-[3px]" style={{ color: FARBE_BLAU }}>os@os-immobilien.com</a>.
                    </p>
                  </div>
                </div>
              </Karte>
            )}

            {/* ── Eine Frage, ohne Termin ── */}

            {zustand !== "beendet" && !rueckfrage && (
              <Karte>
                <Eyebrow>Eine Frage, ohne Termin</Eyebrow>
                <h2 className="text-[19px] leading-snug mt-2 mb-2" style={{ color: FARBE_DUNKEL }}>
                  Schreib sie auf, du bekommst eine Antwort.
                </h2>
                <p className="text-[14.5px] leading-relaxed mb-3" style={{ color: "#5A5F66" }}>
                  Deine Frage geht an {HR_ANSPRECHPARTNERIN.split(" ")[0]}, mit einer Frist. Ein
                  Anruf kommt nur, wenn du ihn dir ausdrücklich wünschst, und dann mit deinem Thema.
                </p>
                {frageOffenAufklappen ? (
                  <>
                    <label htmlFor="bewerberseite-frage" className="sr-only">Deine Frage</label>
                    <textarea
                      id="bewerberseite-frage"
                      value={frageText}
                      onChange={(e) => setFrageText(e.target.value.slice(0, FRAGE_MAX))}
                      rows={4}
                      className="w-full rounded-2xl border px-4 py-3 text-[15px] leading-relaxed outline-none focus:ring-2"
                      style={{ borderColor: "#E4E6EB", color: FARBE_DUNKEL }}
                      placeholder="Worum geht es?"
                    />
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <Hauptknopf
                        onClick={() => {
                          const geschrieben = frageText.trim();
                          if (geschrieben.length < 3) return;
                          void sende("frage", { text: geschrieben }, "Deine Frage ist angekommen.").then(() => {
                            setFrageText("");
                            setFrageAufklappen(false);
                          });
                        }}
                        disabled={arbeitet || frageText.trim().length < 3}
                        ohnePfeil
                        breit
                      >
                        {arbeitet ? "Wird gesendet …" : "Frage abschicken"}
                      </Hauptknopf>
                      <button
                        type="button"
                        onClick={() => setFrageAufklappen(false)}
                        className="w-full sm:w-auto shrink-0 px-4 text-[14.5px] underline underline-offset-[3px]"
                        style={{ color: "#6E6E73" }}
                      >
                        Doch nicht
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFrageAufklappen(true)}
                    className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-[15px]"
                    style={{ borderColor: "#E4E6EB", color: FARBE_DUNKEL }}
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden /> Frage stellen
                  </button>
                )}
              </Karte>
            )}

            {/* ── Pausieren, selbst gesteuert ── */}

            {(zustand === "eingang" || zustand === "unterbrochen") && (
              <Karte>
                <Eyebrow>Gerade ist nicht der richtige Zeitpunkt?</Eyebrow>
                <h2 className="text-[19px] leading-snug mt-2 mb-2" style={{ color: FARBE_DUNKEL }}>
                  Dann pausier einfach.
                </h2>
                <p className="text-[14.5px] leading-relaxed mb-3" style={{ color: "#5A5F66" }}>
                  Niemand ruft dich an, weil du hier pausiert hast. Eine Pause ist kein fehlendes
                  Interesse, und sie wird auch nicht so gespeichert.
                </p>
                {pauseAufklappen ? (
                  <div className="space-y-2">
                    {PAUSEN_WAHLEN.filter((w) => w.wert !== "beenden").map((w) => (
                      <button
                        key={w.wert}
                        type="button"
                        disabled={arbeitet}
                        onClick={() => {
                          void sende("pause", { wahl: w.wert }, "Deine Pause ist gespeichert.").then(() =>
                            setPauseAufklappen(false),
                          );
                        }}
                        className="w-full rounded-2xl border px-4 py-3 text-left text-[15px] disabled:opacity-50"
                        style={{ borderColor: "#E4E6EB", color: FARBE_DUNKEL }}
                      >
                        {w.titel}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPauseAufklappen(false)}
                      className="w-full text-[14px] underline underline-offset-[3px]"
                      style={{ color: "#6E6E73" }}
                    >
                      Doch nicht
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPauseAufklappen(true)}
                    className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-[15px]"
                    style={{ borderColor: "#E4E6EB", color: FARBE_DUNKEL }}
                  >
                    <Pause className="h-4 w-4" aria-hidden /> Pause wählen
                  </button>
                )}
              </Karte>
            )}
          </div>

          {/* ── Die rechte Spalte ── */}

          <div className="space-y-4">
            <Karte>
              <Eyebrow>Deine Ansprechpartnerin</Eyebrow>
              <p className="text-[19px] mt-2" style={{ color: FARBE_DUNKEL }}>{HR_ANSPRECHPARTNERIN}</p>
              <p className="text-[14px]" style={{ color: "#8A8F98" }}>{BERUF_HR}</p>
              <p className="text-[14.5px] leading-relaxed mt-2.5" style={{ color: "#5A5F66" }}>
                Eine Person, von der ersten Minute bis zu deiner Entscheidung. Schreib ihr direkt an{" "}
                <a href="mailto:os@os-immobilien.com" className="underline underline-offset-[3px]" style={{ color: FARBE_BLAU }}>os@os-immobilien.com</a>,
                das landet nicht in einem Sammelpostfach.
              </p>
            </Karte>

            {/* Wer gerade am Zug ist. Aus dem Vorgang, nicht aus der Stufe. */}
            {amZug === "moreimmo" && (
              <div className="rounded-[20px] sm:rounded-3xl border px-5 py-5 sm:px-6" style={{ background: "#EAF6EE", borderColor: "#CDE8D8" }}>
                <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "#1E7A45" }}>
                  Wer gerade am Zug ist
                </p>
                <p className="text-[19px] leading-snug mt-1.5" style={{ color: FARBE_DUNKEL }}>
                  {amZugTitel(stand)}
                </p>
                <p className="text-[14.5px] leading-relaxed mt-1.5" style={{ color: "#3F5A4A" }}>
                  {amZugText(stand)}
                </p>
              </div>
            )}

            {zustand !== "start" && zustand !== "beendet" && (
              <Karte>
                <Eyebrow>Der Rahmen, schon jetzt nachlesbar</Eyebrow>
                <ul className="mt-2.5 space-y-2">
                  {RAHMEN.map((r) => (
                    <li key={r.titel} className="text-[14.5px] leading-relaxed" style={{ color: "#5A5F66" }}>
                      <span className="font-semibold" style={{ color: FARBE_DUNKEL }}>{r.titel}</span> {r.text}
                    </li>
                  ))}
                </ul>
                {kennenlernenPfad && (
                  <Link
                    to={kennenlernenPfad}
                    className="mt-3 inline-block text-[14.5px] underline underline-offset-[3px]"
                    style={{ color: FARBE_BLAU }}
                  >
                    Alles ausführlich nachlesen
                  </Link>
                )}
              </Karte>
            )}

            {/* Der sechste Stopp: interessiert, aber bitte nicht anrufen. */}
            {(zustand === "eingang" || zustand === "unterbrochen") && (
              <Karte>
                <Eyebrow>Lieber nicht angerufen werden?</Eyebrow>
                {stand.anrufWidersprochen ? (
                  <p className="text-[14.5px] leading-relaxed mt-2" style={{ color: "#5A5F66" }}>
                    Ist vermerkt. Wir melden uns schriftlich, und niemand ruft dich an. An deiner
                    Bewerbung ändert das nichts.
                  </p>
                ) : (
                  <>
                    <p className="text-[14.5px] leading-relaxed mt-2 mb-3" style={{ color: "#5A5F66" }}>
                      Ein Klick, und wir bleiben bei der Schrift. Das ist keine Absage: Deine
                      Bewerbung läuft ganz normal weiter.
                    </p>
                    <button
                      type="button"
                      disabled={arbeitet}
                      onClick={() => void sende("kein_anruf", {}, "Vermerkt. Wir melden uns schriftlich.")}
                      className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-[15px] disabled:opacity-50"
                      style={{ borderColor: "#E4E6EB", color: FARBE_DUNKEL }}
                    >
                      <PhoneOff className="h-4 w-4" aria-hidden /> Bitte nicht anrufen
                    </button>
                  </>
                )}
              </Karte>
            )}

            {zustand !== "beendet" && (
              <div className="rounded-[20px] sm:rounded-3xl border px-5 py-5 sm:px-6" style={{ background: "#FDF3E8", borderColor: "#F3DFC4" }}>
                <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "#A9640F" }}>
                  Und wenn es doch nicht passt
                </p>
                <p className="text-[19px] leading-snug mt-1.5" style={{ color: FARBE_DUNKEL }}>Sag es einfach.</p>
                <p className="text-[14.5px] leading-relaxed mt-1.5 mb-3" style={{ color: "#6B5636" }}>
                  Ein Klick, kein Formular, keine Begründung nötig. Wir melden uns dann nicht mehr,
                  und du kannst dich später jederzeit wieder melden.
                </p>
                {ausstiegAufklappen ? (
                  <div className="space-y-2">
                    <label htmlFor="bewerberseite-grund" className="sr-only">Grund, freiwillig</label>
                    <textarea
                      id="bewerberseite-grund"
                      value={ausstiegGrund}
                      onChange={(e) => setAusstiegGrund(e.target.value.slice(0, GRUND_MAX))}
                      rows={3}
                      className="w-full rounded-2xl border bg-white px-4 py-3 text-[15px] leading-relaxed outline-none"
                      style={{ borderColor: "#F3DFC4", color: FARBE_DUNKEL }}
                      placeholder="Magst du uns kurz sagen, warum? Freiwillig."
                    />
                    <button
                      type="button"
                      disabled={arbeitet}
                      onClick={() => {
                        void sende(
                          "ausstieg",
                          { text: ausstiegGrund.trim() },
                          "Erledigt. Von uns kommt keine weitere Nachricht.",
                        ).then(() => setAusstiegAufklappen(false));
                      }}
                      className="w-full rounded-2xl bg-white border px-4 py-2.5 text-[15px] font-semibold disabled:opacity-50"
                      style={{ borderColor: "#E2C79E", color: "#A9640F" }}
                    >
                      {arbeitet ? "Wird gespeichert …" : "Bewerbung beenden"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAusstiegAufklappen(false)}
                      className="w-full text-[14px] underline underline-offset-[3px]"
                      style={{ color: "#6B5636" }}
                    >
                      Doch weitermachen
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAusstiegAufklappen(true)}
                    className="w-full rounded-2xl bg-white border px-4 py-2.5 text-[15px] font-semibold"
                    style={{ borderColor: "#E2C79E", color: "#A9640F" }}
                  >
                    Kein Interesse mehr
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[12.5px]" style={{ color: "#8A8F98" }}>
          Diese Seite gehört dir. Der Link gilt, bis deine Bewerbung abgeschlossen ist, und das
          Kennenlernen selbst {KENNENLERNEN_GUELTIG_TAGE} Tage ab der Einladung.
        </p>
      </div>
    </Seite>
  );
}

// ───────────────────────────── Bausteine der Seite ────────────────────────

function Seite({ children }: { children: ReactNode }) {
  return (
    <div data-lg="seite" className="lp-theme bewerber-seite min-h-screen relative">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[300px] sm:h-[460px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse 55% 70% at 50% -12%, rgba(24,127,88,.16), transparent 66%)" }}
      />
      <div className="relative px-3.5 pt-4 pb-7 sm:px-6 sm:pt-11 sm:pb-16 flex flex-col items-center">
        {children}
      </div>
    </div>
  );
}

function Karte({ children }: { children: ReactNode }) {
  return (
    <div
      className="bewerber-karte relative w-full max-w-[640px] lg:max-w-none rounded-[20px] sm:rounded-3xl border px-5 py-5 sm:px-7 sm:py-6"
      style={{ background: "#fff", borderColor: "#E4E6EB", boxShadow: "0 24px 70px -34px rgba(15,22,33,.28)" }}
    >
      {children}
    </div>
  );
}

/** Eine der vier Stationen, mit ihrem Stand als Marke rechts. */
function StationsZeile({ station }: { station: Station }) {
  const erledigt = station.stand === "erledigt";
  const dran = station.stand === "dran";
  return (
    <li
      className="flex items-start gap-3 rounded-2xl border px-4 py-3"
      style={{
        background: erledigt ? "#F4FAF6" : dran ? "#F3F8FE" : "#fff",
        borderColor: erledigt ? "#DCEDE3" : dran ? "#C1EEDD" : "#EEF0F3",
      }}
    >
      <span className="shrink-0 mt-0.5">
        {erledigt ? (
          <CheckCircle2 className="h-5 w-5" style={{ color: "#1E9E5A" }} aria-hidden />
        ) : (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ background: dran ? FARBE_BLAU : "#E4E6EB", color: dran ? "#fff" : "#8A8F98" }}
            aria-hidden
          >
            {station.nummer}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-semibold" style={{ color: FARBE_DUNKEL }}>{station.titel}</span>
        <span className="block text-[14.5px] leading-relaxed mt-0.5" style={{ color: "#5A5F66" }}>{station.zeile}</span>
      </span>
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{
          background: erledigt ? "#DCEDE3" : dran ? "#DEEBFA" : "#F1F2F4",
          color: erledigt ? "#1E7A45" : dran ? "#156949" : "#8A8F98",
        }}
      >
        {erledigt ? "erledigt" : dran ? "du bist dran" : "danach"}
      </span>
    </li>
  );
}

// ── Die Texte je Zustand ──────────────────────────────────────────────────

function kopfAugenbraue(zustand: SeitenZustand): string {
  switch (zustand) {
    case "unterbrochen": return "Du hast pausiert, das ist in Ordnung";
    case "termin": return "Dein Videocall steht";
    case "entscheidung": return "Das Gespräch ist gelaufen";
    case "start": return "Willkommen";
    case "beendet": return "Deine Bewerbung";
    default: return "Deine Bewerbung bei OS Immobilien";
  }
}

function kopfTitel(zustand: SeitenZustand, stand: BewerberSeiteStand): string {
  const name = stand.vorname.trim();
  switch (zustand) {
    case "unterbrochen":
      return name ? `${name}, dein Stand ist gespeichert.` : "Dein Stand ist gespeichert.";
    case "termin":
      return "Alles steht, du musst nichts vorbereiten.";
    case "entscheidung":
      return "Jetzt entscheidest du, ohne Frist.";
    case "start":
      return "Dein Vertrag ist unterschrieben.";
    case "beendet":
      return name ? `Alles klar, ${name}.` : "Alles klar.";
    default:
      return name ? `Hallo ${name}, hier steht dein Stand.` : "Hier steht dein Stand.";
  }
}

function kopfText(zustand: SeitenZustand, stand: BewerberSeiteStand): string {
  switch (zustand) {
    case "unterbrochen":
      return "Du entscheidest, wann es weitergeht. Was du beantwortet hast, bleibt erhalten.";
    case "termin":
      return "Die Tagesordnung kommt aus deinen eigenen Angaben. Verschieben und Absagen gehen ohne Rückfrage.";
    case "entscheidung":
      return "Was wir besprochen haben, steht hier. Was als Nächstes passiert, bestimmst du.";
    case "start":
      return "Als Nächstes richten wir deinen Zugang ein. Den Stand siehst du hier.";
    case "beendet":
      return "Deine Bewerbung ist abgeschlossen. Diese Seite bleibt für dich erreichbar.";
    default:
      return stand.kennenlernen.angefangen
        ? "Du hast das Kennenlernen schon begonnen. Mach weiter, wann es dir passt."
        : "Deine Bewerbung ist angekommen. Als Nächstes lernst du die Zusammenarbeit kennen, in deinem Tempo.";
  }
}

function amZugTitel(stand: BewerberSeiteStand): string {
  const vorname = HR_ANSPRECHPARTNERIN.split(" ")[0];
  if (frageOffen(stand.frage)) {
    const bis = alsDatum(stand.frage?.bisAm);
    return bis ? `${vorname}, bis zum ${bis}.` : `${vorname} ist dran.`;
  }
  if (stand.entscheidung?.offenerPunkt?.wer) {
    const p = stand.entscheidung.offenerPunkt;
    return p.bis ? `${p.wer}, bis zum ${alsDatum(p.bis) || p.bis}.` : `${p.wer} ist dran.`;
  }
  return `${vorname} ist dran.`;
}

function amZugText(stand: BewerberSeiteStand): string {
  if (frageOffen(stand.frage)) {
    return `Du hast gefragt: „${stand.frage?.text}“ Die Antwort kommt schriftlich. Du musst nichts tun und nichts nachfassen.`;
  }
  if (stand.entscheidung?.offenerPunkt?.was) {
    return `${stand.entscheidung.offenerPunkt.was} Ein offener Punkt hat immer eine Zuständigkeit und eine Frist. Sonst wartet jede Seite auf die andere.`;
  }
  return "Wir sind gerade dran. Du musst nichts tun und nichts nachfassen.";
}

/** Der Rahmen, wortgleich mit dem Kennenlernen. Keine Zusage, nur Zahlen. */
const RAHMEN: { titel: string; text: string }[] = [
  { titel: "4 Prozent vom Kaufpreis,", text: "rund 12.000 Euro bei 300.000 Euro, vor Kosten und Steuern." },
  { titel: "CRM und Objektunterlagen kosten nichts.", text: "Training, Landingpage, Coaching, Community und Support ebenfalls nicht. Es gibt kein laufendes Entgelt." },
  { titel: "Drei getrennte Zeitachsen", text: "bis zum Geld, keine davon ist eine Zusage." },
  { titel: "Kein Fixgehalt,", text: "Kunden gewinnst du selbst." },
  { titel: "Gewerbe und Erlaubnis", text: "klären wir vor Aufnahme deiner Tätigkeit gemeinsam." },
];

/**
 * Die vier Stationen bis Tag 1, jede mit einem Verantwortlichen.
 *
 * Voraussetzungen statt Kalenderwochen: „Erste Kundenfälle in Woche 2" steht
 * als bedingtes Ziel und nicht als Zusage. Ohne Namen wartet am Ende jeder auf
 * jeden.
 */
const START_STATIONEN: { titel: string; text: string }[] = [
  {
    titel: "Zugang einrichten",
    text: `${HR_ANSPRECHPARTNERIN}. CRM, Objektzugänge und deine OS Immobilien-Adresse.`,
  },
  {
    titel: "Pflichttraining",
    text: "Du, vier Module: Vertriebs-Grundlagen, DSGVO und Compliance, Selbstauskunft-Prozess, Pipeline und Lead-Handling.",
  },
  {
    titel: "Nachweise",
    text: "Du, gemeinsam mit uns. Gewerbeanmeldung, dazu die Erlaubnis nach Paragraf 34c im geklärten Umfang.",
  },
  {
    titel: "Fachliche Freigabe",
    text: "Dein Vertriebsleiter, nach dem ersten begleiteten Gespräch.",
  },
];
