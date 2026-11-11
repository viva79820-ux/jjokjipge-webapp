"use client";
import { useState, useRef, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import {
  saveNotice,
  reloadNotice,
  prepareNoticeUpload,
  type Result,
} from "@/lib/notices/actions";
import { uploadImage, inspectImage } from "@/lib/notices/upload";
import { submitNoticeAttempt } from "@/lib/notices/submit";
import { queueNoticeRefresh } from "@/lib/notices/navigation";
import {
  parseNotice,
  returnUrl,
  publicImageUrl,
  noticeMatches,
  type Notice,
} from "@/lib/notices/rules";
export function NoticeEditor({
  initial,
  returnTo,
  initialCleanup,
}: {
  initial: Notice | null;
  returnTo: string;
  initialCleanup?: (expected: FormData) => Promise<boolean>;
}) {
  const [original, setOriginal] = useState(initial),
    [draftId, setDraftId] = useState("");
  const [title, setTitle] = useState(initial?.title || ""),
    [body, setBody] = useState(initial?.body || ""),
    [alt, setAlt] = useState(initial?.image_alt || ""),
    [path, setPath] = useState(initial?.image_path || ""),
    [pin, setPin] = useState(initial?.is_pinned || false),
    [pub, setPub] = useState(initial?.is_published || false),
    [popup, setPopup] = useState(initial?.is_popup || false);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<"save" | "delete" | "reload" | null>(null),
    [message, setMessage] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [conflict, setConflict] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [cleanup, setCleanup] = useState<(() => Promise<boolean>) | undefined>(),
    [done, setDone] = useState(false);
  const [hasUpload, setHasUpload] = useState(false);
  const uploaded = useRef<string | null>(null),
    uploadToken = useRef<(() => Promise<boolean>) | null>(null),
    originalCleanup = useRef(initialCleanup),
    deleting = useRef(false),
    lock = useRef(false),
    reloadRef = useRef<HTMLDivElement>(null);
  const prefix = useId(),
    router = useRouter();
  const back = returnUrl(returnTo);
  const imageSrc = file ? preview : publicImageUrl(path);
  useEffect(() => {
    const t = requestAnimationFrame(() =>
      setDraftId((value) => value || crypto.randomUUID()),
    );
    return () => cancelAnimationFrame(t);
  }, []);
  useEffect(() => {
    if (!file) {
      return;
    }
    const url = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setPreview(url));
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => {
    if (conflict && !modal) {
      const t = requestAnimationFrame(() => {
        reloadRef.current?.querySelector("button")?.focus();
        reloadRef.current?.scrollIntoView({ block: "center" });
      });
      return () => cancelAnimationFrame(t);
    }
  }, [conflict, modal]);
  function form(p = path) {
    const f = new FormData();
    for (const [k, v] of Object.entries({
      id: original?.id || draftId,
      mode: original ? "update" : "create",
      version: original?.updated_at || "",
      title,
      body,
      image_alt: alt,
      image_path: p,
      is_pinned: String(pin),
      is_published: String(pub),
      is_popup: String(popup),
    }))
      f.set(k, v);
    return f;
  }
  function finish(res: Result) {
    setModal(null);
    setMessage(
      res.cleanup
        ? "DB 작업은 완료됐지만 이전 이미지 정리가 남았습니다. 정리만 재시도해 주세요."
        : res.message,
    );
    setErrors(res.errors || {});
    if (res.state === "saved") {
      if (res.row) queueNoticeRefresh(res.row.id);
      if (res.row) setOriginal(res.row);
      setFile(null);
      uploaded.current = null;
      setHasUpload(false);
      setCleanup(() => res.cleanup);
      setDone(Boolean(res.cleanup));
      if (res.row) {
        setPath(res.row.image_path || "");
        setTitle(res.row.title);
        setBody(res.row.body);
        setAlt(res.row.image_alt || "");
        setPin(res.row.is_pinned);
        setPub(res.row.is_published);
        setPopup(res.row.is_popup);
      }
      if (!res.cleanup) {
        if (!initial) {
          setOriginal(null);
          setTitle("");
          setBody("");
          setAlt("");
          setPath("");
          setPin(false);
          setPub(false);
          setPopup(false);
          setDraftId(crypto.randomUUID());
        }
        router.replace(`${back}${back.includes("?") ? "&" : "?"}notice=saved`);
      }
    } else {
      setConflict(res.state === "conflict");
      setUncertain(res.state === "unknown");
    }
  }
  async function run() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (modal === "reload") {
        if (uploaded.current && uploadToken.current) {
          if (!(await uploadToken.current())) {
            setMessage(
              "이번 업로드 파일의 정리를 확인하지 못했습니다. 작성 내용을 유지합니다.",
            );
            return;
          }
          uploaded.current = null;
          setHasUpload(false);
        }
        const r = await reloadNotice(original?.id || draftId);
        if (r.row) {
          setOriginal(r.row);
          originalCleanup.current = r.recovery;
          setTitle(r.row.title);
          setBody(r.row.body);
          setPath(r.row.image_path || "");
          setAlt(r.row.image_alt || "");
          setPin(r.row.is_pinned);
          setPub(r.row.is_published);
          setPopup(r.row.is_popup);
          setFile(null);
          setConflict(false);
          setUncertain(false);
          uploaded.current = null;
          setHasUpload(false);
          setErrors({});
          setModal(null);
          setMessage(r.message);
        } else setMessage(r.message);
        return;
      }
      if (modal === "delete") {
        deleting.current = true;
        const f = form();
        f.set("mode", "delete");
        finish(await saveNotice(f));
        return;
      }
      deleting.current = false;
      const attempt = await submitNoticeAttempt(
        {
          upload: async () => {
            if (uploaded.current) return uploaded.current;
            const { ext } = await inspectImage(file!);
            const reserved = await prepareNoticeUpload(ext);
            if (!reserved) throw Error("관리자 업로드 권한을 확인해 주세요.");
            uploadToken.current = reserved.cleanup;
            uploaded.current = reserved.path;
            try {
              return await uploadImage(createClient(), file!, reserved.path);
            } catch (error) {
              // DB has not been called. Cleanup only this reserved upload.
              try {
                if (await reserved.cleanup()) uploaded.current = null;
              } catch {
                /* Network loss may leave an orphan; never broaden cleanup. */
              }
              throw error;
            }
          },
          save: (p) => saveNotice(form(p)),
          discard: async () =>
            uploadToken.current ? await uploadToken.current() : false,
          pendingUpload: () => uploaded.current,
        },
        path,
        !!file,
      );
      uploaded.current = attempt.uploaded;
      setHasUpload(Boolean(attempt.uploaded));
      finish(attempt.result);
    } catch {
      setUncertain(true);
      setModal(null);
      setMessage(
        "결과를 확인하지 못했습니다. 저장 결과를 확인한 후 진행해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reconcile() {
    setBusy(true);
    try {
      const r = await reloadNotice(original?.id || draftId);
      if (r.state === "unknown") {
        setMessage(r.message);
        return;
      }
      if (r.state === "rejected" && !r.missing) {
        setMessage(r.message);
        return;
      }
      if (deleting.current && r.missing && original) {
        // Confirmed absent row; cleanup remains scoped to the server-read image.
        const expected = form();
        expected.set("mode", "delete");
        const pending = originalCleanup.current;
        const retryCleanup = pending ? () => pending(expected) : undefined;
        let remaining = retryCleanup;
        try {
          if (retryCleanup && (await retryCleanup())) remaining = undefined;
        } catch {
          /* Keep retry permission. */
        }
        finish({
          state: "saved",
          message: "공지 삭제를 확인했습니다.",
          row: original,
          deleted: true,
          cleanup: remaining,
        });
        return;
      }
      if (r.row && noticeMatches(r.row, form(uploaded.current || path))) {
        const expected = form(uploaded.current || path);
        const pending =
          original?.image_path && original.image_path !== r.row.image_path
            ? originalCleanup.current
            : undefined;
        const retryCleanup = pending ? () => pending(expected) : undefined;
        let remaining = retryCleanup;
        try {
          if (retryCleanup && (await retryCleanup())) remaining = undefined;
        } catch {
          /* Keep retry permission. */
        }
        finish({
          ...r,
          state: "saved",
          cleanup: remaining,
          message: "저장 결과를 확인했습니다.",
        });
      } else {
        setMessage(
          "현재 저장 내용과 일치하지 않습니다. 최신 내용을 확인하거나 다시 저장해 주세요.",
        );
        setUncertain(false);
        if (r.row) setConflict(true);
      }
    } catch {
      setMessage(
        "저장 결과를 확인하지 못했습니다. 파일을 보존하고 다시 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    if (!cleanup) return;
    setBusy(true);
    try {
      if (await cleanup()) {
        setCleanup(undefined);
        setDone(false);
        router.replace(`${back}${back.includes("?") ? "&" : "?"}notice=saved`);
      } else
        setMessage(
          "DB 작업은 완료됐지만 파일 정리가 완료되지 않았습니다. 잠시 후 정리만 재시도해 주세요.",
        );
    } catch {
      setMessage(
        "DB 작업은 완료됐지만 파일 정리 응답을 확인하지 못했습니다. 정리만 재시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  const control =
    "mt-1 w-full min-w-0 min-h-11 rounded-button border border-border bg-surface p-3";
  return (
    <div className="space-y-4 wrap-anywhere">
      <Button href={back} variant="secondary">
        목록으로 돌아가기
      </Button>
      <h1 className="text-xl font-bold">
        {initial ? "공지 편집" : "공지 등록"}
      </h1>
      <p className="text-sm text-muted">
        이미지는 URL을 알면 비공개 공지에서도 누구나 볼 수 있습니다. 공개 가능한
        이미지만 첨부하고 중요한 포스터 안내는 본문에도 적어 주세요.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const f = form(file ? `notices/${draftId}.png` : path);
          const v = parseNotice(f);
          setErrors(v.errors);
          if (Object.keys(v.errors).length) {
            document
              .getElementById(`${prefix}-${Object.keys(v.errors)[0]}`)
              ?.focus();
            return;
          }
          setModal("save");
        }}
      >
        <fieldset
          disabled={!draftId || busy || done || uncertain}
          className="min-w-0 space-y-4"
        >
          {(
            [
              ["title", "제목", 100],
              ["body", "본문", 5000],
            ] as const
          ).map(([k, label, max]) => (
            <div key={k}>
              <label htmlFor={`${prefix}-${k}`}>{label}</label>
              {k === "body" ? (
                <textarea
                  id={`${prefix}-${k}`}
                  name={k}
                  rows={10}
                  maxLength={max}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className={control}
                  aria-invalid={!!errors[k]}
                  aria-describedby={`${prefix}-${k}-error`}
                />
              ) : (
                <input
                  id={`${prefix}-${k}`}
                  name={k}
                  maxLength={max}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={control}
                  aria-invalid={!!errors[k]}
                  aria-describedby={`${prefix}-${k}-error`}
                />
              )}
              <p
                id={`${prefix}-${k}-error`}
                role="alert"
                className="text-error"
              >
                {errors[k]}
              </p>
              {k === "body" && (
                <p className="text-right text-sm text-muted">
                  {body.length} / 5000자
                </p>
              )}
            </div>
          ))}
          <section
            aria-labelledby={`${prefix}-image-heading`}
            className="space-y-4 rounded-card border border-border bg-surface p-3 md:p-4"
          >
            <h2 id={`${prefix}-image-heading`} className="text-lg font-bold">
              첨부 이미지
            </h2>
            <label className="block">
              파일 선택
              <input
                className={control}
                type="file"
                disabled={hasUpload}
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const selected = e.target.files?.[0];
                  if (!selected) return;
                  setBusy(true);
                  try {
                    await inspectImage(selected);
                    setPreview("");
                    setFile(selected);
                    uploaded.current = null;
                    setMessage("");
                  } catch (err) {
                    setMessage(
                      err instanceof Error
                        ? err.message
                        : "이미지를 확인해 주세요.",
                    );
                    e.target.value = "";
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {imageSrc && (
              <div className="space-y-2">
                <Image
                  unoptimized
                  width={1200}
                  height={1200}
                  src={imageSrc}
                  alt={alt || "선택 이미지 미리보기"}
                  className="max-h-80 h-auto w-auto max-w-full object-contain"
                  data-notice-image-preview
                />
                <a
                  href={imageSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 cursor-pointer items-center text-brand underline"
                >
                  이미지 크게 보기
                </a>
              </div>
            )}
            <div>
              <label htmlFor={`${prefix}-image_alt`}>이미지 설명</label>
              <input
                id={`${prefix}-image_alt`}
                name="image_alt"
                maxLength={200}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                className={control}
                aria-invalid={!!errors.image_alt}
                aria-describedby={`${prefix}-image_alt-error`}
              />
              <p
                id={`${prefix}-image_alt-error`}
                role="alert"
                className="text-error"
              >
                {errors.image_alt}
              </p>
            </div>
            {imageSrc && (
              <Button
                type="button"
                variant="secondary"
                disabled={hasUpload}
                onClick={() => {
                  setFile(null);
                  setPath("");
                }}
              >
                첨부 제거
              </Button>
            )}
          </section>
          <div className="space-y-2 border-t border-border pt-4">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={pin}
                onChange={(e) => setPin(e.target.checked)}
              />
              상단 고정
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={pub}
                onChange={(e) => setPub(e.target.checked)}
              />
              공개
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={popup}
                onChange={(e) => setPopup(e.target.checked)}
                aria-describedby={`${prefix}-popup-help`}
              />
              홈 팝업으로 표시
            </label>
            <p id={`${prefix}-popup-help`} className="text-sm text-muted">
              공개된 팝업 대상 중 가장 최근에 공개한 공지 1건이 홈에 표시됩니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">저장 전 확인</Button>
            {initial && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModal("delete")}
              >
                공지 삭제
              </Button>
            )}
            {conflict && (
              <div ref={reloadRef}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setModal("reload")}
                >
                  최신 내용 다시 불러오기
                </Button>
              </div>
            )}
          </div>
        </fieldset>
      </form>
      <p role="status" aria-live="polite" className="text-brand">
        {busy ? "처리 중…" : message}
      </p>
      {uncertain && (
        <Button disabled={busy} onClick={reconcile}>
          저장 결과 다시 확인
        </Button>
      )}
      {hasUpload && !uncertain && !done && (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (await uploadToken.current!()) {
                uploaded.current = null;
                setHasUpload(false);
                setMessage("이번 업로드 파일의 정리·참조 확인을 마쳤습니다.");
              } else
                setMessage(
                  "새 파일 정리를 확인하지 못했습니다. 다시 시도해 주세요.",
                );
            } catch {
              setMessage(
                "새 파일 정리 응답을 확인하지 못했습니다. 정리만 다시 시도해 주세요.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          이번 업로드 파일 정리만 재시도
        </Button>
      )}
      {cleanup && (
        <Button disabled={busy} onClick={retry}>
          파일 정리만 재시도
        </Button>
      )}
      {modal && (
        <Modal
          title={
            modal === "reload"
              ? "최신 내용 불러오기"
              : modal === "delete"
                ? "공지 삭제 확인"
                : "공지 저장 확인"
          }
          busy={busy}
          onClose={() => {
            if (!busy) setModal(null);
          }}
          footer={
            <>
              <Button disabled={busy} onClick={run}>
                확인 후 처리
              </Button>
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => setModal(null)}
              >
                돌아가기
              </Button>
            </>
          }
        >
          {modal === "reload" ? (
            <p>
              작성 중인 입력과 선택 이미지가 사라지고 최신 내용으로 바뀝니다.
            </p>
          ) : (
            <>
              <p>{title}</p>
              <p>
                {pub ? "공개" : "비공개"} ·{" "}
                {modal === "delete"
                  ? "삭제하면 고객 공지에서도 사라집니다."
                  : "공개로 저장하면 고객 화면에 반영됩니다."}
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
