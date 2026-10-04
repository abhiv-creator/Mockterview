# Mockterview

Mockterview is a local-first voice practice coach for technical interviews, oral exams, and presentations. Record an answer, save it, and get a clarity score, detected filler words, technical points, and suggestions for improvement.

> **Demo:** [http://localhost:3000](http://localhost:3000) after starting the development server. This is a local address, not a public deployment.

## Features

- Accessible, responsive recording dashboard with live audio visualization, pause/resume, and playback.
- Explicit **Save & evaluate** action that downloads the recording locally before requesting a review.
- Local Whisper speech-to-text and optional local Ollama evaluation.
- Transcript-grounded improvement suggestions. If transcription is unavailable, the app reports an error rather than evaluating fabricated content.
- `POST /api/evaluate-interview` accepts a JSON transcript or multipart audio upload. Audio is limited to 25 MiB and transcripts to 12,000 characters.

## Requirements

- Node.js 20.9 or newer and npm.
- A modern browser with microphone access (`getUserMedia` and `MediaRecorder`); use `localhost` or HTTPS.
- Python 3.11 for the Windows Whisper setup script.
- Optional: Ollama for model-based answer evaluation. Without Ollama, the app uses its built-in deterministic evaluator.

## Install and run

From the repository root:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and grant microphone permission when prompted. Use **Stop recording** to finish an answer; **Save & evaluate** becomes available when there is a completed recording.

For a production build:

```bash
npm run build
npm run start
```

## Run the open-source AI models locally

Whisper and Ollama are optional, independent components:

1. **Whisper** converts the recorded audio into a transcript. It runs locally on the app server.
2. **Ollama** evaluates the transcript with a local language model. If Ollama is not running or its response is invalid, Mockterview falls back to its deterministic local evaluator.

### Local audio transcription with Whisper

On Windows, install Python 3.11, then run this from PowerShell in the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-whisper.ps1
```

The script creates an isolated `.venv-whisper` environment, installs OpenAI Whisper and a bundled FFmpeg binary, and downloads the English `base.en` model (about 140 MiB) to `models/whisper`. It writes the local settings to `.env.local`. The virtual environment and model files are ignored by Git. Restart the Next.js server after setup so it loads the new settings.

The setup script is Windows-specific. On macOS or Linux, install FFmpeg using your package manager (for example, `brew install ffmpeg` on macOS), then create a Python environment and install Whisper:

```bash
python3.11 -m venv .venv-whisper
source .venv-whisper/bin/activate
python -m pip install --upgrade pip
python -m pip install openai-whisper
mkdir -p models/whisper
python -c "import whisper; whisper.load_model('base.en', device='cpu', download_root='models/whisper')"
```

Set the Unix executable and local model directory in `.env.local`:

```dotenv
WHISPER_BIN=.venv-whisper/bin/whisper
WHISPER_MODEL=base.en
WHISPER_MODEL_DIR=models/whisper
```

The following variables identify the local Whisper executable and model cache:

| Variable | Default / example | Purpose |
| --- | --- | --- |
| `WHISPER_BIN` | `.venv-whisper/Scripts/whisper.exe` on Windows | Whisper command-line executable |
| `WHISPER_MODEL` | `base.en` | Whisper model name |
| `WHISPER_MODEL_DIR` | `models/whisper` | Local directory for model weights |

Whisper runs on CPU and transcription may take a few minutes. Temporary audio files are deleted after transcription. If Whisper is not configured or cannot transcribe the recording, the API returns `422 TRANSCRIPTION_UNAVAILABLE`.

### Local answer evaluation with Ollama

Install Ollama from [ollama.com/download](https://ollama.com/download), then download the default model:

```bash
ollama pull llama3.2:latest
```

Make sure Ollama is running locally (normally it starts as a background service after installation). If needed, start it in a separate terminal:

```bash
ollama serve
```

Mockterview uses `http://localhost:11434` and `llama3.2:latest` by default. To use a different local Ollama instance or model, add these entries to `.env.local` and restart Next.js:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:latest
```

The transcript is sent to the configured Ollama server for evaluation. Keep the server local if you want the transcript to remain on your machine. Audio itself is transcribed locally by Whisper and is not sent to Ollama. If Ollama is unavailable, heuristic evaluation still works from the transcript.

### Environment file

Copy `.env.example` to `.env.local` to see the Whisper settings, then edit the values for your machine. Ollama settings are optional and can be added as shown above. `.env.local` is ignored by Git; do not commit secrets or machine-specific paths.

## Tests and quality checks

Run these commands from the repository root:

```bash
npm test                 # Run the test suite once
npm run test:watch        # Watch tests while developing
npm run test:coverage     # Run tests and generate coverage reports
npm run lint              # Run ESLint
npm run build             # Type-check and create the production build
```

The tests cover recorder state transitions and errors, evaluation-schema validation, evaluator fallback behavior, API request/response handling, dashboard interactions, and improvement analysis. Coverage output is written to `coverage/`. GitHub Actions also runs lint and coverage tests on pushes to `main` and pull requests targeting `main`.

## Privacy and limits

The browser only captures audio after recording starts. The **Save & evaluate** action downloads a local copy and submits the recording to the app's API. With Whisper configured, the API temporarily writes audio for local transcription and removes it afterwards. The resulting transcript is evaluated by the local Ollama server when available; otherwise, local heuristics are used. Audio requests are limited to 25 MiB; transcripts are limited to 12,000 characters.

If no transcription is available, evaluation stops with a clear error; Mockterview does not invent a transcript or review missing audio.
