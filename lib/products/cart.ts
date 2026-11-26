import { publicDetail, uuid, type PublicProductDetail } from "./rules";

export const cartStorageKey = "jjokjipge:shop-cart";
export const maxCartQuantity = 99;
export const maxCartLines = 30;
const maxCartRawLength = 8000;

export const cartMessages = {
  empty: "장바구니가 비어 있습니다.",
  lookup: "상품 정보를 불러오지 못했습니다. 다시 조회해 주세요.",
  storage: "이 브라우저에 장바구니를 저장하지 못했습니다.",
  quantity: `수량은 1 이상 ${maxCartQuantity} 이하의 정수로 입력해 주세요.`,
  full: `장바구니는 상품 ${maxCartLines}종까지 담을 수 있습니다.`,
  added: "장바구니에 담았습니다.",
  removed: "장바구니에서 뺐습니다.",
  updated: "수량을 변경했습니다.",
  unavailable: "현재 구매할 수 없는 상품입니다.",
  excluded: "품절이거나 현재 구매할 수 없는 상품은 합계에 포함하지 않습니다.",
  loading: "장바구니를 확인하고 있습니다.",
  checkout: "장바구니에서 배송지를 입력하고 주문할 수 있습니다.",
  soldOutNote: "품절 상품은 합계에 포함되지 않습니다.",
  soldOutAdd: "품절 상품은 장바구니에 담을 수 없습니다.",
  held: "담긴 상품",
} as const;

export function cartAddedMessage(quantity: number) {
  return `${cartMessages.added} 수량은 ${quantity}개입니다.`;
}

export function cartKeptMessage(count: number) {
  return `담아 둔 ${count}개 항목은 그대로 유지됩니다.`;
}

export type CartLine = {
  id: string;
  quantity: number;
};

export type CartStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type CartRejectReason =
  "id" | "quantity" | "full" | "missing" | "sold-out";

type StoredRead =
  | { state: "empty" }
  | { state: "ready"; lines: CartLine[] }
  | { state: "storage-error" };

export function cartQuantity(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > maxCartQuantity)
      return null;
    return value;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const parsed = Number(text);
  if (
    !Number.isSafeInteger(parsed) ||
    String(parsed) !== text ||
    parsed > maxCartQuantity
  )
    return null;
  return parsed;
}

function lineFrom(value: unknown): CartLine | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!uuid(record.id)) return null;
  const quantity = cartQuantity(record.quantity);
  if (quantity === null) return null;
  return { id: record.id, quantity };
}

export function parseCart(raw: string): CartLine[] | null {
  if (typeof raw !== "string" || raw.length > maxCartRawLength) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > maxCartLines) return null;
  const lines: CartLine[] = [];
  for (const item of parsed) {
    const line = lineFrom(item);
    if (!line) return null;
    const index = lines.findIndex((current) => current.id === line.id);
    if (index < 0) {
      lines.push(line);
      continue;
    }
    const quantity = lines[index].quantity + line.quantity;
    if (cartQuantity(quantity) === null) return null;
    lines[index] = { id: line.id, quantity };
  }
  return lines;
}

function cartPayload(lines: CartLine[]) {
  return lines.map((line) => ({ id: line.id, quantity: line.quantity }));
}

export function readCart(storage: CartStorage | null): StoredRead {
  if (!storage) return { state: "storage-error" };
  let raw: string | null;
  try {
    raw = storage.getItem(cartStorageKey);
  } catch {
    return { state: "storage-error" };
  }
  if (raw === null) return { state: "empty" };
  const lines = parseCart(raw);
  if (!lines) return { state: "storage-error" };
  if (!lines.length) return { state: "empty" };
  const canonical = JSON.stringify(cartPayload(lines));
  if (raw !== canonical) {
    try {
      storage.setItem(cartStorageKey, canonical);
      notifyCart();
    } catch {
      return { state: "ready", lines };
    }
  }
  return { state: "ready", lines };
}

export function writeCart(storage: CartStorage, lines: CartLine[]) {
  if (lines.length > maxCartLines) return false;
  const payload: CartLine[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!uuid(line.id) || seen.has(line.id)) return false;
    const quantity = cartQuantity(line.quantity);
    if (quantity === null) return false;
    seen.add(line.id);
    payload.push({ id: line.id, quantity });
  }
  try {
    storage.setItem(cartStorageKey, JSON.stringify(cartPayload(payload)));
    notifyCart();
    return true;
  } catch {
    return false;
  }
}

export function cartUnits(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function addCartProduct(
  lines: CartLine[],
  id: string,
  amount: unknown = 1,
) {
  if (!uuid(id)) return { ok: false as const, reason: "id" as const };
  const add = cartQuantity(amount);
  if (add === null) return { ok: false as const, reason: "quantity" as const };
  const index = lines.findIndex((line) => line.id === id);
  if (index < 0) {
    if (lines.length >= maxCartLines)
      return { ok: false as const, reason: "full" as const };
    return {
      ok: true as const,
      lines: [...lines, { id, quantity: add }],
      quantity: add,
    };
  }
  const quantity = lines[index].quantity + add;
  if (cartQuantity(quantity) === null)
    return { ok: false as const, reason: "quantity" as const };
  const next = lines.slice();
  next[index] = { id, quantity };
  return { ok: true as const, lines: next, quantity };
}

export function changeCartQuantity(
  lines: CartLine[],
  id: string,
  value: unknown,
) {
  if (!uuid(id)) return { ok: false as const, reason: "id" as const };
  const quantity = cartQuantity(value);
  if (quantity === null)
    return { ok: false as const, reason: "quantity" as const };
  const index = lines.findIndex((line) => line.id === id);
  if (index < 0) return { ok: false as const, reason: "missing" as const };
  const next = lines.slice();
  next[index] = { id, quantity };
  return { ok: true as const, lines: next };
}

export function removeCartProduct(lines: CartLine[], id: string) {
  if (!uuid(id) || !lines.some((line) => line.id === id)) return null;
  return lines.filter((line) => line.id !== id);
}

export function storeAddedProduct(
  storage: CartStorage | null,
  id: string,
  amount: unknown = 1,
  options?: { soldOut?: boolean },
) {
  if (!uuid(id)) return { state: "rejected" as const, reason: "id" as const };
  if (cartQuantity(amount) === null)
    return { state: "rejected" as const, reason: "quantity" as const };
  if (options?.soldOut)
    return { state: "rejected" as const, reason: "sold-out" as const };
  const current = readCart(storage);
  if (current.state === "storage-error")
    return { state: "storage-error" as const };
  const lines = current.state === "ready" ? current.lines : [];
  const added = addCartProduct(lines, id, amount);
  if (!added.ok) return { state: "rejected" as const, reason: added.reason };
  if (!storage || !writeCart(storage, added.lines))
    return { state: "storage-error" as const };
  return {
    state: "added" as const,
    lines: added.lines,
    quantity: added.quantity,
  };
}

export function storeChangedQuantity(
  storage: CartStorage | null,
  id: string,
  value: unknown,
) {
  const current = readCart(storage);
  if (current.state !== "ready") {
    if (current.state === "empty")
      return { state: "rejected" as const, reason: "missing" as const };
    return { state: "storage-error" as const };
  }
  const changed = changeCartQuantity(current.lines, id, value);
  if (!changed.ok)
    return { state: "rejected" as const, reason: changed.reason };
  if (!storage || !writeCart(storage, changed.lines))
    return { state: "storage-error" as const };
  return { state: "ready" as const, lines: changed.lines };
}

export function storeRemovedProduct(storage: CartStorage | null, id: string) {
  const current = readCart(storage);
  if (current.state !== "ready") {
    if (current.state === "empty")
      return { state: "rejected" as const, reason: "missing" as const };
    return { state: "storage-error" as const };
  }
  const next = removeCartProduct(current.lines, id);
  if (!next) return { state: "rejected" as const, reason: "missing" as const };
  if (!storage || !writeCart(storage, next))
    return { state: "storage-error" as const };
  if (!next.length) return { state: "empty" as const, lines: next };
  return { state: "ready" as const, lines: next };
}

export type CartCatalog = Record<
  string,
  (PublicProductDetail & { is_published?: boolean }) | null
>;

export function cartCatalogProduct(
  row: unknown,
  id: string,
): PublicProductDetail | null {
  if (!row || typeof row !== "object" || !uuid(id)) return null;
  const value = row as Record<string, unknown>;
  if (value.is_published === false || value.id !== id) return null;
  const detail = publicDetail({
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    price: value.price,
    image_path: value.image_path,
    image_alt: value.image_alt,
    is_published: true,
    is_sold_out: value.is_sold_out,
    sort_order: value.sort_order,
    created_at: value.created_at,
  });
  if (!detail || detail.id !== id) return null;
  return detail;
}

export function indexCartProducts(
  lines: CartLine[],
  products: Array<unknown> | null,
): CartCatalog | null {
  if (!products || products.length !== lines.length) return null;
  const catalog: CartCatalog = {};
  for (let index = 0; index < lines.length; index += 1)
    catalog[lines[index].id] = cartCatalogProduct(
      products[index],
      lines[index].id,
    );
  return catalog;
}

export type CartRow =
  | {
      kind: "available";
      id: string;
      quantity: number;
      name: string;
      price: number;
      image_path: string | null;
      image_alt: string | null;
      lineTotal: number;
    }
  | {
      kind: "sold-out";
      id: string;
      quantity: number;
      name: string;
      price: number;
      image_path: string | null;
      image_alt: string | null;
    }
  | { kind: "unavailable"; id: string; quantity: number };

export function presentCart(lines: CartLine[], catalog: CartCatalog | null) {
  if (!catalog) return { state: "lookup-error" as const, lines };
  const rows: CartRow[] = [];
  let total = 0;
  for (const line of lines) {
    if (!Object.hasOwn(catalog, line.id))
      return { state: "lookup-error" as const, lines };
    const product = catalog[line.id];
    if (!product || product.is_published === false) {
      rows.push({
        kind: "unavailable",
        id: line.id,
        quantity: line.quantity,
      });
      continue;
    }
    if (product.id !== line.id)
      return { state: "lookup-error" as const, lines };
    if (product.is_sold_out) {
      rows.push({
        kind: "sold-out",
        id: line.id,
        quantity: line.quantity,
        name: product.name,
        price: product.price,
        image_path: product.image_path,
        image_alt: product.image_alt,
      });
      continue;
    }
    const lineTotal = product.price * line.quantity;
    if (!Number.isSafeInteger(lineTotal))
      return { state: "lookup-error" as const, lines };
    total += lineTotal;
    if (!Number.isSafeInteger(total))
      return { state: "lookup-error" as const, lines };
    rows.push({
      kind: "available",
      id: line.id,
      quantity: line.quantity,
      name: product.name,
      price: product.price,
      image_path: product.image_path,
      image_alt: product.image_alt,
      lineTotal,
    });
  }
  return { state: "ready" as const, rows, total };
}

export function cartLookupState(
  lines: CartLine[],
  result: { ok: true; products: unknown[] } | { ok: false },
) {
  if (!result.ok) return { state: "lookup-error" as const, lines };
  const catalog = indexCartProducts(lines, result.products);
  const view = presentCart(lines, catalog);
  if (view.state !== "ready" || !catalog)
    return { state: "lookup-error" as const, lines };
  return { ...view, catalog };
}

export function browserCartStorage(): CartStorage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    return {
      getItem(key: string) {
        return storage.getItem(key);
      },
      setItem(key: string, value: string) {
        storage.setItem(key, value);
      },
    };
  } catch {
    return null;
  }
}

const cartChangeEvent = "jjokjipge:shop-cart-change";
export const pendingCart = { state: "pending" as const };
const storageError = { state: "storage-error" as const };
let cachedSnapshot: { key: string; value: CartSnapshot } | null = null;

export type CartSnapshot =
  | typeof pendingCart
  | { state: "empty" }
  | { state: "storage-error" }
  | { state: "ready"; lines: CartLine[] };

function interpretCart(raw: string | null): CartSnapshot {
  if (raw === null) return { state: "empty" };
  const lines = parseCart(raw);
  if (!lines) return storageError;
  if (!lines.length) return { state: "empty" };
  return { state: "ready", lines };
}

export function notifyCart() {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(cartChangeEvent));
  } catch {
    return;
  }
}

export function subscribeCart(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === cartStorageKey || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(cartChangeEvent, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(cartChangeEvent, notify);
  };
}

export function cartSnapshot(): CartSnapshot {
  try {
    if (typeof window === "undefined") return pendingCart;
    const raw = window.localStorage.getItem(cartStorageKey);
    const key = raw === null ? "0" : `1:${raw}`;
    if (cachedSnapshot?.key === key) return cachedSnapshot.value;
    const value = interpretCart(raw);
    cachedSnapshot = { key, value };
    return value;
  } catch {
    if (cachedSnapshot?.key === "throw") return cachedSnapshot.value;
    cachedSnapshot = { key: "throw", value: storageError };
    return cachedSnapshot.value;
  }
}

export function cartServerSnapshot(): CartSnapshot {
  return pendingCart;
}
