export type Store = {
  id: string;
  name: string;
  address: string;
  hours: string;
  description: string;
};

export const stores: Store[] = [
  {
    id: "a",
    name: "매장 A",
    address: "대구 중구 동성로 (예시 주소)",
    hours: "예시 영업시간: 매일 12:00~22:00",
    description: "더미 소개 문구입니다. 매장 A를 소개하는 예시입니다.",
  },
  {
    id: "b",
    name: "매장 B",
    address: "대구 중구 동성로 (예시 주소)",
    hours: "예시 영업시간: 매일 12:00~22:00",
    description: "더미 소개 문구입니다. 매장 B를 소개하는 예시입니다.",
  },
];

export function getStore(id: string) {
  return stores.find((store) => store.id === id);
}
