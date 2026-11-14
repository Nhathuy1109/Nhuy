import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AuthScreen } from "@/components/library/auth-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <Status label="Đang mở thư viện…" />;
  if (user) return <Navigate to="/" />;
  return <AuthScreen />;
}

function Status({ label }: { label: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg text-fg">
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
