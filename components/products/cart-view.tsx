"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductPhoto } from "@/components/products/photo";
import { loadCartProducts } from "@/lib/products/cart-actions";
import {
  browserCartStorage,
  cartKeptMessage,
  cartLookupState,
  cartMessages,
  cartServerSnapshot,
  cartSnapshot,
  cartStorageKey,
  notifyCart,
  presentCart,
  storeChangedQuantity,
  storeRemovedProduct,
  subscribeCart,
  type CartCatalog,
  type CartLine,
  type CartRow,
} from "@/lib/products/cart";
import { formatWon, publicImageUrl } from "@/lib/products/rules";

function catalogCovers(source: CartCatalog, items: CartLine[]) {
  return items.every((line) => Object.hasOwn(source, line.id));
}

function CartHeader() {
  return (
    <div className="space-y-3">
      <h1 className="text-display font-extrabold">장바구니</h1>
      <Button href="/shop" variant="secondary">
        상품 목록
      </Button>
    </div>
  );
}

function QuantityControls({
  line,
  disabled,
  error,
  onSubmit,
  onRemove,
}: {
  line: CartLine;
  disabled: boolean;
  error: string;
  onSubmit: (line: CartLine, value: string) => void;
  onRemove: (line: CartLine) => void;
}) {
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const quantity = new FormData(event.currentTarget).get("quantity");
        onSubmit(line, typeof quantity === "string" ? quantity : "");
      }}
    >
      <label
        htmlFor={`cart-qty-${line.id}`}
        className="text-label font-semibold"
      >
        수량
      </label>
      <input
        id={`cart-qty-${line.id}`}
        name="quantity"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={String(line.quantity)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className="min-h-11 w-20 min-w-0 rounded-input border border-border bg-surface px-3 text-body disabled:opacity-60"
      />
      <Button type="submit" variant="secondary" disabled={disabled}>
        수량 변경
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => onRemove(line)}
      >
        삭제
      </Button>
    </form>
  );
}

function ProductFields({
  row,
}: {
  row: Exclude<CartRow, { kind: "unavailable" }>;
}) {
  return (
    <>
      <ProductPhoto
        src={publicImageUrl(row.image_path)}
        alt={row.image_alt || `${row.name} 사진`}
        missing={!row.image_path}
      />
      <h2 className="text-subtitle font-bold wrap-anywhere text-foreground">
        {row.name}
      </h2>
      <p className="text-price font-extrabold text-pink">
        {formatWon(row.price)}
      </p>
    </>
  );
}

export function CartView() {
  const stored = useSyncExternalStore(
    subscribeCart,
    cartSnapshot,
    cartServerSnapshot,
  );
  const lines = stored.state === "ready" ? stored.lines : [];
  const ids = lines.map((line) => line.id).join("\n");
  const [catalog, setCatalog] = useState<CartCatalog | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [notice, setNotice] = useState("");
  const [noticeAlert, setNoticeAlert] = useState(false);
  const [fieldError, setFieldError] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const viewed = catalog ? presentCart(lines, catalog) : null;
  const ready = viewed?.state === "ready" ? viewed : null;
  const covered = catalog !== null && catalogCovers(catalog, lines);
  const phase =
    stored.state === "pending"
      ? "loading"
      : stored.state === "storage-error"
        ? "storage"
        : stored.state === "empty"
          ? "empty"
          : lookupFailed || (covered && !ready)
            ? "lookup"
            : !covered
              ? "loading"
              : "ready";
  const show = (text: string, alert = false) => {
    setNoticeAlert(alert);
    setNotice(text);
  };
  useEffect(() => {
    if (stored.state !== "ready") return;
    const storage = browserCartStorage();
    if (!storage) return;
    try {
      const raw = storage.getItem(cartStorageKey);
      if (typeof raw !== "string") return;
      const canonical = JSON.stringify(
        stored.lines.map((line) => ({ id: line.id, quantity: line.quantity })),
      );
      if (raw === canonical) return;
      storage.setItem(cartStorageKey, canonical);
      notifyCart();
    } catch {
      return;
    }
  }, [stored]);
  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    const idList = ids.split("\n");
    void (async () => {
      try {
        const result = await loadCartProducts(idList);
        if (cancelled) return;
        const next = cartLookupState(
          idList.map((id) => ({ id, quantity: 1 })),
          result,
        );
        if (next.state === "lookup-error") {
          setCatalog(null);
          setLookupFailed(true);
          return;
        }
        setCatalog(next.catalog);
        setLookupFailed(false);
      } catch {
        if (cancelled) return;
        setCatalog(null);
        setLookupFailed(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids, retryToken]);
  function change(line: CartLine, value: string) {
    const result = storeChangedQuantity(browserCartStorage(), line.id, value);
    if (result.state === "storage-error") {
      show(cartMessages.storage, true);
      return;
    }
    if (result.state === "rejected") {
      setNotice("");
      setFieldError({ id: line.id, text: cartMessages.quantity });
      return;
    }
    setFieldError(null);
    show(cartMessages.updated);
  }
  function remove(line: CartLine) {
    const result = storeRemovedProduct(browserCartStorage(), line.id);
    if (result.state === "storage-error") {
      show(cartMessages.storage, true);
      return;
    }
    if (result.state === "rejected") return;
    setFieldError(null);
    show(cartMessages.removed);
  }
  function retry() {
    setBusy(true);
    setFieldError(null);
    setRetryToken((value) => value + 1);
  }
  const controls = (line: CartLine) => (
    <div className="space-y-2">
      <QuantityControls
        key={`${line.id}-${line.quantity}`}
        line={line}
        disabled={busy}
        error={fieldError?.id === line.id ? fieldError.text : ""}
        onSubmit={change}
        onRemove={remove}
      />
      {fieldError?.id === line.id ? (
        <p role="alert" className="text-caption text-error">
          {fieldError.text}
        </p>
      ) : null}
    </div>
  );
  return (
    <section className="space-y-7 wrap-anywhere">
      <CartHeader />
      {notice ? <p role={noticeAlert ? "alert" : "status"}>{notice}</p> : null}
      {phase === "loading" && <p role="status">{cartMessages.loading}</p>}
      {phase === "storage" && <p role="alert">{cartMessages.storage}</p>}
      {phase === "empty" && (
        <div role="status" className="space-y-3">
          <p>{cartMessages.empty}</p>
          <Button href="/shop">상품 보러 가기</Button>
        </div>
      )}
      {phase === "lookup" && (
        <div className="space-y-3">
          <p role="alert">{cartMessages.lookup}</p>
          <p>{cartKeptMessage(lines.length)}</p>
          <Button type="button" onClick={retry} disabled={busy}>
            다시 조회
          </Button>
          <div className="space-y-3">
            {lines.map((line) => (
              <article
                key={line.id}
                className="space-y-3 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
              >
                <h2 className="text-subtitle font-bold">{cartMessages.held}</h2>
                {controls(line)}
              </article>
            ))}
          </div>
        </div>
      )}
      {phase === "ready" && ready && (
        <div className="space-y-7">
          <div className="space-y-3">
            {ready.rows.map((row) => (
              <article
                key={row.id}
                className="space-y-3 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
              >
                {row.kind === "unavailable" ? (
                  <h2 className="text-subtitle font-bold">
                    {cartMessages.unavailable}
                  </h2>
                ) : (
                  <ProductFields row={row} />
                )}
                {row.kind === "sold-out" && (
                  <>
                    <Badge>품절</Badge>
                    <p className="text-caption text-muted">
                      {cartMessages.soldOutNote}
                    </p>
                  </>
                )}
                {row.kind === "available" && (
                  <p className="text-caption text-muted">
                    금액 {formatWon(row.lineTotal)}
                  </p>
                )}
                {controls({ id: row.id, quantity: row.quantity })}
              </article>
            ))}
          </div>
          {ready.rows.some((row) => row.kind !== "available") && (
            <p className="text-body text-muted">{cartMessages.excluded}</p>
          )}
          <p className="text-subtitle font-bold text-foreground">
            합계{" "}
            <span className="text-price font-extrabold text-pink">
              {formatWon(ready.total)}
            </span>
          </p>
          <p className="text-body text-muted">{cartMessages.checkout}</p>
        </div>
      )}
    </section>
  );
}
