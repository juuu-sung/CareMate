from pathlib import Path
from threading import Lock

import numpy as np
import soundfile as sf
import torch
import torch.nn as nn
from scipy.signal import resample_poly
from transformers import AutoFeatureExtractor, AutoModel


# cognitive_wav.py 위치:
# backend/app/ai_models/cognitive_wav.py
APP_ROOT = Path(__file__).resolve().parents[1]

PRETRAINED_MODEL_PATH = (
    APP_ROOT
    / "ai_models"
    / "pretrained_models"
    / "xls_r_300m"
)

CHECKPOINT_PATH = (
    APP_ROOT
    / "ai_models"
    / "checkpoints"
    / "cognitive"
    / "cognitive_wav_best.pt"
)

SAMPLING_RATE = 16000
MAX_LENGTH_SEC = 10.0
MAX_AUDIO_LENGTH = int(SAMPLING_RATE * MAX_LENGTH_SEC)

NUM_CLASSES = 2
DROPOUT = 0.3
DEFAULT_THRESHOLD = 0.5

DEVICE = torch.device(
    "cuda:0" if torch.cuda.is_available() else "cpu"
)


class WavClassifier(nn.Module):
    def __init__(self):
        super().__init__()

        self.encoder = AutoModel.from_pretrained(
            str(PRETRAINED_MODEL_PATH),
            local_files_only=True,
        )

        hidden_size = self.encoder.config.hidden_size

        self.classifier = nn.Sequential(
            nn.Dropout(DROPOUT),
            nn.Linear(
                hidden_size,
                hidden_size // 2,
            ),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.Linear(
                hidden_size // 2,
                NUM_CLASSES,
            ),
        )

    def forward(self, input_values: torch.Tensor) -> torch.Tensor:
        outputs = self.encoder(
            input_values=input_values,
        )

        hidden = outputs.last_hidden_state

        # 정상 추론됐던 학습/검증 코드와 동일
        pooled = hidden.mean(dim=1)

        return self.classifier(pooled)


def extract_state_dict(checkpoint: dict) -> dict:
    if not isinstance(checkpoint, dict):
        raise TypeError("체크포인트 형식이 dict가 아닙니다.")

    if "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]

    elif "state_dict" in checkpoint:
        state_dict = checkpoint["state_dict"]

    elif (
        "model" in checkpoint
        and isinstance(checkpoint["model"], dict)
    ):
        state_dict = checkpoint["model"]

    else:
        state_dict = checkpoint

    cleaned_state_dict = {}

    for key, value in state_dict.items():
        if key.startswith("module."):
            key = key[len("module."):]

        cleaned_state_dict[key] = value

    return cleaned_state_dict


def load_audio(audio_path: str | Path) -> np.ndarray:
    audio_path = Path(audio_path)

    if not audio_path.exists():
        raise FileNotFoundError(
            f"음성 파일이 없습니다: {audio_path}"
        )

    try:
        waveform, original_sr = sf.read(
            str(audio_path),
            dtype="float32",
            always_2d=False,
        )
    except Exception as error:
        raise ValueError(
            "음성 파일을 읽을 수 없습니다. "
            "현재는 WAV 또는 FLAC 형식을 사용해 주세요."
        ) from error

    waveform = np.asarray(
        waveform,
        dtype=np.float32,
    )

    if waveform.size == 0:
        raise ValueError("음성 데이터가 비어 있습니다.")

    # stereo → mono
    if waveform.ndim == 2:
        waveform = waveform.mean(axis=1)

    elif waveform.ndim > 2:
        raise ValueError(
            f"지원하지 않는 음성 shape입니다: {waveform.shape}"
        )

    if original_sr <= 0:
        raise ValueError(
            f"잘못된 샘플링레이트입니다: {original_sr}"
        )

    # 16kHz 리샘플링
    if original_sr != SAMPLING_RATE:
        waveform = resample_poly(
            waveform,
            SAMPLING_RATE,
            original_sr,
        ).astype(np.float32)

    if not np.isfinite(waveform).all():
        raise ValueError(
            "음성에 NaN 또는 inf가 포함되어 있습니다."
        )

    # 10초 초과: 가운데 10초
    if len(waveform) > MAX_AUDIO_LENGTH:
        start = (
            len(waveform) - MAX_AUDIO_LENGTH
        ) // 2

        waveform = waveform[
            start:start + MAX_AUDIO_LENGTH
        ]

    # 10초 이하: 뒤쪽 zero padding
    else:
        pad_length = (
            MAX_AUDIO_LENGTH - len(waveform)
        )

        waveform = np.pad(
            waveform,
            (0, pad_length),
            mode="constant",
        )

    return waveform.astype(np.float32)


class CognitiveWavInference:
    def __init__(self):
        self.feature_extractor = None
        self.model = None
        self._load_lock = Lock()

    def load(self) -> None:
        if self.model is not None:
            return

        # 동시 요청이 들어와도 모델은 한 번만 로딩
        with self._load_lock:
            if self.model is not None:
                return

            if not PRETRAINED_MODEL_PATH.exists():
                raise FileNotFoundError(
                    "사전학습 모델 폴더가 없습니다: "
                    f"{PRETRAINED_MODEL_PATH}"
                )

            if not CHECKPOINT_PATH.exists():
                raise FileNotFoundError(
                    "체크포인트가 없습니다: "
                    f"{CHECKPOINT_PATH}"
                )

            self.feature_extractor = (
                AutoFeatureExtractor.from_pretrained(
                    str(PRETRAINED_MODEL_PATH),
                    local_files_only=True,
                )
            )

            model = WavClassifier()

            checkpoint = torch.load(
                CHECKPOINT_PATH,
                map_location="cpu",
            )

            state_dict = extract_state_dict(checkpoint)

            model.load_state_dict(
                state_dict,
                strict=True,
            )

            model.to(DEVICE)
            model.eval()

            self.model = model

            print(
                "[Cognitive WAV] 모델 로딩 완료:",
                DEVICE,
            )

    @torch.inference_mode()
    def predict_from_waveform(
        self,
        waveform: "np.ndarray",
        threshold: float = DEFAULT_THRESHOLD,
    ) -> dict:
        if not 0.0 <= threshold <= 1.0:
            raise ValueError("threshold는 0.0에서 1.0 사이여야 합니다.")
        if self.model is None:
            self.load()
        if self.feature_extractor is None:
            raise RuntimeError("Feature Extractor가 로딩되지 않았습니다.")

        inputs = self.feature_extractor(
            waveform,
            sampling_rate=SAMPLING_RATE,
            return_tensors="pt",
            padding=False,
        )
        input_values = inputs.input_values.to(DEVICE)
        logits = self.model(input_values)
        probabilities = torch.softmax(logits, dim=1)
        normal_probability = float(probabilities[0, 0].item())
        abnormal_probability = float(probabilities[0, 1].item())
        label = int(abnormal_probability >= threshold)
        return {
            "label": label,
            "label_name": "mci_or_ad" if label == 1 else "normal",
            "normal_probability": normal_probability,
            "abnormal_probability": abnormal_probability,
            "threshold": threshold,
        }

    @torch.inference_mode()
    def predict(
        self,
        audio_path: str | Path,
        threshold: float = DEFAULT_THRESHOLD,
    ) -> dict:
        if not 0.0 <= threshold <= 1.0:
            raise ValueError(
                "threshold는 0.0에서 1.0 사이여야 합니다."
            )

        if self.model is None:
            self.load()

        if self.feature_extractor is None:
            raise RuntimeError(
                "Feature Extractor가 로딩되지 않았습니다."
            )

        waveform = load_audio(audio_path)

        inputs = self.feature_extractor(
            waveform,
            sampling_rate=SAMPLING_RATE,
            return_tensors="pt",
            padding=False,
        )

        input_values = inputs.input_values.to(DEVICE)

        logits = self.model(input_values)

        probabilities = torch.softmax(
            logits,
            dim=1,
        )

        normal_probability = float(
            probabilities[0, 0].item()
        )

        abnormal_probability = float(
            probabilities[0, 1].item()
        )

        # threshold 기준으로 최종 라벨 결정
        label = int(
            abnormal_probability >= threshold
        )

        return {
            "label": label,
            "label_name": (
                "mci_or_ad"
                if label == 1
                else "normal"
            ),
            "normal_probability": normal_probability,
            "abnormal_probability": abnormal_probability,
            "threshold": threshold,
        }


cognitive_wav_inference = CognitiveWavInference()