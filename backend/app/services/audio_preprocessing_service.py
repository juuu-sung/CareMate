"""
오디오 파일을 16kHz mono float32 numpy array로 정규화한다.
soundfile로 읽을 수 없는 포맷(m4a, mp3 등)은 ffmpeg subprocess로 변환 후 읽는다.
"""

import logging
import math
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

SAMPLING_RATE = 16000
MAX_AUDIO_SAMPLES = 160000  # 10초


def _resample(waveform: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    if orig_sr == target_sr:
        return waveform
    try:
        from scipy.signal import resample_poly
        gcd = math.gcd(target_sr, orig_sr)
        return resample_poly(waveform, target_sr // gcd, orig_sr // gcd).astype(np.float32)
    except ImportError:
        try:
            import torch
            import torch.nn.functional as F
            t = torch.from_numpy(waveform).unsqueeze(0).unsqueeze(0)
            new_len = int(len(waveform) * target_sr / orig_sr)
            t = F.interpolate(t, size=new_len, mode="linear", align_corners=False)
            return t.squeeze().numpy().astype(np.float32)
        except ImportError:
            raise RuntimeError("scipy 또는 torch 중 하나가 필요합니다.")


def _try_load_soundfile(path: str) -> tuple[np.ndarray, int] | None:
    try:
        import soundfile as sf
        waveform, sr = sf.read(path, dtype="float32", always_2d=False)
        return waveform, sr
    except Exception:
        return None


def _try_load_via_ffmpeg(input_path: str) -> tuple[np.ndarray, int] | None:
    """ffmpeg으로 16kHz mono WAV로 변환 후 읽는다."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
        tmp_wav_path = tmp_wav.name

    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", input_path,
                "-ar", str(SAMPLING_RATE),
                "-ac", "1",
                "-f", "wav",
                tmp_wav_path,
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            logger.warning(
                "ffmpeg 변환 실패 (returncode=%d): %s",
                result.returncode,
                result.stderr.decode(errors="replace")[:200],
            )
            return None
        result = _try_load_soundfile(tmp_wav_path)
        return result
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None
    finally:
        try:
            os.unlink(tmp_wav_path)
        except OSError:
            pass


def _clip_or_pad(waveform: np.ndarray) -> np.ndarray:
    """중앙 10초 crop 또는 zero-padding."""
    n = len(waveform)
    if n > MAX_AUDIO_SAMPLES:
        start = (n - MAX_AUDIO_SAMPLES) // 2
        return waveform[start: start + MAX_AUDIO_SAMPLES]
    if n < MAX_AUDIO_SAMPLES:
        return np.pad(waveform, (0, MAX_AUDIO_SAMPLES - n), mode="constant")
    return waveform


def load_waveform_from_bytes(
    audio_bytes: bytes,
    filename: str = "audio.m4a",
) -> np.ndarray:
    """
    음성 bytes를 16kHz mono float32 numpy array로 변환하여 반환.
    10초 초과 시 중앙 10초 사용, 미만 시 zero-padding.
    """
    if not audio_bytes:
        raise ValueError("음성 데이터가 비어 있습니다.")

    suffix = Path(filename).suffix.lower() or ".m4a"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        result = _try_load_soundfile(tmp_path)
        if result is None:
            result = _try_load_via_ffmpeg(tmp_path)
        if result is None:
            raise ValueError(
                f"오디오 파일을 읽을 수 없습니다. 지원 포맷: WAV, FLAC, OGG (ffmpeg 설치 시 M4A, MP3 가능). 파일명: {filename}"
            )

        waveform, sr = result

        if waveform.size == 0:
            raise ValueError("음성 데이터가 비어 있습니다.")

        if waveform.ndim == 2:
            waveform = waveform.mean(axis=1)
        elif waveform.ndim > 2:
            raise ValueError(f"지원하지 않는 오디오 shape: {waveform.shape}")

        waveform = waveform.astype(np.float32)
        waveform = _resample(waveform, sr, SAMPLING_RATE)
        waveform = np.nan_to_num(waveform, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)
        waveform = _clip_or_pad(waveform)

        return waveform

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
