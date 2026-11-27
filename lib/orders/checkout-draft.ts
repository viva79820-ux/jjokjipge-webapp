export const orderDraftStorageKey = "jjokjipge:order-checkout-draft";
const orderDraftChangeEvent = "jjokjipge:order-draft-change";

export type OrderDraft = {
  name: string;
  phone: string;
  email: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string;
};

export const emptyOrderDraft: OrderDraft = {
  name: "",
  phone: "",
  email: "",
  postalCode: "",
  addressLine1: "",
  addressLine2: "",
};

export type OrderDraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const draftFields = [
  "name",
  "phone",
  "email",
  "postalCode",
  "addressLine1",
  "addressLine2",
] as const;

const maxLength: Record<(typeof draftFields)[number], number> = {
  name: 30,
  phone: 13,
  email: 254,
  postalCode: 5,
  addressLine1: 200,
  addressLine2: 200,
};

const controlPattern = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

function draftPayload(draft: OrderDraft): OrderDraft {
  return {
    name: draft.name,
    phone: draft.phone,
    email: draft.email,
    postalCode: draft.postalCode,
    addressLine1: draft.addressLine1,
    addressLine2: draft.addressLine2,
  };
}

export function readOrderDraft(
  storage: OrderDraftStorage | null,
): OrderDraft | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(orderDraftStorageKey);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;
  const row = parsed as Record<string, unknown>;
  const draft = {} as OrderDraft;
  for (const field of draftFields) {
    const value = row[field];
    if (
      typeof value !== "string" ||
      controlPattern.test(value) ||
      Array.from(value).length > maxLength[field]
    )
      return null;
    draft[field] = value;
  }
  return draft;
}

export function writeOrderDraft(storage: OrderDraftStorage, draft: OrderDraft) {
  try {
    storage.setItem(orderDraftStorageKey, JSON.stringify(draftPayload(draft)));
    return true;
  } catch {
    return false;
  }
}

export function clearOrderDraft(storage: OrderDraftStorage | null) {
  overrideDraft = null;
  cachedDraft = null;
  if (storage) {
    try {
      storage.removeItem(orderDraftStorageKey);
    } catch {
      notifyOrderDraft();
      return;
    }
  }
  notifyOrderDraft();
}

let overrideDraft: OrderDraft | null = null;
let cachedDraft: { raw: string | null; value: OrderDraft } | null = null;

export function orderDraftServerSnapshot() {
  return emptyOrderDraft;
}

export function orderDraftSnapshot(): OrderDraft {
  if (typeof window === "undefined") return emptyOrderDraft;
  if (overrideDraft) return overrideDraft;
  try {
    const raw = window.sessionStorage.getItem(orderDraftStorageKey);
    if (cachedDraft?.raw === raw) return cachedDraft.value;
    const value =
      raw === null
        ? emptyOrderDraft
        : (readOrderDraft(browserOrderDraftStorage()) ?? emptyOrderDraft);
    cachedDraft = { raw, value };
    return value;
  } catch {
    return emptyOrderDraft;
  }
}

export function subscribeOrderDraft(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === orderDraftStorageKey || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(orderDraftChangeEvent, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(orderDraftChangeEvent, notify);
  };
}

export function publishOrderDraft(draft: OrderDraft) {
  const storage = browserOrderDraftStorage();
  if (storage && writeOrderDraft(storage, draft)) {
    overrideDraft = null;
    cachedDraft = {
      raw: storage.getItem(orderDraftStorageKey),
      value: draftPayload(draft),
    };
  } else {
    overrideDraft = draftPayload(draft);
  }
  notifyOrderDraft();
}

function notifyOrderDraft() {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(orderDraftChangeEvent));
  } catch {
    return;
  }
}

// 새로고침은 같은 탭이라 sessionStorage가 남는다.
// 탭을 닫으면 브라우저가 sessionStorage를 버리므로 따로 지우지 않는다.
export function browserOrderDraftStorage(): OrderDraftStorage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.sessionStorage;
    return {
      getItem(key) {
        return storage.getItem(key);
      },
      setItem(key, value) {
        storage.setItem(key, value);
      },
      removeItem(key) {
        storage.removeItem(key);
      },
    };
  } catch {
    return null;
  }
}
