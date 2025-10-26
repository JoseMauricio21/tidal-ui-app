<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { currentTime, playerStore } from '$lib/stores/player';
	import { lyricsStore, lyricsOpen, lyricsMaximized, lyricsTrack, lyricsRefreshToken, getCachedTrackMetadata, setCachedTrackMetadata } from '$lib/stores/lyrics';
	import { losslessAPI } from '$lib/api';
	import { Maximize2, Minimize2, RefreshCw, X, SkipBack, Play, Pause, SkipForward } from 'lucide-svelte';
	import Loader from './Loader.svelte';

	const COMPONENT_MODULE_URL =
		'https://cdn.jsdelivr.net/npm/@uimaxbai/am-lyrics@0.5.3/dist/src/am-lyrics.min.js';
	const SEEK_FORCE_THRESHOLD_MS = 220;
	const SCRIPT_LOAD_TIMEOUT = 5000; // Reduced from 8 seconds
	const PRELOAD_DELAY = 500; // Reduced from 2 seconds for faster initial load

	type LyricsMetadata = {
		title: string;
		artist: string;
		album?: string;
		query: string;
		durationMs?: number;
		isrc?: string;
	};

	type AmLyricsElement = HTMLElement & {
		currentTime: number;
		scrollToActiveLine?: () => void;
		scrollToInstrumental?: (index: number) => void;
		activeLineIndices?: number[];
		shadowRoot: ShadowRoot | null;
		updateComplete?: Promise<unknown>;
		__tidalScrollPatched?: boolean;
	};

	let amLyricsElement = $state<AmLyricsElement | null>(null);
	let scriptStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let scriptError = $state<string | null>(null);
	let pendingLoad: Promise<void> | null = null;
	let hasEscapeListener = false;
	let preloadTimeout: number | null = null;
	let isPreloaded = $state(false);

	let baseTimeMs = $state(0);
	let lyricsKey = $state('0:none');
	let metadata = $state<LyricsMetadata | null>(null);
	let animationFrameId: number | null = null;
	let lastBaseTimestamp = 0;
	let scrollPatchFrame: number | null = null;
	let lastRefreshedTrackId = $state<number | null>(null);
	let bufferedPercent = $state(0);
	let albumColors = $state<{ primary: string; secondary: string } | null>(null);

	$effect(() => {
		const seconds = $currentTime ?? 0;
		const playing = $playerStore.isPlaying;
		const nextMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0;
		baseTimeMs = nextMs;
		if (browser) {
			lastBaseTimestamp = performance.now();
		}
		if (scriptStatus === 'ready' && amLyricsElement) {
			const current = Number(amLyricsElement.currentTime ?? 0);
			const delta = Math.abs(current - nextMs);
			if (!playing || delta > SEEK_FORCE_THRESHOLD_MS) {
				amLyricsElement.currentTime = nextMs;
			}
		}
	});

	$effect(() => {
		lyricsKey = `${$lyricsRefreshToken}:${$lyricsTrack?.id ?? 'none'}`;
	});

	// Preload the component immediately on mount
	$effect(() => {
		if (browser && !isPreloaded && scriptStatus === 'idle') {
			void preloadComponent();
		}
	});

	$effect(() => {
		if ($lyricsOpen && browser) {
			void ensureComponentLoaded();
		}
		attachEscapeListener($lyricsOpen);
	});

	onDestroy(() => {
		attachEscapeListener(false);
		if (preloadTimeout) {
			clearTimeout(preloadTimeout);
		}
	});

	async function preloadComponent() {
		if (isPreloaded || scriptStatus !== 'idle') return;
		
		try {
			await loadComponentScript();
			isPreloaded = true;
			scriptStatus = 'ready';
		} catch (error) {
			console.warn('Failed to preload lyrics component:', error);
			// Don't set error status for preload failures
		}
	}

	async function ensureComponentLoaded() {
		if (scriptStatus === 'ready') {
			return;
		}
		if (typeof customElements !== 'undefined' && customElements.get('am-lyrics')) {
			scriptStatus = 'ready';
			scriptError = null;
			return;
		}
		if (pendingLoad) {
			scriptStatus = 'loading';
			try {
				await pendingLoad;
			} catch {
				// handled when the original promise settles
			}
			return;
		}
		if (!browser) return;

		scriptStatus = 'loading';
		scriptError = null;

		pendingLoad = loadComponentScript()
			.then(() => {
				scriptStatus = 'ready';
				scriptError = null;
				if (amLyricsElement) {
					amLyricsElement.currentTime = baseTimeMs;
				}
			})
			.catch((error) => {
				console.error('Failed to load Apple Music lyrics component', error);
				scriptStatus = 'error';
				scriptError = error instanceof Error ? error.message : 'Unable to load lyrics component.';
			})
			.finally(() => {
				pendingLoad = null;
			});

		await pendingLoad;
	}

	function loadComponentScript(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!browser) {
				resolve();
				return;
			}

			// Set up timeout
			const timeoutId = setTimeout(() => {
				reject(new Error('Script load timeout'));
			}, SCRIPT_LOAD_TIMEOUT);

			const cleanup = () => {
				clearTimeout(timeoutId);
			};

			const waitForDefinition = () => {
				if (typeof customElements !== 'undefined' && 'whenDefined' in customElements) {
					customElements
						.whenDefined('am-lyrics')
						.then(() => {
							cleanup();
							resolve();
						})
						.catch((error) => {
							cleanup();
							reject(error);
						});
				} else {
					cleanup();
					resolve();
				}
			};

			if (typeof customElements !== 'undefined' && customElements.get('am-lyrics')) {
				cleanup();
				resolve();
				return;
			}

			const existing = document.querySelector<HTMLScriptElement>('script[data-am-lyrics]');
			if (existing) {
				if (existing.dataset.loaded === 'true') {
					waitForDefinition();
					return;
				}
				const handleLoad = () => {
					existing.dataset.loaded = 'true';
					waitForDefinition();
				};
				const handleError = () => {
					cleanup();
					existing.removeEventListener('load', handleLoad);
					existing.removeEventListener('error', handleError);
					existing.remove();
					reject(new Error('Failed to load lyrics component.'));
				};
				existing.addEventListener('load', handleLoad, { once: true });
				existing.addEventListener('error', handleError, { once: true });
				return;
			}

			const script = document.createElement('script');
			script.type = 'module';
			script.src = COMPONENT_MODULE_URL;
			script.dataset.amLyrics = 'true';
			script.crossOrigin = 'anonymous'; // Better caching

			const handleLoad = () => {
				script.dataset.loaded = 'true';
				waitForDefinition();
			};

			const handleError = () => {
				cleanup();
				script.removeEventListener('load', handleLoad);
				script.removeEventListener('error', handleError);
				script.remove();
				reject(new Error('Failed to load lyrics component.'));
			};

			script.addEventListener('load', handleLoad, { once: true });
			script.addEventListener('error', handleError, { once: true });
			document.head.append(script);
		});
	}

	function handleOverlayClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			lyricsStore.close();
		}
	}

	function handleOverlayKeydown(event: KeyboardEvent) {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			lyricsStore.close();
		}
	}

	function handleEscape(event: KeyboardEvent) {
		if (event.key === 'Escape' && $lyricsOpen) {
			event.preventDefault();
			lyricsStore.close();
		}
	}

	function attachEscapeListener(open: boolean) {
		if (!browser) return;
		if (open && !hasEscapeListener) {
			window.addEventListener('keydown', handleEscape);
			hasEscapeListener = true;
		} else if (!open && hasEscapeListener) {
			window.removeEventListener('keydown', handleEscape);
			hasEscapeListener = false;
		}
	}

	function stopAnimation() {
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
	}

	function handleRefresh() {
		if ($lyricsTrack) {
			lyricsStore.refresh();
		}
		if (scriptStatus !== 'ready' && browser) {
			scriptStatus = 'idle';
			scriptError = null;
			void ensureComponentLoaded();
		}
	}

	function handleRetry() {
		scriptStatus = 'idle';
		scriptError = null;
		if (browser) {
			void ensureComponentLoaded();
		}
	}

	function formatTime(seconds: number): string {
		if (isNaN(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function getPercent(current: number, total: number): number {
		if (!Number.isFinite(total) || total <= 0) {
			return 0;
		}
		return Math.max(0, Math.min(100, (current / total) * 100));
	}

	function handleSeek(event: MouseEvent) {
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const percent = (event.clientX - rect.left) / rect.width;
		const newTime = percent * $playerStore.duration;

		// Dispatch seek event for audio player
		window.dispatchEvent(new CustomEvent('lyrics:seek', { detail: { timeSeconds: newTime } }));
		playerStore.setCurrentTime(newTime);
	}

	function updateBufferedPercent() {
		// Simular el porcentaje de buffer (en una implementación real, esto vendría del audio element)
		bufferedPercent = Math.min(100, Math.max(0, getPercent($playerStore.currentTime, $playerStore.duration) + 10));
	}

	function handleLineClick(event: Event) {
		const detail = (event as CustomEvent<{ timestamp: number }>).detail;
		if (!detail) return;
		const timeSeconds = detail.timestamp / 1000;
		playerStore.play();
		window.dispatchEvent(new CustomEvent('lyrics:seek', { detail: { timeSeconds } }));
	}

	function patchLyricsAutoscroll(element: AmLyricsElement, attempt = 0) {
		if (!browser || !element || element.__tidalScrollPatched) {
			return;
		}

		const container = element.shadowRoot?.querySelector<HTMLElement>('.lyrics-container');
		if (!container) {
			if (attempt > 5) return;
			if (scrollPatchFrame !== null) {
				cancelAnimationFrame(scrollPatchFrame);
			}
			scrollPatchFrame = requestAnimationFrame(() => {
				patchLyricsAutoscroll(element, attempt + 1);
			});
			return;
		}

		scrollPatchFrame = null;
		element.__tidalScrollPatched = true;

		// Inject custom styles into shadow DOM for blur effect
		const shadowRoot = element.shadowRoot;
		if (shadowRoot) {
			// Remove existing blur style if present
			const existingStyle = shadowRoot.querySelector('#tidal-lyrics-blur-style');
			if (existingStyle) {
				existingStyle.remove();
			}
			
			const style = document.createElement('style');
			style.id = 'tidal-lyrics-blur-style';
			style.textContent = `
				/* Aplicar blur a TODAS las líneas por defecto */
				.lyrics-line,
				[class*="line"],
				.lyric-line,
				div[role="button"] {
					filter: blur(4px) !important;
					-webkit-filter: blur(4px) !important;
					opacity: 0.25 !important;
					color: rgba(255, 255, 255, 0.4) !important;
					transition: all 0.6s cubic-bezier(0.4, 0.0, 0.2, 1) !important;
					transform: scale(0.96) !important;
				}
				
				/* Remover blur SOLO de la línea activa */
				.lyrics-line.active,
				.lyrics-line[class*="active"],
				[class*="line"][class*="active"],
				.lyric-line.active,
				.lyrics-line.interpolating,
				[class*="interpolating"],
				div[role="button"][class*="active"] {
					filter: none !important;
					-webkit-filter: none !important;
					opacity: 1 !important;
					color: #ffffff !important;
					font-weight: 600 !important;
					transform: scale(1.02) !important;
					text-shadow: 
						0 0 30px rgba(255, 255, 255, 0.8),
						0 0 60px rgba(255, 255, 255, 0.4),
						0 0 90px rgba(255, 255, 255, 0.2),
						0 2px 4px rgba(0, 0, 0, 0.3) !important;
				}
				
				/* Zona de contexto: 2 líneas antes de la activa */
				.lyrics-line.active ~ .lyrics-line:nth-last-child(-n+2),
				.lyrics-line:has(+ .lyrics-line.active),
				.lyrics-line:has(+ .lyrics-line + .lyrics-line.active) {
					filter: blur(1.5px) !important;
					-webkit-filter: blur(1.5px) !important;
					opacity: 0.65 !important;
					color: rgba(255, 255, 255, 0.7) !important;
					transform: scale(0.99) !important;
				}
				
				/* Zona de contexto: 2 líneas después de la activa */
				.lyrics-line.active + .lyrics-line,
				.lyrics-line.active + .lyrics-line + .lyrics-line {
					filter: blur(1.5px) !important;
					-webkit-filter: blur(1.5px) !important;
					opacity: 0.65 !important;
					color: rgba(255, 255, 255, 0.7) !important;
					transform: scale(0.99) !important;
				}
				
				/* Líneas anteriores más borrosas */
				.lyrics-line.previous,
				[class*="line"][class*="previous"],
				div[role="button"][class*="previous"] {
					filter: blur(5px) !important;
					-webkit-filter: blur(5px) !important;
					opacity: 0.2 !important;
					color: rgba(255, 255, 255, 0.3) !important;
					transform: scale(0.95) !important;
				}
			`;
			shadowRoot.appendChild(style);
			
			// Observer para detectar cuando se cargan las letras
			const observerConfig = { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] };
			const observer = new MutationObserver((mutations) => {
				const lyricsContainer = shadowRoot.querySelector('.lyrics-container');
				if (lyricsContainer) {
					const lines = lyricsContainer.querySelectorAll('.lyrics-line, [class*="line"]');
					if (lines.length > 1) {
						// Letras cargadas, log para debug
						console.log('[Lyrics Loaded] Total lines:', lines.length);
						if (lines.length > 0) {
							console.log('[First line] Classes:', lines[0].className, 'Tag:', lines[0].tagName);
						}
					}
				}
			});
			
			observer.observe(shadowRoot, observerConfig);
			
			// Cleanup observer cuando se destruya el componente
			if (element) {
				(element as any).__lyricsObserver = observer;
			}
		}

		const styles = getComputedStyle(container);
		const parsedPaddingTop = parseFloat(styles.paddingTop || '0');
		const parsedPaddingBottom = parseFloat(styles.paddingBottom || '0');
		const preferredFraction = 0.32;
		const comfortTopFraction = 0.18;
		const comfortBottomFraction = 0.22;

		const computeScrollTarget = (line: HTMLElement) => {
			const containerRect = container.getBoundingClientRect();
			const lineRect = line.getBoundingClientRect();
			const lineTop = lineRect.top - containerRect.top + container.scrollTop;
			const lineBottom = lineTop + lineRect.height;
			const viewportStart = container.scrollTop;
			const viewportEnd = viewportStart + container.clientHeight;
			const comfortStart = viewportStart + parsedPaddingTop + container.clientHeight * comfortTopFraction;
			const comfortEnd = viewportEnd - parsedPaddingBottom - container.clientHeight * comfortBottomFraction;

			if (lineTop >= comfortStart && lineBottom <= comfortEnd) {
				return null;
			}

			const backgroundBefore = line.querySelector<HTMLElement>('.background-text.before');
			const backgroundOffset = backgroundBefore
				? Math.min(backgroundBefore.clientHeight / 2, lineRect.height * 0.6)
				: 0;

			const desiredTop =
				lineTop - parsedPaddingTop - container.clientHeight * preferredFraction - backgroundOffset;
			const maxScroll = container.scrollHeight - container.clientHeight;

			return Math.max(0, Math.min(maxScroll, desiredTop));
		};

		const applyScroll = (target: number | null) => {
			if (target === null) return;
			const delta = Math.abs(container.scrollTop - target);
			if (delta < 1) return;
			container.scrollTo({ top: target, behavior: 'smooth' });
		};

		const originalActiveScroll = element.scrollToActiveLine?.bind(element);
		element.scrollToActiveLine = function () {
			const indices = Array.isArray(element.activeLineIndices)
				? (element.activeLineIndices as number[])
				: [];
			if (!indices.length) {
				originalActiveScroll?.();
				return;
			}

			const targetIndex = Math.min(...indices);
			const line = container.querySelector<HTMLElement>(
				`.lyrics-line:nth-child(${targetIndex + 1})`
			);
			if (!line) {
				originalActiveScroll?.();
				return;
			}

			const target = computeScrollTarget(line);
			if (target === null) return;
			applyScroll(target);
		};

		const originalInstrumentalScroll = element.scrollToInstrumental?.bind(element);
		element.scrollToInstrumental = function (index: number) {
			const line = container.querySelector<HTMLElement>(`.lyrics-line:nth-child(${index + 1})`);
			if (!line) {
				originalInstrumentalScroll?.(index);
				return;
			}

			const target = computeScrollTarget(line);
			if (target === null) return;
			applyScroll(target);
		};
	}

	$effect(() => {
		if (!amLyricsElement) {
			return;
		}

		const listener = (event: Event) => handleLineClick(event);
		amLyricsElement.addEventListener('line-click', listener as EventListener);
		return () => {
			amLyricsElement?.removeEventListener('line-click', listener as EventListener);
		};
	});

	$effect(() => {
		if (!browser) return;
		const element = amLyricsElement as AmLyricsElement | null;
		if (!element || scriptStatus !== 'ready') return;
		patchLyricsAutoscroll(element);
	});

	$effect(() => {
		const open = $lyricsOpen;
		const trackId = $lyricsTrack?.id ?? null;

		if (!open || !trackId) {
			lastRefreshedTrackId = open ? trackId : null;
			return;
		}

		if (trackId !== lastRefreshedTrackId) {
			lastRefreshedTrackId = trackId;
			lyricsStore.refresh();
		}
	});

	$effect(() => {
		if (!browser || !amLyricsElement) {
			stopAnimation();
			return;
		}

		if (scriptStatus !== 'ready' || !$lyricsOpen) {
			stopAnimation();
			amLyricsElement.currentTime = baseTimeMs;
			return;
		}

		if (!$playerStore.isPlaying) {
			stopAnimation();
			amLyricsElement.currentTime = baseTimeMs;
			return;
		}

		const element = amLyricsElement;
		const originBase = baseTimeMs;
		const nowTimestamp = performance.now();
		const originTimestamp =
			lastBaseTimestamp && Math.abs(nowTimestamp - lastBaseTimestamp) < 800
				? lastBaseTimestamp
				: nowTimestamp;

		const tick = (now: number) => {
			const elapsed = now - originTimestamp;
			const nextMs = originBase + elapsed;
			element.currentTime = nextMs;
			animationFrameId = requestAnimationFrame(tick);
		};

		animationFrameId = requestAnimationFrame(tick);
		return () => {
			stopAnimation();
		};
	});

	$effect(() => {
		const track = $lyricsTrack;
		if (!track) {
			metadata = null;
			albumColors = null;
			return;
		}

		const trackId = track.id?.toString();
		if (!trackId) return;

		// Debug log to check track data
		console.log('[Lyrics Track Data]', {
			trackId,
			album: track.album,
			releaseDate: track.album?.releaseDate
		});

		// Check cache first
		const cachedData = getCachedTrackMetadata(trackId);
		if (cachedData) {
			metadata = cachedData.metadata;
			albumColors = cachedData.albumColors || null;
			return;
		}

		const title = track.title;
		const artist = track.artist?.name ?? '';
		const album = track.album?.title;
		const durationMs =
			typeof track.duration === 'number'
				? Math.max(0, Math.round(track.duration * 1000))
				: undefined;

		const newMetadata = {
			title,
			artist,
			album,
			query: `${title} ${artist}`.trim(),
			durationMs,
			isrc: track.isrc ?? ''
		};

		metadata = newMetadata;

		// Extract album colors asynchronously if available
		if (track.album?.cover) {
			// Set cache with metadata immediately
			setCachedTrackMetadata(trackId, {
				metadata: newMetadata,
				albumColors: null
			});

			// Extract colors in background
			void extractAlbumColors(track.album.cover).then((colors) => {
				albumColors = colors;
				// Update cache with colors
				setCachedTrackMetadata(trackId, {
					metadata: newMetadata,
					albumColors: colors
				});
			});
		} else {
			albumColors = null;
			setCachedTrackMetadata(trackId, {
				metadata: newMetadata,
				albumColors: null
			});
		}
	});

	$effect(() => {
		updateBufferedPercent();
	});

	// Optimized album color extraction with smaller canvas
	async function extractAlbumColors(coverUrl: string): Promise<{ primary: string; secondary: string } | null> {
		try {
			// Use smaller image size for faster processing
			const optimizedUrl = coverUrl.replace(/\d{3,4}x\d{3,4}/i, '320x320');
			const response = await fetch(optimizedUrl);
			const blob = await response.blob();
			const imageUrl = URL.createObjectURL(blob);
			
			return new Promise((resolve) => {
				const img = new Image();
				img.crossOrigin = 'anonymous';
				img.onload = () => {
					const canvas = document.createElement('canvas');
					const ctx = canvas.getContext('2d', { willReadFrequently: true });
					if (!ctx) {
						URL.revokeObjectURL(imageUrl);
						resolve(null);
						return;
					}
					
					// Use smaller canvas for faster processing
					const size = 100;
					canvas.width = size;
					canvas.height = size;
					ctx.drawImage(img, 0, 0, size, size);
					
					const imageData = ctx.getImageData(0, 0, size, size);
					const colors = extractDominantColors(imageData);
					
					URL.revokeObjectURL(imageUrl);
					resolve(colors);
				};
				img.onerror = () => {
					URL.revokeObjectURL(imageUrl);
					resolve(null);
				};
				img.src = imageUrl;
			});
		} catch (error) {
			console.warn('Failed to extract album colors:', error);
			return null;
		}
	}

	function extractDominantColors(imageData: ImageData): { primary: string; secondary: string } {
		const data = imageData.data;
		const colorCounts = new Map<string, number>();
		
		// Sample every 20th pixel for even faster processing
		for (let i = 0; i < data.length; i += 80) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			// Skip very dark and very light colors
			if ((r < 30 && g < 30 && b < 30) || (r > 225 && g > 225 && b > 225)) {
				continue;
			}
			const color = `rgb(${r}, ${g}, ${b})`;
			colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
		}
		
		const sortedColors = Array.from(colorCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([color]) => color);
		
		return {
			primary: sortedColors[0] || 'rgb(59, 130, 246)',
			secondary: sortedColors[1] || 'rgb(147, 51, 234)'
		};
	}
</script>

{#if $lyricsOpen}
	<div
		class="lyrics-overlay"
		role="presentation"
		onclick={handleOverlayClick}
		onkeydown={handleOverlayKeydown}
		tabindex="-1"
		style={albumColors ? `--lyrics-bg: linear-gradient(135deg, ${albumColors.primary}15, ${albumColors.primary}25); --lyrics-primary: ${albumColors.primary}; --lyrics-secondary: ${albumColors.secondary};` : ''}
	>
		<div
			class={`lyrics-panel ${$lyricsMaximized ? 'lyrics-panel--maximized' : ''}`}
			role="dialog"
			aria-modal="true"
			aria-label="Lyrics"
		>
			<header class="lyrics-header">
				<div class="lyrics-heading">
					<h2 class="lyrics-title">Lyrics</h2>
					{#if metadata}
						<p class="lyrics-subtitle">{metadata.title} • {metadata.artist}</p>
						{#if metadata.album}
							<p class="lyrics-album">{metadata.album}</p>
						{/if}
					{:else}
						<p class="lyrics-subtitle">Start playback to load synced lyrics.</p>
					{/if}
				</div>
				<div class="lyrics-header-actions">
					<button
						type="button"
						class="lyrics-icon-button"
						onclick={handleRefresh}
						aria-label="Refresh lyrics"
						title="Refresh lyrics"
						disabled={!metadata || scriptStatus === 'loading'}
					>
						<RefreshCw size={18} class={scriptStatus === 'loading' ? 'animate-spin' : ''} />
					</button>
					<button
						type="button"
						class="lyrics-icon-button lyrics-maximize-button"
						onclick={() => lyricsStore.toggleMaximize()}
						aria-label={$lyricsMaximized ? 'Restore window' : 'Maximize window'}
						title={$lyricsMaximized ? 'Restore window' : 'Maximize window'}
					>
						{#if $lyricsMaximized}
							<Minimize2 size={18} />
						{:else}
							<Maximize2 size={18} />
						{/if}
					</button>
					<button
						type="button"
						class="lyrics-icon-button"
						onclick={() => lyricsStore.close()}
						aria-label="Close lyrics"
						title="Close lyrics"
					>
						<X size={18} />
					</button>
				</div>
			</header>

			<div class="lyrics-body">
				{#if scriptStatus === 'error'}
					<div class="lyrics-placeholder">
						<p class="lyrics-message">{scriptError ?? 'Unable to load lyrics right now.'}</p>
						<button type="button" class="lyrics-retry" onclick={handleRetry}> Try again </button>
					</div>
				{:else if !metadata}
					<div class="lyrics-placeholder">
						<p class="lyrics-message">Press play to fetch lyrics.</p>
					</div>
				{:else if scriptStatus === 'loading' || scriptStatus === 'idle'}
					<div class="lyrics-placeholder">
						<Loader size={40} />
						<span class="loading-text">
							{isPreloaded ? 'Loading lyrics…' : 'Preparing lyrics…'}
						</span>
					</div>
				{:else}
					<div class="lyrics-layout">
						<!-- Lado izquierdo: Carátula y detalles -->
						<div 
							class="lyrics-album-section"
							style={albumColors ? `background: linear-gradient(135deg, ${albumColors.primary}20, ${albumColors.secondary}25)` : ''}
						>
							<div class="album-cover-container">
								{#if $lyricsTrack?.album?.videoCover}
									<video
										src={losslessAPI.getVideoCoverUrl($lyricsTrack.album.videoCover, '1280')}
										poster={$lyricsTrack.album.cover ? losslessAPI.getCoverUrl($lyricsTrack.album.cover, '1280') : undefined}
										aria-label={metadata.album || 'Album cover'}
										class="album-cover"
										autoplay
										loop
										muted
										playsinline
										preload="metadata"
									></video>
								{:else if $lyricsTrack?.album?.cover}
									<img
										src={losslessAPI.getCoverUrl($lyricsTrack.album.cover, '1280')}
										alt={metadata.album || 'Album cover'}
										class="album-cover"
									/>
								{:else}
									<div class="album-cover-placeholder">
										<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
											<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
											<circle cx="8.5" cy="8.5" r="1.5"/>
											<polyline points="21,15 16,10 5,21"/>
										</svg>
									</div>
								{/if}
							</div>
							<div class="album-details">
								<h3 class="album-title">{metadata.title}</h3>
								<p class="album-artist">{metadata.artist}</p>
								{#if metadata.album}
									<p class="album-name">{metadata.album}</p>
								{/if}
								{#if $lyricsTrack?.album?.releaseDate}
									<p class="album-year">{new Date($lyricsTrack.album.releaseDate).getFullYear()}</p>
								{/if}
								{#if metadata.durationMs}
									<p class="album-duration">{Math.floor(metadata.durationMs / 60000)}:{(metadata.durationMs % 60000 / 1000).toFixed(0).padStart(2, '0')}</p>
								{/if}
							</div>

							<!-- Controles de Reproducción y Barra de Progreso -->
							<div class="lyrics-controls">
								<!-- Botones de Control -->
								<div class="lyrics-playback-controls">
									<button
										type="button"
										class="control-button"
										onclick={() => playerStore.previous()}
										aria-label="Previous track"
										title="Previous"
									>
										<SkipBack size={20} />
									</button>
									<button
										type="button"
										class="control-button play-button"
										onclick={() => playerStore.togglePlay()}
										aria-label={$playerStore.isPlaying ? 'Pause' : 'Play'}
										title={$playerStore.isPlaying ? 'Pause' : 'Play'}
									>
										{#if $playerStore.isPlaying}
											<Pause size={24} />
										{:else}
											<Play size={24} />
										{/if}
									</button>
									<button
										type="button"
										class="control-button"
										onclick={() => playerStore.next()}
										aria-label="Next track"
										title="Next"
									>
										<SkipForward size={20} />
									</button>
								</div>

								<!-- Barra de Progreso -->
								<div class="lyrics-progress-container">
									<div
										onclick={handleSeek}
										class="lyrics-progress-bar"
										role="slider"
										tabindex="0"
										aria-label="Seek position"
										aria-valuemin="0"
										aria-valuemax="{$playerStore.duration}"
										aria-valuenow="{$playerStore.currentTime}"
									>
										<div
											class="lyrics-progress-buffered"
											style="width: {bufferedPercent}%"
											aria-hidden="true"
										></div>
										<div
											class="lyrics-progress-current"
											style="width: {getPercent($playerStore.currentTime, $playerStore.duration)}%"
											aria-hidden="true"
										></div>
									</div>
									<div class="lyrics-time-display">
										<span>{formatTime($playerStore.currentTime)}</span>
										<span>{formatTime($playerStore.duration)}</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Lado derecho: Letras -->
						<div class="lyrics-content-section">
							<div class="lyrics-component-wrapper">
								{#key lyricsKey}
									<am-lyrics
										bind:this={amLyricsElement}
										class="am-lyrics-element"
										song-title={metadata.title}
										song-artist={metadata.artist}
										song-album={metadata.album || undefined}
										song-duration={metadata.durationMs}
										query={metadata.query}
										isrc={metadata.isrc || undefined}
										highlight-color="#ffffff"
										hover-background-color="rgba(255, 255, 255, 0.1)"
										font-family="'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"
										autoscroll
										interpolate
									></am-lyrics>
								{/key}
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.lyrics-overlay {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		padding: 0;
		background: var(--lyrics-bg, linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9)));
		backdrop-filter: blur(20px) saturate(150%);
		-webkit-backdrop-filter: blur(20px) saturate(150%);
		z-index: 60;
		transition: background 0.6s ease;
	}

	.lyrics-panel {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		border-radius: 0;
		background: transparent;
		border: none;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		box-shadow: none;
		overflow: hidden;
		transition: none;
	}

	.lyrics-panel--maximized {
		width: 100vw;
		height: 100vh;
	}

	.lyrics-header {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: none;
		position: absolute;
		top: 0;
		right: 0;
		z-index: 10;
	}

	.lyrics-heading {
		flex: 1;
	}

	.lyrics-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #f8fafc;
	}

	.lyrics-subtitle {
		margin: 0.35rem 0 0;
		font-size: 0.95rem;
		color: #cbd5f5;
	}

	.lyrics-album {
		margin: 0.2rem 0 0;
		font-size: 0.8rem;
		color: #94a3b8;
	}

	.lyrics-header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.lyrics-icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.4rem;
		border-radius: 9999px;
		border: 1px solid rgba(148, 163, 184, 0.3);
		background: transparent;
		backdrop-filter: blur(16px) saturate(140%);
		-webkit-backdrop-filter: blur(16px) saturate(140%);
		color: #e2e8f0;
		transition:
			background 160ms ease,
			border-color 160ms ease,
			transform 160ms ease,
			box-shadow 160ms ease;
	}

	.lyrics-icon-button[disabled] {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.lyrics-icon-button:not([disabled]):hover {
		border-color: var(--bloom-accent, rgba(96, 165, 250, 0.7));
		box-shadow: inset 0 0 20px rgba(96, 165, 250, 0.12);
		transform: translateY(-1px);
	}

	.animate-spin {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.lyrics-body {
		flex: 1;
		padding: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		height: 100vh;
	}

	/* =========================
	   Controles de Letras (Waves + Progress)
	   ========================= */
	.lyrics-controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem 0;
		background: transparent;
		border: none;
		width: 100%;
	}

	.lyrics-playback-controls {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1.5rem;
	}

	.control-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.6rem;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.control-button:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.1);
	}

	.play-button {
		padding: 0.8rem;
		background: rgba(255, 255, 255, 0.15);
	}

	.play-button:hover {
		background: rgba(255, 255, 255, 0.25);
		transform: scale(1.15);
	}

	.lyrics-wave-container {
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.lyrics-progress-container {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.lyrics-progress-bar {
		position: relative;
		height: 6px;
		width: 100%;
		cursor: pointer;
		overflow: visible;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		transition: height 0.2s ease;
	}

	.lyrics-progress-bar:hover {
		height: 8px;
	}

	.lyrics-progress-buffered {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		background: rgba(255, 255, 255, 0.2);
		transition: all 0.3s ease;
	}

	.lyrics-progress-current {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		background: #ffffff;
		transition: width 0.1s linear;
		border-radius: 9999px;
		box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
	}

	.lyrics-progress-current::after {
		content: '';
		position: absolute;
		right: -6px;
		top: 50%;
		transform: translateY(-50%);
		width: 12px;
		height: 12px;
		background: #ffffff;
		border-radius: 50%;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.lyrics-progress-bar:hover .lyrics-progress-current::after {
		opacity: 1;
	}

	.lyrics-time-display {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.7);
	}

	/* =========================
	   Layout Pantalla Completa: Carátula + Letras
	   ========================= */
	.lyrics-layout {
		display: flex;
		gap: 0;
		height: 100vh;
		overflow: hidden;
		width: 100vw;
		position: relative;
	}

	.lyrics-album-section {
		flex: 0 0 40%;
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 2rem;
		background: transparent;
		border-right: none;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		justify-content: center;
		align-items: center;
		transition: background 0.6s ease;
		z-index: 1;
		pointer-events: auto;
		overflow-y: auto;
	}

	.album-cover-container {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		height: auto;
		position: relative;
	}

	.album-cover {
		width: 500px;
		height: 500px;
		border-radius: 16px;
		object-fit: cover;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
		display: block;
		position: relative;
	}

	.album-cover-placeholder {
		width: 500px;
		height: 500px;
		border-radius: 16px;
		background: rgba(59, 73, 99, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(148, 163, 184, 0.6);
		border: 2px dashed rgba(148, 163, 184, 0.3);
	}

	.album-details {
		text-align: center;
		color: #ffffff;
		padding: 1.5rem 0 0 0;
		background: transparent;
		border-radius: 0;
	}

	.album-title {
		margin: 0 0 0.25rem 0;
		font-size: 1.1rem;
		font-weight: 700;
		color: #ffffff;
		line-height: 1.2;
	}

	.album-artist {
		margin: 0 0 0.15rem 0;
		font-size: 0.9rem;
		color: #e2e8f0;
		font-weight: 500;
	}

	.album-name {
		margin: 0;
		font-size: 0.8rem;
		color: #cbd5f5;
	}

	.album-year {
		margin: 0.15rem 0 0 0;
		font-size: 0.75rem;
		color: #94a3b8;
		font-weight: 500;
	}

	.album-duration {
		display: none;
	}

	.lyrics-content-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100vh;
	}

	.lyrics-component-wrapper {
		flex: 1;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		border-radius: 0;
		background: transparent;
		border: none;
		overflow: hidden;
		height: 100vh;
	}

	.am-lyrics-element {
		flex: 1;
		display: block;
		width: 100%;
		height: 100vh;
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		color: #ffffff;
		background: transparent;
		position: relative;
	}

	.am-lyrics-element::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(
			to bottom,
			rgba(0, 0, 0, 0.3) 0%,
			transparent 20%,
			transparent 80%,
			rgba(0, 0, 0, 0.3) 100%
		);
		pointer-events: none;
		z-index: 1;
	}

	.am-lyrics-element::part(container) {
		padding: 4rem 3rem;
		padding-block: 6rem;
		box-sizing: border-box;
		background: transparent;
	}

	.am-lyrics-element::part(line) {
		scroll-margin-block-start: min(40vh, 12rem);
		scroll-margin-block-end: min(35vh, 10rem);
		font-size: 1.35rem;
		line-height: 2;
		letter-spacing: 0.3px;
		color: rgba(255, 255, 255, 0.5);
		transition: all 0.6s cubic-bezier(0.4, 0.0, 0.2, 1);
		filter: blur(3px);
		opacity: 0.4;
		font-weight: 400;
		transform: translateY(0px) scale(0.98);
		pointer-events: auto;
	}

	.am-lyrics-element::part(line.active) {
		filter: blur(0px);
		opacity: 1;
		color: #ffffff;
		text-shadow: 
			0 0 30px rgba(255, 255, 255, 0.8),
			0 0 60px rgba(255, 255, 255, 0.4),
			0 0 90px rgba(255, 255, 255, 0.2),
			0 2px 4px rgba(0, 0, 0, 0.3);
		transform: translateY(0px) scale(1.02);
		font-weight: 600;
		position: relative;
		z-index: 2;
		animation: lyricsGlow 0.5s ease-in-out;
	}

	.am-lyrics-element::part(line.previous) {
		filter: blur(4px);
		opacity: 0.3;
		color: rgba(255, 255, 255, 0.4);
		font-weight: 400;
		transform: translateY(0px) scale(0.97);
		pointer-events: none;
	}

	.am-lyrics-element::part(line.next) {
		filter: blur(3px);
		opacity: 0.4;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 400;
		transform: translateY(0px) scale(0.98);
		pointer-events: auto;
	}

	/* Líneas siguientes más borrosas */
	.am-lyrics-element::part(line.next ~ line.next) {
		filter: blur(3.5px);
		opacity: 0.35;
		color: rgba(255, 255, 255, 0.45);
	}

	.am-lyrics-element::part(line.next ~ line.next ~ line.next) {
		filter: blur(4px);
		opacity: 0.3;
		color: rgba(255, 255, 255, 0.4);
	}

	/* Ocultar líneas más allá de las próximas 3-4 */
	.am-lyrics-element::part(line.next ~ line.next ~ line.next ~ line.next) {
		filter: blur(5px);
		opacity: 0.2;
		color: rgba(255, 255, 255, 0.3);
	}

	.am-lyrics-element::part(line.next ~ line.next ~ line.next ~ line.next ~ line.next) {
		opacity: 0;
		filter: blur(6px);
		pointer-events: none;
	}

	@media (min-width: 640px) {
		.lyrics-panel--maximized .am-lyrics-element {
			font-size: clamp(1.05rem, 0.85rem + 1.2vw, 1.85rem);
			line-height: 1.6;
			letter-spacing: 0.01em;
		}

		.lyrics-panel--maximized .am-lyrics-element::part(line) {
			padding-block: clamp(0.65rem, 0.45rem + 0.8vw, 1.2rem);
		}
	}

	.lyrics-placeholder {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		text-align: center;
		color: #cbd5f5;
		padding: 1.5rem;
	}

	.lyrics-message {
		margin: 0;
		font-size: 0.95rem;
	}

	.lyrics-retry {
		border: 1px solid var(--bloom-accent, rgba(96, 165, 250, 0.7));
		background: transparent;
		backdrop-filter: blur(16px) saturate(140%);
		-webkit-backdrop-filter: blur(16px) saturate(140%);
		color: #f0f9ff;
		border-radius: 9999px;
		padding: 0.45rem 1.25rem;
		font-size: 0.85rem;
		font-weight: 500;
		box-shadow: inset 0 0 20px rgba(96, 165, 250, 0.1);
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease;
	}

	.lyrics-retry:hover {
		border-color: var(--bloom-accent, rgba(191, 219, 254, 0.9));
		box-shadow: inset 0 0 30px rgba(96, 165, 250, 0.18);
	}

	.loading-text {
		margin-left: 0.5rem;
		font-size: 0.95rem;
		color: #cbd5f5;
	}

	/* =========================
	   Responsive Design - Pantalla Completa
	   ========================= */
	@media (max-width: 1024px) {
		.lyrics-album-section {
			flex: 0 0 300px;
			padding: 2rem 1.5rem;
		}

		.album-cover,
		.album-cover-placeholder {
			width: 200px;
			height: 200px;
		}

		.album-title {
			font-size: 1.2rem;
		}

		.album-artist {
			font-size: 1rem;
		}
	}

	@media (max-width: 768px) {
		.lyrics-layout {
			flex-direction: column;
		}

		.lyrics-album-section {
			flex: 0 0 200px;
			flex-direction: row;
			align-items: center;
			padding: 1.5rem;
			gap: 1rem;
		}

		.album-cover-container {
			flex: 0 0 auto;
		}

		.album-cover,
		.album-cover-placeholder {
			width: 120px;
			height: 120px;
		}

		.album-details {
			flex: 1;
			text-align: left;
			max-width: none;
		}

		.album-title {
			font-size: 1.1rem;
		}

		.album-artist {
			font-size: 0.95rem;
		}

		.album-name {
			font-size: 0.9rem;
		}

		.album-duration {
			font-size: 0.8rem;
		}
	}

	@media (max-width: 640px) {
		.lyrics-album-section {
			flex: 0 0 150px;
			padding: 1rem;
		}

		.album-cover,
		.album-cover-placeholder {
			width: 80px;
			height: 80px;
		}

		.album-title {
			font-size: 1rem;
		}

		.album-artist {
			font-size: 0.85rem;
		}

		.album-name {
			font-size: 0.8rem;
		}

		.album-duration {
			font-size: 0.75rem;
		}

		.am-lyrics-element::part(container) {
			padding: 2rem 1.5rem;
			padding-block: 3rem;
		}

		.am-lyrics-element::part(line) {
			font-size: 1rem;
			line-height: 1.6;
			filter: blur(3px);
			opacity: 0.2;
		}

		.am-lyrics-element::part(line.active) {
			filter: none;
			opacity: 1;
			transform: scale(1.01);
		}
	}

	/* =========================
	   Wave Animation para Letras
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
		transition: ease 0.2s;
		position: relative;
		background: transparent;
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
		transition: ease 0.2s;
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

	/* Animación de brillo estilo Apple Music para letra activa */
	@keyframes lyricsGlow {
		0% {
			text-shadow: 
				0 0 10px rgba(255, 255, 255, 0.2),
				0 0 20px rgba(255, 255, 255, 0.1),
				0 2px 4px rgba(0, 0, 0, 0.3);
			opacity: 0.8;
			transform: translateY(0px) scale(1);
		}
		50% {
			text-shadow: 
				0 0 40px rgba(255, 255, 255, 0.9),
				0 0 70px rgba(255, 255, 255, 0.5),
				0 0 100px rgba(255, 255, 255, 0.3),
				0 2px 4px rgba(0, 0, 0, 0.3);
			opacity: 1;
			transform: translateY(0px) scale(1.03);
		}
		100% {
			text-shadow: 
				0 0 30px rgba(255, 255, 255, 0.8),
				0 0 60px rgba(255, 255, 255, 0.4),
				0 0 90px rgba(255, 255, 255, 0.2),
				0 2px 4px rgba(0, 0, 0, 0.3);
			opacity: 1;
			transform: translateY(0px) scale(1.02);
		}
	}

	/* Animación para desvanecer líneas anteriores */
	@keyframes fadeOutPrevious {
		0% {
			opacity: 0.4;
			filter: blur(1px);
			transform: translateY(0px) scale(1);
		}
		100% {
			opacity: 0;
			filter: blur(6px);
			transform: translateY(-20px) scale(0.92);
		}
	}
</style>

