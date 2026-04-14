import json
import uuid
from urllib import error, request

from app.core.config import settings

OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions"
DEFAULT_OPENAI_STT_MODEL = "gpt-4o-mini-transcribe"
DEFAULT_TRANSCRIPTION_PROMPT = (
    "한국어 고령 사용자 발화입니다. 사투리와 구어체를 자연스럽게 인식하고, "
    "약 이름, 병원, 일정 표현을 최대한 정확히 전사하세요."
)


class OpenAIAudioServiceError(RuntimeError):
    pass


def transcribe_audio(
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
    prompt: str | None = None,
) -> str:
    if not settings.openai_api_key:
        raise OpenAIAudioServiceError("OPENAI_API_KEY is not configured.")
    if not file_bytes:
        raise OpenAIAudioServiceError("Audio file is empty.")

    boundary = f"----CareMateBoundary{uuid.uuid4().hex}"
    multipart_body = _build_multipart_body(
        boundary=boundary,
        file_bytes=file_bytes,
        filename=filename,
        content_type=content_type or "application/octet-stream",
        model=settings.stt_model or DEFAULT_OPENAI_STT_MODEL,
        language=settings.stt_language,
        prompt=prompt or settings.stt_prompt or DEFAULT_TRANSCRIPTION_PROMPT,
    )

    req = request.Request(
        OPENAI_TRANSCRIPTION_URL,
        data=multipart_body,
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=settings.stt_timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise OpenAIAudioServiceError(f"OpenAI transcription failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise OpenAIAudioServiceError(f"OpenAI transcription failed: {exc.reason}") from exc

    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise OpenAIAudioServiceError("OpenAI transcription response did not include text.")

    return text.strip()


def _build_multipart_body(
    *,
    boundary: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    model: str,
    language: str,
    prompt: str,
) -> bytes:
    lines: list[bytes] = []

    def add_field(name: str, value: str) -> None:
        lines.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                f"{value}\r\n".encode("utf-8"),
            ]
        )

    add_field("model", model)
    add_field("language", language)
    add_field("response_format", "json")
    add_field("prompt", prompt)

    lines.extend(
        [
            f"--{boundary}\r\n".encode("utf-8"),
            (
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode("utf-8"),
            file_bytes,
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
    )

    return b"".join(lines)
