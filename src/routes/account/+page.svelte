<script lang="ts">
	import { page } from '$app/stores';
	import { auth } from '$lib/stores/auth';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { User, Mail, LogOut, Music, Clock, Settings } from 'lucide-svelte';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import { getListeningHistory, type ListeningHistoryEntry } from '$lib/utils/clientHistory';

	let { data } = $props();
	let showAuthModal = $state(false);
	let isLoggingOut = $state(false);
	let listeningHistory = $state<ListeningHistoryEntry[]>([]);
	let isLoadingHistory = $state(true);

	// Dynamic gradient background (reduced green intensity)
	let bgColors = $state({
		r: Math.floor(Math.random() * 200) + 55,
		g: Math.floor(Math.random() * 100), // 0-99 for reduced green
		b: Math.floor(Math.random() * 200) + 55
	});

	onMount(async () => {
		// Initialize session from server data or localStorage
		if (data.session) {
			auth.setSession(data.session);
		}

		// Load listening history
		if ($auth.user) {
			listeningHistory = await getListeningHistory(20);
			isLoadingHistory = false;
		}

		// Randomize background colors periodically
		const interval = setInterval(() => {
			bgColors = {
				r: Math.floor(Math.random() * 200) + 55,
				g: Math.floor(Math.random() * 100),
				b: Math.floor(Math.random() * 200) + 55
			};
		}, 10000);

		return () => clearInterval(interval);
	});

	$effect(() => {
		// When user logs in, load their history
		if ($auth.user && listeningHistory.length === 0 && isLoadingHistory) {
			getListeningHistory(20).then(history => {
				listeningHistory = history;
				isLoadingHistory = false;
			});
		}
	});

	async function handleLogout() {
		isLoggingOut = true;
		await auth.logout();
		isLoggingOut = false;
		listeningHistory = [];
		isLoadingHistory = true;
	}

	function handleAuthSuccess() {
		showAuthModal = false;
	}
	
	function formatListeningTime(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('es-ES') + ' a las ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div
	class="account-page"
	style:--bg-r={bgColors.r}
	style:--bg-g={bgColors.g}
	style:--bg-b={bgColors.b}
>
	{#if $auth.user}
		<div class="account-container" in:fade={{ duration: 300 }}>
			<div class="profile-card" in:fly={{ y: 20, duration: 400, delay: 100 }}>
				<div class="profile-header">
					<div class="avatar">
						{#if $auth.user.user_metadata?.avatar_url}
							<img src={$auth.user.user_metadata.avatar_url} alt="Avatar" />
						{:else}
							<User size={48} />
						{/if}
					</div>
					<div class="profile-info">
						<h1>{$auth.user.user_metadata?.username || 'Amante de la música'}</h1>
						<p class="email">
							<Mail size={16} />
							<span>{$auth.user.email}</span>
						</p>
					</div>
				</div>

				<div class="profile-stats">
					<div class="stat-card">
						<Music size={24} />
						<div class="stat-content">
							<span class="stat-value">0</span>
							<span class="stat-label">Canciones reproducidas</span>
						</div>
					</div>
					<div class="stat-card">
						<Clock size={24} />
						<div class="stat-content">
							<span class="stat-value">0h</span>
							<span class="stat-label">Tiempo escuchando</span>
						</div>
					</div>
				</div>

				<div class="profile-actions">
					<button class="action-btn secondary">
						<Settings size={20} />
						<span>Editar perfil</span>
					</button>
					<button class="action-btn danger" onclick={handleLogout} disabled={isLoggingOut}>
						<LogOut size={20} />
						<span>{isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}</span>
					</button>
				</div>
			</div>

			<div class="content-section" in:fly={{ y: 20, duration: 400, delay: 200 }}>
				<h2>Actividad reciente</h2>
				{#if isLoadingHistory}
					<div class="empty-state">
						<Music size={48} />
						<p>Cargando tu historial de escucha...</p>
					</div>
				{:else if listeningHistory.length === 0}
					<div class="empty-state">
						<Music size={48} />
						<p>Aún no hay historial de escucha</p>
						<span>Reproduce música para ver tu actividad aquí</span>
					</div>
				{:else}
					<div class="history-list">
						{#each listeningHistory as item (item.id)}
							<div class="history-item">
								<div class="history-item-content">
									<div class="history-track">
										<h3>{item.track_title}</h3>
										<p>{item.artist_name}{#if item.album_title} • {item.album_title}{/if}</p>
									</div>
									<div class="history-time">
										{formatListeningTime(item.played_at)}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<div class="guest-container" in:fade={{ duration: 300 }}>
			<div class="guest-card" in:fly={{ y: 20, duration: 400 }}>
				<div class="guest-icon">
					<User size={64} />
				</div>
				<h1>Bienvenido</h1>
				<p>Inicia sesión para guardar tus preferencias y seguir tu historial de escucha</p>
				<button class="cta-btn" onclick={() => (showAuthModal = true)}>
					<span>Iniciar sesión / Crear cuenta</span>
				</button>
			</div>
		</div>
	{/if}
</div>

<AuthModal bind:open={showAuthModal} on:success={handleAuthSuccess} />

<style>
	.account-page {
		min-height: 100vh;
		padding: 2rem 1rem;
		background: linear-gradient(
			135deg,
			rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.05) 0%,
			rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.02) 100%
		);
		transition: background 1s ease;
	}

	.account-container,
	.guest-container {
		max-width: 900px;
		margin: 0 auto;
	}

	/* Profile Card */
	.profile-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 2rem;
		margin-bottom: 2rem;
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	.profile-header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin-bottom: 2rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.avatar {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: linear-gradient(
			135deg,
			rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.3),
			rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.1)
		);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.8);
		border: 2px solid rgba(255, 255, 255, 0.1);
		overflow: hidden;
	}

	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.profile-info h1 {
		margin: 0 0 0.5rem 0;
		font-size: 2rem;
		font-weight: 700;
		background: linear-gradient(
			135deg,
			rgb(var(--bg-r), var(--bg-g), var(--bg-b)),
			rgba(255, 255, 255, 0.9)
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.email {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.95rem;
		margin: 0;
	}

	.profile-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		color: rgba(255, 255, 255, 0.7);
		transition: all 0.2s ease;
	}

	.stat-card:hover {
		background: rgba(255, 255, 255, 0.05);
		transform: translateY(-2px);
	}

	.stat-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: white;
	}

	.stat-label {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.profile-actions {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.action-btn {
		flex: 1;
		min-width: 180px;
		padding: 0.875rem 1.5rem;
		border-radius: 12px;
		font-size: 0.95rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.action-btn.secondary {
		background: rgba(255, 255, 255, 0.05);
		color: white;
	}

	.action-btn.secondary:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		transform: translateY(-2px);
	}

	.action-btn.danger {
		background: rgba(239, 68, 68, 0.1);
		color: #fca5a5;
		border-color: rgba(239, 68, 68, 0.2);
	}

	.action-btn.danger:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.2);
		transform: translateY(-2px);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* History List */
	.history-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-height: 500px;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.history-item {
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		transition: all 0.2s ease;
	}

	.history-item:hover {
		background: rgba(255, 255, 255, 0.05);
		transform: translateY(-2px);
	}

	.history-item-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.history-track h3 {
		margin: 0 0 0.25rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: white;
	}

	.history-track p {
		margin: 0;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.history-time {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		white-space: nowrap;
	}

	/* Content Section */
	.content-section {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 2rem;
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	.content-section h2 {
		margin: 0 0 1.5rem 0;
		font-size: 1.5rem;
		font-weight: 700;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.4);
	}

	.empty-state p {
		margin: 1rem 0 0.5rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.6);
	}

	.empty-state span {
		font-size: 0.875rem;
	}

	/* Guest State */
	.guest-card {
		max-width: 480px;
		margin: 4rem auto;
		text-align: center;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 3rem 2rem;
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	.guest-icon {
		width: 120px;
		height: 120px;
		margin: 0 auto 2rem;
		border-radius: 50%;
		background: linear-gradient(
			135deg,
			rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.2),
			rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.05)
		);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.6);
		border: 2px solid rgba(255, 255, 255, 0.1);
	}

	.guest-card h1 {
		margin: 0 0 1rem 0;
		font-size: 2rem;
		font-weight: 700;
	}

	.guest-card p {
		margin: 0 0 2rem 0;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.6;
	}

	.cta-btn {
		padding: 1rem 2rem;
		background: linear-gradient(
			135deg,
			rgb(var(--bg-r), var(--bg-g), var(--bg-b)),
			rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.7)
		);
		border: none;
		border-radius: 12px;
		color: white;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.cta-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(var(--bg-r), var(--bg-g), var(--bg-b), 0.3);
	}

	@media (max-width: 640px) {
		.profile-header {
			flex-direction: column;
			text-align: center;
		}

		.profile-info h1 {
			font-size: 1.5rem;
		}

		.profile-actions {
			flex-direction: column;
		}

		.action-btn {
			width: 100%;
		}
	}
</style>
