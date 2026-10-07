-- ===========================================================================
-- Weekly Sales Call: beliebige Anhaenge erlauben
-- ===========================================================================
--
-- Bisher nahm der Ablageordner "weekly-call" nur PDF und reinen Text an, weil
-- dort ausschliesslich Transkript oder Zusammenfassung landeten. Zu einem Call
-- gehoeren aber auch Folien, Tabellen und Bilder. Die Liste der erlaubten
-- Dateiarten wird deshalb erweitert.
--
-- Eine eigene Tabelle braucht es nicht: Die Anhaenge liegen unter
-- "<Calltermin>/anhaenge/" im selben Ordner und werden von dort gelesen.
-- Solange diese Migration nicht gelaufen ist, funktionieren nur PDF und Text.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'application/pdf',
      'text/plain',
      'text/csv',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip'
    ]
WHERE id = 'weekly-call';
