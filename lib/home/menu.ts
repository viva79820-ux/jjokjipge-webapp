import { formatStorePriceAmounts } from "@/components/store/present";
import {
  storePriceConfig,
  type StorePriceItem,
} from "@/lib/store-price-config";

export const homeStoreMenuKeys = [
  "saju",
  "compatibility-two",
  "tarot-one-shuffle",
  "saju-tarot-one-shuffle",
  "yearly-fortune",
  "naming",
] as const;

export const homeStorePriceNotice =
  "1호점 가격판을 바탕으로 한 확인 중인 매장 참고 가격입니다.";

export function homeStoreMenuItems(
  items: readonly StorePriceItem[] = storePriceConfig.items,
) {
  return homeStoreMenuKeys.map((key) => {
    const item = items.find((entry) => entry.key === key);
    if (!item) throw new Error("매장 참고 메뉴를 찾지 못했습니다.");
    return {
      key: item.key,
      name: item.name,
      price: formatStorePriceAmounts(item.amounts),
    };
  });
}
