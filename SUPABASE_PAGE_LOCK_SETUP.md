-- Run this SQL in your Supabase SQL Editor to enable cross-device page lock sync

-- Create the page_lock_config table
CREATE TABLE IF NOT EXISTS public.page_lock_config (
    id TEXT PRIMARY KEY,
    config JSONB NOT NULL DEFAULT '{"enabled": false, "lockedPages": []}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.page_lock_config ENABLE ROW LEVEL SECURITY;

-- Allow public read access (so all users can see the lock settings)
CREATE POLICY "Allow public read access" ON public.page_lock_config
    FOR SELECT USING (true);

-- Allow all to insert snapshots (the app reads the latest row)
CREATE POLICY "Allow snapshot insert" ON public.page_lock_config
    FOR INSERT WITH CHECK (true);

-- Optional cleanup policy if you want to delete old snapshots later:
-- CREATE POLICY "Allow delete old snapshots" ON public.page_lock_config
--     FOR DELETE USING (true);
