"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PhoneInput } from "@/components/booking/phone-input";
import { OrderComplete } from "@/components/orders/order-complete";
import { Button } from "@/components/ui/button";
import { createOrder } from "@/lib/orders/actions";
import { orderConfig } from "@/lib/order-config";
import { loadCartProducts } from "@/lib/products/cart-actions";
import {
  browserCartStorage,
  cartLookupState,
  cartServerSnapshot,
  cartSnapshot,
  subscribeCart,
  writeCart,
  type CartCatalog,
  type CartLine,
} from "@/lib/products/cart";
import { formatWon } from "@/lib/products/rules";
import type { OrderField, OrderState } from "@/lib/orders/types";

const initialState: OrderState = {};
const inputClass =
  "min-h-11 w-full min-w-0 rounded-input border border-border bg-surface px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-label font-bold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-caption text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function errorFor(state: OrderState, field: OrderField) {
  return state.errors?.[field];
}

function OrderSummary({
  lines,
  catalog,
}: {
  lines: CartLine[];
  catalog: CartCatalog;
}) {
  const viewed = cartLookupState(lines, {
    ok: true,
    products: lines.map((line) => catalog[line.id]),
  });
  if (
    viewed.state !== "ready" ||
    viewed.rows.some((row) => row.kind !== "available")
  )
    return null;
  const total = viewed.total + orderConfig.shippingFee;
  return (
    <section aria-labelledby="order-summary-title" className="space-y-3">
      <h2 id="order-summary-title" className="text-title font-bold">
        주문 상품
      </h2>
      <div className="rounded-card border border-border bg-surface p-3 @3xl/app:p-4">
        <ul className="divide-y divide-border">
          {viewed.rows.map((row) =>
            row.kind === "available" ? (
              <li key={row.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-subtitle font-bold wrap-anywhere">
                    {row.name}
                  </p>
                  <p className="mt-1 text-caption text-muted">
                    {formatWon(row.price)} × {row.quantity}개
                  </p>
                </div>
                <p className="shrink-0 text-label font-bold">
                  {formatWon(row.lineTotal)}
                </p>
              </li>
            ) : null,
          )}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-body">
          <div className="flex justify-between gap-3">
            <dt>상품 금액</dt>
            <dd>{formatWon(viewed.total)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>배송비</dt>
            <dd>{formatWon(orderConfig.shippingFee)}</dd>
          </div>
          <div className="flex justify-between gap-3 font-bold">
            <dt>입금할 금액</dt>
            <dd className="text-price font-extrabold text-pink">
              {formatWon(total)}
            </dd>
          </div>
        </dl>
        {!orderConfig.shippingFeeConfirmed ? (
          <p className="mt-3 text-caption text-muted">
            배송비는 아직 미확정이며 현재 주문에는 0원으로 계산돼요.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function OrderCheckout() {
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
  const [phone, setPhone] = useState("");
  const requestKeyRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(createOrder, initialState);

  useEffect(() => {
    try {
      if (requestKeyRef.current)
        requestKeyRef.current.value = crypto.randomUUID();
    } catch {
      if (requestKeyRef.current) requestKeyRef.current.value = "";
    }
  }, []);

  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    const currentLines = lines;
    void (async () => {
      try {
        const result = await loadCartProducts(
          currentLines.map((line) => line.id),
        );
        if (cancelled) return;
        const next = cartLookupState(currentLines, result);
        if (next.state !== "ready") {
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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids, lines, retryToken]);

  useEffect(() => {
    if (!state.success) return;
    const storage = browserCartStorage();
    if (storage) writeCart(storage, []);
  }, [state.success]);

  if (state.success) return <OrderComplete order={state.success} />;

  if (stored.state === "pending")
    return <p role="status">주문할 상품을 확인하고 있어요.</p>;
  if (stored.state === "storage-error")
    return (
      <div className="space-y-3">
        <p role="alert">장바구니를 불러오지 못했어요.</p>
        <Button href="/shop/cart" variant="secondary">
          장바구니로
        </Button>
      </div>
    );
  if (stored.state === "empty")
    return (
      <div className="space-y-3">
        <h1 className="text-display font-extrabold">주문서</h1>
        <p role="status">장바구니가 비어 있어요.</p>
        <Button href="/shop">상품 보러 가기</Button>
      </div>
    );
  if (!catalog && !lookupFailed)
    return <p role="status">주문할 상품을 확인하고 있어요.</p>;
  if (lookupFailed || !catalog)
    return (
      <div className="space-y-3">
        <h1 className="text-display font-extrabold">주문서</h1>
        <p role="alert">상품 정보를 다시 확인하지 못했어요.</p>
        <Button
          type="button"
          onClick={() => {
            setLookupFailed(false);
            setRetryToken((value) => value + 1);
          }}
        >
          다시 확인
        </Button>
        <Button href="/shop/cart" variant="secondary">
          장바구니로
        </Button>
      </div>
    );

  const viewed = cartLookupState(lines, {
    ok: true,
    products: lines.map((line) => catalog[line.id]),
  });
  const unavailable =
    viewed.state !== "ready" ||
    viewed.rows.some((row) => row.kind !== "available");
  if (unavailable)
    return (
      <div className="space-y-3">
        <h1 className="text-display font-extrabold">주문서</h1>
        <p role="alert">
          품절되었거나 판매가 중지된 상품이 있어요. 장바구니를 다시 확인해
          주세요.
        </p>
        <Button href="/shop/cart">장바구니로</Button>
      </div>
    );

  const items = JSON.stringify(
    lines.map((line) => ({ id: line.id, quantity: line.quantity })),
  );
  return (
    <div className="space-y-7 wrap-anywhere">
      <header className="space-y-2">
        <h1 className="text-display font-extrabold">주문서</h1>
        <p className="text-body text-muted">
          배송지와 연락처를 확인한 뒤 무통장입금으로 주문해 주세요.
        </p>
      </header>

      <OrderSummary lines={lines} catalog={catalog} />

      <form action={action} className="space-y-7" noValidate>
        <input ref={requestKeyRef} type="hidden" name="requestKey" />
        <input type="hidden" name="items" value={items} />

        <section aria-labelledby="order-contact-title" className="space-y-3">
          <h2 id="order-contact-title" className="text-title font-bold">
            주문자 정보
          </h2>
          <Field
            id="order-name"
            label="주문자 이름"
            error={errorFor(state, "name")}
          >
            <input
              id="order-name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={30}
              required
              aria-invalid={errorFor(state, "name") ? true : undefined}
              aria-describedby={
                errorFor(state, "name") ? "order-name-error" : undefined
              }
              className={inputClass}
            />
          </Field>
          <Field
            id="order-phone"
            label="휴대폰 번호"
            error={errorFor(state, "phone")}
          >
            <PhoneInput
              id="order-phone"
              name="phone"
              autoComplete="tel"
              required
              value={phone}
              onValueChange={setPhone}
              aria-invalid={errorFor(state, "phone") ? true : undefined}
              aria-describedby={
                errorFor(state, "phone") ? "order-phone-error" : undefined
              }
              className={inputClass}
            />
          </Field>
          <Field
            id="order-email"
            label="이메일"
            error={errorFor(state, "email")}
          >
            <input
              id="order-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              aria-invalid={errorFor(state, "email") ? true : undefined}
              aria-describedby={
                errorFor(state, "email") ? "order-email-error" : undefined
              }
              className={inputClass}
            />
          </Field>
        </section>

        <section aria-labelledby="shipping-address-title" className="space-y-3">
          <h2 id="shipping-address-title" className="text-title font-bold">
            배송지
          </h2>
          <Field
            id="order-postal-code"
            label="우편번호"
            error={errorFor(state, "postalCode")}
          >
            <input
              id="order-postal-code"
              name="postalCode"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              required
              aria-invalid={errorFor(state, "postalCode") ? true : undefined}
              aria-describedby={
                errorFor(state, "postalCode")
                  ? "order-postal-code-error"
                  : undefined
              }
              className={inputClass}
            />
          </Field>
          <Field
            id="order-address-line1"
            label="기본 주소"
            error={errorFor(state, "addressLine1")}
          >
            <input
              id="order-address-line1"
              name="addressLine1"
              type="text"
              autoComplete="address-line1"
              maxLength={200}
              required
              aria-invalid={errorFor(state, "addressLine1") ? true : undefined}
              aria-describedby={
                errorFor(state, "addressLine1")
                  ? "order-address-line1-error"
                  : undefined
              }
              className={inputClass}
            />
          </Field>
          <Field
            id="order-address-line2"
            label="상세 주소(선택)"
            error={errorFor(state, "addressLine2")}
          >
            <input
              id="order-address-line2"
              name="addressLine2"
              type="text"
              autoComplete="address-line2"
              maxLength={200}
              aria-invalid={errorFor(state, "addressLine2") ? true : undefined}
              aria-describedby={
                errorFor(state, "addressLine2")
                  ? "order-address-line2-error"
                  : undefined
              }
              className={inputClass}
            />
          </Field>
        </section>

        <section aria-labelledby="order-payment-title" className="space-y-3">
          <h2 id="order-payment-title" className="text-title font-bold">
            결제 방법
          </h2>
          <div className="rounded-card border border-brand bg-brand-soft p-3 @3xl/app:p-4">
            <p className="text-label font-bold text-brand-deep">무통장입금</p>
            <p className="mt-1 text-caption text-muted">
              주문 접수 후 안내되는 계좌로 입금해 주세요.
            </p>
          </div>
        </section>

        <div className="space-y-2">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-body">
            <input
              type="checkbox"
              name="privacyConsent"
              className="mt-1 size-5 accent-brand"
              aria-describedby={
                errorFor(state, "privacyConsent")
                  ? "order-privacy-error"
                  : undefined
              }
            />
            <span>
              주문 처리와 배송을 위한 개인정보 수집·이용에 동의합니다.
            </span>
          </label>
          {errorFor(state, "privacyConsent") ? (
            <p
              id="order-privacy-error"
              role="alert"
              className="text-caption text-error"
            >
              {errorFor(state, "privacyConsent")}
            </p>
          ) : null}
        </div>

        {state.errors?.items ? (
          <p role="alert" className="text-caption text-error">
            {state.errors.items}
          </p>
        ) : null}
        {state.message ? (
          <p role="alert" className="text-body text-error">
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "주문 접수 중..." : "무통장입금으로 주문하기"}
          </Button>
          <Button href="/shop/cart" variant="secondary">
            장바구니로 돌아가기
          </Button>
        </div>
      </form>
    </div>
  );
}
