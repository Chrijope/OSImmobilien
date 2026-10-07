UPDATE storage.buckets SET public = true WHERE id = 'unterlagen';
-- academy und avatars bleiben privat, da wir diese in 1b ohnehin auf signed URLs umstellen
-- und sie aktuell weniger genutzt sind.