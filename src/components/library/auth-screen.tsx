import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { registerMember } from "@/lib/library/api";
import { signInWithUsername } from "@/lib/library/client-auth";
import { OWNER_USERNAME, FRESH_VISIT_KEY, NOTICE_CACHE_KEY } from "@/lib/library/ids";

const NOTICE_KEY = "library-notice";

function takeNotice(): string {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY) ?? "";
    if (notice) sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return "";
  }
}

function PasswordField({ register }: { register: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block text-sm font-medium">
      Mật khẩu
      <span className="relative mt-1 block">
        <input
          name="password"
          type={visible ? "text" : "password"}
          required
          autoComplete={register ? "new-password" : "current-password"}
          placeholder={register ? "Ít nhất 8 ký tự" : "Mật khẩu"}
          className="h-12 w-full rounded-xl border border-pink-deep bg-surface pl-3 pr-12 font-normal"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      </span>
    </label>
  );
}

export function AuthScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"user" | "owner">("user");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState(takeNotice);
  const [pending, setPending] = useState(false);

  const owner = tab === "owner";
  const register = !owner && mode === "register";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const username = owner ? OWNER_USERNAME : String(form.get("username") ?? "");
    const password = String(form.get("password") ?? "");
    const displayName = String(form.get("displayName") ?? "");
    setPending(true);
    setMessage("");
    try {
      if (register) {
        const created = await registerMember({ data: { username, password, displayName } });
        if (!created.ok) {
          setMessage(created.message);
          return;
        }
      }
      const error = await signInWithUsername(username, password);
      if (error) {
        setMessage(error);
        return;
      }
      try {
        sessionStorage.removeItem(NOTICE_CACHE_KEY);
        sessionStorage.setItem(FRESH_VISIT_KEY, "1");
      } catch {
        /* ignore */
      }
      await navigate({ to: "/" });
    } catch {
      setMessage("Không kết nối được. Thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line bg-pink">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <span className="grid size-11 place-items-center rounded-2xl bg-surface text-accent shadow-sm">
            <img src="/mascots/pixel-slime.svg" alt="" aria-hidden="true" className="size-9" />
          </span>
          <div>
            <p className="text-lg font-semibold leading-tight text-accent">Thư viện tài liệu</p>
            <p className="text-sm text-muted">Dùng được trên mọi máy</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-pink p-1" role="tablist" aria-label="Kiểu đăng nhập">
            <button
              type="button"
              role="tab"
              aria-selected={!owner}
              className={`h-11 rounded-full text-sm font-semibold ${owner ? "text-fg" : "bg-surface text-accent"}`}
              onClick={() => {
                setTab("user");
                setMode("login");
                setMessage("");
              }}
            >
              User
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={owner}
              className={`h-11 rounded-full text-sm font-semibold ${owner ? "bg-surface text-accent" : "text-fg"}`}
              onClick={() => {
                setTab("owner");
                setMode("login");
                setMessage("");
              }}
            >
              Owner
            </button>
          </div>
          <h1 className="mb-1 text-2xl font-semibold">
            {owner ? "Đăng nhập Owner" : register ? "Đăng ký tài khoản" : "Đăng nhập"}
          </h1>
          <p className="mb-4 text-sm text-pretty text-muted">
            {owner
              ? "Mật khẩu được kiểm tra trên máy chủ. Sau lần vào đầu tiên, hãy đặt mật khẩu mới."
              : "Tài khoản lưu trên máy chủ, nên đổi điện thoại hay trình duyệt vẫn đăng nhập được."}
          </p>
          <form key={owner ? "owner" : mode} onSubmit={onSubmit} className="space-y-3">
            {register ? (
              <label className="block text-sm font-medium">
                Họ và tên
                <input
                  name="displayName"
                  required
                  autoComplete="name"
                  placeholder="VD: Tăng Nhật Huy"
                  aria-describedby="real-name-note"
                  className="mt-1 h-12 w-full rounded-xl border border-pink-deep bg-surface px-3 font-normal"
                />
                <span id="real-name-note" className="mt-1 block text-xs font-normal leading-snug text-danger">
                  Vui lòng nhập họ tên thật.
                </span>
              </label>
            ) : null}
            <label className="block text-sm font-medium">
              Tên đăng nhập
              <input
                name="username"
                required
                readOnly={owner}
                autoComplete="username"
                defaultValue={owner ? OWNER_USERNAME : undefined}
                placeholder={owner ? OWNER_USERNAME : "VD: Nhuy123"}
                className="mt-1 h-12 w-full rounded-xl border border-pink-deep bg-surface px-3 font-normal"
              />
            </label>
            <PasswordField register={register} />
            {message ? (
              <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">
                {message}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="h-12 w-full rounded-full bg-accent text-base font-semibold text-on-accent disabled:opacity-60"
            >
              {pending ? "Đang xử lý…" : register ? "Đăng ký" : "Đăng nhập"}
            </button>
          </form>
          {!owner ? (
            <p className="mt-4 text-center text-sm text-muted">
              {register ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
              <button
                type="button"
                className="font-semibold text-accent-2 underline"
                onClick={() => {
                  setMode(register ? "login" : "register");
                  setMessage("");
                }}
              >
                {register ? "Đăng nhập" : "Đăng ký"}
              </button>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export const LIBRARY_NOTICE_KEY = NOTICE_KEY;
