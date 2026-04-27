import os
import base64
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


# =========================
# ENV 로드
# =========================
BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BACKEND_DIR / ".env"

load_dotenv(ENV_PATH)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-5.4-mini")

if not OPENAI_API_KEY:
    raise RuntimeError(f"OPENAI_API_KEY를 찾을 수 없습니다. 확인 경로: {ENV_PATH}")


# =========================
# 모델 매핑
# =========================
MODEL_ALIAS = {
    "gpt-5.4-mini": "gpt-4o",
}

OPENAI_MODEL = MODEL_ALIAS.get(LLM_MODEL, LLM_MODEL)

client = OpenAI(api_key=OPENAI_API_KEY)


# =========================
# 이미지 base64 인코딩
# =========================
def encode_image_to_base64(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


# =========================
# MIME 타입 자동 처리
# =========================
def get_mime_type(image_path: str) -> str:
    ext = Path(image_path).suffix.lower()

    if ext == ".png":
        return "image/png"
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"

    return "image/jpeg"


# =========================
# 응답 텍스트 추출
# =========================
def extract_text(response) -> str:
    texts = []

    if not hasattr(response, "output"):
        return ""

    for item in response.output:
        if hasattr(item, "content"):
            for c in item.content:
                if getattr(c, "type", None) == "output_text":
                    texts.append(c.text)

    return "\n".join(texts).strip()


# =========================
# 문서 타입 정규화
# =========================
def normalize_document_type(document_type: str) -> str:
    value = str(document_type or "").strip().lower()

    mapping = {
        "prescription": "prescription",
        "prescription_images": "prescription",
        "처방전": "prescription",
        "약 처방전": "prescription",
        "복용약": "prescription",
        "복약": "prescription",

        "disease": "disease_document",
        "disease_document": "disease_document",
        "disease_document_images": "disease_document",
        "진단서": "disease_document",
        "질병 진단서": "disease_document",
        "보유질환": "disease_document",
        "질환": "disease_document",

        "allergy": "allergy_document",
        "allergy_document": "allergy_document",
        "allergy_document_images": "allergy_document",
        "알레르기": "allergy_document",
        "알레르기 진단서": "allergy_document",
        "알레르기 관련 진단서": "allergy_document",
        "알레르기 문서": "allergy_document",
    }

    return mapping.get(value, "")


# =========================
# 문서 타입별 프롬프트
# =========================
def build_medical_prompt(document_type: str) -> str:
    normalized_type = normalize_document_type(document_type)

    common_rule = """
너는 노인 돌봄 앱 CareMate에서 사용하는 의료 문서 요약 도우미다.

반드시 지켜야 할 규칙:
1. 이미지에서 실제로 확인 가능한 내용만 작성한다.
2. 보이지 않거나 흐릿하거나 확실하지 않은 내용은 "확인 불가"라고 작성한다.
3. 어려운 의학 용어는 최대한 쉬운 말로 바꾼다.
4. 약 이름, 질병명, 알레르기명은 이미지에 적힌 그대로 유지한다.
5. 개인정보는 절대 출력하지 않는다.
6. 문서에 없는 내용을 추측하지 않는다.
7. 관련 없는 항목은 출력하지 않는다.
8. 노인이 바로 이해할 수 있도록 작성한다.
9. 출력 형식 절대 변경 금지
"""

    # =========================
    # 처방전 (여기 핵심 수정)
    # =========================
    if normalized_type == "prescription":
        return common_rule + """
문서 종류: 처방전

이 이미지는 처방전이다.
반드시 복용 중인 약 정보만 추출한다.

중요 규칙:
1. [복용 중인 약]에는 "약 이름만" 작성
2. 설명 절대 붙이지 말 것
3. 한 줄에 하나씩 작성
4. 모르면 "확인 불가"
5. 형식 절대 변경 금지

6. [쉬운 약 이름]을 반드시 추가
7. 쉬운 이름은 노인이 이해할 수 있게 변환
8. 예시:
   - 감기약
   - 두통약
   - 기침약
   - 소화제
   - 위장약
   - 혈압약
   - 당뇨약
   - 콜레스테롤약
   - 알레르기약
   - 진통제
   - 항생제

9. 약의 용도를 알 수 없으면 "확인 불가"
10. 공식 이름과 쉬운 이름 혼합 금지

출력 형식:

[복용 중인 약]
- 약이름1
- 약이름2
- 약이름3

[쉬운 약 이름]
- 약이름1: 쉬운이름
- 약이름2: 쉬운이름
- 약이름3: 쉬운이름

[복약 안내]
- 언제 먹는지:
- 한 번에 얼마나 먹는지:
- 하루에 몇 번 먹는지:
- 쉬운 안내 문장:

[확인 불가한 내용]
- 이미지에서 흐리거나 확인하기 어려운 내용:
"""

    # =========================
    # 질병
    # =========================
    if normalized_type == "disease_document":
        return common_rule + """
문서 종류: 질병 진단서

출력 형식:
[질병 요약]
- 확인된 질병:
- 쉬운 설명:
- 생활에서 조심할 점:

[확인 불가한 내용]
- 이미지에서 흐리거나 확인하기 어려운 내용:
"""

    # =========================
    # 알레르기
    # =========================
    if normalized_type == "allergy_document":
        return common_rule + """
문서 종류: 알레르기 진단서

출력 형식:
[알레르기 요약]
- 확인된 알레르기:
- 피해야 할 것:
- 증상이 있을 때 주의할 점:

[확인 불가한 내용]
- 이미지에서 흐리거나 확인하기 어려운 내용:
"""

    return common_rule + """
[확인 불가한 내용]
- 지원하지 않는 문서 종류입니다.
"""


# =========================
# 메인 함수
# =========================
def summarize_medical_image(image_path: str, document_type: str) -> str:
    normalized_type = normalize_document_type(document_type)

    if normalized_type not in [
        "prescription",
        "disease_document",
        "allergy_document",
    ]:
        return "지원하지 않는 문서 종류입니다."

    base64_image = encode_image_to_base64(image_path)
    mime_type = get_mime_type(image_path)
    prompt = build_medical_prompt(document_type)

    try:
        response = client.responses.create(
            model=OPENAI_MODEL,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {
                            "type": "input_image",
                            "image_url": f"data:{mime_type};base64,{base64_image}",
                        },
                    ],
                }
            ],
        )

        result = extract_text(response)

        if not result:
            return "이미지에서 내용을 인식하지 못했습니다."

        return result

    except Exception as e:
        return f"요약 실패: {str(e)}"