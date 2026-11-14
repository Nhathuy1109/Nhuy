import { createServerFn } from "@tanstack/react-start";
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  emptyFiles,
  isOwnerUsername,
  MAX_FILE_BYTES,
  memberEmail,
  nicknameProblem,
  normalizeUsername,
  ANONYMOUS_LABEL,
  OWNER_USERNAME,
  sectionById,
  type CommentItem,
  type FileMeta,
  type Leaderboard,
  type LeaderboardEntry,
  type LibraryNotice,
  type Member,
  type MySubmission,
  type MyStats,
  type Participant,
  type Person,
  type QuizSaved,
  type ReviewItem,
  type SectionId,
  type Subject,
  type UserStats,
} from "@/lib/library/ids";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; message: string; blocked?: boolean };

function fail(message: string, blocked = false): Err {
  return blocked ? { ok: false, message, blocked: true } : { ok: false, message };
}

type ProfileRow = {
  user_id: string;
  username: string;
  username_key: string;
  display_name: string;
  role: "owner" | "user";
  preview_owner: boolean;
  hide_from_leaderboard?: boolean;
  nickname?: string | null;
};

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

async function legacyEnabled(sql: Awaited<ReturnType<typeof getSql>>): Promise<boolean> {
  const rows = await sql<{ value: string }>`select value from settings where key = 'legacy_owner'`;
  return rows[0]?.value !== "off";
}

async function isBlocked(sql: Awaited<ReturnType<typeof getSql>>, usernameKey: string): Promise<boolean> {
  const rows = await sql<{ username: string }>`select username from blocks where username = ${usernameKey}`;
  return rows.length > 0;
}

function memberOf(row: ProfileRow, legacy: boolean): Member {
  return {
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    legacyEnabled: row.role === "owner" && legacy && !asBool(row.preview_owner),
    previewOwner: asBool(row.preview_owner),
    anonymous: asBool(row.hide_from_leaderboard),
    nickname: (row.nickname ?? "").trim(),
  };
}

async function ensureProfile(userId: string): Promise<{ ok: true; profile: ProfileRow; legacy: boolean } | Err> {
  const sql = await getSql();
  const legacy = await legacyEnabled(sql);
  const found = await sql<ProfileRow>`
    select user_id, username, username_key, display_name, role, preview_owner, hide_from_leaderboard, nickname
    from profiles where user_id = ${userId}
  `;
  if (found[0]) {
    if (await isBlocked(sql, found[0].username_key)) {
      return fail("Tài khoản này đã bị chặn.", true);
    }
    return { ok: true, profile: found[0], legacy };
  }

  const users = await sql<{ name: string; email: string }>`
    select name, email from "user" where id = ${userId}
  `;
  const user = users[0];
  if (!user) return fail("Không tìm thấy tài khoản.");

  const accounts = await sql<{ providerId: string }>`
    select "providerId" from account where "userId" = ${userId}
  `;
  const gate = accounts.some((account) => account.providerId === "grok-gate");
  const preview = !process.env.GROK_PROJECT_ID;
  const fromEmail = /^([a-z0-9_]{3,20})@members\.thuvien\.app$/.exec(user.email.toLowerCase());

  let username = fromEmail?.[1] ?? "";
  let role: "owner" | "user" = "user";
  let previewOwner = false;
  let displayName = (user.name || "").trim() || "Thành viên";

  if (gate && preview) {
    username = "ChuWeb";
    role = "owner";
    previewOwner = true;
    displayName = displayName === "Thành viên" ? "Chủ web" : displayName;
  } else if (!username) {
    const stem = userId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "user";
    username = `tv${stem}`.slice(0, 20);
  }

  if (isOwnerUsername(username) && role !== "owner") {
    return fail("Tài khoản chủ web chưa được kích hoạt.");
  }

  let key = username.toLowerCase();
  for (let n = 0; n < 20; n += 1) {
    const candidate = n === 0 ? username : `${username.slice(0, 16)}${n}`;
    const candidateKey = candidate.toLowerCase();
    const taken = await sql<{ username_key: string }>`
      select username_key from profiles where username_key = ${candidateKey}
    `;
    if (!taken[0] && !isOwnerUsername(candidate)) {
      username = candidate;
      key = candidateKey;
      break;
    }
  }

  if (await isBlocked(sql, key)) return fail("Tài khoản này đã bị chặn.", true);

  await sql`
    insert into profiles (user_id, username, username_key, display_name, role, preview_owner)
    values (${userId}, ${username}, ${key}, ${displayName.slice(0, 80)}, ${role}, ${previewOwner})
  `;
  const created = await sql<ProfileRow>`
    select user_id, username, username_key, display_name, role, preview_owner, hide_from_leaderboard, nickname
    from profiles where user_id = ${userId}
  `;
  if (!created[0]) return fail("Không tạo được hồ sơ.");
  return { ok: true, profile: created[0], legacy };
}

async function requireMember(userId: string): Promise<{ ok: true; profile: ProfileRow; legacy: boolean } | Err> {
  return ensureProfile(userId);
}

function requireOwner(access: { ok: true; profile: ProfileRow; legacy: boolean } | Err): access is {
  ok: true;
  profile: ProfileRow;
  legacy: boolean;
} {
  return access.ok && access.profile.role === "owner";
}

const usernameMessage = "Tên đăng nhập gồm 3-20 ký tự: chữ không dấu, số hoặc dấu gạch dưới.";

function cleanFileName(raw: string): string {
  return raw.trim().replace(/\\/g, "/").split("/").pop()?.replace(/\s+/g, " ") ?? "";
}

function validateUpload(data: {
  section: string;
  name: string;
  mime: string;
  body: string;
  bytes: number;
}): { ok: true; sectionId: SectionId; name: string; mime: string; bytes: number } | Err {
  const section = sectionById(data.section);
  if (!section) return fail("Mục tài liệu không hợp lệ.");
  const name = cleanFileName(data.name);
  if (!name || name.length > 180) return fail("Tên file không hợp lệ.");
  if (!Number.isFinite(data.bytes) || data.bytes <= 0 || data.bytes > MAX_FILE_BYTES) {
    return fail("File quá lớn (tối đa 3 MB).");
  }
  if (!data.body || data.body.length > 4_800_000) return fail("File quá lớn (tối đa 3 MB).");
  if (section.id === "practice") {
    if (!/\.html?$/i.test(name)) return fail("Mục thực hành chỉ nhận file .html.");
    if (data.body.startsWith("data:")) return fail("File thực hành không hợp lệ.");
  } else if (!data.body.startsWith("data:")) {
    return fail("Không đọc được file.");
  }
  const mime = section.id === "practice" ? "text/html" : data.mime.slice(0, 120);
  return { ok: true, sectionId: section.id, name, mime, bytes: Math.round(data.bytes) };
}

function uploadInput(input: unknown): {
  subjectId: string;
  section: string;
  name: string;
  mime: string;
  body: string;
  bytes: number;
} {
  const body = (input ?? {}) as {
    subjectId?: unknown;
    section?: unknown;
    name?: unknown;
    mime?: unknown;
    body?: unknown;
    bytes?: unknown;
  };
  return {
    subjectId: typeof body.subjectId === "string" ? body.subjectId : "",
    section: typeof body.section === "string" ? body.section : "",
    name: typeof body.name === "string" ? body.name : "",
    mime: typeof body.mime === "string" ? body.mime : "",
    body: typeof body.body === "string" ? body.body : "",
    bytes: typeof body.bytes === "number" ? body.bytes : 0,
  };
}

export const registerMember = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as { username?: unknown; password?: unknown; displayName?: unknown };
    return {
      username: typeof body.username === "string" ? body.username : "",
      password: typeof body.password === "string" ? body.password : "",
      displayName: typeof body.displayName === "string" ? body.displayName : "",
    };
  })
  .handler(async ({ data }): Promise<Ok<{ username: string }> | Err> => {
    const username = normalizeUsername(data.username);
    const displayName = data.displayName.trim().replace(/\s+/g, " ");
    if (!username) return fail(usernameMessage);
    if (isOwnerUsername(username)) {
      return fail("Tài khoản chủ web không đăng ký tại đây. Hãy mở tab Owner.");
    }
    if (displayName.length < 2 || displayName.length > 80) {
      return fail("Vui lòng nhập họ và tên (2–80 ký tự).");
    }
    if (data.password.length < 8 || data.password.length > 128) {
      return fail("Mật khẩu cần từ 8 đến 128 ký tự.");
    }
    const sql = await getSql();
    const key = username.toLowerCase();
    if (await isBlocked(sql, key)) return fail("Tên đăng nhập này đã bị chặn.");
    const taken = await sql<{ username_key: string }>`
      select username_key from profiles where username_key = ${key}
    `;
    if (taken[0]) return fail("Tên đăng nhập này đã có người dùng.");
    const email = memberEmail(username);
    const existing = await sql<{ id: string }>`select id from "user" where lower(email) = ${email}`;
    if (existing[0]) return fail("Tên đăng nhập này đã có người dùng.");

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(data.password);
    try {
      await sql`
        insert into "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt")
        values (${userId}, ${displayName}, ${email}, ${true}, ${null}, now(), now())
      `;
      await sql`
        insert into account ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
        values (${crypto.randomUUID()}, ${userId}, ${"credential"}, ${userId}, ${passwordHash}, now(), now())
      `;
      await sql`
        insert into profiles (user_id, username, username_key, display_name, role, preview_owner)
        values (${userId}, ${username}, ${key}, ${displayName}, ${"user"}, ${false})
      `;
    } catch {
      await sql`delete from "user" where id = ${userId}`;
      return fail("Không tạo được tài khoản. Thử một tên đăng nhập khác.");
    }
    return { ok: true, data: { username } };
  });

export const recoverOwner = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as { password?: unknown };
    return { password: typeof body.password === "string" ? body.password : "" };
  })
  .handler(async ({ data }): Promise<Ok<{ email: string }> | Err> => {
    const password = data.password;
    if (!password || password.length > 200) return fail("Sai tên đăng nhập hoặc mật khẩu Owner.");
    const { legacyOwnerPasswordMatches } = await import("@/lib/library/owner.server");
    const matches = await legacyOwnerPasswordMatches(password);
    const sql = await getSql();
    const legacy = await legacyEnabled(sql);
    if (!matches || !legacy) return fail("Sai tên đăng nhập hoặc mật khẩu Owner.");

    const email = memberEmail(OWNER_USERNAME);
    const passwordHash = await hashPassword(password);
    const existing = await sql<{ id: string }>`select id from "user" where lower(email) = ${email}`;
    let userId = existing[0]?.id;
    if (!userId) {
      userId = crypto.randomUUID();
      await sql`
        insert into "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt")
        values (${userId}, ${"Owner"}, ${email}, ${true}, ${null}, now(), now())
      `;
      await sql`
        insert into account ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
        values (${crypto.randomUUID()}, ${userId}, ${"credential"}, ${userId}, ${passwordHash}, now(), now())
      `;
    } else {
      const accounts = await sql<{ id: string }>`
        select id from account where "userId" = ${userId} and "providerId" = ${"credential"}
      `;
      if (accounts[0]) {
        await sql`
          update account set password = ${passwordHash}, "updatedAt" = now()
          where "userId" = ${userId} and "providerId" = ${"credential"}
        `;
      } else {
        await sql`
          insert into account ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
          values (${crypto.randomUUID()}, ${userId}, ${"credential"}, ${userId}, ${passwordHash}, now(), now())
        `;
      }
      await sql`delete from "session" where "userId" = ${userId}`;
    }

    const key = OWNER_USERNAME.toLowerCase();
    const profile = await sql<{ user_id: string }>`select user_id from profiles where user_id = ${userId}`;
    if (profile[0]) {
      await sql`
        update profiles
        set username = ${OWNER_USERNAME}, username_key = ${key}, role = ${"owner"}, preview_owner = ${false}
        where user_id = ${userId}
      `;
    } else {
      await sql`
        insert into profiles (user_id, username, username_key, display_name, role, preview_owner)
        values (${userId}, ${OWNER_USERNAME}, ${key}, ${"Owner"}, ${"owner"}, ${false})
      `;
    }
    return { ok: true, data: { email } };
  });

export const loadLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<
    Ok<{
      me: Member;
      subjects: Subject[];
      pendingReviews: number;
      resetRequests: number;
      mySubmissions: MySubmission[];
      favorites: string[];
      bests: Record<string, number>;
    }> | Err
  > => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    const sql = await getSql();
    const subjectRows = await sql<{ id: string; name: string }>`
      select id, name from subjects order by created_at asc, name asc
    `;
    const fileRows = await sql<{
      id: string;
      subject_id: string;
      section: SectionId;
      name: string;
      mime: string;
      bytes: number;
      created: string;
    }>`
      select id, subject_id, section, name, mime, bytes,
             to_char(created_at, 'DD/MM/YYYY') as created
      from documents
      order by created_at asc
    `;
    const subjects: Subject[] = subjectRows.map((subject) => ({
      id: subject.id,
      name: subject.name,
      files: emptyFiles(),
    }));
    const byId = new Map(subjects.map((subject) => [subject.id, subject]));
    for (const file of fileRows) {
      const subject = byId.get(file.subject_id);
      if (!subject || !subject.files[file.section]) continue;
      const meta: FileMeta = {
        id: file.id,
        name: file.name,
        mime: file.mime,
        bytes: Number(file.bytes) || 0,
        created: file.created,
        section: file.section,
      };
      subject.files[file.section].push(meta);
    }
    const mine = await sql<{
      id: string;
      subject_name: string;
      section: SectionId;
      name: string;
      status: MySubmission["status"];
      created: string;
    }>`
      select s.id, sub.name as subject_name, s.section, s.name, s.status,
             to_char(s.created_at, 'DD/MM/YYYY HH24:MI') as created
      from submissions s
      join subjects sub on sub.id = s.subject_id
      where s.user_id = ${access.profile.user_id}
      order by case when s.status = 'pending' then 0 else 1 end, s.created_at desc
    `;
    let pendingReviews = 0;
    let resetRequests = 0;
    if (access.profile.role === "owner") {
      const resets = await sql<{ n: number }>`select count(*) as n from password_requests`;
      resetRequests = Number(resets[0]?.n ?? 0);
      const counts = await sql<{ n: number }>`
        select count(*) as n from submissions where status = 'pending'
      `;
      pendingReviews = Number(counts[0]?.n ?? 0);
    }
    const mySubmissions: MySubmission[] = mine.map((row) => ({
      id: row.id,
      subjectName: row.subject_name,
      section: row.section,
      name: row.name,
      status: row.status,
      created: row.created,
    }));
    const favoriteRows = await sql<{ document_id: string }>`
      select document_id from favorites
      where user_id = ${access.profile.user_id}
      order by created_at desc
    `;
    const bestRows = await sql<{ document_id: string; pct: number }>`
      select document_id, round(max(score::float / total) * 100)::int as pct
      from quiz_results
      where user_id = ${access.profile.user_id}
      group by document_id
    `;
    const bests: Record<string, number> = {};
    for (const row of bestRows) bests[row.document_id] = Number(row.pct) || 0;
    return {
      ok: true,
      data: {
        me: memberOf(access.profile, access.legacy),
        subjects,
        pendingReviews,
        resetRequests,
        mySubmissions,
        favorites: favoriteRows.map((row) => row.document_id),
        bests,
      },
    };
  });

export const readDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { id?: unknown };
    return { id: typeof body.id === "string" ? body.id : "" };
  })
  .handler(async ({ context, data }): Promise<Ok<{ name: string; mime: string; section: SectionId; body: string }> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    if (!data.id) return fail("Không tìm thấy tài liệu.");
    const sql = await getSql();
    const rows = await sql<{ name: string; mime: string; section: SectionId; body: string }>`
      select name, mime, section, body from documents where id = ${data.id}
    `;
    const row = rows[0];
    if (!row) return fail("Không tìm thấy tài liệu.");
    return { ok: true, data: row };
  });

export const addSubject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { name?: unknown };
    return { name: typeof body.name === "string" ? body.name : "" };
  })
  .handler(async ({ context, data }): Promise<Ok<{ id: string }> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới thêm được môn học.") : access;
    const name = data.name.trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > 80) return fail("Tên môn học cần từ 1 đến 80 ký tự.");
    const sql = await getSql();
    const id = crypto.randomUUID();
    await sql`insert into subjects (id, name) values (${id}, ${name})`;
    return { ok: true, data: { id } };
  });

export const deleteSubject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { id?: unknown };
    return { id: typeof body.id === "string" ? body.id : "" };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới xóa được môn học.") : access;
    if (!data.id) return fail("Không tìm thấy môn học.");
    const sql = await getSql();
    await sql`delete from subjects where id = ${data.id}`;
    return { ok: true, data: null };
  });

export const addDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(uploadInput)
  .handler(async ({ context, data }): Promise<Ok<{ id: string }> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới tải tài liệu lên.") : access;
    const upload = validateUpload(data);
    if (!upload.ok) return upload;
    const sql = await getSql();
    const subjects = await sql<{ id: string }>`select id from subjects where id = ${data.subjectId}`;
    if (!subjects[0]) return fail("Không tìm thấy môn học.");
    const id = crypto.randomUUID();
    await sql`
      insert into documents (id, subject_id, section, name, mime, body, bytes)
      values (${id}, ${data.subjectId}, ${upload.sectionId}, ${upload.name}, ${upload.mime}, ${data.body}, ${upload.bytes})
    `;
    return { ok: true, data: { id } };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { id?: unknown };
    return { id: typeof body.id === "string" ? body.id : "" };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới xóa được tài liệu.") : access;
    if (!data.id) return fail("Không tìm thấy tài liệu.");
    const sql = await getSql();
    await sql`delete from documents where id = ${data.id}`;
    return { ok: true, data: null };
  });

export const updateDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { id?: unknown; name?: unknown; subjectId?: unknown };
    return {
      id: typeof body.id === "string" ? body.id : "",
      name: typeof body.name === "string" ? body.name : "",
      subjectId: typeof body.subjectId === "string" ? body.subjectId : "",
    };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới sửa được tài liệu.") : access;
    if (!data.id) return fail("Không tìm thấy tài liệu.");
    const sql = await getSql();
    const rows = await sql<{ name: string; section: SectionId; subject_id: string }>`
      select name, section, subject_id from documents where id = ${data.id}
    `;
    const row = rows[0];
    if (!row) return fail("Không tìm thấy tài liệu.");

    let name = cleanFileName(data.name || row.name);
    if (!name || name.length > 180) return fail("Tên file không hợp lệ.");
    // Giữ đuôi file: nếu tên mới không có đuôi thì lấy lại đuôi cũ.
    if (!/\.[A-Za-z0-9]{1,8}$/.test(name)) {
      const oldExt = /\.[A-Za-z0-9]{1,8}$/.exec(row.name)?.[0] ?? "";
      name = `${name}${oldExt}`;
    }
    if (row.section === "practice" && !/\.html?$/i.test(name)) {
      return fail("Đề thực hành phải giữ đuôi .html.");
    }
    if (name.length > 180) return fail("Tên file không hợp lệ.");

    const targetSubject = data.subjectId || row.subject_id;
    const subjects = await sql<{ id: string; name: string }>`select id, name from subjects where id = ${targetSubject}`;
    const subject = subjects[0];
    if (!subject) return fail("Không tìm thấy môn học.");

    await sql`update documents set name = ${name}, subject_id = ${subject.id} where id = ${data.id}`;
    // Giữ lịch sử thống kê khớp với tên và môn mới.
    await sql`
      update activity set document_name = ${name}, subject_name = ${subject.name}
      where document_id = ${data.id}
    `;
    return { ok: true, data: null };
  });

export const listPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Ok<Person[]> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới xem được danh sách.") : access;
    const sql = await getSql();
    const profiles = await sql<{
      username: string;
      display_name: string;
      role: "owner" | "user";
      created: string;
      blocked: boolean;
      reset_requested: boolean;
    }>`
      select p.username, p.display_name, p.role,
             to_char(p.created_at, 'DD/MM/YYYY') as created,
             exists(select 1 from blocks b where b.username = p.username_key) as blocked,
             exists(select 1 from password_requests r where r.username_key = p.username_key) as reset_requested
      from profiles p
      order by p.created_at asc
    `;
    const extras = await sql<{ username: string; created: string }>`
      select b.username, to_char(b.created_at, 'DD/MM/YYYY') as created
      from blocks b
      where not exists (select 1 from profiles p where p.username_key = b.username)
      order by b.created_at asc
    `;
    const people: Person[] = profiles.map((person) => ({
      username: person.username,
      displayName: person.display_name,
      created: person.created,
      blocked: asBool(person.blocked),
      registered: true,
      role: person.role,
      resetRequested: asBool(person.reset_requested),
    }));
    for (const extra of extras) {
      people.push({
        username: extra.username,
        displayName: extra.username,
        created: extra.created,
        blocked: true,
        registered: false,
        role: "unknown",
        resetRequested: false,
      });
    }
    return { ok: true, data: people };
  });

export const setBlock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { username?: unknown; blocked?: unknown };
    return {
      username: typeof body.username === "string" ? body.username : "",
      blocked: body.blocked === true,
    };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới chặn được người dùng.") : access;
    const username = normalizeUsername(data.username);
    if (!username) return fail(usernameMessage);
    if (isOwnerUsername(username)) return fail("Không thể chặn tài khoản chủ web.");
    const sql = await getSql();
    const key = username.toLowerCase();
    if (data.blocked) {
      await sql`insert into blocks (username) values (${key}) on conflict (username) do nothing`;
    } else {
      await sql`delete from blocks where username = ${key}`;
    }
    return { ok: true, data: null };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as { username?: unknown };
    return { username: typeof body.username === "string" ? body.username : "" };
  })
  .handler(async ({ data }): Promise<Ok<null> | Err> => {
    const username = normalizeUsername(data.username);
    if (!username) return fail(usernameMessage);
    // Luôn trả về cùng một kết quả để người lạ không dò được tên đăng nhập nào tồn tại.
    if (isOwnerUsername(username)) return { ok: true, data: null };
    const sql = await getSql();
    const key = username.toLowerCase();
    const found = await sql<{ username: string }>`
      select username from profiles where username_key = ${key} and role = ${"user"}
    `;
    if (found[0]) {
      await sql`
        insert into password_requests (username_key, username)
        values (${key}, ${found[0].username})
        on conflict (username_key) do nothing
      `;
    }
    return { ok: true, data: null };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { username?: unknown; password?: unknown };
    return {
      username: typeof body.username === "string" ? body.username : "",
      password: typeof body.password === "string" ? body.password : "",
    };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới đặt lại được mật khẩu.") : access;
    const username = normalizeUsername(data.username);
    if (!username) return fail(usernameMessage);
    if (isOwnerUsername(username)) return fail("Không đặt lại mật khẩu chủ web tại đây.");
    if (data.password.length < 8 || data.password.length > 128) {
      return fail("Mật khẩu mới cần từ 8 đến 128 ký tự.");
    }
    const sql = await getSql();
    const key = username.toLowerCase();
    const requested = await sql<{ username_key: string }>`
      select username_key from password_requests where username_key = ${key}
    `;
    if (!requested[0]) return fail("Người dùng này chưa gửi yêu cầu đặt lại mật khẩu.");
    const target = await sql<{ user_id: string }>`
      select user_id from profiles where username_key = ${key} and role = ${"user"}
    `;
    const userId = target[0]?.user_id;
    if (!userId) return fail("Không tìm thấy người dùng.");
    const passwordHash = await hashPassword(data.password);
    const accounts = await sql<{ id: string }>`
      select id from account where "userId" = ${userId} and "providerId" = ${"credential"}
    `;
    if (accounts[0]) {
      await sql`
        update account set password = ${passwordHash}, "updatedAt" = now()
        where "userId" = ${userId} and "providerId" = ${"credential"}
      `;
    } else {
      await sql`
        insert into account ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
        values (${crypto.randomUUID()}, ${userId}, ${"credential"}, ${userId}, ${passwordHash}, now(), now())
      `;
    }
    await sql`delete from "session" where "userId" = ${userId}`;
    await sql`delete from password_requests where username_key = ${key}`;
    return { ok: true, data: null };
  });

export const changeOwnerPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { password?: unknown };
    return { password: typeof body.password === "string" ? body.password : "" };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới đổi được mật khẩu này.") : access;
    if (asBool(access.profile.preview_owner)) {
      return fail("Đây là phiên xem trước. Hãy đổi mật khẩu sau khi đăng nhập Owner trên trang đã xuất bản.");
    }
    if (data.password.length < 8 || data.password.length > 128) {
      return fail("Mật khẩu mới cần từ 8 đến 128 ký tự.");
    }
    const sql = await getSql();
    const passwordHash = await hashPassword(data.password);
    const accounts = await sql<{ id: string }>`
      select id from account where "userId" = ${context.userId} and "providerId" = ${"credential"}
    `;
    if (!accounts[0]) return fail("Tài khoản này không có mật khẩu để đổi.");
    await sql`
      update account set password = ${passwordHash}, "updatedAt" = now()
      where "userId" = ${context.userId} and "providerId" = ${"credential"}
    `;
    await sql`
      insert into settings (key, value) values ('legacy_owner', 'off')
      on conflict (key) do update set value = 'off'
    `;
    return { ok: true, data: null };
  });

export const submitDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(uploadInput)
  .handler(async ({ context, data }): Promise<Ok<{ id: string }> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    const upload = validateUpload(data);
    if (!upload.ok) return upload;
    const sql = await getSql();
    const subjects = await sql<{ id: string }>`select id from subjects where id = ${data.subjectId}`;
    if (!subjects[0]) return fail("Không tìm thấy môn học.");
    const id = crypto.randomUUID();
    await sql`
      insert into submissions (id, user_id, subject_id, section, name, mime, body, bytes, status)
      values (
        ${id}, ${access.profile.user_id}, ${data.subjectId}, ${upload.sectionId},
        ${upload.name}, ${upload.mime}, ${data.body}, ${upload.bytes}, ${"pending"}
      )
    `;
    return { ok: true, data: { id } };
  });

export const listReview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Ok<ReviewItem[]> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới xét duyệt được.") : access;
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      subject_name: string;
      section: SectionId;
      name: string;
      bytes: number;
      created: string;
      author_name: string;
      author_username: string;
    }>`
      select s.id, sub.name as subject_name, s.section, s.name, s.bytes,
             to_char(s.created_at, 'DD/MM/YYYY HH24:MI') as created,
             p.display_name as author_name, p.username as author_username
      from submissions s
      join subjects sub on sub.id = s.subject_id
      join profiles p on p.user_id = s.user_id
      where s.status = 'pending'
      order by s.created_at asc
    `;
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        subjectName: row.subject_name,
        section: row.section,
        name: row.name,
        bytes: Number(row.bytes) || 0,
        created: row.created,
        authorName: row.author_name,
        authorUsername: row.author_username,
      })),
    };
  });

export const readSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { id?: unknown };
    return { id: typeof body.id === "string" ? body.id : "" };
  })
  .handler(async ({ context, data }): Promise<
    Ok<{ name: string; mime: string; section: SectionId; body: string }> | Err
  > => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới xem được bản chờ duyệt.") : access;
    if (!data.id) return fail("Không tìm thấy tài liệu.");
    const sql = await getSql();
    const rows = await sql<{ name: string; mime: string; section: SectionId; body: string }>`
      select name, mime, section, body from submissions where id = ${data.id} and status = 'pending'
    `;
    const row = rows[0];
    if (!row) return fail("Không tìm thấy tài liệu chờ duyệt.");
    return { ok: true, data: row };
  });

export const reviewSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { id?: unknown; approve?: unknown };
    return { id: typeof body.id === "string" ? body.id : "", approve: body.approve === true };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới xét duyệt được.") : access;
    if (!data.id) return fail("Không tìm thấy tài liệu.");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      subject_id: string;
      section: SectionId;
      name: string;
      mime: string;
      body: string;
      bytes: number;
    }>`
      select id, subject_id, section, name, mime, body, bytes
      from submissions where id = ${data.id} and status = 'pending'
    `;
    const row = rows[0];
    if (!row) return fail("Tài liệu này đã được xử lý.");
    let documentId: string | null = null;
    if (data.approve) {
      documentId = crypto.randomUUID();
      await sql`
        insert into documents (id, subject_id, section, name, mime, body, bytes)
        values (
          ${documentId}, ${row.subject_id}, ${row.section}, ${row.name},
          ${row.mime}, ${row.body}, ${Number(row.bytes) || 0}
        )
      `;
    }
    const updated = await sql<{ id: string }>`
      update submissions
      set status = ${data.approve ? "approved" : "rejected"},
          reviewed_at = now(),
          notify_pending = true,
          document_id = ${documentId}
      where id = ${row.id} and status = 'pending'
      returning id
    `;
    if (!updated[0]) {
      if (documentId) await sql`delete from documents where id = ${documentId}`;
      return fail("Tài liệu này đã được xử lý.");
    }
    return { ok: true, data: null };
  });

export const listNotices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Ok<LibraryNotice[]> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; status: string; subject_name: string }>`
      select s.id, s.name, s.status, sub.name as subject_name
      from submissions s
      join subjects sub on sub.id = s.subject_id
      where s.user_id = ${access.profile.user_id} and s.notify_pending = true
      order by s.reviewed_at asc
    `;
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        message:
          row.status === "approved"
            ? `Tài liệu “${row.name}” (${row.subject_name}) đã được duyệt và công khai.`
            : `Tài liệu “${row.name}” (${row.subject_name}) không được duyệt.`,
      })),
    };
  });

export const ackNotices = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    const sql = await getSql();
    await sql`
      update submissions set notify_pending = false
      where user_id = ${access.profile.user_id} and notify_pending = true
    `;
    return { ok: true, data: null };
  });

export const listComments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { documentId?: unknown };
    return { documentId: typeof body.documentId === "string" ? body.documentId : "" };
  })
  .handler(async ({ context, data }): Promise<Ok<CommentItem[]> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    if (!data.documentId) return fail("Không tìm thấy bài.");
    const sql = await getSql();
    const docs = await sql<{ section: SectionId }>`
      select section from documents where id = ${data.documentId}
    `;
    if (docs[0]?.section !== "practice") return fail("Bài này không có bình luận.");
    const rows = await sql<{
      id: string;
      body: string;
      created: string;
      author: string;
      nickname: string | null;
      role: "owner" | "user";
      user_id: string;
    }>`
      select c.id, c.body, to_char(c.created_at, 'DD/MM/YYYY HH24:MI') as created,
             p.display_name as author, p.nickname, p.role, c.user_id
      from comments c
      join profiles p on p.user_id = c.user_id
      where c.document_id = ${data.documentId}
      order by c.created_at asc
      limit 200
    `;
    const owner = access.profile.role === "owner";
    return {
      ok: true,
      data: rows.map((row): CommentItem => {
        const byOwner = row.role === "owner";
        const nick = (row.nickname ?? "").trim();
        // Biệt danh được che ở server: chỉ chủ web nhận thêm tên thật.
        const useNick = !byOwner && nick.length > 0;
        return {
          id: row.id,
          author: useNick ? nick : row.author,
          ...(useNick && owner ? { realName: row.author } : {}),
          body: row.body,
          created: row.created,
          canDelete: owner || row.user_id === access.profile.user_id,
          mine: row.user_id === access.profile.user_id,
          byOwner,
        };
      }),
    };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { documentId?: unknown; body?: unknown };
    return {
      documentId: typeof body.documentId === "string" ? body.documentId : "",
      body: typeof body.body === "string" ? body.body : "",
    };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    const text = data.body.trim().replace(/\s+/g, " ");
    if (!text) return fail("Hãy viết bình luận.");
    if (text.length > 500) return fail("Bình luận tối đa 500 ký tự.");
    const sql = await getSql();
    const docs = await sql<{ section: SectionId }>`
      select section from documents where id = ${data.documentId}
    `;
    if (docs[0]?.section !== "practice") return fail("Chỉ bài thực hành mới có bình luận.");
    await sql`
      insert into comments (id, document_id, user_id, body)
      values (${crypto.randomUUID()}, ${data.documentId}, ${access.profile.user_id}, ${text})
    `;
    return { ok: true, data: null };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { id?: unknown };
    return { id: typeof body.id === "string" ? body.id : "" };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    if (!data.id) return fail("Không tìm thấy bình luận.");
    const sql = await getSql();
    if (access.profile.role === "owner") {
      await sql`delete from comments where id = ${data.id}`;
    } else {
      await sql`delete from comments where id = ${data.id} and user_id = ${access.profile.user_id}`;
    }
    return { ok: true, data: null };
  });

export const setNickname = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { nickname?: unknown };
    return { nickname: typeof body.nickname === "string" ? body.nickname : "" };
  })
  .handler(async ({ context, data }): Promise<Ok<{ nickname: string }> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    if (access.profile.role === "owner") return fail("Chủ web luôn bình luận bằng tên thật.");
    const nickname = data.nickname.trim().replace(/\s+/g, " ");
    const sql = await getSql();
    if (!nickname) {
      await sql`update profiles set nickname = null where user_id = ${access.profile.user_id}`;
      return { ok: true, data: { nickname: "" } };
    }
    const problem = nicknameProblem(nickname);
    if (problem) return fail(problem);
    const taken = await sql<{ user_id: string }>`
      select user_id from profiles
      where lower(nickname) = ${nickname.toLowerCase()} and user_id <> ${access.profile.user_id}
    `;
    if (taken[0]) return fail("Biệt danh này đã có người dùng. Hãy chọn tên khác.");
    try {
      await sql`update profiles set nickname = ${nickname} where user_id = ${access.profile.user_id}`;
    } catch {
      return fail("Biệt danh này đã có người dùng. Hãy chọn tên khác.");
    }
    return { ok: true, data: { nickname } };
  });

export const setFavorite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { documentId?: unknown; on?: unknown };
    return { documentId: typeof body.documentId === "string" ? body.documentId : "", on: body.on === true };
  })
  .handler(async ({ context, data }): Promise<Ok<{ on: boolean }> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    if (!data.documentId) return fail("Không tìm thấy tài liệu.");
    const sql = await getSql();
    if (data.on) {
      const docs = await sql<{ id: string }>`select id from documents where id = ${data.documentId}`;
      if (!docs[0]) return fail("Không tìm thấy tài liệu.");
      await sql`
        insert into favorites (user_id, document_id) values (${access.profile.user_id}, ${data.documentId})
        on conflict (user_id, document_id) do nothing
      `;
    } else {
      await sql`delete from favorites where user_id = ${access.profile.user_id} and document_id = ${data.documentId}`;
    }
    return { ok: true, data: { on: data.on } };
  });

/**
 * Lưu kết quả một lần làm đề. Đề HTML gửi điểm về trang cha; xếp hạng dùng điểm
 * cao nhất của từng đề. Chủ web làm thử thì không lưu.
 */
export const saveQuizResult = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { documentId?: unknown; score?: unknown; total?: unknown };
    return {
      documentId: typeof body.documentId === "string" ? body.documentId : "",
      score: typeof body.score === "number" ? body.score : Number.NaN,
      total: typeof body.total === "number" ? body.total : Number.NaN,
    };
  })
  .handler(async ({ context, data }): Promise<Ok<QuizSaved> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    const score = Math.round(data.score);
    const total = Math.round(data.total);
    if (
      !data.documentId ||
      !Number.isFinite(score) ||
      !Number.isFinite(total) ||
      total < 1 ||
      total > 1000 ||
      score < 0 ||
      score > total
    ) {
      return fail("Kết quả không hợp lệ.");
    }
    const sql = await getSql();
    const docs = await sql<{ section: SectionId }>`select section from documents where id = ${data.documentId}`;
    if (docs[0]?.section !== "practice") return fail("Đây không phải đề thực hành.");
    const percent = Math.round((score / total) * 100);
    if (access.profile.role === "owner") {
      return { ok: true, data: { saved: false, score, total, percent, best: percent, improved: false } };
    }
    const userId = access.profile.user_id;
    const previous = await sql<{ best: number | null }>`
      select max(score::float / total) as best
      from quiz_results where user_id = ${userId} and document_id = ${data.documentId}
    `;
    const rawBest = previous[0]?.best;
    const previousBest = rawBest === null || rawBest === undefined ? null : Math.round(Number(rawBest) * 100);
    // Tránh ghi trùng khi trang đề gửi cùng một kết quả hai lần liên tiếp.
    const duplicate = await sql<{ id: string }>`
      select id from quiz_results
      where user_id = ${userId} and document_id = ${data.documentId}
        and score = ${score} and total = ${total}
        and created_at > now() - interval '8 seconds'
      limit 1
    `;
    if (!duplicate[0]) {
      await sql`
        insert into quiz_results (id, user_id, document_id, score, total)
        values (${crypto.randomUUID()}, ${userId}, ${data.documentId}, ${score}, ${total})
      `;
    }
    return {
      ok: true,
      data: {
        saved: true,
        score,
        total,
        percent,
        best: Math.max(percent, previousBest ?? 0),
        improved: previousBest === null || percent > previousBest,
      },
    };
  });

export const trackUse = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { id?: unknown; kind?: unknown };
    return {
      id: typeof body.id === "string" ? body.id : "",
      kind: body.kind === "attempt" ? "attempt" : "download",
    };
  })
  .handler(async ({ context, data }): Promise<Ok<null> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    if (!data.id) return fail("Không tìm thấy tài liệu.");
    const sql = await getSql();
    const rows = await sql<{ name: string; section: SectionId; subject_name: string }>`
      select d.name, d.section, s.name as subject_name
      from documents d
      join subjects s on s.id = d.subject_id
      where d.id = ${data.id}
    `;
    const row = rows[0];
    if (!row) return fail("Không tìm thấy tài liệu.");
    if (data.kind === "attempt" && row.section !== "practice") return fail("Đây không phải đề thực hành.");
    await sql`
      insert into activity (id, user_id, kind, document_id, subject_name, document_name, section)
      values (
        ${crypto.randomUUID()}, ${access.profile.user_id}, ${data.kind}, ${data.id},
        ${row.subject_name}, ${row.name}, ${row.section}
      )
    `;
    return { ok: true, data: null };
  });

export const listParticipants = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Ok<Participant[]> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới xem được mục này.") : access;
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      username: string;
      display_name: string;
      role: "owner" | "user";
      blocked: boolean;
    }>`
      select p.user_id, p.username, p.display_name, p.role,
             exists(select 1 from blocks b where b.username = p.username_key) as blocked
      from profiles p
      order by p.display_name asc, p.username asc
    `;
    return {
      ok: true,
      data: rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        blocked: asBool(row.blocked),
      })),
    };
  });

export const userActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { userId?: unknown };
    return { userId: typeof body.userId === "string" ? body.userId : "" };
  })
  .handler(async ({ context, data }): Promise<Ok<UserStats> | Err> => {
    const access = await requireMember(context.userId);
    if (!requireOwner(access)) return access.ok ? fail("Chỉ chủ web mới xem được mục này.") : access;
    if (!data.userId || data.userId.length > 80) return fail("Không tìm thấy người dùng.");
    const sql = await getSql();
    const people = await sql<{ display_name: string; username: string }>`
      select display_name, username from profiles where user_id = ${data.userId}
    `;
    const person = people[0];
    if (!person) return fail("Không tìm thấy người dùng.");
    const downloads = await sql<{ n: number }>`
      select count(*) as n from activity where user_id = ${data.userId} and kind = 'download'
    `;
    const subjects = await sql<{ subject_name: string; n: number }>`
      select subject_name, count(*) as n
      from activity
      where user_id = ${data.userId} and kind = 'download'
      group by subject_name
      order by count(*) desc, subject_name asc
    `;
    const quizzes = await sql<{ subject_name: string; document_name: string; n: number }>`
      select subject_name, document_name, count(*) as n
      from activity
      where user_id = ${data.userId} and kind = 'attempt'
      group by subject_name, document_name
      order by subject_name asc, document_name asc
    `;
    return {
      ok: true,
      data: {
        displayName: person.display_name,
        username: person.username,
        downloads: Number(downloads[0]?.n ?? 0),
        subjects: subjects.map((row) => ({ name: row.subject_name, downloads: Number(row.n) })),
        quizzes: quizzes.map((row) => ({
          subject: row.subject_name,
          name: row.document_name,
          attempts: Number(row.n),
        })),
      },
    };
  });

export const myStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Ok<MyStats> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    const sql = await getSql();
    const userId = access.profile.user_id;
    const downloads = await sql<{ n: number }>`
      select count(*) as n from activity where user_id = ${userId} and kind = 'download'
    `;
    const results = await sql<{ attempts: number; quizzes: number; points: number }>`
      select coalesce(sum(tries), 0) as attempts,
             count(*) as quizzes,
             coalesce(round(sum(pct) * 100), 0)::int as points
      from (
        select document_id, max(score::float / total) as pct, count(*) as tries
        from quiz_results where user_id = ${userId}
        group by document_id
      ) t
    `;
    return {
      ok: true,
      data: {
        downloads: Number(downloads[0]?.n ?? 0),
        attempts: Number(results[0]?.attempts ?? 0),
        quizzes: Number(results[0]?.quizzes ?? 0),
        points: Number(results[0]?.points ?? 0),
      },
    };
  });

export const setAnonymous = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = (input ?? {}) as { anonymous?: unknown };
    return { anonymous: body.anonymous === true };
  })
  .handler(async ({ context, data }): Promise<Ok<{ anonymous: boolean }> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    if (access.profile.role === "owner") return fail("Chủ web không nằm trong bảng xếp hạng.");
    const sql = await getSql();
    await sql`
      update profiles set hide_from_leaderboard = ${data.anonymous}
      where user_id = ${access.profile.user_id}
    `;
    return { ok: true, data: { anonymous: data.anonymous } };
  });

/**
 * Bảng xếp hạng theo điểm làm đề: mỗi đề tính điểm cao nhất (%) của người đó,
 * cộng lại trên mọi đề. Việc ẩn tên diễn ra ở server: người đang ẩn danh chỉ
 * hiện tên thật với chủ web và với chính họ, người khác không nhận được tên hay
 * tên đăng nhập trong dữ liệu trả về.
 */
export const loadLeaderboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Ok<Leaderboard> | Err> => {
    const access = await requireMember(context.userId);
    if (!access.ok) return access;
    const viewerIsOwner = access.profile.role === "owner";
    const viewerId = access.profile.user_id;
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      username: string;
      display_name: string;
      hide_from_leaderboard: boolean;
      points: number;
      quizzes: number;
      attempts: number;
    }>`
      select p.user_id, p.username, p.display_name, p.hide_from_leaderboard,
             round(sum(b.pct) * 100)::int as points,
             count(*) as quizzes,
             sum(b.tries) as attempts
      from profiles p
      join (
        select user_id, document_id, max(score::float / total) as pct, count(*) as tries
        from quiz_results
        group by user_id, document_id
      ) b on b.user_id = p.user_id
      where p.role = 'user'
        and not exists (select 1 from blocks bl where bl.username = p.username_key)
      group by p.user_id, p.username, p.display_name, p.hide_from_leaderboard
      order by points desc, quizzes desc, p.display_name asc, p.username asc
    `;

    let lastKey = "";
    let lastRank = 0;
    const all: LeaderboardEntry[] = rows.map((row, index) => {
      const points = Number(row.points);
      const quizzes = Number(row.quizzes);
      const key = `${points}:${quizzes}`;
      if (key !== lastKey) {
        lastKey = key;
        lastRank = index + 1;
      }
      const anonymous = asBool(row.hide_from_leaderboard);
      const isMe = row.user_id === viewerId;
      const reveal = !anonymous || viewerIsOwner || isMe;
      return {
        rank: lastRank,
        name: reveal ? row.display_name : ANONYMOUS_LABEL,
        ...(reveal ? { username: row.username } : {}),
        points,
        quizzes,
        attempts: Number(row.attempts),
        average: quizzes > 0 ? Math.round(points / quizzes) : 0,
        isMe,
        anonymous,
      };
    });

    return {
      ok: true,
      data: {
        entries: all.slice(0, 50),
        me: all.find((entry) => entry.isMe) ?? null,
        total: all.length,
        viewerIsOwner,
      },
    };
  });
