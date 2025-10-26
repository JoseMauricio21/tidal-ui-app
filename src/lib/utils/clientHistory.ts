import type { Track } from '$lib/types';

/**
 * Save a track to the user's listening history via API
 */
export async function saveToListeningHistory(track: Track): Promise<boolean> {
	try {
		const response = await fetch('/api/history', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(track)
		});

		if (!response.ok) {
			console.error('Failed to save listening history:', await response.text());
			return false;
		}

		const result = await response.json();
		return result.success === true;
	} catch (error) {
		console.error('Failed to save listening history:', error);
		return false;
	}
}

/**
 * Get user's recent listening history via API
 */
export async function getListeningHistory(limit = 50): Promise<any[]> {
	try {
		const response = await fetch(`/api/history?limit=${limit}`);
		
		if (!response.ok) {
			console.error('Failed to fetch listening history:', await response.text());
			return [];
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('Failed to fetch listening history:', error);
		return [];
	}
}