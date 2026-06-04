export type MedicationDisplaySource = {
  name?: string | null;
  easy_name?: string | null;
  simple_name?: string | null;
  display_name?: string | null;
  category_name?: string | null;
  easyName?: string | null;
  simpleName?: string | null;
  displayName?: string | null;
  categoryName?: string | null;
};

const INVALID_TEXT_PATTERNS = [
  '확인 불가',
  '복약 안내',
  '언제 먹는지',
  '하루에',
  '한 번에',
  '이미지에서',
  '개인정보',
];

function isUsableMedicationText(value?: string | null) {
  const text = String(value || '').trim();

  if (!text) {
    return false;
  }

  return !INVALID_TEXT_PATTERNS.some((pattern) => text.includes(pattern));
}

function normalizeSpacing(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(value: string) {
  return normalizeSpacing(value)
    .replace(/\s+/g, '')
    .toLowerCase();
}

function includesAny(source: string, keywords: string[]) {
  return keywords.some((keyword) => source.includes(normalizeForMatch(keyword)));
}

const PURPOSE_RULES: Array<{ label: string; keywords: string[] }> = [
  {
    label: '혈압약',
    keywords: [
      '혈압',
      '고혈압',
      '아모잘탄',
      '노바스크',
      '트윈스타',
      '세비카',
      '카나브',
      '코자',
      '디오반',
      '올메텍',
      '미카르디스',
      '아달라트',
      '암로디핀',
      '로사르탄',
      '발사르탄',
      '올메사르탄',
      '텔미사르탄',
      '칸데사르탄',
      '이르베사르탄',
      '니페디핀',
      '베니디핀',
      '카르베딜롤',
      '비소프롤롤',
      '아테놀롤',
      '히드로클로로티아지드',
    ],
  },
  {
    label: '당뇨약',
    keywords: [
      '당뇨',
      '혈당',
      '인슐린',
      '메트포르민',
      '글루코파지',
      '다이아벡스',
      '자누비아',
      '트라젠타',
      '포시가',
      '자디앙',
      '아마릴',
      '글리메피리드',
      '시타글립틴',
      '리나글립틴',
      '다파글리플로진',
      '엠파글리플로진',
    ],
  },
  {
    label: '콜레스테롤약',
    keywords: [
      '콜레스테롤',
      '고지혈',
      '지질',
      '리피토',
      '크레스토',
      '제티아',
      '아토르바스타틴',
      '로수바스타틴',
      '심바스타틴',
      '프라바스타틴',
      '에제티미브',
      '페노피브레이트',
    ],
  },
  {
    label: '혈전약',
    keywords: [
      '혈전',
      '항응고',
      '아스피린',
      '플라빅스',
      '클로피도그렐',
      '와파린',
      '리바록사반',
      '자렐토',
      '아픽사반',
      '엘리퀴스',
      '다비가트란',
      '프라닥사',
    ],
  },
  {
    label: '알레르기약',
    keywords: [
      '알레르기',
      '비염',
      '가려움',
      '레보세티리진',
      '세티리진',
      '펙소페나딘',
      '로라타딘',
      '데스로라타딘',
      '지르텍',
      '씨잘',
      '알레그라',
      '클라리틴',
    ],
  },
  {
    label: '위장약',
    keywords: [
      '위장',
      '위산',
      '위염',
      '역류',
      '소화',
      '오메프라졸',
      '에스오메프라졸',
      '판토프라졸',
      '라베프라졸',
      '파모티딘',
      '모사프리드',
      '가스모틴',
    ],
  },
  {
    label: '진통제',
    keywords: [
      '진통',
      '해열',
      '통증',
      '타이레놀',
      '아세트아미노펜',
      '이부프로펜',
      '덱시부프로펜',
      '나프록센',
      '트라마돌',
    ],
  },
  {
    label: '갑상선약',
    keywords: ['갑상선', '레보티록신', '씬지로이드', '신지로이드'],
  },
  {
    label: '뼈 건강약',
    keywords: ['골다공증', '칼슘', '비타민d', '비타민D', '알렌드론산', '포사맥스'],
  },
  {
    label: '전립선약',
    keywords: ['전립선', '탐스로신', '하루날', '실로도신'],
  },
  {
    label: '수면약',
    keywords: ['수면', '불면', '졸피뎀', '스틸녹스', '멜라토닌'],
  },
  {
    label: '기억력약',
    keywords: ['치매', '기억', '도네페질', '아리셉트', '메만틴', '리바스티그민'],
  },
  {
    label: '감기약',
    keywords: ['감기', '기침', '가래', '코감기', '진해', '거담', '코푸', '덱스트로메토르판'],
  },
  {
    label: '항생제',
    keywords: ['항생제', '아목시실린', '세파클러', '세픽심', '클래리트로마이신', '아지트로마이신'],
  },
  {
    label: '변비약',
    keywords: ['변비', '락툴로오스', '듀파락', '마그밀', '센나', '비사코딜'],
  },
];

export function simplifyMedicationName(value?: string | null) {
  let text = normalizeSpacing(String(value || ''));

  if (!isUsableMedicationText(text)) {
    return '';
  }

  text = text
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/^약\s*이름\s*[:：]?\s*/g, '')
    .replace(/^약\s*이름만\s*[:：]?\s*/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\b\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?\s*(mg|g|mcg|ug|μg|ml|mL|IU|%)\b/gi, '')
    .replace(/\b\d+(\.\d+)?\s*(mg|g|mcg|ug|μg|ml|mL|IU|%)\b/gi, '')
    .replace(/\d+(\.\d+)?\s*(밀리그램|마이크로그램|그램|밀리리터|단위|퍼센트)/g, '')
    .replace(/\d+(\.\d+)?\s*(정|캡슐|포|병|회|ml|mL)\b/gi, '')
    .replace(/[·ㆍ,;]+/g, ' ')
    .replace(/\s*[-_/]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  text = text
    .replace(/(필름코팅정|구강붕해정|서방정|장용정|츄어블정|발포정|분산정|나정|정제|정)$/g, '')
    .replace(/(캡슐제|연질캡슐|경질캡슐|캡슐)$/g, '')
    .replace(/(시럽제|시럽|현탁액|점안액|점이액|흡입액|주사액|주사|연고|크림|겔|패취|패치|액)$/g, '')
    .replace(/(염산염수화물|염산염|베실산염|메실산염|말레산염|숙신산염|타르타르산염|시트르산염|브롬화수소산염|황산염|질산염|칼슘염|나트륨염|칼륨염|칼슘|나트륨|칼륨|수화물|무수물)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || text.length < 2) {
    return normalizeSpacing(String(value || ''));
  }

  return text;
}

export function getSeniorMedicationDisplayName(
  medication: MedicationDisplaySource,
  mappedEasyName?: string
) {
  const preferredName = [
    mappedEasyName,
    medication.easy_name,
    medication.easyName,
    medication.simple_name,
    medication.simpleName,
    medication.display_name,
    medication.displayName,
    medication.category_name,
    medication.categoryName,
  ].find(isUsableMedicationText);

  if (preferredName) {
    return simplifyMedicationName(preferredName) || preferredName.trim();
  }

  return simplifyMedicationName(medication.name) || '이름 미정 약';
}

export function getSeniorMedicationPurposeLabel(
  medication: MedicationDisplaySource,
  mappedEasyName?: string
) {
  const sourceText = normalizeForMatch(
    [
      medication.category_name,
      medication.categoryName,
      mappedEasyName,
      medication.easy_name,
      medication.easyName,
      medication.simple_name,
      medication.simpleName,
      medication.display_name,
      medication.displayName,
      medication.name,
    ]
      .filter(isUsableMedicationText)
      .join(' ')
  );

  const matchedRule = PURPOSE_RULES.find((rule) =>
    includesAny(sourceText, rule.keywords)
  );

  if (matchedRule) {
    return matchedRule.label;
  }

  const category = medication.category_name || medication.categoryName;

  if (isUsableMedicationText(category)) {
    const simplifiedCategory = simplifyMedicationName(category).replace(/\s*약$/g, '');

    if (simplifiedCategory) {
      return `${simplifiedCategory}약`;
    }
  }

  return '복용약';
}

export function getMedicationTimeLabel(timeValue?: string | null) {
  const hour = Number(String(timeValue || '').split(':')[0]);

  if (!Number.isFinite(hour)) {
    return '복용 약';
  }

  if (hour < 11) {
    return '아침 약';
  }

  if (hour < 15) {
    return '점심 약';
  }

  if (hour < 21) {
    return '저녁 약';
  }

  return '자기 전 약';
}
