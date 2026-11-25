export const classContentMarker = "[클래스정보]";

export type ClassCurriculumItem = {
  title: string;
  detail: string;
};

export type ClassOption = {
  name: string;
  instructor: string;
  schedule: string;
};

export type ClassContent =
  | { kind: "free"; body: string }
  | {
      kind: "structured";
      summary: string;
      instructors: string;
      duration: string;
      schedule: string;
      tuition: string;
      keywords: string[];
      curriculum: ClassCurriculumItem[];
      options: ClassOption[];
      learnings: string[];
      body: string;
    };

const fieldKeys = {
  소개: "summary",
  강사: "instructors",
  기간: "duration",
  수업: "schedule",
  수강료: "tuition",
  키워드: "keywords",
} as const;

const blockKeys = {
  커리큘럼: "curriculum",
  옵션: "options",
  배워요: "learnings",
  본문: "body",
} as const;

type FieldKey = (typeof fieldKeys)[keyof typeof fieldKeys];
type BlockName = "fields" | "curriculum" | "options" | "learnings" | "body";

function splitParts(value: string) {
  return value.split("|").map((part) => part.trim());
}

function keywordsOf(value: string) {
  return value
    .split(/[,·]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseClassContent(description: string): ClassContent {
  const lines = description.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== classContentMarker)
    return { kind: "free", body: description };
  const content = {
    kind: "structured" as const,
    summary: "",
    instructors: "",
    duration: "",
    schedule: "",
    tuition: "",
    keywords: [] as string[],
    curriculum: [] as ClassCurriculumItem[],
    options: [] as ClassOption[],
    learnings: [] as string[],
    body: "",
  };
  let block: BlockName = "fields";
  const body: string[] = [];
  for (const line of lines.slice(1)) {
    if (block === "body") {
      body.push(line);
      continue;
    }
    const field = line.match(
      /^(소개|강사|기간|수업|수강료|키워드)\s*:\s*(.*)$/,
    );
    if (field) {
      block = "fields";
      const key = fieldKeys[field[1] as keyof typeof fieldKeys] as FieldKey;
      const value = field[2].trim();
      if (key === "keywords") content.keywords = keywordsOf(value);
      else content[key] = value;
      continue;
    }
    const heading = line.match(/^(커리큘럼|옵션|배워요|본문)\s*:\s*(.*)$/);
    if (heading) {
      block = blockKeys[heading[1] as keyof typeof blockKeys];
      if (block === "body" && heading[2].trim()) body.push(heading[2].trim());
      continue;
    }
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && block === "curriculum") {
      const [title, detail = ""] = splitParts(item[1]);
      if (title) content.curriculum.push({ title, detail });
      continue;
    }
    if (item && block === "options") {
      const [name, instructor = "", schedule = ""] = splitParts(item[1]);
      if (name) content.options.push({ name, instructor, schedule });
      continue;
    }
    if (item && block === "learnings") {
      const text = item[1].trim();
      if (text) content.learnings.push(text);
      continue;
    }
    if (line.trim()) body.push(line);
  }
  content.body = body.join("\n").trim();
  return content;
}

export function tuitionLabel(content: ClassContent) {
  if (content.kind === "structured" && content.tuition.trim())
    return content.tuition.trim();
  return "수강료 문의";
}

export function deliveryLabel(isOnline: boolean) {
  return isOnline ? "온라인" : "오프라인";
}

export const sajuClassDescription = `[클래스정보]
소개: 청남샘과 가연샘이 기초부터 실전상담까지 가르치는 사주 과정입니다.
강사: 청남샘·가연샘
기간: 1년
수업: 주 2회 2시간
수강료: 수강료 문의
커리큘럼:
- 기초
- 중급
- 고급
- 실전상담
배워요:
- 사주명리 이론부터
- 실전 해석과 상담 스킬까지
- 바로 현장에서 활용 가능한 전문가 과정
본문:
사주 수강 과정입니다. 수강료는 아직 확정되지 않아 문의로 안내합니다.`;

export const tarotClassDescription = `[클래스정보]
소개: 2개월 집중과 피드백 3개월로 진행하는 타로 과정입니다.
강사: 가연샘·청남샘
기간: 2개월 집중·피드백 3개월
수업: 선택한 과정마다 일정이 다릅니다.
수강료: 수강료 문의
옵션:
- 유니버셜 웨이트 타로 | 가연샘 | 주 2회 2시간
- 사주오라클카드 | 청남샘 | 주 1회 2시간
- 만신타로/19금타로 전문과정 |  | 과정 중 선택
커리큘럼:
- 유니버셜 웨이트 타로
- 사주오라클카드
- 만신타로/19금타로 전문과정 중 선택
배워요:
- 유니버셜 웨이트 타로
- 사주오라클카드
- 만신타로/19금타로 전문과정 중 선택
본문:
타로 수강 과정입니다. 유니버셜 웨이트 타로, 사주오라클카드, 만신타로/19금타로 전문과정 중 선택할 수 있습니다. 수강료는 아직 확정되지 않아 문의로 안내합니다.`;
