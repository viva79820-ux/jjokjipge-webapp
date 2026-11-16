export type StorePriceAmount = {
  label: string;
  amount: number;
};

export type StorePriceItem = {
  key: string;
  group: "saju" | "tarot";
  name: string;
  amounts: StorePriceAmount[];
};

export const storePriceConfig = {
  status: "unconfirmed-reference",
  source: "제공된 동성로 1호점 가격판 판독 값",
  notice:
    "고객이 확정하기 전의 참고 가격이다. 홈과 매장 화면에 보여줄 때는 참고 가격임을 함께 표시한다.",
  excludedUse:
    "전화상담 상품, 예약, 결제 금액으로 쓰지 않는다. consult_products와 연결하지 않는다.",
  items: [
    {
      key: "saju",
      group: "saju",
      name: "사주",
      amounts: [
        { label: "일반", amount: 30000 },
        { label: "중고등", amount: 20000 },
      ],
    },
    {
      key: "compatibility-two",
      group: "saju",
      name: "궁합(2인)",
      amounts: [{ label: "2인", amount: 40000 }],
    },
    {
      key: "saju-compatibility-two",
      group: "saju",
      name: "사주+궁합(2인)",
      amounts: [{ label: "2인", amount: 70000 }],
    },
    {
      key: "saju-tarot-one-shuffle",
      group: "saju",
      name: "사주+타로(1셔플)",
      amounts: [{ label: "1셔플", amount: 15000 }],
    },
    {
      key: "saju-name-reading",
      group: "saju",
      name: "사주+이름풀이",
      amounts: [{ label: "기본", amount: 40000 }],
    },
    {
      key: "premium-saju",
      group: "saju",
      name: "고급사주",
      amounts: [{ label: "기본", amount: 50000 }],
    },
    {
      key: "premium-consult",
      group: "saju",
      name: "고급상담(예약제)",
      amounts: [{ label: "예약제", amount: 100000 }],
    },
    {
      key: "physiognomy",
      group: "saju",
      name: "관상",
      amounts: [{ label: "각", amount: 10000 }],
    },
    {
      key: "palmistry",
      group: "saju",
      name: "손금",
      amounts: [{ label: "각", amount: 10000 }],
    },
    {
      key: "premium-palmistry",
      group: "saju",
      name: "고급손금",
      amounts: [{ label: "기본", amount: 20000 }],
    },
    {
      key: "wedding-date",
      group: "saju",
      name: "결혼택일",
      amounts: [{ label: "기본", amount: 100000 }],
    },
    {
      key: "newborn-date",
      group: "saju",
      name: "신생아택일",
      amounts: [{ label: "기본", amount: 300000 }],
    },
    {
      key: "naming",
      group: "saju",
      name: "작명",
      amounts: [{ label: "기본", amount: 300000 }],
    },
    {
      key: "tarot-one-shuffle",
      group: "tarot",
      name: "타로 1셔플",
      amounts: [
        { label: "일반", amount: 5000 },
        { label: "중고등", amount: 5000 },
      ],
    },
    {
      key: "couple-fortune",
      group: "tarot",
      name: "커플운",
      amounts: [
        { label: "1인", amount: 10000 },
        { label: "커플", amount: 15000 },
      ],
    },
    {
      key: "compatibility-fortune",
      group: "tarot",
      name: "궁합운",
      amounts: [{ label: "각", amount: 10000 }],
    },
    {
      key: "yearly-fortune",
      group: "tarot",
      name: "1년 운세",
      amounts: [{ label: "기본", amount: 20000 }],
    },
    {
      key: "angel-charm",
      group: "tarot",
      name: "천사부적",
      amounts: [{ label: "기본", amount: 5000 }],
    },
  ],
} as const satisfies {
  status: "unconfirmed-reference";
  source: string;
  notice: string;
  excludedUse: string;
  items: StorePriceItem[];
};
