import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="container-page flex h-16 items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="text-sm text-muted hover:text-fg">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main id="main" className="container-page max-w-2xl py-10 sm:py-16">
        {children}
      </main>
    </div>
  );
}
