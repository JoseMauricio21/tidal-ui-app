<script lang="ts">
	import SearchInterface from '$lib/components/SearchInterface.svelte';
	import type { Track } from '$lib/types';
	import { playerStore } from '$lib/stores/player';

	function handleTrackSelect(track: Track) {
		playerStore.setQueue([track], 0);
		playerStore.play();
	}
</script>

<div class="search-page">
	<SearchInterface onTrackSelect={handleTrackSelect} />
</div>

<style>
	.search-page { padding-top: 0.5rem; }
</style>
