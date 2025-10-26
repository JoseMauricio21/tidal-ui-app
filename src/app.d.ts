import type { Session, User } from '@supabase/supabase-js';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			session: Session | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

	declare module 'shaka-player/dist/shaka-player.compiled.js' {
		const shaka: {
			Player: new (mediaElement: HTMLMediaElement) => {
				load(uri: string): Promise<void>;
				unload(): Promise<void>;
				destroy(): Promise<void>;
				getNetworkingEngine?: () => {
					registerRequestFilter: (
						callback: (type: unknown, request: { method: string; uris: string[] }) => void
					) => void;
				};
			};
			polyfill?: {
				installAll?: () => void;
			};
		};
		export default shaka;
	}

export {};
