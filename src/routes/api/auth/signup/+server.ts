import { getSupabaseClient } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const supabase = getSupabaseClient();

	if (!supabase) {
		return json({ error: 'Supabase no configurado' }, { status: 500 });
	}

	const { email, password, username } = await request.json();

	const { data, error } = await supabase.auth.signUp({
		email,
		password,
		options: {
			data: {
				username
			}
		}
	});

	if (error) {
		// Translate common Supabase errors
		let errorMessage = error.message;
		if (errorMessage.includes('User already registered')) {
			errorMessage = 'Usuario ya registrado';
		} else if (errorMessage.includes('Password should be at least')) {
			errorMessage = 'La contraseña debe tener al menos 6 caracteres';
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