from functools import lru_cache
import json
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


class OpenAITTSServiceError(RuntimeError):
    pass


def synthesize_speech(
    text: str,
    mode: CareMode,
    voice: str | None = None,
) -> tuple[bytes, str]:
    if not settings.openai_api_key:
        raise OpenAITTSServiceError("OPENAI_API_KEY is not configured.")

    normalized_text = text.strip()
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
        return "차분하고 또렷한 한국어로, 속도는 약간 느리게, 한 문장씩 분명하게 읽어주세요."
    if mode == "health_support":
        return "차분하고 신뢰감 있는 한국어로, 건강 안내를 하듯 또렷하게 읽어주세요."
    return "부드럽고 또렷한 한국어로, 어르신에게 말하듯 자연스럽고 또박또박 읽어주세요."


def _media_type_for_format(response_format: str) -> str:
    return {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "opus": "audio/ogg",
        "aac": "audio/ac",
        "flac": "audio/flac",
        "pcm": "audio/pcm",
    }.get(response_format, "audio/mpeg")