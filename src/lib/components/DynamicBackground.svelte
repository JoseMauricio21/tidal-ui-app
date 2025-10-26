<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { browser } from '$app/environment';
	import { playerStore } from '$lib/stores/player';
	import { effectivePerformanceLevel, animationsEnabled } from '$lib/stores/performance';
	import { losslessAPI } from '$lib/api';
	import {
		extractPaletteFromImage,
		darken,
		lighten,
		rgbToCss,
		ensureTextContrast,
		type PaletteResult,
		type RGBColor
	} from '$lib/utils/colorPalette';

	type Theme = {
		primary: string;
		secondary: string;
		accent: string;
		surface: string;
		border: string;
		highlight: string;
		glow: string;
		tertiary: string;
		quaternary: string;
	};

	// Predefined color combinations + 100 random ones
	const COLOR_COMBINATIONS: Array<{ dominant: RGBColor; accent: RGBColor }> = [
		// User requested combinations
		{ dominant: { red: 18, green: 18, blue: 18 }, accent: { red: 230, green: 230, blue: 230 } }, // Negro con blanco suave
		{ dominant: { red: 13, green: 27, blue: 42 }, accent: { red: 135, green: 206, blue: 250 } }, // Azul marino - azul cielo
		{ dominant: { red: 101, green: 67, blue: 33 }, accent: { red: 255, green: 215, blue: 0 } }, // Marrón - amarillo
		
		// Additional creative combinations (97 more)
		{ dominant: { red: 75, green: 0, blue: 130 }, accent: { red: 255, green: 20, blue: 147 } }, // Púrpura - rosa
		{ dominant: { red: 25, green: 25, blue: 112 }, accent: { red: 255, green: 99, blue: 71 } }, // Azul medianoche - coral
		{ dominant: { red: 47, green: 79, blue: 79 }, accent: { red: 255, green: 218, blue: 185 } }, // Gris pizarra - durazno
		{ dominant: { red: 85, green: 107, blue: 47 }, accent: { red: 240, green: 230, blue: 140 } }, // Verde oliva - khaki
		{ dominant: { red: 139, green: 69, blue: 19 }, accent: { red: 255, green: 140, blue: 0 } }, // Marrón silla - naranja oscuro
		{ dominant: { red: 72, green: 61, blue: 139 }, accent: { red: 147, green: 112, blue: 219 } }, // Pizarra oscura - púrpura medio
		{ dominant: { red: 105, green: 105, blue: 105 }, accent: { red: 220, green: 20, blue: 60 } }, // Gris tenue - carmesí
		{ dominant: { red: 0, green: 100, blue: 0 }, accent: { red: 173, green: 255, blue: 47 } }, // Verde oscuro - verde amarillo
		{ dominant: { red: 25, green: 25, blue: 25 }, accent: { red: 0, green: 255, blue: 255 } }, // Negro - cian
		{ dominant: { red: 70, green: 130, blue: 180 }, accent: { red: 255, green: 248, blue: 220 } }, // Azul acero - blanco córneo
		{ dominant: { red: 128, green: 0, blue: 0 }, accent: { red: 255, green: 182, blue: 193 } }, // Granate - rosa claro
		{ dominant: { red: 0, green: 0, blue: 128 }, accent: { red: 173, green: 216, blue: 230 } }, // Azul navy - azul claro
		{ dominant: { red: 112, green: 128, blue: 144 }, accent: { red: 255, green: 250, blue: 205 } }, // Gris pizarra - limón
		{ dominant: { red: 46, green: 139, blue: 87 }, accent: { red: 144, green: 238, blue: 144 } }, // Verde mar - verde claro
		{ dominant: { red: 95, green: 158, blue: 160 }, accent: { red: 240, green: 128, blue: 128 } }, // Cadet azul - coral claro
		{ dominant: { red: 153, green: 50, blue: 204 }, accent: { red: 218, green: 112, blue: 214 } }, // Orquídea oscura - orquídea
		{ dominant: { red: 184, green: 134, blue: 11 }, accent: { red: 255, green: 255, blue: 224 } }, // Oro oscuro - amarillo claro
		{ dominant: { red: 165, green: 42, blue: 42 }, accent: { red: 250, green: 128, blue: 114 } }, // Marrón - salmón
		{ dominant: { red: 188, green: 143, blue: 143 }, accent: { red: 255, green: 228, blue: 225 } }, // Rosa marrón - rosa bruma
		{ dominant: { red: 47, green: 79, blue: 79 }, accent: { red: 32, green: 178, blue: 170 } }, // Gris pizarra - turquesa claro
		{ dominant: { red: 60, green: 179, blue: 113 }, accent: { red: 152, green: 251, blue: 152 } }, // Verde mar medio - verde pálido
		{ dominant: { red: 123, green: 104, blue: 238 }, accent: { red: 230, green: 230, blue: 250 } }, // Azul pizarra medio - lavanda
		{ dominant: { red: 34, green: 139, blue: 34 }, accent: { red: 127, green: 255, blue: 0 } }, // Verde bosque - verde lima
		{ dominant: { red: 210, green: 105, blue: 30 }, accent: { red: 255, green: 228, blue: 181 } }, // Chocolate - moccasín
		{ dominant: { red: 0, green: 128, blue: 128 }, accent: { red: 175, green: 238, blue: 238 } }, // Cerceta - turquesa pálido
		{ dominant: { red: 30, green: 144, blue: 255 }, accent: { red: 240, green: 248, blue: 255 } }, // Azul Dodger - azul Alice
		{ dominant: { red: 106, green: 90, blue: 205 }, accent: { red: 221, green: 160, blue: 221 } }, // Azul pizarra - ciruela
		{ dominant: { red: 218, green: 112, blue: 214 }, accent: { red: 255, green: 240, blue: 245 } }, // Orquídea - lavanda blush
		{ dominant: { red: 154, green: 205, blue: 50 }, accent: { red: 250, green: 250, blue: 210 } }, // Verde amarillo - amarillo claro
		{ dominant: { red: 205, green: 92, blue: 92 }, accent: { red: 255, green: 228, blue: 225 } }, // Rojo indio - rosa bruma
		{ dominant: { red: 32, green: 178, blue: 170 }, accent: { red: 224, green: 255, blue: 255 } }, // Turquesa claro - cian claro
		{ dominant: { red: 199, green: 21, blue: 133 }, accent: { red: 255, green: 192, blue: 203 } }, // Violeta medio - rosa
		{ dominant: { red: 176, green: 196, blue: 222 }, accent: { red: 255, green: 250, blue: 250 } }, // Azul acero claro - nieve
		{ dominant: { red: 255, green: 160, blue: 122 }, accent: { red: 255, green: 239, blue: 213 } }, // Salmón claro - papaya
		{ dominant: { red: 64, green: 224, blue: 208 }, accent: { red: 240, green: 255, blue: 255 } }, // Turquesa - azul azur
		{ dominant: { red: 238, green: 130, blue: 238 }, accent: { red: 255, green: 240, blue: 245 } }, // Violeta - lavanda blush
		{ dominant: { red: 102, green: 205, blue: 170 }, accent: { red: 245, green: 255, blue: 250 } }, // Aguamarina medio - menta crema
		{ dominant: { red: 244, green: 164, blue: 96 }, accent: { red: 255, green: 245, blue: 238 } }, // Naranja arena - concha marina
		{ dominant: { red: 219, green: 112, blue: 147 }, accent: { red: 255, green: 228, blue: 225 } }, // Rosa pálido - rosa bruma
		{ dominant: { red: 138, green: 43, blue: 226 }, accent: { red: 216, green: 191, blue: 216 } }, // Azul violeta - cardo
		{ dominant: { red: 178, green: 34, blue: 34 }, accent: { red: 250, green: 128, blue: 114 } }, // Rojo fuego - salmón
		{ dominant: { red: 30, green: 30, blue: 30 }, accent: { red: 255, green: 69, blue: 0 } }, // Negro carbón - rojo naranja
		{ dominant: { red: 65, green: 105, blue: 225 }, accent: { red: 230, green: 230, blue: 250 } }, // Azul real - lavanda
		{ dominant: { red: 50, green: 50, blue: 50 }, accent: { red: 255, green: 215, blue: 0 } }, // Gris oscuro - dorado
		{ dominant: { red: 72, green: 209, blue: 204 }, accent: { red: 245, green: 255, blue: 250 } }, // Turquesa medio - menta crema
		{ dominant: { red: 220, green: 20, blue: 60 }, accent: { red: 255, green: 182, blue: 193 } }, // Carmesí - rosa claro
		{ dominant: { red: 186, green: 85, blue: 211 }, accent: { red: 238, green: 130, blue: 238 } }, // Orquídea medio - violeta
		{ dominant: { red: 189, green: 183, blue: 107 }, accent: { red: 255, green: 255, blue: 224 } }, // Khaki oscuro - amarillo claro
		{ dominant: { red: 0, green: 139, blue: 139 }, accent: { red: 175, green: 238, blue: 238 } }, // Cian oscuro - turquesa pálido
		{ dominant: { red: 143, green: 188, blue: 143 }, accent: { red: 240, green: 255, blue: 240 } }, // Verde mar oscuro - rocío
		{ dominant: { red: 119, green: 136, blue: 153 }, accent: { red: 230, green: 230, blue: 250 } }, // Gris pizarra claro - lavanda
		{ dominant: { red: 0, green: 206, blue: 209 }, accent: { red: 224, green: 255, blue: 255 } }, // Cian oscuro - cian claro
		{ dominant: { red: 169, green: 169, blue: 169 }, accent: { red: 255, green: 255, blue: 255 } }, // Gris oscuro - blanco
		{ dominant: { red: 100, green: 149, blue: 237 }, accent: { red: 240, green: 248, blue: 255 } }, // Azul flor maíz - azul Alice
		{ dominant: { red: 135, green: 206, blue: 235 }, accent: { red: 255, green: 250, blue: 250 } }, // Azul cielo - nieve
		{ dominant: { red: 127, green: 255, blue: 212 }, accent: { red: 240, green: 255, blue: 255 } }, // Aguamarina - azul azur
		{ dominant: { red: 0, green: 191, blue: 255 }, accent: { red: 224, green: 255, blue: 255 } }, // Azul cielo profundo - cian claro
		{ dominant: { red: 148, green: 0, blue: 211 }, accent: { red: 238, green: 130, blue: 238 } }, // Violeta oscuro - violeta
		{ dominant: { red: 128, green: 128, blue: 0 }, accent: { red: 255, green: 255, blue: 0 } }, // Oliva - amarillo
		{ dominant: { red: 255, green: 127, blue: 80 }, accent: { red: 255, green: 250, blue: 240 } }, // Coral - blanco floral
		{ dominant: { red: 107, green: 142, blue: 35 }, accent: { red: 189, green: 183, blue: 107 } }, // Verde oliva - khaki oscuro
		{ dominant: { red: 160, green: 82, blue: 45 }, accent: { red: 222, green: 184, blue: 135 } }, // Sienna - marrón claro
		{ dominant: { red: 70, green: 70, blue: 70 }, accent: { red: 255, green: 0, blue: 255 } }, // Gris - magenta
		{ dominant: { red: 41, green: 41, blue: 41 }, accent: { red: 0, green: 255, blue: 127 } }, // Negro - verde primavera
		{ dominant: { red: 51, green: 51, blue: 51 }, accent: { red: 255, green: 105, blue: 180 } }, // Carbón - rosa intenso
		{ dominant: { red: 139, green: 0, blue: 0 }, accent: { red: 255, green: 160, blue: 122 } }, // Rojo oscuro - salmón claro
		{ dominant: { red: 85, green: 26, blue: 139 }, accent: { red: 218, green: 112, blue: 214 } }, // Púrpura oscuro - orquídea
		{ dominant: { red: 0, green: 0, blue: 139 }, accent: { red: 135, green: 206, blue: 250 } }, // Azul oscuro - azul cielo
		{ dominant: { red: 0, green: 139, blue: 69 }, accent: { red: 144, green: 238, blue: 144 } }, // Verde mar oscuro - verde claro
		{ dominant: { red: 105, green: 105, blue: 105 }, accent: { red: 255, green: 165, blue: 0 } }, // Gris tenue - naranja
		{ dominant: { red: 255, green: 20, blue: 147 }, accent: { red: 255, green: 192, blue: 203 } }, // Rosa profundo - rosa
		{ dominant: { red: 255, green: 140, blue: 0 }, accent: { red: 255, green: 228, blue: 181 } }, // Naranja oscuro - moccasín
		{ dominant: { red: 75, green: 0, blue: 130 }, accent: { red: 186, green: 85, blue: 211 } }, // Índigo - orquídea medio
		{ dominant: { red: 233, green: 150, blue: 122 }, accent: { red: 255, green: 239, blue: 213 } }, // Salmón oscuro - papaya
		{ dominant: { red: 143, green: 188, blue: 143 }, accent: { red: 245, green: 255, blue: 250 } }, // Verde mar oscuro - menta crema
		{ dominant: { red: 72, green: 61, blue: 139 }, accent: { red: 176, green: 196, blue: 222 } }, // Pizarra oscura - azul acero claro
		{ dominant: { red: 47, green: 79, blue: 79 }, accent: { red: 95, green: 158, blue: 160 } }, // Gris pizarra oscuro - cadet azul
		{ dominant: { red: 60, green: 20, blue: 20 }, accent: { red: 205, green: 92, blue: 92 } }, // Marrón oscuro - rojo indio
		{ dominant: { red: 25, green: 25, blue: 112 }, accent: { red: 106, green: 90, blue: 205 } }, // Azul medianoche - azul pizarra
		{ dominant: { red: 139, green: 69, blue: 19 }, accent: { red: 210, green: 105, blue: 30 } }, // Marrón silla - chocolate
		{ dominant: { red: 255, green: 99, blue: 71 }, accent: { red: 255, green: 160, blue: 122 } }, // Tomate - salmón claro
		{ dominant: { red: 20, green: 20, blue: 20 }, accent: { red: 192, green: 192, blue: 192 } }, // Negro - plata
		{ dominant: { red: 0, green: 128, blue: 0 }, accent: { red: 50, green: 205, blue: 50 } }, // Verde - verde lima
		{ dominant: { red: 128, green: 0, blue: 128 }, accent: { red: 221, green: 160, blue: 221 } }, // Púrpura - ciruela
		{ dominant: { red: 0, green: 0, blue: 205 }, accent: { red: 100, green: 149, blue: 237 } }, // Azul medio - azul flor maíz
		{ dominant: { red: 255, green: 215, blue: 0 }, accent: { red: 255, green: 255, blue: 224 } }, // Dorado - amarillo claro
		{ dominant: { red: 34, green: 139, blue: 34 }, accent: { red: 124, green: 252, blue: 0 } }, // Verde bosque - verde césped
		{ dominant: { red: 240, green: 128, blue: 128 }, accent: { red: 255, green: 228, blue: 225 } }, // Coral claro - rosa bruma
		{ dominant: { red: 210, green: 180, blue: 140 }, accent: { red: 255, green: 248, blue: 220 } }, // Bronceado - blanco córneo
		{ dominant: { red: 205, green: 133, blue: 63 }, accent: { red: 244, green: 164, blue: 96 } }, // Perú - naranja arena
		{ dominant: { red: 255, green: 69, blue: 0 }, accent: { red: 255, green: 160, blue: 122 } }, // Rojo naranja - salmón claro
		{ dominant: { red: 138, green: 43, blue: 226 }, accent: { red: 147, green: 112, blue: 219 } }, // Azul violeta - púrpura medio
		{ dominant: { red: 165, green: 42, blue: 42 }, accent: { red: 205, green: 92, blue: 92 } }, // Marrón - rojo indio
		{ dominant: { red: 15, green: 82, blue: 186 }, accent: { red: 65, green: 105, blue: 225 } }, // Azul internacional - azul real
		{ dominant: { red: 112, green: 66, blue: 20 }, accent: { red: 160, green: 82, blue: 45 } }, // Marrón cuero - sienna
		{ dominant: { red: 0, green: 51, blue: 102 }, accent: { red: 70, green: 130, blue: 180 } }, // Azul Oxford - azul acero
		{ dominant: { red: 102, green: 0, blue: 51 }, accent: { red: 219, green: 112, blue: 147 } }, // Burdeos - rosa pálido
		{ dominant: { red: 51, green: 0, blue: 25 }, accent: { red: 128, green: 0, blue: 0 } }, // Marrón oscuro - granate
		{ dominant: { red: 255, green: 250, blue: 250 }, accent: { red: 255, green: 228, blue: 225 } }, // Nieve - rosa bruma
		{ dominant: { red: 0, green: 77, blue: 64 }, accent: { red: 0, green: 128, blue: 128 } }, // Verde pino - cerceta
		{ dominant: { red: 77, green: 0, blue: 77 }, accent: { red: 148, green: 0, blue: 211 } }, // Púrpura imperial - violeta oscuro
		{ dominant: { red: 102, green: 51, blue: 0 }, accent: { red: 139, green: 69, blue: 19 } } // Marrón chocolate - marrón silla
	];

	// Generate random colors with reduced green intensity
	const generateRandomColor = (): RGBColor => {
		return {
			red: Math.floor(Math.random() * 256),
			green: Math.floor(Math.random() * 128), // Reduced green: 0-127 instead of 0-255
			blue: Math.floor(Math.random() * 256)
		};
	};

	const generateRandomTheme = (): Theme => {
		// Pick a random combination from the predefined palette
		const combination = COLOR_COMBINATIONS[Math.floor(Math.random() * COLOR_COMBINATIONS.length)];
		const dominant = combination.dominant;
		const accent = combination.accent;
		const secondary = lighten(dominant, 0.08);
		const glow = lighten(accent, 0.2);
		const tertiary = darken(accent, 0.15);
		const quaternary = lighten(dominant, 0.12);

		return {
			primary: rgbToCss(darken(dominant, 0.25)),
			secondary: rgbToCss(lighten(secondary, 0.12)),
			accent: rgbToCss(lighten(accent, 0.08)),
			surface: rgbToCss(lighten(dominant, 0.05), 0.95),
			border: rgbToCss(lighten(dominant, 0.4), 0.18),
			highlight: rgbToCss(lighten(accent, 0.25), 0.45),
			glow: rgbToCss(glow, 0.38),
			tertiary: rgbToCss(tertiary, 0.32),
			quaternary: rgbToCss(quaternary, 0.28)
		};
	};

	const DEFAULT_THEME: Theme = generateRandomTheme();

	const DEFAULT_PALETTE: PaletteResult = {
		dominant: { red: 26, green: 15, blue: 46 },
		accent: { red: 231, green: 76, blue: 60 },
		palette: [
			{ red: 30, green: 41, blue: 59 },
			{ red: 59, green: 130, blue: 246 },
			{ red: 99, green: 102, blue: 241 }
		]
	};

	const toTheme = (palette: PaletteResult): Theme => {
		const dominant = ensureTextContrast(palette.dominant);
		const accent = ensureTextContrast(palette.accent);
		const secondary = ensureTextContrast(palette.palette[1] ?? lighten(dominant, 0.08));
		const glow = ensureTextContrast(palette.palette[2] ?? lighten(accent, 0.2));
		const tertiary = ensureTextContrast(palette.palette[3] ?? darken(accent, 0.15));
		const quaternary = ensureTextContrast(palette.palette[4] ?? lighten(dominant, 0.12));

		return {
			primary: rgbToCss(darken(dominant, 0.25)),
			secondary: rgbToCss(lighten(secondary, 0.12)),
			accent: rgbToCss(lighten(accent, 0.08)),
			surface: rgbToCss(lighten(dominant, 0.05), 0.95),
			border: rgbToCss(lighten(dominant, 0.4), 0.18),
			highlight: rgbToCss(lighten(accent, 0.25), 0.45),
			glow: rgbToCss(glow, 0.38),
			tertiary: rgbToCss(tertiary, 0.32),
			quaternary: rgbToCss(quaternary, 0.28)
		};
	};

	let theme: Theme = DEFAULT_THEME;
	let isPlaying = $state(false);
	let enableAnimations = $state(true);
	let performanceLevel = $state<'high' | 'medium' | 'low'>('high');
	let backgroundEnabled = $state(true);
	let requestToken = 0;
	let latestState: PlayerStateShape = { currentTrack: null, isPlaying: false };
	let currentCoverUrl: string | null = null;
	let retryAttempts = 0;

	const MAX_RETRY_ATTEMPTS = 3;
	const RETRY_DELAY_MS = 600;

	const setCssVariables = (next: Theme) => {
		if (!browser) return;
		const target = document.documentElement;
		target.style.setProperty('--bloom-primary', next.primary);
		target.style.setProperty('--bloom-secondary', next.secondary);
		target.style.setProperty('--bloom-accent', next.accent);
		target.style.setProperty('--bloom-glow', next.glow);
		target.style.setProperty('--bloom-tertiary', next.tertiary);
		target.style.setProperty('--bloom-quaternary', next.quaternary);
		target.style.setProperty('--surface-color', next.surface);
		target.style.setProperty('--surface-border', next.border);
		target.style.setProperty('--surface-highlight', next.highlight);
		target.style.setProperty('--accent-color', next.accent);
	};

	const applyTheme = (palette: PaletteResult) => {
		theme = toTheme(palette);
		setCssVariables(theme);
	};

	const resetTheme = () => {
		theme = DEFAULT_THEME;
		setCssVariables(theme);
	};

	const resolveArtworkUrl = (
		track: PlayerStateShape['currentTrack']
	): string | null => {
		if (!track) return null;

		const albumCover = track.album?.cover ?? null;
		if (albumCover) {
			// Use smaller images when the device is constrained
			const imageSize = performanceLevel === 'low' ? '320' : performanceLevel === 'medium' ? '640' : '1280';
			return losslessAPI.getCoverUrl(albumCover, imageSize);
		}

		const artistPicture = track.artist?.picture ?? track.artists?.find((artist) => Boolean(artist?.picture))?.picture ?? null;
		if (artistPicture) {
			return losslessAPI.getArtistPictureUrl(artistPicture, '750');
		}

		return null;
	};

	const updateFromTrack = async (state: PlayerStateShape | null = null) => {
		// Avoid heavy palette work altogether for low performance devices
		if (performanceLevel === 'low') {
			resetTheme();
			currentCoverUrl = null;
			retryAttempts = 0;
			return;
		}

		const snapshot = state ?? latestState;
		const token = ++requestToken;

		if (!snapshot?.currentTrack) {
			resetTheme();
			currentCoverUrl = null;
			retryAttempts = 0;
			return;
		}

		const coverUrl = resolveArtworkUrl(snapshot.currentTrack);

		if (!coverUrl) {
			resetTheme();
			currentCoverUrl = null;
			retryAttempts = 0;
			return;
		}

		if (coverUrl === currentCoverUrl) {
			return;
		}

		currentCoverUrl = coverUrl;
		retryAttempts = 0;

		try {
			const palette = await extractPaletteFromImage(coverUrl);
			if (token === requestToken) {
				applyTheme(palette);
			}
		} catch (error) {
			console.warn('Failed to extract palette from cover art', error);
			if (token === requestToken) {
				currentCoverUrl = null;
				retryAttempts += 1;
				resetTheme();
				if (retryAttempts <= MAX_RETRY_ATTEMPTS) {
					setTimeout(() => {
						updateFromTrack();
					}, RETRY_DELAY_MS);
				} else {
					retryAttempts = 0;
				}
			}
		}
	};

	let unsubscribe: () => void = () => {};
	let lastProcessedCover: string | null = null;

	const handlePlayerChange = (state: PlayerStateShape) => {
		latestState = state;
		isPlaying = state.isPlaying && Boolean(state.currentTrack);
		
		// Get the cover URL that would be processed
		const coverUrl = state.currentTrack ? resolveArtworkUrl(state.currentTrack) : null;
		
		// Skip if we're already processing or have processed this exact cover
		if (backgroundEnabled && coverUrl === lastProcessedCover) {
			return;
		}

		lastProcessedCover = backgroundEnabled ? coverUrl : null;
		updateFromTrack(state);
	};

	type PlayerStateShape = {
		currentTrack: {
			album?: {
				cover?: string | null;
				videoCover?: string | null;
			};
			artist?: {
				picture?: string | null;
			} | null;
			artists?: Array<{
				picture?: string | null;
			}> | null;
		} | null;
		isPlaying: boolean;
	};

	const subscribeToPlayer = () => {
		unsubscribe = playerStore.subscribe(($state) => {
			const snapshot: PlayerStateShape = {
				currentTrack: $state.currentTrack
					? {
						album: {
							cover: $state.currentTrack.album?.cover ?? null,
							videoCover: $state.currentTrack.album?.videoCover ?? null
						},
						artist: $state.currentTrack.artist
							? {
								picture: $state.currentTrack.artist.picture ?? null
							}
							: null,
						artists: $state.currentTrack.artists?.map((artist) => ({
							picture: artist.picture ?? null
						})) ?? null
					}
					: null,
				isPlaying: $state.isPlaying
			};
			handlePlayerChange(snapshot);
		});
	};

	onMount(() => {
		if (!browser) return;
		setCssVariables(theme);
		
		// Subscribe to performance settings
		const unsubPerf = effectivePerformanceLevel.subscribe((level) => {
			const previousLevel = performanceLevel;
			if (level === previousLevel) {
				return;
			}

			performanceLevel = level;
			backgroundEnabled = level !== 'low';

			if (level === 'low') {
				// Cancel any pending palette work and fall back to a lightweight baseline
				requestToken += 1;
				lastProcessedCover = null;
				currentCoverUrl = null;
				retryAttempts = 0;
				resetTheme();
			} else if (previousLevel === 'low' && latestState?.currentTrack) {
				// Reprocess the current artwork when moving back to richer modes
				lastProcessedCover = null;
				currentCoverUrl = null;
				retryAttempts = 0;
				updateFromTrack(latestState);
			}
		});
		
		const unsubAnim = animationsEnabled.subscribe((enabled) => {
			enableAnimations = enabled;
		});
		
		// Get current state before subscribing
		const currentState = get(playerStore);
		if (currentState.currentTrack) {
			const snapshot: PlayerStateShape = {
				currentTrack: {
					album: {
						cover: currentState.currentTrack.album?.cover ?? null,
						videoCover: currentState.currentTrack.album?.videoCover ?? null
					},
					artist: currentState.currentTrack.artist
						? {
							picture: currentState.currentTrack.artist.picture ?? null
						}
						: null,
					artists: currentState.currentTrack.artists?.map((artist) => ({
						picture: artist.picture ?? null
					})) ?? null
				},
				isPlaying: currentState.isPlaying
			};
			
			const coverUrl = resolveArtworkUrl(snapshot.currentTrack);
			backgroundEnabled = performanceLevel !== 'low';
			lastProcessedCover = backgroundEnabled ? coverUrl : null;
			latestState = snapshot;
			isPlaying = snapshot.isPlaying && Boolean(snapshot.currentTrack);
			updateFromTrack(snapshot);
		}
		
		// Subscribe after handling initial state
		subscribeToPlayer();
		
		return () => {
			unsubPerf();
			unsubAnim();
		};
	});

	onDestroy(() => {
		unsubscribe?.();
	});
</script>

<div class={`dynamic-background ${isPlaying && enableAnimations ? 'playing' : ''} ${backgroundEnabled ? '' : 'is-disabled'}`} aria-hidden="true" data-performance={performanceLevel}>
	{#if backgroundEnabled}
		<div class="dynamic-background__gradient"></div>
		<div class="dynamic-background__vignette"></div>
		<div class="dynamic-background__noise"></div>
	{:else}
		<div class="dynamic-background__fallback"></div>
	{/if}
</div>

<style>
	.dynamic-background {
		position: fixed;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.dynamic-background.is-disabled {
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--bloom-primary, #0f172a) 94%, transparent) 0%,
			color-mix(in srgb, var(--bloom-secondary, #1e293b) 86%, transparent) 100%
		);
	}

	.dynamic-background__gradient {
		position: absolute;
		inset: -25vmax;
		background:
			radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--bloom-accent) 95%, transparent) 0%, transparent 55%),
			radial-gradient(circle at 80% 30%, color-mix(in srgb, var(--bloom-secondary) 98%, transparent) 0%, transparent 60%),
			radial-gradient(circle at 50% 80%, color-mix(in srgb, var(--bloom-primary) 88%, transparent) 0%, transparent 65%),
			radial-gradient(circle at 65% 50%, color-mix(in srgb, var(--bloom-tertiary, var(--bloom-accent)) 82%, transparent) 0%, transparent 50%),
			radial-gradient(circle at 30% 60%, color-mix(in srgb, var(--bloom-quaternary, var(--bloom-secondary)) 85%, transparent) 0%, transparent 53%),
			radial-gradient(circle at 85% 85%, color-mix(in srgb, var(--bloom-glow, var(--bloom-accent)) 75%, transparent) 0%, transparent 48%),
			radial-gradient(circle at 10% 90%, color-mix(in srgb, var(--bloom-highlight, var(--bloom-secondary)) 70%, transparent) 0%, transparent 45%);
		filter: blur(100px) saturate(140%);
		transform-origin: center;
		animation: bloom-rotate 60s ease-in-out infinite;
		animation-play-state: paused;
		transition: background 1.2s cubic-bezier(0.4, 0, 0.2, 1);
		will-change: transform;
	}

	/* Medium performance: reduce gradients and blur */
	.dynamic-background[data-performance='medium'] .dynamic-background__gradient {
		background:
			radial-gradient(circle at 25% 25%, color-mix(in srgb, var(--bloom-accent) 88%, transparent) 0%, transparent 62%),
			radial-gradient(circle at 75% 35%, color-mix(in srgb, var(--bloom-secondary) 92%, transparent) 0%, transparent 68%),
			radial-gradient(circle at 50% 75%, color-mix(in srgb, var(--bloom-primary) 82%, transparent) 0%, transparent 72%),
			radial-gradient(circle at 15% 85%, color-mix(in srgb, var(--bloom-glow, var(--bloom-accent)) 70%, transparent) 0%, transparent 50%);
		filter: blur(70px) saturate(125%);
	}

	/* Low performance: minimal gradients and blur */
	.dynamic-background[data-performance='low'] .dynamic-background__gradient {
		background:
			radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--bloom-accent) 75%, transparent) 0%, transparent 70%),
			radial-gradient(circle at 70% 70%, color-mix(in srgb, var(--bloom-secondary) 80%, transparent) 0%, transparent 75%);
		inset: -15vmax;
		filter: blur(28px) saturate(105%);
		animation: none; /* Disable rotation on low-end */
	}

	.dynamic-background[data-performance='low'] .dynamic-background__noise {
		opacity: 0.1;
	}

	.dynamic-background.playing .dynamic-background__gradient {
		animation-play-state: running;
	}

	.dynamic-background__vignette {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at center, transparent 40%, rgba(8, 11, 19, 0.82) 100%);
	}

	.dynamic-background__noise {
		position: absolute;
		inset: 0;
		background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"%3E%3Cfilter id="n" x="0" y="0" width="100%25" height="100%25"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="128" height="128" filter="url(%23n)" opacity="0.18"/%3E%3C/svg%3E');
		mix-blend-mode: soft-light;
		opacity: 0.5;
	}

	.dynamic-background__fallback {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.16) 0%, transparent 55%),
			radial-gradient(circle at 80% 80%, rgba(30, 64, 175, 0.12) 0%, transparent 70%),
			radial-gradient(circle at 50% 100%, rgba(15, 23, 42, 0.45) 0%, rgba(15, 23, 42, 0.9) 70%);
		filter: none;
	}

	@keyframes bloom-rotate {
		0% {
			transform: rotate(0deg) scale(1.08);
		}

		25% {
			transform: rotate(90deg) scale(1.06);
		}

		50% {
			transform: rotate(180deg) scale(1.08);
		}

		75% {
			transform: rotate(270deg) scale(1.06);
		}

		100% {
			transform: rotate(360deg) scale(1.08);
		}
	}
</style>

