-- Paid repair reservation fields for repair enquiries.
-- This is separate from the existing special-order-parts deposit workflow.

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reservation_amount DECIMAL(10,2);
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reservation_checkout_id TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reservation_checkout_reference TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reservation_payment_status TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reservation_created_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reservation_paid_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reservation_terms_accepted_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reservation_terms_version TEXT;

COMMENT ON COLUMN enquiries.reservation_amount IS 'Small generic repair reservation payment credited against the final repair bill; not the special-parts deposit.';
COMMENT ON COLUMN enquiries.reservation_checkout_id IS 'SumUp checkout id for the generic paid repair reservation.';
COMMENT ON COLUMN enquiries.reservation_checkout_reference IS 'Merchant-generated SumUp checkout reference used to reconcile the reservation.';
COMMENT ON COLUMN enquiries.reservation_payment_status IS 'Reservation checkout state, e.g. PENDING, PAID, FAILED, EXPIRED.';
COMMENT ON COLUMN enquiries.reservation_created_at IS 'When the generic paid reservation checkout was created.';
COMMENT ON COLUMN enquiries.reservation_paid_at IS 'When SumUp verified the generic repair reservation as paid.';
COMMENT ON COLUMN enquiries.reservation_terms_accepted_at IS 'When the customer explicitly accepted the paid-reservation terms.';
COMMENT ON COLUMN enquiries.reservation_terms_version IS 'Version identifier for the reservation terms accepted by the customer.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_enquiries_reservation_checkout_id
ON enquiries(reservation_checkout_id)
WHERE reservation_checkout_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_enquiries_reservation_checkout_reference
ON enquiries(reservation_checkout_reference)
WHERE reservation_checkout_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enquiries_reservation_payment_status
ON enquiries(reservation_payment_status)
WHERE reservation_payment_status IS NOT NULL;
