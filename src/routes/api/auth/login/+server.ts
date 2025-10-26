import { getSupabaseClient } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const supabase = getSupabaseClient();

	if (!supabase) {
		return json({ error: 'Supabase no configurado' }, { status: 500 });
	}

	const { email, password } = await request.json();

	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password
	});

	if (error) {
		// Translate common Supabase errors
		let errorMessage = error.message;
		if (errorMessage.includes('Invalid login credentials')) {
			errorMessage = 'Credenciales de inicio de sesión inválidas';
		} else if (errorMessage.includes('Email not confirmed')) {
			errorMessage = 'Correo electrónico no confirmado';
		}
		return json({ error: errorMessage }, { status: 400 });
	}

	// Set session cookies
	if (data.session) {
		cookies.set('sb-access-token', data.session.access_token, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7 // 1 week
		});

		cookies.set('sb-refresh-token', data.session.refresh_token, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7 // 1 week
		});
	}

	return json({ user: data.user });
};