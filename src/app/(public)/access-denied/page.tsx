import { LoginButton } from '@/components/chrome/LoginButton';

/**
 * Where the Auth.js `signIn` gate sends a denied
 * sign-in (configured as `pages.error` in `src/lib/auth.ts`). Copy is kept
 * generic — it does not reveal whether the instance is restricted or the
 * character simply isn't on the allowlist.
 */
export default async function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Access not granted</h1>
        <p className="text-muted-foreground">
          This Aperture instance is invite-only. Ask an administrator to add your character or
          corporation to the allowlist, then try again.
        </p>
      </div>
      <LoginButton />
    </main>
  );
}
