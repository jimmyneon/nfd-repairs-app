-- Stripe payments ledger + repair funds (pay-in-advance savings).
--
-- payments records every Stripe Checkout session we create. The Stripe
-- webhook is the only writer of paid/refunded status — API routes create
-- rows as 'open' and the webhook flips them. All access goes through
-- service-role API routes (or signed-in staff), so RLS is staff-only.

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Stripe identifiers; session id is the idempotency key
    stripe_session_id TEXT NOT NULL UNIQUE,
    stripe_payment_intent_id TEXT,

    -- What the payment is for
    kind TEXT NOT NULL CHECK (kind IN (
        'job_deposit',
        'job_payment',
        'enquiry_deposit',
        'enquiry_payment',
        'remote_support',
        'fund_topup'
    )),
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    enquiry_ref TEXT,
    repair_fund_id UUID,

    -- Money (always computed server-side from the job/enquiry/fund)
    amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
    currency TEXT NOT NULL DEFAULT 'gbp',

    -- Lifecycle: open -> paid | expired | failed; refunded is terminal
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'paid', 'expired', 'failed', 'refunded'
    )),

    -- Customer snapshot for admin display and SMS matching
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,

    description TEXT,
    checkout_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_job_id
    ON public.payments(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_enquiry_ref
    ON public.payments(enquiry_ref) WHERE enquiry_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_intent
    ON public.payments(stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;

-- Repair funds: customer saves toward a repair in advance, then the repair
-- is booked once the pot covers it. balance_pence is only ever increased by
-- the Stripe webhook when a fund_topup payment completes.
CREATE TABLE IF NOT EXISTS public.repair_funds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Unguessable token used in the customer-facing fund link
    fund_token TEXT NOT NULL UNIQUE,

    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,

    device_summary TEXT,
    repair_summary TEXT,
    enquiry_ref TEXT,

    target_amount_pence INTEGER NOT NULL CHECK (target_amount_pence > 0),
    balance_pence INTEGER NOT NULL DEFAULT 0 CHECK (balance_pence >= 0),

    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'funded', 'closed', 'refunded'
    )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    funded_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_funds_phone
    ON public.repair_funds(customer_phone);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage payments"
    ON public.payments FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Staff can manage repair funds"
    ON public.repair_funds FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- Deposit / prepay tracking on enquiries so the payday reserve and
-- quote-accept flows can take real payments, not just record intent.
ALTER TABLE public.enquiries
    ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN DEFAULT FALSE;
ALTER TABLE public.enquiries
    ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2);
ALTER TABLE public.enquiries
    ADD COLUMN IF NOT EXISTS deposit_received BOOLEAN DEFAULT FALSE;
ALTER TABLE public.enquiries
    ADD COLUMN IF NOT EXISTS deposit_received_at TIMESTAMPTZ;
ALTER TABLE public.enquiries
    ADD COLUMN IF NOT EXISTS payment_received BOOLEAN DEFAULT FALSE;

-- SMS confirmation template for deposit payments received via Stripe.
INSERT INTO public.sms_templates (key, body, is_active)
VALUES (
    'DEPOSIT_RECEIVED',
    'Hi {first_name}!\n\nGot it — your £{deposit_amount} deposit is paid. We''ll get your part ordered now and text you as soon as it lands.\n\nNFD Repairs',
    true
)
ON CONFLICT (key) DO NOTHING;

-- Staff-triggered payment link SMS (send-payment-link endpoint).
INSERT INTO public.sms_templates (key, body, is_active)
VALUES (
    'PAYMENT_LINK',
    'Hi {first_name}!\n\nHere''s the secure payment link for your {device_summary} repair — £{amount_due} due.\n\nPay by card or Klarna:\n{payment_link}\n\nNFD Repairs',
    true
)
ON CONFLICT (key) DO NOTHING;
