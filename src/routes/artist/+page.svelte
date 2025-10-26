<script lang="ts">
	import { onMount } from 'svelte';
	import { losslessAPI } from '$lib/api';
	import { recentArtistsStore } from '$lib/stores/albumHistory';
	import type { Artist } from '$lib/types';

	let recentArtists = $state<Artist[]>([]);
	let legendaryArtists = $state<Artist[]>([]);
	let artistsRock = $state<Artist[]>([]);
	let artistsJazz = $state<Artist[]>([]);
	let artistsElectronica = $state<Artist[]>([]);
	let artistsHipHop = $state<Artist[]>([]);
	let artistsLatin = $state<Artist[]>([]);
	let artistsPop = $state<Artist[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	const spotifyFont = "font-family: 'Circular Std', 'Circular Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.02em;";

	onMount(async () => {
		// Load recently played artists from history
		const unsubscribe = recentArtistsStore.subscribe((artists) => {
			recentArtists = artists.slice(0, 15);
		});

		// Top legendary artists search queries
		const legendaryArtistSearches = [
			'The Beatles',
			'Michael Jackson',
			'Queen',
			'Led Zeppelin',
			'Pink Floyd',
			'David Bowie',
			'The Rolling Stones',
			'Bob Marley',
			'Nirvana',
			'Jimi Hendrix'
		];

		try {
			// Load artists by genre in parallel
			const [rockRes, jazzRes, electronicaRes, hiphopRes, latinRes, popRes, ...legendaryResults] = await Promise.all([
				losslessAPI.searchArtists('rock', 'auto'),
				losslessAPI.searchArtists('jazz', 'auto'),
				losslessAPI.searchArtists('electronic', 'auto'),
				losslessAPI.searchArtists('hip hop', 'auto'),
				losslessAPI.searchArtists('latin', 'auto'),
				losslessAPI.searchArtists('pop', 'auto'),
				...legendaryArtistSearches.map(query => losslessAPI.searchArtists(query, 'auto'))
			]);

			artistsRock = Array.isArray(rockRes?.items) ? rockRes.items.slice(0, 10) : [];
			artistsJazz = Array.isArray(jazzRes?.items) ? jazzRes.items.slice(0, 10) : [];
			artistsElectronica = Array.isArray(electronicaRes?.items) ? electronicaRes.items.slice(0, 10) : [];
			artistsHipHop = Array.isArray(hiphopRes?.items) ? hiphopRes.items.slice(0, 10) : [];
			artistsLatin = Array.isArray(latinRes?.items) ? latinRes.items.slice(0, 10) : [];
			artistsPop = Array.isArray(popRes?.items) ? popRes.items.slice(0, 10) : [];
			legendaryArtists = legendaryResults.map(res => res?.items?.[0]).filter(Boolean) as Artist[];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load artists';
			console.error('Error loading artists:', err);
		} finally {
			isLoading = false;
		}

		return () => {
			unsubscribe();
		};
	});

	function renderArtistGrid(artistList: Artist[]) {
		return artistList.length > 0;
	}
</script>

<svelte:head>
	<title>Artistas - Tidal UI</title>
	<meta name="description" content="Descubre artistas legendarios y tus artistas favoritos" />
</svelte:head>

<div class="space-y-6">
	<!-- Hero Section -->
	<div class="py-6">
		<h1 class="text-4xl sm:text-5xl font-black text-white mb-4 mt-6" style={spotifyFont}>
			🎤 Mis Artistas
		</h1>
		<p class="text-lg sm:text-xl text-gray-300">Explora artistas legendarios y descubre nuevos talentos</p>
	</div>

	<div class="space-y-6">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<div class="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-500"></div>
			</div>
		{:else if error}
			<div class="rounded-lg border border-red-900 bg-red-900/20 p-4 text-red-400">{error}</div>
		{:else}
			<!-- Recently Played Artists Section -->
			{#if renderArtistGrid(recentArtists)}
				<div class="w-full">
					<div class="mb-6">
						<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
							🎧 Tus Artistas Recién Reproducidos
						</h2>
						<p class="text-sm text-gray-400 mt-1">Artistas de tus álbumes recientes</p>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{#each recentArtists as artist}
							<a href={`/artist/${artist.id}`} class="group text-center" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-full">
									{#if artist.picture}
										<img src={losslessAPI.getArtistPictureUrl(artist.picture)} alt={artist.name} class="h-full w-full object-cover transition-transform group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800">
											<svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
												<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
											</svg>
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{artist.name}</h3>
								<p class="text-xs text-gray-500">Artista</p>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Top 10 Legendary Artists Section -->
			{#if renderArtistGrid(legendaryArtists)}
				<div class="w-full">
					<div class="mb-6">
						<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
							🏆 Top 10 Artistas Legendarios
						</h2>
						<p class="text-sm text-gray-400 mt-1">Los mejores artistas de todos los tiempos</p>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{#each legendaryArtists as artist}
							<a href={`/artist/${artist.id}`} class="group text-center" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-full">
									{#if artist.picture}
										<img src={losslessAPI.getArtistPictureUrl(artist.picture)} alt={artist.name} class="h-full w-full object-cover transition-transform group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800">
											<svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
												<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
											</svg>
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{artist.name}</h3>
								<p class="text-xs text-gray-500">Artista</p>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Section 1: Rock Artists -->
			{#if renderArtistGrid(artistsRock)}
				<div class="w-full">
					<div class="mb-6">
						<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
							🎸 Rock
						</h2>
						<p class="text-sm text-gray-400 mt-1">Los mejores artistas de rock</p>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{#each artistsRock as artist}
							<a
								href={`/artist/${artist.id}`}
								class="group text-center transition-transform hover:scale-105"
								data-sveltekit-preload-data
							>
								<div class="relative mb-3 aspect-square overflow-hidden rounded-full ring-2 ring-red-500/20 group-hover:ring-red-500/50 transition-all">
									{#if artist.picture}
										<img
											src={losslessAPI.getArtistPictureUrl(artist.picture)}
											alt={artist.name}
											class="h-full w-full object-cover transition-transform group-hover:scale-110"
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-red-900 to-red-800">
											<svg class="w-12 h-12 text-red-300" fill="currentColor" viewBox="0 0 24 24">
												<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
											</svg>
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-red-400 transition-colors">
									{artist.name}
								</h3>
								<p class="text-xs text-gray-500">Artista</p>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Jazz Artists Section -->
			{#if renderArtistGrid(artistsJazz)}
				<div class="w-full">
					<div class="mb-6">
						<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
							🎷 Jazz
						</h2>
						<p class="text-sm text-gray-400 mt-1">Maestros del jazz</p>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{#each artistsJazz as artist}
							<a href={`/artist/${artist.id}`} class="group text-center" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-full">
									{#if artist.picture}
										<img src={losslessAPI.getArtistPictureUrl(artist.picture)} alt={artist.name} class="h-full w-full object-cover transition-transform group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800">
											<svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
												<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
											</svg>
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{artist.name}</h3>
								<p class="text-xs text-gray-500">Artista</p>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Section 2: Electronica Artists -->
			{#if renderArtistGrid(artistsElectronica)}
				<div class="w-full">
					<div class="mb-6">
						<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
							⚡ Electrónica
						</h2>
						<p class="text-sm text-gray-400 mt-1">Los mejores artistas de electrónica</p>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{#each artistsElectronica as artist}
							<a
								href={`/artist/${artist.id}`}
								class="group text-center transition-transform hover:scale-105"
								data-sveltekit-preload-data
							>
								<div class="relative mb-3 aspect-square overflow-hidden rounded-full ring-2 ring-cyan-500/20 group-hover:ring-cyan-500/50 transition-all">
									{#if artist.picture}
										<img
											src={losslessAPI.getArtistPictureUrl(artist.picture)}
											alt={artist.name}
											class="h-full w-full object-cover transition-transform group-hover:scale-110"
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-900 to-blue-900">
											<svg class="w-12 h-12 text-cyan-300" fill="currentColor" viewBox="0 0 24 24">
												<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
											</svg>
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-cyan-400 transition-colors">
									{artist.name}
								</h3>
								<p class="text-xs text-gray-500">Artista</p>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Hip Hop Artists Section -->
			{#if renderArtistGrid(artistsHipHop)}
				<div class="w-full">
					<div class="mb-6">
						<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
							🎤 Hip Hop & Rap
						</h2>
						<p class="text-sm text-gray-400 mt-1">Lo mejor del hip hop</p>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{#each artistsHipHop as artist}
							<a href={`/artist/${artist.id}`} class="group text-center" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-full">
									{#if artist.picture}
										<img src={losslessAPI.getArtistPictureUrl(artist.picture)} alt={artist.name} class="h-full w-full object-cover transition-transform group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800">
											<svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
												<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
											</svg>
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{artist.name}</h3>
								<p class="text-xs text-gray-500">Artista</p>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Latin Artists Section -->
			{#if renderArtistGrid(artistsLatin)}
				<div class="w-full">
					<div class="mb-6">
						<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
							🌎 Música Latina
						</h2>
						<p class="text-sm text-gray-400 mt-1">Artistas latinos destacados</p>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{#each artistsLatin as artist}
							<a href={`/artist/${artist.id}`} class="group text-center" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-full">
									{#if artist.picture}
										<img src={losslessAPI.getArtistPictureUrl(artist.picture)} alt={artist.name} class="h-full w-full object-cover transition-transform group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800">
											<svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
												<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
											</svg>
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{artist.name}</h3>
								<p class="text-xs text-gray-500">Artista</p>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Pop Artists Section -->
			{#if renderArtistGrid(artistsPop)}
				<div class="w-full">
					<div class="mb-6">
						<h2 class="text-2xl font-bold text-white" style={spotifyFont}>
							🎵 Pop
						</h2>
						<p class="text-sm text-gray-400 mt-1">Los mejores artistas de pop</p>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{#each artistsPop as artist}
							<a href={`/artist/${artist.id}`} class="group text-center" data-sveltekit-preload-data>
								<div class="relative mb-2 aspect-square overflow-hidden rounded-full">
									{#if artist.picture}
										<img src={losslessAPI.getArtistPictureUrl(artist.picture)} alt={artist.name} class="h-full w-full object-cover transition-transform group-hover:scale-105" />
									{:else}
										<div class="flex h-full w-full items-center justify-center bg-gray-800">
											<svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
												<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
											</svg>
										</div>
									{/if}
								</div>
								<h3 class="truncate font-semibold text-white group-hover:text-blue-400">{artist.name}</h3>
								<p class="text-xs text-gray-500">Artista</p>
							</a>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
