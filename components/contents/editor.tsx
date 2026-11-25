"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import {
  confirmContent,
  prepareContentUpload,
  reloadContent,
  saveContent,
  type Result,
} from "@/lib/contents/actions";
import {
  adminEditUrl,
  channelLabels,
  channels,
  contentPatch,
  deletedListUrl,
  publicThumbnailUrl,
  type Channel,
  type ContentRecord,
} from "@/lib/contents/rules";
import { submitContentAttempt } from "@/lib/contents/submit";
import {
  inspectImage,
  uploadImage,
  uploadLookupMessage,
} from "@/lib/contents/upload";
import { ContentThumbnail } from "./thumbnail";

const pendingContentCleanups = new Map<
  string,
  ReadonlyArray<() => Promise<boolean>>
>();
const cleanupListeners = new Set<() => void>();

function notifyCleanup() {
  for (const listener of cleanupListeners) listener();
}

function subscribeCleanup(listener: () => void) {
  cleanupListeners.add(listener);
  return () => cleanupListeners.delete(listener);
}

function readCleanup(id?: string) {
  if (!id) return null;
  const jobs = pendingContentCleanups.get(id);
  return jobs?.length ? jobs : null;
}

function rememberCleanup(id: string, job: () => Promise<boolean>) {
  const current = pendingContentCleanups.get(id) ?? [];
  if (current.includes(job)) return;
  pendingContentCleanups.set(id, [...current, job]);
  notifyCleanup();
}

function forgetCleanup(id: string, job: () => Promise<boolean>) {
  const current = pendingContentCleanups.get(id);
  if (!current?.includes(job)) return;
  const next = current.filter((item) => item !== job);
  if (next.length) pendingContentCleanups.set(id, next);
  else pendingContentCleanups.delete(id);
  notifyCleanup();
}

export function ContentEditor({
  initial,
  returnTo,
  saved,
  initialCleanup,
}: {
  initial: ContentRecord | null;
  returnTo: string;
  saved: boolean;
  initialCleanup?: (expected?: FormData) => Promise<boolean>;
}) {
  const handed = useSyncExternalStore(
    subscribeCleanup,
    () => readCleanup(initial?.id),
    () => null,
  );
  const [original, setOriginal] = useState(initial);
  const [draftId, setDraftId] = useState("");
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [channel, setChannel] = useState<Channel | "">(initial?.channel || "");
  const [externalUrl, setExternalUrl] = useState(initial?.external_url || "");
  const [thumbnail, setThumbnail] = useState(initial?.thumbnail_path || "");
  const [thumbnailAlt, setThumbnailAlt] = useState(
    initial?.thumbnail_alt || "",
  );
  const [postedOn, setPostedOn] = useState(initial?.posted_on || "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [published, setPublished] = useState(initial?.is_published || false);
  const [sortOrder, setSortOrder] = useState(
    initial ? String(initial.sort_order) : "0",
  );
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<
    "save" | "delete" | "reload" | "leave" | null
  >(null);
  const [message, setMessage] = useState(
    saved && initial ? "콘텐츠를 저장했습니다." : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [gone, setGone] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [attemptMode, setAttemptMode] = useState<
    "create" | "update" | "delete" | ""
  >("");
  const lock = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploaded = useRef<string | null>(null);
  const uploadedFile = useRef<File | null>(null);
  const uploadToken = useRef<
    ((expected?: FormData) => Promise<boolean>) | null
  >(null);
  const confirmToken = useRef<
    | (() => Promise<
        | "present"
        | "missing"
        | "rejected"
        | "forbidden"
        | "unavailable"
        | "unknown"
      >)
    | null
  >(null);
  const originalCleanup = useRef(initialCleanup);
  const cleanupJobs = useRef<Array<() => Promise<boolean>>>([]);
  const attemptRef = useRef<FormData | null>(null);
  const baseline = useRef(initial);
  const leaving = useRef(false);
  const shown = useRef(true);
  const pendingHref = useRef<string | null>(null);
  const reloadRef = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const router = useRouter();
  const control =
    "mt-1 w-full min-w-0 min-h-11 rounded-input border border-border bg-surface p-3";
  useLayoutEffect(() => {
    shown.current = true;
    const href = pendingHref.current;
    if (href) {
      pendingHref.current = null;
      leaving.current = true;
      router.replace(href);
      return () => {
        shown.current = false;
        setModal(null);
      };
    }
    if (leaving.current) {
      leaving.current = false;
      lock.current = false;
      setBusy(false);
    }
    return () => {
      shown.current = false;
      setModal(null);
    };
  }, [router]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setDraftId((value) => value || crypto.randomUUID()),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setPreview(url));
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => {
    if (!saved || !initial) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(`${prefix}-status`)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [initial, prefix, saved]);
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
        channel !== "" ||
        externalUrl !== "" ||
        thumbnail !== "" ||
        thumbnailAlt !== "" ||
        postedOn !== "" ||
        file !== null ||
        published ||
        sortOrder !== "0"
      );
    return (
      title !== original.title ||
      description !== (original.description || "") ||
      channel !== original.channel ||
      externalUrl !== (original.external_url || "") ||
      thumbnail !== (original.thumbnail_path || "") ||
      thumbnailAlt !== (original.thumbnail_alt || "") ||
      postedOn !== (original.posted_on || "") ||
      file !== null ||
      published !== original.is_published ||
      sortOrder !== String(original.sort_order)
    );
  }
  function applyRow(row: ContentRecord) {
    baseline.current = row;
    setOriginal(row);
    setTitle(row.title);
    setDescription(row.description || "");
    setChannel(row.channel);
    setExternalUrl(row.external_url || "");
    setThumbnail(row.thumbnail_path || "");
    setThumbnailAlt(row.thumbnail_alt || "");
    setPostedOn(row.posted_on || "");
    setFile(null);
    uploaded.current = null;
    uploadedFile.current = null;
    uploadToken.current = null;
    confirmToken.current = null;
    if (fileRef.current) fileRef.current.value = "";
    setPublished(row.is_published);
    setSortOrder(String(row.sort_order));
  }
  function form(
    mode: "create" | "update" | "delete" = baseline.current
      ? "update"
      : "create",
    nextThumbnail = thumbnail,
  ) {
    const source = baseline.current;
    const data = new FormData();
    for (const [key, value] of Object.entries({
      id: source?.id || draftId,
      mode,
      version: source?.updated_at || "",
      title,
      description,
      channel,
      external_url: externalUrl,
      thumbnail_path: nextThumbnail,
      thumbnail_alt: thumbnailAlt,
      posted_on: postedOn,
      is_published: String(published),
      sort_order: sortOrder,
    }))
      data.set(key, value);
    return data;
  }
  function remember(data: FormData) {
    const copy = new FormData();
    for (const [key, value] of data.entries())
      if (typeof value === "string") copy.append(key, value);
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
  function addCleanup(job?: () => Promise<boolean>) {
    if (!job || cleanupJobs.current.includes(job)) return;
    cleanupJobs.current = [...cleanupJobs.current, job];
    const id = initial?.id || original?.id;
    if (id) rememberCleanup(id, job);
    setCleanupPending(true);
  }
  function go(href: string) {
    if (shown.current) {
      leaving.current = true;
      router.replace(href);
      return;
    }
    pendingHref.current = href;
  }
  function focusStatus() {
    requestAnimationFrame(() =>
      document.getElementById(`${prefix}-status`)?.focus(),
    );
  }
  function finish(result: Result) {
    setModal(null);
    setErrors(result.errors || {});
    if (result.state !== "unknown") forgetAttempt();
    if (result.recovery) originalCleanup.current = result.recovery;
    if (result.deleted) {
      addCleanup(result.cleanup);
      setRemoved(true);
      setMessage(result.message);
      setConflict(false);
      setUncertain(false);
      if (!result.cleanup && !cleanupJobs.current.length)
        go(deletedListUrl(returnTo));
      else focusStatus();
      return;
    }
    if (result.state === "saved" && result.row) {
      const created = !baseline.current;
      addCleanup(result.cleanup);
      if (created)
        for (const job of cleanupJobs.current)
          rememberCleanup(result.row.id, job);
      applyRow(result.row);
      setConflict(false);
      setUncertain(false);
      setGone(false);
      setMessage(result.message);
      if (created) go(adminEditUrl(result.row.id, returnTo, true));
      else focusStatus();
      return;
    }
    if (result.missing && baseline.current) {
      setGone(true);
      setConflict(false);
      setUncertain(false);
      setMessage(result.message);
      focusStatus();
      return;
    }
    setConflict(result.state === "conflict");
    setUncertain(result.state === "unknown");
    setMessage(result.message);
    focusStatus();
  }
  async function run() {
    if (lock.current || leaving.current || !modal || modal === "leave") return;
    const action = modal;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (action === "reload") {
        const loaded = await reloadContent(baseline.current?.id || draftId);
        if (loaded.row) {
          const created = !baseline.current;
          applyRow(loaded.row);
          setConflict(false);
          setUncertain(false);
          setGone(false);
          setErrors({});
          setModal(null);
          setMessage(loaded.message);
          if (created) go(adminEditUrl(loaded.row.id, returnTo, true));
          else focusStatus();
        } else {
          if (loaded.missing && baseline.current) setGone(true);
          setMessage(loaded.message);
        }
        return;
      }
      if (action === "delete") {
        const source = baseline.current;
        if (!source) return;
        const attempt = { id: source.id, version: source.updated_at };
        const data = form("delete");
        data.set("id", attempt.id);
        data.set("version", attempt.version);
        remember(data);
        const result = await saveContent(data);
        finish(result);
        return;
      }
      if (!file) {
        const data = form();
        remember(data);
        finish(await submitContentAttempt(() => saveContent(data)));
        return;
      }
      const attempt = await submitContentAttempt(
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
                  : Error("썸네일을 확인해 주세요."),
                { definite: true },
              );
            }
            const reserved = await prepareContentUpload(ext);
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
            confirmToken.current = reserved.confirm;
            uploaded.current = reserved.path;
            uploadedFile.current = file;
            if (replacing && previousCleanup)
              addCleanup(() => previousCleanup());
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
                confirmToken.current = null;
                throw Object.assign(Error("썸네일 업로드에 실패했습니다."), {
                  definite: true,
                });
              }
              throw Object.assign(
                error instanceof Error ? error : Error("업로드 응답 불명"),
                { definite: false },
              );
            }
          },
          save: (path) => saveContent(form(undefined, path)),
          discard: async () =>
            uploadToken.current ? await uploadToken.current() : false,
          pendingUpload: () => uploaded.current,
        },
        thumbnail,
        true,
      );
      uploaded.current = attempt.uploaded;
      if (!attempt.uploaded) uploadedFile.current = null;
      if (
        attempt.uploaded &&
        (attempt.result.state === "rejected" ||
          attempt.result.state === "conflict") &&
        uploadToken.current
      ) {
        const orphanPath = attempt.uploaded;
        const cleanup = uploadToken.current;
        addCleanup(async () => {
          const cleared = await cleanup();
          if (cleared && uploaded.current === orphanPath) {
            uploaded.current = null;
            uploadedFile.current = null;
            uploadToken.current = null;
            confirmToken.current = null;
          }
          return cleared;
        });
      }
      const savedForm = form(
        baseline.current ? "update" : "create",
        attempt.uploaded || thumbnail,
      );
      remember(savedForm);
      finish(attempt.result);
    } catch {
      setUncertain(true);
      setModal(null);
      setMessage("결과를 확인하지 못했습니다. 저장 결과를 다시 확인해 주세요.");
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
      let thumbnailState = "";
      if (uploaded.current && confirmToken.current && mode !== "delete") {
        try {
          thumbnailState = await confirmToken.current();
        } catch {
          thumbnailState = "unknown";
        }
      }
      const checked = await confirmContent(id, attempt);
      const thumbnailNote =
        thumbnailState && thumbnailState !== "present"
          ? uploadLookupMessage(thumbnailState)
          : "";
      if (checked.state === "unknown") {
        setMessage(
          thumbnailNote
            ? `${thumbnailNote} ${checked.message}`
            : checked.message,
        );
        focusStatus();
        return;
      }
      if (mode === "delete") {
        if (checked.deleted) {
          const pending = originalCleanup.current;
          finish({
            ...checked,
            cleanup: pending ? () => pending(attempt) : undefined,
          });
          return;
        }
        if (checked.unchanged || checked.state === "conflict") {
          if (checked.recovery) originalCleanup.current = checked.recovery;
          forgetAttempt();
          setUncertain(false);
          setConflict(checked.state === "conflict");
          setMessage(checked.message);
          focusStatus();
          return;
        }
      }
      if (checked.unchanged) {
        forgetAttempt();
        setUncertain(false);
        setConflict(false);
        if (thumbnailState === "missing") {
          uploaded.current = null;
          uploadedFile.current = null;
          uploadToken.current = null;
          confirmToken.current = null;
          setMessage(
            "업로드된 파일이 없습니다. 콘텐츠는 수정 전 버전 그대로입니다. 다시 저장할 수 있습니다.",
          );
        } else
          setMessage(
            thumbnailNote
              ? `${checked.message} ${thumbnailNote}`
              : checked.message,
          );
        focusStatus();
        return;
      }
      if (checked.state === "saved" && checked.row) {
        const previous = baseline.current?.thumbnail_path;
        const pending =
          previous && previous !== checked.row.thumbnail_path
            ? originalCleanup.current
            : undefined;
        finish({
          ...checked,
          cleanup: pending ? () => pending(attempt) : undefined,
          message: thumbnailNote
            ? `저장 결과를 확인했습니다. ${thumbnailNote}`
            : "저장 결과를 확인했습니다.",
        });
        return;
      }
      forgetAttempt();
      setUncertain(false);
      if (checked.state === "conflict") setConflict(true);
      if (checked.missing && mode === "create")
        setMessage(
          "저장은 반영되지 않았습니다. 입력은 유지됩니다. 다시 저장할 수 있습니다.",
        );
      else
        setMessage(
          thumbnailNote
            ? `${checked.message} ${thumbnailNote}`
            : checked.message,
        );
      focusStatus();
    } catch {
      setMessage(
        mode === "delete"
          ? "삭제 결과를 확인하지 못했습니다. 다시 확인해 주세요."
          : "저장 결과를 확인하지 못했습니다. 입력은 유지하고 다시 확인해 주세요.",
      );
    } finally {
      if (!leaving.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function retryCleanup() {
    const id = initial?.id || original?.id;
    const local = cleanupJobs.current[0];
    const job = local ?? readCleanup(id)?.[0];
    if (!id || !job || lock.current || leaving.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (await job()) {
        if (local)
          cleanupJobs.current = cleanupJobs.current.filter(
            (item) => item !== local,
          );
        forgetCleanup(id, job);
        const pending =
          cleanupJobs.current.length > 0 || Boolean(readCleanup(id)?.length);
        setCleanupPending(cleanupJobs.current.length > 0);
        setMessage(
          removed && !pending
            ? "콘텐츠를 삭제했습니다."
            : "썸네일 정리를 마쳤습니다.",
        );
        if (removed && !pending) go(deletedListUrl(returnTo));
      } else
        setMessage(
          removed
            ? "콘텐츠 삭제는 반영됐습니다. 썸네일 정리만 다시 시도해 주세요."
            : "콘텐츠 저장은 반영됐습니다. 썸네일 정리만 다시 시도해 주세요.",
        );
    } catch {
      setMessage(
        removed
          ? "콘텐츠 삭제는 반영됐습니다. 썸네일 정리 응답을 확인하지 못했습니다."
          : "콘텐츠 저장은 반영됐습니다. 썸네일 정리 응답을 확인하지 못했습니다.",
      );
    } finally {
      if (!leaving.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  const fieldOrder = [
    "title",
    "description",
    "channel",
    "external_url",
    "thumbnail_path",
    "thumbnail_alt",
    "posted_on",
    "is_published",
    "sort_order",
  ];
  const thumbnailSrc = file ? preview : publicThumbnailUrl(thumbnail);
  const cleanupLeft = cleanupPending || Boolean(handed?.length);
  if (removed)
    return (
      <div className="min-w-0 space-y-4" data-content-editor="removed">
        <p role="status" className="text-body text-brand">
          {busy ? "처리 중…" : message || "이 콘텐츠는 삭제되었습니다."}
        </p>
        {cleanupLeft && (
          <Button type="button" disabled={busy} onClick={retryCleanup}>
            썸네일 정리 다시 시도
          </Button>
        )}
        <Button href={returnTo} variant="secondary">
          콘텐츠 목록
        </Button>
      </div>
    );
  return (
    <div className="min-w-0 space-y-4">
      <Link
        href={returnTo}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-brand bg-surface px-4 text-label font-bold text-brand"
        onClick={(event) => {
          if (busy || uncertain) {
            event.preventDefault();
            return;
          }
          if (gone || !dirty()) return;
          event.preventDefault();
          setModal("leave");
        }}
      >
        목록으로 돌아가기
      </Link>
      <h1 className="text-title font-bold">
        {initial ? "콘텐츠 편집" : "콘텐츠 등록"}
      </h1>
      <p className="text-caption font-medium text-muted">
        주소가 없는 비공개 초안을 저장할 수 있습니다. 공개하려면 HTTPS 주소가
        필요합니다.
      </p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || uncertain || gone || (!baseline.current && !draftId))
            return;
          const parsed = contentPatch(
            form(undefined, file ? `contents/${draftId}.png` : thumbnail),
          );
          setErrors(parsed.errors);
          if (!parsed.patch) {
            const key = fieldOrder.find((name) => parsed.errors[name]);
            document.getElementById(`${prefix}-${key}`)?.focus();
            return;
          }
          if (file) {
            void inspectImage(file)
              .then(() => setModal("save"))
              .catch((error: unknown) => {
                setErrors({
                  thumbnail_path:
                    error instanceof Error
                      ? error.message
                      : "썸네일을 확인해 주세요.",
                });
                document.getElementById(`${prefix}-thumbnail_path`)?.focus();
              });
            return;
          }
          setModal("save");
        }}
      >
        <fieldset
          disabled={busy || uncertain || gone || (!original && !draftId)}
          className="min-w-0 space-y-4"
        >
          <div>
            <label
              htmlFor={`${prefix}-title`}
              className="flex min-h-11 items-center text-label font-semibold"
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
              role={errors.title ? "alert" : undefined}
              className="text-error"
            >
              {errors.title}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-description`}
              className="flex min-h-11 items-center text-label font-semibold"
            >
              설명
            </label>
            <textarea
              id={`${prefix}-description`}
              name="description"
              value={description}
              rows={5}
              onChange={(event) => setDescription(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={`${prefix}-description-help ${prefix}-description-error`}
            />
            <p
              id={`${prefix}-description-help`}
              className="text-caption text-muted"
            >
              비워 두면 설명을 저장하지 않습니다. 줄바꿈은 그대로 보입니다.
            </p>
            <p
              id={`${prefix}-description-error`}
              role={errors.description ? "alert" : undefined}
              className="text-error"
            >
              {errors.description}
            </p>
          </div>
          <fieldset className="min-w-0 space-y-1">
            <legend className="flex min-h-11 items-center text-label font-semibold">
              채널
            </legend>
            {channels.map((item) => (
              <label
                key={item}
                className="flex min-h-11 cursor-pointer items-center gap-2"
              >
                <input
                  id={item === "blog" ? `${prefix}-channel` : undefined}
                  type="radio"
                  name="channel"
                  value={item}
                  checked={channel === item}
                  onChange={() => setChannel(item)}
                />
                {channelLabels[item]}
              </label>
            ))}
            <p
              id={`${prefix}-channel-error`}
              role={errors.channel ? "alert" : undefined}
              className="text-error"
            >
              {errors.channel}
            </p>
          </fieldset>
          <div>
            <label
              htmlFor={`${prefix}-external_url`}
              className="flex min-h-11 items-center text-label font-semibold"
            >
              외부 주소
            </label>
            <input
              id={`${prefix}-external_url`}
              name="external_url"
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.external_url)}
              aria-describedby={`${prefix}-external_url-help ${prefix}-external_url-error`}
            />
            <p
              id={`${prefix}-external_url-help`}
              className="text-caption break-all text-muted"
            >
              https 주소만 저장합니다. 주소에 접속하거나 내용을 가져오지
              않습니다.
            </p>
            <p
              id={`${prefix}-external_url-error`}
              role={errors.external_url ? "alert" : undefined}
              className="text-error"
            >
              {errors.external_url}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-thumbnail_path`}
              className="flex min-h-11 items-center text-label font-semibold"
            >
              썸네일
            </label>
            <input
              ref={fileRef}
              id={`${prefix}-thumbnail_path`}
              name="thumbnail_file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={`${control} cursor-pointer`}
              aria-invalid={Boolean(errors.thumbnail_path)}
              aria-describedby={`${prefix}-thumbnail-help ${prefix}-thumbnail_path-error`}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <p
              id={`${prefix}-thumbnail-help`}
              className="text-caption text-muted"
            >
              JPEG·PNG·WebP, 5MiB 이하 한 장입니다. 바꾸거나 빼기 전에는 저장된
              썸네일이 유지됩니다.
            </p>
            <p
              id={`${prefix}-thumbnail_path-error`}
              role={errors.thumbnail_path ? "alert" : undefined}
              className="text-error"
            >
              {errors.thumbnail_path}
            </p>
            <div className="mt-3 max-w-60">
              <ContentThumbnail
                src={thumbnailSrc}
                alt={thumbnailAlt || "콘텐츠 썸네일"}
                channel={channel || "blog"}
              />
            </div>
            {(file || thumbnail) && (
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  const retire = uploadToken.current;
                  const hadUpload = uploaded.current;
                  setFile(null);
                  setThumbnail("");
                  setThumbnailAlt("");
                  uploaded.current = null;
                  uploadedFile.current = null;
                  uploadToken.current = null;
                  confirmToken.current = null;
                  if (hadUpload && retire && !uncertain)
                    addCleanup(() => retire());
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                썸네일 빼기
              </Button>
            )}
          </div>
          <div>
            <label
              htmlFor={`${prefix}-thumbnail_alt`}
              className="flex min-h-11 items-center text-label font-semibold"
            >
              썸네일 대체 설명
            </label>
            <input
              id={`${prefix}-thumbnail_alt`}
              name="thumbnail_alt"
              value={thumbnailAlt}
              onChange={(event) => setThumbnailAlt(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.thumbnail_alt)}
              aria-describedby={`${prefix}-thumbnail_alt-help ${prefix}-thumbnail_alt-error`}
            />
            <p
              id={`${prefix}-thumbnail_alt-help`}
              className="text-caption text-muted"
            >
              썸네일이 있을 때 필수입니다. 200자 이하로 입력해 주세요.
            </p>
            <p
              id={`${prefix}-thumbnail_alt-error`}
              role={errors.thumbnail_alt ? "alert" : undefined}
              className="text-error"
            >
              {errors.thumbnail_alt}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-posted_on`}
              className="flex min-h-11 items-center text-label font-semibold"
            >
              원본 게시일
            </label>
            <input
              id={`${prefix}-posted_on`}
              name="posted_on"
              type="date"
              value={postedOn}
              onChange={(event) => setPostedOn(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.posted_on)}
              aria-describedby={`${prefix}-posted_on-help ${prefix}-posted_on-error`}
            />
            <p
              id={`${prefix}-posted_on-help`}
              className="text-caption text-muted"
            >
              선택 사항입니다. 원본 채널에 게시된 날짜를 입력해 주세요.
            </p>
            <p
              id={`${prefix}-posted_on-error`}
              role={errors.posted_on ? "alert" : undefined}
              className="text-error"
            >
              {errors.posted_on}
            </p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-label font-semibold">
            <input
              id={`${prefix}-is_published`}
              type="checkbox"
              name="is_published"
              checked={published}
              onChange={(event) => setPublished(event.target.checked)}
            />
            공개
          </label>
          <p
            role={errors.is_published ? "alert" : undefined}
            className="text-error"
          >
            {errors.is_published}
          </p>
          <div>
            <label
              htmlFor={`${prefix}-sort_order`}
              className="flex min-h-11 items-center text-label font-semibold"
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
              aria-describedby={`${prefix}-sort_order-help ${prefix}-sort_order-error`}
            />
            <p
              id={`${prefix}-sort_order-help`}
              className="text-caption text-muted"
            >
              0 이상의 정수입니다. 작을수록 앞에 표시됩니다.
            </p>
            <p
              id={`${prefix}-sort_order-error`}
              role={errors.sort_order ? "alert" : undefined}
              className="text-error"
            >
              {errors.sort_order}
            </p>
          </div>
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
            {(original || conflict || uncertain) && (
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
        id={`${prefix}-status`}
        role="status"
        tabIndex={-1}
        className={`text-body focus:outline-none ${conflict || uncertain || gone ? "text-error" : "text-brand"}`}
      >
        {busy ? "처리 중…" : message}
      </p>
      {handed?.length ? (
        <p className="text-body text-brand">
          이전 썸네일은 썸네일 정리 버튼으로만 지웁니다.
        </p>
      ) : null}
      {uncertain && (
        <Button type="button" disabled={busy} onClick={reconcile}>
          {attemptMode === "delete"
            ? "삭제 결과 다시 확인"
            : "저장 결과 다시 확인"}
        </Button>
      )}
      {cleanupLeft && !removed && (
        <Button
          type="button"
          disabled={busy || uncertain}
          variant="secondary"
          onClick={retryCleanup}
        >
          썸네일 정리 다시 시도
        </Button>
      )}
      {gone && (
        <Button href={returnTo} variant="secondary">
          목록으로 돌아가기
        </Button>
      )}
      {modal && (
        <Modal
          title={
            modal === "reload"
              ? "최신 내용 불러오기"
              : modal === "delete"
                ? "콘텐츠 삭제 확인"
                : modal === "leave"
                  ? "저장하지 않은 입력"
                  : "콘텐츠 저장 확인"
          }
          busy={busy}
          onClose={() => {
            if (!busy) setModal(null);
          }}
          footer={
            <>
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (modal === "leave") {
                    leaving.current = true;
                    setModal(null);
                    router.push(returnTo);
                    return;
                  }
                  void run();
                }}
              >
                확인 후 처리
              </Button>
              <Button
                type="button"
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
            <p>작성 중인 입력이 사라지고 최신 내용으로 바뀝니다.</p>
          ) : modal === "leave" ? (
            <p>
              저장하지 않은 입력은 이 화면에 남아 있고, 서버에는 반영되지
              않습니다.
            </p>
          ) : modal === "delete" ? (
            <p>
              이 콘텐츠를 삭제하면 고객 화면에서도 사라집니다. 저장된 썸네일도
              사용 여부를 확인한 뒤 정리합니다.
            </p>
          ) : (
            <>
              <p>
                {published ? "공개" : "비공개"}로 저장합니다. 공개 내용은 고객
                콘텐츠 목록에 표시됩니다.
              </p>
              <p>
                {file
                  ? "새 썸네일을 올립니다."
                  : thumbnail
                    ? "저장된 썸네일을 유지합니다."
                    : "썸네일 없음"}
              </p>
              <p>
                {postedOn ? `원본 게시일 ${postedOn}` : "원본 게시일 미입력"}
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

export function ContentDeletedCleanup({
  id,
  returnTo,
}: {
  id: string;
  returnTo: string;
}) {
  const jobs = useSyncExternalStore(
    subscribeCleanup,
    () => readCleanup(id),
    () => null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "콘텐츠 삭제를 확인했습니다. 썸네일은 정리 버튼으로만 지웁니다.",
  );
  const router = useRouter();
  if (!jobs?.length)
    return (
      <div className="space-y-4">
        <p role="status">콘텐츠가 없습니다.</p>
        <Button href={returnTo} variant="secondary">
          콘텐츠 목록
        </Button>
      </div>
    );
  return (
    <div className="space-y-4" data-content-editor="removed">
      <p role="status" className="text-body text-brand">
        {busy ? "처리 중…" : message}
      </p>
      <Button
        type="button"
        disabled={busy}
        onClick={async () => {
          const job = readCleanup(id)?.[0];
          if (!job || busy) return;
          setBusy(true);
          try {
            if (await job()) {
              forgetCleanup(id, job);
              if (readCleanup(id)?.length) {
                setMessage("썸네일 정리를 마쳤습니다.");
                return;
              }
              router.replace(deletedListUrl(returnTo));
            } else
              setMessage(
                "콘텐츠 삭제는 반영됐습니다. 썸네일 정리만 다시 시도해 주세요.",
              );
          } catch {
            setMessage(
              "콘텐츠 삭제는 반영됐습니다. 썸네일 정리 응답을 확인하지 못했습니다.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        썸네일 정리 다시 시도
      </Button>
      <Button href={returnTo} variant="secondary">
        콘텐츠 목록
      </Button>
    </div>
  );
}
