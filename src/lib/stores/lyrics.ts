import { browser } from '$app/environment';
import { get, writable, derived } from 'svelte/store';
import type { Track } from '$lib/types';
import { currentTrack as currentTrackStore } from '$lib/stores/player';

export interface LyricsState {
	open: boolean;
	maximized: boolean;
	track: Track | null;
	refreshToken: number;
}

const initialState: LyricsState = {
	open: false,
	maximized: false,
	track: null,
	refreshToken: 0
};

// Cache for track metadata to avoid recalculation
const trackCache = new Map<string, { metadata: any; timestamp: number; albumColors?: any }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes (increased from 5)

// Debounce utility for performance
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
	let timeout: NodeJS.Timeout;
	return ((...args: any[]) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func(...args), wait);
	}) as T;
}

function createLyricsStore() {
	const store = writable<LyricsState>({ ...initialState });

	let currentTrack: Track | null = null;
	let lastTrackId: string | null = null;

	// Optimized subscription with change detection
	const unsubscribeCurrentTrack = currentTrackStore.subscribe((track) => {
		const newTrackId = track?.id?.toString() ?? null;
		
		// Only update if track actually changed
		if (newTrackId !== lastTrackId) {
			currentTrack = track ?? null;
			lastTrackId = newTrackId;
			
			store.update((state) => {
				const trackChanged = state.track?.id !== currentTrack?.id;
				return {
					...state,
					track: currentTrack,
					refreshToken: trackChanged ? state.refreshToken + 1 : state.refreshToken
				};
			});
		}
	});

	// Debounced refresh to prevent excessive updates
	const debouncedRefresh = debounce(() => {
		store.update((state) => ({
			...state,
			refreshToken: state.refreshToken + 1
		}));
	}, 100);

	function open(targetTrack?: Track | null) {
		const nextTrack = targetTrack ?? currentTrack;
		store.update((state) => {
			const trackChanged = nextTrack && state.track?.id !== nextTrack.id;
			return {
				...state,
				open: true,
				track: nextTrack ?? state.track,
				maximized:
					browser && window.matchMedia('(max-width: 640px)').matches ? true : state.maximized,
				refreshToken: trackChanged ? state.refreshToken + 1 : state.refreshToken
			};
		});
	}

	function close() {
		store.update((state) => ({
			...state,
			open: false,
			maximized: false
		}));
	}

	function toggle() {
		const state = get(store);
		if (state.open) {
			close();
		} else {
			open();
		}
	}

	function toggleMaximize() {
		store.update((state) => ({
			...state,
			maximized: !state.maximized
		}));
	}

	function refresh() {
		debouncedRefresh();
	}

	// Cleanup function
	function destroy() {
		unsubscribeCurrentTrack();
		trackCache.clear();
	}

	return {
		subscribe: store.subscribe,
		open,
		close,
		toggle,
		toggleMaximize,
		refresh,
		destroy
	};
}

export const lyricsStore = createLyricsStore();

// Derived stores for optimized access
export const lyricsOpen = derived(lyricsStore, ($store) => $store.open);
export const lyricsMaximized = derived(lyricsStore, ($store) => $store.maximized);
export const lyricsTrack = derived(lyricsStore, ($store) => $store.track);
export const lyricsRefreshToken = derived(lyricsStore, ($store) => $store.refreshToken);

// Utility functions for caching track metadata
export function getCachedTrackMetadata(trackId: string) {
	const cached = trackCache.get(trackId);
	if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
		return cached;
	}
	return null;
}

export function setCachedTrackMetadata(trackId: string, data: { metadata: any; albumColors?: any }) {
	trackCache.set(trackId, {
		...data,
		timestamp: Date.now()
	});
}

// Preload metadata for upcoming tracks
export function preloadTrackMetadata(trackId: string, metadata: any, albumColors?: any) {
	if (!trackCache.has(trackId)) {
		setCachedTrackMetadata(trackId, { metadata, albumColors });
	}
}

export function clearTrackCache() {
	trackCache.clear();
}

// Performance monitoring utilities
export function getCacheStats() {
	return {
		size: trackCache.size,
		keys: Array.from(trackCache.keys())
	};
}
