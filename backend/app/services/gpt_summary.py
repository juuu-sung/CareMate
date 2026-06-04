import base64
import json
from pathlib import Path
from urllib import error, request

from app.core.config import settings


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


# =========================
# 모델 매핑
# =========================
MODEL_ALIAS = {
    "gpt-5.4-mini": "gpt-4o",
}


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

    if isinstance(response, dict):
        for item in response.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    texts.append(content.get("text", ""))
        return "\n".join(texts).strip()

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
        "medication_bag": "prescription",
        "medication_bag_images": "prescription",
        "처방전": "prescription",
        "약 처방전": "prescription",
        "약봉투": "prescription",
        "약 봉투": "prescription",
        "조제약 봉투": "prescription",
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
문서 종류: 처방전 또는 약 봉투

이 이미지는 처방전 또는 약 봉투다.
반드시 복용 중인 약 정보만 추출한다.

중요 규칙:
1. [복용 중인 약]에는 "약 이름만" 작성
2. 설명 절대 붙이지 말 것
3. 한 줄에 하나씩 작성
4. 모르면 "확인 불가"
5. 형식 절대 변경 금지

6. [쉬운 약 이름]을 반드시 추가
7. 쉬운 이름은 약 제품명/성분명/효능군을 보고 노인이 이해할 수 있는 "약 용도 카테고리"로 분류
8. 제품명, 성분명, 용량, 제형명은 [쉬운 약 이름]에 쓰지 말 것
9. [쉬운 약 이름]은 아래 목록 중 하나로만 작성
10. 같은 약의 용도가 애매하면 절대 추측하지 말고 "확인 불가"라고 작성
11. 예시 카테고리:
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
   - 혈전약
   - 갑상선약
   - 뼈 건강약
   - 전립선약
   - 수면약
   - 기억력약
   - 변비약

12. [복약 구조화]에도 "쉬운 약 이름" 필드를 포함하고 같은 카테고리를 반복
13. 공식 이름과 쉬운 이름 혼합 금지
14. [복약 구조화]를 반드시 추가
15. 사진에서 보이는 복용 시점, 1일 복용 횟수, 처방 일수, 복용 시간을 약별로 작성
16. 보이지 않는 값은 "확인 불가"라고 작성
17. 복용 시점은 식전, 식간, 식후, 확인 불가 중 하나만 사용
18. 복용 시간이 명확하면 HH:MM 형식으로 작성하고, 여러 번이면 쉼표로 구분
19. 약 봉투 표의 "투약량 / 횟수 / 일수"가 보이면 반드시 다음처럼 해석
   - 투약량: 1회 용량
   - 횟수: 1일 복용 횟수
   - 일수: 처방 일수

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

[복약 구조화]
- 약 이름: 약이름1 | 쉬운 약 이름: 혈압약 | 복용 시점: 식전/식간/식후/확인 불가 | 1일 복용 횟수: 1회 | 처방 일수: 7일 | 복용 시간: 08:00 또는 08:00, 13:00, 19:00 | 1회 용량: 확인 불가
- 약 이름: 약이름2 | 쉬운 약 이름: 확인 불가 | 복용 시점: 확인 불가 | 1일 복용 횟수: 확인 불가 | 처방 일수: 확인 불가 | 복용 시간: 확인 불가 | 1회 용량: 확인 불가

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
        if not settings.openai_api_key:
            return "요약 실패: OPENAI_API_KEY가 설정되어 있지 않습니다."

        openai_model = MODEL_ALIAS.get(settings.llm_model, settings.llm_model)
        payload = {
            "model": openai_model,
            "input": [
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
        }

        req = request.Request(
            OPENAI_RESPONSES_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        with request.urlopen(req, timeout=settings.llm_timeout_seconds) as response:
            result = extract_text(json.loads(response.read().decode("utf-8")))

        if not result:
            return "이미지에서 내용을 인식하지 못했습니다."

        return result

    except error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        detail_lower = detail.lower()
        if (
            "invalid_request_error" in detail_lower
            or "the image data you provided" in detail_lower
            or "invalid_value" in detail_lower
        ):
            return (
                "요약 실패: 이미지 형식이 올바르지 않습니다. "
                "JPEG 또는 PNG 사진으로 다시 올려주세요."
            )
        return f"요약 실패: {e.code}"
    except Exception as e:
        return f"요약 실패: {str(e)}"
