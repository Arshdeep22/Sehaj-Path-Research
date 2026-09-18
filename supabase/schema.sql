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

-- =====================================================
-- Grant permissions
-- =====================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.topics TO authenticated;
GRANT ALL ON public.angles TO authenticated;
GRANT ALL ON public.shabads TO authenticated;
