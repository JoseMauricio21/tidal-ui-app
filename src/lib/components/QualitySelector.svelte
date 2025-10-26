<script lang="ts">
	import type { AudioQuality } from '$lib/types';
	import { playerStore } from '$lib/stores/player';
	import { Settings, Check } from 'lucide-svelte';
	import { deriveTrackQuality, normalizeQualityToken } from '$lib/utils/audioQuality';

	let isOpen = $state(false);

	const qualities: { value: AudioQuality; label: string; description: string }[] = [
		{ value: 'LOSSLESS', label: 'CD Lossless', description: '16-bit/44.1 kHz FLAC (Recomendado)' },
		{ value: 'HIGH', label: 'High', description: '320k AAC' },
		{ value: 'LOW', label: 'Low', description: '96k AAC' },
		{
			value: 'HI_RES_LOSSLESS',
			label: 'Hi-Res',
			description: '24-bit FLAC up to 192 kHz (Experimental)'
		},
		{
			value: 'DOLBY_ATMOS',
			label: 'Dolby Atmos',
			description: 'Immersive spatial audio (Experimental)'
		},
		{
			value: 'SONY_360RA',
			label: 'Sony 360 Reality Audio',
			description: '360-degree spatial sound (Experimental)'
		}
	];

	function isQualityDisabled(quality: AudioQuality): boolean {
		const currentTrack = $playerStore.currentTrack;
		if (!currentTrack) return false;

		// Check if track has audioModes array (for Dolby Atmos and Sony 360RA)
		const audioModes = currentTrack.audioModes || [];
		
		if (quality === 'DOLBY_ATMOS') {
			return !audioModes.some(mode => 
				mode.toUpperCase().includes('ATMOS') || mode.toUpperCase().includes('DOLBY')
			);
		}

		if (quality === 'SONY_360RA') {
			return !audioModes.some(mode => 
				mode.toUpperCase().includes('360') || mode.toUpperCase().includes('SONY')
			);
		}

		// For Hi-Res, use the utility function
		if (quality === 'HI_RES_LOSSLESS') {
			const derivedQuality = deriveTrackQuality(currentTrack);
			return derivedQuality !== 'HI_RES_LOSSLESS';
		}

		// Other qualities are always available
		return false;
	}

	function selectQuality(quality: AudioQuality) {
		if (isQualityDisabled(quality)) {
			console.warn(`Quality ${quality} is not available for the current track`);
			return;
		}
		
		try {
			playerStore.setQuality(quality);
			isOpen = false;
			console.log(`Audio quality changed to: ${quality}`);
		} catch (error) {
			console.error('Failed to set audio quality:', error);
		}
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function handleClickOutside(event: MouseEvent) {
		if (isOpen && !(event.target as Element).closest('.quality-selector')) {
			isOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="quality-selector relative">
	<button
		onclick={toggleDropdown}
		class="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-white transition-colors hover:bg-gray-700"
		aria-label="Select audio quality"
	>
		<Settings size={18} />
		<span class="text-sm">
			{qualities.find((q) => q.value === $playerStore.quality)?.label || 'Quality'}
		</span>
		{#if $playerStore.quality === 'HI_RES_LOSSLESS'}
			<span class="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-medium">
				Hi-Res
			</span>
		{:else if $playerStore.quality === 'DOLBY_ATMOS'}
			<span class="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded-full font-medium">
				Atmos
			</span>
		{:else if $playerStore.quality === 'SONY_360RA'}
			<span class="text-xs bg-orange-600 text-white px-1.5 py-0.5 rounded-full font-medium">
				360RA
			</span>
		{/if}
	</button>

	{#if isOpen}
		<div
			class="absolute right-0 z-50 bottom-full mb-2 w-64 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-lg"
		>
			<div class="border-b border-gray-700 p-2">
				<h3 class="text-sm font-semibold text-white">Audio Quality</h3>
				<p class="text-xs text-yellow-400 mt-1">⚡ CD Lossless recommended for best performance</p>
			</div>
			<div class="py-1">
				{#each qualities as quality}
					<button
						onclick={() => selectQuality(quality.value)}
						class="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:text-gray-500 disabled:opacity-60 disabled:hover:bg-gray-800"
						disabled={isQualityDisabled(quality.value)}
						aria-disabled={isQualityDisabled(quality.value)}
						title={isQualityDisabled(quality.value) ? 'Not available in this build' : undefined}
					>
						<div class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
							{#if $playerStore.quality === quality.value}
								<Check size={18} class="text-blue-500" />
							{/if}
						</div>
						<div class="flex-1">
							<div class="text-sm font-medium text-white">{quality.label}</div>
							<div
								class={`text-xs ${isQualityDisabled(quality.value) ? 'text-gray-500' : 'text-gray-400'}`}
							>
								{quality.description}
								{#if isQualityDisabled(quality.value)}
									{#if quality.value === 'HI_RES_LOSSLESS'}
										<span class="ml-1 text-[10px] tracking-wide text-gray-500 uppercase"
											>Not available for this track</span
										>
									{:else if quality.value === 'DOLBY_ATMOS' || quality.value === 'SONY_360RA'}
										<span class="ml-1 text-[10px] tracking-wide text-gray-500 uppercase"
											>Not available for this track</span
										>
									{:else}
										<span class="ml-1 text-[10px] tracking-wide text-gray-500 uppercase"
											>Unavailable</span
										>
									{/if}
								{/if}
							</div>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
