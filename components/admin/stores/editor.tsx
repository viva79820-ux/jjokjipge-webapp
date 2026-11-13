"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import {
  prepareStoreUpload,
  reloadStore,
  saveStore,
  type Result,
} from "@/lib/stores/actions";
import { queueStoreRefresh } from "@/lib/stores/navigation";
import {
  parseStore,
  publicImageUrl,
  returnUrl,
  savedListUrl,
  type StoreRecord,
} from "@/lib/stores/rules";
import { submitStoreAttempt } from "@/lib/stores/submit";
import { inspectImage, uploadImage } from "@/lib/stores/upload";

export function StoreEditor({
  initial,
  returnTo,
  initialCleanup,
}: {
  initial: StoreRecord | null;
  returnTo: string;
  initialCleanup?: (expected: FormData) => Promise<boolean>;
}) {
  // initial이 바뀌어도 작성 중 입력은 덮어쓰지 않는다. 저장 기준은 baseline만 갱신한다.
  const [draftId, setDraftId] = useState("");
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [hours, setHours] = useState(initial?.hours || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [path, setPath] = useState(initial?.image_path || "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0));
  const [active, setActive] = useState(initial ? initial.is_active : false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"save" | "reload" | "leave" | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [cleanup, setCleanup] = useState<
    (() => Promise<boolean>) | undefined
  >();
  const [done, setDone] = useState(false);
  const [hasUpload, setHasUpload] = useState(false);
  const uploaded = useRef<string | null>(null);
  const uploadToken = useRef<(() => Promise<boolean>) | null>(null);
  const confirmToken = useRef<
    (() => Promise<"present" | "missing" | "rejected" | "unknown">) | null
  >(null);
  const originalCleanup = useRef(initialCleanup);
  const baseline = useRef(initial);
  const pendingCreate = useRef(false);
  const leaving = useRef(false);
  const lock = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reloadRef = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const router = useRouter();
  const back = returnUrl(returnTo);
  const control =
    "mt-1 w-full min-w-0 min-h-11 rounded-button border border-border bg-surface p-3";
  useLayoutEffect(() => {
    if (leaving.current) {
      leaving.current = false;
      lock.current = false;
      setBusy(false);
      setMessage("");
    }
    return () => setModal(null);
  }, []);
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
    if (conflict && !modal) {
      const frame = requestAnimationFrame(() => {
        reloadRef.current?.querySelector("button")?.focus();
        reloadRef.current?.scrollIntoView({ block: "center" });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [conflict, modal]);
  function dirty() {
    if (file) return true;
    const source = baseline.current;
    if (!source)
      return (
        name !== "" ||
        description !== "" ||
        address !== "" ||
        hours !== "" ||
        phone !== "" ||
        path !== "" ||
        sortOrder !== "0" ||
        active
      );
    return (
      name !== source.name ||
      description !== (source.description || "") ||
      address !== (source.address || "") ||
      hours !== (source.hours || "") ||
      phone !== (source.phone || "") ||
      path !== (source.image_path || "") ||
      sortOrder !== String(source.sort_order) ||
      active !== source.is_active
    );
  }
  function applyRow(row: StoreRecord) {
    baseline.current = row;
    setName(row.name);
    setDescription(row.description || "");
    setAddress(row.address || "");
    setHours(row.hours || "");
    setPhone(row.phone || "");
    setPath(row.image_path || "");
    setSortOrder(String(row.sort_order));
    setActive(row.is_active);
  }
  function resetDraft() {
    baseline.current = null;
    pendingCreate.current = false;
    setName("");
    setDescription("");
    setAddress("");
    setHours("");
    setPhone("");
    setPath("");
    setSortOrder("0");
    setActive(false);
    setFile(null);
    uploaded.current = null;
    setHasUpload(false);
    uploadToken.current = null;
    confirmToken.current = null;
    if (fileRef.current) fileRef.current.value = "";
    setDraftId(crypto.randomUUID());
  }
  function clearFileInput() {
    if (fileRef.current) fileRef.current.value = "";
  }
  function form(image = path) {
    const source = baseline.current;
    const data = new FormData();
    for (const [key, value] of Object.entries({
      id: source?.id || draftId,
      mode: source ? "update" : "create",
      version: source?.updated_at || "",
      name,
      description,
      address,
      hours,
      phone,
      image_path: image,
      sort_order: sortOrder,
      is_active: String(active),
    }))
      data.set(key, value);
    return data;
  }
  function finish(result: Result, image = uploaded.current || path) {
    setModal(null);
    setErrors(result.errors || {});
    if (result.resetAttempt && !baseline.current)
      setDraftId(crypto.randomUUID());
    if (result.state === "saved" && result.row) {
      const created = !baseline.current;
      queueStoreRefresh(result.row.id);
      if (result.recovery) originalCleanup.current = result.recovery;
      setFile(null);
      uploaded.current = null;
      setHasUpload(false);
      uploadToken.current = null;
      confirmToken.current = null;
      clearFileInput();
      setCleanup(() => result.cleanup);
      setDone(Boolean(result.cleanup));
      setConflict(false);
      setUncertain(false);
      if (result.cleanup) {
        applyRow(result.row);
        pendingCreate.current = created;
        setMessage(
          "DB 저장은 끝났지만 이전 사진 정리가 남았습니다. 정리만 다시 시도해 주세요.",
        );
        return;
      }
      setMessage(result.message);
      if (created) resetDraft();
      else applyRow(result.row);
      leaving.current = true;
      router.replace(savedListUrl(back));
      return;
    }
    setMessage(result.message);
    setConflict(result.state === "conflict");
    setUncertain(result.state === "unknown");
    if (image && uploaded.current) setHasUpload(true);
  }
  async function run() {
    if (lock.current || leaving.current || done || modal === "leave") return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (modal === "reload") {
        const loaded = await reloadStore(baseline.current?.id || draftId);
        if (loaded.row) {
          originalCleanup.current = loaded.recovery;
          applyRow(loaded.row);
          setFile(null);
          uploaded.current = null;
          setHasUpload(false);
          uploadToken.current = null;
          confirmToken.current = null;
          clearFileInput();
          setConflict(false);
          setUncertain(false);
          setErrors({});
          setModal(null);
          setMessage(loaded.message);
        } else setMessage(loaded.message);
        return;
      }
      const attempt = await submitStoreAttempt(
        {
          upload: async () => {
            if (uploaded.current) return uploaded.current;
            const { ext } = await inspectImage(file!);
            const reserved = await prepareStoreUpload(ext);
            if (!reserved)
              throw Object.assign(
                Error("관리자 업로드 권한을 확인해 주세요."),
                {
                  definite: true,
                },
              );
            uploadToken.current = reserved.cleanup;
            confirmToken.current = reserved.confirm;
            uploaded.current = reserved.path;
            try {
              return await uploadImage(createClient(), file!, reserved.path);
            } catch (error) {
              let status: "present" | "missing" | "rejected" | "unknown" =
                "unknown";
              try {
                status = await reserved.confirm();
              } catch {
                status = "unknown";
              }
              if (status === "missing") {
                uploaded.current = null;
                setHasUpload(false);
                throw Object.assign(Error("사진 업로드에 실패했습니다."), {
                  definite: true,
                });
              }
              throw Object.assign(
                error instanceof Error ? error : Error("업로드 응답 불명"),
                { definite: false },
              );
            }
          },
          save: (nextPath) => saveStore(form(nextPath)),
          discard: async () =>
            uploadToken.current ? await uploadToken.current() : false,
          pendingUpload: () => uploaded.current,
        },
        path,
        Boolean(file),
      );
      uploaded.current = attempt.uploaded;
      setHasUpload(Boolean(attempt.uploaded));
      finish(attempt.result);
    } catch {
      setUncertain(true);
      setModal(null);
      setMessage(
        "결과를 확인하지 못했습니다. 저장 결과를 확인한 뒤 진행해 주세요.",
      );
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
      if (uploaded.current && confirmToken.current) {
        let status: "present" | "missing" | "rejected" | "unknown" = "unknown";
        try {
          status = await confirmToken.current();
        } catch {
          status = "unknown";
        }
        if (status === "unknown") {
          setMessage(
            "업로드 결과를 아직 확인하지 못했습니다. 파일은 삭제하지 않습니다.",
          );
          return;
        }
        if (status === "missing") {
          uploaded.current = null;
          setHasUpload(false);
          setUncertain(false);
          setMessage(
            "업로드된 파일을 찾지 못했습니다. 저장된 내용은 바꾸지 않았습니다.",
          );
          return;
        }
      }
      const expected = form(uploaded.current || path);
      const loaded = await reloadStore(
        baseline.current?.id || draftId,
        expected,
      );
      if (
        loaded.state === "unknown" ||
        (loaded.state === "rejected" && !loaded.missing)
      ) {
        setMessage(loaded.message);
        return;
      }
      if (loaded.row && loaded.matched) {
        const pending =
          baseline.current?.image_path &&
          baseline.current.image_path !== loaded.row.image_path
            ? originalCleanup.current
            : undefined;
        const retry = pending ? () => pending(expected) : undefined;
        let remaining = retry;
        try {
          if (retry && (await retry())) remaining = undefined;
        } catch {
          /* 정리 권한은 유지한다. */
        }
        if (loaded.recovery) originalCleanup.current = loaded.recovery;
        finish({
          ...loaded,
          state: "saved",
          cleanup: remaining,
          message: "저장 결과를 확인했습니다.",
        });
        return;
      }
      setUncertain(false);
      if (loaded.row) setConflict(true);
      setMessage(
        uploaded.current
          ? "저장은 반영되지 않았습니다. 업로드한 사진은 보존했습니다. 내용을 확인한 뒤 다시 저장할 수 있습니다."
          : loaded.missing
            ? "저장은 반영되지 않았습니다. 입력은 유지됩니다. 다시 저장할 수 있습니다."
            : "현재 저장 내용과 일치하지 않습니다. 최신 내용을 확인하거나 다시 저장해 주세요.",
      );
    } catch {
      setMessage(
        "저장 결과를 확인하지 못했습니다. 파일을 보존하고 다시 확인해 주세요.",
      );
    } finally {
      if (!leaving.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function retryCleanup() {
    if (!cleanup || lock.current || leaving.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (await cleanup()) {
        setCleanup(undefined);
        setDone(false);
        if (pendingCreate.current) resetDraft();
        leaving.current = true;
        router.replace(savedListUrl(back));
      } else
        setMessage(
          "DB 저장은 끝났지만 파일 정리가 끝나지 않았습니다. 잠시 후 정리만 다시 시도해 주세요.",
        );
    } catch {
      setMessage(
        "DB 저장은 끝났지만 파일 정리 응답을 확인하지 못했습니다. 정리만 다시 시도해 주세요.",
      );
    } finally {
      if (!leaving.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  const imageSrc = file ? preview : publicImageUrl(path);
  return (
    <div className="space-y-4 wrap-anywhere">
      <Link
        href={back}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-button border border-brand bg-surface px-3 text-sm font-semibold text-brand"
        onClick={(event) => {
          if (busy || uncertain || done) {
            event.preventDefault();
            return;
          }
          if (!dirty()) return;
          event.preventDefault();
          setModal("leave");
        }}
      >
        목록으로 돌아가기
      </Link>
      <h1 className="text-xl font-bold">
        {initial ? "매장 편집" : "매장 등록"}
      </h1>
      <div className="space-y-1 text-sm text-muted">
        <p>
          영업시간 안내는 매장 소개에만 보입니다. 전화상담 예약 가능 시간과는
          별개입니다.
        </p>
        <p>
          전화번호가 없으면 사이트 대표번호로 연결합니다. 상담사 개인 번호는
          가져오지 않습니다.
        </p>
        <p>
          고객 화면에서 숨기려면 공개를 해제합니다. 매장은 삭제하지 않습니다.
        </p>
        <p>
          비공개 매장 사진도 주소를 알면 누구나 볼 수 있습니다. 공개할 수 있는
          사진만 올려 주세요.
        </p>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const standIn = file ? `stores/${draftId}.png` : path;
          const parsed = parseStore(form(standIn));
          setErrors(parsed.errors);
          if (Object.keys(parsed.errors).length) {
            document
              .getElementById(`${prefix}-${Object.keys(parsed.errors)[0]}`)
              ?.focus();
            return;
          }
          setModal("save");
        }}
      >
        <fieldset
          disabled={busy || uncertain || done || (!initial && !draftId)}
          className="min-w-0 space-y-4"
        >
          <div>
            <label htmlFor={`${prefix}-name`}>매장명</label>
            <input
              id={`${prefix}-name`}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={`${prefix}-name-error`}
            />
            <p id={`${prefix}-name-error`} role="alert" className="text-error">
              {errors.name}
            </p>
          </div>
          <div>
            <label htmlFor={`${prefix}-description`}>소개</label>
            <textarea
              id={`${prefix}-description`}
              name="description"
              value={description}
              rows={6}
              onChange={(event) => setDescription(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={`${prefix}-description-error`}
            />
            <p className="text-sm text-muted">줄바꿈은 그대로 저장됩니다.</p>
            <p
              id={`${prefix}-description-error`}
              role="alert"
              className="text-error"
            >
              {errors.description}
            </p>
          </div>
          <div>
            <label htmlFor={`${prefix}-address`}>주소</label>
            <input
              id={`${prefix}-address`}
              name="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.address)}
              aria-describedby={`${prefix}-address-error`}
            />
            <p
              id={`${prefix}-address-error`}
              role="alert"
              className="text-error"
            >
              {errors.address}
            </p>
          </div>
          <div>
            <label htmlFor={`${prefix}-hours`}>영업시간 안내</label>
            <textarea
              id={`${prefix}-hours`}
              name="hours"
              value={hours}
              rows={4}
              onChange={(event) => setHours(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.hours)}
              aria-describedby={`${prefix}-hours-error`}
            />
            <p className="text-sm text-muted">줄바꿈은 그대로 저장됩니다.</p>
            <p id={`${prefix}-hours-error`} role="alert" className="text-error">
              {errors.hours}
            </p>
          </div>
          <div>
            <label htmlFor={`${prefix}-phone`}>전화번호</label>
            <input
              id={`${prefix}-phone`}
              name="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={`${prefix}-phone-error`}
            />
            <p id={`${prefix}-phone-error`} role="alert" className="text-error">
              {errors.phone}
            </p>
          </div>
          <section
            aria-labelledby={`${prefix}-image-heading`}
            className="space-y-3 rounded-card border border-border bg-surface p-3 md:p-4"
          >
            <h2 id={`${prefix}-image-heading`} className="text-lg font-bold">
              사진
            </h2>
            <p className="text-sm text-muted">
              JPEG, PNG, WebP 1장. 빈 파일은 올릴 수 없고 5MiB까지입니다.
            </p>
            <label className="block" htmlFor={`${prefix}-image_path`}>
              사진 선택
              <input
                ref={fileRef}
                id={`${prefix}-image_path`}
                className={control}
                type="file"
                disabled={hasUpload}
                accept="image/jpeg,image/png,image/webp"
                onChange={async (event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) return;
                  setBusy(true);
                  try {
                    await inspectImage(selected);
                    setPreview("");
                    setFile(selected);
                    uploaded.current = null;
                    setHasUpload(false);
                    setMessage("");
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "사진을 확인해 주세요.",
                    );
                    event.target.value = "";
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
                  height={675}
                  src={imageSrc}
                  alt={
                    name.trim()
                      ? `${name.trim()} 사진 미리보기`
                      : "선택한 사진 미리보기"
                  }
                  className="aspect-video h-auto max-h-80 w-full max-w-full object-cover"
                  data-store-image-preview
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {file && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setFile(null);
                    uploaded.current = null;
                    setHasUpload(false);
                    clearFileInput();
                  }}
                >
                  선택한 파일 취소
                </Button>
              )}
              {(file || path) && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={hasUpload}
                  onClick={() => {
                    setFile(null);
                    setPath("");
                    uploaded.current = null;
                    setHasUpload(false);
                    clearFileInput();
                  }}
                >
                  사진 제거
                </Button>
              )}
            </div>
            <p role="alert" className="text-error">
              {errors.image_path}
            </p>
          </section>
          <div>
            <label htmlFor={`${prefix}-sort_order`}>정렬 순서</label>
            <input
              id={`${prefix}-sort_order`}
              name="sort_order"
              inputMode="numeric"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.sort_order)}
              aria-describedby={`${prefix}-sort_order-error`}
            />
            <p className="text-sm text-muted">
              작은 수가 앞에 옵니다. 새 매장의 처음 값은 0입니다.
            </p>
            <p
              id={`${prefix}-sort_order-error`}
              role="alert"
              className="text-error"
            >
              {errors.sort_order}
            </p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            공개
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">저장 전 확인</Button>
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
        <Button type="button" disabled={busy} onClick={reconcile}>
          저장 결과 다시 확인
        </Button>
      )}
      {hasUpload && !uncertain && !done && (
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!uploadToken.current || lock.current || leaving.current) return;
            lock.current = true;
            setBusy(true);
            try {
              if (await uploadToken.current()) {
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
              if (!leaving.current) {
                lock.current = false;
                setBusy(false);
              }
            }
          }}
        >
          이번 업로드 파일 정리만 재시도
        </Button>
      )}
      {cleanup && (
        <Button type="button" disabled={busy} onClick={retryCleanup}>
          파일 정리만 재시도
        </Button>
      )}
      {modal && (
        <Modal
          title={
            modal === "reload"
              ? "최신 내용 불러오기"
              : modal === "leave"
                ? "저장하지 않은 입력"
                : "매장 저장 확인"
          }
          busy={busy}
          onClose={() => {
            if (!busy) setModal(null);
          }}
          footer={
            <>
              {modal === "leave" ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    router.push(back);
                  }}
                >
                  목록으로 이동
                </Button>
              ) : (
                <Button type="button" disabled={busy} onClick={run}>
                  확인 후 처리
                </Button>
              )}
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
            <p>
              작성 중인 입력과 선택한 사진이 사라지고 최신 내용으로 바뀝니다.
            </p>
          ) : modal === "leave" ? (
            <p>
              저장하지 않은 입력이 있습니다. 목록으로 이동한 뒤 뒤로 가면 작성
              중인 내용이 남아 있습니다.
            </p>
          ) : (
            <>
              <p>{name.trim() || "이름 없음"}</p>
              <p>
                {active ? "공개" : "비공개"} · 정렬 {sortOrder || "0"}
              </p>
              <p>
                {file
                  ? "새 사진을 저장합니다."
                  : path
                    ? "기존 사진을 유지합니다."
                    : "사진 없음"}
              </p>
              <p>
                공개를 해제하면 고객 화면에서 숨겨집니다. 매장은 삭제하지
                않습니다.
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
