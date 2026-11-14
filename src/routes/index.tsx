import { createFileRoute, Navigate } from "@tanstack/react-router";
import { LibraryApp } from "@/components/library/library-app";
import { Skeleton, SkeletonGrid } from "@/components/library/ui";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="min-h-screen bg-bg text-fg">
        <div className="border-b border-line bg-pink px-4 py-4">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <Skeleton className="size-11 rounded-2xl" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4 py-6">
          <span className="sr-only">Đang mở thư viện…</span>
          <SkeletonGrid items={4} />
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  return <LibraryApp />;
}
