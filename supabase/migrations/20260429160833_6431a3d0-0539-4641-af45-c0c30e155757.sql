UPDATE kontakte
SET meta = (meta - 'setter' - 'setterId' - 'setterName')
WHERE meta->>'setterId' = '594947c5-322e-478e-be92-8c63cc31fcbe'
  AND meta->>'erstelltVonId' IS NOT NULL
  AND meta->>'erstelltVonId' != '594947c5-322e-478e-be92-8c63cc31fcbe'
  AND geloescht = false;