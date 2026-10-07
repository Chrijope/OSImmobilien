# Die dreizehn Abteilungen als Agenten

Jede Persona aus dem Personas-Projekt liegt hier als eigene Agentendefinition.
Damit lässt sie sich in Claude Code direkt ansprechen, im Quellcodeverzeichnis
des CRM, wo sie nachsehen kann, statt zu vermuten.

## Wie du sie ansprichst

Am einfachsten über den Namen im Satz, also „frag die Vertriebsleitung, warum
die Conversion in Stufe 4 fällt" oder „lass die Technik nachsehen, ob die Zahl
auf der Kalenderseite echt ist". Claude Code sucht anhand der Beschreibung im
Frontmatter den passenden Agenten aus und startet ihn. Wenn du eine bestimmte
Person willst, nenn sie beim Dateinamen, etwa `controlling` oder
`hr-management`. Jeder Agent startet mit leerem Gedächtnis: Was er wissen soll,
muss in deiner Frage stehen oder im Projekt nachlesbar sein.

Alle dreizehn arbeiten nach derselben Regel: Sie ändern nichts. Kein Code, keine
Migration, kein Commit. Sie sehen nach und legen dir einen Vorschlag vor.

## Die Besetzung

| Datei | Name | Floor | Wofür man sie ruft | Werkzeuge |
|---|---|---|---|---|
| `assistenz-geschaeftsleitung.md` | Charlotte Renner, AGL | Leitung | Lagebild aus vielen Meldungen, Erinnerung an frühere Entscheidungen, Vorlage für eine Entscheidung | Read, Grep, Glob |
| `operative-leitung.md` | Miriam Falk, OPS | Leitung | Vorgänge, die zwischen zwei Schritten liegen bleiben, Wartezeiten, Fristen, Nahtstellen | Read, Grep, Glob |
| `vertriebsleitung.md` | Daniel Reuter, VL | Leitung | Conversion je Stufe und je Partner, Leadquellen, Datenqualität der Kontakte | Read, Grep, Glob |
| `technik.md` | Nils Haverkamp, TEC | Leitung | Wird eine Zahl überhaupt erhoben, stille Fehler, doppelte Wahrheiten, tatsächlicher Stand im Code | Bash, Read, Grep, Glob |
| `hr-management.md` | Jana Kirchner, HR | Menschen | Bewerber, Antwortzeiten, Bewerbertrichter, Stellenanzeigen, Einstieg neuer Partner | Read, Grep, Glob |
| `vertriebsakademie.md` | Markus Thelen, VA | Menschen | Lerninhalte aus echten Verlustgründen, Einarbeitung, Wiederholung, Wirkung eines Trainings | Read, Glob |
| `verkaufstraining.md` | Kai Berger, ST | Menschen | Die Stelle im Gespräch, an der es kippt, Einwandbehandlung, Leitfäden, Formulierungen | Read, Glob |
| `marketing.md` | Lena Brandt, MKT | Markt | Formate und Serien, Kampagnenkennung, Reichweite, Leadquellen aus dem Marketing | Read, Glob |
| `objektmanagement.md` | Tobias Ammann, OBJ | Markt | Objekte nach Lage und Bewirtschaftung, Vollständigkeit der Objektdaten, Renditeangaben | Read, Grep, Glob |
| `backoffice.md` | Nadine Ostermann, BO | Abwicklung | Reservierung, fehlende Unterlagen, Fristen, alles bis zum Notartermin | Read, Grep, Glob |
| `finanzierung.md` | Fabian Kortmann, FIN | Abwicklung | Bonität, Selbstauskunft, Vollständigkeit der Akte, Finanzierungspartner | Read, Grep, Glob |
| `aftersales.md` | Sophie Lindner, AS | Abwicklung | Bestandskunden nach dem Notartermin, Zweitabschluss, Zinsbindung, Betreuungsanlässe | Read, Grep, Glob |
| `controlling.md` | Ines Kowalski, CTR | Zahlen | Umsatz, Provisionen, Abgrenzung, Abrechnung, Vergleich mit der Vorperiode | Read, Grep, Glob |
| `sparring.md` | Georg Wiesner, SPR | Leitung | Pläne, Annahmen und Entscheidungen gegen den Strich lesen, Pre-Mortem, Vorlage mit Prüfpunkt; Pflicht vor schwer umkehrbaren Entscheidungen | Read, Grep, Glob, Modell Opus 5.5 |

Daneben liegt weiterhin `sicherheitspruefer.md`. Der gehört nicht zu den
Personas, sondern prüft Änderungen auf Sicherheitslücken.

## Warum die Werkzeuge so verteilt sind

Keine Persona darf schreiben. Weder `Edit` noch `Write` steht in einem
Frontmatter, damit niemand am Quellcode etwas verändert. Vorschlagen ja, ändern
nein.

Darüber hinaus gibt es drei Stufen:

- **Nils Haverkamp** hat zusätzlich `Bash`. Er soll den Zustand des Systems
  belegen können, also den Änderungsstand ansehen, die Typprüfung oder die Tests
  laufen lassen und nachzählen. Ohne Ausführen wäre sein Befund wieder nur eine
  Behauptung.
- **Neun Abteilungen mit Zahlenverantwortung** haben `Read, Grep, Glob`. Sie
  müssen eine Kennzahl bis zu ihrer Quelle verfolgen können, und dafür braucht es
  die Volltextsuche über den Quellcode.
- **Marketing, Vertriebsakademie und Verkaufstraining** haben `Read, Glob`. Sie
  beraten und texten. Eine bestimmte Datei öffnen und Dateien nach Namen finden
  reicht dafür. Wer aus dieser Gruppe eine Auskunft aus dem Code braucht, gibt
  sie über den Übergabeweg an die Technik.

Anders als beim `sicherheitspruefer` steht in keiner der dreizehn Dateien ein
`model`-Eintrag. Damit laufen sie mit dem Modell, das in der Sitzung ohnehin
eingestellt ist. Wenn eine Persona ausdrücklich das große Modell bekommen soll,
genügt eine Zeile `model: opus` im Frontmatter.

## Was in jeder Datei steht

1. Frontmatter mit `name`, `description` und `tools`.
2. Ein kurzer Vorspann, der den Ort erklärt: Claude Code im Quellcodeverzeichnis,
   nachsehen statt vermuten, nichts ändern.
3. Der vollständige Persona-Prompt, ungekürzt.
4. Die drei Kernbausteine der Hausordnung: die Vorbehalte, die
   Redlichkeitsregeln und das Berichtsformat.

Die vollständige Hausordnung mit allen acht Bausteinen liegt im Persona-Ordner
unter `personas/prompts/00_Hausordnung.md` und ist nicht Teil dieses
Verzeichnisses.
