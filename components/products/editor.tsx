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
import { formatTime } from "@/lib/admin/reservation-rules";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import {
  confirmProduct,
  prepareProductUpload,
  reloadProduct,
  saveProduct,
  type Result,
} from "@/lib/products/actions";
import { submitProductAttempt } from "@/lib/products/submit";
import {
  inspectImage,
  uploadImage,
  uploadLookupMessage,
} from "@/lib/products/upload";
import {
  formatWon,
  parseProduct,
  productListUrl,
  productEditUrl,
  publicImageUrl,
  type ProductRecord,
} from "@/lib/products/rules";
import { ProductPhoto } from "./photo";

const fields = [
  "name",
  "description",
  "price",
  "image_path",
  "image_alt",
  "is_published",
  "is_sold_out",
  "sort_order",
] as const;

// 신규 등록 화면이 바뀐 뒤에도 이전 업로드만 정리할 수 있게 함수를 넘긴다.
let pendingCreateCleanup: {
  productId: string;
  job: () => Promise<boolean>;
} | null = null;
const createCleanupListeners = new Set<() => void>();

function notifyCreateCleanup() {
  for (const listener of createCleanupListeners) listener();
}

function subscribeCreateCleanup(listener: () => void) {
  createCleanupListeners.add(listener);
  return () => {
    createCleanupListeners.delete(listener);
  };
}

function readCreateCleanup(productId?: string) {
  if (!productId || pendingCreateCleanup?.productId !== productId) return null;
  return pendingCreateCleanup;
}

function rememberCreateCleanup(productId: string, job: () => Promise<boolean>) {
  pendingCreateCleanup = { productId, job };
  notifyCreateCleanup();
}

function forgetCreateCleanup(productId?: string, job?: () => Promise<boolean>) {
  if (
    !pendingCreateCleanup ||
    (pendingCreateCleanup.job !== job &&
      pendingCreateCleanup.productId !== productId)
  )
    return;
  pendingCreateCleanup = null;
  notifyCreateCleanup();
}

export function ProductEditor({
  initial,
  page,
  status,
  initialMessage,
  initialCleanup,
}: {
  initial: ProductRecord | null;
  page: number;
  status: string;
  initialMessage: string;
  initialCleanup?: (expected?: FormData) => Promise<boolean>;
}) {
  const handed = useSyncExternalStore(
    subscribeCreateCleanup,
    () => readCreateCleanup(initial?.id),
    () => null,
  );
  const [original, setOriginal] = useState(initial);
  const [draftId, setDraftId] = useState("");
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [path, setPath] = useState(initial?.image_path || "");
  const [alt, setAlt] = useState(initial?.image_alt || "");
  const [published, setPublished] = useState(initial?.is_published || false);
  const [soldOut, setSoldOut] = useState(initial?.is_sold_out || false);
  const [sortOrder, setSortOrder] = useState(
    initial ? String(initial.sort_order) : "0",
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<
    "save" | "delete" | "reload" | "leave" | null
  >(null);
  const [message, setMessage] = useState(initialMessage);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [attemptMode, setAttemptMode] = useState<
    "create" | "update" | "delete" | ""
  >("");
  const lock = useRef(false);
  const attemptRef = useRef<FormData | null>(null);
  const baseline = useRef(initial);
  const leaving = useRef(false);
  const createdNavigate = useRef(false);
  const visible = useRef(true);
  const pendingHref = useRef<string | null>(null);
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
  const cleanupRef = useRef<(() => Promise<boolean>) | undefined>(undefined);
  const reloadRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const prefix = useId();
  const router = useRouter();
  const routerRef = useRef(router);
  const listHref = productListUrl(true, page, status);
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
      setName("");
      setDescription("");
      setPrice("");
      setPath("");
      setAlt("");
      setPublished(false);
      setSoldOut(false);
      setSortOrder("0");
      setFile(null);
      setErrors({});
      setMessage("");
      setConflict(false);
      setUncertain(false);
      setAttemptMode("");
      attemptRef.current = null;
      uploaded.current = null;
      uploadedFile.current = null;
      uploadToken.current = null;
      confirmToken.current = null;
      setDraftId("");
      cleanupRef.current = undefined;
      setCleanupPending(false);
    };
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
    if (!original)
      return (
        name !== "" ||
        description !== "" ||
        price !== "" ||
        path !== "" ||
        alt !== "" ||
        published ||
        soldOut ||
        sortOrder !== "0" ||
        file !== null
      );
    return (
      name !== original.name ||
      description !== original.description ||
      price !== String(original.price) ||
      path !== (original.image_path || "") ||
      alt !== (original.image_alt || "") ||
      published !== original.is_published ||
      soldOut !== original.is_sold_out ||
      sortOrder !== String(original.sort_order) ||
      file !== null
    );
  }
  function applyRow(row: ProductRecord) {
    baseline.current = row;
    setOriginal(row);
    setName(row.name);
    setDescription(row.description);
    setPrice(String(row.price));
    setPath(row.image_path || "");
    setAlt(row.image_alt || "");
    setPublished(row.is_published);
    setSoldOut(row.is_sold_out);
    setSortOrder(String(row.sort_order));
    setFile(null);
    uploaded.current = null;
    uploadedFile.current = null;
    uploadToken.current = null;
    confirmToken.current = null;
    if (fileRef.current) fileRef.current.value = "";
  }
  function form(
    mode: "create" | "update" | "delete" = baseline.current
      ? "update"
      : "create",
    image = path,
  ) {
    const source = baseline.current;
    const data = new FormData();
    for (const [key, value] of Object.entries({
      id: source?.id || draftId,
      mode,
      version: source?.updated_at || "",
      name,
      description,
      price,
      image_path: image,
      image_alt: alt,
      is_published: String(published),
      is_sold_out: String(soldOut),
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
    const nextMode = copy.get("mode");
    setAttemptMode(
      nextMode === "create" || nextMode === "update" || nextMode === "delete"
        ? nextMode
        : "",
    );
  }
  function forgetAttempt() {
    attemptRef.current = null;
    setAttemptMode("");
  }
  function replaceWhenShown(href: string) {
    routerRef.current = router;
    if (!visible.current) {
      pendingHref.current = href;
      return;
    }
    pendingHref.current = null;
    router.replace(href);
  }
  function keepCleanup(job?: () => Promise<boolean>) {
    if (!job) return;
    const previous = cleanupRef.current;
    cleanupRef.current = previous
      ? async () => Boolean((await previous()) && (await job()))
      : job;
    setCleanupPending(true);
  }
  function clearCleanup() {
    cleanupRef.current = undefined;
    setCleanupPending(false);
  }
  function finish(result: Result) {
    setModal(null);
    setErrors(result.errors || {});
    if (result.state !== "unknown") forgetAttempt();
    if (result.recovery) originalCleanup.current = result.recovery;
    if (result.deleted) {
      setRemoved(true);
      setConflict(false);
      setUncertain(false);
      keepCleanup(result.cleanup);
      setMessage(
        result.cleanup
          ? "상품 삭제를 확인했습니다. 사진은 사진 정리 버튼으로만 지웁니다."
          : result.message,
      );
      focusStatus();
      if (!result.cleanup)
        replaceWhenShown(productListUrl(true, page, status, "deleted"));
      return;
    }
    if (result.state === "saved" && result.row) {
      if (result.recovery) originalCleanup.current = result.recovery;
      else if (!result.row.image_path) originalCleanup.current = undefined;
      keepCleanup(result.cleanup);
      if (!baseline.current) {
        if (cleanupRef.current)
          rememberCreateCleanup(result.row.id, cleanupRef.current);
        else forgetCreateCleanup(result.row.id);
        createdNavigate.current = true;
        applyRow(result.row);
        leaving.current = true;
        setMessage(
          result.cleanup
            ? "상품을 저장했습니다. 이전 사진은 사진 정리 버튼으로만 지웁니다."
            : result.message,
        );
        setConflict(false);
        setUncertain(false);
        focusStatus();
        replaceWhenShown(productEditUrl(result.row.id, page, status, "saved"));
        return;
      }
      applyRow(result.row);
      setMessage(
        result.cleanup
          ? "상품을 저장했습니다. 이전 사진은 사진 정리 버튼으로만 지웁니다."
          : result.message,
      );
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
        const loaded = await reloadProduct(original?.id || draftId);
        if (loaded.row) {
          originalCleanup.current = loaded.recovery;
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
        finish(await saveProduct(data));
        return;
      }
      const attempt = await submitProductAttempt(
        {
          upload: async () => {
            if (uploaded.current && uploadedFile.current === file)
              return uploaded.current;
            let ext = "";
            try {
              ext = (await inspectImage(file!)).ext;
            } catch (error) {
              throw Object.assign(
                error instanceof Error ? error : Error("사진을 확인해 주세요."),
                { definite: true },
              );
            }
            const reserved = await prepareProductUpload(ext);
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
            if (replacing && previousCleanup) {
              const retire = previousCleanup;
              keepCleanup(() => retire());
            }
            try {
              return await uploadImage(createClient(), file!, reserved.path);
            } catch (error) {
              let uploadState:
                | "present"
                | "missing"
                | "rejected"
                | "forbidden"
                | "unavailable"
                | "unknown" = "unknown";
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
          save: (nextPath) => saveProduct(form(undefined, nextPath)),
          discard: async () =>
            uploadToken.current ? await uploadToken.current() : false,
          pendingUpload: () => uploaded.current,
        },
        path,
        Boolean(file),
      );
      uploaded.current = attempt.uploaded;
      if (!attempt.uploaded) uploadedFile.current = null;
      const savedForm = form(
        baseline.current ? "update" : "create",
        attempt.uploaded || path,
      );
      remember(savedForm);
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
      let photo = "";
      if (uploaded.current && confirmToken.current && mode !== "delete") {
        try {
          photo = await confirmToken.current();
        } catch {
          photo = "unknown";
        }
      }
      const checked = await confirmProduct(id, attempt);
      const photoNote =
        photo && photo !== "present" ? uploadLookupMessage(photo) : "";
      if (checked.state === "unknown") {
        const base =
          mode === "delete"
            ? "삭제 결과를 확인하지 못했습니다. 다시 확인해 주세요."
            : "저장 결과를 확인하지 못했습니다. 입력은 유지하고 다시 확인해 주세요.";
        setMessage(photoNote ? `${photoNote} ${base}` : base);
        focusStatus();
        return;
      }
      if (mode === "delete") {
        if (checked.deleted) {
          const pending = originalCleanup.current;
          const remaining = pending ? () => pending(attempt) : undefined;
          finish({ ...checked, cleanup: remaining });
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
        setMessage(checked.message);
        focusStatus();
        return;
      }
      if (checked.unchanged) {
        forgetAttempt();
        setUncertain(false);
        setConflict(false);
        if (photo === "missing") {
          uploaded.current = null;
          uploadedFile.current = null;
          uploadToken.current = null;
          confirmToken.current = null;
          setMessage(
            "업로드된 파일이 없습니다. 상품은 수정 전 버전 그대로입니다. 다시 저장할 수 있습니다.",
          );
        } else
          setMessage(
            photoNote ? `${checked.message} ${photoNote}` : checked.message,
          );
        focusStatus();
        return;
      }
      if (
        checked.state === "rejected" &&
        !checked.missing &&
        !checked.unchanged
      ) {
        setMessage(
          photoNote ? `${checked.message} ${photoNote}` : checked.message,
        );
        focusStatus();
        return;
      }
      if (checked.state === "saved" && checked.row) {
        const previous = baseline.current?.image_path;
        const pending =
          previous && previous !== checked.row.image_path
            ? originalCleanup.current
            : undefined;
        const remaining = pending ? () => pending(attempt) : undefined;
        if (checked.recovery) originalCleanup.current = checked.recovery;
        finish({
          ...checked,
          cleanup: remaining,
          message: photoNote
            ? `저장 결과를 확인했습니다. ${photoNote}`
            : "저장 결과를 확인했습니다.",
        });
        return;
      }
      forgetAttempt();
      setUncertain(false);
      if (checked.state === "conflict") setConflict(true);
      if (checked.missing && mode === "create") {
        if (photo === "missing") {
          uploaded.current = null;
          uploadedFile.current = null;
          uploadToken.current = null;
          confirmToken.current = null;
        }
        setMessage(
          "저장은 반영되지 않았습니다. 입력은 유지됩니다. 다시 저장할 수 있습니다.",
        );
      } else if (checked.state === "conflict" || checked.missing)
        setMessage(
          photoNote ? `${checked.message} ${photoNote}` : checked.message,
        );
      else
        setMessage(
          uploaded.current
            ? `${checked.message} 업로드한 사진은 보존했습니다.`
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
  async function retryCleanup() {
    const job = cleanupRef.current ?? handed?.job;
    if (!job || lock.current || leaving.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (await job()) {
        forgetCreateCleanup(original?.id, job);
        clearCleanup();
        setMessage(
          removed ? "상품을 삭제했습니다." : "사진 정리를 마쳤습니다.",
        );
        focusStatus();
        if (removed)
          replaceWhenShown(productListUrl(true, page, status, "deleted"));
      } else {
        setMessage(
          removed
            ? "상품 삭제는 반영됐습니다. 사진 정리만 다시 시도해 주세요."
            : "상품 저장은 반영됐습니다. 사진 정리만 다시 시도해 주세요.",
        );
        focusStatus();
      }
    } catch {
      setMessage(
        removed
          ? "상품 삭제는 반영됐습니다. 사진 정리 응답을 확인하지 못했습니다."
          : "상품 저장은 반영됐습니다. 사진 정리 응답을 확인하지 못했습니다.",
      );
      focusStatus();
    } finally {
      if (!leaving.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  const photoSrc = file ? preview : publicImageUrl(path);
  if (removed)
    return (
      <div className="space-y-4" data-product-editor="removed">
        <p role="status" className="text-body text-brand">
          {message || "이 상품은 삭제되었습니다."}
        </p>
        {cleanupPending && (
          <Button disabled={busy} onClick={retryCleanup}>
            사진 정리 다시 시도
          </Button>
        )}
        <Button href={listHref} variant="secondary">
          상품 목록
        </Button>
      </div>
    );
  return (
    <div
      className="space-y-4 wrap-anywhere"
      data-product-editor={original ? "edit" : "new"}
      data-product-id={original?.id || draftId}
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
        상품 목록으로
      </Link>
      <h1 className="text-display font-extrabold">
        {original ? "상품 편집" : "상품 등록"}
      </h1>
      <p className="text-caption text-muted">
        새 상품은 비공개로 시작합니다. 공개와 품절은 따로 저장됩니다. 사진은
        선택이며, 공개 버킷에 올리면 주소를 아는 사람은 볼 수 있습니다.
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
          const placeholder = file ? `products/${draftId}.png` : path;
          const parsed = parseProduct(form(undefined, placeholder));
          setErrors(parsed.errors);
          const first = fields.find((key) => parsed.errors[key]);
          if (first) {
            document.getElementById(`${prefix}-${first}`)?.focus();
            return;
          }
          if (file) {
            void inspectImage(file)
              .then(() => setModal("save"))
              .catch((error: unknown) => {
                setErrors({
                  image_path:
                    error instanceof Error
                      ? error.message
                      : "사진을 확인해 주세요.",
                });
                document.getElementById(`${prefix}-image_path`)?.focus();
              });
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
              htmlFor={`${prefix}-name`}
              className="text-label font-semibold"
            >
              상품명
            </label>
            <input
              id={`${prefix}-name`}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={`${prefix}-name-error`}
            />
            <p
              id={`${prefix}-name-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.name}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-description`}
              className="text-label font-semibold"
            >
              상품 설명
            </label>
            <textarea
              id={`${prefix}-description`}
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${control} min-h-32 resize-y whitespace-pre-wrap`}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={`${prefix}-description-error`}
            />
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
              htmlFor={`${prefix}-price`}
              className="text-label font-semibold"
            >
              가격
            </label>
            <input
              id={`${prefix}-price`}
              name="price"
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.price)}
              aria-describedby={`${prefix}-price-hint ${prefix}-price-error`}
            />
            <p id={`${prefix}-price-hint`} className="text-caption text-muted">
              1원 이상 2147483647원 이하의 정수입니다.
            </p>
            <p
              id={`${prefix}-price-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.price}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-image_path`}
              className="text-label font-semibold"
            >
              대표 사진
            </label>
            <input
              ref={fileRef}
              id={`${prefix}-image_path`}
              name="image_file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={`${control} cursor-pointer`}
              aria-invalid={Boolean(errors.image_path)}
              aria-describedby={`${prefix}-image-hint ${prefix}-image_path-error`}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <p id={`${prefix}-image-hint`} className="text-caption text-muted">
              JPEG·PNG·WebP, 5MiB 이하 한 장입니다. 사진을 바꾸거나 빼기 전에는
              저장된 사진이 유지됩니다.
            </p>
            <p
              id={`${prefix}-image_path-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.image_path}
            </p>
            <div className="mt-3 max-w-60">
              <ProductPhoto
                src={photoSrc}
                alt={alt || "상품 사진"}
                missing={!file && !path}
              />
            </div>
            {(file || path) && (
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  const retire = uploadToken.current;
                  const hadUpload = uploaded.current;
                  setFile(null);
                  setPath("");
                  uploaded.current = null;
                  uploadedFile.current = null;
                  uploadToken.current = null;
                  confirmToken.current = null;
                  if (hadUpload && retire && !uncertain)
                    keepCleanup(() => retire());
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                사진 빼기
              </Button>
            )}
          </div>
          <div>
            <label
              htmlFor={`${prefix}-image_alt`}
              className="text-label font-semibold"
            >
              사진 대체 설명
            </label>
            <input
              id={`${prefix}-image_alt`}
              name="image_alt"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              className={control}
              aria-invalid={Boolean(errors.image_alt)}
              aria-describedby={`${prefix}-image_alt-hint ${prefix}-image_alt-error`}
            />
            <p
              id={`${prefix}-image_alt-hint`}
              className="text-caption text-muted"
            >
              사진이 있을 때 필수입니다. 200자 이하로 입력해 주세요.
            </p>
            <p
              id={`${prefix}-image_alt-error`}
              role="alert"
              className="text-caption text-error"
            >
              {errors.image_alt}
            </p>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-sort_order`}
              className="text-label font-semibold"
            >
              정렬 순서
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
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-label font-semibold">
            <input
              id={`${prefix}-is_sold_out`}
              name="is_sold_out"
              type="checkbox"
              checked={soldOut}
              onChange={(event) => setSoldOut(event.target.checked)}
              aria-invalid={Boolean(errors.is_sold_out)}
            />
            품절
          </label>
          <p role="alert" className="text-caption text-error">
            {errors.is_sold_out}
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
        {busy
          ? "처리 중…"
          : handed
            ? "상품을 저장했습니다. 이전 사진은 사진 정리 버튼으로만 지웁니다."
            : message}
      </p>
      {uncertain && (
        <Button disabled={busy} onClick={reconcile}>
          {attemptMode === "delete"
            ? "삭제 결과 다시 확인"
            : "저장 결과 다시 확인"}
        </Button>
      )}
      {(cleanupPending || Boolean(handed)) && !removed && (
        <Button
          disabled={busy || uncertain}
          variant="secondary"
          onClick={retryCleanup}
        >
          사진 정리 다시 시도
        </Button>
      )}
      {modal && (
        <Modal
          title={
            modal === "delete"
              ? "상품 삭제 확인"
              : modal === "reload"
                ? "최신 내용 불러오기"
                : modal === "leave"
                  ? "저장하지 않은 입력"
                  : "상품 저장 확인"
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
              {name.trim() || "이름 없음"} 상품을 삭제하면 고객 화면에서도
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
              <p className="wrap-anywhere">{name.trim() || "이름 없음"}</p>
              <p className="text-price font-extrabold text-pink">
                {/^[1-9]\d*$/.test(price.trim())
                  ? formatWon(Number(price.trim()))
                  : price.trim() || "가격 없음"}
              </p>
              <p>
                {published ? "공개" : "비공개"} ·{" "}
                {soldOut ? "품절" : "판매 가능"}
              </p>
              <p>
                {file
                  ? "새 사진을 올립니다."
                  : path
                    ? "저장된 사진을 유지합니다."
                    : "사진 없음"}
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
