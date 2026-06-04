import json
import uuid
from urllib import error, request

from app.core.config import settings


class CareMateWhisperServiceError(RuntimeError):
    pass


def transcribe_audio_with_caremate_whisper(
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
) -> str:
    if not settings.caremate_stt_url:
        raise CareMateWhisperServiceError("CAREMATE_STT_URL is not configured.")
    if not file_bytes:
        raise CareMateWhisperServiceError("Audio file is empty.")

    boundary = f"----CareMateWhisperBoundary{uuid.uuid4().hex}"
    multipart_body = _build_multipart_body(
        boundary=boundary,
        file_bytes=file_bytes,
        filename=filename,
        content_type=content_type or "application/octet-stream",
    )

    req = request.Request(
        settings.caremate_stt_url,
        data=multipart_body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=settings.stt_timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise CareMateWhisperServiceError(
            f"CareMate Whisper STT failed with status {exc.code}: {detail}"
        ) from exc
    except error.URLError as exc:
        raise CareMateWhisperServiceError(f"CareMate Whisper STT failed: {exc.reason}") from exc

    if body.get("has_repetition_issue"):
        reasons = body.get("issue_reasons") or []
        raise CareMateWhisperServiceError(f"CareMate Whisper STT repetition issue: {reasons}")

    text = body.get("transcript") or body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise CareMateWhisperServiceError("CareMate Whisper STT response did not include transcript.")

    return text.strip()


def _build_multipart_body(
    *,
    boundary: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> bytes:
    return b"".join(
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

