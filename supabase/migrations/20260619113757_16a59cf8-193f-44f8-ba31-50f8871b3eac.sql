UPDATE bewerbungen
SET meta = (meta - 'vertragPdfUrl' - 'vertragVersion' - 'vertragHrName' - 'vertragIndividuell')
        || jsonb_build_object(
             'paketwahl', 'partner_2',
             'zahlungsweise', 'einmal',
             'vertragStatus', 'nicht_gesendet'
           )
WHERE id = '80fc9743-8c49-40aa-95b4-6ffe68ad8ba7';