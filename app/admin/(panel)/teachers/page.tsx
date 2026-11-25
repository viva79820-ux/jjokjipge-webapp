import { Suspense } from "react";
import { connection } from "next/server";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import {
  grantTeacher,
  listTeachers,
  lookupMember,
  revokeTeacher,
} from "@/lib/lectures/admin";

export const instant = false;

const results: Record<string, string> = {
  granted: "선생님 권한을 줬어요.",
  revoked:
    "선생님 권한을 회수했어요. 이미 만든 강의는 남아 있고, 필요하면 비공개로 바꿔 주세요.",
  already: "이미 선생님 권한이 있어요.",
  missing: "회수할 선생님 권한이 없어요.",
  unavailable: "권한을 바꾸지 못했어요. 다시 시도해 주세요.",
  denied: "관리자 권한이 필요해요.",
};

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; result?: string }>;
}) {
  return (
    <Suspense fallback={<p role="status">선생님 권한을 확인하고 있어요.</p>}>
      <TeachersPage searchParams={searchParams} />
    </Suspense>
  );
}

async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; result?: string }>;
}) {
  await connection();
  const admin = await requireAdmin();
  if (!admin) return <AdminAccessDenied />;
  const query = await searchParams;
  const email = typeof query.email === "string" ? query.email : "";
  const result = typeof query.result === "string" ? query.result : "";
  const found = email ? await lookupMember(email) : null;
  const teachers = await listTeachers();
  return (
    <div className="min-w-0">
      <h1 className="text-title font-bold">선생님 권한</h1>
      <p className="mt-2 text-caption text-muted">
        이메일로 회원을 찾아 선생님 권한을 주거나 회수해요. 관리자 역할은 바뀌지
        않아요.
      </p>
      {results[result] ? (
        <p role="status" className="mt-3 text-body text-foreground">
          {results[result]}
        </p>
      ) : null}
      <form method="get" className="mt-5 min-w-0">
        <label htmlFor="teacher-email" className="text-label font-bold">
          회원 이메일
        </label>
        <input
          id="teacher-email"
          name="email"
          type="email"
          defaultValue={email}
          autoComplete="off"
          className="mt-1 w-full min-h-11 min-w-0 rounded-input border border-border bg-surface px-3 text-body"
        />
        <div className="mt-3">
          <Button type="submit">찾기</Button>
        </div>
      </form>
      {found?.state === "invalid" ? (
        <p role="alert" className="mt-4 text-body text-error">
          이메일을 확인해 주세요.
        </p>
      ) : null}
      {found?.state === "missing" ? (
        <p role="status" className="mt-4 text-body">
          회원을 찾지 못했어요.
        </p>
      ) : null}
      {found?.state === "unavailable" ? (
        <p role="alert" className="mt-4 text-body text-error">
          회원 조회를 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}
      {found?.state === "found" ? (
        <article className="mt-4 min-w-0 rounded-card border border-border bg-surface p-3">
          <p className="text-subtitle font-bold wrap-anywhere">
            {found.name || "등록된 이름이 없어요."}
          </p>
          <p className="mt-1 text-caption break-all text-muted">
            {found.email}
          </p>
          <p className="mt-2 text-body">
            {found.isTeacher
              ? "선생님 권한이 있어요."
              : "선생님 권한이 없어요."}
          </p>
          {!found.confirmed ? (
            <p className="mt-2 text-caption text-error">
              이메일 인증을 마친 회원만 선생님으로 지정할 수 있어요.
            </p>
          ) : (
            <form
              action={found.isTeacher ? revokeTeacher : grantTeacher}
              className="mt-3"
            >
              <input type="hidden" name="user_id" value={found.userId} />
              <input type="hidden" name="email" value={found.email} />
              <Button
                type="submit"
                variant={found.isTeacher ? "secondary" : "primary"}
              >
                {found.isTeacher ? "권한 회수" : "선생님 권한 주기"}
              </Button>
            </form>
          )}
        </article>
      ) : null}
      <h2 className="mt-8 text-subtitle font-bold">선생님 목록</h2>
      {teachers === null ? (
        <p role="alert" className="mt-3 text-body text-error">
          선생님 목록을 불러오지 못했어요.
        </p>
      ) : teachers.length === 0 ? (
        <p className="mt-3 text-body text-muted">아직 선생님이 없어요.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {teachers.map((teacher) => (
            <li
              key={teacher.userId}
              className="min-w-0 rounded-card border border-border bg-surface p-3"
            >
              <p className="text-subtitle font-bold wrap-anywhere">
                {teacher.name || "등록된 이름이 없어요."}
              </p>
              <p className="mt-1 text-caption break-all text-muted">
                {teacher.email}
              </p>
              <p className="mt-1 text-caption text-muted">
                권한 부여 {formatGranted(teacher.grantedAt)}
              </p>
              <form action={revokeTeacher} className="mt-3">
                <input type="hidden" name="user_id" value={teacher.userId} />
                <input type="hidden" name="email" value={teacher.email} />
                <Button type="submit" variant="secondary">
                  권한 회수
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatGranted(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
