<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { playerStore } from '$lib/stores/player';
	import { lyricsStore } from '$lib/stores/lyrics';
	import { losslessAPI, DASH_MANIFEST_UNAVAILABLE_CODE } from '$lib/api';
	import type { DashManifestResult } from '$lib/api';
	import { getProxiedUrl } from '$lib/config';
	import { downloadUiStore, ffmpegBanner, activeTrackDownloads } from '$lib/stores/downloadUi';
	import type { Track, AudioQuality } from '$lib/types';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import {
		Play,
		Pause,
		SkipForward,
		SkipBack,
		Volume2,
		VolumeX,
		ListMusic,
		Trash2,
		X,
		Shuffle,
		ScrollText,
		Download
	} from 'lucide-svelte';
	import Loader from './Loader.svelte';

	type ShakaPlayerInstance = {
		load: (uri: string) => Promise<void>;
		unload: () => Promise<void>;
		destroy: () => Promise<void>;
		getNetworkingEngine?: () => {
			registerRequestFilter: (
				callback: (type: unknown, request: { method: string; uris: string[] }) => void
			) => void;
		};
	};

	type ShakaNamespace = {
		Player: new (mediaElement: HTMLMediaElement) => ShakaPlayerInstance;
		polyfill?: {
			installAll?: () => void;
		};
	};

	type ShakaModule = { default: ShakaNamespace };

	let audioElement: HTMLAudioElement;
	let streamUrl = $state('');
	let isMuted = $state(false);
	let previousVolume = 0.8;
	let currentTrackId: number | null = null;
	let loadSequence = 0;
	let bufferedPercent = $state(0);
	let lastQualityTrackId: number | null = null;
	let lastQualityForTrack: AudioQuality | null = null;
	let currentPlaybackQuality = $state<AudioQuality | null>(null);
	const { onHeightChange = () => {} } = $props<{ onHeightChange?: (height: number) => void }>();

	let containerElement: HTMLDivElement | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let showQueuePanel = $state(false);
	// estado para expansión de la carátula (fix: evitar error en plantilla)
	let expandedCover = $state(false);
	let isCompact = $state(false);
	let compactTimer: ReturnType<typeof setTimeout> | null = null;
	let isHovering = $state(false);

	function toggleCoverExpand() {
		expandedCover = !expandedCover;
		// notificar cambio de altura cuando la carátula cambia de tamaño
		notifyContainerHeight();
	}
    const streamCache = new Map<string, string>();
	let preloadingCacheKey: string | null = null;
	const PRELOAD_THRESHOLD_SECONDS = 45;
	const hiResQualities = new Set<AudioQuality>(['HI_RES_LOSSLESS']);
	const dashManifestCache = new Map<string, DashManifestResult>();
	let shakaNamespace: ShakaNamespace | null = null;
	let shakaPlayer: ShakaPlayerInstance | null = null;
	let hiResObjectUrl: string | null = null;
	let shakaNetworkingConfigured = false;
	const sampleRateLabel = $derived(formatSampleRate($playerStore.sampleRate));
	const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
	let dashPlaybackActive = false;
	let dashFallbackAttemptedTrackId: number | null = null;
	let dashFallbackInFlight = false;

	const canUseMediaSession = typeof navigator !== 'undefined' && 'mediaSession' in navigator;
	let mediaSessionTrackId: number | null = null;
	let cleanupMediaSessionHandlers: (() => void) | null = null;
	let lastKnownPlaybackState: 'none' | 'paused' | 'playing' = 'none';

	function getCacheKey(trackId: number, quality: AudioQuality) {
		return `${trackId}:${quality}`;
	}

	function isHiResQuality(quality: AudioQuality | undefined): boolean {
		return quality ? hiResQualities.has(quality) : false;
	}

	function revokeHiResObjectUrl() {
		if (hiResObjectUrl) {
			URL.revokeObjectURL(hiResObjectUrl);
			hiResObjectUrl = null;
		}
	}

	async function destroyShakaPlayer() {
		revokeHiResObjectUrl();
		if (shakaPlayer) {
			try {
				await shakaPlayer.destroy();
			} catch (error) {
				console.debug('Failed to destroy Shaka player', error);
			}
			shakaPlayer = null;
		}
		shakaNetworkingConfigured = false;
		dashPlaybackActive = false;
	}

	async function ensureShakaPlayer(): Promise<ShakaPlayerInstance> {
		if (!audioElement) {
			throw new Error('Audio element not ready for Shaka initialization');
		}
		if (!shakaNamespace) {
			// @ts-expect-error Shaka Player's compiled bundle does not expose module typings.
			const module = await import('shaka-player/dist/shaka-player.compiled.js');
			const resolved = (module as ShakaModule | { default: ShakaNamespace }).default ??
				(module as unknown as ShakaNamespace);
			shakaNamespace = resolved;
			if (shakaNamespace?.polyfill?.installAll) {
				try {
					shakaNamespace.polyfill.installAll();
				} catch (error) {
					console.debug('Shaka polyfill installation failed', error);
				}
			}
		}
		if (!shakaNamespace) {
			throw new Error('Shaka namespace unavailable');
		}
		if (!shakaPlayer) {
			shakaPlayer = new shakaNamespace.Player(audioElement);
			const networking = shakaPlayer.getNetworkingEngine?.();
			if (networking && !shakaNetworkingConfigured) {
				networking.registerRequestFilter((type, request) => {
					if (request.method === 'HEAD') {
						request.method = 'GET';
					}
					if (Array.isArray(request.uris)) {
						request.uris = request.uris.map((uri) => getProxiedUrl(uri));
					}
				});
				shakaNetworkingConfigured = true;
			}
		}
		audioElement.crossOrigin = 'anonymous';
		return shakaPlayer!;
	}

	function pruneDashManifestCache() {
		const keepKeys = new Set<string>();
		const dashQuality: AudioQuality = 'HI_RES_LOSSLESS';
		const current = $playerStore.currentTrack;
		if (current) {
			keepKeys.add(getCacheKey(current.id, dashQuality));
		}
		const { queue, queueIndex } = $playerStore;
		const nextTrack = queue[queueIndex + 1];
		if (nextTrack) {
			keepKeys.add(getCacheKey(nextTrack.id, dashQuality));
		}
		for (const key of dashManifestCache.keys()) {
			if (!keepKeys.has(key)) {
				dashManifestCache.delete(key);
			}
		}
	}

	function cacheFlacFallback(trackId: number, result: DashManifestResult) {
		if (result.kind !== 'flac') {
			return;
		}
		const fallbackUrl = result.urls.find((candidate) => typeof candidate === 'string' && candidate.length > 0);
		if (!fallbackUrl) {
			return;
		}
		const proxied = getProxiedUrl(fallbackUrl);
		streamCache.set(getCacheKey(trackId, 'LOSSLESS'), proxied);
	}

	async function resolveStream(track: Track, overrideQuality?: AudioQuality): Promise<string> {
		const quality = overrideQuality ?? $playerStore.quality;
		if (isHiResQuality(quality)) {
			throw new Error('Attempted to resolve hi-res stream via standard resolver');
		}
		const cacheKey = getCacheKey(track.id, quality);
		const cached = streamCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const rawUrl = await losslessAPI.getStreamUrl(track.id, quality);
		const proxied = getProxiedUrl(rawUrl);
		streamCache.set(cacheKey, proxied);
		return proxied;
	}

	function pruneStreamCache() {
		const quality = $playerStore.quality;
		const keepKeys = new Set<string>();
		const baseQualities: AudioQuality[] = isHiResQuality(quality) ? ['LOSSLESS'] : [quality];
		const current = $playerStore.currentTrack;
		if (current) {
			for (const base of baseQualities) {
				keepKeys.add(getCacheKey(current.id, base));
			}
		}
		const { queue, queueIndex } = $playerStore;
		const nextTrack = queue[queueIndex + 1];
		if (nextTrack) {
			for (const base of baseQualities) {
				keepKeys.add(getCacheKey(nextTrack.id, base));
			}
		}

		for (const key of streamCache.keys()) {
			if (!keepKeys.has(key)) {
				streamCache.delete(key);
			}
		}
	}

	async function preloadDashManifest(track: Track) {
		const cacheKey = getCacheKey(track.id, 'HI_RES_LOSSLESS');
		if (dashManifestCache.has(cacheKey) || preloadingCacheKey === cacheKey) {
			const cached = dashManifestCache.get(cacheKey);
			if (cached) {
				cacheFlacFallback(track.id, cached);
			}
			return;
		}

		preloadingCacheKey = cacheKey;
		try {
			const result = await losslessAPI.getDashManifest(track.id, 'HI_RES_LOSSLESS');
			dashManifestCache.set(cacheKey, result);
			cacheFlacFallback(track.id, result);
			pruneDashManifestCache();
		} catch (error) {
			console.warn('Failed to preload dash manifest:', error);
		} finally {
			if (preloadingCacheKey === cacheKey) {
				preloadingCacheKey = null;
			}
		}
	}

	async function preloadNextTrack(track: Track) {
		const quality = $playerStore.quality;
		// Precargar tanto DASH como stream estándar en paralelo de manera agresiva
		const dashKey = getCacheKey(track.id, 'HI_RES_LOSSLESS');
		const standardKey = getCacheKey(track.id, quality);
		
		// Precarga en paralelo sin esperar
		const promises: Promise<unknown>[] = [];
		
		// Precarga DASH si es necesario
		if (isHiResQuality(quality) && !dashManifestCache.has(dashKey) && preloadingCacheKey !== dashKey) {
			promises.push(preloadDashManifest(track).catch(() => {}));
		}
		
		// Precarga stream estándar en paralelo
		if (!streamCache.has(standardKey)) {
			promises.push(resolveStream(track, quality).catch(() => {}));
		}
		
		// También precargar LOSSLESS como fallback si estamos en Hi-Res
		if (isHiResQuality(quality)) {
			const losslessKey = getCacheKey(track.id, 'LOSSLESS');
			if (!streamCache.has(losslessKey)) {
				promises.push(resolveStream(track, 'LOSSLESS').catch(() => {}));
			}
		}
		
		// No esperamos, solo disparamos las precargas
		if (promises.length > 0) {
			Promise.all(promises).catch(() => {});
		}
	}

	function maybePreloadNextTrack(remainingSeconds: number) {
		if (remainingSeconds > PRELOAD_THRESHOLD_SECONDS) {
			return;
		}
		const { queue, queueIndex } = $playerStore;
		const nextTrack = queue[queueIndex + 1];
		if (!nextTrack) {
			return;
		}
		const dashKey = getCacheKey(nextTrack.id, 'HI_RES_LOSSLESS');
		if (dashManifestCache.has(dashKey) || preloadingCacheKey === dashKey) {
			return;
		}
		preloadNextTrack(nextTrack);
	}

	$effect(() => {
		const current = $playerStore.currentTrack;
		if (!audioElement || !current) {
			if (!current) {
				currentTrackId = null;
				streamUrl = '';
				bufferedPercent = 0;
				dashPlaybackActive = false;
				dashFallbackAttemptedTrackId = null;
				dashFallbackInFlight = false;
				lastQualityTrackId = null;
				lastQualityForTrack = null;
				currentPlaybackQuality = null;
			}
		} else if (current.id !== currentTrackId) {
			currentTrackId = current.id;
			streamUrl = '';
			bufferedPercent = 0;
			dashPlaybackActive = false;
			dashFallbackAttemptedTrackId = null;
			dashFallbackInFlight = false;
			lastQualityTrackId = current.id;
			lastQualityForTrack = $playerStore.quality;
			currentPlaybackQuality = null;
			loadTrack(current);
			
			// Mostrar versión expandida por 5 segundos al cambiar canción
			showExpandedThenCompact();
			
			// Precargar inmediatamente la siguiente canción cuando se carga una nueva
			const { queue, queueIndex } = $playerStore;
			const nextTrack = queue[queueIndex + 1];
			if (nextTrack) {
				setTimeout(() => preloadNextTrack(nextTrack), 100);
			}
		}
	});

	$effect(() => {
		const track = $playerStore.currentTrack;
		if (!audioElement || !track) {
			return;
		}
		const quality = $playerStore.quality;
		if (lastQualityTrackId === track.id && lastQualityForTrack === quality) {
			return;
		}
		lastQualityTrackId = track.id;
		lastQualityForTrack = quality;
		loadTrack(track);
	});

	$effect(() => {
		if (showQueuePanel && $playerStore.queue.length === 0) {
			showQueuePanel = false;
		}
	});

	$effect(() => {
		if (canUseMediaSession) {
			updateMediaSessionMetadata($playerStore.currentTrack);
		}
	});

	$effect(() => {
		if (canUseMediaSession) {
			const hasTrack = Boolean($playerStore.currentTrack);
			updateMediaSessionPlaybackState(
				hasTrack ? ($playerStore.isPlaying ? 'playing' : 'paused') : 'none'
			);
		}
	});

	function toggleQueuePanel() {
		showQueuePanel = !showQueuePanel;
	}

	function closeQueuePanel() {
		showQueuePanel = false;
	}

	function playFromQueue(index: number) {
		playerStore.playAtIndex(index);
	}

	function removeFromQueue(index: number, event?: MouseEvent) {
		if (event) {
			event.stopPropagation();
		}
		playerStore.removeFromQueue(index);
	}

	function clearQueue() {
		playerStore.clearQueue();
	}

	function handleShuffleQueue() {
		playerStore.shuffleQueue();
	}

	$effect(() => {
		if (audioElement) {
			audioElement.volume = $playerStore.volume;
		}
	});

	$effect(() => {
		if ($playerStore.isPlaying && audioElement) {
			audioElement.play().catch(console.error);
		} else if (!$playerStore.isPlaying && audioElement) {
			audioElement.pause();
		}
	});

	async function loadStandardTrack(track: Track, quality: AudioQuality, sequence: number) {
		await destroyShakaPlayer();
		dashPlaybackActive = false;
		const resolvedUrl = await resolveStream(track, quality);
		if (sequence !== loadSequence) {
			return;
		}
		streamUrl = resolvedUrl;
		currentPlaybackQuality = quality;
		pruneStreamCache();
		if (audioElement) {
			audioElement.crossOrigin = 'anonymous';
			// Set playback to start immediately when enough data is available
			audioElement.preload = 'auto';
			audioElement.load();
			// Intentar reproducir inmediatamente para reducir latencia
			if ($playerStore.isPlaying) {
				// Use promise to start playback as soon as possible
				const playPromise = audioElement.play();
				if (playPromise !== undefined) {
					playPromise.catch(() => {});
				}
			}
		}
	}

	async function loadDashTrack(
		track: Track,
		quality: AudioQuality,
		sequence: number
	): Promise<DashManifestResult> {
		const cacheKey = getCacheKey(track.id, quality);
		let manifestResult = dashManifestCache.get(cacheKey);
		if (!manifestResult) {
			manifestResult = await losslessAPI.getDashManifest(track.id, quality);
			dashManifestCache.set(cacheKey, manifestResult);
		}
		cacheFlacFallback(track.id, manifestResult);
		if (manifestResult.kind === 'flac') {
			dashPlaybackActive = false;
			return manifestResult;
		}
		revokeHiResObjectUrl();
		const blob = new Blob([manifestResult.manifest], {
			type: manifestResult.contentType ?? 'application/dash+xml'
		});
		hiResObjectUrl = URL.createObjectURL(blob);

		// ensure Shaka player instance attached to audioElement
		const player = await ensureShakaPlayer();
		if (sequence !== loadSequence) {
			return manifestResult;
		}

		try {
			// pause native element and clear src to allow Shaka to take control
			if (audioElement) {
				try {
					audioElement.pause();
				} catch (err) {
					/* ignore */
				}
				audioElement.removeAttribute('src');
				audioElement.load();
				audioElement.crossOrigin = 'anonymous';
			}

			// unload any previous content then load the MPD (object URL)
			try {
				await player.unload();
			} catch (e) {
				// non-fatal, continue to load
				console.debug('Shaka unload failed (continuing):', e);
			}

			await player.load(hiResObjectUrl);

			// confirm still the intended load sequence
			if (sequence !== loadSequence) {
				return manifestResult;
			}

			// mark DASH active and clear streamUrl (we use Shaka)
			dashPlaybackActive = true;
			streamUrl = '';
			currentPlaybackQuality = 'HI_RES_LOSSLESS';
			pruneDashManifestCache();

			// If UI/state indicates playback, start playing (attempt)
			if ($playerStore.isPlaying && audioElement) {
				// intentar reproducir inmediatamente; si falla, dejar que el efecto global lo maneje
				audioElement.play().catch((err) => {
					console.debug('Shaka-driven audioElement.play() failed:', err);
				});
			}

			return manifestResult;
		} catch (error) {
			// si falla la carga DASH, asegurarse de limpiar estado para fallback
			try {
				await player.unload();
			} catch (_) {
				// ignore
			}
			dashPlaybackActive = false;
			hiResObjectUrl && URL.revokeObjectURL(hiResObjectUrl);
			hiResObjectUrl = null;
			throw error;
		}
	}

	async function updateSampleRateForTrack(
		track: Track,
		quality: AudioQuality,
		sequence: number
	): Promise<void> {
		try {
			const metadata = await losslessAPI.getPreferredTrackMetadata(track.id, quality);
			if (sequence !== loadSequence) {
				return;
			}
			if (currentTrackId !== track.id) {
				return;
			}
			const rate = metadata.info?.sampleRate;
			const normalized =
				typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? Math.round(rate) : null;
			playerStore.setSampleRate(normalized ?? null);
		} catch (error) {
			console.debug('Failed to update track sample rate', error);
			if (sequence === loadSequence && currentTrackId === track.id) {
				playerStore.setSampleRate(null);
			}
		}
	}

	async function loadTrack(track: Track) {
		const sequence = ++loadSequence;
		playerStore.setLoading(true);
		bufferedPercent = 0;
		currentPlaybackQuality = null;
		const requestedQuality = $playerStore.quality;
		const scheduleSampleRateUpdate = (quality: AudioQuality) => {
			void updateSampleRateForTrack(track, quality, sequence);
		};
		if (dashFallbackAttemptedTrackId && dashFallbackAttemptedTrackId !== track.id) {
			dashFallbackAttemptedTrackId = null;
		}

		try {
			// Force LOSSLESS for immediate playback, skip Hi-Res attempts to avoid delays
			if (isHiResQuality(requestedQuality)) {
				console.info('[AudioPlayer] Hi-Res quality requested, starting with LOSSLESS for immediate playback.');
				scheduleSampleRateUpdate('LOSSLESS');
				await loadStandardTrack(track, 'LOSSLESS', sequence);
				
				// Try to upgrade to Hi-Res in background after playback starts
				setTimeout(async () => {
					if (sequence !== loadSequence || currentTrackId !== track.id) return;
					try {
						const hiResQuality: AudioQuality = 'HI_RES_LOSSLESS';
						const result = await loadDashTrack(track, hiResQuality, sequence);
						if (result.kind === 'dash' && sequence === loadSequence) {
							scheduleSampleRateUpdate(hiResQuality);
						}
					} catch (error) {
						// Silently stay on LOSSLESS if Hi-Res fails
						console.debug('[AudioPlayer] Background Hi-Res upgrade failed, staying on LOSSLESS');
					}
				}, 2000); // Wait 2 seconds before attempting upgrade
				return;
			}

			// For non-Hi-Res qualities, load normally
			await loadStandardTrack(track, requestedQuality, sequence);
			scheduleSampleRateUpdate(requestedQuality);
		} catch (error) {
			console.error('Failed to load track:', error);
			// Fallback to LOSSLESS if initial load fails
			if (sequence === loadSequence && requestedQuality !== 'LOSSLESS') {
				try {
					console.info('[AudioPlayer] Falling back to LOSSLESS quality.');
					await loadStandardTrack(track, 'LOSSLESS', sequence);
					scheduleSampleRateUpdate('LOSSLESS');
				} catch (fallbackError) {
					console.error('LOSSLESS fallback also failed:', fallbackError);
				}
			}
		} finally {
			if (sequence === loadSequence) {
				playerStore.setLoading(false);
			}
		}
	}

	function handleTimeUpdate() {
		if (audioElement) {
			playerStore.setCurrentTime(audioElement.currentTime);
			updateBufferedPercent();
			const remaining = ($playerStore.duration ?? 0) - audioElement.currentTime;
			maybePreloadNextTrack(remaining);
			updateMediaSessionPositionState();
		}
	}

	async function fallbackToLosslessAfterDashError(reason: string) {
		if (dashFallbackInFlight) {
			return;
		}
		const track = $playerStore.currentTrack;
		if (!track) {
			return;
		}
		if (dashFallbackAttemptedTrackId === track.id) {
			return;
		}
		dashFallbackInFlight = true;
		dashFallbackAttemptedTrackId = track.id;
		const sequence = ++loadSequence;
		console.warn(`Attempting lossless fallback after DASH playback error (${reason}).`);
		try {
			dashPlaybackActive = false;
			playerStore.setLoading(true);
			bufferedPercent = 0;
			await loadStandardTrack(track, 'LOSSLESS', sequence);
			await updateSampleRateForTrack(track, 'LOSSLESS', sequence);
		} catch (fallbackError) {
			console.error('Lossless fallback after DASH playback error failed', fallbackError);
			if (sequence === loadSequence) {
				playerStore.setLoading(false);
			}
		} finally {
			dashFallbackInFlight = false;
		}
	}

	function handleAudioError(event: Event) {
		if (!dashPlaybackActive || !isFirefox) {
			return;
		}
		const element = event.currentTarget as HTMLAudioElement | null;
		const mediaError = element?.error ?? null;
		const code = mediaError?.code;
		const decodeConstant = mediaError?.MEDIA_ERR_DECODE;
		const isDecodeError = typeof code === 'number' && typeof decodeConstant === 'number'
			? code === decodeConstant
			: false;
		const reason = isDecodeError ? 'decode error' : code ? `code ${code}` : 'unknown error';
		void fallbackToLosslessAfterDashError(reason);
	}

	function handleDurationChange() {
		if (audioElement) {
			playerStore.setDuration(audioElement.duration);
			updateBufferedPercent();
			updateMediaSessionPositionState();
		}
	}

	function updateBufferedPercent() {
		if (!audioElement) {
			bufferedPercent = 0;
			return;
		}

		const { duration, buffered, currentTime } = audioElement;
		if (!Number.isFinite(duration) || duration <= 0 || buffered.length === 0) {
			bufferedPercent = 0;
			return;
		}

		let bufferedEnd = 0;
		for (let i = 0; i < buffered.length; i += 1) {
			const start = buffered.start(i);
			const end = buffered.end(i);
			if (start <= currentTime && end >= currentTime) {
				bufferedEnd = end;
				break;
			}
			bufferedEnd = Math.max(bufferedEnd, end);
		}

		bufferedPercent = Math.max(0, Math.min(100, (bufferedEnd / duration) * 100));
	}

	function handleProgress() {
		updateBufferedPercent();
	}

	function handleLoadedData() {
		playerStore.setLoading(false);
		updateBufferedPercent();
		updateMediaSessionPositionState();
	}

	function getPercent(current: number, total: number): number {
		if (!Number.isFinite(total) || total <= 0) {
			return 0;
		}
		return Math.max(0, Math.min(100, (current / total) * 100));
	}

	function handleEnded() {
		playerStore.next();
		updateMediaSessionPositionState();
	}

	function handleSeek(event: MouseEvent) {
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const percent = (event.clientX - rect.left) / rect.width;
		const newTime = percent * $playerStore.duration;

		if (audioElement) {
			audioElement.currentTime = newTime;
			playerStore.setCurrentTime(newTime);
			updateMediaSessionPositionState();
		}
	}

	function handleVolumeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const newVolume = parseFloat(target.value);
		playerStore.setVolume(newVolume);
		if (newVolume > 0 && isMuted) {
			isMuted = false;
		}
	}

	function handleLyricsSeekEvent(event: Event) {
		const customEvent = event as CustomEvent<{ timeSeconds?: number }>;
		const targetSeconds = customEvent.detail?.timeSeconds;
		if (typeof targetSeconds !== 'number' || !audioElement) {
			return;
		}

		const seekSeconds = Math.max(0, targetSeconds);
		audioElement.currentTime = seekSeconds;
		playerStore.setCurrentTime(seekSeconds);
		updateMediaSessionPositionState();

		const state = get(playerStore);
		if (!state.isPlaying) {
			playerStore.play();
		}

		audioElement.play().catch(() => {});
	}

	function toggleMute() {
		if (isMuted) {
			playerStore.setVolume(previousVolume);
		 isMuted = false;
		} else {
			previousVolume = $playerStore.volume;
			playerStore.setVolume(0);
			isMuted = true;
		}
	}

	function formatTime(seconds: number): string {
		if (isNaN(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function formatQualityLabel(quality?: string): string {
		if (!quality) return '—';
		const normalized = quality.toUpperCase();
		if (normalized === 'LOSSLESS') {
			return 'CD';
		}
		if (normalized === 'HI_RES_LOSSLESS') {
			return 'Hi-Res';
		}
		return quality;
	}

	// Devuelve el título del álbum truncado a `max` caracteres visibles.
	// Si el título es más largo, añade una elipsis unicode (…).
	// Valor por defecto aumentado a 30 según solicitud del usuario.
	function formatAlbumTitle(title?: string | null, max = 30): string {
		if (!title) return '';
		// Normalizar espacios consecutivos a uno solo para evitar contar múltiples espacios
		const cleaned = title.replace(/\s+/g, ' ').trim();
		return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
	}

	// descripción legible para cada calidad (mostrar en UI)
	function getQualityDetail(quality?: AudioQuality | string | null): string {
		const q = (quality ?? $playerStore.quality) as string;
		switch (q) {
			case 'HI_RES_LOSSLESS':
				// Mostrar solo el detalle técnico, sin repetir la etiqueta "Hi-Res" en la segunda columna
				return 'FLAC 24-bit (DASH) hasta 192 kHz';
			case 'LOSSLESS':
				// Evitar repetir "CD" en el detalle (se muestra con formatQualityLabel)
				return 'FLAC 16-bit / 44.1 kHz';
			case 'AAC320':
				return 'AAC 320kbps — Streaming de alta calidad AAC';
			case 'AAC96':
				return 'AAC 96kbps — Ahorro de datos AAC';
			default:
				return '';
		}
	}

	function formatSampleRate(value?: number | null): string | null {
		if (!Number.isFinite(value ?? NaN) || !value || value <= 0) {
			return null;
		}
		const kilohertz = value / 1000;
		const precision = kilohertz >= 100 || Math.abs(kilohertz - Math.round(kilohertz)) < 0.05 ? 0 : 1;
		const formatted = kilohertz.toFixed(precision).replace(/\.0$/, '');
		return `${formatted} kHz`;
	}

	function formatMegabytes(bytes?: number | null): string | null {
		if (!Number.isFinite(bytes ?? NaN) || !bytes || bytes <= 0) {
			return null;
		}
		const value = bytes / (1024 * 1024);
		const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
		return `${value.toFixed(digits)} MB`;
	}

	function formatPercent(value: number | null | undefined): string {
		if (!Number.isFinite(value ?? NaN)) {
			return '0%';
		}
		const percent = Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)));
		return `${percent}%`;
	}

	function formatTransferStatus(received: number, total?: number): string {
		const receivedLabel = formatMegabytes(received) ?? '0 MB';
		const totalLabel = formatMegabytes(total) ?? null;
		return totalLabel ? `${receivedLabel} / ${totalLabel}` : receivedLabel;
	}

	$effect(() => {
		if ($ffmpegBanner.phase === 'ready') {
			const timeout = setTimeout(() => {
				downloadUiStore.dismissFfmpeg();
			}, 3200);
			return () => clearTimeout(timeout);
		}
	});

	function getMediaSessionArtwork(track: Track): MediaImage[] {
		if (!track.album?.cover) {
			return [];
		}

		const sizes = ['80', '160', '320', '640', '1280'] as const;
		const artwork: MediaImage[] = [];

		for (const size of sizes) {
			const src = losslessAPI.getCoverUrl(track.album.cover, size);
			if (src) {
				artwork.push({
					src,
					sizes: `${size}x${size}`,
					type: 'image/jpeg'
				});
			}
		}

		return artwork;
	}

	function updateMediaSessionMetadata(track: Track | null) {
		if (!canUseMediaSession) {
			return;
		}

		if (!track) {
			mediaSessionTrackId = null;
			lastKnownPlaybackState = 'none';
			try {
				navigator.mediaSession.metadata = null;
				navigator.mediaSession.playbackState = 'none';
			} catch (error) {
				console.debug('Media Session reset failed', error);
			}
			return;
		}

		if (mediaSessionTrackId === track.id) {
			return;
		}

		mediaSessionTrackId = track.id;

		try {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: track.title,
				artist: track.artist?.name ?? '',
				album: track.album?.title ?? '',
				artwork: getMediaSessionArtwork(track)
			});
		} catch (error) {
			console.debug('Unable to set Media Session metadata', error);
		}

		updateMediaSessionPositionState();
	}

	function updateMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none') {
		if (!canUseMediaSession) {
			return;
		}

		if (lastKnownPlaybackState === state) {
			return;
		}
		lastKnownPlaybackState = state;

		try {
			navigator.mediaSession.playbackState = state;
		} catch (error) {
			console.debug('Unable to set Media Session playback state', error);
		}
	}

	function updateMediaSessionPositionState() {
		if (
			!canUseMediaSession ||
			!audioElement ||
			typeof navigator.mediaSession.setPositionState !== 'function'
		) {
			return;
		}

		const durationFromAudio = audioElement.duration;
		const storeState = get(playerStore);
		const duration = Number.isFinite(durationFromAudio) ? durationFromAudio : storeState.duration;

		try {
			navigator.mediaSession.setPositionState({
				duration: Number.isFinite(duration) ? duration : 0,
				playbackRate: audioElement.playbackRate ?? 1,
				position: audioElement.currentTime
			});
		} catch (error) {
			console.debug('Unable to set Media Session position state', error);
		}
	}

	function registerMediaSessionHandlers() {
		if (!canUseMediaSession) {
			return;
		}

		const safeSetActionHandler = (
			action: MediaSessionAction,
			handler: MediaSessionActionHandler | null
		) => {
			try {
				navigator.mediaSession.setActionHandler(action, handler);
			} catch (error) {
				console.debug(`Media Session action ${action} unsupported`, error);
			}
		};

		safeSetActionHandler('play', async () => {
			playerStore.play();
			if (!audioElement) return;
			try {
				await audioElement.play();
			} catch (error) {
				console.debug('Media Session play failed', error);
			}
			updateMediaSessionPlaybackState('playing');
			updateMediaSessionPositionState();
		});

		safeSetActionHandler('pause', () => {
			playerStore.pause();
			audioElement?.pause();
			updateMediaSessionPlaybackState('paused');
			updateMediaSessionPositionState();
		});

		safeSetActionHandler('previoustrack', () => {
			playerStore.previous();
		});

		safeSetActionHandler('nexttrack', () => {
			playerStore.next();
		});

		const handleSeekDelta =
			(direction: 'forward' | 'backward') => (details: MediaSessionActionDetails) => {
				if (!audioElement) return;
				const offset = details.seekOffset ?? 10;
				const delta = direction === 'forward' ? offset : -offset;
				const tentative = audioElement.currentTime + delta;
				const duration = audioElement.duration;
				const bounded = Number.isFinite(duration)
					? Math.min(Math.max(0, tentative), Math.max(duration, 0))
					: Math.max(0, tentative);
				audioElement.currentTime = bounded;
				playerStore.setCurrentTime(bounded);
				updateMediaSessionPositionState();
			};

		safeSetActionHandler('seekforward', handleSeekDelta('forward'));
		safeSetActionHandler('seekbackward', handleSeekDelta('backward'));

		safeSetActionHandler('seekto', (details) => {
			if (!audioElement || details.seekTime === undefined) return;
			const nextTime = Math.max(0, details.seekTime);
			audioElement.currentTime = nextTime;
			playerStore.setCurrentTime(nextTime);
			updateMediaSessionPositionState();
		});

		safeSetActionHandler('stop', () => {
			playerStore.pause();
			if (audioElement) {
				audioElement.pause();
				audioElement.currentTime = 0;
			}
			playerStore.setCurrentTime(0);
			updateMediaSessionPlaybackState('paused');
			updateMediaSessionPositionState();
		});

		cleanupMediaSessionHandlers = () => {
			const actions: MediaSessionAction[] = [
				'play',
				'pause',
				'previoustrack',
				'nexttrack',
				'seekforward',
				'seekbackward',
				'seekto',
				'stop'
			];
			for (const action of actions) {
				safeSetActionHandler(action, null);
			}
			mediaSessionTrackId = null;
			lastKnownPlaybackState = 'none';
		};
	}

	onMount(() => {
		let detachLyricsSeek: (() => void) | null = null;

		if (audioElement) {
			audioElement.volume = $playerStore.volume;
		}

		if (containerElement) {
			notifyContainerHeight();
			resizeObserver = new ResizeObserver(() => {
				notifyContainerHeight();
			});
			resizeObserver.observe(containerElement);
		}

		if (canUseMediaSession) {
			registerMediaSessionHandlers();
			const state = get(playerStore);
			updateMediaSessionMetadata(state.currentTrack);
			updateMediaSessionPlaybackState(
				state.currentTrack ? (state.isPlaying ? 'playing' : 'paused') : 'none'
			);
			updateMediaSessionPositionState();
		}

		if (typeof window !== 'undefined') {
			const listener = (event: Event) => handleLyricsSeekEvent(event);
			window.addEventListener('lyrics:seek', listener as EventListener);
			detachLyricsSeek = () => {
				window.removeEventListener('lyrics:seek', listener as EventListener);
			};
		}

		return () => {
			if (compactTimer) {
				clearTimeout(compactTimer);
				compactTimer = null;
			}
			resizeObserver?.disconnect();
			cleanupMediaSessionHandlers?.();
			cleanupMediaSessionHandlers = null;
			detachLyricsSeek?.();
			destroyShakaPlayer().catch((error) => {
				console.debug('Shaka cleanup failed', error);
			});
			if (canUseMediaSession) {
				try {
					navigator.mediaSession.metadata = null;
					navigator.mediaSession.playbackState = 'none';
				} catch (error) {
					console.debug('Failed to clean up Media Session', error);
				}
			}
		};
	});

	function notifyContainerHeight() {
		if (typeof onHeightChange === 'function' && containerElement) {
			onHeightChange(containerElement.offsetHeight ?? 0);
		}
	}

	function showExpandedThenCompact() {
		// Limpiar timer anterior si existe
		if (compactTimer) {
			clearTimeout(compactTimer);
			compactTimer = null;
		}
		
		// Mostrar versión expandida
		isCompact = false;
		
		// Después de 5 segundos, cambiar a versión compacta
		compactTimer = setTimeout(() => {
			isCompact = true;
			compactTimer = null;
		}, 5000);
	}

	function toggleCompactMode() {
		if (compactTimer) {
			clearTimeout(compactTimer);
			compactTimer = null;
		}
		isCompact = !isCompact;
	}

	function handleMouseEnter() {
		isHovering = true;
	}

	function handleMouseLeave() {
		isHovering = false;
	}

	function handleDoubleClick() {
		lyricsStore.toggle();
	}

	function navigateToAlbum(event: MouseEvent) {
		event.stopPropagation();
		const albumId = $playerStore.currentTrack?.album?.id;
		if (albumId) {
			goto(`/album/${albumId}`);
		}
	}

	function navigateToArtist(event: MouseEvent) {
		event.stopPropagation();
		const artistId = $playerStore.currentTrack?.artist?.id;
		if (artistId) {
			goto(`/artist/${artistId}`);
		}
	}
</script>

<audio
	bind:this={audioElement}
	src={streamUrl}
	ontimeupdate={handleTimeUpdate}
	ondurationchange={handleDurationChange}
	onended={handleEnded}
	onloadeddata={handleLoadedData}
	onloadedmetadata={updateBufferedPercent}
	onprogress={handleProgress}
	onerror={handleAudioError}
	preload="auto"
	class="hidden"
></audio>

{#if $playerStore.currentTrack}
<div
	class="audio-player-backdrop fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-[95%] max-w-2xl s-7jTt0_FmVq-J {isCompact && !isHovering ? 'compact' : ''}"
	bind:this={containerElement}
	ondblclick={handleDoubleClick}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	transition:slide={{ duration: 400, easing: cubicOut, axis: 'y' }}
>
  <div class="relative bg-transparent shadow-lg rounded-2xl {isCompact && !isHovering ? 'p-2' : 'p-6'}" style="transition: padding 0.5s cubic-bezier(0.4, 0, 0.2, 1);">
    <div class="audio-player-glass overflow-hidden rounded-2xl border shadow-2xl">
      <div class="relative {isCompact && !isHovering ? 'px-3 py-2' : 'px-4 py-3 pt-6 sm:pt-6'}" style="transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);">
        {#if $playerStore.currentTrack?.album?.title}
            <div 
                class="album-corner {isCompact && !isHovering ? 'compact' : ''}"
                onclick={navigateToAlbum}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && navigateToAlbum(e)}
                style="cursor: pointer; pointer-events: auto;"
            >
                <div class="album-label">Estas escuchando:</div>
				<div class="album-title">{formatAlbumTitle($playerStore.currentTrack.album.title)}</div>
            </div>
        {/if}

        <!-- Quality indicator in compact mode (top-right corner) -->
        {#if isCompact && !isHovering && currentPlaybackQuality}
            <div class="quality-corner compact">
                <div class="quality-badge">
                    {getQualityDetail(currentPlaybackQuality)}
                </div>
            </div>
        {/if}

        <!-- Wave Animation -->
            <div class="{isCompact && !isHovering ? 'mb-2' : 'mb-3'} flex justify-center" style="transition: margin 0.5s cubic-bezier(0.4, 0, 0.2, 1);">
                <ul class="wave-menu {!$playerStore.isPlaying ? 'paused' : ''} {isCompact && !isHovering ? 'compact' : ''}">
                    <li></li>
                    <li></li>
                    <li></li>
                    <li></li>
                    <li></li>
                    <li></li>
                    <li></li>
                    <li></li>
                    <li></li>
                    <li></li>
                </ul>
            </div>

            <!-- Barra de progreso -->
            <div class="{isCompact && !isHovering ? 'mb-2' : 'mb-3'}" style="transition: margin 0.5s cubic-bezier(0.4, 0, 0.2, 1);">
                <button
                    onclick={handleSeek}
                    class="group relative {isCompact && !isHovering ? 'h-0.5' : 'h-1'} w-full cursor-pointer overflow-hidden rounded-full {isCompact && !isHovering ? 'bg-white/20' : 'bg-gray-700'}"
                    type="button"
                    aria-label="Seek position"
                    style="transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);"
                >
                    <div
                        class="pointer-events-none absolute inset-y-0 left-0 {isCompact && !isHovering ? 'bg-white/40' : 'bg-blue-400/30'} transition-all"
                        style="width: {bufferedPercent}%; transition: background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s;"
                        aria-hidden="true"
                    ></div>
                    <div
                        class="pointer-events-none absolute inset-y-0 left-0 {isCompact && !isHovering ? 'bg-white' : 'bg-blue-500'} transition-all"
                        style="width: {getPercent($playerStore.currentTime, $playerStore.duration)}%; transition: background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s;"
                        aria-hidden="true"
                    ></div>
                </button>
                <div class="mt-1 flex justify-between text-xs text-gray-400" style="transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1); opacity: {isCompact && !isHovering ? '1' : '1'};">
                    <span>{formatTime($playerStore.currentTime)}</span>
                    <span>{formatTime($playerStore.duration)}</span>
                </div>
            </div>

            <!-- Info de la canción -->
            <div class="flex {isCompact && !isHovering ? 'flex-row items-center gap-3' : 'flex-col sm:flex-row sm:items-center sm:justify-between gap-6'}" style="transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);">
                <!-- Carátula más grande -->
                <div class="flex items-center {isCompact && !isHovering ? 'gap-2' : 'gap-4'} {isCompact && !isHovering ? 'flex-1' : 'sm:flex-1'}" style="transition: gap 0.5s cubic-bezier(0.4, 0, 0.2, 1);">
                    {#if $playerStore.currentTrack.album.videoCover}
                        <video
                            src={losslessAPI.getVideoCoverUrl($playerStore.currentTrack.album.videoCover, '1080')}
                            poster={$playerStore.currentTrack.album.cover
                                ? losslessAPI.getCoverUrl($playerStore.currentTrack.album.cover, '1080')
                                : undefined}
                            aria-label={$playerStore.currentTrack.title}
                            class="{isCompact && !isHovering ? 'h-16 w-16' : 'h-32 w-32 sm:h-40 sm:w-40'} rounded-xl object-cover shadow-2xl cursor-pointer hover:scale-105 transition-transform"
                            style="transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);"
                            onclick={navigateToAlbum}
                            autoplay
                            loop
                            muted
                            playsinline
                            preload="metadata"
                        ></video>
                    {:else if $playerStore.currentTrack.album.cover}
                        <img
                            src={losslessAPI.getCoverUrl($playerStore.currentTrack.album.cover, '1080')}
                            alt={$playerStore.currentTrack.title}
                            class="{isCompact && !isHovering ? 'h-16 w-16' : 'h-32 w-32 sm:h-40 sm:w-40'} rounded-xl object-cover shadow-2xl cursor-pointer hover:scale-105 transition-transform"
                            style="transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);"
                            onclick={navigateToAlbum}
                        />
                    {/if}

                    <div class="min-w-0 flex-1">
                        <h3 
                            class="song-title {isCompact && !isHovering ? 'text-sm' : ''} cursor-pointer hover:underline" 
                            style="transition: font-size 0.5s cubic-bezier(0.4, 0, 0.2, 1);"
                            onclick={navigateToAlbum}
                        >
                            <strong>{$playerStore.currentTrack.title}</strong>
                        </h3>
                        {#if !isCompact || isHovering}
                        <p 
                            class="song-artist cursor-pointer hover:underline"
                            onclick={navigateToArtist}
                        >
                            {$playerStore.currentTrack.artist.name}
                        </p>
                        <p class="song-details text-xs mt-1">
                            <strong>{formatQualityLabel(currentPlaybackQuality ?? undefined)}</strong>
                            {#if getQualityDetail(currentPlaybackQuality ?? $playerStore.quality)}
                                <span class="quality-detail"> — {getQualityDetail(currentPlaybackQuality ?? $playerStore.quality)}</span>
                            {/if}
                        </p>

                        {#if ($lyricsStore && ($lyricsStore.currentLyric || $lyricsStore.text))}
                            <p class="lyrics mt-2">
                                {$lyricsStore.currentLyric ?? $lyricsStore.text}
                            </p>
                        {/if}

                        <!-- Indicador de doble clic para letras -->
                        <div class="lyrics-hint mt-1 text-xs text-gray-400 opacity-60">
                            <ScrollText size={12} class="inline mr-1" />
                            Doble clic para letras
                        </div>
                        {:else}
                        <p 
                            class="song-artist text-xs truncate cursor-pointer hover:underline"
                            onclick={navigateToArtist}
                        >
                            {$playerStore.currentTrack.artist.name}
                        </p>
                        {/if}
                    </div>
                </div>

                <!-- Controles -->
                <div class="flex items-center justify-center {isCompact && !isHovering ? 'gap-2' : 'gap-4'}" style="transition: gap 0.5s cubic-bezier(0.4, 0, 0.2, 1);">
                    <button
                        onclick={() => playerStore.previous()}
                        class="{isCompact && !isHovering ? 'p-1' : 'p-2'} text-gray-400 transition-all hover:text-black"
                        style="transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);"
                        disabled={$playerStore.queueIndex <= 0}
                        aria-label="Previous track"
                    >
                        <SkipBack size={isCompact && !isHovering ? 18 : 22} />
                    </button>

                    <button
                        onclick={() => playerStore.togglePlay()}
                        class="apple-btn {isCompact && !isHovering ? 'compact' : 'main'}" 
                        aria-label={$playerStore.isPlaying ? 'Pause' : 'Play'}
                        style="transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);"
                    >
                        {#if $playerStore.isPlaying}
                            <Pause size={isCompact && !isHovering ? 18 : 26} fill="currentColor" />
                        {:else}
                            <Play size={isCompact && !isHovering ? 18 : 26} fill="currentColor" />
                        {/if}
                    </button>

                    <button
                        onclick={() => playerStore.next()}
                        class="{isCompact && !isHovering ? 'p-1' : 'p-2'} text-gray-400 transition-all hover:text-black"
                        style="transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);"
                        disabled={$playerStore.queueIndex >= $playerStore.queue.length - 1}
                        aria-label="Next track"
                    >
                        <SkipForward size={isCompact && !isHovering ? 18 : 22} />
                    </button>
                </div>
            </div>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
    /* Nuevo diseño: más grande, neumorphism para botones y animaciones suaves */

    :root {
      --btn-bg: linear-gradient(180deg,#ffffff,#e6f0ff);
      --btn-color: #1e40af;
      --btn-shadow: 0 18px 48px rgba(37,99,235,0.12);
      --btn-size: 72px;
      --btn-small-size: 50px;
    }

    .audio-player-glass {
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
        border: 1px solid rgba(255,255,255,0.06);
        backdrop-filter: blur(18px) saturate(130%);
        -webkit-backdrop-filter: blur(18px) saturate(130%);
        box-shadow:
            0 20px 50px rgba(3, 7, 18, 0.6),
            inset 0 1px 0 rgba(255,255,255,0.03);
        transition: box-shadow 220ms ease, transform 220ms ease;
        border-radius: 20px;
        /* evita el borde blanco por antialiasing: */
        background-clip: padding-box;
        border-color: transparent !important;
    }

    /* Quitar efecto de borde blanco al hacer hover (solo en este reproductor) */
    .audio-player-glass:hover,
    .audio-player-glass:focus,
    .audio-player-glass:focus-visible {
        /* eliminar cualquier borde/outline visible */
        border-color: transparent !important;
        outline: none !important;
        /* eliminar el inset blanco y mantener solo la sombra oscura */
        box-shadow: 0 20px 50px rgba(3, 7, 18, 0.6) !important;
        -webkit-box-shadow: 0 20px 50px rgba(3, 7, 18, 0.6) !important;
        transform: none;
    }

    /* por si el contenedor externo añade sombra/borde al hacer hover */
    .audio-player-backdrop .relative.mx-auto,
    .audio-player-backdrop .relative.mx-auto:hover {
        box-shadow: none !important;
    }

    /* Contenedor principal */
    .audio-player-backdrop {
        padding-bottom: 1.25rem;
    }

    /* Progresos y tiempos */
    .group.relative.h-1 {
        height: 0.5rem;
    }

    /* Cover grande y responsive */
    .cover-container {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 1rem;
    }
    .cover-img {
        height: 6.25rem; /* 100px */
        width: 6.25rem;
        border-radius: 14px;
        object-fit: cover;
        box-shadow: 0 12px 30px rgba(2,6,23,0.5);
        cursor: pointer;
        transition: transform 360ms cubic-bezier(.2,.9,.2,1), width 360ms, height 360ms, box-shadow 360ms;
        flex-shrink: 0;
    }
    .cover-img.expanded {
        height: 18.75rem; /* 300px */
        width: 18.75rem;
        border-radius: 18px;
        transform: translateY(-6px) scale(1.02);
        box-shadow: 0 28px 80px rgba(2,6,23,0.65);
        position: relative;
        z-index: 30;
    }

    /* Título: cuando la carátula se expande, el título también aumenta */
    .song-title {
        display: block;
        color: #ffffffff;
        font-size: 1.05rem;
        line-height: 1.2;
        font-weight: 700;              /* negritas */
        white-space: normal;           /* permite saltos de línea */
        overflow: visible;
        word-break: break-word;        /* corta palabras largas para evitar desbordes horizontales */
        overflow-wrap: anywhere;       /* forzar wrap cuando sea necesario */
        margin: 0 0 0.25rem 0;
    }
    .song-title.expanded {
        font-size: 1.6rem;
    }

    .song-artist,
    .song-details {
        color: #000;
        margin: 0.125rem 0 0 0;
        white-space: normal;
        overflow: visible;
    }

    /* asegurar que la columna de texto pueda crecer en vertical sin forzar el ancho */
    .min-w-0.flex-1 {
        min-width: 0;
        flex: 1 1 auto;
    }

    /* opcional: limitar a 2 líneas con ellipsis vertical si quieres */
    .song-title--two-lines {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: normal;
    }

    /* Controles estilo neumorphism */
    .controls-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .apple-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--btn-small-size);
        height: var(--btn-small-size);
        border-radius: 9999px;
        background: linear-gradient(180deg, #fbfdff, #e8eefc);
        box-shadow:
            0 8px 18px rgba(12, 20, 40, 0.18),
            inset 0 1px 0 rgba(255,255,255,0.8);
        border: 1px solid rgba(10,20,40,0.06);
        cursor: pointer;
        transition: transform 160ms cubic-bezier(.2,.9,.2,1), box-shadow 160ms, background 160ms, width 500ms cubic-bezier(0.4, 0, 0.2, 1), height 500ms cubic-bezier(0.4, 0, 0.2, 1);
        color: #0b254e;
    }
    .apple-btn.main {
        width: 4.5rem; /* 72px */
        height: 4.5rem;
        background: #ffffff; /* fondo blanco */
        box-shadow:
            0 10px 30px rgba(2,6,23,0.12),
            inset 0 1px 0 rgba(255,255,255,0.6);
        color: #000000; /* icono/relleno negro */
        border: 1px solid rgba(0,0,0,0.06);
    }
    .apple-btn.compact {
        width: 2.75rem; /* 44px */
        height: 2.75rem;
        background: #ffffff;
        box-shadow:
            0 6px 16px rgba(2,6,23,0.1),
            inset 0 1px 0 rgba(255,255,255,0.5);
        color: #000000;
        border: 1px solid rgba(0,0,0,0.05);
    }
    .apple-btn svg { fill: currentColor; }
    .apple-btn:hover { transform: translateY(-3px); }
    .apple-btn:active { transform: scale(.96); }

    /* Controles secundarios (volume, lyrics) */
    .player-toggle-button {
        border-radius: 9999px;
        padding: 0.45rem 0.8rem;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.04);
        color: rgba(220,220,230,0.9);
        transition: background 160ms, transform 160ms;
    }
    .player-toggle-button:hover {
        background: rgba(255,255,255,0.06);
        transform: translateY(-3px);
    }

    /* Volume and small controls */
    input[type="range"] {
        appearance: none;
        height: 6px;
        background: linear-gradient(90deg, #c7d2fe, #60a5fa);
        border-radius: 9999px;
    }
    input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: white;
        box-shadow: 0 4px 8px rgba(12,20,40,0.25);
    }

    /* Queue panel */
    .queue-panel {
        margin-top: 1rem;
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
        border: 1px solid rgba(255,255,255,0.04);
    }

    /* Loading overlay refinement */
    .loading-overlay {
        border-radius: 12px;
    }

    /* Responsive adjustments */
    @media (max-width: 640px) {
        .cover-img { height: 5.25rem; width: 5.25rem; }
        .cover-img.expanded { height: 16rem; width: 16rem; }
        .apple-btn { width: 44px; height: 44px; }
        .apple-btn.main { width: 64px; height: 64px; }
        .apple-btn.compact { width: 40px; height: 40px; }
        .song-title.expanded { font-size: 1.25rem; }
    }

    /* Compact mode adjustments */
    .audio-player-backdrop.compact {
        cursor: pointer;
    }
    
    .audio-player-backdrop.compact .song-title {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 0.875rem !important;
    }

    /* =========================
   Cambios: detalles en blanco
   ========================= */
.song-title,
.song-artist,
.song-details,
.song-album,
.quality-detail,
.lyrics {
    color: #ffffff !important;
}

/* Asegurar contraste en elementos secundarios si fuera necesario */
.song-artist,
.song-details,
.song-album,
.quality-detail {
    color: #ffffff !important;
}

/* =========================
   Cambios: línea de tiempo en blanco
   ========================= */
/* fondo de la barra de progreso */
.group.relative.h-1 {
    background: rgba(255,255,255,0.06) !important;
    border-radius: 9999px;
}

/* segmento buffered (primer div interno) */
.group.relative.h-1 > div:nth-child(1) {
    background: rgba(255,255,255,0.18) !important;
}

/* segmento reproducido (segundo div interno) */
.group.relative.h-1 > div:nth-child(2) {
    background: #ffffff !important;
}

/* asegurar contraste para los tiempos (0:00 / duración) */
.audio-player-glass .text-gray-400 {
    color: #ffffff !important;
}

/* =========================
   Indicador de doble clic para letras
   ========================= */
.lyrics-hint {
    transition: opacity 0.3s ease;
    cursor: pointer;
}

.lyrics-hint:hover {
    opacity: 1 !important;
    color: #ffffff !important;
}

/* =========================
   Wave Animation - Pequeña versión
   ========================= */
.wave-menu {
  border: 2px solid transparent;
  border-radius: 25px;
  width: 120px;
  height: 25px;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0;
  margin: 0;
  cursor: pointer;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  background: transparent;
}

.wave-menu.compact {
  width: 80px;
  height: 18px;
}

.wave-menu li {
  list-style: none;
  height: 18px;
  width: 2px;
  border-radius: 6px;
  background: #ffffff;
  margin: 0 3px;
  padding: 0;
  animation-name: wave1;
  animation-duration: 0.6s;
  animation-iteration-count: infinite;
  animation-direction: alternate;
  animation-timing-function: ease-in-out;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.wave-menu.compact li {
  height: 12px;
  width: 1.5px;
  margin: 0 2px;
}

.wave-menu:hover > li {
  background: #cccccc;
}

.wave-menu:hover {
  background: transparent;
}

.wave-menu li:nth-child(2) {
  animation-name: wave2;
  animation-delay: 0.1s;
  animation-duration: 0.8s;
}

.wave-menu li:nth-child(3) {
  animation-name: wave3;
  animation-delay: 0.2s;
  animation-duration: 0.7s;
}

.wave-menu li:nth-child(4) {
  animation-name: wave4;
  animation-delay: 0.05s;
  animation-duration: 0.9s;
}

.wave-menu li:nth-child(5) {
  animation-delay: 0.3s;
  animation-duration: 0.5s;
}

.wave-menu li:nth-child(6) {
  animation-name: wave2;
  animation-delay: 0.15s;
  animation-duration: 0.75s;
}

.wave-menu li:nth-child(7) {
  animation-name: wave1;
  animation-delay: 0.25s;
  animation-duration: 0.6s;
}

.wave-menu li:nth-child(8) {
  animation-name: wave4;
  animation-delay: 0.35s;
  animation-duration: 0.85s;
}

.wave-menu li:nth-child(9) {
  animation-name: wave3;
  animation-delay: 0.4s;
  animation-duration: 0.7s;
}

.wave-menu li:nth-child(10) {
  animation-name: wave1;
  animation-delay: 0.45s;
  animation-duration: 0.55s;
}

/* Estado pausado - convertir en puntos pequeños */
.wave-menu.paused li {
  animation: none !important;
  transform: scaleY(0.1) !important;
  height: 2px !important;
  border-radius: 50% !important;
  transition: all 0.3s ease-in-out;
}

@keyframes wave1 {
  0% {
    transform: scaleY(0.3);
  }
  25% {
    transform: scaleY(0.8);
  }
  50% {
    transform: scaleY(0.4);
  }
  75% {
    transform: scaleY(0.9);
  }
  100% {
    transform: scaleY(0.2);
  }
}

@keyframes wave2 {
  0% {
    transform: scaleY(0.2);
  }
  20% {
    transform: scaleY(0.7);
  }
  40% {
    transform: scaleY(0.3);
  }
  60% {
    transform: scaleY(0.8);
  }
  80% {
    transform: scaleY(0.4);
  }
  100% {
    transform: scaleY(0.6);
  }
}

@keyframes wave3 {
  0% {
    transform: scaleY(0.4);
  }
  30% {
    transform: scaleY(0.9);
  }
  50% {
    transform: scaleY(0.2);
  }
  70% {
    transform: scaleY(0.7);
  }
  100% {
    transform: scaleY(0.5);
  }
}

@keyframes wave4 {
  0% {
    transform: scaleY(0.1);
  }
  15% {
    transform: scaleY(0.6);
  }
  35% {
    transform: scaleY(0.3);
  }
  55% {
    transform: scaleY(0.8);
  }
  75% {
    transform: scaleY(0.2);
  }
  100% {
    transform: scaleY(0.7);
  }
}

/* Album title in corner (small, same color) */
    .album-corner {
        position: absolute;
        top: 18px; /* un poco más abajo */
        left: 20px; /* un poco más a la derecha */
        color: #ffffff;
        opacity: 0.95;
        pointer-events: none;
        z-index: 50;
        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        max-width: calc(100% - 56px);
    }
    .album-corner.compact {
        top: 8px;
        left: 12px;
    }
    .album-corner .album-label {
        font-size: 0.63rem;
        line-height: 1;
        opacity: 0.85;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: font-size 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .album-corner.compact .album-label {
        font-size: 0.55rem;
    }
    .album-corner .album-title {
        font-size: 0.75rem;
        line-height: 1;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: font-size 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .album-corner.compact .album-title {
        font-size: 0.65rem;
    }

    /* Quality indicator in top-right corner (compact mode) */
    .quality-corner {
        position: absolute;
        top: 18px;
        right: 20px;
        color: #ffffff;
        opacity: 0.95;
        pointer-events: none;
        z-index: 50;
        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .quality-corner.compact {
        top: 8px;
        right: 12px;
    }
    .quality-corner .quality-badge {
        font-size: 0.55rem;
        line-height: 1;
        font-weight: 600;
        padding: 0;
        background: transparent;
        border: none;
        white-space: nowrap;
        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }
</style>
