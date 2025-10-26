import { getSupabaseClient } from '$lib/server/supabase';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import type { Track } from '$lib/types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const supabase = getSupabaseClient();

	if (!supabase) {
		return json({ error: 'Supabase not configured' }, { status: 500 });
	}

	// Check if user is authenticated
	const { data: { session }, error: sessionError } = await supabase.auth.getSession();
	
	if (sessionError || !session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = session.user.id;
	const track: Track = await request.json();

	try {
		const { error } = await (supabase.from('listening_history') as any).insert({
			user_id: userId,
			track_id: String(track.id),
			track_title: track.title || 'Unknown Track',
			artist_name: track.artist?.name || 'Unknown Artist',
			album_title: track.album?.title || null,
			album_id: track.album?.id ? String(track.album.id) : null, // Add album ID to history
			album_cover: track.album?.cover || null, // Add album cover to history
			duration_ms: track.duration || null,
			played_at: new Date().toISOString()
		});

		if (error) {
			console.error('Error saving to listening history:', error);
			return json({ error: 'Failed to save history' }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Failed to save listening history:', error);
		return json({ error: 'Failed to save history' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const supabase = getSupabaseClient();

	if (!supabase) {
		return json({ error: 'Supabase not configured' }, { status: 500 });
	}

	// Check if user is authenticated
	const { data: { session }, error: sessionError } = await supabase.auth.getSession();
	
	if (sessionError || !session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = session.user.id;
	const limit = parseInt(url.searchParams.get('limit') || '50');

	try {
		const { data, error } = await (supabase.from('listening_history') as any)
			.select('*')
			.eq('user_id', userId)
			.order('played_at', { ascending: false })
			.limit(limit);

		if (error) {
			console.error('Error fetching listening history:', error);
			return json({ error: 'Failed to fetch history' }, { status: 500 });
		}

		return json(data || []);
	} catch (error) {
		console.error('Failed to fetch listening history:', error);
		return json({ error: 'Failed to fetch history' }, { status: 500 });
	}
};