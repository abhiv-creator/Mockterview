from pathlib import Path

import whisper


model_directory = Path(__file__).resolve().parents[1] / "models" / "whisper"
model_directory.mkdir(parents=True, exist_ok=True)
whisper.load_model("base.en", device="cpu", download_root=str(model_directory))
print(f"Whisper base.en is ready in {model_directory}")
