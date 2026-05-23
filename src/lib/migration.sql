-- ============================================================
-- Gully Cricket — Supabase Migration Schema
-- Run this in your Supabase SQL Editor (https://supabase.com)
-- ============================================================

-- 1. Profiles (extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, created_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'Player'), NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Groups
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own groups"
  ON public.groups FOR ALL USING (auth.uid() = owner_id);

-- 3. Group Players (linked to accounts OR stored as plain name)
CREATE TABLE IF NOT EXISTS public.group_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  claimed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, name)
);

ALTER TABLE public.group_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group owners can manage players"
  ON public.group_players FOR ALL USING (
    auth.uid() IN (SELECT owner_id FROM public.groups WHERE id = group_id)
  );

CREATE POLICY "Players can view themselves"
  ON public.group_players FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() IN (SELECT owner_id FROM public.groups WHERE id = group_id)
  );

-- 4. Player Stats (aggregate per player per group)
CREATE TABLE IF NOT EXISTS public.player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_player_id UUID NOT NULL REFERENCES public.group_players(id) ON DELETE CASCADE,
  matches INT DEFAULT 0,
  runs INT DEFAULT 0,
  balls INT DEFAULT 0,
  fours INT DEFAULT 0,
  sixes INT DEFAULT 0,
  wickets INT DEFAULT 0,
  overs INT DEFAULT 0,
  runs_conceded INT DEFAULT 0,
  catches INT DEFAULT 0,
  stumpings INT DEFAULT 0,
  fifties INT DEFAULT 0,
  hundreds INT DEFAULT 0,
  not_outs INT DEFAULT 0,
  ducks INT DEFAULT 0,
  highest_score INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_player_id)
);

ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group owners can view stats"
  ON public.player_stats FOR SELECT USING (
    auth.uid() IN (SELECT owner_id FROM public.groups WHERE id = (
      SELECT group_id FROM public.group_players WHERE id = group_player_id
    ))
  );

-- 5. Matches
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  share_code TEXT UNIQUE,
  team_a TEXT NOT NULL,
  team_b TEXT NOT NULL,
  score_a INT DEFAULT 0,
  score_b INT DEFAULT 0,
  wickets_a INT DEFAULT 0,
  wickets_b INT DEFAULT 0,
  balls_a INT DEFAULT 0,
  balls_b INT DEFAULT 0,
  winner TEXT,
  motm TEXT,
  ground TEXT DEFAULT 'Gully Ground',
  status TEXT DEFAULT 'live',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  match_data JSONB -- full match object with batting stats, ball history, etc
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own matches"
  ON public.matches FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Anyone can view by share code"
  ON public.matches FOR SELECT USING (share_code IS NOT NULL);

-- Index for share code lookups
CREATE INDEX IF NOT EXISTS idx_matches_share_code ON public.matches(share_code);

-- 6. Collaboration (who's scoring a match)
CREATE TABLE IF NOT EXISTS public.collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'scorer',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match owner and collaborators can view"
  ON public.collaborators FOR SELECT USING (
    auth.uid() IN (SELECT owner_id FROM public.matches WHERE id = match_id) OR
    auth.uid() = user_id
  );

CREATE POLICY "Match owner can add collaborators"
  ON public.collaborators FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT owner_id FROM public.matches WHERE id = match_id)
  );

-- 7. Activity Log
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their activities"
  ON public.activities FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() IN (SELECT owner_id FROM public.matches WHERE id = match_id) OR
    auth.uid() IN (SELECT owner_id FROM public.groups WHERE id = group_id)
  );
