export type Counselor = {
  id: string;
  name: string;
  field: "tarot" | "saju";
  tags: string[];
  intro: string;
  isRecommended: boolean;
  isNew: boolean;
  storeName: string;
  description: string;
  products: { id: string; name: string; minutes: number; price: number }[];
};
export const counselors: Counselor[] = [
  {
    id: "a",
    storeName: "매장 A",
    description:
      "더미 소개 문구입니다. 타로 카드로 지금의 흐름을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.",
    products: [
      { id: "a-20", name: "타로 상담 20분", minutes: 20, price: 20000 },
      { id: "a-30", name: "타로 상담 30분", minutes: 30, price: 30000 },
    ],
    name: "상담사 A",
    field: "tarot",
    tags: ["타로", "연애운", "재회운"],
    intro: "더미 소개 문구입니다. 타로 상담을 합니다.",
    isRecommended: true,
    isNew: false,
  },
  {
    id: "b",
    storeName: "매장 A",
    description:
      "더미 소개 문구입니다. 사주로 타고난 흐름과 앞으로의 방향을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.",
    products: [
      { id: "b-20", name: "사주 상담 20분", minutes: 20, price: 20000 },
      { id: "b-30", name: "사주 상담 30분", minutes: 30, price: 30000 },
    ],
    name: "상담사 B",
    field: "saju",
    tags: ["사주", "진로운", "금전운"],
    intro: "더미 소개 문구입니다. 사주 상담을 합니다.",
    isRecommended: true,
    isNew: true,
  },
  {
    id: "c",
    storeName: "매장 A",
    description:
      "더미 소개 문구입니다. 타로 카드로 지금의 흐름을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.",
    products: [
      { id: "c-20", name: "타로 상담 20분", minutes: 20, price: 20000 },
      { id: "c-30", name: "타로 상담 30분", minutes: 30, price: 30000 },
    ],
    name: "상담사 C",
    field: "tarot",
    tags: ["타로", "고민상담"],
    intro: "더미 소개 문구입니다. 타로 상담을 합니다.",
    isRecommended: true,
    isNew: false,
  },
  {
    id: "d",
    storeName: "매장 B",
    description:
      "더미 소개 문구입니다. 사주로 타고난 흐름과 앞으로의 방향을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.",
    products: [
      { id: "d-20", name: "사주 상담 20분", minutes: 20, price: 20000 },
      { id: "d-30", name: "사주 상담 30분", minutes: 30, price: 30000 },
    ],
    name: "상담사 D",
    field: "saju",
    tags: ["사주", "신년운"],
    intro: "더미 소개 문구입니다. 사주 상담을 합니다.",
    isRecommended: false,
    isNew: true,
  },
  {
    id: "e",
    storeName: "매장 B",
    description:
      "더미 소개 문구입니다. 타로 카드로 지금의 흐름을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.",
    products: [
      { id: "e-20", name: "타로 상담 20분", minutes: 20, price: 20000 },
      { id: "e-30", name: "타로 상담 30분", minutes: 30, price: 30000 },
    ],
    name: "상담사 E",
    field: "tarot",
    tags: ["타로", "진로운"],
    intro: "더미 소개 문구입니다. 타로 상담을 합니다.",
    isRecommended: false,
    isNew: true,
  },
  {
    id: "f",
    storeName: "매장 B",
    description:
      "더미 소개 문구입니다. 사주로 타고난 흐름과 앞으로의 방향을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.",
    products: [
      { id: "f-20", name: "사주 상담 20분", minutes: 20, price: 20000 },
      { id: "f-30", name: "사주 상담 30분", minutes: 30, price: 30000 },
    ],
    name: "상담사 F",
    field: "saju",
    tags: ["사주", "연애운"],
    intro: "더미 소개 문구입니다. 사주 상담을 합니다.",
    isRecommended: true,
    isNew: false,
  },
];

export function getCounselor(id: string) {
  return counselors.find((counselor) => counselor.id === id);
}
