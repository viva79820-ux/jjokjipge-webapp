export type DeliveryStore = {
  claim(key: string): "claimed" | "skip";
  finish(key: string, result: "sent" | "failed"): void;
};

export function createMemoryDeliveryStore(): DeliveryStore {
  const states = new Map<string, "sending" | "sent" | "failed">();
  return {
    claim(key) {
      const current = states.get(key);
      if (current === "sent" || current === "sending") return "skip";
      states.set(key, "sending");
      return "claimed";
    },
    finish(key, result) {
      states.set(key, result);
    },
  };
}

export async function deliverOnce(
  key: string,
  store: DeliveryStore,
  send: () => Promise<boolean>,
): Promise<"sent" | "failed" | "skipped"> {
  if (!key.trim()) return "failed";
  if (store.claim(key) === "skip") return "skipped";
  try {
    const ok = await send();
    store.finish(key, ok ? "sent" : "failed");
    return ok ? "sent" : "failed";
  } catch {
    store.finish(key, "failed");
    return "failed";
  }
}
