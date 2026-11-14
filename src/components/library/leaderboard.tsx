import { useEffect, useState } from "react";
import { EyeOff, Medal, Trophy } from "lucide-react";
import { loadLeaderboard } from "@/lib/library/api";
import { ANONYMOUS_LABEL, type Leaderboard, type LeaderboardEntry } from "@/lib/library/ids";
import { Avatar, EmptyState, SkeletonList } from "@/components/library/ui";

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const tone = rank === 1 ? "text-[#c58a00]" : rank === 2 ? "text-[#7d8794]" : "text-[#b0652a]";
    return (
      <span className="grid size-9 shrink-0 place-items-center" aria-label={`Hạng ${rank}`}>
        <Medal aria-hidden="true" className={`size-7 ${tone}`} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center text-base font-semibold text-muted" aria-label={`Hạng ${rank}`}>
      {rank}
    </span>
  );
}

function Row({ entry, viewerIsOwner }: { entry: LeaderboardEntry; viewerIsOwner: boolean }) {
  const masked = entry.name === ANONYMOUS_LABEL && !entry.isMe && !viewerIsOwner;
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
        entry.isMe ? "border-accent bg-pink" : "border-line bg-surface"
      }`}
    >
      <RankBadge rank={entry.rank} />
      {masked ? (
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-blue text-accent-2">
          <EyeOff className="size-5" />
        </span>
      ) : (
        <Avatar name={entry.name} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {entry.name}
          {entry.isMe ? <span className="ml-2 text-sm font-medium text-accent">Bạn</span> : null}
        </p>
        <p className="truncate text-sm text-muted">
          {entry.quizzes} đề · TB {entry.average}% · {entry.attempts} lần làm
          {entry.anonymous && (entry.isMe || viewerIsOwner) ? (
            <span className="ml-2 inline-flex items-center gap-1 text-accent-2">
              <EyeOff aria-hidden="true" className="size-3.5" />
              {entry.isMe ? "Bạn đang ẩn danh" : "Đang ẩn danh"}
              {viewerIsOwner && entry.username ? ` · ${entry.username}` : ""}
            </span>
          ) : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xl leading-none font-semibold text-accent">{entry.points}</p>
        <p className="text-xs text-muted">điểm</p>
      </div>
    </li>
  );
}

export function LeaderboardList({
  limit,
  version = 0,
  onEmptyAction,
}: {
  limit?: number;
  /** Đổi giá trị này để tải lại (ví dụ sau khi bật/tắt ẩn danh). */
  version?: number;
  onEmptyAction?: () => void;
}) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    loadLeaderboard()
      .then((result) => {
        if (!alive) return;
        if (!result.ok) setError(result.message);
        else {
          setBoard(result.data);
          setError("");
        }
      })
      .catch(() => {
        if (alive) setError("Không tải được bảng xếp hạng.");
      });
    return () => {
      alive = false;
    };
  }, [version]);

  if (error) return <p className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>;
  if (!board) return <SkeletonList rows={limit ?? 5} label="Đang tải bảng xếp hạng" />;
  if (board.entries.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="Chưa có ai trên bảng xếp hạng"
        hint="Làm xong một đề thực hành để điểm được lưu và lên bảng đầu tiên."
        action={
          onEmptyAction ? (
            <button
              type="button"
              onClick={onEmptyAction}
              className="h-11 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent"
            >
              Chọn đề để làm
            </button>
          ) : null
        }
      />
    );
  }

  const shown = limit ? board.entries.slice(0, limit) : board.entries;
  const meOutside = board.me && !shown.some((entry) => entry.isMe);
  return (
    <div>
      {!limit ? (
        <p className="mb-3 rounded-2xl bg-pink px-4 py-3 text-sm text-pretty">
          Điểm xếp hạng là tổng điểm cao nhất (%) của từng đề bạn đã làm. Làm lại đề để phá kỷ lục, làm thêm đề mới để cộng thêm điểm.
        </p>
      ) : null}
      {board.viewerIsOwner && !limit ? (
        <p className="mb-3 rounded-2xl bg-blue px-4 py-3 text-sm text-pretty">
          Bạn là chủ web nên thấy tên thật của cả người đang ẩn danh. Người khác chỉ thấy “{ANONYMOUS_LABEL}”.
        </p>
      ) : null}
      <ol className="space-y-2">
        {shown.map((entry, index) => (
          <Row key={`${entry.rank}-${index}`} entry={entry} viewerIsOwner={board.viewerIsOwner} />
        ))}
      </ol>
      {meOutside && board.me ? (
        <div className="mt-3">
          <p className="mb-2 text-sm text-muted">Vị trí của bạn</p>
          <ol>
            <Row entry={board.me} viewerIsOwner={board.viewerIsOwner} />
          </ol>
        </div>
      ) : null}
      {!board.viewerIsOwner && !board.me ? (
        <p className="mt-3 text-sm text-muted">Bạn chưa có kết quả đề nào nên chưa có hạng.</p>
      ) : null}
    </div>
  );
}
