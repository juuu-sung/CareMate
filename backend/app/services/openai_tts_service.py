from functools import lru_cache
import json
import re
from urllib import error, request

from app.core.config import settings
from app.schemas.chat import CareMode

OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech"
DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts"
DEFAULT_OPENAI_TTS_VOICE = "alloy"
DEFAULT_OPENAI_TTS_FORMAT = "mp3"

SUPPORTED_OPENAI_VOICES = {
    "alloy",
    "echo",
    "fable",
    "onyx",
    "nova",
    "shimmer",
}

_DATE_TIME_PATTERN = re.compile(
    r"(?<!\d)(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\s*(?:[Tt]|·)\s*|\s+)?(?:(\d{1,2}):(\d{2}))?(?!\d)"
)
_TIME_PATTERN = re.compile(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)")
_NATIVE_KOREAN_HOURS = {
    1: "한",
    2: "두",
    3: "세",
    4: "네",
    5: "다섯",
    6: "여섯",
    7: "일곱",
    8: "여덟",
    9: "아홉",
    10: "열",
    11: "열한",
    12: "열두",
}
_SINO_KOREAN_DIGITS = {
    0: "영",
    1: "일",
    2: "이",
    3: "삼",
    4: "사",
    5: "오",
    6: "육",
    7: "칠",
    8: "팔",
    9: "구",
}


class OpenAITTSServiceError(RuntimeError):
    pass


def synthesize_speech(
    text: str,
    mode: CareMode,
    voice: str | None = None,
) -> tuple[bytes, str]:
    if not settings.openai_api_key:
        raise OpenAITTSServiceError("OPENAI_API_KEY is not configured.")

    normalized_text = _normalize_tts_text(text).strip()
    if not normalized_text:
        raise OpenAITTSServiceError("TTS input text is empty.")

    response_format = settings.tts_response_format or DEFAULT_OPENAI_TTS_FORMAT
    model = settings.tts_model or DEFAULT_OPENAI_TTS_MODEL

    selected_voice = (voice or settings.tts_voice or DEFAULT_OPENAI_TTS_VOICE).strip().lower()
    if selected_voice not in SUPPORTED_OPENAI_VOICES:
        raise OpenAITTSServiceError(f"Unsupported TTS voice: {selected_voice}")

    instructions = settings.tts_instructions or _build_tts_instructions(mode)

    return _synthesize_speech_cached(
        normalized_text=normalized_text,
        mode=mode,
        model=model,
        voice=selected_voice,
        response_format=response_format,
        instructions=instructions,
    )


@lru_cache(maxsize=128)
def _synthesize_speech_cached(
    *,
    normalized_text: str,
    mode: CareMode,
    model: str,
    voice: str,
    response_format: str,
    instructions: str,
) -> tuple[bytes, str]:
    payload = {
        "model": model,
        "voice": voice,
        "input": normalized_text,
        "response_format": response_format,
        "instructions": instructions,
    }

    req = request.Request(
        OPENAI_SPEECH_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.openai_api_key}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=settings.tts_timeout_seconds) as response:
            audio_bytes = response.read()
            media_type = response.headers.get(
                "Content-Type",
                _media_type_for_format(response_format),
            )
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise OpenAITTSServiceError(
            f"OpenAI speech failed with status {exc.code}: {detail}"
        ) from exc
    except error.URLError as exc:
        raise OpenAITTSServiceError(f"OpenAI speech failed: {exc.reason}") from exc

    if not audio_bytes:
        raise OpenAITTSServiceError("OpenAI speech response was empty.")

    return audio_bytes, media_type


def _build_tts_instructions(mode: CareMode) -> str:
    if mode == "cognitive_support":
        return (
            "차분하고 또렷한 한국어로, 속도는 약간 느리게, 한 문장씩 분명하게 읽어주세요. "
            "날짜와 시간, 숫자는 한국어 구어체로 자연스럽게 읽고 14:50은 오후 두 시 오십 분처럼 읽어주세요."
        )
    if mode == "health_support":
        return (
            "차분하고 신뢰감 있는 한국어로, 건강 안내를 하듯 또렷하게 읽어주세요. "
            "날짜와 시간, 숫자는 한국어 구어체로 자연스럽게 읽고 14:50은 오후 두 시 오십 분처럼 읽어주세요."
        )
    return (
        "부드럽고 또렷한 한국어로, 어르신에게 말하듯 자연스럽고 또박또박 읽어주세요. "
        "날짜와 시간, 숫자는 한국어 구어체로 자연스럽게 읽고 14:50은 오후 두 시 오십 분처럼 읽어주세요."
    )


def _normalize_tts_text(text: str) -> str:
    normalized = _DATE_TIME_PATTERN.sub(_replace_date_time_match, text)
    normalized = _TIME_PATTERN.sub(_replace_time_match, normalized)
    normalized = _cleanup_duplicate_time_of_day(normalized)
    return re.sub(r"\s{2,}", " ", normalized)


def _replace_date_time_match(match: re.Match[str]) -> str:
    year = int(match.group(1))
    month = int(match.group(2))
    day = int(match.group(3))
    hour_text = ""

    if match.group(4) is not None and match.group(5) is not None:
        hour_text = f" {_format_spoken_time(int(match.group(4)), int(match.group(5)))}"

    return f"{year}년 {month}월 {day}일{hour_text}"


def _replace_time_match(match: re.Match[str]) -> str:
    return _format_spoken_time(int(match.group(1)), int(match.group(2)))


def _format_spoken_time(hour: int, minute: int) -> str:
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return f"{hour}:{minute:02d}"

    meridiem = "오전" if hour < 12 else "오후"
    spoken_hour = hour % 12 or 12
    hour_label = _NATIVE_KOREAN_HOURS[spoken_hour]

    if minute == 0:
        return f"{meridiem} {hour_label} 시"

    return f"{meridiem} {hour_label} 시 {_format_sino_korean_number(minute)} 분"


def _format_sino_korean_number(value: int) -> str:
    if value == 0:
        return _SINO_KOREAN_DIGITS[0]
    if value < 10:
        return _SINO_KOREAN_DIGITS[value]
    if value < 20:
        ones = value % 10
        return "십" if ones == 0 else f"십{_SINO_KOREAN_DIGITS[ones]}"

    tens = value // 10
    ones = value % 10
    tens_label = f"{_SINO_KOREAN_DIGITS[tens]}십"
    return tens_label if ones == 0 else f"{tens_label}{_SINO_KOREAN_DIGITS[ones]}"


def _cleanup_duplicate_time_of_day(text: str) -> str:
    replacements = {
        "아침 오전 ": "아침 ",
        "새벽 오전 ": "새벽 ",
        "오전 오전 ": "오전 ",
        "오후 오후 ": "오후 ",
        "점심 오후 ": "점심 ",
        "저녁 오후 ": "저녁 ",
        "밤 오후 ": "밤 ",
    }

    normalized = text
    for source, target in replacements.items():
        normalized = normalized.replace(source, target)

    return normalized


def _media_type_for_format(response_format: str) -> str:
    return {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "opus": "audio/ogg",
        "aac": "audio/ac",
        "flac": "audio/flac",
        "pcm": "audio/pcm",
    }.get(response_format, "audio/mpeg")
