import type { ReactNode } from "react";
import {
  BookOpen,
  ClipboardList,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  House,
  Monitor,
  Moon,
  Presentation,
  Sun,
  PawPrint,
  type LucideIcon,
} from "lucide-react";
import { fileKind, type FileKind } from "@/lib/library/ids";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";

/* ---------- Thanh điều hướng dưới ---------- */

export type TabId = "home" | "subjects" | "practice" | "me";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Trang chủ", icon: House },
  { id: "subjects", label: "Môn", icon: BookOpen },
  { id: "practice", label: "Ôn tập", icon: ClipboardList },
  { id: "me", label: "Tôi", icon: PawPrint },
];

export function BottomNav({
  active,
  badges,
  dots,
  onChange,
}: {
  active: TabId;
  badges?: Partial<Record<TabId, number>>;
  /** Chấm báo nhỏ (không số) cho tab có nội dung mới. */
  dots?: Partial<Record<TabId, string>>;
  onChange: (tab: TabId) => void;
}) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around px-2 pt-1.5 pb-1.5">
        {TABS.map((tab) => {
          const current = tab.id === active;
          const count = badges?.[tab.id] ?? 0;
          const dotLabel = dots?.[tab.id];
          const Icon = tab.icon;
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                aria-current={current ? "page" : undefined}
                onClick={() => onChange(tab.id)}
                className={`relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold transition-colors ${
                  current ? "bg-pink text-accent" : "text-muted"
                }`}
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="size-6" strokeWidth={current ? 2.4 : 1.8} />
                  {count > 0 ? (
                    <span
                      aria-label={`${count} mục cần xử lý`}
                      className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] leading-4 font-bold text-on-accent"
                    >
                      {count > 9 ? "9+" : count}
                    </span>
                  ) : dotLabel ? (
                    <span
                      role="img"
                      aria-label={dotLabel}
                      className="absolute -top-0.5 -right-1.5 size-2.5 rounded-full border-2 border-surface bg-accent"
                    />
                  ) : null}
                </span>
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ---------- Khung chờ ---------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-xl ${className}`} />;
}

export function SkeletonList({ rows = 4, label = "Đang tải" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <Skeleton className="size-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ items = 4 }: { items?: number }) {
  return (
    <div role="status" aria-live="polite" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <span className="sr-only">Đang tải…</span>
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="space-y-3 rounded-2xl border border-line bg-surface px-4 py-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/* ---------- Màn trống ---------- */

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-pink-deep bg-surface/60 px-6 py-10 text-center">
      <span className="mb-3 grid size-16 place-items-center rounded-full bg-pink text-accent">
        <Icon aria-hidden="true" className="size-8" strokeWidth={1.6} />
      </span>
      <p className="text-lg font-semibold">{title}</p>
      {hint ? <p className="mt-1 max-w-xs text-sm text-pretty text-muted">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ---------- Icon loại file ---------- */

const KIND_ICON: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  word: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  image: FileImage,
  archive: FileArchive,
  quiz: ClipboardList,
  text: FileText,
  other: File,
};

const KIND_LABEL: Record<FileKind, string> = {
  pdf: "PDF",
  word: "Word",
  sheet: "Bảng tính",
  slides: "Trình chiếu",
  image: "Ảnh",
  archive: "Nén",
  quiz: "Đề thực hành",
  text: "Văn bản",
  other: "Tệp",
};

export function kindLabel(kind: FileKind): string {
  return KIND_LABEL[kind];
}

export function FileIcon({
  name,
  mime,
  section,
  className = "size-11",
}: {
  name: string;
  mime: string;
  section?: string;
  className?: string;
}) {
  const kind = fileKind(name, mime, section);
  const Icon = KIND_ICON[kind];
  return (
    <span
      data-kind={kind}
      title={KIND_LABEL[kind]}
      className={`file-icon grid shrink-0 place-items-center rounded-xl ${className}`}
    >
      <Icon aria-hidden="true" className="size-1/2" strokeWidth={1.9} />
    </span>
  );
}

/* ---------- Công tắc và chọn giao diện ---------- */

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center justify-between gap-4 text-left disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {hint ? <span className="block text-sm text-pretty text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${
          checked ? "border-accent bg-accent" : "border-pink-deep bg-pink"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-surface shadow transition-transform ${
            checked ? "translate-x-6" : ""
          }`}
        />
      </span>
    </button>
  );
}

const THEME_OPTIONS: { id: ThemePref; label: string; icon: LucideIcon }[] = [
  { id: "auto", label: "Theo máy", icon: Monitor },
  { id: "light", label: "Sáng", icon: Sun },
  { id: "dark", label: "Tối", icon: Moon },
];

export function ThemePicker() {
  const pref = useThemePref();
  return (
    <div role="radiogroup" aria-label="Giao diện" className="grid grid-cols-3 gap-2">
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        const on = pref === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setThemePref(option.id)}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${
              on ? "border-accent bg-pink text-accent" : "border-pink-deep bg-surface"
            }`}
          >
            <Icon aria-hidden="true" className="size-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Avatar chữ cái ---------- */

export function Avatar({ name, className = "size-12 text-lg" }: { name: string; className?: string }) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-pink font-semibold text-accent ${className}`}>
      {letter}
    </span>
  );
}
