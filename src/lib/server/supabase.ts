import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { Database } from '$lib/types/database';

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient() {
	if (supabaseClient) {
		return supabaseClient;
	}

	const supabaseUrl = env.SUPABASE_URL;
	const supabaseKey = env.SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseKey) {
		console.warn('Supabase credentials not configured');
		return null;
	}

	supabaseClient = createClient<Database>(supabaseUrl, supabaseKey, {
		auth: {
			autoRefreshToken: true,
			persistSession: true,
			detectSessionInUrl: true
		}
	});

	return supabaseClient;
}

export function isSupabaseEnabled(): boolean {
	return getSupabaseClient() !== null;
}
