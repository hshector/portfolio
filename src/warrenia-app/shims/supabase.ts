// lib/supabase/* (env, server, doctor): the demo has no Supabase and no sign-in.
export type AppMode = 'supabase' | 'local' | 'misconfigured';
export const appMode = (): AppMode => 'local';
export const supabaseBaseUrl = (url: string) => url;
export const supabasePublicEnv = () => null;
export const allowedEmails = (): string[] => [];
export const isAllowedEmail = (_email?: string | null) => false;
// (typed loosely: only the app's own store, which the demo replaces, uses it)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function supabaseServer(): Promise<any> {
  throw new Error('No database in the demo');
}
export async function signOut() {}
