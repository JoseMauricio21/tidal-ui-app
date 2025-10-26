<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { losslessAPI } from '$lib/api';
	import { downloadAlbum } from '$lib/downloads';
	import { playerStore } from '$lib/stores/player';
	import { userPreferencesStore } from '$lib/stores/userPreferences';
	import { downloadPreferencesStore } from '$lib/stores/downloadPreferences';
	import { albumHistoryStore, recentArtistsStore } from '$lib/stores/albumHistory';
	import { auth } from '$lib/stores/auth';
	import { getListeningHistory } from '$lib/utils/clientHistory';
	import { Download } from 'lucide-svelte';
	import Loader from '$lib/components/Loader.svelte';
	import type { Album, Artist, Playlist } from '$lib/types';

	let { data } = $props();
	
	// State for different sections
	let albums2025 = $state<Album[]>([]);
	let albumsPopular = $state<Album[]>([]);
	let albumsLatest = $state<Album[]>([]);
	let topAlbums = $state<Album[]>([]);
	let topArtists = $state<Artist[]>([]);
	let recentlyPlayedAlbums = $state<Album[]>([]);
	let cloudRecentlyPlayedAlbums = $state<Album[]>([]);
	let recentArtists = $state<Artist[]>([]);
	let featuredPlaylists = $state<Playlist[]>([]);
	let radioStations = $state<Album[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let albumDownloadStates = $state<Record<number, { downloading: boolean; completed: number; total: number; error: string | null }>>({});
	let greeting = $state('');
	let timeOfDay = $state('');
	let userListeningHistory = $state<any[]>([]);
	let isLoadingHistory = $state(true);

	const spotifyFont = "font-family: 'Circular Std', 'Circular Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.02em;";

	function getGreeting() {
		const hour = new Date().getHours();
		
		if (hour >= 5 && hour < 12) {
			timeOfDay = 'días';
			greeting = '¡Hola, Buenos días!';
		} else if (hour >= 12 && hour < 18) {
			timeOfDay = 'tardes';
			greeting = '¡Hola, Buenas tardes!';
		} else {
			timeOfDay = 'noches';
			greeting = '¡Hola, Buenas noches!';
		}
	}

	// Load user's listening history from Supabase
	async function loadUserListeningHistory() {
		if (!$auth.user) return;
		
		try {
			const history = await getListeningHistory(20);
			userListeningHistory = history;
			
			// Extract unique albums from listening history
			const albumMap = new Map<number, Album>();
			history.forEach((entry: any) => {
				// Use album_id if available, otherwise fall back to track_id
				const albumId = entry.album_id ? parseInt(entry.album_id) : parseInt(entry.track_id);
				if (entry.album_title && !albumMap.has(albumId)) {
					// Create a minimal album object from history data
					const album: Album = {
						id: albumId,
						title: entry.album_title,
						cover: entry.album_cover || '', // Add cover from history if available
						videoCover: null,
						artist: {
							id: 0, // We don't have artist ID in history
							name: entry.artist_name
						}
					};
					albumMap.set(albumId, album);
				}
			});
			
			cloudRecentlyPlayedAlbums = Array.from(albumMap.values()).slice(0, 10);
		} catch (err) {
			console.error('Failed to load user listening history:', err);
			// Fallback to localStorage history if API fails
			const history = get(albumHistoryStore);
			cloudRecentlyPlayedAlbums = history.slice(0, 10).map((entry) => entry.album);
		}
	}

	onMount(async () => {
		getGreeting();

		// Initialize session from localStorage if available
		if (data.session) {
			auth.setSession(data.session);
		}

		// Load recently played albums from history (fallback to localStorage if not logged in)
		const unsubscribe = albumHistoryStore.subscribe((history) => {
			// If user is not logged in, use localStorage history
			if (!$auth.user) {
				recentlyPlayedAlbums = history.slice(0, 10).map((entry) => entry.album);
			}
		});

		// Load recent artists from history (fallback to localStorage if not logged in)
		const unsubscribeArtists = recentArtistsStore.subscribe((artists) => {
			if (!$auth.user) {
				recentArtists = artists;
			}
		});

		// If user is logged in, load their Supabase history
		if ($auth.user) {
			await loadUserListeningHistory();
			isLoadingHistory = false;
		} else {
			isLoadingHistory = false;
		}

		const topAlbumSearches = [
			'Michael Jackson - Thriller',
			'The Beatles - Abbey Road',
			'Pink Floyd - The Dark Side of the Moon',
			'Nirvana - Nevermind',
			'A Night at the Opera',
			'Bob Marley & The Wailers - Legend',
			'Fleetwood Mac - Rumours',
			'The Rolling Stones - Exile on Main St.',
			'Prince - Purple Rain',
			'The Beatles - Sgt. Pepper’s Lonely Hearts Club Band'
		];

		try {
			// Load multiple sections in parallel
			const [albums2025Res, albumsPopularRes, albumsLatestRes, topArtistsRes, playlistsRes, radiosRes, ...topAlbumsResults] = await Promise.all([
				losslessAPI.searchAlbums('2025', 'auto'),
				losslessAPI.searchAlbums('pop', 'auto'),
				losslessAPI.searchAlbums('new', 'auto'),
				losslessAPI.searchArtists('top', 'auto'),
				losslessAPI.searchPlaylists('hits', 'auto'),
				losslessAPI.searchAlbums('radio mix', 'auto'),
				...topAlbumSearches.map(query => losslessAPI.searchAlbums(query, 'auto'))
			]);

			albums2025 = Array.isArray(albums2025Res?.items) ? albums2025Res.items.slice(0, 10) : [];
			albumsPopular = Array.isArray(albumsPopularRes?.items) ? albumsPopularRes.items.slice(0, 10) : [];
			albumsLatest = Array.isArray(albumsLatestRes?.items) ? albumsLatestRes.items.slice(0, 10) : [];
			topArtists = Array.isArray(topArtistsRes?.items) ? topArtistsRes.items.slice(0, 10) : [];
			featuredPlaylists = Array.isArray(playlistsRes?.items) ? playlistsRes.items.slice(0, 10) : [];
			radioStations = Array.isArray(radiosRes?.items) ? radiosRes.items.slice(0, 10) : [];
			topAlbums = topAlbumsResults.map(res => res?.items?.[0]).filter(Boolean) as Album[];
			
			// Debug: Log playlist data
			if (featuredPlaylists.length > 0) {
				console.log('First playlist:', featuredPlaylists[0]);
				console.log('Playlist image field:', featuredPlaylists[0].image);
				console.log('Playlist squareImage field:', featuredPlaylists[0].squareImage);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load content';
			console.error('Error loading home content:', err);
		} finally {
			isLoading = false;
		}
	});

	// Reload history when user logs in/out
	$effect(() => {
		if ($auth.user) {
			loadUserListeningHistory();
		} else {
			// Reset to localStorage history when logged out
			const history = get(albumHistoryStore);
			recentlyPlayedAlbums = history.slice(0, 10).map((entry) => entry.album);
		}
	});

	function patchAlbumDownloadState(albumId: number, patch: Partial<typeof albumDownloadStates[number]>) {
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

	async function handleAlbumDownloadClick(album: Album, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		if (albumDownloadStates[album.id]?.downloading) {
			return;
		}

		patchAlbumDownloadState(album.id, {
			downloading: true,
			completed: 0,
			total: album.numberOfTracks ?? 0,
			error: null
		});

		try {
			const quality = $playerStore.quality;
			const convertAacToMp3 = $userPreferencesStore.convertAacToMp3;
			const downloadCoverSeperately = $userPreferencesStore.downloadCoversSeperately;
			const mode = $downloadPreferencesStore.mode;

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
				album.artist?.name,
				{ mode, convertAacToMp3, downloadCoverSeperately }
			);

			patchAlbumDownloadState(album.id, {
				downloading: false,
				completed: albumDownloadStates[album.id]?.total ?? 0,
				error: null
			});
		} catch (err) {
			console.error('Failed to download album:', err);
			const message = err instanceof Error ? err.message : 'Failed to download album';
			patchAlbumDownloadState(album.id, { downloading: false, error: message });
		}
	}

	function renderAlbumGrid(albumList: Album[]) {
		return albumList.length > 0;
	}

	function renderArtistGrid(artistList: Artist[]) {
		return artistList.length > 0;
	}

	function renderPlaylistGrid(playlistList: Playlist[]) {
		return playlistList.length > 0;
	}
	
	// Function to safely get cover URL
	function getCoverUrl(cover: string | undefined, size: string): string {
		if (!cover) return '';
		return losslessAPI.getCoverUrl(cover, size);
	}
	
	// Function to safely get video cover URL
	function getVideoCoverUrl(videoCover: string | undefined, size: string): string {
		if (!videoCover) return '';
		return losslessAPI.getVideoCoverUrl(videoCover, size);
	}
	
	// Function to safely get artist picture URL
	function getArtistPictureUrl(picture: string | undefined): string {
		if (!picture) return '';
		return losslessAPI.getArtistPictureUrl(picture);
	}
	
	// Handle video error
	function handleVideoError(event: Event) {
		const target = event.target as HTMLVideoElement;
		target.onerror = null;
		target.parentElement!.innerHTML = '<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">Video not available</div>';
	}
	
	// Handle image error
	function handleImageError(event: Event) {
		const target = event.target as HTMLImageElement;
		target.onerror = null;
		// Try alternative image sizes as fallback
		const src = target.src;
		if (src.includes('640x640')) {
			target.src = src.replace('640x640', '320x320');
		} else if (src.includes('320x320')) {
			target.src = src.replace('320x320', '160x160');
		} else {
			target.parentElement!.innerHTML = '<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">No artwork</div>';
		}
	}
	
	// Format listening time for history display
	function formatListeningTime(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('es-ES') + ' a las ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head>
	<title>{data?.title ?? 'BiniTidal'}</title>
	<meta name="description" content="Cool music streaming haha" />
</svelte:head>

<div class="space-y-6">
	<!-- Hero Section -->
	<div class="py-6">
		<div class="mb-6">
			<h1 class="text-4xl sm:text-5xl font-black text-white mb-8 mt-6" style={spotifyFont}>
				{greeting}
			</h1>
			<p class="text-2xl sm:text-3xl text-gray-300 font-semibold">¿Cómo estás Mau?</p>
		</div>
		<div class="flex items-end justify-center gap-2">
			<h2
				class="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-5xl font-bold text-transparent"
			>
				{data?.title ?? 'BiniTidal'}
			</h2>
			<span class="text-sm text-gray-400"></span>
		</div>
	</div>

	<!-- User Listening History Section -->
	{#if $auth.user && renderAlbumGrid(cloudRecentlyPlayedAlbums)}
		<div class="w-full">
			<div class="mb-6">
				<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
					🕒 Reproducidos Recientemente (Nube)
				</h2>
				<p class="text-sm text-gray-400 mt-1">
					Tu historial de reproducción en la nube
				</p>
			</div>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each cloudRecentlyPlayedAlbums as album}
					<div class="group relative text-left">
						<a
							href={`/album/${album.id}`}
							class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
							data-sveltekit-preload-data
						>
							<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
								{#if album.videoCover}
									<video
										src={getVideoCoverUrl(album.videoCover, '640')}
										poster={album.cover ? getCoverUrl(album.cover, '640') : undefined}
										aria-label={album.title}
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
										autoplay
										loop
										muted
										playsinline
										preload="metadata"
										onerror={handleVideoError}
									></video>
								{:else if album.cover}
									<img
										src={getCoverUrl(album.cover, '640')}
										alt={album.title}
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
										onerror={handleImageError}
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">
										No artwork
									</div>
								{/if}
							</div>
							<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
								{album.title}
							</h3>
							<p class="truncate text-sm text-gray-400">
								{album.artist?.name || album.artists?.[0]?.name || 'Unknown Artist'}
							</p>
						</a>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<Loader size={64} />
		</div>
	{:else if error}
		<div class="rounded-lg border border-red-900 bg-red-900/20 p-4 text-red-400">
			{error}
		</div>
	{:else}
		<!-- Recently Played Albums Section (Local History) -->
		{#if !$auth.user && renderAlbumGrid(recentlyPlayedAlbums)}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎧 Reproducidos Recientemente
					</h2>
					<p class="text-sm text-gray-400 mt-1">
						Tu historial de reproducción local
					</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each recentlyPlayedAlbums as album}
						<div class="group relative text-left">
							<button
								onclick={(event) => handleAlbumDownloadClick(album, event)}
								type="button"
								class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
								disabled={albumDownloadStates[album.id]?.downloading}
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
								class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if album.videoCover}
										<video
											src={getVideoCoverUrl(album.videoCover, '640')}
											poster={album.cover ? getCoverUrl(album.cover, '640') : undefined}
											aria-label={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											autoplay
											loop
											muted
											playsinline
											preload="metadata"
											onerror={handleVideoError}
										></video>
									{:else if album.cover}
										<img
											src={getCoverUrl(album.cover, '640')}
											alt={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											onerror={handleImageError}
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">
											No artwork
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
									{album.title}
								</h3>
								<p class="truncate text-sm text-gray-400">
									{album.artist?.name || album.artists?.[0]?.name || 'Unknown Artist'}
								</p>
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Recent Artists Section -->
		{#if renderArtistGrid(recentArtists)}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎤 Artistas Reproducidos Recientemente
					</h2>
					<p class="text-sm text-gray-400 mt-1">
						{#if $auth.user}
							Artistas de tu historial en la nube
						{:else}
							Artistas de tu historial local
						{/if}
					</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each recentArtists as artist}
						<a
							href={`/artist/${artist.id}`}
							class="group text-center"
							data-sveltekit-preload-data
						>
							<div class="relative mb-2 aspect-square overflow-hidden rounded-full">
								{#if artist.picture}
									<img
										src={getArtistPictureUrl(artist.picture)}
										alt={artist.name}
										class="h-full w-full object-cover transition-transform group-hover:scale-105"
										onerror={handleImageError}
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center bg-gray-800">
										<svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
											<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
										</svg>
									</div>
								{/if}
							</div>
							<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
								{artist.name}
							</h3>
							<p class="text-xs text-gray-500">Artista</p>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Nueva Sección: Top 10 Mejores Álbumes -->
		{#if renderAlbumGrid(topAlbums)}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🏆 Top 10 Álbumes Legendarios
					</h2>
					<p class="text-sm text-gray-400 mt-1">Una selección de los mejores álbumes de la historia</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each topAlbums as album}
						<div class="group relative text-left">
							<button
								onclick={(event) => handleAlbumDownloadClick(album, event)}
								type="button"
								class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
								disabled={albumDownloadStates[album.id]?.downloading}
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
								class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if album.videoCover}
										<video
											src={getVideoCoverUrl(album.videoCover, '640')}
											poster={album.cover ? getCoverUrl(album.cover, '640') : undefined}
											aria-label={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											autoplay
											loop
											muted
											playsinline
											preload="metadata"
											onerror={handleVideoError}
										></video>
									{:else if album.cover}
										<img
											src={getCoverUrl(album.cover, '640')}
											alt={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											onerror={handleImageError}
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">
											No artwork
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
									{album.title}
								</h3>
								{#if album.artist}
									<p class="truncate text-sm text-gray-400">{album.artist.name}</p>
								{/if}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}
			<!-- Section 1: Albums 2025 -->
		{#if renderAlbumGrid(albums2025)}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎵 Álbumes 2025
					</h2>
					<p class="text-sm text-gray-400 mt-1">Los mejores lanzamientos del año</p>
				</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each albums2025 as album}
						<div class="group relative text-left">
							<button
								onclick={(event) => handleAlbumDownloadClick(album, event)}
								type="button"
								class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
								disabled={albumDownloadStates[album.id]?.downloading}
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
								class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if album.videoCover}
										<video
											src={getVideoCoverUrl(album.videoCover, '640')}
											poster={album.cover ? getCoverUrl(album.cover, '640') : undefined}
											aria-label={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											autoplay
											loop
											muted
											playsinline
											preload="metadata"
											onerror={handleVideoError}
										></video>
									{:else if album.cover}
										<img
											src={getCoverUrl(album.cover, '640')}
											alt={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											onerror={handleImageError}
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">
											No artwork
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
									{album.title}
								</h3>
								{#if album.artist}
									<p class="truncate text-sm text-gray-400">{album.artist.name}</p>
								{/if}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Section 2: Popular Albums -->
		{#if renderAlbumGrid(albumsPopular)}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🔥 Populares Ahora
					</h2>
					<p class="text-sm text-gray-400 mt-1">Lo más escuchado en este momento</p>
				</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each albumsPopular as album}
						<div class="group relative text-left">
							<button
								onclick={(event) => handleAlbumDownloadClick(album, event)}
								type="button"
								class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
								disabled={albumDownloadStates[album.id]?.downloading}
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
								class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if album.videoCover}
										<video
											src={getVideoCoverUrl(album.videoCover, '640')}
											poster={album.cover ? getCoverUrl(album.cover, '640') : undefined}
											aria-label={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											autoplay
											loop
											muted
											playsinline
											preload="metadata"
											onerror={handleVideoError}
										></video>
									{:else if album.cover}
										<img
											src={getCoverUrl(album.cover, '640')}
											alt={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											onerror={handleImageError}
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">
											No artwork
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
									{album.title}
								</h3>
								{#if album.artist}
									<p class="truncate text-sm text-gray-400">{album.artist.name}</p>
								{/if}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Section 3: Latest Releases -->
		{#if renderAlbumGrid(albumsLatest)}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						✨ Lanzamientos Recientes
					</h2>
					<p class="text-sm text-gray-400 mt-1">Descubre lo más nuevo en la plataforma</p>
				</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each albumsLatest as album}
						<div class="group relative text-left">
							<button
								onclick={(event) => handleAlbumDownloadClick(album, event)}
								type="button"
								class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
								disabled={albumDownloadStates[album.id]?.downloading}
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
								class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if album.videoCover}
										<video
											src={getVideoCoverUrl(album.videoCover, '640')}
											poster={album.cover ? getCoverUrl(album.cover, '640') : undefined}
											aria-label={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											autoplay
											loop
											muted
											playsinline
											preload="metadata"
											onerror={handleVideoError}
										></video>
									{:else if album.cover}
										<img
											src={getCoverUrl(album.cover, '640')}
											alt={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											onerror={handleImageError}
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">
											No artwork
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
									{album.title}
								</h3>
								{#if album.artist}
									<p class="truncate text-sm text-gray-400">{album.artist.name}</p>
								{/if}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Section 4: Top Artists -->
		{#if renderArtistGrid(topArtists)}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						⭐ Artistas Destacados
					</h2>
					<p class="text-sm text-gray-400 mt-1">Los mejores artistas de la plataforma</p>
				</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each topArtists as artist}
						<a
							href={`/artist/${artist.id}`}
							class="group text-center"
							data-sveltekit-preload-data
						>
							<div class="relative mb-2 aspect-square overflow-hidden rounded-full">
								{#if artist.picture}
									<img
										src={losslessAPI.getArtistPictureUrl(artist.picture)}
										alt={artist.name}
										class="h-full w-full object-cover transition-transform group-hover:scale-105"
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center bg-gray-800">
										<svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
											<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
										</svg>
									</div>
								{/if}
							</div>
							<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
								{artist.name}
							</h3>
							<p class="text-xs text-gray-500">Artista</p>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Featured Playlists Section -->
		{#if renderPlaylistGrid(featuredPlaylists)}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						📻 Playlists Destacadas
					</h2>
					<p class="text-sm text-gray-400 mt-1">Las mejores playlists curadas para ti</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each featuredPlaylists as playlist}
						<a
							href={`/playlist/${playlist.uuid}`}
							class="group flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
							data-sveltekit-preload-data
						>
							<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
								{#if playlist.squareImage || playlist.image}
									<img
										src={(playlist.squareImage || playlist.image).startsWith('http') 
											? (playlist.squareImage || playlist.image) 
											: losslessAPI.getCoverUrl(playlist.squareImage || playlist.image, '640')}
										alt={playlist.title}
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
										onerror={handleImageError}
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">
										<svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
											<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
										</svg>
									</div>
								{/if}
							</div>
							<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
								{playlist.title}
							</h3>
							<p class="truncate text-sm text-gray-400">
								{playlist.numberOfTracks || 0} tracks
							</p>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Radio Stations Section -->
		{#if renderAlbumGrid(radioStations)}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎧 Estaciones de Radio
					</h2>
					<p class="text-sm text-gray-400 mt-1">Descubre mezclas y música continua</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each radioStations as radio}
						<div class="group relative text-left">
							<button
								onclick={(event) => handleAlbumDownloadClick(radio, event)}
								type="button"
								class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
								disabled={albumDownloadStates[radio.id]?.downloading}
								aria-label={`Download ${radio.title}`}
							>
								{#if albumDownloadStates[radio.id]?.downloading}
									<Loader size={16} />
								{:else}
									<Download size={16} />
								{/if}
							</button>
							<a
								href={`/album/${radio.id}`}
								class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if radio.videoCover}
										<video
											src={getVideoCoverUrl(radio.videoCover, '640')}
											poster={radio.cover ? getCoverUrl(radio.cover, '640') : undefined}
											aria-label={radio.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											autoplay
											loop
											muted
											playsinline
											preload="metadata"
											onerror={handleVideoError}
										></video>
									{:else if radio.cover}
										<img
											src={getCoverUrl(radio.cover, '640')}
											alt={radio.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											onerror={handleImageError}
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">
											No artwork
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
									{radio.title}
								</h3>
								<p class="truncate text-sm text-gray-400">
									{radio.artist?.name || radio.artists?.[0]?.name || 'Radio Mix'}
								</p>
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>