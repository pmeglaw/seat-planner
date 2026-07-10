import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="shell-theme flex min-h-screen items-center justify-center bg-[var(--admin-bg)] p-6">
      <LoginForm />
    </main>
  );
}
