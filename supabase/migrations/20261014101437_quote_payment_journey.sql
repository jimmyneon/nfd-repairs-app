-- Review/apply only as part of the coordinated release. No production data is changed by the PR.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS quote_version integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS quote_accepted_version integer, ADD COLUMN IF NOT EXISTS quote_confirmed_at timestamptz,
 ADD COLUMN IF NOT EXISTS quote_snapshot jsonb, ADD COLUMN IF NOT EXISTS part_option text,
 ADD COLUMN IF NOT EXISTS confirmation_notes text, ADD COLUMN IF NOT EXISTS customer_response text;
ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS quote_version integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS quote_accepted_version integer, ADD COLUMN IF NOT EXISTS quote_confirmed_at timestamptz,
 ADD COLUMN IF NOT EXISTS quote_snapshot jsonb, ADD COLUMN IF NOT EXISTS price_verified boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS customer_response text, ADD COLUMN IF NOT EXISTS price_confirmation_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_kind_check CHECK(kind IN ('job_deposit','job_payment','enquiry_deposit','enquiry_payment','remote_support','fund_topup','fund_redemption','manual_deposit','manual_payment'));
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK(status IN ('creating','open','paid','expired','failed','refunded'));
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refunded_pence integer NOT NULL DEFAULT 0 CHECK(refunded_pence>=0 AND refunded_pence<=amount_pence),
 ADD COLUMN IF NOT EXISTS quote_version integer, ADD COLUMN IF NOT EXISTS reservation_key text,
 ADD COLUMN IF NOT EXISTS expires_at timestamptz, ADD COLUMN IF NOT EXISTS provider text DEFAULT 'stripe';
-- The old webhook marked both full and partial refunds simply "refunded".
-- Do not count that money until the provider supplies the actual net refund.
UPDATE public.payments SET refunded_pence=amount_pence,metadata=COALESCE(metadata,'{}'::jsonb)||'{"needs_refund_reconciliation":true}'::jsonb WHERE status='refunded';
ALTER TABLE public.repair_funds ALTER COLUMN customer_phone DROP NOT NULL;
ALTER TABLE public.repair_funds ADD COLUMN IF NOT EXISTS quote_version integer, ADD COLUMN IF NOT EXISTS allocated_pence integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS repair_payment_reservation ON public.payments(reservation_key) WHERE status IN ('creating','open') AND reservation_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_quote_fund ON public.repair_funds(enquiry_ref) WHERE status IN ('open','funded') AND enquiry_ref IS NOT NULL;
CREATE TABLE public.repair_refunds (stripe_refund_id text PRIMARY KEY,payment_id uuid NOT NULL REFERENCES public.payments(id),amount_pence integer NOT NULL CHECK(amount_pence>0),status text NOT NULL,request_id text,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.repair_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.repair_refunds FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.repair_refunds TO service_role;
CREATE TABLE public.repair_payment_events (event_id text PRIMARY KEY, payload jsonb NOT NULL, processed_at timestamptz);
CREATE TABLE public.repair_message_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text NOT NULL UNIQUE, job_id uuid REFERENCES public.jobs(id),
 channel text NOT NULL CHECK(channel IN ('sms','email')), recipient text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent')), attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz, sent_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.repair_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_message_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Staff can manage repair funds" ON public.repair_funds;
REVOKE ALL ON public.payments,public.repair_funds,public.repair_payment_events,public.repair_message_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.payments,public.repair_funds,public.repair_payment_events,public.repair_message_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.repair_money(p_job uuid DEFAULT NULL,p_ref text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.jobs; e public.enquiries; paid bigint; total bigint; deposit bigint;
BEGIN
 IF p_job IS NOT NULL THEN SELECT * INTO j FROM public.jobs WHERE id=p_job; SELECT * INTO e FROM public.enquiries WHERE converted_job_id=p_job LIMIT 1;
 ELSE SELECT * INTO e FROM public.enquiries WHERE enquiry_ref=p_ref; IF e.converted_job_id IS NOT NULL THEN SELECT * INTO j FROM public.jobs WHERE id=e.converted_job_id; END IF; END IF;
 IF j.id IS NULL AND e.id IS NULL THEN RAISE EXCEPTION 'Repair not found'; END IF;
 SELECT COALESCE(sum(amount_pence-refunded_pence),0) INTO paid FROM public.payments
 WHERE status IN ('paid','refunded') AND kind<>'fund_topup' AND ((j.id IS NOT NULL AND job_id=j.id) OR (e.enquiry_ref IS NOT NULL AND enquiry_ref=e.enquiry_ref));
 IF j.id IS NOT NULL THEN total=round(COALESCE(j.price_total,0)*100); deposit=CASE WHEN j.deposit_required THEN round(COALESCE(j.deposit_amount,20)*100) ELSE 0 END;
 ELSE total=round(COALESCE(e.quoted_price,0)*100)+(SELECT COALESCE(sum(round((x->>'price')::numeric*100)),0) FROM jsonb_array_elements(COALESCE(e.additional_repairs,'[]'::jsonb)||COALESCE(e.accessories,'[]'::jsonb)) x); deposit=CASE WHEN e.deposit_required THEN round(COALESCE(e.deposit_amount,20)*100) ELSE 0 END; END IF;
 RETURN jsonb_build_object('total_pence',total,'paid_pence',paid,'balance_due_pence',greatest(total-paid,0),'deposit_due_pence',greatest(least(deposit,total)-paid,0),'overpaid_pence',greatest(paid-total,0),'fully_paid',total>0 AND paid>=total);
END $$;
CREATE OR REPLACE FUNCTION public.reconcile_repair_money(p_job uuid DEFAULT NULL,p_ref text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m jsonb; jid uuid; ref text;
BEGIN
 jid=p_job;ref=p_ref;
 IF jid IS NULL THEN SELECT converted_job_id INTO jid FROM public.enquiries WHERE enquiry_ref=ref; END IF;
 IF ref IS NULL THEN SELECT enquiry_ref INTO ref FROM public.enquiries WHERE converted_job_id=jid LIMIT 1; END IF;
 m=public.repair_money(jid,ref);
 UPDATE public.jobs SET payment_received=(m->>'fully_paid')::boolean,deposit_received=(m->>'deposit_due_pence')::bigint=0,
 status=CASE WHEN status='AWAITING_DEPOSIT' AND (m->>'deposit_due_pence')::bigint=0 THEN 'READY_TO_ORDER' WHEN status='READY_TO_ORDER' AND (m->>'deposit_due_pence')::bigint>0 THEN 'AWAITING_DEPOSIT' ELSE status END WHERE id=jid;
 UPDATE public.enquiries SET payment_received=(m->>'fully_paid')::boolean,deposit_received=(m->>'deposit_due_pence')::bigint=0 WHERE enquiry_ref=ref;
 RETURN m;
END $$;
-- Atomic reservation across BOTH deposit and balance choices. Expired provider sessions must
-- be expired/reconciled by the server before their reservation is released.
CREATE OR REPLACE FUNCTION public.reserve_repair_checkout(p_job uuid,p_ref text,p_fund uuid,p_kind text,p_amount integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.jobs; e public.enquiries; f public.repair_funds; m jsonb; key text; amount integer; ver integer; existing public.payments; created public.payments;
BEGIN
 IF p_fund IS NOT NULL THEN SELECT * INTO f FROM public.repair_funds WHERE id=p_fund FOR UPDATE;
 IF f.id IS NULL OR f.status<>'open' OR p_kind<>'fund_topup' THEN RAISE EXCEPTION 'Fund unavailable'; END IF;
 SELECT * INTO e FROM public.enquiries WHERE enquiry_ref=f.enquiry_ref FOR UPDATE;
 IF e.id IS NULL OR NOT e.price_verified OR e.quote_version IS DISTINCT FROM f.quote_version OR e.customer_response='cancel' OR e.status IN ('cancelled','rejected') THEN RAISE EXCEPTION 'Reconfirm the quote before saving'; END IF;
 IF e.converted_job_id IS NOT NULL THEN
 SELECT * INTO j FROM public.jobs WHERE id=e.converted_job_id FOR UPDATE;
 IF j.customer_response='cancel' OR j.status IN ('CANCELLED','COLLECTED','COMPLETED') THEN RAISE EXCEPTION 'Repair no longer accepts savings'; END IF;
 END IF;
 key='fund:'||f.id; amount=least(p_amount,f.target_amount_pence-f.balance_pence);ver=f.quote_version;
 ELSE
 IF p_job IS NOT NULL THEN SELECT * INTO j FROM public.jobs WHERE id=p_job FOR UPDATE; ELSE SELECT * INTO e FROM public.enquiries WHERE enquiry_ref=p_ref FOR UPDATE; IF e.converted_job_id IS NOT NULL THEN SELECT * INTO j FROM public.jobs WHERE id=e.converted_job_id FOR UPDATE; END IF; END IF;
 IF j.id IS NOT NULL THEN
 key='job:'||j.id;ver=j.quote_version;
 IF j.quote_confirmed_at IS NULL OR j.quote_accepted_version IS DISTINCT FROM ver OR j.customer_response='cancel' OR j.status IN ('CANCELLED','COLLECTED','COMPLETED') THEN RAISE EXCEPTION 'Repair is not confirmed and accepted'; END IF;
 ELSE
 key='enquiry:'||e.enquiry_ref;ver=e.quote_version;
 IF e.id IS NULL OR e.quote_confirmed_at IS NULL OR e.quote_accepted_version IS DISTINCT FROM ver OR e.customer_response='cancel' OR e.status IN ('cancelled','rejected') THEN RAISE EXCEPTION 'Quote is not confirmed and accepted'; END IF;
 END IF;
 m=public.repair_money(j.id,e.enquiry_ref);
 amount=CASE WHEN p_kind IN ('job_deposit','enquiry_deposit') THEN (m->>'deposit_due_pence')::integer ELSE (m->>'balance_due_pence')::integer END;
 END IF;
 IF amount IS NULL OR amount<=0 THEN RAISE EXCEPTION 'Nothing left to pay'; END IF;
 SELECT * INTO existing FROM public.payments WHERE reservation_key=key AND status IN ('creating','open') LIMIT 1;
 IF existing.id IS NOT NULL THEN RETURN to_jsonb(existing); END IF;
 INSERT INTO public.payments(kind,job_id,enquiry_ref,repair_fund_id,amount_pence,quote_version,reservation_key,status,expires_at)
 VALUES(p_kind,CASE WHEN p_fund IS NULL THEN j.id ELSE NULL END,CASE WHEN p_fund IS NULL AND j.id IS NULL THEN e.enquiry_ref ELSE NULL END,p_fund,amount,ver,key,'creating',now()+interval '35 minutes') RETURNING * INTO created;
 RETURN to_jsonb(created);
END $$;
CREATE OR REPLACE FUNCTION public.apply_verified_payment(p_event text,p_session text,p_intent text,p_amount integer,p_currency text,p_refunded integer DEFAULT 0) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.payments; f public.repair_funds; credit bigint; allocation bigint; j public.jobs; e public.enquiries; txt text;
BEGIN
 SELECT * INTO p FROM public.payments WHERE stripe_session_id=p_session OR (p_intent IS NOT NULL AND stripe_payment_intent_id=p_intent) FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Payment not recorded; reconciliation required'; END IF;
 IF p.amount_pence<>p_amount OR p.currency<>p_currency OR p_refunded<0 OR p_refunded>p_amount THEN RAISE EXCEPTION 'Provider amount or currency mismatch'; END IF;
 -- A delayed provider snapshot must never undo a successful refund.
 IF NOT COALESCE((p.metadata->>'needs_refund_reconciliation')::boolean,false) THEN p_refunded=greatest(p.refunded_pence,p_refunded); END IF;
 UPDATE public.payments SET stripe_payment_intent_id=p_intent,status=CASE WHEN p_refunded=p_amount THEN 'refunded' ELSE 'paid' END,refunded_pence=p_refunded,metadata=COALESCE(metadata,'{}'::jsonb)-'needs_refund_reconciliation',paid_at=COALESCE(paid_at,now()),updated_at=now() WHERE id=p.id;
 IF p.repair_fund_id IS NOT NULL THEN
 SELECT * INTO f FROM public.repair_funds WHERE id=p.repair_fund_id FOR UPDATE;
 SELECT COALESCE(sum(amount_pence-refunded_pence),0) INTO credit FROM public.payments WHERE repair_fund_id=f.id AND kind='fund_topup' AND status IN ('paid','refunded');
 SELECT COALESCE(sum(amount_pence-refunded_pence),0) INTO allocation FROM public.payments WHERE repair_fund_id=f.id AND kind='fund_redemption' AND status IN ('paid','refunded');
 IF allocation>credit THEN
 -- Refunds after allocation remove coverage from the repair, not twice from its pot.
 UPDATE public.payments SET refunded_pence=least(amount_pence,greatest(amount_pence-credit,0)),status=CASE WHEN greatest(amount_pence-credit,0)>=amount_pence THEN 'refunded' ELSE 'paid' END WHERE id=f.redeemed_payment_id;
 allocation=least(allocation,credit);
 END IF;
 UPDATE public.repair_funds SET balance_pence=greatest(credit-allocation,0),allocated_pence=allocation,status=CASE WHEN allocation>0 THEN 'redeemed' WHEN credit>=target_amount_pence THEN 'funded' ELSE 'open' END,updated_at=now() WHERE id=f.id;
 IF f.enquiry_ref IS NOT NULL THEN PERFORM public.reconcile_repair_money(NULL,f.enquiry_ref); END IF;
 END IF;
 IF p.job_id IS NOT NULL OR p.enquiry_ref IS NOT NULL THEN
 PERFORM public.reconcile_repair_money(p.job_id,p.enquiry_ref);
 SELECT * INTO j FROM public.jobs WHERE id=p.job_id;
 IF j.id IS NULL THEN SELECT * INTO e FROM public.enquiries WHERE enquiry_ref=p.enquiry_ref; SELECT * INTO j FROM public.jobs WHERE id=e.converted_job_id; ELSE SELECT * INTO e FROM public.enquiries WHERE converted_job_id=j.id LIMIT 1; END IF;
 IF j.id IS NOT NULL THEN
 txt=CASE WHEN p_refunded>0 THEN 'Your refund has been processed. Please check your repair page for the updated balance.' ELSE 'Payment received, thank you. If a part needs ordering, we will confirm separately once the order has been placed.' END;
 txt=txt||E'\n\n'||COALESCE(NULLIF(current_setting('app.site_url',true),''),'https://newforestdevicerepairs.co.uk')||'/repair-quote/?ref='||COALESCE(e.enquiry_ref,j.id::text)||'&t='||COALESCE(e.quote_action_token,j.quote_action_token)||E'\n\nNFD Repairs';
 INSERT INTO public.repair_message_outbox(dedupe_key,job_id,channel,recipient,body)
 SELECT p.id||':'||p_refunded||':'||v.channel,j.id,v.channel,v.recipient,txt FROM (VALUES ('sms',j.customer_phone),('email',j.customer_email)) v(channel,recipient) WHERE nullif(v.recipient,'') IS NOT NULL ON CONFLICT(dedupe_key) DO NOTHING;
 END IF;
 END IF;
 UPDATE public.repair_payment_events SET processed_at=now() WHERE event_id=p_event;
END $$;
CREATE OR REPLACE FUNCTION public.redeem_repair_fund(p_fund uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.repair_funds; e public.enquiries; j public.jobs; m jsonb; amount integer; pid uuid;
BEGIN
 SELECT * INTO f FROM public.repair_funds WHERE id=p_fund FOR UPDATE;
 IF f.status='redeemed' THEN RETURN jsonb_build_object('already_redeemed',true); END IF;
 SELECT * INTO e FROM public.enquiries WHERE enquiry_ref=f.enquiry_ref FOR UPDATE; SELECT * INTO j FROM public.jobs WHERE id=e.converted_job_id FOR UPDATE;
 IF e.customer_response='cancel' OR j.quote_confirmed_at IS NULL OR j.quote_accepted_version IS DISTINCT FROM j.quote_version OR j.status='CANCELLED' THEN RAISE EXCEPTION 'Confirm current parts and price before applying savings'; END IF;
 IF EXISTS(SELECT 1 FROM public.payments WHERE (job_id=j.id OR enquiry_ref=e.enquiry_ref OR repair_fund_id=f.id) AND status IN ('creating','open')) THEN RAISE EXCEPTION 'Finish or cancel the open checkout first'; END IF;
 IF EXISTS(SELECT 1 FROM public.repair_refunds r JOIN public.payments p ON p.id=r.payment_id WHERE p.repair_fund_id=f.id AND r.status IN ('pending','requires_action')) THEN RAISE EXCEPTION 'Wait for the pending savings refund to complete'; END IF;
 m=public.repair_money(j.id,e.enquiry_ref);amount=least(f.balance_pence,(m->>'balance_due_pence')::integer);
 IF amount<=0 THEN RAISE EXCEPTION 'No savings available or nothing due'; END IF;
 INSERT INTO public.payments(kind,job_id,enquiry_ref,repair_fund_id,amount_pence,status,paid_at,provider) VALUES('fund_redemption',j.id,NULL,f.id,amount,'paid',now(),'fund') RETURNING id INTO pid;
 UPDATE public.repair_funds SET status='redeemed',balance_pence=balance_pence-amount,allocated_pence=amount,redeemed_payment_id=pid,redeemed_at=now() WHERE id=f.id;
 PERFORM public.reconcile_repair_money(j.id,e.enquiry_ref);
 RETURN jsonb_build_object('applied_pence',amount,'enquiry_ref',e.enquiry_ref);
END $$;
CREATE OR REPLACE FUNCTION public.record_manual_repair_payment(p_job uuid,p_amount integer,p_kind text,p_reference text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.jobs; m jsonb;
BEGIN
 SELECT * INTO j FROM public.jobs WHERE id=p_job FOR UPDATE;
 IF j.id IS NULL OR p_kind NOT IN ('manual_deposit','manual_payment') OR p_amount<=0 OR nullif(p_reference,'') IS NULL THEN RAISE EXCEPTION 'Invalid manual payment'; END IF;
 IF EXISTS(SELECT 1 FROM public.payments WHERE job_id=p_job AND provider='manual' AND metadata->>'reference'=p_reference) THEN RETURN public.repair_money(p_job,NULL); END IF;
 IF EXISTS(SELECT 1 FROM public.payments WHERE (job_id=p_job OR enquiry_ref IN (SELECT enquiry_ref FROM public.enquiries WHERE converted_job_id=p_job)) AND status IN ('creating','open')) THEN RAISE EXCEPTION 'Cancel or finish online checkout before recording shop payment'; END IF;
 m=public.repair_money(p_job,NULL);IF p_amount>(m->>'balance_due_pence')::integer THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
 INSERT INTO public.payments(kind,job_id,amount_pence,status,provider,paid_at,metadata) VALUES(p_kind,p_job,p_amount,'paid','manual',now(),jsonb_build_object('reference',p_reference));
 RETURN public.reconcile_repair_money(p_job,NULL);
END $$;
CREATE OR REPLACE FUNCTION public.claim_repair_messages(p_job uuid DEFAULT NULL) RETURNS SETOF public.repair_message_outbox
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.repair_message_outbox SET status='sending',locked_until=now()+interval '2 minutes' WHERE id IN
 (SELECT id FROM public.repair_message_outbox WHERE (p_job IS NULL OR job_id=p_job) AND (status='pending' OR (status='sending' AND locked_until<now())) AND attempts<10 ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING *;
$$;
CREATE SEQUENCE IF NOT EXISTS public.repair_job_ref_sequence;
SELECT setval('public.repair_job_ref_sequence',greatest(COALESCE((SELECT max(substring(job_ref FROM '[0-9]+$')::bigint) FROM public.jobs WHERE job_ref ~ '^NF-[0-9]+$'),0)+1,1),false);
CREATE OR REPLACE FUNCTION public.confirm_repair_enquiry(p_enquiry uuid,p_job jsonb,p_snapshot jsonb,p_changed boolean) RETURNS public.jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.enquiries; j public.jobs; cols text; vals text; ver integer;
BEGIN
 SELECT * INTO e FROM public.enquiries WHERE id=p_enquiry FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Enquiry not found'; END IF;
 IF e.converted_job_id IS NOT NULL THEN
 SELECT * INTO j FROM public.jobs WHERE id=e.converted_job_id FOR UPDATE;
 IF j.quote_confirmed_at IS NOT NULL AND j.quote_snapshot=p_snapshot AND j.requires_parts_order IS NOT DISTINCT FROM (p_job->>'requires_parts_order')::boolean AND j.confirmation_notes IS NOT DISTINCT FROM p_job->>'confirmation_notes' AND j.parts_expected_at IS NOT DISTINCT FROM (p_job->>'parts_expected_at')::timestamptz THEN RETURN j; END IF;
 ver=greatest(j.quote_version,e.quote_version)+CASE WHEN j.quote_snapshot IS DISTINCT FROM p_snapshot THEN 1 ELSE 0 END;
 UPDATE public.jobs SET quote_version=ver,quote_confirmed_at=now(),quote_snapshot=p_snapshot,quote_accepted_version=CASE WHEN j.quote_snapshot=p_snapshot AND j.quote_accepted_version=j.quote_version THEN ver ELSE NULL END,
 quoted_price=(p_job->>'quoted_price')::numeric,price_total=(p_job->>'price_total')::numeric,part_option=p_job->>'part_option',device_colour=p_job->>'device_colour',additional_issues=p_job->'additional_issues',confirmation_notes=p_job->>'confirmation_notes',parts_expected_at=(p_job->>'parts_expected_at')::timestamptz,
 requires_parts_order=(p_job->>'requires_parts_order')::boolean,deposit_required=(p_job->>'deposit_required')::boolean,deposit_amount=(p_job->>'deposit_amount')::numeric
 WHERE id=j.id RETURNING * INTO j;
 UPDATE public.enquiries SET quoted_price=j.quoted_price,part_option=j.part_option,device_colour=j.device_colour,price_verified=true,quote_snapshot=p_snapshot,quote_version=ver,quote_accepted_version=j.quote_accepted_version,quote_confirmed_at=now() WHERE id=e.id;
 PERFORM public.reconcile_repair_money(j.id,e.enquiry_ref); RETURN j;
 END IF;
 ver=e.quote_version+CASE WHEN p_changed THEN 1 ELSE 0 END;
 p_job=p_job||jsonb_build_object('quote_version',ver,'quote_accepted_version',CASE WHEN NOT p_changed AND e.status='approved' THEN ver ELSE NULL END,'quote_confirmed_at',now(),'quote_snapshot',p_snapshot,'job_ref','NF-'||lpad(nextval('public.repair_job_ref_sequence')::text,5,'0'));
 SELECT string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(NULL::public.jobs,$1)).%I',key),',') INTO cols,vals FROM jsonb_object_keys(p_job) key;
 EXECUTE format('INSERT INTO public.jobs(%s) SELECT %s RETURNING *',cols,vals) INTO j USING p_job;
 UPDATE public.enquiries SET quoted_price=(p_snapshot->>'primary_price')::numeric,part_option=p_snapshot->>'part_option',device_colour=p_snapshot->>'colour',price_verified=true,converted_job_id=j.id,converted_to_job=true,status='converted',converted_at=now(),quote_version=ver,quote_accepted_version=j.quote_accepted_version,quote_confirmed_at=now(),quote_snapshot=p_snapshot WHERE id=e.id;
 PERFORM public.reconcile_repair_money(j.id,e.enquiry_ref);
 SELECT * INTO j FROM public.jobs WHERE id=j.id; RETURN j;
END $$;
-- Explicit execution grants; functions stay invoker/service-only.
DO $$ DECLARE r record; BEGIN FOR r IN SELECT oid::regprocedure name FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('repair_money','reconcile_repair_money','reserve_repair_checkout','apply_verified_payment','redeem_repair_fund','record_manual_repair_payment','claim_repair_messages','confirm_repair_enquiry') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.name);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.name);END LOOP; END $$;
GRANT USAGE,SELECT ON SEQUENCE public.repair_job_ref_sequence TO service_role;
-- Repair historical template escaping, and avoid announcing supplier orders on payment.
UPDATE public.sms_templates SET body=replace(body,E'\\n',E'\n') WHERE key IN ('PAYMENT_LINK','FUND_LINK');
UPDATE public.sms_templates SET body=E'Hi {first_name}! Your £{deposit_amount} deposit is received, thank you.\n\nWe will confirm separately once your part has actually been ordered.\n\nTrack your repair:\n{tracking_link}\n\nNFD Repairs' WHERE key='DEPOSIT_RECEIVED';

-- Preserve explicit legacy shop deposits where amount and receipt time exist.
INSERT INTO public.payments(kind,job_id,amount_pence,status,paid_at,provider,metadata)
SELECT 'manual_deposit',j.id,greatest(round(j.deposit_amount*100)::integer-(public.repair_money(j.id,NULL)->>'paid_pence')::integer,0),'paid',j.deposit_received_at,'legacy_manual',jsonb_build_object('source','recorded deposit amount and receipt time')
FROM public.jobs j WHERE j.deposit_received=true AND j.deposit_amount>0 AND j.deposit_received_at IS NOT NULL AND round(j.deposit_amount*100)>(public.repair_money(j.id,NULL)->>'paid_pence')::integer
AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.status IN ('paid','refunded') AND p.kind<>'fund_topup' AND (p.job_id=j.id OR p.enquiry_ref IN (SELECT enquiry_ref FROM public.enquiries WHERE converted_job_id=j.id)));

-- Price/scope changes invalidate acceptance; money flags are never staff toggles.
CREATE OR REPLACE FUNCTION public.guard_repair_money() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m jsonb;
BEGIN
 IF (NEW.price_total IS DISTINCT FROM OLD.price_total OR NEW.part_option IS DISTINCT FROM OLD.part_option OR NEW.device_colour IS DISTINCT FROM OLD.device_colour OR NEW.additional_issues IS DISTINCT FROM OLD.additional_issues)
 AND NEW.quote_confirmed_at IS NOT DISTINCT FROM OLD.quote_confirmed_at AND OLD.quote_snapshot IS NOT NULL THEN
 NEW.quote_version=OLD.quote_version+1;NEW.quote_accepted_version=NULL;NEW.quote_confirmed_at=NULL;
 NEW.quote_snapshot=COALESCE(NEW.quote_snapshot,'{}'::jsonb)||jsonb_build_object('total_pence',round(NEW.price_total*100),'part_option',NEW.part_option,'colour',NEW.device_colour);
 END IF;
 m=public.repair_money(OLD.id,NULL);
 NEW.payment_received=round(COALESCE(NEW.price_total,0)*100)>0 AND (m->>'paid_pence')::bigint>=round(COALESCE(NEW.price_total,0)*100);
 NEW.deposit_received=(m->>'paid_pence')::bigint>=CASE WHEN NEW.deposit_required THEN least(round(COALESCE(NEW.deposit_amount,20)*100),round(COALESCE(NEW.price_total,0)*100)) ELSE 0 END;
 IF NEW.status='COLLECTED' AND OLD.status<>'COLLECTED' AND NEW.price_total>0 AND NOT NEW.payment_received AND NOT COALESCE(NEW.is_warranty,false) THEN RAISE EXCEPTION 'Record and verify the outstanding payment before collection'; END IF;
 IF NEW.status='PARTS_ORDERED' AND OLD.status<>'PARTS_ORDERED' AND (NEW.parts_ordered_at IS NULL OR (NEW.quote_snapshot IS NOT NULL AND (NEW.quote_confirmed_at IS NULL OR NEW.quote_accepted_version IS DISTINCT FROM NEW.quote_version OR NOT NEW.deposit_received))) THEN RAISE EXCEPTION 'Confirm the repair, required payment and actual supplier order first'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_repair_money BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.guard_repair_money();
REVOKE ALL ON FUNCTION public.guard_repair_money() FROM PUBLIC,anon,authenticated;
-- Trigger executes for authenticated job updates; it needs a money read without exposing payment rows.
-- It only returns booleans for the row being updated, not payment history.
ALTER FUNCTION public.guard_repair_money() SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.accept_repair_quote(p_job uuid,p_version integer) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.jobs;
BEGIN
 SELECT * INTO j FROM public.jobs WHERE id=p_job FOR UPDATE;
 IF j.quote_confirmed_at IS NULL OR j.quote_version<>p_version OR j.customer_response='cancel' OR j.status IN ('CANCELLED','COLLECTED','COMPLETED') THEN RAISE EXCEPTION 'Repair details changed; refresh before accepting'; END IF;
 UPDATE public.jobs SET quote_accepted_version=p_version,customer_response='accepted',status=CASE WHEN status IN ('AWAITING_CUSTOMER','QUOTE_REQUESTED','QUOTE_APPROVED','AWAITING_DEPOSIT','READY_TO_ORDER','AWAITING_DEVICE') THEN CASE WHEN requires_parts_order THEN CASE WHEN deposit_received THEN 'READY_TO_ORDER' ELSE 'AWAITING_DEPOSIT' END ELSE 'AWAITING_DEVICE' END ELSE status END WHERE id=p_job;
 UPDATE public.enquiries SET quote_accepted_version=p_version,customer_response='accepted',price_confirmation_required=false WHERE converted_job_id=p_job;
END $$;
REVOKE ALL ON FUNCTION public.accept_repair_quote(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_repair_quote(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.add_repair_options(p_ref text,p_repairs jsonb,p_accessories jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.enquiries; j public.jobs; v_repairs jsonb; v_accessories jsonb; issues jsonb; base numeric; changed boolean;
BEGIN
 SELECT * INTO e FROM public.enquiries WHERE enquiry_ref=p_ref FOR UPDATE;
 IF e.id IS NOT NULL THEN
 SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]') INTO v_repairs FROM (SELECT DISTINCT ON (value->>'repair') value,ord FROM jsonb_array_elements(COALESCE(e.additional_repairs,'[]')||p_repairs) WITH ORDINALITY x(value,ord) ORDER BY value->>'repair',ord) x;
 SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]') INTO v_accessories FROM (SELECT DISTINCT ON (value->>'name') value,ord FROM jsonb_array_elements(COALESCE(e.accessories,'[]')||p_accessories) WITH ORDINALITY x(value,ord) ORDER BY value->>'name',ord) x;
 changed=v_repairs IS DISTINCT FROM COALESCE(e.additional_repairs,'[]') OR v_accessories IS DISTINCT FROM COALESCE(e.accessories,'[]');
 IF NOT changed THEN RETURN jsonb_build_object('additional_repairs',v_repairs,'accessories',v_accessories); END IF;
 UPDATE public.enquiries SET additional_repairs=v_repairs,accessories=v_accessories,quote_confirmed_at=NULL,quote_accepted_version=NULL,quote_version=quote_version+1 WHERE id=e.id;
 IF e.converted_job_id IS NOT NULL THEN SELECT * INTO j FROM public.jobs WHERE id=e.converted_job_id FOR UPDATE; END IF;
 ELSE SELECT * INTO j FROM public.jobs WHERE id=p_ref::uuid FOR UPDATE;v_repairs=p_repairs;v_accessories=p_accessories;
 END IF;
 IF j.id IS NOT NULL THEN
 SELECT COALESCE(jsonb_agg(value),'[]') INTO v_accessories FROM jsonb_array_elements(v_accessories) value;
 SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]') INTO issues FROM
 (SELECT DISTINCT ON (value->>'repair') value,ord FROM jsonb_array_elements(COALESCE(j.additional_issues,'[]')||v_repairs||
 (SELECT COALESCE(jsonb_agg(jsonb_build_object('repair','accessory_'||regexp_replace(lower(x->>'name'),'[^a-z0-9]+','_','g'),'display_name',x->>'name','price',x->'price','option_type','accessory')),'[]') FROM jsonb_array_elements(v_accessories) x)) WITH ORDINALITY x(value,ord) ORDER BY value->>'repair',ord) x;
 IF issues IS DISTINCT FROM COALESCE(j.additional_issues,'[]') THEN
 base=COALESCE(j.quoted_price,j.price_total-(SELECT COALESCE(sum((x->>'price')::numeric),0) FROM jsonb_array_elements(COALESCE(j.additional_issues,'[]')) x));
 UPDATE public.jobs SET additional_issues=issues,price_total=base+(SELECT COALESCE(sum((x->>'price')::numeric),0) FROM jsonb_array_elements(issues) x),quote_confirmed_at=NULL,quote_accepted_version=NULL,quote_version=greatest(quote_version+1,COALESCE(e.quote_version+1,1)) WHERE id=j.id;
 END IF;
 END IF;
 RETURN jsonb_build_object('additional_repairs',v_repairs,'accessories',v_accessories);
END $$;
REVOKE ALL ON FUNCTION public.add_repair_options(text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_repair_options(text,jsonb,jsonb) TO service_role;
