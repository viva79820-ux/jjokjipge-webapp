"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/admin/reservation-rules";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import {
  confirmClass,
  prepareClassUpload,
  reloadClass,
  saveClass,
  type Result,
} from "@/lib/classes/actions";
import {
  sajuClassDescription,
  tarotClassDescription,
} from "@/lib/classes/content";
import {
  submitClassAttempt,
  submitClassPosterAttempt,
} from "@/lib/classes/submit";
import { inspectImage, uploadImage } from "@/lib/classes/upload";
import {
  classEditUrl,
  classListUrl,
  fieldLabel,
  parseClass,
  type ClassRecord,
} from "@/lib/classes/rules";

const fields = [
  "title",
  "description",
  "field",
  "is_online",
  "video_url",
  "poster_path",
  "poster_alt",
  "is_published",
  "sort_order",
] as const;

export function ClassEditor({
  initial,
  page,
  status,
  initialMessage,
}: {
  initial: ClassRecord | null;
  page: number;
  status: string;
  initialMessage: string;
}) {
  const [original, setOriginal] = useState(initial);
  const [draftId, setDraftId] = useState("");
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [field, setField] = useState(initial?.field || "");
  const [online, setOnline] = useState(initial?.is_online !== false);
  const [videoUrl, setVideoUrl] = useState(initial?.video_url || "");
  const [poster, setPoster] = useState(initial?.poster_path || "");
  const [posterAlt, setPosterAlt] = useState(initial?.poster_alt || "");
  const [file, setFile] = useState<File | null>(null);
  const [published, setPublished] = useState(initial?.is_published || false);
  const [sortOrder, setSortOrder] = useState(
    initial ? String(initial.sort_order) : "0",
  );
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<
    "save" | "delete" | "reload" | "leave" | null
  >(null);
  const [message, setMessage] = useState(initialMessage);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [attemptMode, setAttemptMode] = useState<
    "create" | "update" | "delete" | ""
  >("");
  const [posterCleanup, setPosterCleanup] = useState<
    (() => Promise<boolean>) | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploaded = useRef<string | null>(null);
  const uploadedFile = useRef<File | null>(null);
  const uploadToken = useRef<(() => Promise<boolean>) | null>(null);
  const lock = useRef(false);
  const attemptRef = useRef<FormData | null>(null);
  const baseline = useRef(initial);
  const leaving = useRef(false);
  const createdNavigate = useRef(false);
  const visible = useRef(true);
  const pendingHref = useRef<string | null>(null);
  const reloadRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const prefix = useId();
  const router = useRouter();
  const routerRef = useRef(router);
  const listHref = classListUrl(true, page, status);
  const control =
    "mt-1 w-full min-w-0 min-h-11 rounded-input border border-border bg-surface p-3 text-body";
  useLayoutEffect(() => {
    visible.current = true;
    const href = pendingHref.current;
    if (href) {
      pendingHref.current = null;
      routerRef.current.replace(href);
    }
    return () => {
      visible.current = false;
      setModal(null);
      if (!createdNavigate.current) return;
      createdNavigate.current = false;
      leaving.current = false;
      lock.current = false;
      baseline.current = null;
      setBusy(false);
      setOriginal(null);
      setTitle("");
      setDescription("");
      setField("");
      setOnline(true);
      setVideoUrl("");
      setPoster("");
      setPosterAlt("");
      setFile(null);
      uploaded.current = null;
      uploadedFile.current = null;
      uploadToken.current = null;
      setPublished(false);
      setSortOrder("0");
      setErrors({});
      setMessage("");
      setConflict(false);
      setUncertain(false);
      setAttemptMode("");
      attemptRef.current = null;
      setDraftId("");
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setDraftId((value) => value || crypto.randomUUID()),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (conflict && !modal) {
      const frame = requestAnimationFrame(() => {
        reloadRef.current?.querySelector("button")?.focus();
        reloadRef.current?.scrollIntoView({ block: "center" });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [conflict, modal]);
  function dirty() {
    if (!original)
      return (
        title !== "" ||
        description !== "" ||
        field !== "" ||
        online !== true ||
        videoUrl !== "" ||
        poster !== "" ||
        posterAlt !== "" ||
        file !== null ||
        published ||
        sortOrder !== "0"
      );
    return (
      title !== original.title ||
      description !== original.description ||
      field !== original.field ||
      online !== (original.is_online !== false) ||
      videoUrl !== (original.video_url || "") ||
      poster !== (original.poster_path || "") ||
      posterAlt !== (original.poster_alt || "") ||
      file !== null ||
      published !== original.is_published ||
      sortOrder !== String(original.sort_order)
    );
  }
  function applyRow(row: ClassRecord) {
    baseline.current = row;
    setOriginal(row);
    setTitle(row.title);
    setDescription(row.description);
    setField(row.field);
    setOnline(row.is_online !== false);
    setVideoUrl(row.video_url || "");
    setPoster(row.poster_path || "");
    setPosterAlt(row.poster_alt || "");
    setFile(null);
    uploaded.current = null;
    uploadedFile.current = null;
    uploadToken.current = null;
    setPublished(row.is_published);
    setSortOrder(String(row.sort_order));
  }
  function form(
    mode: "create" | "update" | "delete" = baseline.current
      ? "update"
      : "create",
    nextPoster = poster,
  ) {
    const source = baseline.current;
    const data = new FormData();
    for (const [key, value] of Object.entries({
      id: source?.id || draftId,
      mode,
      version: source?.updated_at || "",
      title,
      description,
      field,
      is_online: String(online),
      video_url: videoUrl,
      poster_path: nextPoster,
      poster_alt: posterAlt,
      is_published: String(published),
      sort_order: sortOrder,
    }))
      data.set(key, value);
    return data;
  }
  function focusStatus() {
    requestAnimationFrame(() => statusRef.current?.focus());
  }
  function remember(data: FormData) {
    const copy = new FormData();
    for (const [key, value] of data.entries()) {
      if (typeof value === "string") copy.append(key, value);
    }
    attemptRef.current = copy;
    const mode = copy.get("mode");
    setAttemptMode(
      mode === "create" || mode === "update" || mode === "delete" ? mode : "",
    );
  }
  function forgetAttempt() {
    attemptRef.current = null;
    setAttemptMode("");
  }
  // Activity로 숨겨진 동안에는 결과만 남기고, 다시 보일 때 한 번만 이동한다.
  function replaceWhenShown(href: string) {
    routerRef.current = router;
    if (!visible.current) {
      pendingHref.current = href;
      return;
    }
    pendingHref.current = null;
    router.replace(href);
  }
  function finish(result: Result) {
    setModal(null);
    setErrors(result.errors || {});
    setPosterCleanup(result.cleanup || null);
    if (result.state !== "unknown") forgetAttempt();
    if (result.deleted) {
      setRemoved(true);
      setMessage(result.message);
      setConflict(false);
      setUncertain(false);
      focusStatus();
      replaceWhenShown(classListUrl(true, page, status, "deleted"));
      return;
    }
    if (result.state === "saved" && result.row) {
      if (!baseline.current) {
        createdNavigate.current = true;
        applyRow(result.row);
        leaving.current = true;
        setMessage(result.message);
        setConflict(false);
        setUncertain(false);
        focusStatus();
        replaceWhenShown(classEditUrl(result.row.id, page, status, "saved"));
        return;
      }
      applyRow(result.row);
      setMessage(result.message);
      setConflict(false);
      setUncertain(false);
      focusStatus();
      return;
    }
    setMessage(
      result.state === "unknown" && attemptRef.current?.get("mode") === "delete"
        ? "삭제 결과를 확인하지 못했습니다. 다시 확인해 주세요."
        : result.message,
    );
    setConflict(result.state === "conflict");
    setUncertain(result.state === "unknown");
    focusStatus();
  }
  async function run() {
    if (lock.current || leaving.current || removed || modal === "leave") return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (modal === "reload") {
        const loaded = await reloadClass(original?.id || draftId);
        if (loaded.row) {
          applyRow(loaded.row);
          setConflict(false);
          setUncertain(false);
          setErrors({});
          setModal(null);
          setMessage(loaded.message);
          focusStatus();
        } else {
          setModal(null);
          setMessage(loaded.message);
          if (loaded.missing) setConflict(false);
          focusStatus();
        }
        return;
      }
      if (modal === "delete") {
        const data = form("delete");
        remember(data);
        finish(await submitClassAttempt(() => saveClass(data)));
        return;
      }
      if (!file) {
        const data = form();
        remember(data);
        finish(await submitClassAttempt(() => saveClass(data)));
        return;
      }
      const attempt = await submitClassPosterAttempt(
        {
          upload: async () => {
            if (uploaded.current && uploadedFile.current === file)
              return uploaded.current;
            let ext = "";
            try {
              ext = (await inspectImage(file)).ext;
            } catch (error) {
              throw Object.assign(
                error instanceof Error
                  ? error
                  : Error("포스터를 확인해 주세요."),
                { definite: true },
              );
            }
            const reserved = await prepareClassUpload(ext);
            if (!reserved)
              throw Object.assign(
                Error("관리자 업로드 권한을 확인해 주세요."),
                { definite: true },
              );
            const previousCleanup = uploadToken.current;
            const replacing = Boolean(
              uploaded.current && uploadedFile.current !== file,
            );
            uploadToken.current = reserved.cleanup;
            uploaded.current = reserved.path;
            uploadedFile.current = file;
            if (replacing && previousCleanup) void previousCleanup();
            try {
              return await uploadImage(createClient(), file, reserved.path);
            } catch (error) {
              let uploadState = "unknown";
              try {
                uploadState = await reserved.confirm();
              } catch {
                uploadState = "unknown";
              }
              if (uploadState === "missing") {
                uploaded.current = null;
                uploadedFile.current = null;
                uploadToken.current = null;
                throw Object.assign(Error("포스터 업로드에 실패했습니다."), {
                  definite: true,
                });
              }
              throw Object.assign(
                error instanceof Error ? error : Error("업로드 응답 불명"),
                { definite: false },
              );
            }
          },
          save: (nextPath) =>
            saveClass(form(baseline.current ? "update" : "create", nextPath)),
          discard: async () =>
            uploadToken.current ? await uploadToken.current() : false,
          pendingUpload: () => uploaded.current,
        },
        poster,
        true,
      );
      uploaded.current = attempt.uploaded;
      if (!attempt.uploaded) uploadedFile.current = null;
      remember(
        form(
          baseline.current ? "update" : "create",
          attempt.uploaded || poster,
        ),
      );
      finish(attempt.result);
    } catch {
      setUncertain(true);
      setModal(null);
      setMessage(
        attemptRef.current?.get("mode") === "delete"
          ? "삭제 결과를 확인하지 못했습니다. 다시 확인해 주세요."
          : "결과를 확인하지 못했습니다. 저장 결과를 확인한 뒤 진행해 주세요.",
      );
      focusStatus();
    } finally {
      if (!leaving.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function reconcile() {
    const attempt = attemptRef.current;
    const mode = attempt?.get("mode");
    const id = attempt?.get("id");
    if (
      !attempt ||
      typeof id !== "string" ||
      lock.current ||
      leaving.current ||
      removed
    )
      return;
    lock.current = true;
    setBusy(true);
    try {
      const checked = await confirmClass(id, attempt);
      if (checked.state === "unknown") {
        setMessage(
          mode === "delete"
            ? "삭제 결과를 확인하지 못했습니다. 다시 확인해 주세요."
            : checked.message,
        );
        focusStatus();
        return;
      }
      if (mode === "delete") {
        if (checked.deleted) {
          finish(checked);
          return;
        }
        if (checked.unchanged || checked.state === "conflict") {
          forgetAttempt();
          setUncertain(false);
          setConflict(checked.state === "conflict");
          setMessage(checked.message);
          focusStatus();
          return;
        }
        setMessage(checked.message);
        focusStatus();
        return;
      }
      if (checked.state === "rejected" && !checked.missing) {
        setMessage(checked.message);
        focusStatus();
        return;
      }
      if (checked.state === "saved" && checked.row) {
        finish(checked);
        return;
      }
      forgetAttempt();
      setUncertain(false);
      if (checked.state === "conflict") setConflict(true);
      setMessage(
        checked.missing
          ? "저장은 반영되지 않았습니다. 입력은 유지됩니다. 다시 저장할 수 있습니다."
          : checked.message,
      );
      focusStatus();
    } catch {
      setMessage(
        mode === "delete"
          ? "삭제 결과를 확인하지 못했습니다. 다시 확인해 주세요."
          : "저장 결과를 확인하지 못했습니다. 입력은 유지하고 다시 확인해 주세요.",
      );
      focusStatus();
    } finally {
      if (!leaving.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  if (removed)
    return (
      <div className="space-y-4" data-class-editor="removed">
        <p role="status" className="text-body text-brand">
          이 클래스는 삭제되었습니다.
        </p>
        <Button href={listHref} variant="secondary">
          클래스 목록
        </Button>
        {posterCleanup && (
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              if (await posterCleanup()) {
                setPosterCleanup(null);
                setMessage("사용하지 않는 포스터 파일을 정리했습니다.");
              }
            }}
          >
            이전 포스터 정리
          </Button>
        )}
      </div>
    );
  return (
    <div
      className="space-y-4 wrap-anywhere"
      data-class-editor={original ? "edit" : "new"}
      data-class-id={original?.id || draftId}
      data-updated-at={original?.updated_at || ""}
    >
      <Link
        href={listHref}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-brand bg-surface px-4.5 text-label font-bold text-brand"
        onClick={(event) => {
          if (busy || uncertain) {
            event.preventDefault();
            return;
          }
          if (!dirty()) return;
          event.preventDefault();
          setModal("leave");
        }}
      >
        클래스 목록으로
      </Link>
      <h1 className="text-display font-extrabold">
        {original ? "클래스 편집" : "클래스 등록"}
      </h1>
      <p className="text-caption text-muted">
        {original
          ? "저장 후에도 이 화면에서 이어서 수정할 수 있습니다."
          : "새 클래스는 비공개로 시작합니다. 오프라인은 영상 없이 공개할 수 있고, 온라인 공개에는 HTTPS 영상 주소가 필요합니다."}
      </p>
      {original && (
        <p className="text-caption text-muted">
          저장 기준 {formatTime(original.updated_at)}
        </p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || uncertain || removed) return;
          const parsed = parseClass(form());
          if (file && !posterAlt.trim())
            parsed.errors.poster_alt =
              "포스터가 있으면 대체 설명을 입력해 주세요.";
          setErrors(parsed.errors);
          const first = fields.find((key) => parsed.errors[key]);
          if (first) {
            document.getElementById(`${prefix}-${first}`)?.focus();
            return;
          }
          setModal("save");
        }}
      >
        <fieldset
          disabled={busy || uncertain || (!initial && !draftId)}
          className="min-w-0 space-y-4"
        >
          <div>
            <label
              htmlFor={`${prefix}-title`}
              className="text-label font-semibold"
            >
              제목
            </label>
            <input
              id={`${prefix}-title`}
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={`${prefix}-title-error`}
            />
            <p
              id={`${prefix}-title-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.title}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-description`}
              className="text-label font-semibold"
            >
              설명
            </label>
            <textarea
              id={`${prefix}-description`}
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${control} min-h-32 resize-y whitespace-pre-wrap`}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={`${prefix}-description-hint ${prefix}-description-error`}
            />
            <p
              id={`${prefix}-description-hint`}
              className="text-caption text-muted"
            >
              첫 줄이 [클래스정보]이면 강사·기간·수업·수강료·커리큘럼으로
              나뉩니다. 그렇지 않으면 설명 그대로 보입니다.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (description.trim()) {
                    setMessage(
                      "설명이 있으면 예시를 넣지 않습니다. 설명을 비운 뒤 다시 눌러 주세요.",
                    );
                    return;
                  }
                  setDescription(sajuClassDescription);
                }}
              >
                사주 과정 예시
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (description.trim()) {
                    setMessage(
                      "설명이 있으면 예시를 넣지 않습니다. 설명을 비운 뒤 다시 눌러 주세요.",
                    );
                    return;
                  }
                  setDescription(tarotClassDescription);
                }}
              >
                타로 과정 예시
              </Button>
            </div>
            <p
              id={`${prefix}-description-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.description}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-is_online`}
              className="text-label font-semibold"
            >
              수업 형태
            </label>
            <select
              id={`${prefix}-is_online`}
              name="is_online"
              value={online ? "true" : "false"}
              onChange={(event) => setOnline(event.target.value === "true")}
              className={`${control} cursor-pointer`}
              aria-invalid={Boolean(errors.is_online)}
              aria-describedby={`${prefix}-is_online-error`}
            >
              <option value="true">온라인</option>
              <option value="false">오프라인</option>
            </select>
            <p
              id={`${prefix}-is_online-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.is_online}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-field`}
              className="text-label font-semibold"
            >
              분야
            </label>
            <select
              id={`${prefix}-field`}
              name="field"
              value={field}
              onChange={(event) => setField(event.target.value)}
              className={`${control} cursor-pointer`}
              aria-invalid={Boolean(errors.field)}
              aria-describedby={`${prefix}-field-error`}
            >
              <option value="">분야 선택</option>
              <option value="saju">사주</option>
              <option value="tarot">타로</option>
            </select>
            <p
              id={`${prefix}-field-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.field}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-video_url`}
              className="text-label font-semibold"
            >
              영상 주소
            </label>
            <input
              id={`${prefix}-video_url`}
              name="video_url"
              inputMode="url"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              className={`${control} break-all`}
              aria-invalid={Boolean(errors.video_url)}
              aria-describedby={`${prefix}-video_url-hint ${prefix}-video_url-error`}
            />
            <p
              id={`${prefix}-video_url-hint`}
              className="text-caption text-muted"
            >
              비공개는 주소 없이 저장할 수 있습니다. 온라인 공개에는 HTTPS
              주소가 필요하고, 오프라인 공개는 주소 없이도 됩니다.
            </p>
            <p
              id={`${prefix}-video_url-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.video_url}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-poster_path`}
              className="text-label font-semibold"
            >
              포스터
            </label>
            <input
              ref={fileRef}
              id={`${prefix}-poster_path`}
              name="poster_file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={`${control} cursor-pointer`}
              aria-invalid={Boolean(errors.poster_path)}
              aria-describedby={`${prefix}-poster-hint ${prefix}-poster_path-error`}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <p id={`${prefix}-poster-hint`} className="text-caption text-muted">
              JPEG·PNG·WebP, 5MiB 이하입니다. 경로는 classes/ 안으로 서버가
              정합니다.
              {poster
                ? " 저장된 포스터가 있습니다."
                : " 저장된 포스터가 없습니다."}
              {file ? ` 선택한 파일: ${file.name}` : ""}
            </p>
            <p
              id={`${prefix}-poster_path-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.poster_path}
            </p>
            {(poster || file) && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const retire = uploadToken.current;
                  setFile(null);
                  setPoster("");
                  setPosterAlt("");
                  uploaded.current = null;
                  uploadedFile.current = null;
                  uploadToken.current = null;
                  if (fileRef.current) fileRef.current.value = "";
                  if (retire) void retire();
                }}
              >
                포스터 지우기
              </Button>
            )}
          </div>
          <div>
            <label
              htmlFor={`${prefix}-poster_alt`}
              className="text-label font-semibold"
            >
              포스터 대체 설명
            </label>
            <input
              id={`${prefix}-poster_alt`}
              name="poster_alt"
              value={posterAlt}
              onChange={(event) => setPosterAlt(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.poster_alt)}
              aria-describedby={`${prefix}-poster_alt-hint ${prefix}-poster_alt-error`}
            />
            <p
              id={`${prefix}-poster_alt-hint`}
              className="text-caption text-muted"
            >
              포스터를 읽지 못하는 경우를 위한 설명입니다. 200자 이하입니다.
            </p>
            <p
              id={`${prefix}-poster_alt-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.poster_alt}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-sort_order`}
              className="text-label font-semibold"
            >
              표시 순서
            </label>
            <input
              id={`${prefix}-sort_order`}
              name="sort_order"
              inputMode="numeric"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.sort_order)}
              aria-describedby={`${prefix}-sort_order-hint ${prefix}-sort_order-error`}
            />
            <p
              id={`${prefix}-sort_order-hint`}
              className="text-caption text-muted"
            >
              0 이상의 정수입니다. 작은 수가 앞에 표시됩니다.
            </p>
            <p
              id={`${prefix}-sort_order-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.sort_order}
            </p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-label font-semibold">
            <input
              id={`${prefix}-is_published`}
              name="is_published"
              type="checkbox"
              checked={published}
              onChange={(event) => setPublished(event.target.checked)}
              aria-invalid={Boolean(errors.is_published)}
            />
            공개
          </label>
          <p role="alert" className="text-caption text-error">
            {errors.is_published}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">저장 전 확인</Button>
            {original && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModal("delete")}
              >
                삭제 전 확인
              </Button>
            )}
            {(original || conflict) && (
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
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="text-body text-brand outline-none"
      >
        {busy ? "처리 중…" : message}
      </p>
      {posterCleanup && (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            if (lock.current || !posterCleanup) return;
            lock.current = true;
            setBusy(true);
            try {
              if (await posterCleanup()) {
                setPosterCleanup(null);
                setMessage("사용하지 않는 포스터 파일을 정리했습니다.");
              } else {
                setMessage(
                  "포스터 파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.",
                );
              }
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          이전 포스터 정리
        </Button>
      )}
      {uncertain && (
        <Button disabled={busy} onClick={reconcile}>
          {attemptMode === "delete"
            ? "삭제 결과 다시 확인"
            : "저장 결과 다시 확인"}
        </Button>
      )}
      {modal && (
        <Modal
          title={
            modal === "delete"
              ? "클래스 삭제 확인"
              : modal === "reload"
                ? "최신 내용 불러오기"
                : modal === "leave"
                  ? "저장하지 않은 입력"
                  : "클래스 저장 확인"
          }
          busy={busy}
          onClose={() => {
            if (!busy) setModal(null);
          }}
          footer={
            <>
              {modal === "leave" ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    router.push(listHref);
                  }}
                >
                  목록으로 이동
                </Button>
              ) : (
                <Button disabled={busy} onClick={run}>
                  확인 후 처리
                </Button>
              )}
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
          {modal === "delete" ? (
            <p>
              {title.trim() || "제목 없음"} 클래스를 삭제하면 고객 화면에서도
              사라집니다. 삭제한 뒤에는 되돌릴 수 없습니다.
            </p>
          ) : modal === "reload" ? (
            <p>작성 중인 입력이 사라지고 최신 내용으로 바뀝니다.</p>
          ) : modal === "leave" ? (
            <p>
              저장하지 않은 입력이 있습니다. 목록으로 이동하면 작성 중인 내용이
              사라집니다.
            </p>
          ) : (
            <>
              <p className="wrap-anywhere">{title.trim() || "제목 없음"}</p>
              <p>
                {fieldLabel(field) || "분야 없음"} · 표시 순서{" "}
                {sortOrder || "0"}
              </p>
              <p>
                {online ? "온라인" : "오프라인"} ·{" "}
                {published ? "공개" : "비공개"}
              </p>
              <p className="break-all">
                {videoUrl.trim() ? videoUrl.trim() : "영상 주소 없음"}
              </p>
              <p className="wrap-anywhere">
                {posterAlt.trim()
                  ? `포스터 대체 설명: ${posterAlt.trim()}`
                  : "포스터 대체 설명 없음"}
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
