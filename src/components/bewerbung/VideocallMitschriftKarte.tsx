/**
 * Was im persönlichen Gespräch mitgeschrieben wurde, zum Nachlesen in der Akte.
 *
 * Die Moderation erfasst seit jeher vier Listen und seit dem 08.09.2026 eine
 * freie Notiz über alle Folien hinweg. Gelesen wurde davon bisher nichts: Der
 * Reiter Videocall zeigte den Gesprächsstand nur als Entscheidung und Wunsch,
 * die Mitschrift selbst stand nirgends. Ein Text, den niemand wiederfindet,
 * ist verlorene Arbeit, deshalb steht sie hier.
 *
 * Nur lesen, nicht ändern: Geschrieben wird im Gespräch, in der Moderation.
 */
import { Card } from "@/components/ui/card";
import type { VideocallErfassung } from "@/lib/bewerberVideocall";
import { notizLesen } from "@/lib/videocallNotiz";

const LISTEN: { key: "geklaert" | "nachreichen" | "beobachtungen" | "absprachen"; titel: string }[] = [
  { key: "geklaert", titel: "Geklärt" },
  { key: "nachreichen", titel: "Nachreichen" },
  { key: "beobachtungen", titel: "Beobachtung, arbeitsbezogen" },
  { key: "absprachen", titel: "Absprache" },
];

function liste(erfassung: VideocallErfassung, key: keyof VideocallErfassung): string[] {
  const wert = erfassung[key];
  return Array.isArray(wert) ? (wert as string[]) : [];
}

/** Ob es überhaupt etwas nachzulesen gibt. */
function hatMitschrift(erfassung: VideocallErfassung): boolean {
  return (
    notizLesen(erfassung).trim() !== "" ||
    LISTEN.some((l) => liste(erfassung, l.key).length > 0)
  );
}

export function VideocallMitschriftKarte({
  erfassung,
  ohneNotiz = false,
}: {
  erfassung: VideocallErfassung;
  /** Die Notiz steht schon im Eingabefeld darüber, dann hier nicht doppelt. */
  ohneNotiz?: boolean;
}) {
  const notiz = ohneNotiz ? "" : notizLesen(erfassung).trim();
  if (!hatMitschrift(erfassung) || (ohneNotiz && LISTEN.every((l) => liste(erfassung, l.key).length === 0))) return null;

  return (
    <Card className="p-4 space-y-3" data-testid="videocall-mitschrift">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Aus dem Gespräch
      </p>

      {notiz && (
        <div>
          <p className="text-xs font-semibold">Notiz zum Gespräch</p>
          {/* Zeilenumbrüche stehen im Text, auch die Folienmarken. Deshalb
              wird er so gezeigt, wie er getippt wurde. */}
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed" data-testid="videocall-notiz">
            {notiz}
          </p>
        </div>
      )}

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {LISTEN.map((l) => {
          const eintraege = liste(erfassung, l.key);
          if (eintraege.length === 0) return null;
          return (
            <div key={l.key}>
              <p className="text-xs font-semibold">{l.titel}</p>
              <ul className="mt-1 space-y-1">
                {eintraege.map((e, i) => (
                  <li key={i} className="text-xs leading-snug text-muted-foreground">{e}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
