<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import LyricsPopup from '$lib/components/LyricsPopup.svelte';
	import DynamicBackground from '$lib/components/DynamicBackground.svelte';
	import { playerStore } from '$lib/stores/player';
	import { downloadUiStore } from '$lib/stores/downloadUi';
	import { downloadPreferencesStore, type DownloadMode } from '$lib/stores/downloadPreferences';
	import { userPreferencesStore } from '$lib/stores/userPreferences';
	import { effectivePerformanceLevel } from '$lib/stores/performance';
	import { losslessAPI, type TrackDownloadProgress } from '$lib/api';
	import { navigating, page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth';
	import JSZip from 'jszip';
	import {
		Archive,
		FileSpreadsheet,
		ChevronDown,
		Download,
		Check,
		Settings
	} from 'lucide-svelte';
	import Loader from '$lib/components/Loader.svelte';
	import { lyricsOpen } from '$lib/stores/lyrics';
	import type { Navigation } from '@sveltejs/kit';
	import type { Track, AudioQuality } from '$lib/types';

	let { children, data } = $props();
	const pageTitle = $derived(data?.title ?? 'BiniTidal');
	let headerHeight = $state(0);
	let playerHeight = $state(0);
	let viewportHeight = $state(0);
	let navigationState = $state<Navigation | null>(null);
	let showSettingsMenu = $state(false);
	let performanceLevel = $state<'high' | 'medium' | 'low'>('high');
	let isZipDownloading = $state(false);
	let isCsvExporting = $state(false);
	let isLegacyQueueDownloading = $state(false);
	let settingsMenuContainer: HTMLDivElement | null = null;
	let currentNav = $state('inicio');

    // Estado para mostrar/ocultar el título del "Now Playing" cuando cambia la canción
    let displayNowTitle = $state('');
    let lastNowTrackId: number | null = null;
    let initializedNowTitle = $state(false);
    let clearTitleTimeout: ReturnType<typeof setTimeout> | null = null;
    let showNowPlaying = $state(false);
    let hideLabelsTimeout: ReturnType<typeof setTimeout> | null = null;
    let periodicTimeout: ReturnType<typeof setTimeout> | null = null;

	const currentPath = $derived($page.url.pathname);
	
	$effect(() => {
		if (currentPath === '/') {
			currentNav = 'inicio';
		} else if (currentPath === '/search') {
			currentNav = 'buscar';
		} else if (currentPath === '/album') {
			currentNav = 'album';
		} else if (currentPath === '/artist') {
			currentNav = 'artist';
		} else if (currentPath === '/account') {
			currentNav = 'cuenta';
		}
	});

    // Cuando cambia la canción: ocultar labels de tabs y mostrar Now Playing
    $effect(() => {
        const track = $playerStore.currentTrack;
        if (!track) {
            displayNowTitle = '';
            lastNowTrackId = null;
            showNowPlaying = false;
            if (periodicTimeout) {
                clearTimeout(periodicTimeout);
                periodicTimeout = null;
            }
            return;
        }

        // Primera inicialización: mostrar inmediatamente
        if (!initializedNowTitle) {
            initializedNowTitle = true;
            lastNowTrackId = track.id;
            displayNowTitle = track.title ?? '';
            return;
        }

        // Si cambió la pista, activar animación
        if (lastNowTrackId !== track.id) {
            lastNowTrackId = track.id;
            
            // Limpiar timeouts previos
            if (clearTitleTimeout) {
                clearTimeout(clearTitleTimeout);
                clearTitleTimeout = null;
            }
            if (hideLabelsTimeout) {
                clearTimeout(hideLabelsTimeout);
                hideLabelsTimeout = null;
            }
            if (periodicTimeout) {
                clearTimeout(periodicTimeout);
                periodicTimeout = null;
            }
            
            // Mostrar Now Playing inmediatamente
            showNowPlaying = true;
            displayNowTitle = track.title ?? '';
            
            // Ocultar Now Playing después de 5 segundos
            hideLabelsTimeout = setTimeout(() => {
                showNowPlaying = false;
                hideLabelsTimeout = null;
                
                // Iniciar ciclo de 30 segundos
                startPeriodicAnimation();
            }, 5000);
        }
    });

    // Función para iniciar la animación periódica
    function startPeriodicAnimation() {
        if (periodicTimeout) {
            clearTimeout(periodicTimeout);
        }
        
        periodicTimeout = setTimeout(() => {
            if ($playerStore.currentTrack) {
                showNowPlaying = true;
                
                // Ocultar después de 5 segundos y reprogramar
                if (hideLabelsTimeout) {
                    clearTimeout(hideLabelsTimeout);
                }
                hideLabelsTimeout = setTimeout(() => {
                    showNowPlaying = false;
                    hideLabelsTimeout = null;
                    // Programar siguiente animación
                    startPeriodicAnimation();
                }, 5000);
            } else {
                startPeriodicAnimation();
            }
        }, 30000); // 30 segundos
    }
	const downloadMode = $derived($downloadPreferencesStore.mode);
	const queueActionBusy = $derived(
		downloadMode === 'zip'
				? Boolean(isZipDownloading || isLegacyQueueDownloading || isCsvExporting)
				: downloadMode === 'csv'
				? Boolean(isCsvExporting)
				: Boolean(isLegacyQueueDownloading)
	);
	const mainMinHeight = $derived(() => Math.max(0, viewportHeight - headerHeight - playerHeight));
	const contentPaddingBottom = $derived(() => Math.max(playerHeight, 24));
	const mainMarginBottom = $derived(() => Math.max(playerHeight, 128));
	const settingsMenuOffset = $derived(() => Math.max(0, headerHeight + 12));
	const FRIENDLY_ROUTE_MESSAGES: Record<string, string> = {
		album: 'Abriendo álbum',
		artist: 'Visitando artista',
		playlist: 'Cargando playlist'
	};

	const QUALITY_OPTIONS: Array<{ value: AudioQuality; label: string; description: string }> = [
		{
			value: 'HI_RES_LOSSLESS',
			label: 'Hi-Res',
			description: 'FLAC 24-bit (DASH) hasta 192 kHz'
		},
		{
			value: 'LOSSLESS',
			label: 'CD Lossless',
			description: 'FLAC 16-bit / 44.1 kHz'
		},
		{
			value: 'HIGH',
			label: 'AAC 320kbps',
			description: 'Streaming de alta calidad AAC'
		},
		{
			value: 'LOW',
			label: 'AAC 96kbps',
			description: 'Ahorro de datos AAC'
		}
	];

	const PERFORMANCE_OPTIONS: Array<{
		value: 'auto' | 'high' | 'medium' | 'low';
		label: string;
		description: string;
	}> = [
		{
			value: 'auto',
			label: 'Automático',
			description: 'Detecta capacidades del dispositivo automáticamente'
		},
		{
			value: 'high',
			label: 'Alta calidad',
			description: 'Efectos completos con desenfoque y animaciones'
		},
		{
			value: 'medium',
			label: 'Equilibrado',
			description: 'Efectos reducidos para mejor rendimiento'
		},
		{
			value: 'low',
			label: 'Rendimiento',
			description: 'Efectos mínimos para dispositivos de gama baja'
		}
	];

	const playbackQualityLabel = $derived(() => {
		const quality = $playerStore.quality;
		if (quality === 'HI_RES_LOSSLESS') {
			return 'Hi-Res';
		}
		if (quality === 'LOSSLESS') {
			return 'CD';
		}
		return QUALITY_OPTIONS.find((option) => option.value === quality)?.label ?? 'Quality';
	});

	const convertAacToMp3 = $derived($userPreferencesStore.convertAacToMp3);
	const downloadCoversSeperately = $derived($userPreferencesStore.downloadCoversSeperately);

	function selectPlaybackQuality(quality: AudioQuality): void {
		playerStore.setQuality(quality);
		showSettingsMenu = false;
	}

	function toggleAacConversion(): void {
		userPreferencesStore.toggleConvertAacToMp3();
	}

	function toggleDownloadCoversSeperately(): void {
		userPreferencesStore.toggleDownloadCoversSeperately();
	}

	function setDownloadMode(mode: DownloadMode): void {
		downloadPreferencesStore.setMode(mode);
	}

	function setPerformanceMode(mode: 'auto' | 'high' | 'medium' | 'low'): void {
		userPreferencesStore.setPerformanceMode(mode);
	}

	const navigationMessage = $derived(() => {
		if (!navigationState) return '';
		const pathname = navigationState.to?.url?.pathname ?? '';
		const [primarySegment] = pathname.split('/').filter(Boolean);
		if (!primarySegment) return 'Loading';
		const key = primarySegment.toLowerCase();
		if (key in FRIENDLY_ROUTE_MESSAGES) {
			return FRIENDLY_ROUTE_MESSAGES[key]!;
		}
		const normalized = key.replace(/[-_]+/g, ' ');
		return `Loading ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
	});

	function collectQueueState(): { tracks: Track[]; quality: AudioQuality } {
		const state = get(playerStore);
		const tracks = state.queue.length
			? state.queue
			: state.currentTrack
				? [state.currentTrack]
				: [];
		return { tracks, quality: state.quality };
	}

	function buildQueueFilename(track: Track, index: number, quality: AudioQuality): string {
		const ext = getExtensionForQuality(quality, convertAacToMp3);
		const order = `${index + 1}`.padStart(2, '0');
		const artistName = sanitizeForFilename(track.artist?.name ?? 'Unknown Artist');
		const titleName = sanitizeForFilename(track.title ?? `Track ${order}`);
		return `${order} - ${artistName} - ${titleName}.${ext}`;
	}

	function triggerFileDownload(blob: Blob, filename: string): void {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	function timestampedFilename(extension: string): string {
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		return `tidal-export-${stamp}.${extension}`;
	}

	async function downloadQueueAsZip(tracks: Track[], quality: AudioQuality): Promise<void> {
		isZipDownloading = true;

		try {
			const zip = new JSZip();
			for (const [index, track] of tracks.entries()) {
				const filename = buildQueueFilename(track, index, quality);
				const { blob } = await losslessAPI.fetchTrackBlob(track.id, quality, filename, {
					ffmpegAutoTriggered: false,
					convertAacToMp3
				});
				zip.file(filename, blob);
			}

			const zipBlob = await zip.generateAsync({
				type: 'blob',
				compression: 'DEFLATE',
				compressionOptions: { level: 6 }
			});

			triggerFileDownload(zipBlob, timestampedFilename('zip'));
		} catch (error) {
			console.error('Failed to build ZIP export', error);
			alert('Unable to build ZIP export. Please try again.');
		} finally {
			isZipDownloading = false;
		}
	}

	async function exportQueueAsCsv(tracks: Track[], quality: AudioQuality): Promise<void> {
		isCsvExporting = true;

		try {
			const csvContent = await buildTrackLinksCsv(tracks, quality);
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			triggerFileDownload(blob, timestampedFilename('csv'));
		} catch (error) {
			console.error('Failed to export queue as CSV', error);
			alert('Unable to export CSV. Please try again.');
		} finally {
			isCsvExporting = false;
		}
	}

	async function handleExportQueueCsv(): Promise<void> {
		const { tracks, quality } = collectQueueState();
		if (tracks.length === 0) {
			showSettingsMenu = false;
			alert('Add tracks to the queue before exporting.');
			return;
		}

		showSettingsMenu = false;
		await exportQueueAsCsv(tracks, quality);
	}

	async function downloadQueueIndividually(tracks: Track[], quality: AudioQuality): Promise<void> {
		if (isLegacyQueueDownloading) {
			return;
		}

		isLegacyQueueDownloading = true;
		const errors: string[] = [];

		try {
			for (const [index, track] of tracks.entries()) {
				const filename = buildQueueFilename(track, index, quality);
				const { taskId, controller } = downloadUiStore.beginTrackDownload(track, filename, {
					subtitle: track.album?.title ?? track.artist?.name
				});
				downloadUiStore.skipFfmpegCountdown();

				try {
					await losslessAPI.downloadTrack(track.id, quality, filename, {
						signal: controller.signal,
						onProgress: (progress: TrackDownloadProgress) => {
							if (progress.stage === 'downloading') {
								downloadUiStore.updateTrackProgress(
									taskId,
									progress.receivedBytes,
									progress.totalBytes
								);
							} else {
								downloadUiStore.updateTrackStage(taskId, progress.progress);
							}
						},
						onFfmpegCountdown: ({ totalBytes }) => {
							const bytes = typeof totalBytes === 'number' ? totalBytes : 0;
							downloadUiStore.startFfmpegCountdown(bytes, { autoTriggered: false });
						},
						onFfmpegStart: () => downloadUiStore.startFfmpegLoading(),
						onFfmpegProgress: (value) => downloadUiStore.updateFfmpegProgress(value),
						onFfmpegComplete: () => downloadUiStore.completeFfmpeg(),
						onFfmpegError: (error) => downloadUiStore.errorFfmpeg(error),
						ffmpegAutoTriggered: false,
						convertAacToMp3,
						downloadCoverSeperately: downloadCoversSeperately
					});
					downloadUiStore.completeTrackDownload(taskId);
				} catch (error) {
					if (error instanceof DOMException && error.name === 'AbortError') {
						downloadUiStore.completeTrackDownload(taskId);
						continue;
					}
					console.error('Failed to download track from queue:', error);
					downloadUiStore.errorTrackDownload(taskId, error);
					const label = `${track.artist?.name ?? 'Unknown Artist'} - ${track.title ?? 'Unknown Track'}`;
					const message =
						error instanceof Error && error.message
							? error.message
							: 'Failed to download track. Please try again.';
					errors.push(`${label}: ${message}`);
				}
			}

			if (errors.length > 0) {
				const summary = [
					'Unable to download some tracks individually:',
					...errors.slice(0, 3),
					errors.length > 3 ? `…and ${errors.length - 3} more` : undefined
				]
					.filter(Boolean)
					.join('\n');
				alert(summary);
			}
		} finally {
			isLegacyQueueDownloading = false;
		}
	}

	async function handleQueueDownload(): Promise<void> {
		if (queueActionBusy) {
			return;
		}

		const { tracks, quality } = collectQueueState();
		if (tracks.length === 0) {
			showSettingsMenu = false;
			alert('Add tracks to the queue before downloading.');
			return;
		}

		showSettingsMenu = false;

		if (downloadMode === 'csv') {
			await exportQueueAsCsv(tracks, quality);
			return;
		}

		const useZip = downloadMode === 'zip' && tracks.length > 1;
		if (useZip) {
			await downloadQueueAsZip(tracks, quality);
			return;
		}

		await downloadQueueIndividually(tracks, quality);
	}

	const handlePlayerHeight = (height: number) => {
		playerHeight = height;
	};

	let controllerChangeHandler: (() => void) | null = null;

	onMount(() => {
		// Initialize auth session from server data
		if (data.session) {
			auth.setSession(data.session);
		}

		// Subscribe to performance level and update data attribute
		const unsubPerf = effectivePerformanceLevel.subscribe((level) => {
			performanceLevel = level;
			if (typeof document !== 'undefined') {
				document.documentElement.setAttribute('data-performance', level);
			}
		});

		const updateViewportHeight = () => {
			viewportHeight = window.innerHeight;
		};
		updateViewportHeight();
		window.addEventListener('resize', updateViewportHeight);
		const handleDocumentClick = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (showSettingsMenu) {
				const root = settingsMenuContainer;
				if (!root || !target || !root.contains(target)) {
					showSettingsMenu = false;
				}
			}
		};
		document.addEventListener('click', handleDocumentClick);
		const unsubscribe = navigating.subscribe((value) => {
			navigationState = value;
		});

		if ('serviceWorker' in navigator) {
			const registerServiceWorker = async () => {
				try {
					const registration = await navigator.serviceWorker.register('/service-worker.js');
					const sendSkipWaiting = () => {
						if (registration.waiting) {
							registration.waiting.postMessage({ type: 'SKIP_WAITING' });
						}
					};

					if (registration.waiting) {
						sendSkipWaiting();
					}

					registration.addEventListener('updatefound', () => {
						const newWorker = registration.installing;
						if (!newWorker) return;
						newWorker.addEventListener('statechange', () => {
							if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
								sendSkipWaiting();
							}
						});
					});
				} catch (error) {
					console.error('Service worker registration failed', error);
				}
			};

			registerServiceWorker();

			let refreshing = false;
			controllerChangeHandler = () => {
				if (refreshing) return;
				refresh
			};
			navigator.serviceWorker.addEventListener('controllerchange', controllerChangeHandler);
		}
		return () => {
			window.removeEventListener('resize', updateViewportHeight);
			document.removeEventListener('click', handleDocumentClick);
			unsubscribe();
			unsubPerf();
            if (controllerChangeHandler) {
                navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
            }
            // limpiar timeout de restauración del título si existe
            if (clearTitleTimeout) {
                clearTimeout(clearTitleTimeout);
                clearTitleTimeout = null;
            }
            if (hideLabelsTimeout) {
                clearTimeout(hideLabelsTimeout);
                hideLabelsTimeout = null;
            }
            if (periodicTimeout) {
                clearTimeout(periodicTimeout);
                periodicTimeout = null;
            }
		};
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
	<meta name="theme-color" content="#1a0f2e" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<div class="app-root">
    <DynamicBackground />
    <div class="app-shell">
        <header class="app-header glass-panel" bind:clientHeight={headerHeight}>
            <div class="app-header__inner">
                <a href="/" class="brand" aria-label="Inicio">
                    <div class="brand__text">
                        <h1 class="brand__title">{data?.title ?? 'BiniTidal'}</h1>
                        <p class="brand__subtitle">By PCM de Tidal: Jose Mauricio Manjarrez Reyes</p>
                    </div>
                </a>

                <!-- barra de navegación superior con diseño de tabs y Now Playing integrado -->
                <nav class="tabs" class:show-now-playing={showNowPlaying} aria-label="Navegación principal">
                    <input type="radio" name="nav" id="nav-inicio" class="input" checked={currentNav === 'inicio'} onchange={() => goto('/')} />
                    <label for="nav-inicio" class="label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
                        </svg>
                        <span>Inicio</span>
                    </label>

                    <input type="radio" name="nav" id="nav-buscar" class="input" checked={currentNav === 'buscar'} onchange={() => goto('/search')} />
                    <label for="nav-buscar" class="label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <span>Buscar</span>
                    </label>

                    <input type="radio" name="nav" id="nav-album" class="input" checked={currentNav === 'album'} onchange={() => goto('/album')} />
                    <label for="nav-album" class="label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
                            <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                        </svg>
                        <span>Álbum</span>
                    </label>

                    <input type="radio" name="nav" id="nav-artist" class="input" checked={currentNav === 'artist'} onchange={() => goto('/artist')} />
                    <label for="nav-artist" class="label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M4 21c1.5-4.5 6-6 8-6s6.5 1.5 8 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <span>Artista</span>
                    </label>

                    <input type="radio" name="nav" id="nav-cuenta" class="input" checked={currentNav === 'cuenta'} onchange={() => goto('/account')} />
                    <label for="nav-cuenta" class="label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        </svg>
                        <span>Cuenta</span>
                    </label>

                    <!-- Now Playing mini widget integrado en la barra de navegación -->
                    <div class="now-playing-mini" hidden={$lyricsOpen} aria-hidden={$lyricsOpen ? 'true' : 'false'} aria-live="polite">
                        {#if $playerStore.currentTrack}
                            <div class="np-cover">
                                {#if $playerStore.currentTrack.album?.cover}
                                    <img src={losslessAPI.getCoverUrl($playerStore.currentTrack.album.cover, '160')} alt={$playerStore.currentTrack.title}>
                                {/if}
                            </div>
                            <div class="np-meta">
                                <div class="np-label">Estas escuchando</div>
                                <div class="np-title">{$playerStore.currentTrack.title}</div>
                                <div class="np-artist">{$playerStore.currentTrack.artist?.name}</div>
                            </div>
                            <ul class="wave-menu">
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
                        {:else}
                            <div class="np-placeholder">Estas escuchando</div>
                        {/if}
                    </div>
                </nav>

                <!-- User indicator -->
                {#if $auth.user}
                	<div class="user-indicator">
                		<button 
                			class="user-button"
                			onclick={() => goto('/account')}
                			aria-label="User profile"
                		>
                			{#if $auth.user.user_metadata?.avatar_url}
                				<img src={$auth.user.user_metadata.avatar_url} alt="Profile" class="user-avatar" />
                			{:else}
                				<div class="user-initials">
                					{$auth.user.email.charAt(0).toUpperCase()}
                				</div>
                			{/if}
                		</button>
                	</div>
                {/if}
                
                <!-- botón de ajustes: solo icono, fijo en esquina -->
                <div class="settings-trigger" bind:this={settingsMenuContainer}>
                    <button
                        onclick={() => { showSettingsMenu = !showSettingsMenu; }}
                        type="button"
                        class={`toolbar-button icon-only ${showSettingsMenu ? 'is-active' : ''}`}
                        aria-haspopup="true"
                        aria-expanded={showSettingsMenu}
                        aria-label="Ajustes"
                    >
                        <Settings size={20} />
                    </button>

                    {#if showSettingsMenu}
                        <div
                            class="settings-menu glass-popover"
                            style={`--settings-menu-offset: ${settingsMenuOffset()}px;`}
                        >
                            <div class="settings-grid">
                                <section class="settings-section settings-section--wide">
                                    <p class="section-heading">Streaming y Descargas</p>
                                    <div class="option-grid">
                                        {#each QUALITY_OPTIONS as option}
                                            <button
                                                type="button"
                                                onclick={() => selectPlaybackQuality(option.value)}
                                                class={`glass-option ${option.value === $playerStore.quality ? 'is-active' : ''}`}
                                                aria-pressed={option.value === $playerStore.quality}
                                            >
                                                <div class="glass-option__content">
                                                    <span class="glass-option__label">{option.label}</span>
                                                    <span class="glass-option__description">{option.description}</span>
                                                </div>
                                                {#if option.value === $playerStore.quality}
                                                    <Check size={16} class="glass-option__check" />
                                                {/if}
                                            </button>
                                        {/each}
                                    </div>
                                </section>
                                <section class="settings-section settings-section--wide">
                                    <p class="section-heading">Conversiones</p>
                                    <button
                                        type="button"
                                        onclick={toggleAacConversion}
                                        class={`glass-option ${convertAacToMp3 ? 'is-active' : ''}`}
                                        aria-pressed={convertAacToMp3}
                                    >
                                        <span class="glass-option__content">
                                            <span class="glass-option__label">Convertir descargas AAC a MP3</span>
                                            <span class="glass-option__description">Aplica para descargas de 320kbps y 96kbps.</span>
                                        </span>
                                        <span class={`glass-option__chip ${convertAacToMp3 ? 'is-active' : ''}`}>
                                            {convertAacToMp3 ? 'Activado' : 'Desactivado'}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onclick={toggleDownloadCoversSeperately}
                                        class={`glass-option ${downloadCoversSeperately ? 'is-active' : ''}`}
                                        aria-pressed={downloadCoversSeperately}
                                    >
                                        <span class="glass-option__content">
                                            <span class="glass-option__label">Descargar portadas por separado</span>
                                            <span class="glass-option__description">Guardar cover.jpg junto a los archivos de audio.</span>
                                        </span>
                                        <span class={`glass-option__chip ${downloadCoversSeperately ? 'is-active' : ''}`}>
                                            {downloadCoversSeperately ? 'Activado' : 'Desactivado'}
                                        </span>
                                    </button>
                                </section>
                                <section class="settings-section settings-section--wide">
                                    <p class="section-heading">Exportar cola</p>
                                    <div class="option-grid option-grid--compact">
                                        <button
                                            type="button"
                                            onclick={() => setDownloadMode('individual')}
                                            class={`glass-option glass-option--compact ${downloadMode === 'individual' ? 'is-active' : ''}`}
                                            aria-pressed={downloadMode === 'individual'}
                                        >
                                            <span class="glass-option__content">
                                                <span class="glass-option__label">
                                                    <Download size={16} />
                                                    <span>Archivos individuales</span>
                                                </span>
                                            </span>
                                            {#if downloadMode === 'individual'}
                                                <Check size={14} class="glass-option__check" />
                                            {/if}
                                        </button>
                                        <button
                                            type="button"
                                            onclick={() => setDownloadMode('zip')}
                                            class={`glass-option glass-option--compact ${downloadMode === 'zip' ? 'is-active' : ''}`}
                                            aria-pressed={downloadMode === 'zip'}
                                        >
                                            <span class="glass-option__content">
                                                <span class="glass-option__label">
                                                    <Archive size={16} />
                                                    <span>Archivo ZIP</span>
                                                </span>
                                            </span>
                                            {#if downloadMode === 'zip'}
                                                <Check size={14} class="glass-option__check" />
                                            {/if}
                                        </button>
                                        <button
                                            type="button"
                                            onclick={() => setDownloadMode('csv')}
                                            class={`glass-option glass-option--compact ${downloadMode === 'csv' ? 'is-active' : ''}`}
                                            aria-pressed={downloadMode === 'csv'}
                                        >
                                            <span class="glass-option__content">
                                                <span class="glass-option__label">
                                                    <FileSpreadsheet size={16} />
                                                    <span>Exportar enlaces</span>
                                                </span>
                                            </span>
                                            {#if downloadMode === 'csv'}
                                                <Check size={14} class="glass-option__check" />
                                            {/if}
                                        </button>
                                    </div>
                                </section>
                                <section class="settings-section settings-section--wide">
                                    <p class="section-heading">Modo de rendimiento</p>
                                    <div class="option-grid option-grid--compact">
                                        {#each PERFORMANCE_OPTIONS as option}
                                            <button
                                                type="button"
                                                onclick={() => setPerformanceMode(option.value)}
                                                class={`glass-option glass-option--compact ${option.value === $userPreferencesStore.performanceMode ? 'is-active' : ''}`}
                                                aria-pressed={option.value === $userPreferencesStore.performanceMode}
                                            >
                                                <div class="glass-option__content">
                                                    <span class="glass-option__label">{option.label}</span>
                                                </div>
                                                {#if option.value === $userPreferencesStore.performanceMode}
                                                    <Check size={14} class="glass-option__check" />
                                                {/if}
                                            </button>
                                        {/each}
                                    </div>
                                </section>
                                <section class="settings-section settings-section--bordered">
                                    <p class="section-heading">Acciones de la cola</p>
                                    <div class="actions-column">
                                        <button
                                            onclick={handleQueueDownload}
                                            type="button"
                                            class="glass-action"
                                            disabled={queueActionBusy}
                                        >
                                            <span class="glass-action__label">
                                                {#if downloadMode === 'zip'}
                                                    <Archive size={16} />
                                                    <span>Descargar cola</span>
                                                {:else if downloadMode === 'csv'}
                                                    <FileSpreadsheet size={16} />
                                                    <span>Exportar enlaces de la cola</span>
                                                {:else}
                                                    <Download size={16} />
                                                    <span>Descargar cola</span>
                                                {/if}
                                            </span>
                                            {#if queueActionBusy}
                                                <Loader size={16} class="glass-action__spinner" />
                                            {/if}
                                        </button>
                                        <button
                                            onclick={handleExportQueueCsv}
                                            type="button"
                                            class="glass-action"
                                            disabled={isCsvExporting}
                                        >
                                            <span class="glass-action__label">
                                                <FileSpreadsheet size={16} />
                                                <span>Exportar enlaces como CSV</span>
                                            </span>
                                            {#if isCsvExporting}
                                                <Loader size={16} class="glass-action__spinner" />
                                            {/if}
                                        </button>
                                    </div>
                                    <p class="section-footnote">
                                        Las acciones de la cola siguen tu selección de arriba. Los ZIP requieren al menos dos pistas,
                                        mientras que los CSV solo exportan los enlaces de las pistas sin descargar audio.
                                    </p>
                                </section>
                            </div>
                        </div>
                    {/if}
                </div>

            </div>
        </header>

        <!-- App name badge fixed in top-left corner -->
        <div class="app-name-badge" hidden={$lyricsOpen} aria-hidden={$lyricsOpen ? 'true' : 'false'}>
            <img src="/next log.png" alt="Next" class="app-name-logo" />
        </div>



		<main
			class="app-main glass-panel mb-56 sm:mb-40"
			style={`min-height: ${mainMinHeight}px; margin-bottom: ${mainMarginBottom}px;`}
		>
			<div class="app-main__inner">
				{@render children?.()}
			</div>
		</main>

		<AudioPlayer onHeightChange={handlePlayerHeight} />
	</div>
</div>

<LyricsPopup />

<!--
{#if navigationState}
	<div
		transition:fade={{ duration: 200 }}
		class="navigation-overlay"
	>
		<div class="navigation-overlay__progress">
			<div class="navigation-progress"></div>
		</div>
		<div class="navigation-overlay__content">
			<span class="navigation-overlay__label">{navigationMessage()}</span>
		</div>
	</div>
{/if}
-->

<style>
    :global(:root) {
        /* esquema plano y neutro */
        --bg-0: #05070a;
        --bg-1: #071016;
        --accent: #22c1c3;
        --muted: rgba(255,255,255,0.06);
        --text: #e6f1ef;
    }

    :global(body) {
        margin: 0;
        min-height: 100vh;
        font-family: 'Figtree', system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-0) 100%);
        color: var(--text);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }

    /* Contenedor full-bleed: sin padding ni gaps */
    .app-root { padding: 0; background: transparent; min-height: 100vh; }
    .app-shell {
        position: relative;
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        padding: 0;
        gap: 0;
        margin: 0;
    }

    /* Paneles planos: quitar bordes, sombras y radios */
    .glass-panel {
        background: transparent;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
    }

    /* Header: sin franja negra arriba, fondo transparente y sin borde */
    .app-header {
        position: sticky;
        top: 0;
        width: 100%;
        /* mantener algo de espacio interno pero sin crear una franja oscura */
        padding: 0.6rem 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent; /* <- eliminado el gradiente oscuro */
        border-bottom: 0; /* <- quitar la línea inferior */
        box-shadow: none; /* <- por si hay sombras */
        z-index: 40;
    }

    /* App name (Next) fixed on top-left */
    .app-name-badge {
        /* Logo fijado en la esquina superior izquierda pero sin tapar elementos interactivos.
           Se baja el z-index para que no esté encima de la UI y se desactivan eventos de puntero. */
        position: fixed;
        top: calc(16px + env(safe-area-inset-top, 0px));
        left: clamp(48px, 6vw, 80px);
        z-index: 10; /* menor que el header (header tiene z-index:40) */
        padding: 0;
        margin: 0;
        background: transparent;
        border: 0;
        pointer-events: none; /* permite interactuar con lo que esté por encima */
        transition: all 0.3s ease;
    }

    /* Asegurar que el interior no añada espacio visible extra */
    .app-header__inner {
        background: transparent;
        padding: 0;
    }

    .app-name-logo {
        display: block;
        /* Tamaño ajustado para coincidir con el heading "¡Hola, Buenas noches!" */
        height: clamp(45px, 7vw, 90px);
        width: auto;
        max-width: clamp(120px, 22vw, 240px);
        object-fit: contain;
        margin: 0;
        padding: 0;
        transition: opacity 180ms ease, transform 180ms ease, height 0.3s ease, max-width 0.3s ease;
    }

    .brand { gap: 0.6rem; padding: 0; }
    .brand__title { font-size: 1rem; margin: 0; }
    .brand__subtitle { display: none; }

    /* botón de ajustes: solo icono, fijo en esquina */
    .settings-trigger {
        position: fixed;
        top: calc(8px + env(safe-area-inset-top, 0px));
        right: 12px;
        z-index: 90;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* Now Playing mini widget styles - integrado en la barra de navegación */
    .now-playing-mini {
        position: absolute;
        left: 50%;
        transform: translateX(-50%) scale(0.85);
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        border-radius: 8px;
        background: rgba(6,10,14,0.5);
        border: 1px solid rgba(255,255,255,0.06);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), padding 0.4s ease, gap 0.4s ease, width 0.4s ease, left 0.4s ease;
        max-width: 180px;
        height: 36px;
    }

    .tabs.show-now-playing .now-playing-mini {
        opacity: 1;
        transform: translateX(-50%) scale(1);
        padding: 5px 12px;
        gap: 10px;
        width: calc(100% - 16px);
        max-width: none;
        left: 50%;
        height: 38px;
    }
    .now-playing-mini .np-cover {
        width: 28px;
        height: 28px;
        border-radius: 5px;
        overflow: hidden;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        transition: width 0.4s ease, height 0.4s ease, border-radius 0.4s ease;
    }

    .tabs.show-now-playing .now-playing-mini .np-cover {
        width: 32px;
        height: 32px;
        border-radius: 6px;
    }
    .now-playing-mini .np-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    .now-playing-mini .np-meta {
        display: grid;
        line-height: 1.1;
        overflow: hidden;
    }
    .now-playing-mini .np-label {
        font-size: 0.6rem;
        opacity: 0.7;
        transition: font-size 0.4s ease, opacity 0.4s ease;
    }

    .tabs.show-now-playing .now-playing-mini .np-label {
        font-size: 0.65rem;
        opacity: 0.75;
    }
    .now-playing-mini .np-title {
        font-size: 0.75rem;
        font-weight: 700;
        color: #fff;
        max-width: 28ch;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: opacity 260ms ease, transform 260ms ease, font-size 0.4s ease;
        will-change: opacity, transform;
    }

    .tabs.show-now-playing .now-playing-mini .np-title {
        font-size: 0.85rem;
    }

    /* clase aplicada cuando ocultamos el título tras el cambio de canción */
    .now-playing-mini .np-title.hidden {
        opacity: 0;
        transform: translateY(-6px) scale(0.98);
    }
    .now-playing-mini .np-artist {
        font-size: 0.65rem;
        color: #cfe3e0;
        max-width: 28ch;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: font-size 0.4s ease;
    }

    .tabs.show-now-playing .now-playing-mini .np-artist {
        font-size: 0.7rem;
    }
    .now-playing-mini .np-placeholder {
        font-size: 0.65rem;
        opacity: 0.65;
        transition: font-size 0.4s ease;
    }

    .tabs.show-now-playing .now-playing-mini .np-placeholder {
        font-size: 0.75rem;
    }

    /* Wave menu animation - From Uiverse.io by JkHuger */
    .wave-menu {
        border: 4px solid transparent;
        border-radius: 50px;
        width: auto;
        height: 32px;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0;
        margin: 0 0 0 auto;
        cursor: pointer;
        transition: ease 0.2s;
        position: relative;
        background: transparent;
        flex-shrink: 0;
    }

    .wave-menu li {
        list-style: none;
        height: 20px;
        width: 3px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.8);
        margin: 0 3px;
        padding: 0;
        animation-name: wave1;
        animation-duration: 0.3s;
        animation-iteration-count: infinite;
        animation-direction: alternate;
        transition: ease 0.2s;
    }

    .tabs.show-now-playing .wave-menu li {
        height: 24px;
        width: 3.5px;
        margin: 0 4px;
    }

    .wave-menu:hover > li {
        background: rgba(255, 255, 255, 1);
    }

    .wave-menu li:nth-child(2) {
        animation-name: wave2;
        animation-delay: 0.2s;
    }

    .wave-menu li:nth-child(3) {
        animation-name: wave3;
        animation-delay: 0.23s;
        animation-duration: 0.4s;
    }

    .wave-menu li:nth-child(4) {
        animation-name: wave4;
        animation-delay: 0.1s;
        animation-duration: 0.3s;
    }

    .wave-menu li:nth-child(5) {
        animation-delay: 0.5s;
    }

    .wave-menu li:nth-child(6) {
        animation-name: wave2;
        animation-duration: 0.5s;
    }

    .wave-menu li:nth-child(8) {
        animation-name: wave4;
        animation-delay: 0.4s;
        animation-duration: 0.25s;
    }

    .wave-menu li:nth-child(9) {
        animation-name: wave3;
        animation-delay: 0.15s;
    }

    @keyframes wave1 {
        from {
            transform: scaleY(1);
        }
        to {
            transform: scaleY(0.5);
        }
    }

    @keyframes wave2 {
        from {
            transform: scaleY(0.3);
        }
        to {
            transform: scaleY(0.6);
        }
    }

    @keyframes wave3 {
        from {
            transform: scaleY(0.6);
        }
        to {
            transform: scaleY(0.8);
        }
    }

    @keyframes wave4 {
        from {
            transform: scaleY(0.2);
        }
        to {
            transform: scaleY(0.5);
        }
    }

    @media (max-width: 720px) {
        .now-playing-mini { display: none; }
    }

    /* Ajustar el logo en pantallas medianas */
    @media (max-width: 768px) {
        .app-name-badge {
            top: calc(14px + env(safe-area-inset-top, 0px));
            left: 32px;
        }
        .app-name-logo {
            height: clamp(38px, 6vw, 70px);
            max-width: clamp(100px, 20vw, 180px);
        }
    }

    /* Ocultar el logo cuando la ventana sea muy pequeña para evitar solapamientos */
    @media (max-width: 480px) {
        .app-name-badge {
            display: none;
        }
    }

    /* Ajuste adicional para pantallas muy grandes */
    @media (min-width: 1920px) {
        .app-name-badge {
            top: calc(20px + env(safe-area-inset-top, 0px));
            left: clamp(64px, 6vw, 96px);
        }
        .app-name-logo {
            height: clamp(75px, 8vw, 110px);
            max-width: clamp(200px, 24vw, 300px);
        }
    }

    /* Ocultar la toolbar original dentro del header (no ocupa
     espacio) */
    .toolbar { display: none; }

    /* Botón icon-only: círculo compacto */
    .toolbar-button.icon-only {
        padding: 8px;
        width: 40px;
        height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: rgba(6,10,14,0.6);
        border: 0;
        box-shadow: none;
        color: var(--text);
    }

    /* Quitar textos/chevrons para icon-only (si quedan en DOM) */
    .toolbar-button .toolbar-button__text,
    .toolbar-button__chevron,
    .text-gray-400 {
        display: none !important;
    }

    /* User indicator */
    .user-indicator {
        position: fixed;
        top: calc(8px + env(safe-area-inset-top, 0px));
        right: 56px;
        z-index: 80;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .user-button {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }

    .user-button:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: scale(1.05);
    }

    .user-avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
    }

    .user-initials {
        font-weight: 600;
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.875rem;
    }

    /* Ajustar el menú para abrir desde el icono fijo */
    .settings-menu {
        top: calc(56px + env(safe-area-inset-top, 0px));
        right: 12px;
        left: auto;
        width: min(440px, calc(100% - 2rem));
    }

    /* Main full-bleed: sin márgenes laterales ni radios */
    .app-main {
        flex: 1;
        padding: 1rem;
        border-radius: 0;
        width: 100%;
        margin: 0;
        background: transparent;
    }

    .app-main__inner {
        max-width: 1400px;
        margin: 0 auto;
        width: 100%;
        padding: 0;
    }

    /* Menú de ajustes compacto y plano */
    .settings-menu {
        position: fixed;
        top: calc(56px + env(safe-area-inset-top, 0px));
        right: 1rem;
        width: min(440px, calc(100% - 2rem));
        max-height: calc(100vh - 96px);
        padding: 0.75rem;
        border-radius: 12px;
        background: rgba(6,10,14,0.94);
        border: 0;
        box-shadow: 0 8px 30px rgba(0,0,0,0.45);
    }

    .settings-grid { display: grid; gap: 0.75rem; }

    .section-heading { color: rgba(255,255,255,0.75); font-size: 0.7rem; margin: 0 0 0.25rem 0; }

    .glass-option {
        padding: 0.5rem 0.6rem;
        border-radius: 10px;
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .glass-option.is-active {
        background: linear-gradient(90deg, rgba(34,193,195,0.08), rgba(34,193,195,0.02));
    }

    .glass-option__label { font-weight: 700; font-size: 0.9rem; }
    .glass-option__description { font-size: 0.72rem; opacity: 0.7; }

    .actions-column { gap: 0.5rem; display: flex; flex-direction: column; }

    .glass-action {
        padding: 0.6rem 0.75rem;
        border-radius: 10px;
        background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent);
    }

    .glass-action__spinner { color: var(--accent); }

    .settings-section--bordered { border-top: 0; padding-top: 0.5rem; }

    /* Navigation overlay reducido */
    .navigation-overlay { backdrop-filter: none; -webkit-backdrop-filter: none; }

    /* Play all: botón fijo discreto abajo a la derecha */
    .play-all-btn {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 60;
        background: linear-gradient(90deg, var(--accent), #16a0a2);
        color: #051017;
        border: 0;
        padding: 0.6rem 1rem;
        border-radius: 999px;
        font-weight: 700;
        box-shadow: 0 6px 20px rgba(7,11,14,0.6);
        cursor: pointer;
    }

    /* hover eliminado: ya no hay transform al pasar el ratón */
    /* .play-all-btn:hover { transform: translateY(-2px); } */

    /* Tabs Navigation Styling */
    .tabs {
        --radius: 8px;
        --border: 2px;
        --height: 44px;
        --speed: 0.25s;
        --ease: linear(0, 0.1641 3.52%, 0.311 7.18%, 0.4413 10.99%, 0.5553 14.96%, 0.6539 19.12%, 0.738 23.5%, 0.8086 28.15%, 0.8662 33.12%, 0.9078 37.92%, 0.9405 43.12%, 0.965 48.84%, 0.9821 55.28%, 0.992 61.97%, 0.9976 70.09%, 1);
        
        height: var(--height);
        display: grid;
        grid-auto-flow: column;
        background: hsl(0 0% 0%);
        border-radius: var(--radius);
        grid-auto-columns: 1fr;
        position: relative;
        border: var(--border) solid hsl(0 0% 0%);
        margin-left: auto;
        margin-right: auto;
        align-items: center;
        isolation: isolate;
    }

    .tabs:has(.input:nth-of-type(2)) {
        --count: 2;
    }
    .tabs:has(.input:nth-of-type(3)) {
        --count: 3;
    }
    .tabs:has(.input:nth-of-type(4)) {
        --count: 4;
    }
    .tabs:has(.input:nth-of-type(5)) {
        --count: 5;
    }

    .tabs:has(:checked:nth-of-type(1)) {
        --active: 0;
    }
    .tabs:has(:checked:nth-of-type(2)) {
        --active: 1;
    }
    .tabs:has(:checked:nth-of-type(3)) {
        --active: 2;
    }
    .tabs:has(:checked:nth-of-type(4)) {
        --active: 3;
    }
    .tabs:has(:checked:nth-of-type(5)) {
        --active: 4;
    }

    .tabs .input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
    }

    .tabs :checked + .label {
        --highlight: 1;
    }

    .tabs .label {
        padding: 0 clamp(8px, 8px + 8px, 16px);
        cursor: pointer;
        text-align: center;
        height: 100%;
        display: grid;
        border-radius: calc(var(--radius) - var(--border));
        place-items: center;
        color: hsl(0 0% 100% / calc(0.5 + var(--highlight, 0)));
        transition: background, color, opacity, transform;
        transition-duration: 0.25s;
        transition-timing-function: var(--ease, ease);
        font-size: 0.85rem;
        gap: 4px;
        flex-direction: row;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .tabs .label span,
    .tabs .label svg {
        transition: opacity 0.4s ease, transform 0.4s ease;
        opacity: 1;
    }

    .tabs.show-now-playing .label span,
    .tabs.show-now-playing .label svg {
        opacity: 0;
        transform: scale(0.9);
    }

    .tabs .input:not(:checked) + .label:hover {
        --highlight: 0.35;
        background: hsl(0 0% 20%);
    }

    .tabs::after {
        pointer-events: none;
        content: "";
        width: calc(100% / var(--count));
        height: 100%;
        background: hsl(0 0% 100%);
        position: absolute;
        border-radius: calc(var(--radius) - var(--border));
        mix-blend-mode: difference;
        translate: calc(var(--active, 0) * 100%) 0;
        transition: translate, outline-color, opacity;
        transition-duration: var(--speed);
        transition-timing-function: var(--ease, ease);
        outline: 2px solid transparent;
        opacity: 1;
    }

    .tabs.show-now-playing::after {
        opacity: 0;
    }

    .tabs:has(:focus-visible)::after {
        outline-color: rgba(255, 255, 255, 0.2);
    }
    
        
    /* Responsive: mantener full-bleed en móvil */
    @media (max-width: 640px) {
    .app-header__inner { padding: 0 0.5rem; }
    .settings-menu { right: 0.6rem; left: 0.6rem; width: auto; }
    .app-main { padding: 0.75rem; }
    .play-all-btn { right: 12px; bottom: 12px; padding: 0.5rem 0.9rem; }
    .top-nav { gap: 6px; }
    .top-nav__btn { padding: 6px 8px; }
    }
    </style>


