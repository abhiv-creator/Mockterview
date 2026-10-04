$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvPath = Join-Path $projectRoot ".venv-whisper"
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$whisperCommand = Join-Path $venvPath "Scripts\whisper.exe"
$ffmpegCommand = Join-Path $venvPath "Scripts\ffmpeg.exe"
$modelDirectory = Join-Path $projectRoot "models\whisper"

$pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($pythonLauncher) {
    & $pythonLauncher.Source -3.11 -m venv $venvPath
} else {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        throw "Python 3.11 is required. Install it from https://www.python.org/downloads/windows/ and rerun this script."
    }
    & $python.Source -m venv $venvPath
    $pythonVersion = & $venvPython --version
    if ($LASTEXITCODE -ne 0 -or $pythonVersion -notmatch "^Python 3\.11\.") {
        throw "Python 3.11 is required. Install it from https://www.python.org/downloads/windows/ and rerun this script."
    }
}
if ($LASTEXITCODE -ne 0) {
    throw "Could not create the Whisper virtual environment. Install Python 3.11 and rerun this script."
}

& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    throw "Could not upgrade pip in .venv-whisper."
}
& $venvPython -m pip install openai-whisper imageio-ffmpeg
if ($LASTEXITCODE -ne 0) {
    throw "Could not install Whisper and its local FFmpeg binary."
}

$ffmpegSource = & $venvPython -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $ffmpegSource)) {
    throw "Could not locate the FFmpeg binary installed with imageio-ffmpeg."
}
Copy-Item -Path $ffmpegSource -Destination $ffmpegCommand -Force

& $venvPython (Join-Path $PSScriptRoot "download-whisper-model.py")
if ($LASTEXITCODE -ne 0) {
    throw "Could not download the Whisper base.en model."
}

$envFile = Join-Path $projectRoot ".env.local"
$envLines = [System.Collections.Generic.List[string]]::new()
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        $envLines.Add($line)
    }
}

$settings = [ordered]@{
    WHISPER_BIN = "`"$whisperCommand`""
    WHISPER_MODEL = "base.en"
    WHISPER_MODEL_DIR = "`"$modelDirectory`""
}
foreach ($name in $settings.Keys) {
    $settingIndex = -1
    for ($index = 0; $index -lt $envLines.Count; $index++) {
        if ($envLines[$index].StartsWith("$name=")) {
            $settingIndex = $index
            break
        }
    }
    $setting = "$name=$($settings[$name])"
    if ($settingIndex -ge 0) {
        $envLines[$settingIndex] = $setting
    } else {
        $envLines.Add($setting)
    }
}
Set-Content -Path $envFile -Value $envLines -Encoding utf8

Write-Host "Local Whisper is ready. Restart the Next.js server to load .env.local."
