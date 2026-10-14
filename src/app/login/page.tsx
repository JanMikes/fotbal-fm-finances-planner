import type { Metadata } from "next";

export const metadata: Metadata = { title: "Přihlášení | Fotbal FM" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "1": "Nesprávné heslo",
  rate: "Příliš mnoho pokusů. Zkuste to za chvíli.",
};

/** Shared team password page. Plain HTML form → POST /api/auth/login (works without JavaScript). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS["1"]) : null;
  return (
    <div className="login">
      <form className="login-card" method="post" action="/api/auth/login">
        <div className="login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-short.svg" alt="Fotbal FM" />
          <h1>Marketingový plán úkolů</h1>
        </div>
        <div className="f">
          <label htmlFor="password">Heslo týmu</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus aria-invalid={!!message} />
        </div>
        {message && (
          <p className="login-err" role="alert">
            {message}
          </p>
        )}
        <button className="btn primary" type="submit">
          Vstoupit
        </button>
      </form>
    </div>
  );
}
