"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  AudioLines,
  Bookmark,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  FileAudio2,
  Lightbulb,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  Volume2,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AudioVisualizer } from "@/components/audio-visualizer";
import { useAudioRecorder, type RecorderError } from "@/hooks/use-audio-recorder";
import {
  validateInterviewEvaluation,
  type InterviewEvaluation,
} from "@/lib/interview-evaluation-schema";

const defaultFeedback = {
  delivery: {
    label: "Delivery",
    score: 78,
    change: "+8%",
    summary: "Your pace was clear and easy to follow.",
    tip: "Try adding a little more vocal variety when you introduce the outcome.",
  },
  content: {
    label: "Content",
    score: 84,
    change: "+12%",
    summary: "You connected your actions to a measurable result.",
    tip: "Make the impact even stronger by including one specific metric.",
  },
  structure: {
    label: "Structure",
    score: 71,
    change: "+4%",
    summary: "Your answer had a clear beginning and a strong result.",
    tip: "Signpost the situation and your task before moving into the details.",
  },
} as const;

const errorCopy: Record<RecorderError, string> = {
  unsupported:
    "This browser can’t record audio. Try the latest version of Chrome, Edge, Firefox, or Safari.",
  "permission-denied":
    "Microphone access was blocked. Allow it in your browser’s site settings, then try again.",
  "device-unavailable":
    "We couldn’t find a microphone. Connect one and check your system audio settings.",
  "capture-failed":
    "Recording couldn’t start. Check that your microphone isn’t being used by another app and try again.",
};

function formatTime(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function CoachDashboard() {
  const recorder = useAudioRecorder();
  const [activeCategory, setActiveCategory] =
    useState<keyof typeof defaultFeedback>("delivery");
  const [saved, setSaved] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [analysis, setAnalysis] = useState<InterviewEvaluation | null>(null);
  const [improvementPoints, setImprovementPoints] = useState<string[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const activeFeedback = useMemo(() => {
    if (!analysis) {
      return defaultFeedback[activeCategory];
    }

    const mapped = {
      delivery: {
        label: "Delivery",
        score: Math.max(1, Math.min(10, analysis.clarity_score)) * 10,
        change: "+8%",
        summary: analysis.constructive_feedback,
        tip: analysis.filler_words_detected.length > 0
          ? `Trim filler words like ${analysis.filler_words_detected.slice(0, 2).join(", ")} to sound more confident.`
          : "Keep your answer concise and tie your reasoning back to the real outcome.",
      },
      content: {
        label: "Content",
        score: Math.max(1, Math.min(10, analysis.clarity_score)) * 10,
        change: "+12%",
        summary: analysis.key_technical_points_covered.length > 0
          ? `Topics covered: ${analysis.key_technical_points_covered.join(" • ")}`
          : "No specific technical points were detected in this answer.",
        tip: "Press on the trade-offs, constraints, and measurable impact of your choice.",
      },
      structure: {
        label: "Structure",
        score: Math.max(1, Math.min(10, analysis.clarity_score)) * 10,
        change: "+4%",
        summary: analysis.constructive_feedback,
        tip: "Open with context, explain the decision, and finish with the result.",
      },
    } as const;

    return mapped[activeCategory];
  }, [activeCategory, analysis]);
  const isRecording = recorder.status === "recording";
  const isPaused = recorder.status === "paused";
  const isProcessing = recorder.status === "processing";

  const saveAndEvaluate = async () => {
    const recording = recorder.recording;
    if (!recording || analyzing) return;

    setAnalysis(null);
    setImprovementPoints([]);
    setAnalysisError(null);
    setAnalyzing(true);

    try {
      const downloadLink = document.createElement("a");
      downloadLink.href = recording.url;
      const extension = recording.blob.type.includes("mp4")
        ? "m4a"
        : recording.blob.type.includes("ogg")
          ? "ogg"
          : "webm";
      downloadLink.download = `mockterview-answer-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
      downloadLink.click();
      setRecordingSaved(true);

      const form = new FormData();
      form.append("audio", recording.blob, "practice-take.webm");
      const response = await fetch("/api/evaluate-interview", {
        method: "POST",
        body: form,
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const apiMessage =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "object" &&
          body.error !== null &&
          "message" in body.error &&
          typeof body.error.message === "string"
            ? body.error.message
            : "Evaluation is temporarily unavailable.";
        const apiCode =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "object" &&
          body.error !== null &&
          "code" in body.error &&
          typeof body.error.code === "string"
            ? body.error.code
            : "";
        if (apiCode === "TRANSCRIPTION_UNAVAILABLE") {
          throw new Error(
            "Your recording was saved to Downloads, but speech-to-text is not configured. Add a local Whisper model to evaluate audio.",
          );
        }
        throw new Error(`Your recording was saved to Downloads. ${apiMessage}`);
      }

      if (
        typeof body !== "object" ||
        body === null ||
        !("evaluation" in body) ||
        !("improvement_points" in body) ||
        !Array.isArray(body.improvement_points) ||
        !body.improvement_points.every((point) => typeof point === "string")
      ) {
        throw new Error("Your recording was saved, but the evaluator returned an invalid response.");
      }

      const result = validateInterviewEvaluation(body.evaluation);
      if (!result) {
        throw new Error("Your recording was saved, but the evaluator returned an invalid response.");
      }
      setAnalysis(result);
      setImprovementPoints(body.improvement_points);
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Evaluation failed. Your recording was saved to Downloads.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const recordLabel = isRecording
    ? "Recording"
    : isPaused
      ? "Paused"
      : isProcessing || analyzing
        ? "Preparing your feedback"
        : recorder.recording
          ? "Recording ready"
          : "Ready when you are";
  const helperLabel = isRecording
    ? "Speak naturally — you can pause any time"
    : isPaused
      ? "Take a breath. Resume when you’re ready."
      : isProcessing || analyzing
        ? "AI coaching is reviewing your take..."
        : recorder.recording
          ? "Your practice take is ready to review"
          : "Your microphone stays off until you begin";

  return (
    <main className="app-shell min-h-screen">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Mockterview home">
          <span className="brand__mark"><AudioLines size={20} strokeWidth={2.4} /></span>
          <span>mockterview<span className="brand__period">.</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-switcher__avatar">A</span>
          <span className="workspace-switcher__text">
            <strong>Alex&apos;s workspace</strong>
            <span>Free plan</span>
          </span>
          <ChevronDown size={15} />
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-label">WORKSPACE</p>
          <a className="nav-item nav-item--active" href="#practice" aria-current="page">
            <Command size={17} /> Practice room
          </a>
          <a className="nav-item" href="#sessions">
            <Clock3 size={17} /> My sessions <span className="nav-count">3</span>
          </a>
          <a className="nav-item" href="#saved">
            <Bookmark size={17} /> Saved answers
          </a>
          <p className="nav-label nav-label--spaced">YOUR PROGRESS</p>
          <a className="nav-item" href="#insights">
            <AudioLines size={17} /> Speaking insights
          </a>
          <a className="nav-item" href="#goals">
            <Sparkles size={17} /> Weekly goals
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <span className="upgrade-card__icon"><WandSparkles size={17} /></span>
            <strong>Your next breakthrough</strong>
            <p>Keep your momentum going. You&apos;re one session from your weekly goal.</p>
            <div className="goal-track"><span /></div>
            <span className="goal-caption">3 of 4 sessions this week</span>
          </div>
          <button className="profile-button" type="button">
            <span className="profile-avatar">A</span>
            <span><strong>Alex Morgan</strong><small>Personal account</small></span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      <section className="main-content" id="practice">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>Practice room</strong></div>
          <div className="topbar__right">
            <span className="streak"><span className="streak__dot" /> 4 day streak</span>
            <button className="icon-button" type="button" aria-label="Help">
              <CircleHelp size={18} />
            </button>
            <span className="topbar-avatar">A</span>
          </div>
        </header>

        <div className="dashboard">
          <section className="brand-lockup" aria-label="Mockterview">
            <div>
              <p className="brand-lockup__wordmark">Mockterview</p>
              <span className="brand-lockup__strap">PREPARE. PRACTICE. PERFORM.</span>
            </div>
          </section>

          <div className="page-intro">
            <div>
              <p className="eyebrow"><span className="eyebrow__dot" /> YOUR PRACTICE SPACE</p>
              <h1>Show up as your best self.</h1>
              <p className="page-subtitle">A little practice today makes all the difference tomorrow.</p>
            </div>
            <button className="text-button" type="button" onClick={() => setPromptOpen((value) => !value)}>
              <RotateCcw size={15} /> Change prompt
            </button>
          </div>

          <div className="practice-grid">
            <div className="practice-main">
              <article className="recording-card" aria-label="Practice recording">
                <div className="recording-card__top">
                  <div className="prompt-tag"><span className="prompt-tag__dot" /> BEHAVIORAL · STAR METHOD</div>
                  <button className="subtle-icon-button" type="button" aria-label="More recording options">
                    <MoreHorizontal size={20} />
                  </button>
                </div>
                <h2>Tell me about a time you solved a challenging problem.</h2>
                <p className="recording-card__prompt">
                  What was the situation, what did you do, and what was the result?
                </p>
                {promptOpen && (
                  <div className="prompt-guidance" role="status">
                    <Lightbulb size={16} />
                    <span>Think about one specific moment. Set the scene, explain your actions, and finish with the impact.</span>
                  </div>
                )}

                <div className={`audio-stage${isRecording ? " audio-stage--recording" : ""}`}>
                  <div className="audio-stage__status">
                    <span className={`record-status-dot${isRecording ? " record-status-dot--live" : ""}`} />
                    <span aria-live="polite">{recordLabel}</span>
                    <span className="audio-stage__helper">{helperLabel}</span>
                  </div>
                  <AudioVisualizer analyser={recorder.analyser} active={isRecording} />
                  <div className="audio-stage__footer">
                    <span className="audio-time" aria-label={`Elapsed time ${formatTime(recorder.elapsedMs)}`}>
                      {formatTime(recorder.elapsedMs)}
                    </span>
                    <span className="audio-duration">/ 02:00</span>
                    <span className="audio-stage__hint"><Volume2 size={13} /> Keep your answer under 2 min</span>
                  </div>
                </div>

                {recorder.error && (
                  <div className="error-banner" role="alert">
                    <CircleHelp size={17} />
                    <span>{errorCopy[recorder.error]}</span>
                  </div>
                )}

                {analysisError && (
                  <div className="error-banner" role="alert">
                    <CircleHelp size={17} />
                    <span>{analysisError}</span>
                  </div>
                )}

                <div className="recording-actions">
                  {isRecording ? (
                    <>
                      <button className="control-button control-button--secondary" type="button" onClick={recorder.pause}>
                        <Pause size={16} fill="currentColor" /> Pause
                      </button>
                      <button className="control-button control-button--stop" type="button" onClick={recorder.stop}>
                        <Square size={13} fill="currentColor" /> Finish answer
                      </button>
                    </>
                  ) : isPaused ? (
                    <>
                      <button className="control-button control-button--secondary" type="button" onClick={recorder.resume}>
                        <Play size={15} fill="currentColor" /> Resume
                      </button>
                      <button className="control-button control-button--stop" type="button" onClick={recorder.stop}>
                        <Square size={13} fill="currentColor" /> Finish answer
                      </button>
                    </>
                  ) : (
                    <button
                      className="control-button control-button--start"
                      type="button"
                      onClick={() => {
                        setAnalysis(null);
                        setImprovementPoints([]);
                        setAnalysisError(null);
                        setRecordingSaved(false);
                        void recorder.start();
                      }}
                      disabled={isProcessing || analyzing}
                    >
                      {isProcessing ? <span className="spinner" /> : <Mic size={17} />}
                      {isProcessing ? "Preparing..." : recorder.recording ? "Record another take" : "Start recording"}
                    </button>
                  )}
                  <button
                    className="control-button control-button--evaluate"
                    type="button"
                    onClick={() => void saveAndEvaluate()}
                    disabled={!recorder.recording || isRecording || isPaused || isProcessing || analyzing}
                  >
                    {analyzing ? <span className="spinner" /> : <Save size={16} />}
                    {analyzing ? "Saving & evaluating..." : "Save & evaluate"}
                  </button>
                  {!isRecording && !isPaused && !isProcessing && (
                    <span className="privacy-note"><span className="privacy-lock">●</span> Private to you</span>
                  )}
                </div>
                {recorder.recording && !isRecording && !isPaused && (
                  <div className="playback">
                    <FileAudio2 size={17} />
                    <span className="playback__label">Your recording</span>
                    <span className="playback__duration">{formatTime(recorder.recording.durationMs)}</span>
                    <audio src={recorder.recording.url} controls aria-label="Play your recording" />
                  </div>
                )}
                {recordingSaved && (
                  <p className="saved-status" role="status">
                    <Check size={14} /> Recording saved to your Downloads.
                  </p>
                )}
                <div className="recording-card__bottom">
                  <span><Clock3 size={14} /> A good answer takes 1–2 minutes</span>
                  <button type="button" onClick={() => setSaved((value) => !value)} aria-pressed={saved}>
                    {saved ? <Check size={14} /> : <Bookmark size={14} />}
                    {saved ? "Saved" : "Save prompt"}
                  </button>
                </div>
              </article>

              <div className="tip-banner">
                <span className="tip-banner__icon"><Lightbulb size={17} /></span>
                <p><strong>A tiny tip</strong> — Start with the situation, then spend most of your answer on what <em>you</em> did.</p>
                <ArrowUpRight size={16} className="tip-banner__arrow" />
              </div>

              <section className="recent-section" id="sessions">
                <div className="section-heading">
                  <div><h2>Pick up where you left off</h2><p>Your recent practice sessions</p></div>
                  <button className="text-button" type="button">View all <ArrowUpRight size={14} /></button>
                </div>
                <article className="recent-session">
                  <span className="recent-session__icon"><Mic size={17} /></span>
                  <span className="recent-session__copy"><strong>Walk me through your background</strong><small>Yesterday · Behavioral</small></span>
                  <span className="recent-session__score"><ArrowUpRight size={14} /> 82%</span>
                  <button className="recent-session__play" type="button" aria-label="Play previous session"><Play size={15} fill="currentColor" /></button>
                </article>
              </section>
            </div>

            <aside className="insights-column">
              <article className="insight-card">
                <div className="insight-card__heading">
                  <div><p className="eyebrow">YOUR LAST SESSION</p><h2>Looking good, Alex.</h2></div>
                  <span className="insight-spark"><Sparkles size={17} /></span>
                </div>
                <div className="overall-score">
                  <div className="score-ring"><span><strong>78</strong><small>/100</small></span></div>
                  <div><span className="score-caption">Overall score</span><span className="score-change"><ArrowUpRight size={14} /> +6% this week</span></div>
                </div>
                <div className="score-divider" />
                <p className="feedback-label">FEEDBACK FOCUS</p>
                <div className="feedback-tabs" role="tablist" aria-label="Feedback category">
                  {Object.entries(defaultFeedback).map(([key, item]) => (
                    <button
                      key={key}
                      id={`tab-${key}`}
                      className={`feedback-tab${activeCategory === key ? " feedback-tab--active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={activeCategory === key}
                      aria-controls="feedback-panel"
                      onClick={() => setActiveCategory(key as keyof typeof defaultFeedback)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="feedback-panel" id="feedback-panel" role="tabpanel" aria-labelledby={`tab-${activeCategory}`}>
                  <div className="feedback-panel__top">
                    <span className="feedback-panel__score">{activeFeedback.score}<small>/100</small></span>
                    <span className="feedback-panel__change"><ArrowUpRight size={13} /> {activeFeedback.change}</span>
                  </div>
                  <p className="feedback-panel__summary">{activeFeedback.summary}</p>
                  <div className="feedback-tip"><Lightbulb size={15} /><p>{activeFeedback.tip}</p></div>
                </div>
                <button className="insight-link" type="button">
                  Explore your insights <ArrowUpRight size={14} />
                </button>
              </article>

              <article className="improvement-card" aria-labelledby="improvement-title">
                <div className="improvement-card__heading">
                  <span className="improvement-card__icon"><Lightbulb size={17} /></span>
                  <div>
                    <h2 id="improvement-title">Improvement</h2>
                    <p>Specific gaps found in this answer</p>
                  </div>
                </div>
                {analyzing ? (
                  <p className="improvement-card__empty" role="status">Reviewing your answer against the interview rubric…</p>
                ) : improvementPoints.length > 0 ? (
                  <ul className="improvement-list">
                    {improvementPoints.map((point) => (
                      <li key={point}><span aria-hidden="true">•</span>{point}</li>
                    ))}
                  </ul>
                ) : analysisError ? (
                  <p className="improvement-card__empty">Improvements will appear after an answer can be transcribed and evaluated.</p>
                ) : (
                  <p className="improvement-card__empty">Record your answer, then choose “Save &amp; evaluate” to see what was missing.</p>
                )}
              </article>

              <article className="weekly-card" id="goals">
                <div className="weekly-card__top">
                  <span className="weekly-card__icon"><AudioLines size={17} /></span>
                  <span className="weekly-card__more"><MoreHorizontal size={18} /></span>
                </div>
                <p className="eyebrow">WEEKLY PRACTICE</p>
                <h2>You&apos;re building a habit.</h2>
                <p className="weekly-card__copy">A few minutes of practice adds up. Keep your streak alive.</p>
                <div className="week-days" aria-label="Practice activity this week">
                  {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                    <span className={`week-day${index < 4 ? " week-day--done" : ""}`} key={`${day}-${index}`}>
                      <span className="week-day__circle">{index < 4 && <Check size={12} />}</span>
                      <small>{day}</small>
                    </span>
                  ))}
                </div>
              </article>

              <div className="encouragement">
                <span><ArrowDownRight size={15} /></span>
                <p>Every great answer starts with a first take. <strong>You&apos;ve got this.</strong></p>
              </div>
            </aside>
          </div>
          <footer className="page-footer">
            <span>Made for the moments that matter.</span>
            <a href="#privacy">Your practice is private <span>·</span> <CircleHelp size={12} /> Help center</a>
          </footer>
        </div>
      </section>
    </main>
  );
}
