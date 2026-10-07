-- Aufgaben am Kunden für alle internen Rollen sichtbar machen.
--
-- Ausgangslage: Eine Aufgabe war bisher nur für den Ersteller und den
-- Zugewiesenen lesbar. In der Pipeline hat das dazu geführt, dass die Kachel
-- eines Kunden den vereinbarten Termin eines Kollegen nicht kennt und
-- stattdessen ein veraltetes Datum anzeigt. Wer auf denselben Kunden schaut,
-- muss denselben nächsten Kontakt sehen.
--
-- Geändert wird nur das Lesen, und nur für Aufgaben, die an einem Kontakt
-- hängen. Persönliche Aufgaben ohne Kontaktbezug bleiben privat.
-- Ändern und Erledigen bleibt beim Ersteller und beim Zugewiesenen.

CREATE POLICY "Interne Rollen sehen Aufgaben am Kunden"
  ON public.aufgaben FOR SELECT TO authenticated
  USING (kontakt_id IS NOT NULL AND public.is_internal_role(auth.uid()));

-- Auslöser-Schlüssel: Automatisch erzeugte Aufgaben tragen den Grund, aus dem
-- sie entstanden sind, etwa "notarfoto:24h:<investment>". Damit lassen sie
-- sich eindeutig wiedererkennen (keine Dubletten) und wieder schließen,
-- sobald der Grund entfallen ist. Manuelle Aufgaben lassen das Feld leer.
ALTER TABLE public.aufgaben
  ADD COLUMN IF NOT EXISTS ausloeser_schluessel TEXT;

-- Wer die Aufgabe gestellt hat, im Klartext. Bei einer Zuweisung soll der
-- Empfänger sehen, von wem sie kommt, ohne dafür Profile nachladen zu müssen.
ALTER TABLE public.aufgaben
  ADD COLUMN IF NOT EXISTS erstellt_von_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS aufgaben_ausloeser_offen_idx
  ON public.aufgaben (zugewiesen_an, ausloeser_schluessel)
  WHERE ausloeser_schluessel IS NOT NULL AND status <> 'erledigt';

-- Häufigster Zugriff: alle offenen Aufgaben eines Kontakts.
CREATE INDEX IF NOT EXISTS aufgaben_kontakt_status_idx
  ON public.aufgaben (kontakt_id, status, faellig_am);

-- Zweithäufigster: meine offenen Aufgaben für die Inbox.
CREATE INDEX IF NOT EXISTS aufgaben_zugewiesen_status_idx
  ON public.aufgaben (zugewiesen_an, status, faellig_am);
