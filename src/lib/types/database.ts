// TypeScript types for Supabase Database
// Update these after creating your tables in Supabase

export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export interface Database {
	public: {
		Tables: {
			users: {
				Row: {
					id: string;
					email: string;
					username: string | null;
					avatar_url: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id: string;
					email: string;
					username?: string | null;
					avatar_url?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					email?: string;
					username?: string | null;
					avatar_url?: string | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			user_preferences: {
				Row: {
					id: string;
					user_id: string;
					theme: string | null;
					audio_quality: string | null;
					download_path: string | null;
					preferences: Json | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					theme?: string | null;
					audio_quality?: string | null;
					download_path?: string | null;
					preferences?: Json | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					theme?: string | null;
					audio_quality?: string | null;
					download_path?: string | null;
					preferences?: Json | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			listening_history: {
				Row: {
					id: string;
					user_id: string;
					track_id: string;
					track_title: string;
					artist_name: string;
					album_title: string | null;
					played_at: string;
					duration_ms: number | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					track_id: string;
					track_title: string;
					artist_name: string;
					album_title?: string | null;
					played_at?: string;
					duration_ms?: number | null;
				};
				Update: {
					id?: string;
					user_id?: string;
					track_id?: string;
					track_title?: string;
					artist_name?: string;
					album_title?: string | null;
					played_at?: string;
					duration_ms?: number | null;
				};
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			[_ in never]: never;
		};
		Enums: {
			[_ in never]: never;
		};
	};
}
