-- Repair fund redemption + link-by-SMS template
--
-- Adds a 'redeemed' lifecycle state (fund spent toward its repair),
-- and the SMS template used to send customers their fund link.

ALTER TABLE public.repair_funds
    DROP CONSTRAINT IF EXISTS repair_funds_status_check;

ALTER TABLE public.repair_funds
    ADD CONSTRAINT repair_funds_status_check
    CHECK (status IN ('open', 'funded', 'redeemed', 'closed', 'refunded'));

ALTER TABLE public.repair_funds
    ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ;

ALTER TABLE public.repair_funds
    ADD COLUMN IF NOT EXISTS redeemed_payment_id UUID;

-- Redemption bookkeeping rows have no Stripe session — the money arrived
-- via earlier top-ups. NULLs are fine under the UNIQUE constraint.
ALTER TABLE public.payments
    ALTER COLUMN stripe_session_id DROP NOT NULL;

-- 'fund_redemption' is a valid payments.kind for the bookkeeping row
-- created when a fund is applied to an enquiry/job.
ALTER TABLE public.payments
    DROP CONSTRAINT IF EXISTS payments_kind_check;

ALTER TABLE public.payments
    ADD CONSTRAINT payments_kind_check
    CHECK (kind IN (
        'job_deposit', 'job_payment',
        'enquiry_deposit', 'enquiry_payment',
        'remote_support', 'fund_topup', 'fund_redemption'
    ));

INSERT INTO public.sms_templates (key, body, is_active)
VALUES (
    'FUND_LINK',
    'Hi {first_name}!\n\nYour repair fund for the {device_summary} is set up — save toward it whenever suits you.\n\nYour personal link (keep it safe — it IS your login):\n{fund_link}\n\nNFD Repairs',
    true
)
ON CONFLICT (key) DO NOTHING;
