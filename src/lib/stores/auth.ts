import { writable } from 'svelte/store';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
	user: User | null;
	session: Session | null;
	loading: boolean;
}

const STORAGE_KEY = 'tidal-ui-auth-session';

function loadFromStorage(): AuthState {
	if (typeof window === 'undefined') {
		return { user: null, session: null, loading: false };
	}
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return { user: null, session: null, loading: false };
		const parsed = JSON.parse(stored);
		return {
			user: parsed.user,
			session: parsed.session,
			loading: false
		};
	} catch (error) {
		console.error('Failed to load auth state from storage:', error);
		return { user: null, session: null, loading: false };
	}
}

function saveToStorage(state: AuthState): void {
	if (typeof window === 'undefined') {
		return;
	}
	try {
		// Only save user and session data, not loading state
		const dataToSave = {
			user: state.user,
			session: state.session
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
	} catch (error) {
		console.error('Failed to save auth state to storage:', error);
	}
}

function createAuthStore() {
	const initialState = loadFromStorage();
	const { subscribe, set, update } = writable<AuthState>(initialState);

	// Subscribe to changes and save to storage
	subscribe((state) => {
		saveToStorage(state);
	});

	return {
		subscribe,
		setSession: (session: Session | null) => {
			update(state => {
				const newState = {
					...state,
					session,
					user: session?.user ?? null
				};
				return newState;
			});
		},
		login: async (email: string, password: string) => {
			update(state => ({ ...state, loading: true }));
			
			try {
				const response = await fetch('/api/auth/login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email, password })
				});

				const data = await response.json();
				
				if (!response.ok) {
					throw new Error(data.error || 'Error al iniciar sesión');
				}

				update(state => ({ ...state, user: data.user, loading: false }));
				return { success: true };
			} catch (error) {
				update(state => ({ ...state, loading: false }));
				return { 
					success: false, 
					error: error instanceof Error ? error.message : 'Error desconocido' 
				};
			}
		},
		signup: async (email: string, password: string, username?: string) => {
			update(state => ({ ...state, loading: true }));
			
			try {
				const response = await fetch('/api/auth/signup', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email, password, username })
				});

				const data = await response.json();
				
				if (!response.ok) {
					throw new Error(data.error || 'Error al crear cuenta');
				}

				update(state => ({ ...state, user: data.user, loading: false }));
				return { success: true };
			} catch (error) {
				update(state => ({ ...state, loading: false }));
				return { 
					success: false, 
					error: error instanceof Error ? error.message : 'Error desconocido' 
				};
			}
		},
		logout: async () => {
			update(state => ({ ...state, loading: true }));
			
			try {
				await fetch('/api/auth/logout', { method: 'POST' });
				const newState = { user: null, session: null, loading: false };
				set(newState);
				// Clear storage as well
				if (typeof window !== 'undefined') {
					localStorage.removeItem(STORAGE_KEY);
				}
				return { success: true };
			} catch (error) {
				update(state => ({ ...state, loading: false }));
				return { 
					success: false, 
					error: error instanceof Error ? error.message : 'Error desconocido' 
				};
			}
		},
		clear: () => {
			const newState = { user: null, session: null, loading: false };
			set(newState);
			// Clear storage as well
			if (typeof window !== 'undefined') {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	};
}

export const auth = createAuthStore();