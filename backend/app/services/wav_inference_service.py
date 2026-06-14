"""
정규화된 waveform에 대해 3개 WAV 모델 추론을 실행한다.
모델별 오류는 격리하여 나머지 추론을 계속 수행한다.
"""

import logging
from time import perf_counter
from dataclasses import dataclass, field

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class WavModelResult:
    status: str = "pending"   # pending | ok | error | unavailable
    probability: float | None = None
    prediction: int | None = None
    error: str | None = None
    inference_ms: int | None = None


@dataclass
class WavInferenceResult:
    cognitive: WavModelResult = field(default_factory=WavModelResult)
    depression: WavModelResult = field(default_factory=WavModelResult)
    insomnia: WavModelResult = field(default_factory=WavModelResult)


def run_text_inference(transcript: str) -> WavModelResult:
    """transcript 텍스트로 인지기능 텍스트 추론을 실행한다."""
    from app.ai_models.model_registry import model_registry
    from time import perf_counter

    model = model_registry.cognitive_text
    if model is None:
        return WavModelResult(status="unavailable", error="cognitive_text 모델이 로딩되지 않았습니다.")

    t0 = perf_counter()
    try:
        out = model.predict(transcript)
        ms = int((perf_counter() - t0) * 1000)
        return WavModelResult(
            status="ok",
            probability=float(out["abnormal_probability"]),
            prediction=int(out["label"]),
            inference_ms=ms,
        )
    except Exception as e:
        logger.exception("[cognitive_text] 추론 오류")
        return WavModelResult(status="error", error=str(e)[:200])


def run_wav_inference(waveform: np.ndarray) -> WavInferenceResult:
    """
    3개 WAV 모델에 동일한 waveform을 전달하고 결과를 반환한다.
    각 모델 오류는 개별 기록하며 다른 모델 추론을 중단하지 않는다.
    """
    result = WavInferenceResult()

    # 인지기능 WAV
    result.cognitive = _run_single(
        "cognitive_wav",
        lambda m, w: m.predict_from_waveform(w, threshold=settings.COGNITIVE_WAV_THRESHOLD),
        waveform,
        prob_key="abnormal_probability",
        pred_key="label",
    )

    # 우울 WAV
    result.depression = _run_single(
        "depression_wav",
        lambda m, w: m.predict_from_waveform(w, threshold=settings.DEPRESSION_WAV_THRESHOLD),
        waveform,
        prob_key="probability",
        pred_key="prediction",
    )

    # 불면 WAV
    result.insomnia = _run_single(
        "insomnia_wav",
        lambda m, w: m.predict_from_waveform(w, threshold=settings.INSOMNIA_WAV_THRESHOLD),
        waveform,
        prob_key="probability",
        pred_key="prediction",
    )

    return result


def _run_single(
    model_name: str,
    run_fn,
    waveform: np.ndarray,
    *,
    prob_key: str,
    pred_key: str,
) -> WavModelResult:
    from app.ai_models.model_registry import model_registry

    model = getattr(model_registry, model_name, None)
    if model is None:
        return WavModelResult(status="unavailable", error=f"{model_name} 모델이 로딩되지 않았습니다.")

    t0 = perf_counter()
    try:
        out = run_fn(model, waveform)
        ms = int((perf_counter() - t0) * 1000)
        return WavModelResult(
            status="ok",
            probability=float(out[prob_key]),
            prediction=int(out[pred_key]),
            inference_ms=ms,
        )
    except MemoryError as e:
        logger.error("[%s] CUDA OOM 또는 메모리 부족: %s", model_name, e)
        return WavModelResult(status="error", error="메모리 부족")
    except Exception as e:
        logger.exception("[%s] 추론 오류", model_name)
        return WavModelResult(status="error", error=str(e)[:200])
