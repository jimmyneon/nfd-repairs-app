-- NF Hub device registration table
-- Stores FCM device tokens for the NF Hub Android notification app

CREATE TABLE IF NOT EXISTS public.nf_hub_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_token TEXT NOT NULL UNIQUE,
  app_id TEXT NOT NULL,
  platform TEXT DEFAULT 'android',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by app_id
CREATE INDEX IF NOT EXISTS idx_nf_hub_devices_app_id ON public.nf_hub_devices(app_id);

-- Index for fast unregister by token
CREATE INDEX IF NOT EXISTS idx_nf_hub_devices_token ON public.nf_hub_devices(device_token);

-- Enable RLS
ALTER TABLE public.nf_hub_devices ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage everything
CREATE POLICY "Service role can manage nf_hub_devices"
  ON public.nf_hub_devices
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
