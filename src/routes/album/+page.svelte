<script lang="ts">
	import { onMount } from 'svelte';
	import { losslessAPI } from '$lib/api';
	import { downloadAlbum } from '$lib/downloads';
	import { playerStore } from '$lib/stores/player';
	import { userPreferencesStore } from '$lib/stores/userPreferences';
	import { downloadPreferencesStore } from '$lib/stores/downloadPreferences';
	import { albumHistoryStore } from '$lib/stores/albumHistory';
	import { Download } from 'lucide-svelte';
	import Loader from '$lib/components/Loader.svelte';
	import type { Album } from '$lib/types';

	let recentlyPlayedAlbums = $state<Album[]>([]);
	let topLegendaryAlbums = $state<Album[]>([]);
	let rockAlbums = $state<Album[]>([]);
	let jazzAlbums = $state<Album[]>([]);
	let electronicAlbums = $state<Album[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let albumDownloadStates = $state<Record<number, { downloading: boolean; completed: number; total: number; error: string | null }>>({});

	const spotifyFont = "font-family: 'Circular Std', 'Circular Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.02em;";

	onMount(async () => {
		const unsubscribe = albumHistoryStore.subscribe((history) => {
			recentlyPlayedAlbums = history.slice(0, 15).map((entry) => entry.album);
		});

		const legendaryAlbumSearches = [
			'Michael Jackson - Thriller',
			'The Beatles - Abbey Road',
			'Pink Floyd - The Dark Side of the Moon',
			'Nirvana - Nevermind',
			'Queen - A Night at the Opera',
			'Bob Marley & The Wailers - Legend',
			'Fleetwood Mac - Rumours',
			'The Rolling Stones - Exile on Main St.',
			'Prince - Purple Rain',
			'The Beatles - Sgt. Pepper\'s Lonely Hearts Club Band'
		];

		try {
			const [rockRes, jazzRes, electronicRes, ...legendaryResults] = await Promise.all([
				losslessAPI.searchAlbums('rock classic', 'auto'),
				losslessAPI.searchAlbums('jazz', 'auto'),
				losslessAPI.searchAlbums('electronic', 'auto'),
				...legendaryAlbumSearches.map(query => losslessAPI.searchAlbums(query, 'auto'))
			]);

			rockAlbums = Array.isArray(rockRes?.items) ? rockRes.items.slice(0, 10) : [];
			jazzAlbums = Array.isArray(jazzRes?.items) ? jazzRes.items.slice(0, 10) : [];
			electronicAlbums = Array.isArray(electronicRes?.items) ? electronicRes.items.slice(0, 10) : [];
			topLegendaryAlbums = legendaryResults.map(res => res?.items?.[0]).filter(Boolean) as Album[];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load albums';
		} finally {
			isLoading = false;
		}

		return () => {
			unsubscribe();
		};
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

		if (albumDownloadStates[album.id]?.downloading) return;

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
			const message = err instanceof Error ? err.message : 'Failed to download album';
			patchAlbumDownloadState(album.id, { downloading: false, error: message });
		}
	}
</script>

<svelte:head>
	<title>Álbumes - Tidal UI</title>
</svelte:head>

<div class="space-y-6">
	<div class="py-6">
		<h1 class="text-4xl sm:text-5xl font-black text-white mb-4 mt-6" style={spotifyFont}>
			💿 Mis Álbumes
		</h1>
		<p class="text-lg sm:text-xl text-gray-300">Explora tu colección y descubre álbumes legendarios</p>
	</div>

	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<Loader size={64} />
		</div>
	{:else if error}
		<div class="rounded-lg border border-red-900 bg-red-900/20 p-4 text-red-400">{error}</div>
	{:else}
		{#if recentlyPlayedAlbums.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎧 Tus Álbumes Recién Reproducidos
					</h2>
					<p class="text-sm text-gray-400 mt-1">Continúa donde lo dejaste</p>
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
								class="flex w-full flex-col text-left"
								data-sveltekit-preload-data
							>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
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

		{#if topLegendaryAlbums.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🏆 Top 10 Álbumes Legendarios
					</h2>
					<p class="text-sm text-gray-400 mt-1">Los mejores álbumes de todos los tiempos</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each topLegendaryAlbums as album}
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
							<a href={`/album/${album.id}`} class="flex w-full flex-col text-left" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if album.cover}
										<img src={losslessAPI.getCoverUrl(album.cover, '640')} alt={album.title} class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">No artwork</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{album.title}</h3>
								{#if album.artist}
									<p class="truncate text-sm text-gray-400">{album.artist.name}</p>
								{/if}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if rockAlbums.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎸 Clásicos del Rock
					</h2>
					<p class="text-sm text-gray-400 mt-1">Los mejores álbumes de rock de la historia</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each rockAlbums as album}
						<div class="group relative text-left">
							<button onclick={(event) => handleAlbumDownloadClick(album, event)} type="button" class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={albumDownloadStates[album.id]?.downloading}>
								{#if albumDownloadStates[album.id]?.downloading}
									<Loader size={16} />
								{:else}
									<Download size={16} />
								{/if}
							</button>
							<a href={`/album/${album.id}`} class="flex w-full flex-col text-left" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if album.cover}
										<img src={losslessAPI.getCoverUrl(album.cover, '640')} alt={album.title} class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">No artwork</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{album.title}</h3>
								{#if album.artist}
									<p class="truncate text-sm text-gray-400">{album.artist.name}</p>
								{/if}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if jazzAlbums.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎷 Jazz Esencial
					</h2>
					<p class="text-sm text-gray-400 mt-1">Lo mejor del jazz clásico y contemporáneo</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each jazzAlbums as album}
						<div class="group relative text-left">
							<button onclick={(event) => handleAlbumDownloadClick(album, event)} type="button" class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={albumDownloadStates[album.id]?.downloading}>
								{#if albumDownloadStates[album.id]?.downloading}
									<Loader size={16} />
								{:else}
									<Download size={16} />
								{/if}
							</button>
							<a href={`/album/${album.id}`} class="flex w-full flex-col text-left" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if album.cover}
										<img src={losslessAPI.getCoverUrl(album.cover, '640')} alt={album.title} class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">No artwork</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{album.title}</h3>
								{#if album.artist}
									<p class="truncate text-sm text-gray-400">{album.artist.name}</p>
								{/if}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if electronicAlbums.length > 0}
			<div class="w-full">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
						🎹 Electrónica
					</h2>
					<p class="text-sm text-gray-400 mt-1">Los mejores álbumes de música electrónica</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each electronicAlbums as album}
						<div class="group relative text-left">
							<button onclick={(event) => handleAlbumDownloadClick(album, event)} type="button" class="absolute top-3 right-3 z-40 flex items-center justify-center rounded-full bg-black/50 p-2 text-gray-200 backdrop-blur-md transition-colors hover:bg-blue-600/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={albumDownloadStates[album.id]?.downloading}>
								{#if albumDownloadStates[album.id]?.downloading}
									<Loader size={16} />
								{:else}
									<Download size={16} />
								{/if}
							</button>
							<a href={`/album/${album.id}`} class="flex w-full flex-col text-left" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
									{#if album.cover}
										<img src={losslessAPI.getCoverUrl(album.cover, '640')} alt={album.title} class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800 text-sm text-gray-500">No artwork</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{album.title}</h3>
								{#if album.artist}
									<p class="truncate text-sm text-gray-400">{album.artist.name}</p>
								{/if}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
