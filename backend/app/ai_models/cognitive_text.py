"""
KoELECTRA 기반 인지기능 텍스트 분류 모델.
transcript를 입력받아 인지기능 저하 확률(0~1)을 반환한다.
"""

from pathlib import Path
from threading import Lock

import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer

APP_ROOT = Path(__file__).resolve().parents[1]

PRETRAINED_MODEL_PATH = APP_ROOT / "ai_models" / "pretrained_models" / "koelectra_base_v3"
CHECKPOINT_PATH = APP_ROOT / "ai_models" / "checkpoints" / "cognitive" / "koelectra_best_auroc.pt"

MAX_LENGTH = 512
DROPOUT = 0.3
DEFAULT_THRESHOLD = 0.5

DEVICE = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")


class CognitiveTextClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(str(PRETRAINED_MODEL_PATH), local_files_only=True)
        hidden_size = self.encoder.config.hidden_size  # 768
        self.classifier = nn.Sequential(
            nn.Dropout(DROPOUT),
            nn.Linear(hidden_size, hidden_size // 2),
            nn.GELU(),
            nn.Dropout(DROPOUT),
            nn.Linear(hidden_size // 2, 2),
        )

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        outputs = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        cls = outputs.last_hidden_state[:, 0, :]
        return self.classifier(cls)


class CognitiveTextInference:
    def __init__(self):
        self.tokenizer = None
        self.model = None
        self._lock = Lock()

    def load(self) -> None:
        if self.model is not None:
            return
        with self._lock:
            if self.model is not None:
                return
            if not PRETRAINED_MODEL_PATH.exists():
                raise FileNotFoundError(f"KoELECTRA pretrained 모델 없음: {PRETRAINED_MODEL_PATH}")
            if not CHECKPOINT_PATH.exists():
                raise FileNotFoundError(f"KoELECTRA 체크포인트 없음: {CHECKPOINT_PATH}")

            self.tokenizer = AutoTokenizer.from_pretrained(str(PRETRAINED_MODEL_PATH), local_files_only=True)

            model = CognitiveTextClassifier()
            checkpoint = torch.load(CHECKPOINT_PATH, map_location="cpu", weights_only=False)
            sd = checkpoint.get("model_state_dict", checkpoint.get("state_dict", checkpoint))
            sd = {(k[len("module."):] if k.startswith("module.") else k): v for k, v in sd.items()}
            model.load_state_dict(sd, strict=True)
            model.to(DEVICE)
            model.eval()
            self.model = model
            print("[Cognitive Text] KoELECTRA 모델 로딩 완료:", DEVICE)

    @torch.inference_mode()
    def predict(self, text: str, threshold: float = DEFAULT_THRESHOLD) -> dict:
        if self.model is None:
            self.load()
        if not text or not text.strip():
            return {"abnormal_probability": 0.0, "label": 0, "label_name": "normal"}

        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            max_length=MAX_LENGTH,
            truncation=True,
            padding=False,
        )
        input_ids = inputs["input_ids"].to(DEVICE)
        attention_mask = inputs["attention_mask"].to(DEVICE)

        logits = self.model(input_ids, attention_mask)
        probs = torch.softmax(logits, dim=1)
        normal_prob = float(probs[0, 0].item())
        abnormal_prob = float(probs[0, 1].item())
        label = int(abnormal_prob >= threshold)
        return {
            "label": label,
            "label_name": "mci_or_ad" if label == 1 else "normal",
            "normal_probability": normal_prob,
            "abnormal_probability": abnormal_prob,
        }


cognitive_text_inference = CognitiveTextInference()
