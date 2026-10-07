/**
 * Das persönliche Immobilienhandbuch als Seite im Browser.
 *
 * Zeichnet dieselbe Struktur, die auch das PDF setzt (`inhalt.ts`). Jede
 * Handbuch-Seite ist ein Abschnitt mit eigener Sprungmarke; das
 * Inhaltsverzeichnis verlinkt dorthin.
 */
import type { CSSProperties } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Block, Handbuch } from "@/lib/handbuch/bausteine";
import { Diagramm, Symbol } from "./teile";

const WEG_FARBEN = ["#0F1621", "#0467A9", "#087CC9"];
const TRICHTER_FARBEN = ["#0F1621", "#073150", "#0467A9", "#087CC9", "#3D8FE6"];

/** Die zwei festen Wörter der Ansicht, nach der Sprache des Handbuchs. */
const FEST = {
  de: { fuer: "Für", inhalt: "Inhalt des Handbuchs" },
  en: { fuer: "For", inhalt: "Handbook contents" },
};

function BlockAnsicht({ b, onSaStart, en }: { b: Block; onSaStart?: () => void; en?: boolean }) {
  const fest = en ? FEST.en : FEST.de;
  switch (b.typ) {
    case "lead":
      return <p className="lead">{b.text}</p>;
    case "absatz":
      return <p className="absatz">{b.text}</p>;
    case "h2":
      return <h3 className="h2">{b.text}</h3>;
    case "fussnote":
      return <p className="fn">{b.text}</p>;
    case "liste":
      return (
        <ul className="liste">
          {b.punkte.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      );
    case "karten":
      return (
        <div className={`hb-bk-karten s${b.spalten}`}>
          {b.karten.map((k) => (
            <div className="hb-bk-karte" key={k.titel}>
              {k.symbol && (
                <div className="sym">
                  <Symbol name={k.symbol} />
                </div>
              )}
              <b>{k.titel}</b>
              <span>{k.text}</span>
            </div>
          ))}
        </div>
      );
    case "kasten":
      return (
        <div className={`hb-kasten ${b.ton}`}>
          <div className="kl">{b.titel}</div>
          <p>{b.text}</p>
        </div>
      );
    case "grafik":
      return (
        <figure className="hb-bk-grafik" style={{ margin: "18px 0" }}>
          {b.titel && <div className="gt">{b.titel}</div>}
          {b.untertitel && <div className="gu">{b.untertitel}</div>}
          <Diagramm className="zeichnung" zeichnung={b.zeichnung} />
        </figure>
      );
    case "tabelle": {
      const rechts = (i: number) => b.rechtsAb !== undefined && i >= b.rechtsAb;
      return (
        <div>
          {b.titel && <div className="hb-tabelle-titel">{b.titel}</div>}
          <div className="hb-tabelle-rahmen">
            <table className="hb-tabelle">
              {b.kopf && (
                <thead>
                  <tr>
                    {b.kopf.map((k, i) => (
                      <th key={k} className={rechts(i) ? "r" : ""}>
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {b.zeilen.map((z, zi) => (
                  <tr key={zi} className={z.summe ? "summe" : z.hervor ? "hervor" : ""}>
                    {z.zellen.map((c, i) => (
                      <td key={i} className={[rechts(i) ? "r" : "", z.toene?.[i] ?? ""].join(" ").trim()}>
                        {i === 0 && b.kopf && b.kopf.length === 3 ? <b>{c}</b> : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    case "weg":
      return (
        <div className="hb-bk-weg">
          {b.schritte.flatMap((s, i) => {
            const teile = [
              <div className="st" key={s.titel}>
                <div className="n" style={{ background: WEG_FARBEN[i % 3] }}>
                  {i + 1}
                </div>
                <b>{s.titel}</b>
                <span>{s.text}</span>
              </div>,
            ];
            if (i < b.schritte.length - 1) {
              teile.push(
                <div className="pf" key={`pf${i}`} aria-hidden="true">
                  <ArrowRight />
                </div>,
              );
            }
            return teile;
          })}
        </div>
      );
    case "vergleich":
      return (
        <div className="hb-bk-vergleich">
          <div className="sp alt">
            <div className="kl">{b.links.titel}</div>
            {b.links.punkte.map((p) => (
              <div className="p" key={p}>
                <X aria-hidden="true" />
                {p}
              </div>
            ))}
          </div>
          <div className="sp neu">
            <div className="kl">{b.rechts.titel}</div>
            {b.rechts.punkte.map((p) => (
              <div className="p" key={p}>
                <Check aria-hidden="true" />
                {p}
              </div>
            ))}
          </div>
        </div>
      );
    case "prozess":
      return (
        <div className="hb-bk-prozess">
          {b.schritte.map((s) => (
            <div className="pz" key={s.titel}>
              <div className="pk">
                <Symbol name={s.symbol} />
              </div>
              <b>{s.titel}</b>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      );
    case "trichter":
      return (
        <div className="hb-bk-trichter">
          {b.stufen.map((s, i) => (
            <div className="tr" key={s.titel}>
              {/* Die Breite rechnet das CSS aus der Stufe, am Handy anders als am Desktop. */}
              <div className="bal" style={{ "--hb-stufe": i, background: TRICHTER_FARBEN[i % 5] } as CSSProperties}>
                {s.titel}
              </div>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      );
    case "zeitstrahl":
      return (
        <div className="hb-bk-zeit">
          {b.eintraege.map((e) => (
            <div className="zs" key={e.titel}>
              <div className="pk">
                <Symbol name={e.symbol} />
              </div>
              <div className="d">
                {e.marke}
                <b>{e.titel}</b>
              </div>
              <div className="x">{e.text}</div>
            </div>
          ))}
        </div>
      );
    case "checkliste":
      return (
        <div>
          <div className="hb-tabelle-titel">{b.titel}</div>
          <ul className="hb-bk-check">
            {b.punkte.map((p) => (
              <li key={p.text}>
                <span className="bx" aria-hidden="true" />
                <span>
                  {p.text}
                  {p.optional && <span className="opt">optional</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "zahlen":
      return (
        <div className="hb-bk-zahlen">
          {b.werte.map((w) => (
            <div key={w.text}>
              <b>{w.wert}</b>
              <span>{w.text}</span>
            </div>
          ))}
        </div>
      );
    case "angaben":
      return (
        <div className="hb-bk-angaben">
          <div className="gt">{b.titel}</div>
          <div className="raster">
            {b.paare.map(([l, v]) => (
              <div key={l}>
                <span>{l}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
          {b.hinweis && (
            <p className="fn" style={{ marginTop: 10, marginBottom: 0 }}>
              {b.hinweis}
            </p>
          )}
        </div>
      );
    case "inhalt":
      return (
        <nav className="hb-bk-inhalt" aria-label={fest.inhalt}>
          {b.eintraege.map((e) => (
            <a key={e.seitenId} href={`#${e.seitenId}`}>
              <span className="n">{e.nr}</span>
              <span>{e.titel}</span>
            </a>
          ))}
        </nav>
      );
    case "portal":
      return (
        <div className="hb-bk-portal">
          <div className="hb-tabelle-titel" style={{ marginTop: 0 }}>
            {b.titel}
          </div>
          {b.zeilen.map((z) => (
            <div className="zeile" key={z.text}>
              <span>{z.text}</span>
              <span className={`hb-status ${z.ton}`}>{z.status}</span>
            </div>
          ))}
          <p className="fn" style={{ marginTop: 10, marginBottom: 0 }}>
            {b.hinweis}
          </p>
        </div>
      );
    case "naechsterSchritt":
      return (
        <div className="hb-bk-naechster">
          <div>
            <div className="fuer">
              {fest.fuer} {b.fuer}
            </div>
            <h3>{b.titel}</h3>
            <p>{b.text}</p>
            {b.link ? (
              <a className="hb-knopf hb-orange" href={b.link} onClick={onSaStart}>
                {b.knopf} <ArrowRight aria-hidden="true" />
              </a>
            ) : (
              <p style={{ marginBottom: 0 }}>{b.ersatz}</p>
            )}
          </div>
          {b.link && (
            <div className="qr" aria-hidden="true">
              <QRCodeSVG value={b.link} size={124} level="M" marginSize={0} />
            </div>
          )}
        </div>
      );
    case "zweispaltig":
      return (
        <div className="hb-bk-zwei">
          <div>
            {b.links.map((x, i) => (
              <BlockAnsicht key={i} b={x} onSaStart={onSaStart} en={en} />
            ))}
          </div>
          <div>
            {b.rechts.map((x, i) => (
              <BlockAnsicht key={i} b={x} onSaStart={onSaStart} en={en} />
            ))}
          </div>
        </div>
      );
  }
}

export default function HandbuchAnsicht({ handbuch, onSaStart }: { handbuch: Handbuch; onSaStart?: () => void }) {
  return (
    <div className="hb-buch">
      {handbuch.seiten.map((s) => (
        <section className="hb-buch-seite" id={s.id} key={s.id} aria-labelledby={`${s.id}-titel`}>
          <div className="kap">{s.kapitel}</div>
          <h2 className="titel" id={`${s.id}-titel`}>
            {s.titel}
          </h2>
          {s.bloecke.map((b, i) => (
            <BlockAnsicht key={i} b={b} onSaStart={onSaStart} en={handbuch.sprache === "en"} />
          ))}
        </section>
      ))}
    </div>
  );
}
