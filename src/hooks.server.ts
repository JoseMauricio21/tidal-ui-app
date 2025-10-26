import { getSupabaseClient } from '$lib/server/supabase';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const supabase = getSupabaseClient();

	if (supabase) {
		// Get session from cookies
		const accessToken = event.cookies.get('sb-access-token');
		const refreshToken = event.cookies.get('sb-refresh-token');

		if (accessToken && refreshToken) {
			const { data: { session } } = await supabase.auth.setSession({
				access_token: accessToken,
				refresh_token: refreshToken
			});

			event.locals.session = session;
			event.locals.user = session?.user ?? null;
		}
	}

	const response = await resolve(event);
	return response;
};
