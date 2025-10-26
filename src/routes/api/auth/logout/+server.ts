import { getSupabaseClient } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const supabase = getSupabaseClient();

	if (supabase) {
		await supabase.auth.signOut();
	}

	// Clear cookies
	cookies.delete('sb-access-token', { path: '/' });
	cookies.delete('sb-refresh-token', { path: '/' });

	return json({ success: true });
};