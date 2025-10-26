<script lang="ts">
	import { page } from '$app/stores';
	import { losslessAPI } from '$lib/api';
	import TrackList from '$lib/components/TrackList.svelte';
	import type { Album, Track, Playlist, Artist } from '$lib/types';
	import { onMount } from 'svelte';
	import {
		ArrowLeft,
		Play,
		Calendar,
		Disc,
		Clock,
		Download,
		Shuffle,
		Plus,
		Share2,
		Heart,
		ListMusic,
		Repeat
	} from 'lucide-svelte';
	import Loader from '$lib/components/Loader.svelte';
	import { playerStore } from '$lib/stores/player';
	import { downloadPreferencesStore } from '$lib/stores/downloadPreferences';
	import { userPreferencesStore } from '$lib/stores/userPreferences';
	import { downloadAlbum } from '$lib/downloads';

	let album = $state<Album | null>(null);
	let tracks = $state<Track[]>([]);
	let relatedAlbums = $state<Album[]>([]);
	let relatedPlaylists = $state<Playlist[]>([]);
	let artistRadios = $state<Album[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let isDownloadingAll = $state(false);
	let downloadedCount = $state(0);
	let downloadError = $state<string | null>(null);
	let isFavorite = $state(false);
	let showShareMenu = $state(false);
	let isPlaying = $state(false);
	const albumDownloadMode = $derived($downloadPreferencesStore.mode);
	const convertAacToMp3Preference = $derived($userPreferencesStore.convertAacToMp3);

	const spotifyFont = "font-family: 'Circular Std', 'Circular Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.02em;";

	const albumId = $derived($page.params.id);

	onMount(async () => {
		if (albumId) {
			await loadAlbum(parseInt(albumId));
		}
	});

	// Watch for URL changes and reload album
	$effect(() => {
		if (albumId) {
			loadAlbum(parseInt(albumId));
		}
	});

	async function loadAlbum(id: number) {
		try {
			isLoading = true;
			error = null;
			
			// First try to get the album from the API
			try {
				const { album: albumData, tracks: albumTracks } = await losslessAPI.getAlbum(id);
				album = albumData;
				tracks = albumTracks;
			} catch (albumError) {
				// If album API fails, try to get track info and extract album from it
				try {
					const trackLookup = await losslessAPI.getTrack(id);
					const track = trackLookup.track;
					
					if (track.album) {
						// Use the album from the track
						album = track.album;
						// Get the full album data
						const { album: fullAlbumData, tracks: albumTracks } = await losslessAPI.getAlbum(track.album.id);
						album = fullAlbumData;
						tracks = albumTracks;
					} else {
						// Create a minimal album object from track data
						album = {
							id: id,
							title: track.album?.title || track.title || 'Unknown Album',
							cover: track.album?.cover || '',
							videoCover: null
						};
						tracks = [track];
					}
				} catch (trackError) {
					// If both fail, create a minimal album object
					console.warn('Failed to load album or track from API, creating minimal album object:', trackError);
					album = {
						id: id,
						title: 'Unknown Album',
						cover: '',
						videoCover: null
					};
					tracks = [];
				}
			}

			// Load related content in parallel
			if (album.artist?.name || album.title !== 'Unknown Album') {
				const searchQuery = album.artist?.name || album.title;
				console.log('Loading related content for:', searchQuery);
				
				const [albumsRes, playlistsRes, radiosRes] = await Promise.all([
					// Search for more albums from this artist
					losslessAPI.searchAlbums(searchQuery, 'auto').catch((err) => {
						console.error('Failed to load related albums:', err);
						return { items: [] };
					}),
					// Search for playlists featuring this artist/album
					losslessAPI.searchPlaylists(searchQuery, 'auto').catch((err) => {
						console.error('Failed to load playlists:', err);
						return { items: [] };
					}),
					// Search for similar music (genre/style)
					losslessAPI.searchAlbums(`${searchQuery} similar`, 'auto').catch((err) => {
						console.error('Failed to load radio:', err);
						return { items: [] };
					})
				]);

				console.log('Albums found:', albumsRes.items?.length || 0);
				console.log('Playlists found:', playlistsRes.items?.length || 0);
				console.log('Radio found:', radiosRes.items?.length || 0);

				// Filter out current album from related albums
				relatedAlbums = (albumsRes.items || []).filter(a => a.id !== album.id).slice(0, 10);
				relatedPlaylists = (playlistsRes.items || []).slice(0, 10);
				artistRadios = (radiosRes.items || []).filter(a => a.id !== album.id).slice(0, 10);
				
				console.log('Final - Related albums:', relatedAlbums.length);
				console.log('Final - Playlists:', relatedPlaylists.length);
				console.log('Final - Radios:', artistRadios.length);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load album';
			console.error('Failed to load album:', err);
		} finally {
			isLoading = false;
		}
	}

	function handlePlayAll() {
		if (tracks.length > 0) {
			const currentTrack = $playerStore.currentTrack;
			const isCurrentAlbum = currentTrack && tracks.some(t => t.id === currentTrack.id);
			
			if (isCurrentAlbum && $playerStore.isPlaying) {
				// If already playing this album, pause
				playerStore.pause();
			} else if (isCurrentAlbum && !$playerStore.isPlaying) {
				// If paused on this album, resume
				playerStore.play();
			} else {
				// Play the album from start
				playerStore.setQueue(tracks, 0);
				playerStore.play();
			}
		}
	}

	// Watch player state
	$effect(() => {
		if ($playerStore.currentTrack && tracks.some(t => t.id === $playerStore.currentTrack?.id)) {
			isPlaying = $playerStore.isPlaying;
		} else {
			isPlaying = false;
		}
	});

	function shuffleTracks(list: Track[]): Track[] {
		const items = list.slice();
		for (let i = items.length - 1; i > 0; i -= 1) {
			const j = Math.floor(Math.random() * (i + 1));
			[items[i], items[j]] = [items[j]!, items[i]!];
		}
		return items;
	}

	function handleShufflePlay() {
		if (tracks.length === 0) return;
		const shuffled = shuffleTracks(tracks);
		playerStore.setQueue(shuffled, 0);
		playerStore.play();
	}

	async function handleDownloadAll() {
		if (!album || tracks.length === 0 || isDownloadingAll) {
			return;
		}

		isDownloadingAll = true;
		downloadedCount = 0;
		downloadError = null;
		const quality = $playerStore.quality;
		const mode = albumDownloadMode;

		try {
			await downloadAlbum(
				album,
				quality,
				{
					onTotalResolved: () => {
						downloadedCount = 0;
					},
					onTrackDownloaded: (completed) => {
						downloadedCount = completed;
					}
				},
				album.artist?.name,
				{ mode, convertAacToMp3: convertAacToMp3Preference }
			);
		} catch (err) {
			console.error('Failed to download album:', err);
			downloadError =
				err instanceof Error && err.message
					? err.message
					: 'Failed to download one or more tracks.';
		} finally {
			isDownloadingAll = false;
		}
	}

	function handleAddToQueue() {
		if (tracks.length > 0) {
			playerStore.addToQueue(tracks);
		}
	}

	function handlePlayNext() {
		if (tracks.length > 0) {
			playerStore.playNext(tracks);
		}
	}

	function handleToggleFavorite() {
		isFavorite = !isFavorite;
		// TODO: Implement favorite storage
	}

	function handleShare() {
		if (album) {
			const url = window.location.href;
			if (navigator.share) {
				navigator.share({
					title: album.title,
					text: `${album.title} - ${album.artist?.name || 'Unknown Artist'}`,
					url: url
				}).catch(() => {});
			} else {
				navigator.clipboard.writeText(url);
				showShareMenu = true;
				setTimeout(() => showShareMenu = false, 2000);
			}
		}
	}

	function handleRepeatAlbum() {
		if (tracks.length > 0) {
			playerStore.setQueue(tracks, 0);
			playerStore.play();
			// TODO: Set repeat mode to album
		}
	}

	const totalDuration = $derived(tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0));
</script>

<svelte:head>
	<title>{album?.title || 'Album'} - TIDAL UI</title>
</svelte:head>

{#if isLoading}
	<div class="flex items-center justify-center py-24">
		<Loader size={64} />
	</div>
{:else if error}
	<div class="mx-auto max-w-2xl py-12">
		<div class="rounded-lg border border-red-900 bg-red-900/20 p-6">
			<h2 class="mb-2 text-xl font-semibold text-red-400">Error al Cargar el Álbum</h2>
			<p class="text-red-300">{error}</p>
			<a
				href="/"
				class="mt-4 inline-flex rounded-lg bg-red-600 px-4 py-2 transition-colors hover:bg-red-700"
			>
				Ir al Inicio
			</a>
		</div>
	</div>
{:else if album}
	<div class="space-y-10 pb-60 lg:pb-40">
		<!-- Back Button -->
		<button
			onclick={() => window.history.back()}
			class="mt-4 flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
		>
			<ArrowLeft size={20} />
			Volver
		</button>

		<!-- Album Header -->
		<div class="flex flex-col gap-8 md:flex-row">
			<!-- Album Cover -->
			{#if album.videoCover || album.cover}
				<div
					class="aspect-square w-full flex-shrink-0 overflow-hidden rounded-lg shadow-2xl md:w-80"
				>
					{#if album.videoCover}
						<video
							src={losslessAPI.getVideoCoverUrl(album.videoCover, '640')}
							poster={album.cover ? losslessAPI.getCoverUrl(album.cover, '640') : undefined}
							aria-label={album.title}
							class="h-full w-full object-cover"
							autoplay
							loop
							muted
							playsinline
							preload="metadata"
						></video>
					{:else}
						<img
							src={losslessAPI.getCoverUrl(album.cover!, '640')}
							alt={album.title}
							class="h-full w-full object-cover"
						/>
					{/if}
				</div>
			{/if}

			<!-- Album Info -->
			<div class="flex flex-1 flex-col justify-end">
				<p class="mb-2 text-sm text-gray-400">ALBUM</p>
				<h1 class="mb-4 text-4xl font-bold md:text-6xl">{album.title}</h1>
				<div class="mb-4 flex items-center gap-1">
					{#if album.explicit}
						<svg
							class="inline h-4 w-4 flex-shrink-0 align-middle"
							xmlns="http://www.w3.org/2000/svg"
							fill="currentColor"
							height="24"
							viewBox="0 0 24 24"
							width="24"
							focusable="false"
							aria-hidden="true"
							><path
								d="M20 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V4a2 2 0 00-2-2ZM8 6h8a1 1 0 110 2H9v3h5a1 1 0 010 2H9v3h7a1 1 0 010 2H8a1 1 0 01-1-1V7a1 1 0 011-1Z"
							></path></svg
						>
					{/if}
					{#if album.artist}
						<a
							href={`/artist/${album.artist.id}`}
							data-sveltekit-preload-data
							class="text-left text-xl text-gray-300 hover:text-white hover:underline"
						>
							{album.artist.name}
						</a>
					{/if}
				</div>

				<div class="mb-6 flex flex-wrap items-center gap-4 text-sm text-gray-400">
					{#if album.releaseDate}
						<div class="flex items-center gap-1">
							<Calendar size={16} />
							{new Date(album.releaseDate).getFullYear()}
						</div>
					{/if}
					{#if tracks.length > 0 || album.numberOfTracks}
						<div class="flex items-center gap-1">
							<Disc size={16} />
							{tracks.length || album.numberOfTracks} tracks
						</div>
					{/if}
					{#if totalDuration > 0}
						<div class="flex items-center gap-1">
							<Clock size={16} />
							{losslessAPI.formatDuration(totalDuration)} total
						</div>
					{/if}
					<!--
					{#if album.audioQuality}
						<div class="rounded bg-blue-900/30 px-2 py-1 text-xs font-semibold text-blue-400">
							{album.audioQuality}
						</div>
					{/if}
					-->
					{#if album.mediaMetadata?.tags}
						{#each album.mediaMetadata.tags as tag}
							<div class="rounded bg-blue-900/30 px-2 py-1 text-xs font-semibold text-blue-400">
								{tag}
							</div>
						{/each}
					{/if}
				</div>

				{#if tracks.length > 0}
					<div class="flex flex-wrap items-center gap-3">
						<!-- Primary Actions -->
						<button
							onclick={handlePlayAll}
							class="flex items-center justify-center w-14 h-14 transition-colors hover:bg-white/10 rounded-full"
							aria-label={isPlaying ? 'Pausar' : 'Reproducir Todo'}
						>
							<label class="w-6 h-6 flex flex-col items-center justify-center pointer-events-none">
								<input class="hidden peer" type="checkbox" checked={isPlaying} />
								<div
									class="w-[50%] h-[2px] bg-white rounded-sm transition-all duration-300 origin-center rotate-90 -translate-x-[0.3rem] translate-y-[0.1rem] peer-checked:translate-y-[0.1rem]"
								></div>
								<div
									class="w-[50%] h-[2px] bg-white rounded-md transition-all duration-300 origin-center rotate-90 translate-x-[0.3rem] -translate-y-[0.05rem] peer-checked:rotate-[-30deg] peer-checked:translate-y-[0.22rem] peer-checked:translate-x-[0.15rem]"
								></div>
								<div
									class="w-[50%] h-[2px] bg-white rounded-md transition-all duration-300 origin-center rotate-90 translate-x-[0.3rem] -translate-y-[0.16rem] peer-checked:rotate-[30deg] peer-checked:translate-y-[-0.4rem] peer-checked:translate-x-[0.15rem]"
								></div>
							</label>
						</button>
						<button
							onclick={handleShufflePlay}
							class="flex items-center gap-2 rounded-full border border-purple-400/50 px-6 py-3 text-sm font-semibold text-purple-200 transition-colors hover:border-purple-300 hover:text-purple-100"
						>
							<Shuffle size={18} />
							Aleatorio
						</button>

						<!-- Queue Actions -->
						<button
							onclick={handleAddToQueue}
							class="flex items-center gap-2 rounded-full border border-green-400/40 px-6 py-3 text-sm font-semibold text-green-300 transition-colors hover:border-green-400 hover:text-green-200"
						>
							<Plus size={18} />
							Añadir a Cola
						</button>
						<button
							onclick={handlePlayNext}
							class="flex items-center gap-2 rounded-full border border-yellow-400/40 px-6 py-3 text-sm font-semibold text-yellow-300 transition-colors hover:border-yellow-400 hover:text-yellow-200"
						>
							<ListMusic size={18} />
							Reproducir Siguiente
						</button>

						<!-- Download -->
						<button
							onclick={handleDownloadAll}
							class="flex items-center gap-2 rounded-full border border-blue-400/40 px-6 py-3 text-sm font-semibold text-blue-300 transition-colors hover:border-blue-400 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
							disabled={isDownloadingAll}
						>
							<Download size={18} />
							{isDownloadingAll
								? `Descargando ${downloadedCount}/${tracks.length}`
								: 'Descargar Todo'}
						</button>

						<!-- Secondary Actions -->
						<button
							onclick={handleToggleFavorite}
							class="flex items-center gap-2 rounded-full border {isFavorite ? 'border-pink-500 bg-pink-500/20' : 'border-pink-400/40'} px-6 py-3 text-sm font-semibold {isFavorite ? 'text-pink-300' : 'text-pink-300'} transition-colors hover:border-pink-400 hover:text-pink-200"
						>
							<Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
							{isFavorite ? 'Favorito' : 'Me Gusta'}
						</button>
						<button
							onclick={handleRepeatAlbum}
							class="flex items-center gap-2 rounded-full border border-indigo-400/40 px-6 py-3 text-sm font-semibold text-indigo-300 transition-colors hover:border-indigo-400 hover:text-indigo-200"
						>
							<Repeat size={18} />
							Repetir
						</button>
						<div class="relative">
							<button
								onclick={handleShare}
								class="flex items-center gap-2 rounded-full border border-gray-400/40 px-6 py-3 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-400 hover:text-gray-200"
							>
								<Share2 size={18} />
								Compartir
							</button>
							{#if showShareMenu}
								<div class="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
									✓ Enlace copiado
								</div>
							{/if}
						</div>
					</div>
					{#if downloadError}
						<p class="mt-2 text-sm text-red-400">{downloadError}</p>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Tracks -->
		<div class="space-y-4">
			<h2 class="text-2xl font-bold" style={spotifyFont}>Canciones</h2>
			<TrackList {tracks} showAlbum={false} />
			{#if tracks.length === 0}
				<div class="rounded-lg border border-yellow-900 bg-yellow-900/20 p-6 text-yellow-300">
					<p>
						No se encontraron canciones para este álbum. Intenta actualizar o buscar canciones individuales.
					</p>
				</div>
			{/if}
			{#if album.copyright}
				<p class="pt-2 text-xs text-gray-500">{album.copyright}</p>
			{/if}
		</div>

		<!-- Related Albums Section -->
		{#if relatedAlbums.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎵 Álbumes Relacionados
					</h2>
					<p class="text-sm text-gray-400 mt-1">Más música de {album.artist?.name || 'este artista'}</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each relatedAlbums as relatedAlbum}
						<div class="group relative text-left">
							<a
								href={`/album/${relatedAlbum.id}`}
								class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if relatedAlbum.videoCover}
										<video
											src={losslessAPI.getVideoCoverUrl(relatedAlbum.videoCover, '640')}
											poster={relatedAlbum.cover ? losslessAPI.getCoverUrl(relatedAlbum.cover, '640') : undefined}
											aria-label={relatedAlbum.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											autoplay
											loop
											muted
											playsinline
											preload="metadata"
										></video>
									{:else if relatedAlbum.cover}
										<img
											src={losslessAPI.getCoverUrl(relatedAlbum.cover, '640')}
											alt={relatedAlbum.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">
											No artwork
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">
									{relatedAlbum.title}
								</h3>
								<p class="truncate text-sm text-gray-400">
									{relatedAlbum.artist?.name || relatedAlbum.artists?.[0]?.name || 'Unknown Artist'}
								</p>
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Playlists Section -->
		{#if relatedPlaylists.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						📻 Playlists Relacionadas
					</h2>
					<p class="text-sm text-gray-400 mt-1">Playlists que incluyen música similar</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each relatedPlaylists as playlist}
						<div class="group relative text-left">
							<a
								href={`/playlist/${playlist.uuid}`}
								class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if playlist.squareImage || playlist.image}
										<img
											src={losslessAPI.getCoverUrl(playlist.squareImage || playlist.image, '640')}
											alt={playlist.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Artist Radio Section -->
		{#if artistRadios.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎧 Radio del Artista
					</h2>
					<p class="text-sm text-gray-400 mt-1">Descubre música similar y relacionada</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each artistRadios as radio}
						<div class="group relative text-left">
							<a
								href={`/album/${radio.id}`}
								class="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if radio.videoCover}
										<video
											src={losslessAPI.getVideoCoverUrl(radio.videoCover, '640')}
											poster={radio.cover ? losslessAPI.getCoverUrl(radio.cover, '640') : undefined}
											aria-label={radio.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											autoplay
											loop
											muted
											playsinline
											preload="metadata"
										></video>
									{:else if radio.cover}
										<img
											src={losslessAPI.getCoverUrl(radio.cover, '640')}
											alt={radio.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
									{radio.artist?.name || radio.artists?.[0]?.name || 'Unknown Artist'}
								</p>
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
