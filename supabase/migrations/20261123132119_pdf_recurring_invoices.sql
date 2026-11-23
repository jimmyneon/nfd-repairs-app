-- Additive, server-only billing records. Existing jobs and payment flows are unchanged.
CREATE TABLE public.billing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.billing_settings(id,data) VALUES(true,'{"business_name":"New Forest Device Repairs","legal_name":"John Hopwood trading as New Forest Device Repairs","address":"5A New Street\nLymington\nHampshire\nSO41 9BH","email":"nfdrepairs@gmail.com","website":"https://nfdr.uk","bank_name":"","account_name":"","sort_code":"","account_number":"","payment_instructions":"","footer":"Thank you for your business."}');
CREATE SEQUENCE public.billing_invoice_numbers;
CREATE TABLE public.billing_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  template jsonb NOT NULL,
  next_date date NOT NULL,
  anchor_day integer NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
  ends_on date,
  active boolean NOT NULL DEFAULT false,
  auto_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void')),
  payload jsonb NOT NULL,
  job_id uuid UNIQUE REFERENCES public.jobs(id) ON DELETE RESTRICT,
  series_id uuid REFERENCES public.billing_series(id) ON DELETE RESTRICT,
  occurrence_date date,
  public_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  paid_pence bigint NOT NULL DEFAULT 0 CHECK (paid_pence >= 0 AND paid_pence <= 100000000),
  sent_at timestamptz,
  email_error text,
  email_lock_until timestamptz,
  email_attempt_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(series_id,occurrence_date),
  CHECK ((status = 'draft' AND number IS NULL) OR (status <> 'draft' AND number IS NOT NULL))
);
CREATE INDEX billing_invoices_created ON public.billing_invoices(created_at DESC);
CREATE INDEX billing_series_due ON public.billing_series(next_date) WHERE active;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_settings, public.billing_series, public.billing_invoices FROM anon, authenticated;
GRANT ALL ON public.billing_settings, public.billing_series, public.billing_invoices TO service_role;
REVOKE ALL ON SEQUENCE public.billing_invoice_numbers FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.billing_invoice_numbers TO service_role;

CREATE FUNCTION public.billing_save_invoice(p_id uuid,p_payload jsonb,p_issue boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_id uuid; v_status text; v_settings jsonb;
BEGIN
  IF length(trim(coalesce(p_payload->>'customer_name',''))) = 0
    OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Customer and item lines required';
  END IF;
  SELECT data INTO STRICT v_settings FROM public.billing_settings WHERE id;
  IF p_issue AND p_payload->>'payment_method' = 'bank_transfer' AND (
    coalesce(v_settings->>'account_name','') = '' OR
    coalesce(v_settings->>'sort_code','') !~ '^\d{2}-?\d{2}-?\d{2}$' OR
    coalesce(v_settings->>'account_number','') !~ '^\d{8}$') THEN
    RAISE EXCEPTION 'Add bank account details before issuing';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT status INTO STRICT v_status FROM public.billing_invoices WHERE id=p_id FOR UPDATE;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'Issued invoices cannot be edited'; END IF;
    v_id:=p_id;
    UPDATE public.billing_invoices SET payload=p_payload || jsonb_build_object('seller',v_settings),
      status=CASE WHEN p_issue THEN 'issued' ELSE 'draft' END,
      number=CASE WHEN p_issue THEN 'NFDR-' || lpad(nextval('public.billing_invoice_numbers')::text,6,'0') ELSE NULL END
      WHERE id=v_id;
  ELSE
    INSERT INTO public.billing_invoices(payload,status,number)
    VALUES(p_payload || jsonb_build_object('seller',v_settings),CASE WHEN p_issue THEN 'issued' ELSE 'draft' END,
      CASE WHEN p_issue THEN 'NFDR-' || lpad(nextval('public.billing_invoice_numbers')::text,6,'0') ELSE NULL END)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

-- Serialise on the job row so repeated tracking visits produce one stable invoice.
CREATE FUNCTION public.billing_job_invoice(p_job_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j public.jobs; v_id uuid; v_date text; v_payload jsonb;
BEGIN
  SELECT * INTO STRICT j FROM public.jobs WHERE id=p_job_id FOR UPDATE;
  SELECT id INTO v_id FROM public.billing_invoices WHERE job_id=j.id;
  IF FOUND THEN RETURN v_id; END IF;
  IF j.status NOT IN ('READY_TO_COLLECT','IN_STORAGE','COLLECTED','COMPLETED') OR j.price_total IS NULL OR j.price_total < 0 THEN RETURN NULL; END IF;
  v_date:=((now() AT TIME ZONE 'Europe/London')::date)::text;
  v_payload:=jsonb_build_object(
    'customer_name',j.customer_name,'customer_email',coalesce(j.customer_email,''),'customer_address','',
    'title','Device repair','reference',j.job_ref,'issue_date',v_date,'due_date',v_date,
    'items',jsonb_build_array(jsonb_build_object('description',trim(concat_ws(' ',j.device_make,j.device_model)) || ' — device repair','quantity',1,'unit_pence',round(j.price_total*100))),
    'notes','','payment_method','in_shop','payment_instructions','Please pay in the shop or using the payment arrangements already provided. If you have already paid, thank you.');
  v_id:=public.billing_save_invoice(NULL,v_payload,true);
  UPDATE public.billing_invoices SET job_id=j.id WHERE id=v_id;
  RETURN v_id;
END; $$;

-- One monthly occurrence per schedule/date. Preserve the chosen day across short months.
CREATE FUNCTION public.billing_generate_occurrence(p_series_id uuid,p_today date)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.billing_series; v_id uuid; v_payload jsonb; v_next date; v_end date; v_days integer; v_period_days integer; v_label text; v_items jsonb;
BEGIN
  SELECT * INTO STRICT s FROM public.billing_series WHERE id=p_series_id FOR UPDATE;
  IF NOT s.active OR s.next_date > p_today THEN RETURN NULL; END IF;
  IF s.ends_on IS NOT NULL AND s.next_date > s.ends_on THEN
    UPDATE public.billing_series SET active=false WHERE id=s.id; RETURN NULL;
  END IF;
  v_next:=((date_trunc('month',s.next_date) + interval '1 month')::date +
    (least(s.anchor_day,extract(day FROM date_trunc('month',s.next_date) + interval '2 months - 1 day')::integer)-1));
  v_end:=least(v_next-1,coalesce(s.ends_on,v_next-1));
  v_days:=v_end-s.next_date+1; v_period_days:=v_next-s.next_date;
  v_label:=to_char(s.next_date,'DD Mon YYYY') || ' to ' || to_char(v_end,'DD Mon YYYY');
  SELECT jsonb_agg(item || jsonb_build_object('description',replace(item->>'description','{period}',v_label),
    'unit_pence',CASE WHEN v_days < v_period_days THEN round((item->>'unit_pence')::numeric*v_days/v_period_days) ELSE (item->>'unit_pence')::numeric END))
    INTO v_items FROM jsonb_array_elements(s.template->'items') item;
  v_payload:=s.template || jsonb_build_object('issue_date',s.next_date::text,'due_date',s.next_date::text,
    'period_start',s.next_date::text,'period_end',v_end::text,'items',v_items);
  SELECT id INTO v_id FROM public.billing_invoices WHERE series_id=s.id AND occurrence_date=s.next_date;
  IF NOT FOUND THEN
    v_id:=public.billing_save_invoice(NULL,v_payload,true);
    UPDATE public.billing_invoices SET series_id=s.id,occurrence_date=s.next_date WHERE id=v_id;
  END IF;
  UPDATE public.billing_series SET next_date=v_next,
    active=CASE WHEN ends_on IS NOT NULL AND v_next>ends_on THEN false ELSE active END WHERE id=s.id;
  RETURN v_id;
END; $$;

-- Atomic short lease prevents simultaneous email sends. Keep one idempotency key
-- for a failed/uncertain first delivery; manual resends start a separate attempt.
CREATE FUNCTION public.billing_claim_email(p_id uuid,p_resend boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE i public.billing_invoices;
BEGIN
  SELECT * INTO STRICT i FROM public.billing_invoices WHERE id=p_id FOR UPDATE;
  IF i.status <> 'issued' OR i.email_lock_until > now() OR (i.sent_at IS NOT NULL AND NOT p_resend) THEN RETURN false; END IF;
  UPDATE public.billing_invoices SET email_lock_until=now()+interval '5 minutes',
    email_attempt_started_at=CASE WHEN i.sent_at IS NOT NULL AND p_resend THEN now() ELSE coalesce(i.email_attempt_started_at,now()) END
    WHERE id=p_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.billing_save_invoice(uuid,jsonb,boolean), public.billing_job_invoice(uuid), public.billing_generate_occurrence(uuid,date), public.billing_claim_email(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billing_save_invoice(uuid,jsonb,boolean), public.billing_job_invoice(uuid), public.billing_generate_occurrence(uuid,date), public.billing_claim_email(uuid,boolean) TO service_role;
