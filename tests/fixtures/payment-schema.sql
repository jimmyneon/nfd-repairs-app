CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
CREATE TABLE public.jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_ref text NOT NULL UNIQUE,tracking_token text,short_token text,status text DEFAULT 'RECEIVED',
 customer_name text,customer_phone text,customer_email text,device_type text,device_make text,device_model text,device_colour text,
 issue text,description text,type text,source text,quoted_price numeric,price_total numeric,additional_issues jsonb,
 requires_parts_order boolean,parts_required boolean,deposit_required boolean,deposit_amount numeric,deposit_received boolean,
 deposit_received_at timestamptz,payment_received boolean,parts_expected_at timestamptz,parts_ordered_at timestamptz,
 device_in_shop boolean,terms_accepted boolean,quote_request_id uuid,quote_action_token text,is_warranty boolean DEFAULT false
);
CREATE TABLE public.enquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),enquiry_ref text,converted_job_id uuid,converted_to_job boolean,status text,
 converted_at timestamptz,quoted_price numeric,additional_repairs jsonb,accessories jsonb,quote_action_token text,
 part_option text,device_colour text
);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('QUOTE_REQUESTED','QUOTE_APPROVED','AWAITING_DEVICE','DROPPED_OFF','RECEIVED','DIAGNOSTIC','AWAITING_CUSTOMER','AWAITING_DEPOSIT','PARTS_ORDERED','PARTS_ARRIVED','IN_REPAIR','DELAYED','READY_TO_COLLECT','IN_STORAGE','COLLECTED','COMPLETED','CANCELLED'));
ALTER TABLE public.jobs ADD CONSTRAINT valid_status CHECK (status IN ('QUOTE_REQUESTED','QUOTE_APPROVED','AWAITING_DEVICE','DROPPED_OFF','RECEIVED','DIAGNOSTIC','AWAITING_CUSTOMER','AWAITING_DEPOSIT','PARTS_ORDERED','PARTS_ARRIVED','IN_REPAIR','DELAYED','READY_TO_COLLECT','IN_STORAGE','COLLECTED','COMPLETED','CANCELLED'));
CREATE TABLE public.sms_templates(key text UNIQUE,body text,is_active boolean);
GRANT ALL ON public.jobs,public.enquiries,public.sms_templates TO service_role;
