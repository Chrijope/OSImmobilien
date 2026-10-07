update public.kontakte
set status = 'kontaktiert',
    meta = (meta - 'verlorenGrund' - 'verlorenAm' - 'archivGrund')
           || jsonb_build_object('pipelineStufe','selbstauskunft'),
    archiviert = false
where id = '50c93f35-06d8-4132-9d0c-242e34737780';