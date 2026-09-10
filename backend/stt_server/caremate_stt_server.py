import os
import re
import tempfile
from pathlib import Path
from typing import Any

import librosa
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from peft import PeftModel
from transformers import WhisperForConditionalGeneration, WhisperProcessor


BASE_MODEL = os.getenv("STT_BASE_MODEL", "openai/whisper-medium")
ADAPTER_DIR = os.getenv("STT_ADAPTER_DIR", "").strip()
STT_CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "STT_CORS_ORIGINS",
        "http://localhost:8081,http://localhost:19006",
    ).split(",")
    if origin.strip()
]
SAMPLE_RATE = int(os.getenv("STT_SAMPLE_RATE", "16000"))
MAX_SECONDS = float(os.getenv("STT_MAX_SECONDS", "30"))
MAX_NEW_TOKENS = int(os.getenv("STT_MAX_NEW_TOKENS", "80"))
NUM_BEAMS = int(os.getenv("STT_NUM_BEAMS", "1"))
MODEL_LABEL = os.getenv("STT_MODEL_LABEL", "whisper-medium-lora-r32-ckpt60000")

app = FastAPI(title="CareMate Fine-tuned Whisper STT")
app.add_middleware(
    CORSMiddleware,
    allow_origins=STT_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = torch.device("cpu")
torch_dtype = torch.float32
processor: WhisperProcessor | None = None
model: WhisperForConditionalGeneration | None = None


def resolve_device() -> torch.device:
    requested = os.getenv("STT_DEVICE", "auto").strip().lower()
    if requested and requested != "auto":
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def normalize_space(text: str) -> str:
    return " ".join(str(text or "").strip().split())


def has_long_char_repeat(text: str, threshold: int = 8) -> bool:
    compact = re.sub(r"\s+", "", text or "")
    return re.search(rf"(.)\1{{{threshold - 1},}}", compact) is not None


def has_repeated_token(text: str, threshold: int = 5) -> bool:
    tokens = normalize_space(text).split()
    prev = None
    count = 0

    for token in tokens:
        if token == prev:
            count += 1
        else:
            prev = token
            count = 1
        if count >= threshold:
            return True

    return False


def has_repeated_bigram(text: str, threshold: int = 4) -> bool:
    tokens = normalize_space(text).split()
    if len(tokens) < 4:
        return False

    prev = None
    count = 0
    for index in range(len(tokens) - 1):
        bigram = (tokens[index], tokens[index + 1])
        if bigram == prev:
            count += 1
        else:
            prev = bigram
            count = 1
        if count >= threshold:
            return True

    return False


def detect_repetition_issue(text: str, duration_sec: float) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    normalized = normalize_space(text)

    if has_long_char_repeat(normalized):
        reasons.append("long_char_repeat")
    if has_repeated_token(normalized):
        reasons.append("repeated_token")
    if has_repeated_bigram(normalized):
        reasons.append("repeated_bigram")
    if duration_sec <= 5.0 and len(normalized.replace(" ", "")) >= 40:
        reasons.append("too_long_for_short_audio")

    return bool(reasons), reasons


@app.on_event("startup")
def load_model() -> None:
    global device, torch_dtype, processor, model

    if not ADAPTER_DIR:
        raise RuntimeError("STT_ADAPTER_DIR must point to the local LoRA adapter directory.")

    adapter_path = Path(ADAPTER_DIR).expanduser()
    if not adapter_path.exists():
        raise FileNotFoundError(f"LoRA adapter directory does not exist: {adapter_path}")

    device = resolve_device()
    torch_dtype = torch.float16 if device.type == "cuda" else torch.float32

    print("=" * 80)
    print("CareMate STT model loading")
    print("=" * 80)
    print(f"device      : {device}")
    print(f"base_model  : {BASE_MODEL}")
    print("adapter     : configured")

    loaded_processor = WhisperProcessor.from_pretrained(
        BASE_MODEL,
        language="Korean",
        task="transcribe",
    )
    base_model = WhisperForConditionalGeneration.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch_dtype,
    )
    peft_model = PeftModel.from_pretrained(base_model, str(adapter_path))
    merged_model = peft_model.merge_and_unload()
    merged_model.to(device)
    merged_model.eval()

    processor = loaded_processor
    model = merged_model
    print("CareMate STT model loaded")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "device": str(device),
        "base_model": BASE_MODEL,
        "adapter_configured": bool(ADAPTER_DIR),
        "model": MODEL_LABEL,
        "max_new_tokens": MAX_NEW_TOKENS,
        "num_beams": NUM_BEAMS,
    }


@app.post("/stt")
async def transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    if processor is None or model is None:
        raise HTTPException(status_code=503, detail="STT model is not ready.")

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = Path(tmp.name)
        tmp.write(await file.read())

    try:
        audio, _ = librosa.load(str(tmp_path), sr=SAMPLE_RATE, mono=True)
        if audio is None or len(audio) == 0:
            raise HTTPException(status_code=400, detail="Audio could not be decoded.")

        duration_sec = len(audio) / SAMPLE_RATE
        if duration_sec > MAX_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Audio is too long. Send audio under {MAX_SECONDS:.0f}s.",
            )

        input_features = processor(
            audio,
            sampling_rate=SAMPLE_RATE,
            return_tensors="pt",
        ).input_features
        input_features = input_features.to(device=device, dtype=torch_dtype)
        forced_decoder_ids = processor.get_decoder_prompt_ids(language="ko", task="transcribe")

        with torch.no_grad():
            generated_ids = model.generate(
                input_features,
                forced_decoder_ids=forced_decoder_ids,
                max_new_tokens=MAX_NEW_TOKENS,
                num_beams=NUM_BEAMS,
            )

        transcript = normalize_space(
            processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        )
        has_issue, issue_reasons = detect_repetition_issue(transcript, duration_sec)

        return {
            "transcript": transcript,
            "duration_sec": duration_sec,
            "has_repetition_issue": has_issue,
            "issue_reasons": issue_reasons,
            "model": MODEL_LABEL,
            "max_new_tokens": MAX_NEW_TOKENS,
            "num_beams": NUM_BEAMS,
        }
    finally:
        tmp_path.unlink(missing_ok=True)
