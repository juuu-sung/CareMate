from pathlib import Path
from threading import Lock
import logging

import numpy as np
import torch
import torch.nn as nn
from transformers import AutoFeatureExtractor, AutoModel

logger = logging.getLogger(__name__)

APP_ROOT = Path(__file__).resolve().parents[1]

PRETRAINED_MODEL_PATH = APP_ROOT / "ai_models" / "pretrained_models" / "xls_r_300m"
CHECKPOINT_PATH = (
    APP_ROOT / "ai_models" / "checkpoints" / "depression" / "best_depression_wav_xlsr_auroc.pt"
)

SAMPLING_RATE = 16000
MAX_AUDIO_LENGTH = 160000
DROPOUT = 0.2
DEFAULT_THRESHOLD = 0.5

DEVICE = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")


class BinaryWavClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.backbone = AutoModel.from_pretrained(
            str(PRETRAINED_MODEL_PATH), local_files_only=True
        )
        hidden_size = self.backbone.config.hidden_size
        self.classifier = nn.Sequential(
            nn.Dropout(DROPOUT),
            nn.Linear(hidden_size, 1),
        )

    def forward(self, input_values: torch.Tensor) -> torch.Tensor:
        outputs = self.backbone(input_values=input_values)
        pooled = outputs.last_hidden_state.mean(dim=1)
        return self.classifier(pooled).squeeze(-1)


def _extract_state_dict(checkpoint: dict) -> dict:
    if not isinstance(checkpoint, dict):
        raise TypeError(f"체크포인트 형식이 dict가 아닙니다: {type(checkpoint)}")

    if "model_state_dict" in checkpoint:
        sd = checkpoint["model_state_dict"]
    elif "state_dict" in checkpoint:
        sd = checkpoint["state_dict"]
    else:
        first_vals = list(checkpoint.values())[:3]
        if first_vals and hasattr(first_vals[0], "shape"):
            sd = checkpoint
        else:
            raise ValueError("state_dict를 찾을 수 없습니다.")

    return {
        (k[len("module."):] if k.startswith("module.") else k): v
        for k, v in sd.items()
    }


class DepressionWavInference:
    def __init__(self):
        self.feature_extractor = None
        self.model = None
        self._lock = Lock()

    def load(self) -> None:
        if self.model is not None:
            return
        with self._lock:
            if self.model is not None:
                return

            if not PRETRAINED_MODEL_PATH.exists():
                raise FileNotFoundError(
                    f"사전학습 모델이 없습니다: {PRETRAINED_MODEL_PATH}"
                )
            if not CHECKPOINT_PATH.exists():
                raise FileNotFoundError(
                    f"체크포인트가 없습니다: {CHECKPOINT_PATH}"
                )

            self.feature_extractor = AutoFeatureExtractor.from_pretrained(
                str(PRETRAINED_MODEL_PATH), local_files_only=True
            )

            model = BinaryWavClassifier()
            ckpt = torch.load(CHECKPOINT_PATH, map_location="cpu", weights_only=False)
            sd = _extract_state_dict(ckpt)

            try:
                model.load_state_dict(sd, strict=True)
            except RuntimeError as e:
                missing = [k for k in model.state_dict() if k not in sd]
                unexpected = [k for k in sd if k not in model.state_dict()]
                logger.error(
                    "DepressionWAV strict load failed. missing=%s unexpected=%s",
                    missing[:5],
                    unexpected[:5],
                )
                raise RuntimeError(f"Depression WAV checkpoint 로딩 실패: {e}") from e

            model.to(DEVICE)
            model.eval()
            self.model = model
            logger.info("[Depression WAV] 모델 로딩 완료: %s", DEVICE)

    @torch.inference_mode()
    def predict_from_waveform(
        self, waveform: np.ndarray, threshold: float = DEFAULT_THRESHOLD
    ) -> dict:
        if self.model is None:
            self.load()
        if self.feature_extractor is None:
            raise RuntimeError("Feature Extractor가 로딩되지 않았습니다.")
        if not 0.0 <= threshold <= 1.0:
            raise ValueError("threshold는 0.0~1.0 사이여야 합니다.")

        inputs = self.feature_extractor(
            waveform,
            sampling_rate=SAMPLING_RATE,
            return_tensors="pt",
            padding=False,
        )
        input_values = inputs.input_values.to(DEVICE)

        logit = self.model(input_values)
        probability = float(torch.sigmoid(logit).item())
        prediction = int(probability >= threshold)

        return {
            "probability": probability,
            "prediction": prediction,
            "threshold": threshold,
        }

    @torch.inference_mode()
    def predict(self, audio_path, threshold: float = DEFAULT_THRESHOLD) -> dict:
        from app.ai_models.cognitive_wav import load_audio
        waveform = load_audio(audio_path)
        return self.predict_from_waveform(waveform, threshold)


depression_wav_inference = DepressionWavInference()
