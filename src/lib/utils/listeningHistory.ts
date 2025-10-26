import { getSupabaseClient } from '$lib/server/supabase';
import type { Track } from '$lib/types';

// This is a server-side utility - we'll implement the actual Supabase calls in the API routes
export interface ListeningHistoryEntry {
	id: string;
	user_id: string;
	track_id: string;
	track_title: string;
	artist_name: string;
	album_title: string | null;
	played_at: string;
	duration_ms: number | null;
}

/**
 * Save a track to the user's listening history (server-side implementation)
 * This function is meant to be called from API routes, not directly from client
 */
export async function saveToListeningHistory(track: Track, userId: string): Promise<boolean> {
	// This is a placeholder - the actual implementation will be in the API route
	console.warn('saveToListeningHistory should be called from API routes, not directly');
	return false;
}

/**
 * Get user's recent listening history (server-side implementation)
 * This function is meant to be called from API routes, not directly from client
 */
export async function getListeningHistory(userId: string, limit = 50): Promise<ListeningHistoryEntry[]> {
	// This is a placeholder - the actual implementation will be in the API route
	console.warn('getListeningHistory should be called from API routes, not directly');
	return [];
}