export const OWNER_USERNAME = "Nhuy110927";

export const MAX_FILE_BYTES = 3 * 1024 * 1024;

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

export const SECTIONS = [
  {
    id: "theory",
    label: "Lý thuyết",
    hint: "PDF, Word, ảnh và các file để xem hoặc tải về.",
    accept: undefined,
  },
  {
    id: "quizfile",
    label: "File trắc nghiệm",
    hint: "File đề để mọi người tải về.",
    accept: undefined,
  },
  {
    id: "practice",
    label: "Thực hành trắc nghiệm",
    hint: "File .html để làm bài ngay trên trang.",
    accept: ".html,.htm",
  },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export type FileMeta = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  created: string;
  section: SectionId;
};

export type Subject = {
  id: string;
  name: string;
  files: Record<SectionId, FileMeta[]>;
};

export type Member = {
  username: string;
  displayName: string;
  role: "owner" | "user";
  legacyEnabled: boolean;
  previewOwner: boolean;
  anonymous: boolean;
  /** Biệt danh dùng trong bình luận ("" nếu chưa đặt). */
  nickname: string;
};

export type Person = {
  username: string;
  displayName: string;
  created: string;
  blocked: boolean;
  registered: boolean;
  role: "owner" | "user" | "unknown";
  resetRequested: boolean;
};

export type MySubmission = {
  id: string;
  subjectName: string;
  section: SectionId;
  name: string;
  status: "pending" | "approved" | "rejected";
  created: string;
};

export type ReviewItem = {
  id: string;
  subjectName: string;
  section: SectionId;
  name: string;
  bytes: number;
  created: string;
  authorName: string;
  authorUsername: string;
};

export type CommentItem = {
  id: string;
  /** Biệt danh nếu người viết đã đặt, ngược lại là tên thật. */
  author: string;
  /** Chỉ có khi người xem là chủ web và người viết đang dùng biệt danh. */
  realName?: string;
  body: string;
  created: string;
  canDelete: boolean;
  mine: boolean;
  byOwner: boolean;
};

export type LibraryNotice = {
  id: string;
  message: string;
};

export type Participant = {
  userId: string;
  username: string;
  displayName: string;
  role: "owner" | "user";
  blocked: boolean;
};

export type UserStats = {
  displayName: string;
  username: string;
  downloads: number;
  subjects: { name: string; downloads: number }[];
  quizzes: { subject: string; name: string; attempts: number }[];
};

export type MyStats = {
  downloads: number;
  /** Số lần làm đề đã được lưu kết quả. */
  attempts: number;
  /** Số đề khác nhau đã có kết quả. */
  quizzes: number;
  /** Điểm xếp hạng: tổng điểm cao nhất (%) của từng đề. */
  points: number;
};

export type QuizSaved = {
  saved: boolean;
  score: number;
  total: number;
  percent: number;
  /** Điểm cao nhất (%) của đề này sau lần làm vừa rồi. */
  best: number;
  /** Lần đầu làm đề hoặc vừa phá kỷ lục cũ. */
  improved: boolean;
};

export type LeaderboardEntry = {
  rank: number;
  /** "Ẩn danh" khi người này đang ẩn và người xem không phải chủ web hay chính họ. */
  name: string;
  /** Chỉ có khi người xem là chủ web hoặc chính người đó. */
  username?: string;
  /** Tổng điểm cao nhất (%) của từng đề đã làm. */
  points: number;
  /** Số đề khác nhau đã có kết quả. */
  quizzes: number;
  /** Tổng số lần làm đã lưu. */
  attempts: number;
  /** Điểm trung bình (%) trên các đề đã làm. */
  average: number;
  isMe: boolean;
  anonymous: boolean;
};

export type Leaderboard = {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  total: number;
  viewerIsOwner: boolean;
};

export const ANONYMOUS_LABEL = "Ẩn danh";

export type FileKind = "pdf" | "word" | "sheet" | "slides" | "image" | "archive" | "quiz" | "text" | "other";

export function fileKind(name: string, mime: string, section?: string): FileKind {
  if (section === "practice") return "quiz";
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const type = mime.toLowerCase();
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)) return "image";
  if (["doc", "docx", "odt", "rtf"].includes(ext) || type.includes("word")) return "word";
  if (["xls", "xlsx", "csv", "ods"].includes(ext) || type.includes("sheet") || type.includes("excel")) return "sheet";
  if (["ppt", "pptx", "odp"].includes(ext) || type.includes("presentation") || type.includes("powerpoint")) return "slides";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext) || type.includes("zip")) return "archive";
  if (["txt", "md", "html", "htm"].includes(ext) || type.startsWith("text/")) return "text";
  return "other";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FRESH_VISIT_KEY = "library-fresh-visit";
export const NOTICE_CACHE_KEY = "library-notices";

/** Bỏ dấu tiếng Việt và hạ chữ thường, dùng để tìm kiếm và so khớp. */
export function foldText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 30;
const NICKNAME_CHARS = /^[\p{L}\p{N} _.\-]+$/u;
const RESERVED_NICKNAMES = ["owner", "admin", "administrator", "chu web", "chuweb", "quan tri", "quan tri vien", "an danh"];

/** Trả về thông báo lỗi nếu biệt danh không hợp lệ, hoặc null nếu dùng được. */
export function nicknameProblem(raw: string): string | null {
  const nick = raw.trim().replace(/\s+/g, " ");
  if (nick.length < NICKNAME_MIN || nick.length > NICKNAME_MAX) {
    return `Biệt danh cần từ ${NICKNAME_MIN} đến ${NICKNAME_MAX} ký tự.`;
  }
  if (!NICKNAME_CHARS.test(nick)) return "Biệt danh chỉ gồm chữ, số, khoảng trắng, dấu chấm, gạch ngang hoặc gạch dưới.";
  const folded = foldText(nick);
  if (RESERVED_NICKNAMES.includes(folded) || folded === OWNER_USERNAME.toLowerCase()) {
    return "Biệt danh này được dành riêng. Hãy chọn tên khác.";
  }
  return null;
}

export function normalizeUsername(raw: string): string | null {
  const username = raw.trim();
  if (!USERNAME.test(username)) return null;
  return username;
}

export function memberEmail(username: string): string {
  return `${username.toLowerCase()}@members.thuvien.app`;
}

export function isOwnerUsername(username: string): boolean {
  return username.toLowerCase() === OWNER_USERNAME.toLowerCase();
}

export function sectionById(id: string): (typeof SECTIONS)[number] | undefined {
  return SECTIONS.find((section) => section.id === id);
}

export function emptyFiles(): Record<SectionId, FileMeta[]> {
  return { theory: [], quizfile: [], practice: [] };
}
