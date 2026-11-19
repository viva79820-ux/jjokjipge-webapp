"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  confirmContentDeletion,
  reloadContent,
  saveContent,
  type Result,
} from "@/lib/contents/actions";
import {
  adminEditUrl,
  channelLabels,
  channels,
  contentMatches,
  contentPatch,
  deletedListUrl,
  type Channel,
  type ContentRecord,
} from "@/lib/contents/rules";
import { submitContentAttempt } from "@/lib/contents/submit";

export function ContentEditor({
  initial,
  returnTo,
  saved,
}: {
  initial: ContentRecord | null;
  returnTo: string;
  saved: boolean;
}) {
  const [original, setOriginal] = useState(initial);
  const [draftId, setDraftId] = useState("");
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [channel, setChannel] = useState<Channel | "">(initial?.channel || "");
  const [externalUrl, setExternalUrl] = useState(initial?.external_url || "");
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
  const lock = useRef(false);
  const baseline = useRef(initial);
  const leaving = useRef(false);
  const deleting = useRef(false);
  const deleteAttempt = useRef<{ id: string; version: string } | null>(null);
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
        published ||
        sortOrder !== "0"
      );
    return (
      title !== original.title ||
      description !== (original.description || "") ||
      channel !== original.channel ||
      externalUrl !== (original.external_url || "") ||
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
    setPublished(row.is_published);
    setSortOrder(String(row.sort_order));
  }
  function form() {
    const source = baseline.current;
    const data = new FormData();
    for (const [key, value] of Object.entries({
      id: source?.id || draftId,
      mode: source ? "update" : "create",
      version: source?.updated_at || "",
      title,
      description,
      channel,
      external_url: externalUrl,
      is_published: String(published),
      sort_order: sortOrder,
    }))
      data.set(key, value);
    return data;
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
    if (result.deleted) {
      setMessage(result.message);
      go(deletedListUrl(returnTo));
      return;
    }
    if (result.state === "saved" && result.row) {
      const created = !baseline.current;
      applyRow(result.row);
      setConflict(false);
      setUncertain(false);
      setGone(false);
      deleting.current = false;
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
        deleteAttempt.current = attempt;
        deleting.current = true;
        const data = form();
        data.set("mode", "delete");
        data.set("id", attempt.id);
        data.set("version", attempt.version);
        const result = await submitContentAttempt(() => saveContent(data));
        if (result.state !== "unknown") deleteAttempt.current = null;
        finish(result);
        return;
      }
      deleting.current = false;
      finish(await submitContentAttempt(() => saveContent(form())));
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
    if (lock.current || leaving.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (deleting.current) {
        const attempt = deleteAttempt.current;
        if (!attempt) {
          setMessage(
            "저장 결과를 확인하지 못했습니다. 입력은 유지하고 다시 확인해 주세요.",
          );
          return;
        }
        const checked = await confirmContentDeletion(
          attempt.id,
          attempt.version,
        );
        if (checked.deleted) {
          deleteAttempt.current = null;
          deleting.current = false;
          setUncertain(false);
          setConflict(false);
          finish({
            state: "saved",
            deleted: true,
            message: checked.message,
          });
          return;
        }
        if (checked.state === "conflict") {
          deleteAttempt.current = null;
          deleting.current = false;
          setUncertain(false);
          setConflict(true);
          setGone(false);
          setMessage(checked.message);
          focusStatus();
          return;
        }
        if (checked.unchanged) {
          deleteAttempt.current = null;
          deleting.current = false;
          setUncertain(false);
          setConflict(false);
          setMessage(checked.message);
          focusStatus();
          return;
        }
        setUncertain(true);
        setMessage(checked.message);
        return;
      }
      const loaded = await reloadContent(baseline.current?.id || draftId);
      if (
        loaded.state === "unknown" ||
        (loaded.state === "rejected" && !loaded.missing)
      ) {
        setMessage(loaded.message);
        return;
      }
      if (!baseline.current && loaded.missing) {
        setUncertain(false);
        setMessage(
          "저장은 반영되지 않았습니다. 입력은 유지됩니다. 다시 저장할 수 있습니다.",
        );
        return;
      }
      if (loaded.row && contentMatches(loaded.row, form())) {
        finish({
          ...loaded,
          state: "saved",
          message: "저장 결과를 확인했습니다.",
        });
        return;
      }
      setUncertain(false);
      if (loaded.missing && baseline.current) setGone(true);
      if (loaded.row) setConflict(true);
      setMessage(
        loaded.missing
          ? "콘텐츠가 없습니다."
          : "현재 저장 내용과 일치하지 않습니다. 최신 내용을 확인하거나 다시 저장해 주세요.",
      );
    } catch {
      setMessage(
        "저장 결과를 확인하지 못했습니다. 입력은 유지하고 다시 확인해 주세요.",
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
    "is_published",
    "sort_order",
  ];
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
          const parsed = contentPatch(form());
          setErrors(parsed.errors);
          if (!parsed.patch) {
            const key = fieldOrder.find((name) => parsed.errors[name]);
            document.getElementById(`${prefix}-${key}`)?.focus();
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
      {uncertain && (
        <Button type="button" disabled={busy} onClick={reconcile}>
          저장 결과 다시 확인
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
            <p>이 콘텐츠를 삭제하면 고객 화면에서도 사라집니다.</p>
          ) : (
            <p>
              {published ? "공개" : "비공개"}로 저장합니다. 공개 내용은 고객
              콘텐츠 목록에 표시됩니다.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
