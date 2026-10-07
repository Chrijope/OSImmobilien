
-- Create helper functions
CREATE OR REPLACE FUNCTION public.is_internal_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'inhaber', 'vertriebsleiter', 'vertriebspartner',
                   'hausverwaltung', 'backoffice', 'buchhaltung', 'marketing',
                   'hr', 'setterin', 'objektpartner', 'finanzierungspartner',
                   'individuell', 'testaccount')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'inhaber')
  )
$$;

-- Fix search_path on existing functions
CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT msg_id, read_ct, message FROM pgmq.read(queue_name, vt, batch_size); $$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT pgmq.delete(queue_name, message_id); $$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$ DECLARE new_id BIGINT; BEGIN SELECT pgmq.send(dlq_name, payload) INTO new_id; PERFORM pgmq.delete(source_queue, message_id); RETURN new_id; END; $$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT pgmq.send(queue_name, payload); $$;
