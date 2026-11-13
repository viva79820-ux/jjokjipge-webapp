"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  reloadProduct,
  saveProduct,
  type Result,
} from "@/lib/counselor-products/actions";
import {
  parseProduct,
  productListUrl,
  productMatches,
  type ProductCounselor,
  type ProductRecord,
} from "@/lib/counselor-products/rules";
import { submitProductAttempt } from "@/lib/counselor-products/submit";

export function ProductEditor({
  counselor,
  initial,
  page,
  status,
  counselorReturn,
}: {
  counselor: ProductCounselor;
  initial: ProductRecord | null;
  page: number;
  status: string;
  counselorReturn: string;
}) {
  const [original, setOriginal] = useState(initial);
  const [draftId, setDraftId] = useState("");
  const [name, setName] = useState(initial?.name || "");
  const [minutes, setMinutes] = useState(
    initial ? String(initial.minutes) : "",
  );
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [sortOrder, setSortOrder] = useState(
    initial ? String(initial.sort_order) : "0",
  );
  const [active, setActive] = useState(initial ? initial.is_active : false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"save" | "reload" | "leave" | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const baseline = useRef(initial);
  const leaving = useRef(false);
  const reloadRef = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const router = useRouter();
  const listHref = productListUrl(counselor.id, page, status, counselorReturn);
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
        name !== "" ||
        minutes !== "" ||
        price !== "" ||
        sortOrder !== "0" ||
        active
      );
    return (
      name !== original.name ||
      minutes !== String(original.minutes) ||
      price !== String(original.price) ||
      sortOrder !== String(original.sort_order) ||
      active !== original.is_active
    );
  }
  function applyRow(row: ProductRecord) {
    baseline.current = row;
    setOriginal(row);
    setName(row.name);
    setMinutes(String(row.minutes));
    setPrice(String(row.price));
    setSortOrder(String(row.sort_order));
    setActive(row.is_active);
  }
  function form() {
    const source = baseline.current;
    const data = new FormData();
    for (const [key, value] of Object.entries({
      id: source?.id || draftId,
      mode: source ? "update" : "create",
      version: source?.updated_at || "",
      counselor_id: counselor.id,
      name,
      minutes,
      price,
      sort_order: sortOrder,
      is_active: String(active),
    }))
      data.set(key, value);
    return data;
  }
  function finish(result: Result) {
    setModal(null);
    setMessage(result.message);
    setErrors(result.errors || {});
    if (result.resetAttempt && !original) setDraftId(crypto.randomUUID());
    if (result.state === "saved" && result.row) {
      if (original) applyRow(result.row);
      leaving.current = true;
      setConflict(false);
      setUncertain(false);
      router.replace(
        productListUrl(counselor.id, page, status, counselorReturn, true),
      );
      return;
    }
    setConflict(result.state === "conflict");
    setUncertain(result.state === "unknown");
  }
  async function run() {
    if (lock.current || leaving.current || modal === "leave") return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (modal === "reload") {
        const loaded = await reloadProduct(
          counselor.id,
          original?.id || draftId,
        );
        if (loaded.row) {
          applyRow(loaded.row);
          setConflict(false);
          setUncertain(false);
          setErrors({});
          setModal(null);
          setMessage(loaded.message);
        } else setMessage(loaded.message);
        return;
      }
      finish(await submitProductAttempt(() => saveProduct(form())));
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
      const loaded = await reloadProduct(counselor.id, original?.id || draftId);
      if (
        loaded.state === "unknown" ||
        (loaded.state === "rejected" && !loaded.missing)
      ) {
        setMessage(loaded.message);
        return;
      }
      if (loaded.row && productMatches(loaded.row, form())) {
        finish({
          ...loaded,
          state: "saved",
          message: "저장 결과를 확인했습니다.",
        });
        return;
      }
      setUncertain(false);
      if (loaded.row) setConflict(true);
      setMessage(
        loaded.missing
          ? "저장은 반영되지 않았습니다. 입력은 유지됩니다. 다시 저장할 수 있습니다."
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
  const visible =
    counselor.is_active && counselor.approval_status === "approved";
  return (
    <div className="space-y-4 wrap-anywhere">
      <Link
        href={listHref}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-button border border-brand bg-surface px-3 text-sm font-semibold text-brand"
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
        상품 목록으로
      </Link>
      <h1 className="text-xl font-bold">
        {initial ? "상담 상품 편집" : "상담 상품 등록"}
      </h1>
      <p className="font-semibold">{counselor.name}</p>
      <div className="space-y-1 text-sm text-muted">
        <p>
          상품을 공개해도 상담사가 비공개이거나 승인되지 않았으면 고객 화면에는
          표시되지 않습니다.
        </p>
        <p>상품을 수정해도 기존 예약의 상품명·시간·금액은 바뀌지 않습니다.</p>
        <p>판매를 중단하려면 비공개로 전환합니다. 상품은 삭제하지 않습니다.</p>
        {!visible && (
          <p role="status" className="text-error">
            이 상담사는 지금 고객 화면에 공개되어 있지 않습니다.
          </p>
        )}
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = parseProduct(form());
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
          disabled={busy || uncertain || (!initial && !draftId)}
          className="min-w-0 space-y-4"
        >
          <div>
            <label htmlFor={`${prefix}-name`}>상품명</label>
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
            <label htmlFor={`${prefix}-minutes`}>상담 시간(분)</label>
            <input
              id={`${prefix}-minutes`}
              name="minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.minutes)}
              aria-describedby={`${prefix}-minutes-error`}
            />
            <p className="text-sm text-muted">
              분 단위의 양의 정수입니다. 30분 배수로 제한하지 않습니다.
            </p>
            <p
              id={`${prefix}-minutes-error`}
              role="alert"
              className="text-error"
            >
              {errors.minutes}
            </p>
          </div>
          <div>
            <label htmlFor={`${prefix}-price`}>가격(원)</label>
            <input
              id={`${prefix}-price`}
              name="price"
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.price)}
              aria-describedby={`${prefix}-price-error`}
            />
            <p className="text-sm text-muted">0원도 저장할 수 있습니다.</p>
            <p id={`${prefix}-price-error`} role="alert" className="text-error">
              {errors.price}
            </p>
          </div>
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
              작은 수가 앞에 옵니다. 비어 있으면 저장되지 않고, 새 상품의 처음
              값은 0입니다.
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
        <Button disabled={busy} onClick={reconcile}>
          저장 결과 다시 확인
        </Button>
      )}
      {modal && (
        <Modal
          title={
            modal === "reload"
              ? "최신 내용 불러오기"
              : modal === "leave"
                ? "저장하지 않은 입력"
                : "상담 상품 저장 확인"
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
          {modal === "reload" ? (
            <p>작성 중인 입력이 사라지고 최신 내용으로 바뀝니다.</p>
          ) : modal === "leave" ? (
            <p>
              저장하지 않은 입력이 있습니다. 목록으로 이동하면 작성 중인 내용이
              사라집니다.
            </p>
          ) : (
            <>
              <p>{name.trim() || "이름 없음"}</p>
              <p>
                {minutes || "0"}분 · {price || "0"}원 · 정렬 {sortOrder || "0"}
              </p>
              <p>{active ? "공개" : "비공개"}</p>
              <p>
                판매를 중단하려면 비공개로 전환합니다. 상품은 삭제하지 않습니다.
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
