<script lang="ts">
	import { auth } from '$lib/stores/auth';
	import { createEventDispatcher } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { X, User, Mail, Lock, Loader2 } from 'lucide-svelte';

	let { open = $bindable(false) } = $props();

	const dispatch = createEventDispatcher();

	let mode = $state<'login' | 'signup'>('login');
	let email = $state('');
	let password = $state('');
	let username = $state('');
	let error = $state('');
	let isLoading = $derived($auth.loading);

	// Dynamic gradient colors (reduced green intensity as per preference)
	let gradientColors = $state({
		r1: Math.floor(Math.random() * 255),
		g1: Math.floor(Math.random() * 128), // 0-127 for green
		b1: Math.floor(Math.random() * 255),
		r2: Math.floor(Math.random() * 255),
		g2: Math.floor(Math.random() * 128), // 0-127 for green
		b2: Math.floor(Math.random() * 255)
	});

	function randomizeColors() {
		gradientColors = {
			r1: Math.floor(Math.random() * 255),
			g1: Math.floor(Math.random() * 128),
			b1: Math.floor(Math.random() * 255),
			r2: Math.floor(Math.random() * 255),
			g2: Math.floor(Math.random() * 128),
			b2: Math.floor(Math.random() * 255)
		};
	}

	function toggleMode() {
		mode = mode === 'login' ? 'signup' : 'login';
		error = '';
		randomizeColors();
	}

	async function handleSubmit() {
		error = '';

		if (!email || !password) {
			error = 'Por favor, completa todos los campos';
			return;
		}

		if (mode === 'signup' && password.length < 6) {
			error = 'La contraseña debe tener al menos 6 caracteres';
			return;
		}

		const result =
			mode === 'login'
				? await auth.login(email, password)
				: await auth.signup(email, password, username);

		if (result.success) {
			open = false;
			dispatch('success');
			email = '';
			password = '';
			username = '';
		} else {
			error = result.error || 'Ocurrió un error';
		}
	}

	function handleClose() {
		if (!isLoading) {
			open = false;
			error = '';
		}
	}
</script>

{#if open}
	<div
		class="auth-modal-overlay"
		transition:fade={{ duration: 200 }}
		onclick={handleClose}
		role="presentation"
	>
		<div
			class="auth-modal"
			style:--color1="rgb({gradientColors.r1}, {gradientColors.g1}, {gradientColors.b1})"
			style:--color2="rgb({gradientColors.r2}, {gradientColors.g2}, {gradientColors.b2})"
			transition:fly={{ y: 20, duration: 300 }}
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="auth-modal-title"
		>
			<button class="close-btn" onclick={handleClose} aria-label="Cerrar" disabled={isLoading}>
				<X size={24} />
			</button>

			<div class="auth-header">
				<h2 id="auth-modal-title">{mode === 'login' ? 'Bienvenido de nuevo' : 'Crear cuenta'}</h2>
				<p>{mode === 'login' ? 'Inicia sesión para continuar' : 'Únete a nosotros hoy'}</p>
			</div>

			<form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
				{#if mode === 'signup'}
					<div class="form-group">
						<label for="username">
							<User size={18} />
							<span>Nombre de usuario (opcional)</span>
						</label>
						<input
							id="username"
							type="text"
							bind:value={username}
							placeholder="Elige un nombre de usuario"
							disabled={isLoading}
							autocomplete="username"
						/>
					</div>
				{/if}

				<div class="form-group">
					<label for="email">
						<Mail size={18} />
						<span>Correo electrónico</span>
					</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						placeholder="tu@ejemplo.com"
						required
						disabled={isLoading}
						autocomplete="email"
					/>
				</div>

				<div class="form-group">
					<label for="password">
						<Lock size={18} />
						<span>Contraseña</span>
					</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="••••••••"
						required
						disabled={isLoading}
						autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
					/>
				</div>

				{#if error}
					<div class="error-message" transition:fly={{ y: -10, duration: 200 }}>
						{error}
					</div>
				{/if}

				<button type="submit" class="submit-btn" disabled={isLoading}>
					{#if isLoading}
						<Loader2 size={20} class="spinner" />
						<span>{mode === 'login' ? 'Iniciando sesión...' : 'Creando cuenta...'}</span>
					{:else}
						<span>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</span>
					{/if}
				</button>
			</form>

			<div class="auth-footer">
				<button type="button" class="toggle-mode" onclick={toggleMode} disabled={isLoading}>
					{mode === 'login' ? "¿No tienes cuenta? " : '¿Ya tienes cuenta? '}
					<span class="toggle-link">{mode === 'login' ? 'Regístrate' : 'Iniciar sesión'}</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.auth-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.auth-modal {
		position: relative;
		width: 100%;
		max-width: 420px;
		background: linear-gradient(135deg, rgba(var(--color1), 0.1) 0%, rgba(var(--color2), 0.1) 100%),
			rgba(15, 23, 42, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 2rem;
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.5),
			0 0 0 1px rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	.close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 50%;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.7);
		transition: all 0.2s ease;
	}

	.close-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		color: white;
		transform: scale(1.05);
	}

	.close-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.auth-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.auth-header h2 {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		background: linear-gradient(135deg, var(--color1), var(--color2));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.auth-header p {
		color: rgba(255, 255, 255, 0.6);
		margin: 0;
		font-size: 0.95rem;
	}

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
	}

	.form-group input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		color: white;
		font-size: 0.95rem;
		transition: all 0.2s ease;
	}

	.form-group input:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.08);
		border-color: var(--color1);
		box-shadow: 0 0 0 3px rgba(var(--color1), 0.1);
	}

	.form-group input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-group input::placeholder {
		color: rgba(255, 255, 255, 0.3);
	}

	.error-message {
		padding: 0.75rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 8px;
		color: #fca5a5;
		font-size: 0.875rem;
		text-align: center;
	}

	.submit-btn {
		width: 100%;
		padding: 0.875rem 1.5rem;
		background: linear-gradient(135deg, var(--color1), var(--color2));
		border: none;
		border-radius: 12px;
		color: white;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.submit-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(var(--color1), 0.3);
	}

	.submit-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.submit-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	:global(.submit-btn .spinner) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.auth-footer {
		margin-top: 1.5rem;
		text-align: center;
	}

	.toggle-mode {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
		cursor: pointer;
		padding: 0.5rem;
		transition: color 0.2s ease;
	}

	.toggle-mode:hover:not(:disabled) {
		color: rgba(255, 255, 255, 0.9);
	}

	.toggle-mode:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.toggle-link {
		color: var(--color1);
		font-weight: 600;
	}

	@media (max-width: 480px) {
		.auth-modal {
			padding: 1.5rem;
			border-radius: 16px;
		}

		.auth-header h2 {
			font-size: 1.5rem;
		}
	}
</style>
