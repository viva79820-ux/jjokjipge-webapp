export type Counselor = {
  id: string;
  name: string;
  field: "tarot" | "saju";
  tags: string[];
  intro: string;
  isRecommended: boolean;
  isNew: boolean;
};
export const counselors: Counselor[] = [
  {
    id: "a",
    name: "상담사 A",
    field: "tarot",
    tags: ["타로", "연애운", "재회운"],
    intro: "더미 소개 문구입니다. 타로 상담을 합니다.",
    isRecommended: true,
    isNew: false,
  },
  {
    id: "b",
    name: "상담사 B",
    field: "saju",
    tags: ["사주", "진로운", "금전운"],
    intro: "더미 소개 문구입니다. 사주 상담을 합니다.",
    isRecommended: true,
    isNew: true,
  },
  {
    id: "c",
    name: "상담사 C",
    field: "tarot",
    tags: ["타로", "고민상담"],
    intro: "더미 소개 문구입니다. 타로 상담을 합니다.",
    isRecommended: true,
    isNew: false,
  },
  {
    id: "d",
    name: "상담사 D",
    field: "saju",
    tags: ["사주", "신년운"],
    intro: "더미 소개 문구입니다. 사주 상담을 합니다.",
    isRecommended: false,
    isNew: true,
  },
  {
    id: "e",
    name: "상담사 E",
    field: "tarot",
    tags: ["타로", "진로운"],
    intro: "더미 소개 문구입니다. 타로 상담을 합니다.",
    isRecommended: false,
    isNew: true,
  },
  {
    id: "f",
    name: "상담사 F",
    field: "saju",
    tags: ["사주", "연애운"],
    intro: "더미 소개 문구입니다. 사주 상담을 합니다.",
    isRecommended: true,
    isNew: false,
  },
];
