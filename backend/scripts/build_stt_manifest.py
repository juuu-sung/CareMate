import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


TRAIN_RATIO = 0.80
VALIDATION_RATIO = 0.10
TEST_RATIO = 0.10

TARGET_MIX_RATIO = {
    "dialect": 0.55,
    "elder_command": 0.45,
}

SERVICE_CRITICAL_PATTERNS = {
    "schedule": ["일정", "예약", "병원", "약속"],
    "medication": ["약", "복약", "먹었", "먹을", "혈압약", "당뇨약"],
    "guardian_message": ["보호자", "아들", "딸", "문자", "메시지", "보내"],
    "mode_change": ["모드", "바꿔", "변경", "인지 지원", "건강 관리"],
}

AUDIO_EXTENSIONS = (".wav", ".WAV")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a unified STT manifest for Whisper experiments.")
    parser.add_argument("--dialect-root", type=Path, required=True, help="Root directory of the dialect dataset.")
    parser.add_argument("--command-root", type=Path, required=True, help="Root directory of the elder command dataset.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory to write manifest outputs.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    entries = []
    entries.extend(build_entries(args.dialect_root, source="dialect"))
    entries.extend(build_entries(args.command_root, source="elder_command"))

    if not entries:
        raise SystemExit("No manifest entries were built. Check dataset paths and JSON layout.")

    assign_splits(entries)
    apply_sampling_weights(entries)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_outputs(entries, args.output_dir)

    summary = build_summary(entries)
    summary_path = args.output_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Built {len(entries)} manifest rows.")
    print(f"Summary written to {summary_path}")


def build_entries(root: Path, *, source: str) -> list[dict[str, Any]]:
    json_files = sorted(root.rglob("*.json"))
    entries: list[dict[str, Any]] = []

    for json_path in json_files:
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
        except UnicodeDecodeError:
            payload = json.loads(json_path.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError:
            continue

        if source == "dialect":
            entry = build_dialect_entry(root, json_path, payload)
        else:
            entry = build_command_entry(root, json_path, payload)

        if entry is not None:
            entries.append(entry)

    return entries


def build_dialect_entry(root: Path, json_path: Path, payload: dict[str, Any]) -> dict[str, Any] | None:
    transcript = clean_text(
        extract_first(
            payload,
            [
                ("전사정보", "LabelText"),
                ("Label_Info", "LabelText"),
                ("label",),
                ("transcript",),
                ("text",),
            ],
        )
    )
    if not transcript:
        return None

    audio_path = guess_audio_path(root, json_path, payload)
    if audio_path is None:
        return None

    speaker_id = stringify(
        extract_first(
            payload,
            [
                ("화자정보", "SpeakerName"),
                ("Speaker_Info", "SpeakerName"),
                ("speaker", "id"),
            ],
        )
    ) or audio_path.stem

    region = normalize_region(
        stringify(
            extract_first(
                payload,
                [
                    ("화자정보", "Region"),
                    ("Speaker_Info", "Region"),
                    ("speaker", "region"),
                ],
            )
        )
    )
    dialect = normalize_region(
        stringify(
            extract_first(
                payload,
                [
                    ("화자정보", "Dialect"),
                    ("Speaker_Info", "Dialect"),
                    ("speaker", "dialect"),
                ],
            )
        )
    )

    utterance_type = normalize_utterance_type(
        stringify(
            extract_first(
                payload,
                [
                    ("주석정보", "UtteranceType"),
                    ("Annotation_Info", "UtteranceType"),
                    ("utterance", "type"),
                ],
            )
        )
        or infer_dialect_type_from_path(audio_path)
    )

    return {
        "id": f"dialect_{audio_path.stem}",
        "audio_path": str(audio_path),
        "transcript": transcript,
        "normalized_text": transcript,
        "source": "dialect",
        "split": None,
        "speaker": {
            "id": speaker_id,
            "gender": normalize_gender(
                stringify(
                    extract_first(
                        payload,
                        [
                            ("화자정보", "Gender"),
                            ("Speaker_Info", "Gender"),
                            ("speaker", "gender"),
                        ],
                    )
                )
            ),
            "age_group": normalize_age_group(
                stringify(
                    extract_first(
                        payload,
                        [
                            ("화자정보", "Age"),
                            ("Speaker_Info", "Age"),
                            ("speaker", "age_group"),
                        ],
                    )
                )
            ),
            "region": region,
            "dialect": dialect or region,
        },
        "utterance": {
            "type": utterance_type or "unknown",
            "domain": "free_speech",
            "is_command": False,
        },
        "audio": {
            "sampling_rate": extract_int(
                extract_first(
                    payload,
                    [
                        ("음성정보", "SamplingRate"),
                        ("Wave_Info", "SamplingRate"),
                    ],
                )
            ),
            "channels": extract_int(
                extract_first(
                    payload,
                    [
                        ("음성정보", "NumberOfChannel"),
                        ("Wave_Info", "NumberOfChannel"),
                    ],
                )
            ),
            "bit_depth": extract_int(
                extract_first(
                    payload,
                    [
                        ("음성정보", "NumberOfBit"),
                        ("Wave_Info", "NumberOfBit"),
                    ],
                )
            ),
        },
        "environment": {
            "recording_env": stringify(
                extract_first(
                    payload,
                    [
                        ("환경정보", "RecordingEnviron"),
                        ("Environment_Info", "RecordingEnviron"),
                    ],
                )
            ),
            "noise_env": stringify(
                extract_first(
                    payload,
                    [
                        ("환경정보", "NoiseEnviron"),
                        ("Environment_Info", "NoiseEnviron"),
                    ],
                )
            ),
            "device": stringify(
                extract_first(
                    payload,
                    [
                        ("환경정보", "RecordingDevice"),
                        ("Environment_Info", "RecordingDevice"),
                    ],
                )
            ),
        },
        "sampling_weight": None,
        "meta": {
            "raw_json_path": str(json_path),
        },
    }


def build_command_entry(root: Path, json_path: Path, payload: dict[str, Any]) -> dict[str, Any] | None:
    transcript = clean_text(
        extract_first(
            payload,
            [
                ("전사정보", "LabelText"),
                ("Label_Info", "LabelText"),
                ("label",),
                ("transcript",),
                ("text",),
            ],
        )
    )
    if not transcript:
        return None

    audio_path = guess_audio_path(root, json_path, payload)
    if audio_path is None:
        return None

    domain = infer_command_domain(audio_path, payload)
    speaker_id = stringify(
        extract_first(
            payload,
            [
                ("화자정보", "SpeakerName"),
                ("Speaker_Info", "SpeakerName"),
                ("speaker", "id"),
            ],
        )
    ) or audio_path.stem

    return {
        "id": f"elder_command_{audio_path.stem}",
        "audio_path": str(audio_path),
        "transcript": transcript,
        "normalized_text": transcript,
        "source": "elder_command",
        "split": None,
        "speaker": {
            "id": speaker_id,
            "gender": normalize_gender(
                stringify(
                    extract_first(
                        payload,
                        [
                            ("화자정보", "Gender"),
                            ("Speaker_Info", "Gender"),
                            ("speaker", "gender"),
                        ],
                    )
                )
            ),
            "age_group": normalize_age_group(
                stringify(
                    extract_first(
                        payload,
                        [
                            ("화자정보", "Age"),
                            ("Speaker_Info", "Age"),
                            ("speaker", "age_group"),
                        ],
                    )
                )
            ),
            "region": normalize_region(
                stringify(
                    extract_first(
                        payload,
                        [
                            ("화자정보", "Region"),
                            ("Speaker_Info", "Region"),
                            ("speaker", "region"),
                        ],
                    )
                )
            ),
            "dialect": normalize_region(
                stringify(
                    extract_first(
                        payload,
                        [
                            ("화자정보", "Dialect"),
                            ("Speaker_Info", "Dialect"),
                            ("speaker", "dialect"),
                        ],
                    )
                )
            ),
        },
        "utterance": {
            "type": "command",
            "domain": domain,
            "is_command": True,
        },
        "audio": {
            "sampling_rate": extract_int(
                extract_first(
                    payload,
                    [
                        ("음성정보", "SamplingRate"),
                        ("Wave_Info", "SamplingRate"),
                    ],
                )
            ),
            "channels": extract_int(
                extract_first(
                    payload,
                    [
                        ("음성정보", "NumberOfChannel"),
                        ("Wave_Info", "NumberOfChannel"),
                    ],
                )
            ),
            "bit_depth": extract_int(
                extract_first(
                    payload,
                    [
                        ("음성정보", "NumberOfBit"),
                        ("Wave_Info", "NumberOfBit"),
                    ],
                )
            ),
        },
        "environment": {
            "recording_env": stringify(
                extract_first(
                    payload,
                    [
                        ("환경정보", "RecordingEnviron"),
                        ("Environment_Info", "RecordingEnviron"),
                    ],
                )
            ),
            "noise_env": stringify(
                extract_first(
                    payload,
                    [
                        ("환경정보", "NoiseEnviron"),
                        ("Environment_Info", "NoiseEnviron"),
                    ],
                )
            ),
            "device": stringify(
                extract_first(
                    payload,
                    [
                        ("환경정보", "RecordingDevice"),
                        ("Environment_Info", "RecordingDevice"),
                    ],
                )
            ),
        },
        "sampling_weight": None,
        "meta": {
            "raw_json_path": str(json_path),
        },
    }


def assign_splits(entries: list[dict[str, Any]]) -> None:
    for entry in entries:
        speaker_key = f"{entry['source']}::{entry['speaker']['id']}"
        bucket = stable_bucket(speaker_key)

        if bucket < int(TRAIN_RATIO * 100):
            entry["split"] = "train"
            continue

        if bucket < int((TRAIN_RATIO + VALIDATION_RATIO) * 100):
            entry["split"] = "validation"
            continue

        if entry["source"] == "dialect":
            entry["split"] = "dialect_test"
            continue

        if is_service_critical_candidate(entry["transcript"]):
            entry["split"] = "service_critical_test"
        else:
            entry["split"] = "command_test"


def apply_sampling_weights(entries: list[dict[str, Any]]) -> None:
    train_counts = {
        "dialect": sum(1 for entry in entries if entry["split"] == "train" and entry["source"] == "dialect"),
        "elder_command": sum(1 for entry in entries if entry["split"] == "train" and entry["source"] == "elder_command"),
    }

    for entry in entries:
        if entry["split"] != "train":
            entry["sampling_weight"] = 1.0
            continue

        count = train_counts.get(entry["source"], 0)
        target = TARGET_MIX_RATIO.get(entry["source"], 0.0)
        entry["sampling_weight"] = round(target / count, 8) if count else 1.0


def write_outputs(entries: list[dict[str, Any]], output_dir: Path) -> None:
    write_jsonl(output_dir / "manifest_all.jsonl", entries)
    write_jsonl(output_dir / "train.jsonl", [entry for entry in entries if entry["split"] == "train"])
    write_jsonl(output_dir / "validation.jsonl", [entry for entry in entries if entry["split"] == "validation"])
    write_jsonl(output_dir / "test_dialect.jsonl", [entry for entry in entries if entry["split"] == "dialect_test"])
    write_jsonl(output_dir / "test_command.jsonl", [entry for entry in entries if entry["split"] == "command_test"])
    write_jsonl(
        output_dir / "test_service_critical.jsonl",
        [entry for entry in entries if entry["split"] == "service_critical_test"],
    )


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as file_obj:
        for row in rows:
            file_obj.write(json.dumps(row, ensure_ascii=False))
            file_obj.write("\n")


def build_summary(entries: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "total_rows": len(entries),
        "target_mix_ratio": TARGET_MIX_RATIO,
        "by_source": {},
        "by_split": {},
    }

    for source in ("dialect", "elder_command"):
        source_rows = [entry for entry in entries if entry["source"] == source]
        summary["by_source"][source] = {
            "count": len(source_rows),
            "splits": count_by_key(source_rows, "split"),
        }

    summary["by_split"] = count_by_key(entries, "split")
    return summary


def count_by_key(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        value = row.get(key, "unknown")
        counts[value] = counts.get(value, 0) + 1
    return counts


def guess_audio_path(root: Path, json_path: Path, payload: dict[str, Any]) -> Path | None:
    from_payload = stringify(
        extract_first(
            payload,
            [
                ("파일정보", "FileName"),
                ("File_Info", "FileName"),
                ("audio_path",),
                ("wav_path",),
            ],
        )
    )
    candidates: list[Path] = []

    if from_payload:
        payload_path = Path(from_payload)
        if payload_path.is_absolute():
            candidates.append(payload_path)
        else:
            candidates.append(json_path.parent / payload_path)
            candidates.append(root / payload_path)

    for extension in AUDIO_EXTENSIONS:
        candidates.append(json_path.with_suffix(extension))
        candidates.append(json_path.parent / f"{json_path.stem}{extension}")

    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    return None


def extract_first(payload: Any, key_paths: list[tuple[str, ...]]) -> Any:
    for key_path in key_paths:
        current = payload
        found = True
        for key in key_path:
            if not isinstance(current, dict) or key not in current:
                found = False
                break
            current = current[key]
        if found and current not in (None, "", "N/A", "NotProvided", "NotProvdied"):
            return current
    return None


def stringify(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def clean_text(value: Any) -> str | None:
    text = stringify(value)
    if not text:
        return None
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_int(value: Any) -> int | None:
    text = stringify(value)
    if not text:
        return None
    digits = re.sub(r"[^0-9]", "", text)
    return int(digits) if digits else None


def normalize_gender(value: str | None) -> str | None:
    if not value:
        return None
    lowered = value.lower()
    if lowered in {"female", "f", "여", "여성"}:
        return "female"
    if lowered in {"male", "m", "남", "남성"}:
        return "male"
    return lowered


def normalize_age_group(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.findall(r"\d+", value)
    if not digits:
        return value
    if len(digits) == 1:
        return f"{digits[0]}s"
    return f"{digits[0]}-{digits[-1]}"


def normalize_region(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip().lower()
    mapping = {
        "강원": "gangwon",
        "gangwon": "gangwon",
        "경상": "gyeongsang",
        "gyeongsang": "gyeongsang",
        "충청": "chungcheong",
        "chungcheong": "chungcheong",
        "전라": "jeolla",
        "jeolla": "jeolla",
        "제주": "jeju",
        "jeju": "jeju",
    }
    for key, normalized in mapping.items():
        if key in text:
            return normalized
    return text


def normalize_utterance_type(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip().lower()
    if "따라" in text or "repeat" in text:
        return "repeat"
    if "질문" in text or "답" in text or "qa" in text:
        return "qa"
    if "대화" in text or "dialog" in text:
        return "dialogue"
    if "명령" in text or "command" in text:
        return "command"
    return text


def infer_dialect_type_from_path(audio_path: Path) -> str | None:
    text = str(audio_path).lower()
    if "repeat" in text:
        return "repeat"
    if "dialog" in text or "conversation" in text:
        return "dialogue"
    if "question" in text or "qa" in text:
        return "qa"
    return None


def infer_command_domain(audio_path: Path, payload: dict[str, Any]) -> str:
    candidate = stringify(
        extract_first(
            payload,
            [
                ("기본정보", "ApplicationCategory"),
                ("DB_Info", "ApplicationCategory"),
            ],
        )
    )
    if candidate:
        lowered = candidate.lower()
        if "robot" in lowered:
            return "ai_robot"
        if "kiosk" in lowered:
            return "kiosk"
        if "assistant" in lowered:
            return "ai_assistant"

    path_text = str(audio_path).lower()
    if "robot" in path_text:
        return "ai_robot"
    if "kiosk" in path_text:
        return "kiosk"
    return "ai_assistant"


def is_service_critical_candidate(transcript: str) -> bool:
    return any(keyword in transcript for keyword in SERVICE_CRITICAL_KEYWORDS)


def stable_bucket(text: str) -> int:
    digest = hashlib.md5(text.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


if __name__ == "__main__":
    main()
