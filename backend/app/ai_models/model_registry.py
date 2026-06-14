import logging

logger = logging.getLogger(__name__)

_TORCH_AVAILABLE = False
try:
    import torch  # noqa: F401
    _TORCH_AVAILABLE = True
except ImportError:
    logger.warning("torch가 설치되지 않아 WAV AI 모델을 비활성화합니다.")


class ModelRegistry:
    """애플리케이션 시작 시 한 번만 모델을 로드하고 보관하는 레지스트리."""

    def __init__(self):
        self._cognitive_wav = None
        self._cognitive_text = None
        self._depression_wav = None
        self._insomnia_wav = None
        self._loaded = False

    def load_all(self) -> None:
        if self._loaded:
            return
        if not _TORCH_AVAILABLE:
            logger.warning("torch 없음 - WAV 모델 로딩 건너뜁니다.")
            self._loaded = True
            return

        self._load_cognitive_wav()
        self._load_cognitive_text()
        self._load_depression_wav()
        self._load_insomnia_wav()
        self._loaded = True
        logger.info("[ModelRegistry] 모든 모델 로딩 완료")

    def _load_cognitive_wav(self) -> None:
        try:
            from app.ai_models.cognitive_wav import cognitive_wav_inference
            cognitive_wav_inference.load()
            self._cognitive_wav = cognitive_wav_inference
            logger.info("[ModelRegistry] Cognitive WAV 로딩 성공")
        except FileNotFoundError as e:
            logger.error("[ModelRegistry] Cognitive WAV 경로 오류: %s", e)
        except Exception as e:
            logger.error("[ModelRegistry] Cognitive WAV 로딩 실패: %s", e)

    def _load_cognitive_text(self) -> None:
        try:
            from app.ai_models.cognitive_text import cognitive_text_inference
            cognitive_text_inference.load()
            self._cognitive_text = cognitive_text_inference
            logger.info("[ModelRegistry] Cognitive Text (KoELECTRA) 로딩 성공")
        except FileNotFoundError as e:
            logger.error("[ModelRegistry] Cognitive Text 경로 오류: %s", e)
        except Exception as e:
            logger.error("[ModelRegistry] Cognitive Text 로딩 실패: %s", e)

    def _load_depression_wav(self) -> None:
        try:
            from app.ai_models.depression_wav import depression_wav_inference
            depression_wav_inference.load()
            self._depression_wav = depression_wav_inference
            logger.info("[ModelRegistry] Depression WAV 로딩 성공")
        except FileNotFoundError as e:
            logger.error("[ModelRegistry] Depression WAV 경로 오류: %s", e)
        except Exception as e:
            logger.error("[ModelRegistry] Depression WAV 로딩 실패: %s", e)

    def _load_insomnia_wav(self) -> None:
        try:
            from app.ai_models.insomnia_wav import insomnia_wav_inference
            insomnia_wav_inference.load()
            self._insomnia_wav = insomnia_wav_inference
            logger.info("[ModelRegistry] Insomnia WAV 로딩 성공")
        except FileNotFoundError as e:
            logger.error("[ModelRegistry] Insomnia WAV 경로 오류: %s", e)
        except Exception as e:
            logger.error("[ModelRegistry] Insomnia WAV 로딩 실패: %s", e)

    @property
    def cognitive_wav(self):
        return self._cognitive_wav

    @property
    def cognitive_text(self):
        return self._cognitive_text

    @property
    def depression_wav(self):
        return self._depression_wav

    @property
    def insomnia_wav(self):
        return self._insomnia_wav

    @property
    def is_available(self) -> bool:
        return _TORCH_AVAILABLE and any(
            m is not None
            for m in [self._cognitive_wav, self._depression_wav, self._insomnia_wav]
        )


model_registry = ModelRegistry()
