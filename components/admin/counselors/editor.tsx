"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import {
  prepareCounselorUpload,
  reloadCounselor,
  saveCounselor,
  type Result,
} from "@/lib/counselors/actions";
import { queueCounselorRefresh } from "@/lib/counselors/navigation";
import {
  approvalLabel,
  counselorMatches,
  fieldLabel,
  parseCounselor,
  publicImageUrl,
  returnUrl,
  type CounselorField,
  type CounselorRecord,
} from "@/lib/counselors/rules";
import { submitCounselorAttempt } from "@/lib/counselors/submit";
import { inspectImage, uploadImage } from "@/lib/counselors/upload";
import { productListUrl } from "@/lib/counselor-products/rules";

type StoreOption = { id: string; name: string; is_active: boolean };

export function CounselorEditor({
  initial,
  stores,
  returnTo,
  initialCleanup,
}: {
  initial: CounselorRecord | null;
  stores: StoreOption[];
  returnTo: string;
  initialCleanup?: (expected: FormData) => Promise<boolean>;
}) {
  const [original, setOriginal] = useState(initial);
  const [draftId, setDraftId] = useState("");
  const [name, setName] = useState(initial?.name || "");
  const [fields, setFields] = useState<CounselorField[]>(initial?.fields || []);
  const [representative, setRepresentative] = useState<CounselorField | "">(
    initial?.field || "",
  );
  const [storeId, setStoreId] = useState(initial?.store_id || "");
  const [intro, setIntro] = useState(initial?.intro || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [tags, setTags] = useState<string[]>(initial?.tags || []);
  const [careers, setCareers] = useState<string[]>(initial?.careers || []);
  const [path, setPath] = useState(initial?.image_path || "");
  const [recommended, setRecommended] = useState(
    initial?.is_recommended || false,
  );
  const [isNew, setIsNew] = useState(initial?.is_new || false);
  const [active, setActive] = useState(initial?.is_active || false);
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"save" | "reload" | "products" | null>(
    null,
  );
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
  const lock = useRef(false);
  const reloadRef = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const router = useRouter();
  const back = returnUrl(returnTo);
  const productsHref = original ? productListUrl(original.id, 1, "", back) : "";
  function draftChanged() {
    if (!original) return false;
    if (file) return true;
    return (
      name !== original.name ||
      representative !== original.field ||
      fields.length !== original.fields.length ||
      fields.some((item, index) => item !== original.fields[index]) ||
      storeId !== (original.store_id || "") ||
      intro !== (original.intro || "") ||
      description !== (original.description || "") ||
      tags.length !== original.tags.length ||
      tags.some((item, index) => item !== original.tags[index]) ||
      careers.length !== original.careers.length ||
      careers.some((item, index) => item !== original.careers[index]) ||
      path !== (original.image_path || "") ||
      recommended !== original.is_recommended ||
      isNew !== original.is_new ||
      active !== original.is_active ||
      sortOrder !== String(original.sort_order)
    );
  }
  const imageSrc = file ? preview : publicImageUrl(path);
  const knownStore = stores.some((store) => store.id === storeId);
  useLayoutEffect(() => {
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
  function applyRow(row: CounselorRecord) {
    setOriginal(row);
    setName(row.name);
    setFields(row.fields);
    setRepresentative(row.field);
    setStoreId(row.store_id || "");
    setIntro(row.intro || "");
    setDescription(row.description || "");
    setTags(row.tags);
    setCareers(row.careers);
    setPath(row.image_path || "");
    setRecommended(row.is_recommended);
    setIsNew(row.is_new);
    setActive(row.is_active);
    setSortOrder(String(row.sort_order));
  }
  function form(image = path) {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      id: original?.id || draftId,
      mode: original ? "update" : "create",
      version: original?.updated_at || "",
      name,
      field: representative,
      fields: JSON.stringify(fields),
      tags: JSON.stringify(tags),
      careers: JSON.stringify(careers),
      intro,
      description,
      image_path: image,
      store_id: storeId,
      is_recommended: String(recommended),
      is_new: String(isNew),
      is_active: String(active),
      sort_order: sortOrder,
    }))
      data.set(key, value);
    return data;
  }
  function finish(result: Result, image = uploaded.current || path) {
    setModal(null);
    setMessage(
      result.cleanup
        ? "DB 저장은 끝났지만 이전 사진 정리가 남았습니다. 정리만 다시 시도해 주세요."
        : result.message,
    );
    setErrors(result.errors || {});
    if (result.state === "saved" && result.row) {
      const created = !original;
      queueCounselorRefresh(result.row.id);
      applyRow(result.row);
      setFile(null);
      uploaded.current = null;
      setHasUpload(false);
      uploadToken.current = null;
      confirmToken.current = null;
      setCleanup(() => result.cleanup);
      setDone(Boolean(result.cleanup));
      setConflict(false);
      setUncertain(false);
      if (!result.cleanup) {
        if (created) {
          setOriginal(null);
          setName("");
          setFields([]);
          setRepresentative("");
          setStoreId("");
          setIntro("");
          setDescription("");
          setTags([]);
          setCareers([]);
          setPath("");
          setRecommended(false);
          setIsNew(false);
          setActive(false);
          setSortOrder("0");
          setDraftId(crypto.randomUUID());
        }
        router.replace(
          `${back}${back.includes("?") ? "&" : "?"}counselor=saved`,
        );
      }
      return;
    }
    setConflict(result.state === "conflict");
    setUncertain(result.state === "unknown");
    if (image && uploaded.current) setHasUpload(true);
  }
  function toggleField(value: CounselorField) {
    const selected = fields.includes(value);
    setFields(
      selected ? fields.filter((item) => item !== value) : [...fields, value],
    );
    if (selected && representative === value) setRepresentative("");
  }
  function move(
    list: string[],
    setList: (value: string[]) => void,
    index: number,
    direction: -1 | 1,
  ) {
    const next = index + direction;
    if (next < 0 || next >= list.length) return;
    const copy = [...list];
    const current = copy[index];
    copy[index] = copy[next];
    copy[next] = current;
    setList(copy);
  }
  async function run() {
    if (lock.current || modal === "products") return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (modal === "reload") {
        const loaded = await reloadCounselor(original?.id || draftId);
        if (loaded.row) {
          originalCleanup.current = loaded.recovery;
          applyRow(loaded.row);
          setFile(null);
          uploaded.current = null;
          setHasUpload(false);
          uploadToken.current = null;
          confirmToken.current = null;
          setConflict(false);
          setUncertain(false);
          setErrors({});
          setModal(null);
          setMessage(loaded.message);
        } else setMessage(loaded.message);
        return;
      }
      const attempt = await submitCounselorAttempt(
        {
          upload: async () => {
            if (uploaded.current) return uploaded.current;
            const { ext } = await inspectImage(file!);
            const reserved = await prepareCounselorUpload(ext);
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
                {
                  definite: false,
                },
              );
            }
          },
          save: (nextPath) => saveCounselor(form(nextPath)),
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
      lock.current = false;
      setBusy(false);
    }
  }
  async function reconcile() {
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
      const loaded = await reloadCounselor(original?.id || draftId);
      if (
        loaded.state === "unknown" ||
        (loaded.state === "rejected" && !loaded.missing)
      ) {
        setMessage(loaded.message);
        return;
      }
      const expected = form(uploaded.current || path);
      if (loaded.row && counselorMatches(loaded.row, expected)) {
        const pending =
          original?.image_path && original.image_path !== loaded.row.image_path
            ? originalCleanup.current
            : undefined;
        const retryCleanup = pending ? () => pending(expected) : undefined;
        let remaining = retryCleanup;
        try {
          if (retryCleanup && (await retryCleanup())) remaining = undefined;
        } catch {
          /* 정리 권한은 유지한다. */
        }
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
          : "현재 저장 내용과 일치하지 않습니다. 최신 내용을 확인하거나 다시 저장해 주세요.",
      );
    } catch {
      setMessage(
        "저장 결과를 확인하지 못했습니다. 파일을 보존하고 다시 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function retryCleanup() {
    if (!cleanup) return;
    setBusy(true);
    try {
      if (await cleanup()) {
        setCleanup(undefined);
        setDone(false);
        router.replace(
          `${back}${back.includes("?") ? "&" : "?"}counselor=saved`,
        );
      } else
        setMessage(
          "DB 저장은 끝났지만 파일 정리가 끝나지 않았습니다. 잠시 후 정리만 다시 시도해 주세요.",
        );
    } catch {
      setMessage(
        "DB 저장은 끝났지만 파일 정리 응답을 확인하지 못했습니다. 정리만 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  const control =
    "mt-1 w-full min-w-0 min-h-11 rounded-button border border-border bg-surface p-3";
  const approval = original?.approval_status;
  return (
    <div className="space-y-4 wrap-anywhere">
      <div className="flex flex-wrap gap-2">
        <Button href={back} variant="secondary">
          목록으로 돌아가기
        </Button>
        {original && (
          <Link
            href={productsHref}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-button border border-brand bg-surface px-3 text-sm font-semibold text-brand"
            onClick={(event) => {
              if (busy || uncertain || done) {
                event.preventDefault();
                return;
              }
              if (!draftChanged()) return;
              event.preventDefault();
              setModal("products");
            }}
          >
            상품 관리
          </Link>
        )}
      </div>
      <h1 className="text-xl font-bold">
        {initial ? "상담사 편집" : "상담사 등록"}
      </h1>
      <p className="text-sm text-muted">
        비공개 상담사 사진도 주소를 알면 누구나 볼 수 있습니다. 공개할 수 있는
        사진만 올려 주세요.
      </p>
      {approval && approval !== "approved" && (
        <p role="status" className="text-sm text-error">
          이 상담사는 {approvalLabel[approval]} 상태입니다. 공개를 체크해도 고객
          화면에는 보이지 않습니다.
        </p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const standIn = file ? `counselors/${draftId}.png` : path;
          const parsed = parseCounselor(form(standIn));
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
          disabled={!draftId || busy || done || uncertain}
          className="min-w-0 space-y-4"
        >
          <div>
            <label htmlFor={`${prefix}-name`}>이름</label>
            <input
              id={`${prefix}-name`}
              name="name"
              maxLength={30}
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
          <fieldset
            id={`${prefix}-fields`}
            tabIndex={-1}
            className="min-w-0 space-y-2"
          >
            <legend className="font-semibold">전체 분야</legend>
            <p className="text-sm text-muted">
              타로와 사주 중 하나 이상 선택합니다.
            </p>
            {(["tarot", "saju"] as const).map((value) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={fields.includes(value)}
                  onChange={() => toggleField(value)}
                />
                {fieldLabel[value]}
              </label>
            ))}
            <p role="alert" className="text-error">
              {errors.fields}
            </p>
          </fieldset>
          <fieldset
            id={`${prefix}-field`}
            tabIndex={-1}
            className="min-w-0 space-y-2"
          >
            <legend className="font-semibold">대표 분야</legend>
            {fields.length ? (
              fields.map((value) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center gap-2"
                >
                  <input
                    type="radio"
                    name="representative"
                    checked={representative === value}
                    onChange={() => setRepresentative(value)}
                  />
                  {fieldLabel[value]}
                </label>
              ))
            ) : (
              <p className="text-sm text-muted">
                전체 분야를 먼저 선택해 주세요.
              </p>
            )}
            <p role="alert" className="text-error">
              {errors.field}
            </p>
          </fieldset>
          <div>
            <label htmlFor={`${prefix}-store_id`}>소속 매장</label>
            <select
              id={`${prefix}-store_id`}
              name="store_id"
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              className={control}
            >
              <option value="">미지정</option>
              {storeId && !knownStore && (
                <option value={storeId}>저장된 매장 (목록에 없음)</option>
              )}
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                  {store.is_active ? "" : " (숨김)"}
                </option>
              ))}
            </select>
            <p role="alert" className="text-error">
              {errors.store_id}
            </p>
          </div>
          <div>
            <label htmlFor={`${prefix}-intro`}>한 줄 소개</label>
            <input
              id={`${prefix}-intro`}
              name="intro"
              maxLength={150}
              value={intro}
              onChange={(event) => setIntro(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.intro)}
            />
            <p className="text-right text-sm text-muted">
              {intro.length} / 150자
            </p>
            <p role="alert" className="text-error">
              {errors.intro}
            </p>
          </div>
          <div>
            <label htmlFor={`${prefix}-description`}>상세 소개</label>
            <textarea
              id={`${prefix}-description`}
              name="description"
              rows={8}
              maxLength={5000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.description)}
            />
            <p className="text-right text-sm text-muted">
              {description.length} / 5000자
            </p>
            <p role="alert" className="text-error">
              {errors.description}
            </p>
          </div>
          <ItemList
            id={`${prefix}-tags`}
            title="상담 주제"
            help="분야와 별도로 연애운, 진로처럼 상담 주제를 적습니다. 이미 저장된 주제는 자동으로 지우거나 분야로 옮기지 않습니다."
            items={tags}
            limit={8}
            maxLength={20}
            addLabel="주제 추가"
            onChange={setTags}
            error={errors.tags}
            moveItem={(index, direction) =>
              move(tags, setTags, index, direction)
            }
          />
          <ItemList
            id={`${prefix}-careers`}
            title="경력·교육·자격"
            help="한 칸에 하나씩 적습니다. 입력한 순서대로 저장하고, 이수·자격·경력의 뜻은 바꾸지 않습니다."
            items={careers}
            limit={20}
            maxLength={200}
            addLabel="경력 추가"
            onChange={setCareers}
            error={errors.careers}
            moveItem={(index, direction) =>
              move(careers, setCareers, index, direction)
            }
          />
          <section
            aria-labelledby={`${prefix}-image-heading`}
            className="space-y-3 rounded-card border border-border bg-surface p-3 md:p-4"
          >
            <h2 id={`${prefix}-image-heading`} className="text-lg font-bold">
              사진
            </h2>
            <label className="block" htmlFor={`${prefix}-image_path`}>
              사진 선택
              <input
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
                  height={1200}
                  src={imageSrc}
                  alt={
                    name.trim()
                      ? `${name.trim()} 사진 미리보기`
                      : "선택한 사진 미리보기"
                  }
                  className="h-auto max-h-80 w-auto max-w-full object-contain"
                  data-counselor-image-preview
                />
                <a
                  href={imageSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 cursor-pointer items-center text-brand underline"
                >
                  사진 크게 보기
                </a>
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
            <label htmlFor={`${prefix}-sort_order`}>표시 순서</label>
            <input
              id={`${prefix}-sort_order`}
              name="sort_order"
              inputMode="numeric"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.sort_order)}
            />
            <p className="text-sm text-muted">0부터 9999까지의 정수입니다.</p>
            <p role="alert" className="text-error">
              {errors.sort_order}
            </p>
          </div>
          <div className="space-y-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={recommended}
                onChange={(event) => setRecommended(event.target.checked)}
              />
              추천 상담사
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isNew}
                onChange={(event) => setIsNew(event.target.checked)}
              />
              신규 상담사
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              공개
            </label>
            <p className="text-sm text-muted">
              고객 화면에서 숨기려면 공개를 해제합니다. 상담사 삭제는 하지
              않습니다.
            </p>
          </div>
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
        <Button disabled={busy} onClick={reconcile}>
          저장 결과 다시 확인
        </Button>
      )}
      {hasUpload && !uncertain && !done && (
        <Button
          disabled={busy}
          onClick={async () => {
            if (!uploadToken.current) return;
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
              setBusy(false);
            }
          }}
        >
          이번 업로드 파일 정리만 재시도
        </Button>
      )}
      {cleanup && (
        <Button disabled={busy} onClick={retryCleanup}>
          파일 정리만 재시도
        </Button>
      )}
      {modal && (
        <Modal
          title={
            modal === "reload"
              ? "최신 내용 불러오기"
              : modal === "products"
                ? "저장하지 않은 입력"
                : "상담사 저장 확인"
          }
          busy={busy}
          onClose={() => {
            if (!busy) setModal(null);
          }}
          footer={
            <>
              {modal === "products" ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    router.push(productsHref);
                  }}
                >
                  상품 관리로 이동
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
          {modal === "reload" ? (
            <p>
              작성 중인 입력과 선택한 사진이 사라지고 최신 내용으로 바뀝니다.
            </p>
          ) : modal === "products" ? (
            <p>
              저장하지 않은 입력이 있습니다. 상품 관리로 이동하면 작성 중인
              내용이 사라집니다.
            </p>
          ) : (
            <>
              <p>{name.trim() || "이름 없음"}</p>
              <p>
                전체 분야{" "}
                {fields.map((item) => fieldLabel[item]).join("·") || "없음"} ·
                대표 {representative ? fieldLabel[representative] : "없음"}
              </p>
              <p>
                {active ? "공개" : "비공개"} · 추천{" "}
                {recommended ? "예" : "아니오"} · 신규 {isNew ? "예" : "아니오"}
              </p>
              <p>
                공개를 해제하면 고객 화면에서 숨겨집니다. 상담사는 삭제하지
                않습니다.
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function ItemList({
  id,
  title,
  help,
  items,
  limit,
  maxLength,
  addLabel,
  onChange,
  error,
  moveItem,
}: {
  id: string;
  title: string;
  help: string;
  items: string[];
  limit: number;
  maxLength: number;
  addLabel: string;
  onChange: (items: string[]) => void;
  error?: string;
  moveItem: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} tabIndex={-1} className="font-semibold">
        {title}
      </h2>
      <p className="text-sm text-muted">{help}</p>
      {items.map((item, index) => (
        <div
          key={`${title}-${index}`}
          className="space-y-2 rounded-card border border-border p-3"
        >
          <label className="block" htmlFor={`${id}-${index}`}>
            {title} {index + 1}
            <input
              id={`${id}-${index}`}
              maxLength={maxLength}
              value={item}
              onChange={(event) =>
                onChange(
                  items.map((current, currentIndex) =>
                    currentIndex === index ? event.target.value : current,
                  ),
                )
              }
              className="mt-1 w-full min-w-0 min-h-11 rounded-button border border-border bg-surface p-3"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={index === 0}
              onClick={() => moveItem(index, -1)}
            >
              위로
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={index === items.length - 1}
              onClick={() => moveItem(index, 1)}
            >
              아래로
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                onChange(items.filter((_, current) => current !== index))
              }
            >
              삭제
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={items.length >= limit}
        onClick={() => onChange([...items, ""])}
      >
        {addLabel}
      </Button>
      <p className="text-sm text-muted">
        {items.length} / {limit}개
      </p>
      <p role="alert" className="text-error">
        {error}
      </p>
    </section>
  );
}
