/**
 * Die Agenda neben dem Handbuch auf der Ergebnisseite (seit dem 26.09.2026).
 *
 * Ab Desktopbreite eine feste Spalte links mit „Deine Angaben“ und dem
 * Inhaltsverzeichnis. Ein Klick springt zum Kapitel, das Kapitel im Blick ist
 * markiert. Schmaler steht beides einklappbar über dem Handbuch. Das PDF
 * kennt diese Spalte nicht, es setzt weiter nur das Handbuch.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Handbuch } from "@/lib/handbuch/bausteine";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";

export interface AgendaEintrag {
  id: string;
  nr: string;
  titel: string;
}

/** Ein Eintrag je Kapitel. Kapitel mit zwei Seiten (6 und 6b) erscheinen einmal. */
export function agendaAusHandbuch(h: Handbuch): AgendaEintrag[] {
  const gesehen = new Set<string>();
  const liste: AgendaEintrag[] = [];
  for (const s of h.seiten) {
    const nr = /^(?:Kapitel|Chapter) (\d+)/.exec(s.kapitel)?.[1] ?? "";
    const schluessel = nr || s.id;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    liste.push({ id: s.id, nr, titel: nr ? s.titel : s.kapitel });
  }
  return liste;
}

/** Welches Kapitel gerade oben im Bild ist. */
function useAktivesKapitel(ids: string[]): string | null {
  const [aktiv, setAktiv] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || ids.length === 0) return;
    const sichtbar = new Map<string, number>();
    const io = new IntersectionObserver(
      (eintraege) => {
        for (const e of eintraege) {
          if (e.isIntersecting) sichtbar.set(e.target.id, e.boundingClientRect.top);
          else sichtbar.delete(e.target.id);
        }
        // Das oberste sichtbare Kapitel gilt.
        const oben = [...sichtbar.entries()].sort((a, b) => a[1] - b[1])[0];
        if (oben) setAktiv(oben[0]);
      },
      { rootMargin: "-90px 0px -55% 0px" },
    );
    // Alle Seiten beobachten, auch die zweite Seite eines Kapitels; sie zählt
    // für dessen ersten Eintrag.
    document.querySelectorAll(".hb-buch-seite").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return aktiv;
}

function Angaben({ paare }: { paare: Array<[string, string]> }) {
  const t = useSeitenTexte(HANDBUCH_SEITEN_TEXTE).agenda;
  return (
    <div className="block">
      <div className="gt">{t.angaben}</div>
      <dl>
        {paare.map(([l, v]) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function Agenda({ handbuch, angaben }: { handbuch: Handbuch; angaben: Array<[string, string]> }) {
  const t = useSeitenTexte(HANDBUCH_SEITEN_TEXTE).agenda;
  const eintraege = useMemo(() => agendaAusHandbuch(handbuch), [handbuch]);
  const ids = useMemo(() => handbuch.seiten.map((s) => s.id), [handbuch]);
  const aktivSeite = useAktivesKapitel(ids);
  // Die zweite Seite eines Kapitels markiert den Kapiteleintrag.
  const aktiv = useMemo(() => {
    if (!aktivSeite) return null;
    if (eintraege.some((e) => e.id === aktivSeite)) return aktivSeite;
    const seite = handbuch.seiten.find((s) => s.id === aktivSeite);
    const nr = seite ? /^(?:Kapitel|Chapter) (\d+)/.exec(seite.kapitel)?.[1] : undefined;
    return eintraege.find((e) => e.nr && e.nr === nr)?.id ?? null;
  }, [aktivSeite, eintraege, handbuch]);

  const liste = (
    <nav aria-label={t.kapitelLabel}>
      {eintraege.map((e) => (
        <a key={e.id} href={`#${e.id}`} aria-current={aktiv === e.id ? "true" : undefined}>
          <span className="n">{e.nr}</span>
          <span>{e.titel}</span>
        </a>
      ))}
    </nav>
  );

  return (
    <>
      <aside className="hb-agenda" aria-label="Agenda">
        <Angaben paare={angaben} />
        <div className="block">
          <div className="gt">{t.inhalt}</div>
          {liste}
        </div>
      </aside>
      <details className="hb-agenda-handy">
        <summary>
          {t.beides} <ChevronDown aria-hidden="true" />
        </summary>
        <div className="innen">
          <Angaben paare={angaben} />
          <div className="block">{liste}</div>
        </div>
      </details>
    </>
  );
}
