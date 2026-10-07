ALTER TABLE public.enquiries
ADD COLUMN IF NOT EXISTS device_colour TEXT;

COMMENT ON COLUMN public.enquiries.device_colour IS 'Customer-selected device colour from repair quote flow';

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS device_colour TEXT;

COMMENT ON COLUMN public.jobs.device_colour IS 'Device colour carried from repair enquiry or entered during intake';
