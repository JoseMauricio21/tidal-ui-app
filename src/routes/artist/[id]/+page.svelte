<script lang="ts">
	import { page } from '$app/stores';
	import { losslessAPI } from '$lib/api';
	import { downloadAlbum } from '$lib/downloads';
	import type { Album, ArtistDetails, AudioQuality } from '$lib/types';
	import TopTracksGrid from '$lib/components/TopTracksGrid.svelte';
	import { onMount } from 'svelte';
	import { ArrowLeft, User, Download } from 'lucide-svelte';
	import Loader from '$lib/components/Loader.svelte';
	import { playerStore } from '$lib/stores/player';
	import { downloadPreferencesStore } from '$lib/stores/downloadPreferences';
	import { userPreferencesStore } from '$lib/stores/userPreferences';

	const spotifyFont = "font-family: 'Circular Std', 'Circular Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.02em;";

	let artist = $state<ArtistDetails | null>(null);
	let artistImage = $state<string | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	const artistId = $derived($page.params.id);
	const topTracks = $derived(artist?.tracks ?? []);
	const discography = $derived(artist?.albums ?? []);
	const downloadQuality = $derived($playerStore.quality as AudioQuality);
	const downloadMode = $derived($downloadPreferencesStore.mode);
	const convertAacToMp3Preference = $derived($userPreferencesStore.convertAacToMp3);

	type AlbumDownloadState = {
		downloading: boolean;
		completed: number;
		total: number;
		error: string | null;
	};

	let isDownloadingDiscography = $state(false);
	let discographyProgress = $state({ completed: 0, total: 0 });
	let discographyError = $state<string | null>(null);
	let albumDownloadStates = $state<Record<number, AlbumDownloadState>>({});

	onMount(async () => {
		if (artistId) {
			await loadArtist(parseInt(artistId));
		}
	});

	// Watch for URL changes and reload artist
	$effect(() => {
		if (artistId) {
			loadArtist(parseInt(artistId));
		}
	});

	function getReleaseYear(date?: string | null): string | null {
		if (!date) return null;
		const timestamp = Date.parse(date);
		if (Number.isNaN(timestamp)) return null;
		return new Date(timestamp).getFullYear().toString();
	}

	function formatAlbumMeta(album: Album): string | null {
		const parts: string[] = [];
		const year = getReleaseYear(album.releaseDate ?? null);
		if (year) parts.push(year);
		if (album.type) parts.push(album.type.replace(/_/g, ' '));
		if (album.numberOfTracks) parts.push(`${album.numberOfTracks} tracks`);
		if (parts.length === 0) return null;
		return parts.join(' • ');
	}

	function displayTrackTotal(total?: number | null): number {
		if (!Number.isFinite(total)) return 0;
		return total && total > 0 ? total + 1 : (total ?? 0);
	}

	function patchAlbumDownloadState(albumId: number, patch: Partial<AlbumDownloadState>) {
		const previous = albumDownloadStates[albumId] ?? {
			downloading: false,
			completed: 0,
			total: 0,
			error: null
		};
		albumDownloadStates = {
			...albumDownloadStates,
			[albumId]: { ...previous, ...patch }
		};
	}

	async function handleAlbumDownload(album: Album, event?: MouseEvent) {
		event?.preventDefault();
		event?.stopPropagation();

		if (isDownloadingDiscography || albumDownloadStates[album.id]?.downloading) {
			return;
		}

		patchAlbumDownloadState(album.id, {
			downloading: true,
			completed: 0,
			total: album.numberOfTracks ?? 0,
			error: null
		});

		const quality = downloadQuality;

		try {
			await downloadAlbum(
				album,
				quality,
				{
					onTotalResolved: (total) => {
						patchAlbumDownloadState(album.id, { total });
					},
					onTrackDownloaded: (completed, total) => {
						patchAlbumDownloadState(album.id, { completed, total });
					}
				},
				artist?.name,
				{ mode: downloadMode, convertAacToMp3: convertAacToMp3Preference }
			);
			const finalState = albumDownloadStates[album.id];
			patchAlbumDownloadState(album.id, {
				downloading: false,
				completed: finalState?.total ?? finalState?.completed ?? 0,
				error: null
			});
		} catch (err) {
			console.error('Failed to download album:', err);
			const message =
				err instanceof Error && err.message
					? err.message
					: 'Failed to download album. Please try again.';
			patchAlbumDownloadState(album.id, { downloading: false, error: message });
		}
	}

	async function handleDownloadDiscography() {
		if (!artist || discography.length === 0 || isDownloadingDiscography) {
			return;
		}

		isDownloadingDiscography = true;
		discographyError = null;

		let estimatedTotal = discography.reduce((sum, album) => sum + (album.numberOfTracks ?? 0), 0);
		if (!Number.isFinite(estimatedTotal) || estimatedTotal < 0) {
			estimatedTotal = 0;
		}

		let completed = 0;
		let total = estimatedTotal;
		discographyProgress = { completed, total };
		const quality = downloadQuality;

		for (const album of discography) {
			let albumEstimate = album.numberOfTracks ?? 0;
			try {
				await downloadAlbum(
					album,
					quality,
					{
						onTotalResolved: (resolvedTotal) => {
							if (resolvedTotal !== albumEstimate) {
								total += resolvedTotal - albumEstimate;
								albumEstimate = resolvedTotal;
								discographyProgress = { completed, total };
							} else if (total === 0 && resolvedTotal > 0) {
								total += resolvedTotal;
								discographyProgress = { completed, total };
							}
						},
						onTrackDownloaded: () => {
							completed += 1;
							discographyProgress = { completed, total };
						}
					},
					artist?.name,
					{ mode: downloadMode, convertAacToMp3: convertAacToMp3Preference }
				);
			} catch (err) {
				console.error('Failed to download discography album:', err);
				const message =
					err instanceof Error && err.message
						? err.message
						: 'Failed to download part of the discography.';
				discographyError = message;
				break;
			}
		}

		isDownloadingDiscography = false;
	}

	async function loadArtist(id: number) {
		try {
			isLoading = true;
			error = null;
			isDownloadingDiscography = false;
			discographyProgress = { completed: 0, total: 0 };
			discographyError = null;
			albumDownloadStates = {};
			const data = await losslessAPI.getArtist(id);
			artist = data;

			// Get artist picture
			if (artist.picture) {
				artistImage = losslessAPI.getArtistPictureUrl(artist.picture);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load artist';
			console.error('Failed to load artist:', err);
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{artist?.name || 'Artist'} </title>
</svelte:head>

{#if isLoading}
	<div class="flex items-center justify-center py-24">
		<Loader size={64} />
	</div>
{:else if error}
	<div class="mx-auto max-w-2xl py-12">
		<div class="rounded-lg border border-red-900 bg-red-900/20 p-6">
			<h2 class="mb-2 text-xl font-semibold text-red-400">Error Loading Artist</h2>
			<p class="text-red-300">{error}</p>
			<a
				href="/"
				class="mt-4 inline-flex rounded-lg bg-red-600 px-4 py-2 transition-colors hover:bg-red-700"
			>
				Go Home
			</a>
		</div>
	</div>
{:else if artist}
	<div class="space-y-10 pb-60 lg:pb-40">
		<!-- Back Button -->
		<button
			onclick={() => window.history.back()}
			class="mt-4 flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
		>
			<ArrowLeft size={20} />
			Volver
		</button>

		<!-- Artist Header -->
		<div class="flex flex-col items-start gap-8 md:flex-row md:items-end">
			<!-- Artist Picture -->
			<div
				class="aspect-square w-full flex-shrink-0 overflow-hidden rounded-full bg-gray-800 shadow-2xl md:w-80"
			>
				{#if artistImage}
					<img src={artistImage} alt={artist.name} class="h-full w-full object-cover" />
				{:else}
					<div class="flex h-full w-full items-center justify-center">
						<User size={120} class="text-gray-600" />
					</div>
				{/if}
			</div>

			<!-- Artist Info -->
			<div class="flex-1">
				<p class="mb-2 text-sm text-gray-400">ARTISTA</p>
				<h1 class="mb-4 text-4xl font-bold md:text-6xl">{artist.name}</h1>

				<div class="mb-6 flex flex-wrap items-center gap-4 text-sm text-gray-400">
					{#if discography.length > 0}
						<div>{discography.length} álbumes</div>
					{/if}
					{#if topTracks.length > 0}
						<div>{topTracks.length} canciones populares</div>
					{/if}
					{#if artist.popularity}
						<div class="rounded bg-blue-900/30 px-2 py-1 text-xs font-semibold text-blue-400">
							Popularidad: {artist.popularity}
						</div>
					{/if}
				</div>

				{#if discography.length > 0}
					<button
						onclick={handleDownloadDiscography}
						type="button"
						class="flex items-center gap-2 rounded-full border border-blue-400/40 px-6 py-3 text-sm font-semibold text-blue-300 transition-colors hover:border-blue-400 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
						disabled={isDownloadingDiscography}
						aria-live="polite"
					>
						{#if isDownloadingDiscography}
							<Loader size={18} />
							Descargando {discographyProgress.completed}/{displayTrackTotal(discographyProgress.total)}
						{:else}
							<Download size={18} />
							Descargar Discografía
						{/if}
					</button>
				{/if}
				{#if discographyError}
					<p class="mt-2 text-sm text-red-400" role="alert">{discographyError}</p>
				{/if}
			</div>
		</div>

		<!-- Music Overview -->
		<div class="space-y-12">
			<section>
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎵 Canciones Populares
					</h2>
					<p class="text-sm text-gray-400 mt-1">Las mejores canciones de {artist.name}</p>
				</div>
				{#if topTracks.length > 0}
					<div class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
						<TopTracksGrid tracks={topTracks} />
					</div>
				{:else}
					<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-6 text-sm text-gray-400">
						<p>No hay canciones populares disponibles para este artista.</p>
					</div>
				{/if}
			</section>

			<section>
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						💿 Discografía
					</h2>
					<p class="text-sm text-gray-400 mt-1">Álbumes, EPs y más de {artist.name}</p>
				</div>
				{#if discography.length > 0}
					<div class="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
						{#each discography as album (album.id)}
							<div
								class="group relative flex h-full flex-col rounded-xl border border-gray-800 bg-gray-900/40 p-4 text-center transition-colors hover:border-blue-700 hover:bg-gray-900"
							>
								<button
									onclick={(event) => handleAlbumDownload(album, event)}
									type="button"
									class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
									disabled={isDownloadingDiscography || albumDownloadStates[album.id]?.downloading}
									aria-label={`Download ${album.title}`}
								>
									{#if albumDownloadStates[album.id]?.downloading}
										<Loader size={16} />
									{:else}
										<Download size={16} />
									{/if}
								</button>
								<a
									href={`/album/${album.id}`}
									class="flex flex-1 flex-col items-center gap-4 rounded-lg text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								>
									<div
										class="mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-lg bg-gray-800"
									>
										{#if album.videoCover}
											<video
												src={losslessAPI.getVideoCoverUrl(album.videoCover, '640')}
												poster={album.cover ? losslessAPI.getCoverUrl(album.cover, '640') : undefined}
												aria-label={album.title}
												class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
												autoplay
												loop
												muted
												playsinline
												preload="metadata"
											></video>
										{:else if album.cover}
											<img
												src={losslessAPI.getCoverUrl(album.cover, '640')}
												alt={album.title}
												class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											/>
										{:else}
											<div
												class="flex h-full w-full items-center justify-center text-sm text-gray-500"
											>
												No artwork
											</div>
										{/if}
									</div>
									<div class="w-full">
										<h3 class="truncate text-balance text-lg font-semibold text-white group-hover:text-blue-400">
											{album.title}
										</h3>
										{#if formatAlbumMeta(album)}
											<p class="mt-1 text-sm text-gray-400">{formatAlbumMeta(album)}</p>
										{/if}
									</div>
								</a>
								{#if albumDownloadStates[album.id]?.downloading}
									<p class="mt-3 text-xs text-blue-300">
										Descargando {albumDownloadStates[album.id]?.completed ?? 0}/{displayTrackTotal(
											albumDownloadStates[album.id]?.total ?? 0
										)} canciones…
									</p>
								{:else if albumDownloadStates[album.id]?.error}
									<p class="mt-3 text-xs text-red-400" role="alert">
										{albumDownloadStates[album.id]?.error}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-6 text-sm text-gray-400">
						<p>No hay información de discografía disponible en este momento.</p>
					</div>
				{/if}
			</section>
		</div>
	</div>
{/if}
