-- ==================================================
-- COMPLETE DATABASE SCHEMA FOR TIDAL-UI MUSIC STREAMING APP
-- ==================================================
-- Instructions:
-- 1. Go to https://app.supabase.com
-- 2. Create a new project (or use existing one)
-- 3. Go to SQL Editor
-- 4. Copy and paste this entire file
-- 5. Click "Run" to execute
-- ==================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================================================
-- USERS TABLE (extends auth.users)
-- ==================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- ==================================================
-- USER PREFERENCES TABLE
-- ==================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark',
    audio_quality TEXT DEFAULT 'high',
    download_path TEXT,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own preferences"
    ON public.user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
    ON public.user_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
    ON public.user_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- ==================================================
-- LISTENING HISTORY TABLE
-- ==================================================
CREATE TABLE IF NOT EXISTS public.listening_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    track_title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    album_title TEXT,
    album_id TEXT, -- Add album ID column
    album_cover TEXT, -- Add album cover column
    played_at TIMESTAMPTZ DEFAULT NOW(),
    duration_ms INTEGER,
    CONSTRAINT unique_user_track_time UNIQUE(user_id, track_id, played_at)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_listening_history_user_id 
    ON public.listening_history(user_id);

CREATE INDEX IF NOT EXISTS idx_listening_history_played_at 
    ON public.listening_history(played_at DESC);

-- Enable RLS
ALTER TABLE public.listening_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own history"
    ON public.listening_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history"
    ON public.listening_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own history"
    ON public.listening_history FOR DELETE
    USING (auth.uid() = user_id);

-- ==================================================
-- ALBUM PLAYBACK HISTORY TABLE
-- ==================================================
CREATE TABLE IF NOT EXISTS public.album_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    album_id TEXT NOT NULL,
    album_title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    cover_url TEXT,
    played_at TIMESTAMPTZ DEFAULT NOW(),
    play_count INTEGER DEFAULT 1,
    last_played TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_album_history_user_id 
    ON public.album_history(user_id);

CREATE INDEX IF NOT EXISTS idx_album_history_album_id 
    ON public.album_history(album_id);

CREATE INDEX IF NOT EXISTS idx_album_history_last_played 
    ON public.album_history(last_played DESC);

-- Enable RLS
ALTER TABLE public.album_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own album history"
    ON public.album_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own album history"
    ON public.album_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own album history"
    ON public.album_history FOR UPDATE
    USING (auth.uid() = user_id);

-- ==================================================
-- DOWNLOAD PREFERENCES TABLE
-- ==================================================
CREATE TABLE IF NOT EXISTS public.download_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    download_mode TEXT DEFAULT 'individual',
    convert_aac_to_mp3 BOOLEAN DEFAULT false,
    download_covers_separately BOOLEAN DEFAULT false,
    quality_preference TEXT DEFAULT 'high',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.download_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own download preferences"
    ON public.download_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own download preferences"
    ON public.download_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own download preferences"
    ON public.download_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- ==================================================
-- PERFORMANCE SETTINGS TABLE
-- ==================================================
CREATE TABLE IF NOT EXISTS public.performance_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    performance_mode TEXT DEFAULT 'high',
    cache_enabled BOOLEAN DEFAULT true,
    preload_threshold INTEGER DEFAULT 45,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.performance_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own performance settings"
    ON public.performance_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own performance settings"
    ON public.performance_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own performance settings"
    ON public.performance_settings FOR UPDATE
    USING (auth.uid() = user_id);

-- ==================================================
-- LYRICS SETTINGS TABLE
-- ==================================================
CREATE TABLE IF NOT EXISTS public.lyrics_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    show_lyrics BOOLEAN DEFAULT true,
    lyrics_language TEXT DEFAULT 'original',
    lyrics_size TEXT DEFAULT 'medium',
    lyrics_position TEXT DEFAULT 'center',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.lyrics_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own lyrics settings"
    ON public.lyrics_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lyrics settings"
    ON public.lyrics_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lyrics settings"
    ON public.lyrics_settings FOR UPDATE
    USING (auth.uid() = user_id);

-- ==================================================
-- TRIGGERS FOR UPDATED_AT
-- ==================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_download_preferences_updated_at
    BEFORE UPDATE ON public.download_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_performance_settings_updated_at
    BEFORE UPDATE ON public.performance_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lyrics_settings_updated_at
    BEFORE UPDATE ON public.lyrics_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================================================
-- FUNCTION: Auto-create user profile on signup
-- ==================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'username'
    );
    
    INSERT INTO public.user_preferences (user_id)
    VALUES (NEW.id);
    
    INSERT INTO public.download_preferences (user_id)
    VALUES (NEW.id);
    
    INSERT INTO public.performance_settings (user_id)
    VALUES (NEW.id);
    
    INSERT INTO public.lyrics_settings (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ==================================================
-- COMPLETED! 🎉
-- ==================================================
-- Next steps:
-- 1. Go to Authentication > Settings
-- 2. Enable Email provider
-- 3. Optionally enable OAuth providers (Google, GitHub, etc.)
-- 4. Copy your project URL and anon key to .env file
-- ==================================================
