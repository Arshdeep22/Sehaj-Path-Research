-- =====================================================
-- Sehaj Path Research Database Schema
-- =====================================================

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Topics table (created by admin)
CREATE TABLE IF NOT EXISTS public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Angles table (different perspectives within a topic)
CREATE TABLE IF NOT EXISTS public.angles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shabads table (scripture quotes added to angles)
CREATE TABLE IF NOT EXISTS public.shabads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  angle_id UUID NOT NULL REFERENCES public.angles(id) ON DELETE CASCADE,
  shabad_text TEXT NOT NULL,
  comment TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Auto-create profile trigger
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, username, role, must_change_password)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- Helper function for admin check
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.angles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shabads ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin() OR auth.uid() = id);

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- Topics policies (all authenticated users can read, only admins can write)
CREATE POLICY "All authenticated users can view topics"
  ON public.topics FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can create topics"
  ON public.topics FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update topics"
  ON public.topics FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Only admins can delete topics"
  ON public.topics FOR DELETE
  USING (public.is_admin());

-- Angles policies (all authenticated users can read and create)
CREATE POLICY "All authenticated users can view angles"
  ON public.angles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "All authenticated users can create angles"
  ON public.angles FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "Users can update their own angles, admins can update all"
  ON public.angles FOR UPDATE
  USING (auth.uid() = created_by OR public.is_admin());

CREATE POLICY "Users can delete their own angles, admins can delete all"
  ON public.angles FOR DELETE
  USING (auth.uid() = created_by OR public.is_admin());

-- Shabads policies (all authenticated users can read and create)
CREATE POLICY "All authenticated users can view shabads"
  ON public.shabads FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "All authenticated users can create shabads"
  ON public.shabads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "Users can update their own shabads, admins can update all"
  ON public.shabads FOR UPDATE
  USING (auth.uid() = created_by OR public.is_admin());

CREATE POLICY "Users can delete their own shabads, admins can delete all"
  ON public.shabads FOR DELETE
  USING (auth.uid() = created_by OR public.is_admin());

-- Shabad views (for ਝਲਕ feed — tracks who has seen each card)
CREATE TABLE IF NOT EXISTS public.shabad_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shabad_id UUID NOT NULL REFERENCES public.shabads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shabad_id, user_id)
);

ALTER TABLE public.shabad_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view views"
  ON public.shabad_views FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can add their own views"
  ON public.shabad_views FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Web Push subscriptions (one row per device/browser per user)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- Weekly leaderboard snapshot
-- Written by the Sunday cron right before scores are reset.
-- Only holds the MOST RECENT week — the cron wipes the previous week first.
-- Admin-only visibility via RLS; the cron writes with the service-role key.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.weekly_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,       -- snapshotted so the row stays readable even if the profile is later deleted
  username TEXT NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  unread_shabads INTEGER NOT NULL DEFAULT 0,   -- shabads this user had NOT yet viewed at snapshot time
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill the column on databases created before unread_shabads existed
ALTER TABLE public.weekly_leaderboard
  ADD COLUMN IF NOT EXISTS unread_shabads INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_weekly_leaderboard_rank ON public.weekly_leaderboard (rank);

ALTER TABLE public.weekly_leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view weekly leaderboard"
  ON public.weekly_leaderboard FOR SELECT
  USING (public.is_admin());

-- (No INSERT/DELETE policies on purpose — only the service-role cron writes it,
-- which bypasses RLS. Regular users and admins cannot mutate the snapshot from the UI.)

-- =====================================================
-- Shabad favourites (per-user saved shabads for the ਮਨਪਸੰਦ list)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.shabad_favourites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shabad_id UUID NOT NULL REFERENCES public.shabads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shabad_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shabad_favourites_user ON public.shabad_favourites (user_id, created_at DESC);

ALTER TABLE public.shabad_favourites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favourites"
  ON public.shabad_favourites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add their own favourites"
  ON public.shabad_favourites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own favourites"
  ON public.shabad_favourites FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- Prasang (personal / admin-shared scripture study containers)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.prasangs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  is_admin_created BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prasang_angles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prasang_id UUID NOT NULL REFERENCES public.prasangs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prasang_shabads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prasang_angle_id UUID NOT NULL REFERENCES public.prasang_angles(id) ON DELETE CASCADE,
  shabad_text TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prasangs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prasang_angles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prasang_shabads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view prasangs"
  ON public.prasangs FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create prasangs"
  ON public.prasangs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
CREATE POLICY "Users can update their own prasangs, admins can update all"
  ON public.prasangs FOR UPDATE
  USING (auth.uid() = created_by OR public.is_admin());
CREATE POLICY "Users can delete their own prasangs, admins can delete all"
  ON public.prasangs FOR DELETE
  USING (auth.uid() = created_by OR public.is_admin());

CREATE POLICY "Users can view their own prasang angles, admins see all"
  ON public.prasang_angles FOR SELECT
  USING (auth.uid() = created_by OR public.is_admin());
CREATE POLICY "Authenticated users can create prasang angles"
  ON public.prasang_angles FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
CREATE POLICY "Users can update their own prasang angles, admins can update all"
  ON public.prasang_angles FOR UPDATE
  USING (auth.uid() = created_by OR public.is_admin());
CREATE POLICY "Users can delete their own prasang angles, admins can delete all"
  ON public.prasang_angles FOR DELETE
  USING (auth.uid() = created_by OR public.is_admin());

CREATE POLICY "Users can view their own prasang shabads, admins see all"
  ON public.prasang_shabads FOR SELECT
  USING (auth.uid() = created_by OR public.is_admin());
CREATE POLICY "Authenticated users can create prasang shabads"
  ON public.prasang_shabads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
CREATE POLICY "Users can update their own prasang shabads, admins can update all"
  ON public.prasang_shabads FOR UPDATE
  USING (auth.uid() = created_by OR public.is_admin());
CREATE POLICY "Users can delete their own prasang shabads, admins can delete all"
  ON public.prasang_shabads FOR DELETE
  USING (auth.uid() = created_by OR public.is_admin());

-- =====================================================
-- Grant permissions
-- =====================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.topics TO authenticated;
GRANT ALL ON public.angles TO authenticated;
GRANT ALL ON public.shabads TO authenticated;
GRANT ALL ON public.shabad_views TO authenticated;
GRANT ALL ON public.push_subscriptions TO authenticated;
GRANT SELECT ON public.weekly_leaderboard TO authenticated;
GRANT ALL ON public.shabad_favourites TO authenticated;
GRANT ALL ON public.prasangs TO authenticated;
GRANT ALL ON public.prasang_angles TO authenticated;
GRANT ALL ON public.prasang_shabads TO authenticated;

-- =====================================================
-- Shabad Kanth (memorized shabads)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.shabad_kanth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shabad_id UUID NOT NULL REFERENCES public.shabads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, shabad_id)
);
ALTER TABLE public.shabad_kanth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own kanth" ON public.shabad_kanth FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON public.shabad_kanth TO authenticated;

-- =====================================================
-- Jaap analytics (ਜੀਵਨ / Jivan tab)
--
-- NOV 2026: The daily WhatsApp "ਜਾਪ" report format changed from counts to HOURS
-- (and split gurmantar into tikaa-ke / turde-firde). The old schema's per-day
-- columns (gurmantar, brahmkavach, birharhe, japji, sewa, sehajpath counts) are
-- replaced with the new hour-based schema below. Old rows are purged — only the
-- jaap_aliases mapping (whatsapp_name → profile_id) is preserved, so admins
-- don't have to re-map every user on the first import.
-- =====================================================

-- Alias map (preserved across the schema change — reuses old rows).
CREATE TABLE IF NOT EXISTS public.jaap_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_name TEXT UNIQUE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.jaap_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view jaap aliases" ON public.jaap_aliases;
DROP POLICY IF EXISTS "Only admins mutate jaap aliases" ON public.jaap_aliases;
CREATE POLICY "Anyone can view jaap aliases"
  ON public.jaap_aliases FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Only admins mutate jaap aliases"
  ON public.jaap_aliases FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Drop the old jaap_reports table (counts-based) and recreate with the new
-- hour-based columns. This is destructive on purpose — the old data isn't
-- comparable to the new schema (different units, different categories).
DROP TABLE IF EXISTS public.jaap_reports CASCADE;

CREATE TABLE public.jaap_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_name TEXT NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  report_date DATE NOT NULL,
  -- Hour-based categories (NUMERIC; hours as decimal, e.g. 1.5 = 1h30m)
  gurmantar_tikaa NUMERIC,     -- ਗੁਰਮੰਤ੍ਰ ਟਿਕਾ ਕੇ (hours, weekly target 7)
  gurmantar_turde NUMERIC,     -- ਗੁਰਮੰਤ੍ਰ ਤੁਰਦੇ ਫਿਰਦੇ (hours, weekly target 28)
  gurbani         NUMERIC,     -- ਗੁਰਬਾਣੀ (hours, weekly target 15)
  vichar          NUMERIC,     -- ਵਿਚਾਰ (hours, weekly target 2)
  -- Count/day-based categories
  japji           NUMERIC,     -- ਉਠਦਿਆ ਜਪਜੀ ਸਾਹਿਬ (count of days)
  brahmkavach     NUMERIC,     -- ਬ੍ਰਹਮ ਕਵਚ (count)
  birharhe        NUMERIC,     -- ਬਿਰਹੜੇ (count)
  sewa            NUMERIC,     -- ਹੱਥੀ ਸੇਵਾ (days, weekly target 2)
  sehajpath       NUMERIC,     -- ਸਹਿਜ ਪਾਠ (minutes, weekly target 7)
  neend           NUMERIC,     -- ਨੀਂਦ (hours slept)
  -- Vela times (minutes since midnight + raw text)
  amrit_vela_min   INTEGER,
  amrit_vela_raw   TEXT,
  sandhya_vela_min INTEGER,
  sandhya_vela_raw TEXT,
  -- Yes/no disciplines
  eye_bibek    BOOLEAN,         -- ਅੱਖਾਂ ਦਾ ਬਿਬੇਕ
  no_faults    BOOLEAN,         -- ਅਵਗੁਣ ਨਹੀਂ ਚਿਤਾਰਨੇ
  no_complaint BOOLEAN,         -- ਸ਼ਿਕਾਇਤ ਨਹੀ ਕਰਨੀ
  -- Meta
  day_index   INTEGER,
  raw_message TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(whatsapp_name, report_date)
);

CREATE INDEX IF NOT EXISTS idx_jaap_reports_profile_date ON public.jaap_reports (profile_id, report_date);
CREATE INDEX IF NOT EXISTS idx_jaap_reports_date ON public.jaap_reports (report_date);

ALTER TABLE public.jaap_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own jaap reports"
  ON public.jaap_reports FOR SELECT
  USING (auth.uid() = profile_id OR public.is_admin());

GRANT SELECT ON public.jaap_aliases TO authenticated;
GRANT SELECT ON public.jaap_reports TO authenticated;