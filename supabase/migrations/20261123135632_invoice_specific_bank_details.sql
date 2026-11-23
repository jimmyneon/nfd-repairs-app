-- Per-invoice bank details stay with that invoice or recurring template.
CREATE OR REPLACE FUNCTION public.billing_save_invoice(p_id uuid,p_payload jsonb,p_issue boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_id uuid; v_status text; v_settings jsonb; v_account jsonb;
BEGIN
  IF length(trim(coalesce(p_payload->>'customer_name',''))) = 0
    OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Customer and item lines required';
  END IF;
  SELECT data INTO STRICT v_settings FROM public.billing_settings WHERE id;
  v_account:=coalesce(p_payload->'bank_account',v_settings);
  IF p_issue AND p_payload->>'payment_method' = 'bank_transfer' AND (
    coalesce(v_account->>'account_name','') = '' OR
    coalesce(v_account->>'sort_code','') !~ '^\d{2}-?\d{2}-?\d{2}$' OR
    coalesce(v_account->>'account_number','') !~ '^\d{8}$') THEN
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


REVOKE ALL ON FUNCTION public.billing_save_invoice(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billing_save_invoice(uuid,jsonb,boolean) TO service_role;
