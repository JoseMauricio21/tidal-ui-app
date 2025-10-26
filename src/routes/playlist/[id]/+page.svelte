<script lang="ts">
	import { page } from '$app/stores';
	import { losslessAPI } from '$lib/api';
	import TrackList from '$lib/components/TrackList.svelte';
	import type { Playlist, Track, Album } from '$lib/types';
	import { onMount } from 'svelte';
	import { ArrowLeft, Play, User, Clock, Shuffle } from 'lucide-svelte';
	import Loader from '$lib/components/Loader.svelte';
	import { playerStore } from '$lib/stores/player';

	const spotifyFont = "font-family: 'Circular Std', 'Circular Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.02em;";

	let playlist = $state<Playlist | null>(null);
	let tracks = $state<Track[]>([]);
	let relatedPlaylists = $state<Playlist[]>([]);
	let relatedAlbums = $state<Album[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	const playlistId = $derived($page.params.id);

	onMount(async () => {
		if (playlistId) {
			await loadPlaylist(playlistId);
		}
	});

	// Watch for URL changes and reload playlist
	$effect(() => {
		if (playlistId) {
			loadPlaylist(playlistId);
		}
	});

	async function loadPlaylist(id: string) {
		try {
			isLoading = true;
			error = null;
			const data = await losslessAPI.getPlaylist(id);
			playlist = data.playlist;
			tracks = data.items.map((item) => item.item);

			// Load related content
			if (playlist.title) {
				const [playlistsRes, albumsRes] = await Promise.all([
					losslessAPI.searchPlaylists(`${playlist.title.split(' ')[0]} playlist`, 'auto').catch(() => ({ items: [] })),
					losslessAPI.searchAlbums(playlist.title.split(' ').slice(0, 2).join(' '), 'auto').catch(() => ({ items: [] }))
				]);

				relatedPlaylists = (playlistsRes.items || []).filter(p => p.uuid !== playlist.uuid).slice(0, 10);
				relatedAlbums = (albumsRes.items || []).slice(0, 10);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load playlist';
			console.error('Failed to load playlist:', err);
		} finally {
			isLoading = false;
		}
	}

	function handlePlayAll() {
		if (tracks.length > 0) {
			playerStore.setQueue(tracks, 0);
			playerStore.play();
		}
	}

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

	function formatDuration(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (hours > 0) {
			return `${hours} hr ${minutes} min`;
		}
		return `${minutes} min`;
	}
</script>

<svelte:head>
	<title>{playlist?.title || 'Playlist'} - TIDAL UI</title>
</svelte:head>

{#if isLoading}
	<div class="flex items-center justify-center py-24">
		<Loader size={64} />
	</div>
{:else if error}
	<div class="mx-auto max-w-2xl py-12">
		<div class="rounded-lg border border-red-900 bg-red-900/20 p-6">
			<h2 class="mb-2 text-xl font-semibold text-red-400">Error Loading Playlist</h2>
			<p class="text-red-300">{error}</p>
			<a
				href="/"
				class="mt-4 inline-flex rounded-lg bg-red-600 px-4 py-2 transition-colors hover:bg-red-700"
			>
				Go Home
			</a>
		</div>
	</div>
{:else if playlist}
	<div class="space-y-10 pb-60 lg:pb-40">
		<!-- Back Button -->
		<button
			onclick={() => window.history.back()}
			class="mt-4 flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
		>
			<ArrowLeft size={20} />
			Volver
		</button>

		<!-- Playlist Header -->
		<div class="flex flex-col gap-8 md:flex-row">
			<!-- Playlist Cover -->
			{#if playlist.squareImage || playlist.image}
				<div
					class="aspect-square w-full flex-shrink-0 overflow-hidden rounded-lg shadow-2xl md:w-80"
				>
					<img
						src={(playlist.squareImage || playlist.image).startsWith('http') 
							? (playlist.squareImage || playlist.image) 
							: losslessAPI.getCoverUrl(playlist.squareImage || playlist.image, '640')}
						alt={playlist.title}
						class="h-full w-full object-cover"
					/>
				</div>
			{:else}
				<div
					class="aspect-square w-full flex-shrink-0 overflow-hidden rounded-lg shadow-2xl md:w-80 bg-gray-800 flex items-center justify-center"
				>
					<svg class="w-24 h-24 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
						<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
					</svg>
				</div>
			{/if}

			<!-- Playlist Info -->
			<div class="flex flex-1 flex-col justify-end">
				<p class="mb-2 text-sm text-gray-400">PLAYLIST</p>
				<h1 class="mb-4 text-4xl font-bold md:text-6xl">{playlist.title}</h1>

				{#if playlist.description}
					<p class="mb-4 text-gray-300">{playlist.description}</p>
				{/if}

				<div class="mb-4 flex items-center gap-2">
					{#if playlist.creator.picture}
						<img
							src={playlist.creator.picture.startsWith('http') 
								? playlist.creator.picture 
								: losslessAPI.getCoverUrl(playlist.creator.picture, '80')}
							alt={playlist.creator.name}
							class="h-8 w-8 rounded-full"
						/>
					{:else}
						<div class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700">
							<User size={16} class="text-gray-400" />
						</div>
					{/if}
					<span class="text-sm text-gray-300">{playlist.creator.name}</span>
				</div>

				<div class="mb-6 flex flex-wrap items-center gap-4 text-sm text-gray-400">
					<div>{playlist.numberOfTracks} tracks</div>
					{#if playlist.duration}
						<div class="flex items-center gap-1">
							<Clock size={16} />
							{formatDuration(playlist.duration)}
						</div>
					{/if}
					{#if playlist.type}
						<div class="rounded bg-purple-900/30 px-2 py-1 text-xs font-semibold text-purple-400">
							{playlist.type}
						</div>
					{/if}
				</div>

				{#if tracks.length > 0}
					<div class="flex items-center gap-4">
						<button
							onclick={handlePlayAll}
							class="flex w-fit items-center gap-2 rounded-full bg-blue-600 px-8 py-3 font-semibold transition-colors hover:bg-blue-700"
						>
							<Play size={20} fill="currentColor" />
							Reproducir Todo
						</button>
						<button
							onclick={handleShufflePlay}
							class="flex w-fit items-center gap-2 rounded-full bg-purple-600 px-8 py-3 font-semibold transition-colors hover:bg-purple-700"
						>
							<Shuffle size={20} />
							Aleatorio
						</button>
					</div>
				{/if}
			</div>
		</div>

		<!-- Promoted Artists -->
		{#if playlist.promotedArtists && playlist.promotedArtists.length > 0}
			<div>
				<h3 class="mb-3 text-sm font-semibold text-gray-400">Featured Artists</h3>
				<div class="flex flex-wrap gap-2">
					{#each playlist.promotedArtists as artist}
						<a
							href={`/artist/${artist.id}`}
							data-sveltekit-preload-data
							class="rounded-full bg-gray-800 px-3 py-1.5 text-sm transition-colors hover:bg-gray-700"
						>
							{artist.name}
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Tracks -->
		{#if tracks.length > 0}
			<div class="mt-8">
				<h2 class="mb-4 text-2xl font-bold" style={spotifyFont}>Canciones</h2>
				<TrackList {tracks} />
			</div>
		{:else}
			<div class="rounded-lg bg-gray-800 p-6 text-gray-400">
				<p>No hay canciones en esta playlist.</p>
			</div>
		{/if}

		<!-- Related Playlists -->
		{#if relatedPlaylists.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						📻 Playlists Similares
					</h2>
					<p class="text-sm text-gray-400 mt-1">Descubre más playlists que te pueden gustar</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each relatedPlaylists as relatedPlaylist}
						<a
							href={`/playlist/${relatedPlaylist.uuid}`}
							class="group flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
							data-sveltekit-preload-data
						>
							<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
								{#if relatedPlaylist.squareImage || relatedPlaylist.image}
									<img
										src={(relatedPlaylist.squareImage || relatedPlaylist.image).startsWith('http') 
											? (relatedPlaylist.squareImage || relatedPlaylist.image) 
											: losslessAPI.getCoverUrl(relatedPlaylist.squareImage || relatedPlaylist.image, '640')}
										alt={relatedPlaylist.title}
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
								{relatedPlaylist.title}
							</h3>
							<p class="truncate text-sm text-gray-400">
								{relatedPlaylist.numberOfTracks || 0} canciones
							</p>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Related Albums -->
		{#if relatedAlbums.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎵 Álbumes Relacionados
					</h2>
					<p class="text-sm text-gray-400 mt-1">Álbumes que combinan con esta playlist</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each relatedAlbums as relatedAlbum}
						<a
							href={`/album/${relatedAlbum.id}`}
							class="group flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
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
					{/each}
				</div>
			</div>
		{/if}

		<!-- Metadata -->
		<div class="space-y-1 text-xs text-gray-500">
			{#if playlist.created}
				<p>Created: {new Date(playlist.created).toLocaleDateString()}</p>
			{/if}
			{#if playlist.lastUpdated}
				<p>Last updated: {new Date(playlist.lastUpdated).toLocaleDateString()}</p>
			{/if}
		</div>
	</div>
{/if}
