// Album history store for tracking recently played albums
import { writable, derived } from 'svelte/store';
import type { Album, Artist } from '$lib/types';

const STORAGE_KEY = 'tidal-ui-album-history';
const STORAGE_VERSION_KEY = 'tidal-ui-album-history-version';
const CURRENT_VERSION = '2'; // Increment to force clear old data
const MAX_HISTORY_SIZE = 20;

interface AlbumHistoryEntry {
	album: Album;
	lastPlayed: number; // timestamp
	playCount: number;
}

function loadFromStorage(): AlbumHistoryEntry[] {
	if (typeof window === 'undefined') {
		return [];
	}
	try {
		// Check version and clear if outdated
		const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
		if (storedVersion !== CURRENT_VERSION) {
			console.log('Album history version mismatch, clearing old data');
			localStorage.removeItem(STORAGE_KEY);
			localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_VERSION);
			return [];
		}
		
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return [];
		const parsed = JSON.parse(stored);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		console.error('Failed to load album history from storage:', error);
		return [];
	}
}

function saveToStorage(history: AlbumHistoryEntry[]): void {
	if (typeof window === 'undefined') {
		return;
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
	} catch (error) {
		console.error('Failed to save album history to storage:', error);
	}
}

function createAlbumHistoryStore() {
	const { subscribe, set, update } = writable<AlbumHistoryEntry[]>(loadFromStorage());

	return {
		subscribe,
		addAlbum: (album: Album) =>
			update((history) => {
				const existingIndex = history.findIndex((entry) => entry.album.id === album.id);
				const now = Date.now();

				let newHistory: AlbumHistoryEntry[];

				if (existingIndex >= 0) {
					// Update existing entry
					const existing = history[existingIndex]!;
					newHistory = history.filter((_, i) => i !== existingIndex);
					newHistory.unshift({
						album,
						lastPlayed: now,
						playCount: existing.playCount + 1
					});
				} else {
					// Add new entry
					newHistory = [
						{
							album,
							lastPlayed: now,
							playCount: 1
						},
						...history
					];
				}

				// Limit history size
				newHistory = newHistory.slice(0, MAX_HISTORY_SIZE);
				saveToStorage(newHistory);
				return newHistory;
			}),
		clearHistory: () => {
			set([]);
			saveToStorage([]);
		},
		removeAlbum: (albumId: number) =>
			update((history) => {
				const newHistory = history.filter((entry) => entry.album.id !== albumId);
				saveToStorage(newHistory);
				return newHistory;
			})
	};
}

export const albumHistoryStore = createAlbumHistoryStore();

// Derived store to extract unique artists from album history
export const recentArtistsStore = derived(albumHistoryStore, ($albumHistory) => {
	const artistMap = new Map<number, { artist: Artist; lastPlayed: number }>();
	
	for (const entry of $albumHistory) {
		if (entry.album.artist) {
			const artistId = entry.album.artist.id;
			const existing = artistMap.get(artistId);
			
			if (!existing || entry.lastPlayed > existing.lastPlayed) {
				artistMap.set(artistId, {
					artist: entry.album.artist,
					lastPlayed: entry.lastPlayed
				});
			}
		}
	}
	
	// Convert to array and sort by most recent
	return Array.from(artistMap.values())
		.sort((a, b) => b.lastPlayed - a.lastPlayed)
		.map((item) => item.artist)
		.slice(0, 10); // Limit to 10 artists
});