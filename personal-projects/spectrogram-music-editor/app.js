(function () {
  "use strict";

  window.__spectrogramBootError = "";

  function reportBootError(error) {
    const details = error && error.stack
      ? error.stack
      : error && error.message
        ? error.message
        : String(error);

    window.__spectrogramBootError = details;

    const statusEl = document.getElementById("status-text");
    if (statusEl) {
      statusEl.textContent = `Editor error: ${details}`;
    }

    if (window.console && console.error) {
      console.error(error);
    }
  }

  try {
    const GRID_COLS = 2880;
    const VIEW_COLS = 288;
    const COLS_PER_SECOND = 48;
    const GRID_ROWS = 96;
    const TAU = Math.PI * 2;
    const RENDER_SAMPLE_RATE = 24000;
    const EPSILON = 0.0008;
    const GRIFFIN_LIM_ITERATIONS = 16;
    const HYBRID_GRIFFIN_LIM_ITERATIONS = 8;
    const STFT_SIZE = 512;
    const STFT_HOP = 128;
    const MIN_VIEW_COLS = 24;
    const MAX_UNDO_STEPS = 16;
    const RENDER_YIELD_INTERVAL_MS = 28;
    const RENDER_MIX_CHUNK_SIZE = 131072;
    const PARTIAL_RENDER_CROSSFADE_SAMPLES = 192;
    const SOUNDPAINT_PROJECT_VERSION = 2;
    const SOUNDPAINT_SESSION_STORAGE_KEY = "soundpaint-autosave-v1";
    const DEFAULT_GUITAR_PLUCK_POSITION = 0.19;
    const DEFAULT_GUITAR_BODY_RESONANCE = 0.92;
    const DEFAULT_PIANO_HAMMER_HARDNESS = 0.84;
    const DEFAULT_PIANO_STRING_COUPLING = 0.9;
    const SMPLR_RENDER_WINDOW_SECONDS = 12;
    const SMPLR_RENDER_PREROLL_SECONDS = 1.4;
    const SMPLR_RENDER_TAIL_SECONDS = 1.4;
    const LIVE_SAMPLE_PLAY_WINDOW_SECONDS = 8;
    const LIVE_SAMPLE_RENDER_AHEAD_SECONDS = 18;
    const LIVE_SAMPLE_NOTE_LOOKAHEAD_SECONDS = 0.75;
    const SMPLR_MODULE_URL = "https://unpkg.com/smplr/dist/index.mjs";
    const SMPLR_NOTE_BACKENDS = {
      "piano-samples": {
        label: "Piano samples",
        kind: "splendid-piano"
      },
      "violin-samples": {
        label: "Violin samples",
        kind: "soundfont",
        instrument: "violin",
        kit: "MusyngKite",
        loadLoopData: true
      },
      "cello-samples": {
        label: "Cello samples",
        kind: "soundfont",
        instrument: "cello",
        kit: "MusyngKite",
        loadLoopData: true
      },
      "steel-guitar-samples": {
        label: "Steel guitar samples",
        kind: "soundfont",
        instrument: "acoustic_guitar_steel",
        kit: "MusyngKite",
        loadLoopData: false
      },
      "nylon-guitar-samples": {
        label: "Nylon guitar samples",
        kind: "soundfont",
        instrument: "acoustic_guitar_nylon",
        kit: "MusyngKite",
        loadLoopData: false
      }
    };

    const canvas = document.getElementById("spectrogram-canvas");
    if (!canvas) {
      throw new Error("Missing #spectrogram-canvas element.");
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context is unavailable.");
    }

    const statusText = document.getElementById("status-text");
    const cursorReadout = document.getElementById("cursor-readout");
    const sampleDebugText = document.getElementById("sample-debug-text");
    const playButton = document.getElementById("play-btn");
    const stopButton = document.getElementById("stop-btn");
    const loopButton = document.getElementById("loop-btn");
    const renderButton = document.getElementById("render-btn");
    const exportButton = document.getElementById("export-btn");
    const projectSaveButton = document.getElementById("project-save-btn");
    const projectLoadButton = document.getElementById("project-load-btn");
    const projectLoadInput = document.getElementById("project-load-input");
    const tabStrip = document.getElementById("tab-strip");
    const newTabButton = document.getElementById("new-tab-btn");
    const layerList = document.getElementById("layer-list");
    const newLayerButton = document.getElementById("new-layer-btn");
    const pasteLayerButton = document.getElementById("paste-layer-btn");
    const undoButton = document.getElementById("undo-btn");
    const clearButton = document.getElementById("clear-btn");
    const presetButton = document.getElementById("preset-btn");
    const presetSelect = document.getElementById("preset-select");
    const scorePresetButton = document.getElementById("score-preset-btn");
    const scorePresetSelect = document.getElementById("score-preset-select");
    const scoreImportButton = document.getElementById("score-import-btn");
    const scoreImportInput = document.getElementById("score-import-input");
    const basslineButton = document.getElementById("bassline-btn");
    const clearBasslineButton = document.getElementById("clear-bassline-btn");
    const basslineSelect = document.getElementById("bassline-select");
    const basslineBpmInput = document.getElementById("bassline-bpm-input");
    const renderModeSelect = document.getElementById("render-mode-select");
    const noteBackendSelect = document.getElementById("note-backend-select");
    const renderModeLabel = document.getElementById("render-mode-label");
    const renderModeDescriptionEl = document.getElementById("render-mode-description");
    const phaseDiagnosticsToggle = document.getElementById("phase-diagnostics-toggle");
    const sampleDebugToggle = document.getElementById("sample-debug-toggle");
    const timelineTrack = document.getElementById("timeline-track");
    const timelineThumb = document.getElementById("timeline-thumb");
    const timelineOverview = document.getElementById("timeline-overview");
    const timelineThumbHandleLeft = document.getElementById("timeline-thumb-handle-left");
    const timelineThumbHandleRight = document.getElementById("timeline-thumb-handle-right");
    const timelineInput = document.getElementById("timeline-input");
    const renderOverlay = document.getElementById("render-overlay");
    const renderOverlayTitle = document.getElementById("render-overlay-title");
    const renderOverlayDetail = document.getElementById("render-overlay-detail");
    const renderProgressBar = document.getElementById("render-progress-bar");
    const renderProgressText = document.getElementById("render-progress-text");
    const surfaceToolbar = document.querySelector(".surface-toolbar");
    const menuDropdowns = Array.from(document.querySelectorAll(".menu-dropdown"));
    const PLAY_ICON_SVG = `<svg viewBox="0 0 24 24"><path d="M8 6.5v11l9-5.5z" fill="currentColor" stroke="none"/></svg>`;
    const PAUSE_ICON_SVG = `<svg viewBox="0 0 24 24"><path d="M8 6h3v12H8zM13 6h3v12h-3z" fill="currentColor" stroke="none"/></svg>`;
    const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));

    const durationInput = document.getElementById("duration-input");
    const minFreqInput = document.getElementById("minfreq-input");
    const maxFreqInput = document.getElementById("maxfreq-input");
    const gainInput = document.getElementById("gain-input");
    const sizeInput = document.getElementById("size-input");
    const strengthInput = document.getElementById("strength-input");
    const densityInput = document.getElementById("density-input");
    const toolSettingsWrap = document.getElementById("tool-settings-wrap");
    const toolSettingsButton = document.getElementById("tool-settings-btn");
    const toolSettingsLabel = document.getElementById("tool-settings-label");
    const toolSettingsPopover = document.getElementById("tool-settings-popover");
    const toolSizeControl = document.getElementById("tool-size-control");
    const toolStrengthControl = document.getElementById("tool-strength-control");
    const toolDensityControl = document.getElementById("tool-density-control");
    const guitarPluckInput = document.getElementById("guitar-pluck-input");
    const guitarBodyInput = document.getElementById("guitar-body-input");
    const pianoHammerInput = document.getElementById("piano-hammer-input");
    const pianoCouplingInput = document.getElementById("piano-coupling-input");
    const editorViewSelect = document.getElementById("editor-view-select");
    const frequencyAxisSelect = document.getElementById("frequency-axis-select");
    const drawingToolsToggle = document.getElementById("drawing-tools-toggle");
    const gridToggle = document.getElementById("grid-toggle");
    const DEFAULT_FREE_MIN_FREQ = Number(minFreqInput.value);
    const DEFAULT_FREE_MAX_FREQ = Number(maxFreqInput.value);

    const durationOut = document.getElementById("duration-out");
    const minFreqOut = document.getElementById("minfreq-out");
    const maxFreqOut = document.getElementById("maxfreq-out");
    const gainOut = document.getElementById("gain-out");
    const sizeOut = document.getElementById("size-out");
    const strengthOut = document.getElementById("strength-out");
    const densityOut = document.getElementById("density-out");
    const guitarPluckOut = document.getElementById("guitar-pluck-out");
    const guitarBodyOut = document.getElementById("guitar-body-out");
    const pianoHammerOut = document.getElementById("piano-hammer-out");
    const pianoCouplingOut = document.getElementById("piano-coupling-out");
    const basslineBpmOut = document.getElementById("bassline-bpm-out");
    const timelineOut = document.getElementById("timeline-out");

    const offscreen = document.createElement("canvas");
    offscreen.width = VIEW_COLS;
    offscreen.height = GRID_ROWS;
    const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!offCtx) {
      throw new Error("Offscreen 2D canvas context is unavailable.");
    }

    const pixelImage = offCtx.createImageData(VIEW_COLS, GRID_ROWS);
    const timelineOverviewCtx = timelineOverview ? timelineOverview.getContext("2d", { willReadFrequently: true }) : null;
    let drawData = new Float32Array(GRID_COLS * GRID_ROWS);
    let basslineData = new Float32Array(GRID_COLS * GRID_ROWS);
    let bassEvents = [];
    let scoreEventsRef = [];
    let nextTabId = 1;
    let nextLayerId = 1;
    const margins = { left: 74, right: 28, top: 26, bottom: 54 };
    const SCORE_VIEW_PROFILES = {
      "guitar-score": {
        label: "guitar score sheet",
        axisLabel: "Pitch / Guitar Note",
        minMidi: 40,
        maxMidi: 88,
        padSemitones: 2,
        anchorMidis: [40, 45, 50, 55, 59, 64],
        labelMode: "anchors"
      },
      "piano-score": {
        label: "grand piano score sheet",
        axisLabel: "Pitch / Piano Note",
        minMidi: 21,
        maxMidi: 108,
        padSemitones: 2,
        anchorMidis: [21, 36, 48, 60, 72, 84, 96, 108],
        labelMode: "c-octaves"
      }
    };

    const state = {
      tool: "pointer",
      pointerInside: false,
      drawing: false,
      lastPointer: null,
      currentPointer: null,
      lineStart: null,
      linePreview: null,
      pointerId: null,
      noteDurationUnlocked: false,
      noteUnlockCol: null,
      scoreEditMode: null,
      scoreEditIndex: -1,
      scoreEditOriginalNote: null,
      scoreEditStartPoint: null,
      scoreEditStartMidi: null,
      dirty: true,
      renderedBuffer: null,
      renderedWav: null,
      lastRenderedDataVersion: -1,
      renderCache: null,
      dirtyRender: {
        full: true,
        startSample: 0,
        endSample: 0,
        layers: { draw: true, bass: true, score: true }
      },
      renderPromise: null,
      previewBasePromise: null,
      renderOverlayHideTimer: 0,
      sessionSaveTimer: 0,
      renderToken: 0,
      isPlaying: false,
      isPaused: false,
      playheadRatio: 0,
      pausedOffsetSeconds: 0,
      isScrubbingPlayhead: false,
      isDraggingTimelineThumb: false,
      timelineDragOffsetPx: 0,
      timelineDragMode: "",
      viewOffsetCol: 0,
      viewColSpan: VIEW_COLS,
      rafId: 0,
      animationHoldId: 0,
      holdStartMs: 0,
      lastHoldMs: 0,
      audioContext: null,
      gainNode: null,
      sourceNode: null,
      playStartedAt: 0,
      playDurationSeconds: durationSeconds(),
      previewBaseBuffer: null,
      previewBaseCache: null,
      liveSampleInstrument: null,
      liveSampleScheduler: null,
      liveSampleGainNode: null,
      liveSampleStopFns: [],
      liveSampleScoreEvents: [],
      liveSampleScheduledUntilSec: 0,
      liveSampleRenderedWindows: new Set(),
      liveSampleRenderingWindows: new Set(),
      liveSampleSessionId: 0,
      liveSampleUsesProgressive: false,
      currentBasslinePreset: "none",
      editorView: "spectrogram",
      frequencyAxis: frequencyAxisSelect ? frequencyAxisSelect.value || "log" : "log",
      renderMode: "geometry",
      noteBackend: noteBackendSelect ? noteBackendSelect.value || "procedural" : "procedural",
      noteBackendResolved: noteBackendSelect ? noteBackendSelect.value || "procedural" : "procedural",
      noteBackendWarning: "",
      showPhaseDiagnostics: false,
      showSampleDebug: false,
      loopPlayback: false,
      showDrawingTools: true,
      dataVersion: 0,
      diagnosticsCache: null,
      latestRenderInfo: null,
      lastPlaybackLoopIndex: 0,
      sampleDebugScheduledCount: 0,
      sampleDebugStartedCount: 0,
      transportPending: "",
      transportRequestId: 0,
      undoStack: [],
      pendingUndoSnapshot: null,
      pendingUndoVersion: -1,
      toolSettingsOpen: false,
      frequencyZoomReference: null,
      clipboardLayer: null,
      tabs: [],
      currentTabId: null,
      activeLayerId: null,
      hoveredRenameTarget: null,
      timelineOverviewCacheKey: "",
      compositeLayerCache: null,
      scoreViewFreqs: {
        "guitar-score": defaultFrequencyRangeForView("guitar-score"),
        "piano-score": defaultFrequencyRangeForView("piano-score")
      },
      freeMinFreq: Number(minFreqInput.value),
      freeMaxFreq: Number(maxFreqInput.value)
    };
    Object.defineProperty(state, "bassEvents", {
      get() {
        return bassEvents;
      },
      set(value) {
        bassEvents = Array.isArray(value) ? value : [];
        const layer = currentLayerRecord();
        if (layer) {
          layer.bassEvents = bassEvents;
        }
      }
    });
    Object.defineProperty(state, "scoreEvents", {
      get() {
        return scoreEventsRef;
      },
      set(value) {
        scoreEventsRef = Array.isArray(value) ? value : [];
        const layer = currentLayerRecord();
        if (layer) {
          layer.scoreEvents = scoreEventsRef;
        }
      }
    });
    const smplrModuleState = {
      loadingPromise: null,
      module: null
    };
    const smplrLoaderState = {
      loader: null,
      module: null
    };

  function plotWidth() {
    return canvas.width - margins.left - margins.right;
  }

  function plotHeight() {
    return canvas.height - margins.top - margins.bottom;
  }

  function durationSeconds() {
    return Number(durationInput.value);
  }

  function minFrequency() {
    return effectiveMinFrequency();
  }

  function maxFrequency() {
    return effectiveMaxFrequency();
  }

  function brushRadiusCells() {
    return (Number(sizeInput.value) / plotWidth()) * visibleColCount();
  }

  function defaultScoreNoteLengthBeats() {
    return 2;
  }

  function scoreNoteDragActivationBeats() {
    return 0.75;
  }

  function scoreBeatSeconds() {
    return 60 / Math.max(1, basslineBpm());
  }

  function scoreQuantizationStepBeats() {
    return 0.0625;
  }

  function scoreAllowedNoteLengthsBeats() {
    const maxBeats = Math.max(8, durationSeconds() / Math.max(0.001, scoreBeatSeconds()));
    const lengths = [];
    for (let beats = 0.125; beats <= maxBeats + 1e-6; beats *= 2) {
      lengths.push(Number(beats.toFixed(6)));
    }
    return lengths;
  }

  function minimumScoreNoteDurationSec() {
    return Math.max(0.02, scoreQuantizationStepBeats() * scoreBeatSeconds());
  }

  function quantizeToStep(value, step) {
    return Math.round(value / step) * step;
  }

  function nearestAllowedScoreLengthBeats(rawBeats) {
    const allowed = scoreAllowedNoteLengthsBeats();
    let best = allowed[0];
    let bestDistance = Math.abs(rawBeats - best);
    for (let i = 1; i < allowed.length; i += 1) {
      const candidate = allowed[i];
      const distance = Math.abs(rawBeats - candidate);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  function nearestAllowedScoreLengthBeatsInRange(rawBeats, minBeats, maxBeats) {
    const allowed = scoreAllowedNoteLengthsBeats().filter(
      (beats) => beats >= minBeats - 1e-6 && beats <= maxBeats + 1e-6
    );
    if (!allowed.length) {
      return clamp(rawBeats, minBeats, maxBeats);
    }
    let best = allowed[0];
    let bestDistance = Math.abs(rawBeats - best);
    for (let i = 1; i < allowed.length; i += 1) {
      const candidate = allowed[i];
      const distance = Math.abs(rawBeats - candidate);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  function quantizedScoreDurationBeatsFromDrag(dragBeatsFromUnlock) {
    if (!state.noteDurationUnlocked) {
      return defaultScoreNoteLengthBeats();
    }
    return Math.max(scoreAllowedNoteLengthsBeats()[0], 1 + dragBeatsFromUnlock);
  }

  function quantizedScoreNotePlacement(startPoint, endPoint) {
    const startSnap = snapPointToScoreMidi(startPoint);
    const endSnap = snapPointToScoreMidi(endPoint);
    if (!startSnap || !endSnap) {
      return null;
    }

    const startCol = startSnap.col;
    const endCol = endSnap.col;
    const rawStartSec = timeFromCol(startCol);
    const beatSeconds = scoreBeatSeconds();
    const stepBeats = scoreQuantizationStepBeats();
    const activationBeats = scoreNoteDragActivationBeats();
    const rawEndSec = timeFromCol(endCol);
    const rawDragBeats = Math.abs((rawEndSec - rawStartSec) / beatSeconds);
    if (!state.noteDurationUnlocked && rawDragBeats > activationBeats) {
      state.noteDurationUnlocked = true;
      state.noteUnlockCol = endCol;
    }
    const startSec = clamp(rawStartSec, 0, Math.max(0, durationSeconds() - minimumScoreNoteDurationSec()));
    let endSec = clamp(
      startSec + defaultScoreNoteLengthBeats() * beatSeconds,
      startSec + minimumScoreNoteDurationSec(),
      durationSeconds()
    );
    if (state.noteDurationUnlocked) {
      endSec = clamp(rawEndSec, startSec + minimumScoreNoteDurationSec(), durationSeconds());
    }
    return {
      midi: endSnap.midi,
      startSec,
      endSec,
      startCol: colFromTime(startSec),
      endCol: colFromTime(endSec),
      durationBeats: (endSec - startSec) / beatSeconds
    };
  }

  function currentStrength() {
    return Number(strengthInput.value);
  }

  function currentDensity() {
    return Number(densityInput.value);
  }

  function toolSettingsTitle() {
    return "Drawing tool settings";
  }

  function setToolSettingsOpen(open) {
    const canOpen = Boolean(toolSettingsWrap && !toolSettingsWrap.hidden && toolSettingsPopover && toolSettingsButton);
    state.toolSettingsOpen = Boolean(open && canOpen);
    if (toolSettingsPopover) {
      toolSettingsPopover.hidden = !state.toolSettingsOpen;
    }
    if (toolSettingsButton) {
      toolSettingsButton.setAttribute("aria-expanded", state.toolSettingsOpen ? "true" : "false");
    }
  }

  function updateToolParameterVisibility() {
    const showSize = state.tool !== "note" && state.tool !== "pointer";
    const showStrength = ["brush", "spray", "gaussian", "erase"].includes(state.tool);
    const showDensity = state.tool === "spray";
    const showAny = showSize || showStrength || showDensity;

    if (toolSettingsWrap) {
      toolSettingsWrap.hidden = !showAny;
    }
    if (toolSettingsLabel) {
      toolSettingsLabel.textContent = toolSettingsTitle();
    }

    if (toolSizeControl) {
      toolSizeControl.hidden = !showSize;
    }
    if (toolStrengthControl) {
      toolStrengthControl.hidden = !showStrength;
    }
    if (toolDensityControl) {
      toolDensityControl.hidden = !showDensity;
    }
    if (!showAny) {
      setToolSettingsOpen(false);
    } else if (toolSettingsPopover) {
      toolSettingsPopover.hidden = !state.toolSettingsOpen;
    }
  }

  function guitarPluckPosition() {
    return guitarPluckInput ? Number(guitarPluckInput.value) / 100 : DEFAULT_GUITAR_PLUCK_POSITION;
  }

  function guitarBodyResonance() {
    return guitarBodyInput ? Number(guitarBodyInput.value) : DEFAULT_GUITAR_BODY_RESONANCE;
  }

  function pianoHammerHardness() {
    return pianoHammerInput ? Number(pianoHammerInput.value) : DEFAULT_PIANO_HAMMER_HARDNESS;
  }

  function pianoStringCoupling() {
    return pianoCouplingInput ? Number(pianoCouplingInput.value) : DEFAULT_PIANO_STRING_COUPLING;
  }

  function basslineBpm() {
    return Number(basslineBpmInput.value);
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function freqToMidi(freq) {
    return 69 + 12 * Math.log2(Math.max(freq, 0.0001) / 440);
  }

  function noteNameFromMidi(midi) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const rounded = Math.round(midi);
    const octave = Math.floor(rounded / 12) - 1;
    return `${names[((rounded % 12) + 12) % 12]}${octave}`;
  }

  function midiFromNoteName(noteName) {
    const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(noteName).trim());
    if (!match) {
      return null;
    }
    const [, baseRaw, accidental, octaveRaw] = match;
    const base = baseRaw.toUpperCase();
    const basePitch = {
      C: 0,
      D: 2,
      E: 4,
      F: 5,
      G: 7,
      A: 9,
      B: 11
    }[base];
    if (typeof basePitch !== "number") {
      return null;
    }
    const accidentalOffset = accidental === "#"
      ? 1
      : accidental === "b"
        ? -1
        : 0;
    const octave = Number(octaveRaw);
    return (octave + 1) * 12 + basePitch + accidentalOffset;
  }

  function currentScoreProfile() {
    return SCORE_VIEW_PROFILES[state.editorView] || null;
  }

  function scoreViewLabel(view = state.editorView) {
    return SCORE_VIEW_PROFILES[view]?.label || "score sheet";
  }

  function isScoreSheetMode() {
    return Boolean(currentScoreProfile());
  }

  function isScoreNoteToolAvailable() {
    return isScoreSheetMode();
  }

  function nearestScoreMidiForPoint(point) {
    const profile = currentScoreProfile();
    if (!profile || !point) {
      return null;
    }
    const snappedMidi = clamp(
      Math.round(freqToMidi(freqFromRow(point.row))),
      profile.minMidi,
      profile.maxMidi
    );
    return snappedMidi;
  }

  function snapPointToScoreMidi(point) {
    const midi = nearestScoreMidiForPoint(point);
    if (midi === null) {
      return null;
    }
    return {
      col: point.col,
      row: rowFromFreq(midiToFreq(midi)),
      midi
    };
  }

  function defaultFrequencyRangeForView(view) {
    const profile = SCORE_VIEW_PROFILES[view];
    if (!profile) {
      return {
        min: Number(minFreqInput.value),
        max: Number(maxFreqInput.value)
      };
    }
    return {
      min: midiToFreq(profile.minMidi - profile.padSemitones),
      max: midiToFreq(profile.maxMidi + profile.padSemitones)
    };
  }

  function frequencyBoundsForCurrentView() {
    const profile = currentScoreProfile();
    if (profile) {
      const range = defaultFrequencyRangeForView(state.editorView);
      return {
        min: range.min,
        max: range.max
      };
    }
    return {
      min: Number(minFreqInput.min) || 20,
      max: Number(maxFreqInput.max) || 8000
    };
  }

  function frequencyAxisMode() {
    return state.frequencyAxis === "linear" ? "linear" : "log";
  }

  function frequencyAxisName(mode = frequencyAxisMode()) {
    return mode === "linear" ? "Equal-spaced" : "Logarithmic";
  }

  function axisValueFromFrequency(freq, mode = frequencyAxisMode()) {
    if (mode === "linear") {
      return freq;
    }
    return Math.log(Math.max(freq, 1e-6));
  }

  function frequencyFromAxisValue(value, mode = frequencyAxisMode()) {
    if (mode === "linear") {
      return value;
    }
    return Math.exp(value);
  }

  function minimumFrequencySpan(bounds, mode = frequencyAxisMode()) {
    if (mode === "linear") {
      return Math.max(2, (bounds.max - bounds.min) / 800);
    }
    return Math.log(2) / 12;
  }

  function totalRenderSamples() {
    return Math.max(1, Math.floor(durationSeconds() * RENDER_SAMPLE_RATE));
  }

  function dirtyRangeToSamples(startSec, endSec, paddingSec = 0) {
    const totalSamples = totalRenderSamples();
    const start = clamp(
      Math.floor(Math.max(0, Math.min(startSec, endSec) - paddingSec) * RENDER_SAMPLE_RATE),
      0,
      totalSamples
    );
    const end = clamp(
      Math.ceil(Math.min(durationSeconds(), Math.max(startSec, endSec) + paddingSec) * RENDER_SAMPLE_RATE),
      start,
      totalSamples
    );
    return { start, end };
  }

  function noteRenderSpan(note, paddingSec = 0.22) {
    const startSec = Math.max(0, note.startSec);
    const endSec = Math.min(durationSeconds(), note.startSec + note.durationSec + paddingSec);
    return { startSec, endSec };
  }

  function dirtyRangeFromColumns(startCol, endCol, paddingCols = 0) {
    return {
      startSec: timeFromCol(Math.min(startCol, endCol) - paddingCols),
      endSec: timeFromCol(Math.max(startCol, endCol) + paddingCols)
    };
  }

  function dirtyRangeFromPoints(from, to = from, paddingCols = brushRadiusCells() * 1.4) {
    return dirtyRangeFromColumns(from.col, to.col, paddingCols);
  }

  function sampleRangeToColumnRange(totalSamples, startSample, endSample, paddingCols = 3) {
    const cols = trackColCount();
    const safeDenominator = Math.max(1, totalSamples);
    const startCol = clamp(
      Math.floor((Math.max(0, startSample) / safeDenominator) * cols) - paddingCols,
      0,
      cols - 1
    );
    const endCol = clamp(
      Math.ceil((Math.max(startSample, endSample) / safeDenominator) * cols) + paddingCols,
      startCol,
      cols - 1
    );
    return { startCol, endCol };
  }

  function sampleWindowLength(startSample, endSample) {
    return Math.max(0, endSample - startSample);
  }

  function makeRenderWindow(totalSamples, options = {}) {
    const rangeStartSample = clamp(
      Number.isFinite(options.rangeStartSample) ? options.rangeStartSample : 0,
      0,
      totalSamples
    );
    const rangeEndSample = clamp(
      Number.isFinite(options.rangeEndSample) ? options.rangeEndSample : totalSamples,
      rangeStartSample,
      totalSamples
    );
    const partial = Boolean(options.targetOutput)
      || rangeStartSample > 0
      || rangeEndSample < totalSamples;
    const output = partial
      ? new Float32Array(sampleWindowLength(rangeStartSample, rangeEndSample))
      : new Float32Array(totalSamples);
    return {
      output,
      partial,
      rangeStartSample,
      rangeEndSample
    };
  }

  function writeRenderSample(window, sample, value) {
    if (window.partial) {
      if (sample < window.rangeStartSample || sample >= window.rangeEndSample) {
        return;
      }
      window.output[sample - window.rangeStartSample] += value;
      return;
    }
    window.output[sample] += value;
  }

  function mixPartialRangeIntoTarget(targetOutput, partialOutput, startSample, endSample) {
    const rangeLength = sampleWindowLength(startSample, endSample);
    if (!targetOutput || !partialOutput || rangeLength <= 0) {
      return targetOutput;
    }
    const fadeSamples = Math.min(PARTIAL_RENDER_CROSSFADE_SAMPLES, Math.floor(rangeLength * 0.5));
    for (let i = 0; i < rangeLength; i += 1) {
      let blend = 1;
      if (fadeSamples > 0) {
        if (i < fadeSamples) {
          blend = smoothstep01(i / fadeSamples);
        } else if (i >= rangeLength - fadeSamples) {
          blend = smoothstep01((rangeLength - 1 - i) / fadeSamples);
        }
      }
      const targetIndex = startSample + i;
      targetOutput[targetIndex] = lerp(targetOutput[targetIndex], partialOutput[i], blend);
    }
    return targetOutput;
  }

  function drawLayerCanRenderIncrementally(mode) {
    return mode === "geometry" || mode === "independent" || mode === "piano" || mode === "guitar";
  }

  function hasDrawLayerEnergy(analysis) {
    return analysis.energy.some((value) => value > EPSILON);
  }

  function layerHasEnergy(layer) {
    for (let i = 0; i < layer.length; i += 1) {
      if (layer[i] > EPSILON) {
        return true;
      }
    }
    return false;
  }

  function sampleNoteBackendSupportsProgressivePlay() {
    const compositeScoreCount = currentRenderLayerState().scoreEvents.length;
    return Boolean(
      !state.loopPlayback
      && SMPLR_NOTE_BACKENDS[state.noteBackend]
      && (compositeScoreCount || state.scoreEvents.length)
    );
  }

  function hasPreviewBaseLayers() {
    const composite = currentRenderLayerState();
    return composite.bassEvents.length > 0 || layerHasEnergy(composite.drawData);
  }

  function hasCurrentRenderedBuffer() {
    if (!state.renderedBuffer) {
      return false;
    }
    if (state.lastRenderedDataVersion !== state.dataVersion) {
      return false;
    }
    if (state.renderCache) {
      if (state.renderCache.totalSamples !== totalRenderSamples()) {
        return false;
      }
      if (state.renderCache.renderMode !== state.renderMode) {
        return false;
      }
      if (state.renderCache.noteBackend !== state.noteBackend) {
        return false;
      }
    }
    return true;
  }

  function mergeDirtySampleRange(startSample, endSample, layers) {
    if (state.dirtyRender.full) {
      return;
    }
    if (state.dirtyRender.endSample <= state.dirtyRender.startSample) {
      state.dirtyRender.startSample = startSample;
      state.dirtyRender.endSample = endSample;
    } else {
      state.dirtyRender.startSample = Math.min(state.dirtyRender.startSample, startSample);
      state.dirtyRender.endSample = Math.max(state.dirtyRender.endSample, endSample);
    }
    for (const layer of layers) {
      state.dirtyRender.layers[layer] = true;
    }
  }

  function sanitizeFrequencyRange(minValue, maxValue) {
    const bounds = frequencyBoundsForCurrentView();
    const axisMode = frequencyAxisMode();
    const minSpan = minimumFrequencySpan(bounds, axisMode);
    let min = clamp(minValue, bounds.min, bounds.max);
    let max = clamp(maxValue, bounds.min, bounds.max);
    if (max <= min) {
      max = Math.min(bounds.max, min + minSpan);
    }
    const axisMin = axisValueFromFrequency(min, axisMode);
    const axisMax = axisValueFromFrequency(Math.max(max, min + 1e-6), axisMode);
    const span = axisMax - axisMin;
    if (span < minSpan) {
      const anchor = axisMode === "linear"
        ? (min + max) * 0.5
        : Math.sqrt(min * max);
      let nextMin = frequencyFromAxisValue(axisValueFromFrequency(anchor, axisMode) - minSpan * 0.5, axisMode);
      let nextMax = frequencyFromAxisValue(axisValueFromFrequency(anchor, axisMode) + minSpan * 0.5, axisMode);
      if (axisMode === "linear" && nextMin < bounds.min) {
        const shift = bounds.min - nextMin;
        nextMin += shift;
        nextMax += shift;
      } else if (axisMode !== "linear" && nextMin < bounds.min) {
        const scale = bounds.min / nextMin;
        nextMin *= scale;
        nextMax *= scale;
      }
      if (axisMode === "linear" && nextMax > bounds.max) {
        const shift = nextMax - bounds.max;
        nextMin -= shift;
        nextMax -= shift;
      } else if (axisMode !== "linear" && nextMax > bounds.max) {
        const scale = bounds.max / nextMax;
        nextMin *= scale;
        nextMax *= scale;
      }
      min = clamp(nextMin, bounds.min, bounds.max);
      max = clamp(nextMax, bounds.min, bounds.max);
    }
    return { min, max };
  }

  function rememberCurrentFrequencyRange(minValue, maxValue) {
    if (isScoreSheetMode()) {
      state.scoreViewFreqs[state.editorView] = { min: minValue, max: maxValue };
    } else {
      state.freeMinFreq = minValue;
      state.freeMaxFreq = maxValue;
    }
  }

  function rowForFrequencyInRange(freq, minValue, maxValue, mode = frequencyAxisMode()) {
    const clamped = clamp(freq, minValue, maxValue);
    const minAxis = axisValueFromFrequency(minValue, mode);
    const maxAxis = axisValueFromFrequency(Math.max(maxValue, minValue + 1e-6), mode);
    const freqAxis = axisValueFromFrequency(clamped, mode);
    const ratio = (freqAxis - minAxis) / Math.max(1e-6, maxAxis - minAxis);
    return clamp((1 - ratio) * (GRID_ROWS - 1), 0, GRID_ROWS - 1);
  }

  function frequencyForRowInRange(row, minValue, maxValue, mode = frequencyAxisMode()) {
    const ratio = 1 - row / (GRID_ROWS - 1);
    const minAxis = axisValueFromFrequency(minValue, mode);
    const maxAxis = axisValueFromFrequency(Math.max(maxValue, minValue + 1e-6), mode);
    return frequencyFromAxisValue(lerp(minAxis, maxAxis, ratio), mode);
  }

  function sampleLayerAtFractionalRow(layer, col, row) {
    const row0 = clamp(Math.floor(row), 0, GRID_ROWS - 1);
    const row1 = clamp(row0 + 1, 0, GRID_ROWS - 1);
    const frac = clamp(row - row0, 0, 1);
    const v0 = amplitudeAt(layer, col, row0);
    const v1 = amplitudeAt(layer, col, row1);
    return lerp(v0, v1, frac);
  }

  function remapLayerFrequencyRange(source, target, oldMin, oldMax, newMin, newMax, oldMode = frequencyAxisMode(), newMode = frequencyAxisMode()) {
    if (!(oldMin > 0 && oldMax > oldMin && newMin > 0 && newMax > newMin)) {
      return;
    }
    for (let col = 0; col < GRID_COLS; col += 1) {
      for (let row = 0; row < GRID_ROWS; row += 1) {
        const targetFreq = frequencyForRowInRange(row, newMin, newMax, newMode);
        const sourceRow = rowForFrequencyInRange(targetFreq, oldMin, oldMax, oldMode);
        target[gridIndex(col, row)] = sampleLayerAtFractionalRow(source, col, sourceRow);
      }
    }
  }

  function setFrequencyRange(minValue, maxValue) {
    const oldMin = effectiveMinFrequency();
    const oldMax = effectiveMaxFrequency();
    const range = sanitizeFrequencyRange(minValue, maxValue);
    if (Math.abs(range.min - oldMin) > 1e-6 || Math.abs(range.max - oldMax) > 1e-6) {
      if (!state.frequencyZoomReference) {
        state.frequencyZoomReference = {
          drawData: drawData.slice(),
          basslineData: basslineData.slice(),
          min: oldMin,
          max: oldMax
        };
      }
      remapLayerFrequencyRange(
        state.frequencyZoomReference.drawData,
        drawData,
        state.frequencyZoomReference.min,
        state.frequencyZoomReference.max,
        range.min,
        range.max,
        frequencyAxisMode(),
        frequencyAxisMode()
      );
      remapLayerFrequencyRange(
        state.frequencyZoomReference.basslineData,
        basslineData,
        state.frequencyZoomReference.min,
        state.frequencyZoomReference.max,
        range.min,
        range.max,
        frequencyAxisMode(),
        frequencyAxisMode()
      );
    }
    minFreqInput.value = String(Math.round(range.min));
    maxFreqInput.value = String(Math.round(range.max));
    rememberCurrentFrequencyRange(range.min, range.max);
  }

  function effectiveMinFrequency() {
    return Number(minFreqInput.value);
  }

  function effectiveMaxFrequency() {
    return Number(maxFreqInput.value);
  }

  function applyEditorViewSettings() {
    const profile = currentScoreProfile();
    if (profile) {
      const remembered = state.scoreViewFreqs[state.editorView] || defaultFrequencyRangeForView(state.editorView);
      setFrequencyRange(remembered.min, remembered.max);
    } else {
      setFrequencyRange(state.freeMinFreq, state.freeMaxFreq);
    }
    minFreqInput.disabled = false;
    maxFreqInput.disabled = false;
  }

  function defaultBasslineBpm(name) {
    if (name === "dub-foundation") {
      return 138;
    }
    if (name === "four-floor") {
      return 124;
    }
    if (name === "halfstep-wobble") {
      return 140;
    }
    if (name === "electro-break") {
      return 132;
    }
    return 120;
  }

  function createEmptyLayer(name = `Layer ${nextLayerId}`) {
    return {
      id: `layer-${nextLayerId++}`,
      name,
      visible: true,
      drawData: new Float32Array(GRID_COLS * GRID_ROWS),
      basslineData: new Float32Array(GRID_COLS * GRID_ROWS),
      bassEvents: [],
      scoreEvents: []
    };
  }

  function cloneLayerRecord(layer, name = layer.name) {
    return {
      id: `layer-${nextLayerId++}`,
      name,
      visible: layer.visible !== false,
      drawData: layer.drawData.slice(),
      basslineData: layer.basslineData.slice(),
      bassEvents: cloneEventList(layer.bassEvents || []),
      scoreEvents: cloneEventList(layer.scoreEvents || [])
    };
  }

  function buildTabSettingsFromCurrentState() {
    return {
      durationSeconds: durationSeconds(),
      gain: Number(gainInput.value),
      brushSize: Number(sizeInput.value),
      strength: Number(strengthInput.value),
      density: Number(densityInput.value),
      basslineBpm: basslineBpm(),
      editorView: state.editorView,
      renderMode: state.renderMode,
      noteBackend: state.noteBackend,
      frequencyAxis: frequencyAxisMode(),
      showPhaseDiagnostics: state.showPhaseDiagnostics,
      showSampleDebug: state.showSampleDebug,
      loopPlayback: state.loopPlayback,
      showDrawingTools: state.showDrawingTools,
      currentBasslinePreset: state.currentBasslinePreset,
      freeMinFreq: state.freeMinFreq,
      freeMaxFreq: state.freeMaxFreq,
      scoreViewFreqs: {
        "guitar-score": { ...state.scoreViewFreqs["guitar-score"] },
        "piano-score": { ...state.scoreViewFreqs["piano-score"] }
      },
      viewOffsetCol: state.viewOffsetCol,
      viewColSpan: state.viewColSpan,
      showGrid: Boolean(gridToggle && gridToggle.checked),
      tool: state.tool
    };
  }

  function applyTabSettings(settings) {
    const nextDuration = clamp(
      Number(settings.durationSeconds) || durationSeconds(),
      Number(durationInput.min),
      Number(durationInput.max)
    );
    durationInput.value = String(nextDuration);
    gainInput.value = String(clamp(Number(settings.gain) || Number(gainInput.value), Number(gainInput.min), Number(gainInput.max)));
    sizeInput.value = String(clamp(Number(settings.brushSize) || Number(sizeInput.value), Number(sizeInput.min), Number(sizeInput.max)));
    strengthInput.value = String(clamp(Number(settings.strength) || Number(strengthInput.value), Number(strengthInput.min), Number(strengthInput.max)));
    densityInput.value = String(clamp(Number(settings.density) || Number(densityInput.value), Number(densityInput.min), Number(densityInput.max)));
    basslineBpmInput.value = String(clamp(Number(settings.basslineBpm) || basslineBpm(), Number(basslineBpmInput.min), Number(basslineBpmInput.max)));
    state.editorView = settings.editorView in SCORE_VIEW_PROFILES || settings.editorView === "spectrogram"
      ? settings.editorView
      : "spectrogram";
    state.renderMode = typeof settings.renderMode === "string" ? settings.renderMode : "geometry";
    state.noteBackend = isValidNoteBackend(settings.noteBackend) ? settings.noteBackend : "procedural";
    state.frequencyAxis = settings.frequencyAxis === "linear" ? "linear" : "log";
    state.showPhaseDiagnostics = Boolean(settings.showPhaseDiagnostics);
    state.showSampleDebug = Boolean(settings.showSampleDebug);
    state.loopPlayback = Boolean(settings.loopPlayback);
    state.showDrawingTools = settings.showDrawingTools !== false;
    state.currentBasslinePreset = typeof settings.currentBasslinePreset === "string" ? settings.currentBasslinePreset : "none";
    state.freeMinFreq = Number(settings.freeMinFreq) || state.freeMinFreq;
    state.freeMaxFreq = Number(settings.freeMaxFreq) || state.freeMaxFreq;
    if (settings.scoreViewFreqs && settings.scoreViewFreqs["guitar-score"]) {
      state.scoreViewFreqs["guitar-score"] = {
        min: Number(settings.scoreViewFreqs["guitar-score"].min) || state.scoreViewFreqs["guitar-score"].min,
        max: Number(settings.scoreViewFreqs["guitar-score"].max) || state.scoreViewFreqs["guitar-score"].max
      };
    }
    if (settings.scoreViewFreqs && settings.scoreViewFreqs["piano-score"]) {
      state.scoreViewFreqs["piano-score"] = {
        min: Number(settings.scoreViewFreqs["piano-score"].min) || state.scoreViewFreqs["piano-score"].min,
        max: Number(settings.scoreViewFreqs["piano-score"].max) || state.scoreViewFreqs["piano-score"].max
      };
    }
    if (editorViewSelect) {
      editorViewSelect.value = state.editorView;
    }
    if (renderModeSelect) {
      renderModeSelect.value = state.renderMode;
    }
    if (noteBackendSelect) {
      noteBackendSelect.value = state.noteBackend;
    }
    if (frequencyAxisSelect) {
      frequencyAxisSelect.value = state.frequencyAxis;
    }
    if (gridToggle) {
      gridToggle.checked = settings.showGrid !== false;
    }
    if (drawingToolsToggle) {
      drawingToolsToggle.checked = state.showDrawingTools;
    }
    const loadedRange = state.editorView === "spectrogram"
      ? { min: state.freeMinFreq, max: state.freeMaxFreq }
      : state.scoreViewFreqs[state.editorView] || defaultFrequencyRangeForView(state.editorView);
    const normalizedRange = sanitizeFrequencyRange(loadedRange.min, loadedRange.max);
    minFreqInput.value = String(Math.round(normalizedRange.min));
    maxFreqInput.value = String(Math.round(normalizedRange.max));
    rememberCurrentFrequencyRange(normalizedRange.min, normalizedRange.max);
    minFreqInput.disabled = false;
    maxFreqInput.disabled = false;
    state.viewColSpan = Number(settings.viewColSpan) || state.viewColSpan;
    state.viewOffsetCol = Number(settings.viewOffsetCol) || 0;
    clampViewSpan();
    clampViewOffset();
    state.frequencyZoomReference = null;
    setTool(typeof settings.tool === "string" ? settings.tool : "pointer");
  }

  function createTabFromCurrentState(name = `Project ${nextTabId}`) {
    const layer = createEmptyLayer("Layer 1");
    layer.drawData.set(drawData);
    layer.basslineData.set(basslineData);
    layer.bassEvents = cloneEventList(state.bassEvents);
    layer.scoreEvents = cloneEventList(state.scoreEvents);
    return {
      id: `tab-${nextTabId++}`,
      name,
      activeLayerId: layer.id,
      settings: buildTabSettingsFromCurrentState(),
      layers: [layer]
    };
  }

  function createBlankTab(name = `Project-${nextTabId}`) {
    const layer = createEmptyLayer("Layer 1");
    return {
      id: `tab-${nextTabId++}`,
      name,
      activeLayerId: layer.id,
      settings: buildTabSettingsFromCurrentState(),
      layers: [layer]
    };
  }

  function currentTabRecord() {
    return state.tabs.find((tab) => tab.id === state.currentTabId) || null;
  }

  function currentLayerRecord() {
    const tab = currentTabRecord();
    if (!tab) {
      return null;
    }
    return tab.layers.find((layer) => layer.id === state.activeLayerId)
      || tab.layers.find((layer) => layer.id === tab.activeLayerId)
      || tab.layers[0]
      || null;
  }

  function bindActiveLayer(layer) {
    if (!layer) {
      return;
    }
    state.activeLayerId = layer.id;
    const tab = currentTabRecord();
    if (tab) {
      tab.activeLayerId = layer.id;
    }
    drawData = layer.drawData;
    basslineData = layer.basslineData;
    state.bassEvents = layer.bassEvents;
    state.scoreEvents = layer.scoreEvents;
  }

  function saveCurrentTabState() {
    const tab = currentTabRecord();
    if (!tab) {
      return;
    }
    tab.settings = buildTabSettingsFromCurrentState();
    tab.activeLayerId = state.activeLayerId;
    const activeLayer = currentLayerRecord();
    if (activeLayer) {
      activeLayer.drawData = drawData;
      activeLayer.basslineData = basslineData;
      activeLayer.bassEvents = state.bassEvents;
      activeLayer.scoreEvents = state.scoreEvents;
    }
  }

  function invalidateCompositeLayerCache() {
    state.compositeLayerCache = null;
  }

  function visibleLayersInCurrentTab() {
    const tab = currentTabRecord();
    if (!tab) {
      return [];
    }
    return tab.layers.filter((layer) => layer.visible !== false);
  }

  function currentTabUsesCompositeLayers() {
    return visibleLayersInCurrentTab().length > 1;
  }

  function layersRequireFullRender() {
    return currentTabUsesCompositeLayers();
  }

  function getCompositeLayerState() {
    const tab = currentTabRecord();
    if (!tab) {
      return {
        drawData,
        basslineData,
        bassEvents: state.bassEvents,
        scoreEvents: state.scoreEvents
      };
    }
    const cacheKey = `${state.currentTabId}:${state.dataVersion}:${tab.layers.map((layer) => `${layer.id}:${layer.visible !== false ? 1 : 0}`).join("|")}`;
    if (state.compositeLayerCache && state.compositeLayerCache.key === cacheKey) {
      return state.compositeLayerCache.value;
    }
    const visibleLayers = visibleLayersInCurrentTab();
    if (visibleLayers.length === 0) {
      const value = {
        drawData: new Float32Array(GRID_COLS * GRID_ROWS),
        basslineData: new Float32Array(GRID_COLS * GRID_ROWS),
        bassEvents: [],
        scoreEvents: []
      };
      state.compositeLayerCache = { key: cacheKey, value };
      return value;
    }
    if (visibleLayers.length === 1) {
      const [singleLayer] = visibleLayers;
      const value = {
        drawData: singleLayer.drawData,
        basslineData: singleLayer.basslineData,
        bassEvents: singleLayer.bassEvents,
        scoreEvents: singleLayer.scoreEvents
      };
      state.compositeLayerCache = { key: cacheKey, value };
      return value;
    }
    const compositeDraw = new Float32Array(GRID_COLS * GRID_ROWS);
    const compositeBass = new Float32Array(GRID_COLS * GRID_ROWS);
    const compositeBassEvents = [];
    const compositeScoreEvents = [];
    for (const layer of visibleLayers) {
      for (let i = 0; i < compositeDraw.length; i += 1) {
        compositeDraw[i] = clamp(compositeDraw[i] + layer.drawData[i], 0, 1);
        compositeBass[i] = clamp(compositeBass[i] + layer.basslineData[i], 0, 1);
      }
      compositeBassEvents.push(...cloneEventList(layer.bassEvents || []));
      compositeScoreEvents.push(...cloneEventList(layer.scoreEvents || []));
    }
    compositeScoreEvents.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
    compositeBassEvents.sort((a, b) => (a.time || 0) - (b.time || 0));
    const value = {
      drawData: compositeDraw,
      basslineData: compositeBass,
      bassEvents: compositeBassEvents,
      scoreEvents: compositeScoreEvents
    };
    state.compositeLayerCache = { key: cacheKey, value };
    return value;
  }

  function currentRenderLayerState() {
    return getCompositeLayerState();
  }

  async function withCompositeLayerState(task) {
    const composite = currentRenderLayerState();
    const savedDrawData = drawData;
    const savedBasslineData = basslineData;
    const savedBassEvents = bassEvents;
    const savedScoreEvents = state.scoreEvents;
    const savedActiveLayerId = state.activeLayerId;
    drawData = composite.drawData;
    basslineData = composite.basslineData;
    bassEvents = composite.bassEvents;
    scoreEventsRef = composite.scoreEvents;
    try {
      return await task();
    } finally {
      drawData = savedDrawData;
      basslineData = savedBasslineData;
      bassEvents = savedBassEvents;
      scoreEventsRef = savedScoreEvents;
      state.activeLayerId = savedActiveLayerId;
    }
  }

  function renderTabStripUi() {
    if (!tabStrip) {
      return;
    }
    tabStrip.textContent = "";
    for (const tab of state.tabs) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `tab-chip${tab.id === state.currentTabId ? " is-active" : ""}`;
      chip.setAttribute("role", "tab");
      chip.setAttribute("aria-selected", tab.id === state.currentTabId ? "true" : "false");
      chip.title = `${tab.name} — hover and press F2 to rename`;
      chip.innerHTML = `<span class="tab-chip-label">${tab.name}</span>${state.tabs.length > 1 ? '<span class="tab-chip-close" aria-hidden="true">×</span>' : ""}`;
      chip.addEventListener("pointerenter", () => {
        state.hoveredRenameTarget = { type: "tab", id: tab.id };
      });
      chip.addEventListener("pointerleave", () => {
        if (state.hoveredRenameTarget && state.hoveredRenameTarget.type === "tab" && state.hoveredRenameTarget.id === tab.id) {
          state.hoveredRenameTarget = null;
        }
      });
      chip.addEventListener("click", (event) => {
        const closeHit = event.target instanceof HTMLElement && event.target.classList.contains("tab-chip-close");
        if (closeHit) {
          closeTab(tab.id);
          return;
        }
        switchToTab(tab.id);
      });
      tabStrip.appendChild(chip);
    }
  }

  function renderLayerListUi() {
    if (!layerList) {
      return;
    }
    const tab = currentTabRecord();
    layerList.textContent = "";
    if (!tab) {
      return;
    }
    const canDeleteLayer = (tab.layers || []).length > 1;
    const iconMarkup = {
      visible: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.6-5.5 9.5-5.5S21.5 12 21.5 12s-3.6 5.5-9.5 5.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.7"/></svg>`,
      hidden: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 4.5l17 15"/><path d="M10 6.8A10.2 10.2 0 0112 6.5c5.9 0 9.5 5.5 9.5 5.5a17 17 0 01-3 3.6"/><path d="M14.1 14.2a2.8 2.8 0 01-4-4"/><path d="M6.1 8.2A17.4 17.4 0 002.5 12s3.6 5.5 9.5 5.5c1 0 1.9-.1 2.8-.4"/></svg>`,
      copy: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="10" rx="1.8"/><rect x="5" y="5" width="10" height="10" rx="1.8"/></svg>`,
      cut: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="17.2" r="2.3"/><circle cx="17.5" cy="17.2" r="2.3"/><path d="M8.3 15.6L18 6"/><path d="M8.5 6l7 7"/></svg>`,
      delete: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10"/><path d="M17 7L7 17"/></svg>`
    };
    for (const layer of tab.layers) {
      const row = document.createElement("div");
      row.className = `layer-row${layer.id === state.activeLayerId ? " is-active" : ""}${layer.visible === false ? " is-hidden" : ""}`;
      row.setAttribute("role", "listitem");

      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "layer-name-btn";
      nameBtn.textContent = layer.name;
      nameBtn.title = `${layer.name} — hover and press F2 to rename`;
      nameBtn.setAttribute("aria-label", `${layer.name}. Hover and press F2 to rename.`);
      nameBtn.addEventListener("pointerenter", () => {
        state.hoveredRenameTarget = { type: "layer", id: layer.id };
      });
      nameBtn.addEventListener("pointerleave", () => {
        if (state.hoveredRenameTarget && state.hoveredRenameTarget.type === "layer" && state.hoveredRenameTarget.id === layer.id) {
          state.hoveredRenameTarget = null;
        }
      });
      nameBtn.addEventListener("click", () => activateLayer(layer.id));

      const actions = document.createElement("div");
      actions.className = "layer-actions-inline";

      const visibilityBtn = document.createElement("button");
      visibilityBtn.type = "button";
      visibilityBtn.className = `layer-icon-btn${layer.visible === false ? " is-muted" : ""}`;
      visibilityBtn.title = layer.visible === false ? "Show layer" : "Hide layer";
      visibilityBtn.setAttribute("aria-label", visibilityBtn.title);
      visibilityBtn.innerHTML = layer.visible === false ? iconMarkup.hidden : iconMarkup.visible;
      visibilityBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        layer.visible = layer.visible === false;
        invalidateCompositeLayerCache();
        markDirty();
        updateWorkspaceUi();
        renderCanvas();
      });

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "layer-icon-btn";
      copyBtn.title = "Copy layer";
      copyBtn.setAttribute("aria-label", "Copy layer");
      copyBtn.innerHTML = iconMarkup.copy;
      copyBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        activateLayer(layer.id);
        copyCurrentLayerToClipboard();
      });

      const cutBtn = document.createElement("button");
      cutBtn.type = "button";
      cutBtn.className = "layer-icon-btn";
      cutBtn.title = "Cut layer";
      cutBtn.setAttribute("aria-label", "Cut layer");
      cutBtn.innerHTML = iconMarkup.cut;
      cutBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        activateLayer(layer.id);
        cutCurrentLayerToClipboard();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "layer-icon-btn";
      deleteBtn.title = canDeleteLayer ? "Delete layer" : "At least one layer must remain";
      deleteBtn.setAttribute("aria-label", deleteBtn.title);
      deleteBtn.innerHTML = iconMarkup.delete;
      deleteBtn.disabled = !canDeleteLayer;
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!canDeleteLayer) {
          return;
        }
        activateLayer(layer.id);
        deleteCurrentLayer();
      });

      actions.append(visibilityBtn, copyBtn, cutBtn, deleteBtn);
      row.append(nameBtn, actions);
      layerList.appendChild(row);
    }
    if (pasteLayerButton) {
      pasteLayerButton.disabled = !state.clipboardLayer;
    }
  }

  function updateWorkspaceUi() {
    renderTabStripUi();
    renderLayerListUi();
  }

  function refreshWorkspaceIdCounters() {
    let maxTab = 0;
    let maxLayer = 0;
    for (const tab of state.tabs) {
      const tabMatch = /tab-(\d+)/.exec(tab.id || "");
      if (tabMatch) {
        maxTab = Math.max(maxTab, Number(tabMatch[1]) || 0);
      }
      for (const layer of tab.layers || []) {
        const layerMatch = /layer-(\d+)/.exec(layer.id || "");
        if (layerMatch) {
          maxLayer = Math.max(maxLayer, Number(layerMatch[1]) || 0);
        }
      }
    }
    if (state.clipboardLayer) {
      const clipMatch = /layer-(\d+)/.exec(state.clipboardLayer.id || "");
      if (clipMatch) {
        maxLayer = Math.max(maxLayer, Number(clipMatch[1]) || 0);
      }
    }
    nextTabId = Math.max(nextTabId, maxTab + 1);
    nextLayerId = Math.max(nextLayerId, maxLayer + 1);
  }

  function switchToTab(tabId) {
    if (state.currentTabId === tabId) {
      return;
    }
    saveCurrentTabState();
    const nextTab = state.tabs.find((tab) => tab.id === tabId);
    if (!nextTab) {
      return;
    }
    state.currentTabId = tabId;
    applyTabSettings(nextTab.settings);
    bindActiveLayer(nextTab.layers.find((layer) => layer.id === nextTab.activeLayerId) || nextTab.layers[0]);
    resetUndoHistory();
    invalidateCompositeLayerCache();
    markDirty();
    stopPlayback(`Switched to ${nextTab.name}.`);
    updateWorkspaceUi();
    updateOutputs();
    renderCanvas();
  }

  function activateLayer(layerId) {
    const tab = currentTabRecord();
    if (!tab || tab.activeLayerId === layerId) {
      return;
    }
    saveCurrentTabState();
    const layer = tab.layers.find((entry) => entry.id === layerId);
    if (!layer) {
      return;
    }
    tab.activeLayerId = layer.id;
    bindActiveLayer(layer);
    resetUndoHistory();
    invalidateCompositeLayerCache();
    markDirty();
    stopPlayback(`Activated ${layer.name}.`);
    updateWorkspaceUi();
    renderCanvas();
  }

  function addNewTab() {
    saveCurrentTabState();
    const tab = createBlankTab(`Project-${state.tabs.length + 1}`);
    state.tabs.push(tab);
    switchToTab(tab.id);
  }

  function closeTab(tabId) {
    if (state.tabs.length <= 1) {
      return;
    }
    saveCurrentTabState();
    const index = state.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) {
      return;
    }
    state.tabs.splice(index, 1);
    if (state.currentTabId === tabId) {
      const fallback = state.tabs[Math.max(0, index - 1)] || state.tabs[0];
      state.currentTabId = null;
      switchToTab(fallback.id);
      return;
    }
    invalidateCompositeLayerCache();
    updateWorkspaceUi();
    scheduleSessionProjectSave();
  }

  function addNewLayer() {
    const tab = currentTabRecord();
    if (!tab) {
      return;
    }
    saveCurrentTabState();
    const layer = createEmptyLayer(`Layer ${tab.layers.length + 1}`);
    tab.layers.push(layer);
    activateLayer(layer.id);
  }

  function renameActiveLayer() {
    const layer = currentLayerRecord();
    if (!layer) {
      return;
    }
    const nextName = window.prompt("Rename layer", layer.name);
    if (nextName == null) {
      return;
    }
    const normalized = nextName.trim();
    if (!normalized || normalized === layer.name) {
      return;
    }
    layer.name = normalized;
    updateWorkspaceUi();
    scheduleSessionProjectSave();
    setStatus(`Renamed layer to ${layer.name}.`);
  }

  function renameTab(tabId) {
    const tab = state.tabs.find((entry) => entry.id === tabId);
    if (!tab) {
      return;
    }
    const nextName = window.prompt("Rename project", tab.name);
    if (nextName == null) {
      return;
    }
    const normalized = nextName.trim();
    if (!normalized || normalized === tab.name) {
      return;
    }
    tab.name = normalized;
    updateWorkspaceUi();
    scheduleSessionProjectSave();
    setStatus(`Renamed project to ${tab.name}.`);
  }

  function renameHoveredTarget() {
    const target = state.hoveredRenameTarget;
    if (!target) {
      return;
    }
    if (target.type === "layer") {
      activateLayer(target.id);
      renameActiveLayer();
      return;
    }
    if (target.type === "tab") {
      renameTab(target.id);
    }
  }

  function sanitizedProjectFilename(name) {
    const base = (name || "soundpaint")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "");
    return `${base || "soundpaint"}.soundpaint.json`;
  }

  function copyCurrentLayerToClipboard() {
    const layer = currentLayerRecord();
    if (!layer) {
      return;
    }
    state.clipboardLayer = cloneLayerRecord(layer, `${layer.name} copy`);
    updateWorkspaceUi();
    scheduleSessionProjectSave();
    setStatus(`Copied layer "${layer.name}".`);
  }

  function cutCurrentLayerToClipboard() {
    const tab = currentTabRecord();
    const layer = currentLayerRecord();
    if (!tab || !layer) {
      return;
    }
    state.clipboardLayer = cloneLayerRecord(layer, layer.name);
    if (tab.layers.length === 1) {
      layer.drawData.fill(0);
      layer.basslineData.fill(0);
      layer.bassEvents.length = 0;
      layer.scoreEvents = [];
      bindActiveLayer(layer);
    } else {
      const index = tab.layers.findIndex((entry) => entry.id === layer.id);
      tab.layers.splice(index, 1);
      const fallback = tab.layers[Math.max(0, index - 1)] || tab.layers[0];
      bindActiveLayer(fallback);
      tab.activeLayerId = fallback.id;
    }
    invalidateCompositeLayerCache();
    markDirty();
    updateWorkspaceUi();
    renderCanvas();
    setStatus(`Cut layer "${layer.name}".`);
  }

  function pasteClipboardLayer() {
    const tab = currentTabRecord();
    if (!tab || !state.clipboardLayer) {
      return;
    }
    const layer = cloneLayerRecord(state.clipboardLayer, `${state.clipboardLayer.name}`);
    tab.layers.push(layer);
    activateLayer(layer.id);
    setStatus(`Pasted layer "${layer.name}".`);
  }

  function deleteCurrentLayer() {
    const tab = currentTabRecord();
    const layer = currentLayerRecord();
    if (!tab || !layer || tab.layers.length <= 1) {
      return;
    }
    const index = tab.layers.findIndex((entry) => entry.id === layer.id);
    tab.layers.splice(index, 1);
    const fallback = tab.layers[Math.max(0, index - 1)] || tab.layers[0];
    bindActiveLayer(fallback);
    tab.activeLayerId = fallback.id;
    invalidateCompositeLayerCache();
    markDirty();
    updateWorkspaceUi();
    renderCanvas();
    setStatus(`Deleted layer "${layer.name}".`);
  }

  function isReloadableBasslinePreset(name) {
    return name !== "none" && name !== "custom";
  }

  function renderModeName(mode) {
    if (mode === "independent") {
      return "Independent oscillators";
    }
    if (mode === "piano") {
      return "Piano-like resonances";
    }
    if (mode === "guitar") {
      return "Guitar-like plucks";
    }
    if (mode === "spectral") {
      return "Spectral bins";
    }
    if (mode === "griffin") {
      return "Griffin-Lim";
    }
    if (mode === "hybrid") {
      return "Hybrid coherence + Griffin-Lim";
    }
    return "Geometry coherence";
  }

  function renderModeDescription(mode) {
    if (mode === "independent") {
      return "Treats painted ridges as unrelated oscillators with no phase coupling.";
    }
    if (mode === "piano") {
      return "Turns tracked ridges into struck-string style resonances with hammer attacks, stretched partials, and decaying overtones.";
    }
    if (mode === "guitar") {
      return "Turns tracked ridges into plucked-string voices with bright attacks, decaying harmonics, and light string-style inharmonicity.";
    }
    if (mode === "spectral") {
      return "Classic spectrogram additive synthesis with one oscillator per frequency bin.";
    }
    if (mode === "griffin") {
      return "Iterative STFT phase reconstruction from magnitude spectrogram only.";
    }
    if (mode === "hybrid") {
      return "Geometry-coherent synthesis refined using Griffin-Lim consistency iterations.";
    }
    return "Tracks continuous painted structures as coherent oscillators with inferred physical phase behavior.";
  }

  function noteBackendName(backend = state.noteBackend) {
    if (backend === "procedural") {
      return "Procedural synth";
    }
    if (SMPLR_NOTE_BACKENDS[backend]) {
      return SMPLR_NOTE_BACKENDS[backend].label;
    }
    return "Procedural synth";
  }

  function resolvedNoteBackendName() {
    return noteBackendName(state.noteBackendResolved || state.noteBackend);
  }

  function isValidNoteBackend(backend) {
    return backend === "procedural"
      || Boolean(SMPLR_NOTE_BACKENDS[backend]);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function gridIndex(col, row) {
    return row * GRID_COLS + col;
  }

  function setStatus(message) {
    statusText.textContent = message;
  }

  function cancelPendingTransport(statusMessage) {
    if (state.transportPending !== "play") {
      return false;
    }
    state.transportPending = "";
    state.transportRequestId += 1;
    if (statusMessage) {
      setStatus(statusMessage);
    }
    updateOutputs();
    return true;
  }

  function transportIsActive() {
    return state.transportPending === "play"
      || (state.isPlaying && !state.isPaused)
      || Boolean(state.sourceNode)
      || state.liveSampleUsesProgressive
      || Boolean(state.liveSampleInstrument)
      || Boolean(state.liveSampleGainNode)
      || Boolean(state.rafId);
  }

  function setSampleDebug(message) {
    if (sampleDebugText) {
      sampleDebugText.textContent = `Sample debug: ${message}`;
    }
  }

  function resetSampleDebug(message = "idle.") {
    state.sampleDebugScheduledCount = 0;
    state.sampleDebugStartedCount = 0;
    setSampleDebug(message);
  }

  function firstNoteStartSec(notes) {
    if (!notes || !notes.length) {
      return null;
    }
    let first = Infinity;
    for (const note of notes) {
      if (note.startSec < first) {
        first = note.startSec;
      }
    }
    return Number.isFinite(first) ? first : null;
  }

  function nextNoteStartSec(notes, afterSec) {
    if (!notes || !notes.length) {
      return null;
    }
    let next = Infinity;
    for (const note of notes) {
      if (note.startSec >= afterSec && note.startSec < next) {
        next = note.startSec;
      }
    }
    return Number.isFinite(next) ? next : null;
  }

  function yieldToBrowser() {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function createRenderYieldController() {
    let lastYieldAt = performance.now();
    return async function maybeYield() {
      const now = performance.now();
      if (now - lastYieldAt < RENDER_YIELD_INTERVAL_MS) {
        return false;
      }
      lastYieldAt = now;
      await yieldToBrowser();
      return true;
    };
  }

  function shouldUseCooperativeRender(totalSamples, noteCount = state.scoreEvents.length) {
    return (
      totalSamples > RENDER_SAMPLE_RATE * 12
      || noteCount > 180
      || state.renderMode === "griffin"
      || state.renderMode === "hybrid"
    );
  }

  function releaseEnvelope(time, duration, releaseSeconds) {
    if (time >= duration) {
      return 0;
    }
    const tailStart = Math.max(0, duration - releaseSeconds);
    if (time <= tailStart) {
      return 1;
    }
    return 1 - (time - tailStart) / Math.max(0.0001, duration - tailStart);
  }

  function setRenderOverlay(active, options = {}) {
    if (!renderOverlay || !renderProgressBar || !renderProgressText) {
      return;
    }

    if (!active) {
      renderOverlay.hidden = true;
      renderProgressBar.classList.remove("is-indeterminate");
      renderProgressBar.style.width = "0%";
      return;
    }

    renderOverlay.hidden = false;
    if (renderOverlayTitle) {
      renderOverlayTitle.textContent = options.title || "Rendering audio";
    }
    if (renderOverlayDetail) {
      renderOverlayDetail.textContent = options.detail || "Preparing synthesis";
    }

    if (typeof options.progress === "number") {
      const progress = clamp(options.progress, 0, 1);
      renderProgressBar.classList.remove("is-indeterminate");
      renderProgressBar.style.width = `${Math.round(progress * 100)}%`;
      renderProgressText.textContent = options.progressText || `${Math.round(progress * 100)}%`;
    } else {
      renderProgressBar.classList.add("is-indeterminate");
      renderProgressBar.style.width = "42%";
      renderProgressText.textContent = options.progressText || "Working…";
    }
  }

  function trackColCount() {
    return clamp(Math.round(durationSeconds() * COLS_PER_SECOND), VIEW_COLS, GRID_COLS);
  }

  function clampViewSpan() {
    state.viewColSpan = clamp(
      Math.round(state.viewColSpan || VIEW_COLS),
      Math.min(MIN_VIEW_COLS, trackColCount()),
      trackColCount()
    );
  }

  function visibleColCount() {
    clampViewSpan();
    return Math.min(state.viewColSpan, trackColCount());
  }

  function maxViewOffset() {
    return Math.max(0, trackColCount() - visibleColCount());
  }

  function clampViewOffset() {
    clampViewSpan();
    state.viewOffsetCol = clamp(state.viewOffsetCol, 0, maxViewOffset());
  }

  function visibleStartCol() {
    clampViewOffset();
    return state.viewOffsetCol;
  }

  function visibleEndCol() {
    return visibleStartCol() + visibleColCount() - 1;
  }

  function visibleTimeRange() {
    const total = Math.max(1, trackColCount() - 1);
    return {
      start: (visibleStartCol() / total) * durationSeconds(),
      end: (visibleEndCol() / total) * durationSeconds()
    };
  }

  function timelineMetrics(trackWidth = timelineTrack ? timelineTrack.clientWidth : 0) {
    const totalCols = trackColCount();
    const visibleCols = visibleColCount();
    const safeTrackWidth = Math.max(0, trackWidth);
    const minThumbWidth = Math.min(Math.max(44, safeTrackWidth * 0.06), safeTrackWidth || 44);
    const thumbWidth = safeTrackWidth > 0
      ? clamp(safeTrackWidth * (visibleCols / Math.max(1, totalCols)), minThumbWidth, safeTrackWidth)
      : 0;
    const travel = Math.max(0, safeTrackWidth - thumbWidth);
    return {
      totalCols,
      visibleCols,
      maxOffset: maxViewOffset(),
      thumbWidth,
      travel
    };
  }

  function trackColFromClientX(clientX) {
    if (!timelineTrack) {
      return 0;
    }
    const rect = timelineTrack.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ratio * trackColCount();
  }

  function transportDuration() {
    if (state.renderedBuffer) {
      return state.renderedBuffer.duration;
    }
    if (state.isPlaying || state.isPaused) {
      return state.playDurationSeconds || durationSeconds();
    }
    return durationSeconds();
  }

  function setPlayheadRatio(ratio) {
    state.playheadRatio = clamp(ratio, 0, 1);
    state.pausedOffsetSeconds = state.playheadRatio * transportDuration();
  }

  function setPlayheadFromColumn(col) {
    setPlayheadRatio(col / Math.max(1, trackColCount() - 1));
  }

  function preferredPlaybackStartOffset(duration) {
    const safeDuration = Math.max(0, duration || 0);
    if (safeDuration <= 0.01) {
      return 0;
    }
    if (state.pausedOffsetSeconds > 0 && state.pausedOffsetSeconds < safeDuration - 0.01) {
      return clamp(state.pausedOffsetSeconds, 0, safeDuration);
    }
    if (state.playheadRatio > 0) {
      return clamp(state.playheadRatio * safeDuration, 0, safeDuration);
    }
    return 0;
  }

  function timelinePositionStatus() {
    const prefix = state.isPaused ? "Paused" : "Current time";
    return `${prefix} at ${state.pausedOffsetSeconds.toFixed(2)} s. Drag the playhead to shift the current time slice.`;
  }

  function setViewWindow(nextOffset, nextSpan, options = {}) {
    state.viewColSpan = clamp(
      Math.round(nextSpan),
      Math.min(MIN_VIEW_COLS, trackColCount()),
      trackColCount()
    );
    state.viewOffsetCol = clamp(Number(nextOffset) || 0, 0, maxViewOffset());
    scheduleSessionProjectSave();
    updateOutputs();
    if (options.render !== false) {
      renderCanvas();
    }
  }

  function zoomFrequencyAtRow(anchorRow, zoomFactor) {
    const currentMin = effectiveMinFrequency();
    const currentMax = Math.max(currentMin + 1, effectiveMaxFrequency());
    const anchorFreq = freqFromRow(anchorRow);
    const axisMode = frequencyAxisMode();
    const axisMin = axisValueFromFrequency(currentMin, axisMode);
    const axisMax = axisValueFromFrequency(currentMax, axisMode);
    const currentSpan = axisMax - axisMin;
    const nextSpan = currentSpan * zoomFactor;
    const anchorAxis = axisValueFromFrequency(anchorFreq, axisMode);
    const anchorRatio = clamp((anchorAxis - axisMin) / Math.max(1e-6, currentSpan), 0, 1);
    const nextAxisMin = anchorAxis - anchorRatio * nextSpan;
    const nextAxisMax = anchorAxis + (1 - anchorRatio) * nextSpan;
    setFrequencyRange(
      frequencyFromAxisValue(nextAxisMin, axisMode),
      frequencyFromAxisValue(nextAxisMax, axisMode)
    );
    updateOutputs();
    markDirty({ resetFrequencyReference: false });
    renderCanvas();
  }

  function zoomViewAtColumn(anchorCol, zoomFactor) {
    const oldSpan = visibleColCount();
    const nextSpan = clamp(
      Math.round(oldSpan * zoomFactor),
      Math.min(MIN_VIEW_COLS, trackColCount()),
      trackColCount()
    );
    if (nextSpan === oldSpan) {
      return;
    }

    const startCol = visibleStartCol();
    const anchorRatio = oldSpan > 1
      ? clamp((anchorCol - startCol) / Math.max(1, oldSpan - 1), 0, 1)
      : 0.5;
    const nextOffset = anchorCol - anchorRatio * Math.max(1, nextSpan - 1);
    setViewWindow(nextOffset, nextSpan);
  }

  function resetViewportToEditorDefault() {
    state.viewOffsetCol = 0;
    state.viewColSpan = VIEW_COLS;
    const defaultRange = isScoreSheetMode()
      ? defaultFrequencyRangeForView(state.editorView)
      : { min: DEFAULT_FREE_MIN_FREQ, max: DEFAULT_FREE_MAX_FREQ };
    setFrequencyRange(defaultRange.min, defaultRange.max);
    state.frequencyZoomReference = null;
    scheduleSessionProjectSave();
    updateOutputs();
    renderCanvas();
  }

  function defaultCanvasCursor() {
    if (state.tool === "pointer") {
      return "ew-resize";
    }
    return state.tool === "line" || state.tool === "note" ? "cell" : "crosshair";
  }

  function playheadColumn() {
    return state.playheadRatio * Math.max(1, trackColCount() - 1);
  }

  function isNearPlayhead(point) {
    if (!point || (!state.isPaused && !state.isScrubbingPlayhead)) {
      return false;
    }
    const thresholdCols = Math.max(2, (12 / plotWidth()) * visibleColCount());
    return Math.abs(point.col - playheadColumn()) <= thresholdCols;
  }

  function scoreNoteGeometry(note) {
    const startCol = colFromTime(note.startSec);
    const endCol = Math.max(startCol + 1, colFromTime(note.startSec + note.durationSec));
    const topRow = rowFromFreq(midiToFreq(note.midi + 0.48));
    const bottomRow = rowFromFreq(midiToFreq(note.midi - 0.48));
    return {
      startCol,
      endCol,
      minRow: Math.min(topRow, bottomRow),
      maxRow: Math.max(topRow, bottomRow)
    };
  }

  function hitTestScoreNote(point) {
    if (!point || !isScoreSheetMode() || !state.scoreEvents.length) {
      return null;
    }
    const edgeThresholdCols = Math.max(2, (10 / plotWidth()) * visibleColCount());
    const rowThreshold = 2.2;
    for (let index = state.scoreEvents.length - 1; index >= 0; index -= 1) {
      const note = state.scoreEvents[index];
      const geometry = scoreNoteGeometry(note);
      const withinRows = point.row >= geometry.minRow - rowThreshold && point.row <= geometry.maxRow + rowThreshold;
      if (!withinRows) {
        continue;
      }
      const withinCols = point.col >= geometry.startCol - edgeThresholdCols && point.col <= geometry.endCol + edgeThresholdCols;
      if (!withinCols) {
        continue;
      }
      let mode = "move";
      if (Math.abs(point.col - geometry.startCol) <= edgeThresholdCols) {
        mode = "resize-left";
      } else if (Math.abs(point.col - geometry.endCol) <= edgeThresholdCols) {
        mode = "resize-right";
      } else if (point.col < geometry.startCol || point.col > geometry.endCol) {
        continue;
      }
      return {
        index,
        mode,
        note,
        geometry
      };
    }
    return null;
  }

  function applyScoreNoteEdit(point) {
    if (!state.scoreEditOriginalNote || state.scoreEditIndex < 0 || !point) {
      return false;
    }
    const original = state.scoreEditOriginalNote;
    const minDuration = minimumScoreNoteDurationSec();
    const trackDuration = durationSeconds();
    let nextNote = { ...original };

    if (state.scoreEditMode === "move") {
      const deltaSec = timeFromCol(point.col) - timeFromCol(state.scoreEditStartPoint.col);
      const nextMidi = nearestScoreMidiForPoint(point);
      const deltaMidi = nextMidi === null || state.scoreEditStartMidi === null ? 0 : nextMidi - state.scoreEditStartMidi;
      const duration = original.durationSec;
      nextNote.startSec = clamp(original.startSec + deltaSec, 0, Math.max(0, trackDuration - duration));
      nextNote.durationSec = duration;
      nextNote.midi = clamp(original.midi + deltaMidi, currentScoreProfile().minMidi, currentScoreProfile().maxMidi);
    } else if (state.scoreEditMode === "resize-left") {
      const noteEnd = original.startSec + original.durationSec;
      const rawStartSec = clamp(timeFromCol(point.col), 0, noteEnd - minDuration);
      const rawDurationBeats = (noteEnd - rawStartSec) / scoreBeatSeconds();
      const maxDurationBeats = noteEnd / scoreBeatSeconds();
      const snappedDurationBeats = nearestAllowedScoreLengthBeatsInRange(
        rawDurationBeats,
        minimumScoreNoteDurationSec() / scoreBeatSeconds(),
        maxDurationBeats
      );
      const snappedDurationSec = snappedDurationBeats * scoreBeatSeconds();
      nextNote.startSec = clamp(noteEnd - snappedDurationSec, 0, noteEnd - minDuration);
      nextNote.durationSec = noteEnd - nextNote.startSec;
    } else if (state.scoreEditMode === "resize-right") {
      const rawEndSec = clamp(timeFromCol(point.col), original.startSec + minDuration, trackDuration);
      const rawDurationBeats = (rawEndSec - original.startSec) / scoreBeatSeconds();
      const maxDurationBeats = (trackDuration - original.startSec) / scoreBeatSeconds();
      const snappedDurationBeats = nearestAllowedScoreLengthBeatsInRange(
        rawDurationBeats,
        minimumScoreNoteDurationSec() / scoreBeatSeconds(),
        maxDurationBeats
      );
      nextNote.durationSec = snappedDurationBeats * scoreBeatSeconds();
    } else {
      return false;
    }

    const changed = (
      Math.abs(nextNote.startSec - state.scoreEvents[state.scoreEditIndex].startSec) > 1e-6
      || Math.abs(nextNote.durationSec - state.scoreEvents[state.scoreEditIndex].durationSec) > 1e-6
      || nextNote.midi !== state.scoreEvents[state.scoreEditIndex].midi
    );
    if (changed) {
      state.scoreEvents[state.scoreEditIndex] = nextNote;
    }
    return changed;
  }

  function updateCanvasCursor(point) {
    if (state.scoreEditMode === "move") {
      canvas.style.cursor = "grabbing";
      return;
    }
    if (state.scoreEditMode === "resize-left" || state.scoreEditMode === "resize-right") {
      canvas.style.cursor = "ew-resize";
      return;
    }
    if (isNearPlayhead(point)) {
      canvas.style.cursor = "ew-resize";
      return;
    }
    if (state.tool === "note") {
      const hit = hitTestScoreNote(point);
      if (hit) {
        canvas.style.cursor = hit.mode === "move" ? "grab" : "ew-resize";
        return;
      }
    }
    canvas.style.cursor = defaultCanvasCursor();
  }

  function markDirty(options = {}) {
    const {
      resetFrequencyReference = true,
      full = true,
      layers = null,
      rangeStartSec = null,
      rangeEndSec = null,
      paddingSec = 0
    } = options;
    state.dirty = true;
    state.renderedBuffer = null;
    state.renderedWav = null;
    state.dataVersion += 1;
    invalidateCompositeLayerCache();
    const targetLayers = layers || ["draw", "bass", "score"];
    const canIncremental = !full
      && Boolean(state.renderCache)
      && rangeStartSec !== null
      && rangeEndSec !== null
      && !layersRequireFullRender()
      && state.renderCache.totalSamples === totalRenderSamples()
      && state.renderCache.renderMode === state.renderMode
      && state.renderCache.noteBackend === state.noteBackend;
    if (!canIncremental) {
      state.dirtyRender = {
        full: true,
        startSample: 0,
        endSample: 0,
        layers: { draw: true, bass: true, score: true }
      };
      state.diagnosticsCache = null;
    } else {
      const range = dirtyRangeToSamples(rangeStartSec, rangeEndSec, paddingSec);
      if (state.dirtyRender.full) {
        state.dirtyRender = {
          full: false,
          startSample: range.start,
          endSample: range.end,
          layers: { draw: false, bass: false, score: false }
        };
      }
      mergeDirtySampleRange(range.start, range.end, targetLayers);
    }
    if (resetFrequencyReference) {
      state.frequencyZoomReference = null;
    }
    scheduleSessionProjectSave();
  }

  function clearImportedScoreEvents() {
    if (state.scoreEvents.length) {
      state.scoreEvents = [];
    }
  }

  function markToolEditDirty(range, dirtyLayers) {
    const layers = [];
    if (dirtyLayers.draw) {
      layers.push("draw");
    }
    if (dirtyLayers.bass) {
      layers.push("bass");
    }
    if (dirtyLayers.score) {
      layers.push("score");
    }
    if (!layers.length) {
      return;
    }
    markDirty({
      full: false,
      layers,
      rangeStartSec: range.startSec,
      rangeEndSec: range.endSec,
      paddingSec: 0.08
    });
  }

  function removeScoreEventsNearPoint(point) {
    if (!state.scoreEvents.length) {
      return false;
    }

    const radiusCols = Math.max(2, brushRadiusCells() * 0.95);
    const radiusRows = Math.max(1.2, brushRadiusCells() * 0.48);
    const eraseStartSec = timeFromCol(point.col - radiusCols);
    const eraseEndSec = timeFromCol(point.col + radiusCols);
    const minSegment = 0.02;
    const nextEvents = [];
    let changed = false;

    const scoreEvents = currentRenderLayerState().scoreEvents;
    for (const note of scoreEvents) {
      const noteRow = rowFromFreq(midiToFreq(note.midi));
      const noteStart = note.startSec;
      const noteEnd = note.startSec + note.durationSec;
      const pitchHit = Math.abs(point.row - noteRow) <= radiusRows;
      const timeHit = eraseEndSec > noteStart && eraseStartSec < noteEnd;

      if (!pitchHit || !timeHit) {
        nextEvents.push(note);
        continue;
      }

      changed = true;
      if (noteStart < eraseStartSec - minSegment) {
        nextEvents.push({
          ...note,
          durationSec: eraseStartSec - noteStart
        });
      }
      if (noteEnd > eraseEndSec + minSegment) {
        nextEvents.push({
          ...note,
          startSec: eraseEndSec,
          durationSec: noteEnd - eraseEndSec
        });
      }
    }

    if (changed) {
      state.scoreEvents = mergeAdjacentNoteEvents(nextEvents);
    }
    return changed;
  }

  function addScoreNoteEvent(startPoint, endPoint) {
    const placement = quantizedScoreNotePlacement(startPoint, endPoint);
    if (!placement) {
      return null;
    }
    if (placement.endSec <= placement.startSec + 0.01) {
      return null;
    }
    const velocity = clamp(currentStrength() * 0.82 + 0.18, 0.18, 1);
    const addedNote = {
      startSec: placement.startSec,
      durationSec: placement.endSec - placement.startSec,
      midi: placement.midi,
      velocity
    };
    state.scoreEvents = mergeAdjacentNoteEvents([
      ...state.scoreEvents,
      addedNote
    ]);
    return addedNote;
  }

  function cloneEventList(events) {
    return events.map((event) => ({ ...event }));
  }

  function sparseLayerData(layer) {
    const entries = [];
    for (let i = 0; i < layer.length; i += 1) {
      const value = layer[i];
      if (value > EPSILON) {
        entries.push(i, Number(value.toFixed(6)));
      }
    }
    return entries;
  }

  function restoreSparseLayerData(layer, entries) {
    layer.fill(0);
    if (!Array.isArray(entries)) {
      return;
    }
    for (let i = 0; i + 1 < entries.length; i += 2) {
      const index = Number(entries[i]);
      const value = Number(entries[i + 1]);
      if (!Number.isFinite(index) || !Number.isFinite(value)) {
        continue;
      }
      if (index < 0 || index >= layer.length) {
        continue;
      }
      layer[index] = clamp(value, 0, 1);
    }
  }

  function serializeLayerRecord(layer) {
    return {
      id: layer.id,
      name: layer.name,
      visible: layer.visible !== false,
      layers: {
        drawData: sparseLayerData(layer.drawData),
        basslineData: sparseLayerData(layer.basslineData)
      },
      events: {
        bassEvents: cloneEventList(layer.bassEvents || []),
        scoreEvents: cloneEventList(layer.scoreEvents || [])
      }
    };
  }

  function deserializeLayerRecord(payload, fallbackName = `Layer ${nextLayerId}`) {
    const layer = createEmptyLayer(typeof payload?.name === "string" ? payload.name : fallbackName);
    if (payload && typeof payload.id === "string") {
      layer.id = payload.id;
    }
    layer.visible = payload?.visible !== false;
    restoreSparseLayerData(layer.drawData, payload?.layers?.drawData);
    restoreSparseLayerData(layer.basslineData, payload?.layers?.basslineData);
    layer.bassEvents = cloneEventList(Array.isArray(payload?.events?.bassEvents) ? payload.events.bassEvents : []);
    layer.scoreEvents = cloneEventList(Array.isArray(payload?.events?.scoreEvents) ? payload.events.scoreEvents : []);
    return layer;
  }

  function buildSoundpaintProject() {
    saveCurrentTabState();
    return {
      format: "soundpaint",
      version: SOUNDPAINT_PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      currentTabId: state.currentTabId,
      clipboardLayer: state.clipboardLayer ? serializeLayerRecord(state.clipboardLayer) : null,
      tabs: state.tabs.map((tab) => ({
        id: tab.id,
        name: tab.name,
        activeLayerId: tab.activeLayerId,
        settings: JSON.parse(JSON.stringify(tab.settings)),
        layers: tab.layers.map(serializeLayerRecord)
      }))
    };
  }

  function downloadTextFile(filename, text, mimeType = "application/json") {
    const blob = new Blob([text], { type: mimeType });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function persistSessionProjectNow() {
    try {
      window.sessionStorage.setItem(
        SOUNDPAINT_SESSION_STORAGE_KEY,
        JSON.stringify(buildSoundpaintProject())
      );
    } catch (error) {
      // Ignore storage quota and privacy-mode failures.
    }
  }

  function scheduleSessionProjectSave() {
    if (state.sessionSaveTimer) {
      window.clearTimeout(state.sessionSaveTimer);
    }
    state.sessionSaveTimer = window.setTimeout(() => {
      state.sessionSaveTimer = 0;
      persistSessionProjectNow();
    }, 180);
  }

  function restoreSessionProjectIfAvailable() {
    try {
      const raw = window.sessionStorage.getItem(SOUNDPAINT_SESSION_STORAGE_KEY);
      if (!raw) {
        return false;
      }
      applySoundpaintProject(JSON.parse(raw), { statusMessage: "Restored project from this tab." });
      return true;
    } catch (error) {
      return false;
    }
  }

  function saveSoundpaintProject() {
    const project = buildSoundpaintProject();
    const activeTab = currentTabRecord();
    const filename = sanitizedProjectFilename(activeTab ? activeTab.name : "soundpaint");
    downloadTextFile(filename, JSON.stringify(project, null, 2));
    setStatus(`Project saved as ${filename}.`);
  }

  function applySoundpaintProject(project, options = {}) {
    if (!project || project.format !== "soundpaint") {
      throw new Error("Not a valid soundpaint project file.");
    }

    if (Array.isArray(project.tabs) && project.tabs.length) {
      state.tabs = project.tabs.map((tabPayload, index) => {
        const layers = Array.isArray(tabPayload.layers) && tabPayload.layers.length
          ? tabPayload.layers.map((layerPayload, layerIndex) => deserializeLayerRecord(layerPayload, `Layer ${layerIndex + 1}`))
          : [createEmptyLayer("Layer 1")];
        return {
          id: typeof tabPayload.id === "string" ? tabPayload.id : `tab-${nextTabId++}`,
          name: typeof tabPayload.name === "string" ? tabPayload.name : `Project-${index + 1}`,
          activeLayerId: typeof tabPayload.activeLayerId === "string" ? tabPayload.activeLayerId : layers[0].id,
          settings: tabPayload.settings || buildTabSettingsFromCurrentState(),
          layers
        };
      });
      state.currentTabId = state.tabs.some((tab) => tab.id === project.currentTabId)
        ? project.currentTabId
        : state.tabs[0].id;
      state.clipboardLayer = project.clipboardLayer
        ? deserializeLayerRecord(project.clipboardLayer, project.clipboardLayer.name || "Clipboard layer")
        : null;
      refreshWorkspaceIdCounters();
      const activeTab = currentTabRecord();
      applyTabSettings(activeTab.settings || buildTabSettingsFromCurrentState());
      bindActiveLayer(activeTab.layers.find((layer) => layer.id === activeTab.activeLayerId) || activeTab.layers[0]);
      invalidateCompositeLayerCache();
      resetUndoHistory();
      updateWorkspaceUi();
      updateOutputs();
      markDirty({ resetFrequencyReference: false });
      persistSessionProjectNow();
      stopPlayback(options.statusMessage || "Project loaded from soundpaint.json.");
      renderCanvas();
      return;
    }

    const legacyLayer = createEmptyLayer("Layer 1");
    restoreSparseLayerData(legacyLayer.drawData, project.layers?.drawData);
    restoreSparseLayerData(legacyLayer.basslineData, project.layers?.basslineData);
    legacyLayer.bassEvents = cloneEventList(Array.isArray(project.events?.bassEvents) ? project.events.bassEvents : []);
    legacyLayer.scoreEvents = cloneEventList(Array.isArray(project.events?.scoreEvents) ? project.events.scoreEvents : []);
    const legacyTab = {
      id: `tab-${nextTabId++}`,
      name: "Project-1",
      activeLayerId: legacyLayer.id,
      settings: project.settings || buildTabSettingsFromCurrentState(),
      layers: [legacyLayer]
    };
    state.tabs = [legacyTab];
    state.currentTabId = legacyTab.id;
    state.clipboardLayer = null;
    refreshWorkspaceIdCounters();
    applyTabSettings(legacyTab.settings);
    bindActiveLayer(legacyLayer);
    invalidateCompositeLayerCache();
    resetUndoHistory();
    updateWorkspaceUi();
    updateOutputs();
    markDirty({ resetFrequencyReference: false });
    persistSessionProjectNow();
    stopPlayback(options.statusMessage || "Project loaded from soundpaint.json.");
    renderCanvas();
  }

  async function loadSoundpaintProject(file) {
    const text = await file.text();
    let project;
    try {
      project = JSON.parse(text);
    } catch (error) {
      throw new Error("Project file is not valid JSON.");
    }
    applySoundpaintProject(project);
  }

  function captureEditorSnapshot() {
    return {
      drawData: drawData.slice(),
      basslineData: basslineData.slice(),
      bassEvents: cloneEventList(bassEvents),
      scoreEvents: cloneEventList(state.scoreEvents),
      currentBasslinePreset: state.currentBasslinePreset,
      dataVersion: state.dataVersion
    };
  }

  function restoreEditorSnapshot(snapshot) {
    drawData.set(snapshot.drawData);
    basslineData.set(snapshot.basslineData);
    bassEvents.length = 0;
    bassEvents.push(...cloneEventList(snapshot.bassEvents));
    state.scoreEvents = cloneEventList(snapshot.scoreEvents);
    state.currentBasslinePreset = snapshot.currentBasslinePreset;
    markDirty();
  }

  function updateUndoButton() {
    if (!undoButton) {
      return;
    }
    const canUndo = state.undoStack.length > 0;
    undoButton.disabled = !canUndo;
    undoButton.title = canUndo
      ? "Undo the last mouse drag (Ctrl+Z / Cmd+Z)"
      : "Nothing to undo yet";
  }

  function resetUndoHistory() {
    state.undoStack = [];
    state.pendingUndoSnapshot = null;
    state.pendingUndoVersion = -1;
    updateUndoButton();
  }

  function beginUndoGesture() {
    state.pendingUndoSnapshot = captureEditorSnapshot();
    state.pendingUndoVersion = state.dataVersion;
  }

  function commitUndoGesture() {
    if (!state.pendingUndoSnapshot) {
      return;
    }
    if (state.dataVersion !== state.pendingUndoVersion) {
      state.undoStack.push(state.pendingUndoSnapshot);
      if (state.undoStack.length > MAX_UNDO_STEPS) {
        state.undoStack.shift();
      }
    }
    state.pendingUndoSnapshot = null;
    state.pendingUndoVersion = -1;
    updateUndoButton();
  }

  function cancelUndoGesture() {
    state.pendingUndoSnapshot = null;
    state.pendingUndoVersion = -1;
    updateUndoButton();
  }

  function undoLastGesture() {
    if (state.drawing || state.isScrubbingPlayhead) {
      return;
    }
    if (!state.undoStack.length) {
      setStatus("Nothing to undo.");
      updateUndoButton();
      return;
    }
    stopHoldLoop();
    const snapshot = state.undoStack.pop();
    restoreEditorSnapshot(snapshot);
    state.pointerId = null;
    state.lastPointer = null;
    state.currentPointer = null;
    state.lineStart = null;
    state.linePreview = null;
    state.drawing = false;
    updateOutputs();
    stopPlayback("Undid the last drawing gesture.");
    updateUndoButton();
  }

  function createAudioContext() {
    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioContextClass();
      state.gainNode = state.audioContext.createGain();
      state.gainNode.connect(state.audioContext.destination);
    }
    return state.audioContext;
  }

  function updateOutputs() {
    clampViewOffset();
    durationOut.textContent = `${durationSeconds().toFixed(1)} s`;
    if (editorViewSelect) {
      editorViewSelect.value = state.editorView;
    }
    const minFreq = minFrequency();
    const maxFreq = maxFrequency();
    minFreqOut.textContent = isScoreSheetMode()
      ? `${Math.round(minFreq)} Hz (${noteNameFromMidi(freqToMidi(minFreq))})`
      : `${Math.round(minFreq)} Hz`;
    maxFreqOut.textContent = isScoreSheetMode()
      ? `${Math.round(maxFreq)} Hz (${noteNameFromMidi(freqToMidi(maxFreq))})`
      : `${Math.round(maxFreq)} Hz`;
    gainOut.textContent = Number(gainInput.value).toFixed(2);
    sizeOut.textContent = `${Math.round(Number(sizeInput.value))} px`;
    strengthOut.textContent = currentStrength().toFixed(2);
    densityOut.textContent = `${Math.round(currentDensity())}`;
    if (guitarPluckOut) {
      guitarPluckOut.textContent = `${Math.round(guitarPluckPosition() * 100)}%`;
    }
    if (guitarBodyOut) {
      guitarBodyOut.textContent = guitarBodyResonance().toFixed(2);
    }
    if (pianoHammerOut) {
      pianoHammerOut.textContent = pianoHammerHardness().toFixed(2);
    }
    if (pianoCouplingOut) {
      pianoCouplingOut.textContent = pianoStringCoupling().toFixed(2);
    }
    basslineBpmOut.textContent = `${Math.round(basslineBpm())}`;
    if (renderModeSelect) {
      renderModeSelect.value = state.renderMode;
      renderModeSelect.title = renderModeDescription(state.renderMode);
    }
    if (noteBackendSelect) {
      noteBackendSelect.value = state.noteBackend;
      noteBackendSelect.title = noteBackendName(state.noteBackend);
    }
    if (frequencyAxisSelect) {
      frequencyAxisSelect.value = frequencyAxisMode();
      frequencyAxisSelect.title = `${frequencyAxisName()} frequency axis`;
    }
    if (renderModeLabel) {
      renderModeLabel.textContent = `Render mode: ${renderModeName(state.renderMode)}`;
    }
    if (renderModeDescriptionEl) {
      renderModeDescriptionEl.textContent = renderModeDescription(state.renderMode);
    }
    if (phaseDiagnosticsToggle) {
      phaseDiagnosticsToggle.checked = state.showPhaseDiagnostics;
    }
    if (sampleDebugToggle) {
      sampleDebugToggle.checked = state.showSampleDebug;
    }
    if (drawingToolsToggle) {
      drawingToolsToggle.checked = state.showDrawingTools;
    }
    if (sampleDebugText) {
      sampleDebugText.hidden = !state.showSampleDebug;
    }
    if (surfaceToolbar) {
      surfaceToolbar.classList.toggle("is-collapsed", !state.showDrawingTools);
    }
    if (playButton) {
      const playActsAsPause = transportIsActive();
      playButton.classList.toggle("is-engaged", playActsAsPause);
      playButton.setAttribute("aria-label", playActsAsPause ? "Pause" : "Play");
      playButton.title = playActsAsPause ? "Pause" : "Play";
      const icon = playButton.querySelector(".tool-icon");
      if (icon) {
        icon.innerHTML = playActsAsPause ? PAUSE_ICON_SVG : PLAY_ICON_SVG;
      }
      const label = playButton.querySelector(".sr-only");
      if (label) {
        label.textContent = playActsAsPause ? "Pause" : "Play";
      }
    }
    if (renderButton) {
      renderButton.classList.toggle("is-engaged", Boolean(state.renderPromise));
    }
    if (stopButton) {
      stopButton.classList.toggle("is-engaged", !state.isPlaying && !state.isPaused && state.playheadRatio <= 0);
    }
    if (loopButton) {
      loopButton.classList.toggle("is-engaged", state.loopPlayback);
      loopButton.setAttribute("aria-pressed", state.loopPlayback ? "true" : "false");
      loopButton.title = state.loopPlayback ? "Loop playback on" : "Loop playback off";
    }
    const noteToolButton = toolButtons.find((button) => button.dataset.tool === "note");
    if (noteToolButton) {
      noteToolButton.hidden = !isScoreNoteToolAvailable();
      noteToolButton.disabled = !isScoreNoteToolAvailable();
      if (!isScoreNoteToolAvailable() && state.tool === "note") {
        state.tool = "brush";
      }
    }
    updateToolParameterVisibility();
    for (const button of toolButtons) {
      button.classList.toggle("is-active", button.dataset.tool === state.tool);
    }
    updateUndoButton();
    const range = visibleTimeRange();
    timelineOut.textContent = `${range.start.toFixed(2)} s - ${range.end.toFixed(2)} s`;
    if (timelineTrack && timelineThumb) {
      updateTimelineScrollbar();
    } else if (timelineInput) {
      timelineInput.max = String(maxViewOffset());
      timelineInput.value = String(state.viewOffsetCol);
    }
  }

  function updateTimelineScrollbar() {
    if (!timelineTrack || !timelineThumb) {
      return;
    }
    updateTimelineOverview();
    const metrics = timelineMetrics();
    const ratio = metrics.maxOffset > 0 ? state.viewOffsetCol / metrics.maxOffset : 0;
    const left = metrics.travel * ratio;
    timelineThumb.style.width = `${metrics.thumbWidth}px`;
    timelineThumb.style.transform = `translateX(${left}px)`;
    timelineThumb.classList.toggle("is-resizing-left", state.timelineDragMode === "resize-left");
    timelineThumb.classList.toggle("is-resizing-right", state.timelineDragMode === "resize-right");
    timelineTrack.setAttribute("aria-valuemin", "0");
    timelineTrack.setAttribute("aria-valuemax", String(metrics.maxOffset));
    timelineTrack.setAttribute("aria-valuenow", String(Math.round(state.viewOffsetCol)));
    timelineTrack.setAttribute("aria-valuetext", timelineOut.textContent);
  }

  function updateTimelineOverview() {
    if (!timelineOverview || !timelineOverviewCtx || !timelineTrack) {
      return;
    }
    const rect = timelineTrack.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (timelineOverview.width !== width || timelineOverview.height !== height) {
      timelineOverview.width = width;
      timelineOverview.height = height;
      state.timelineOverviewCacheKey = "";
    }

    const tab = currentTabRecord();
    const visibilityKey = tab
      ? tab.layers.map((layer) => `${layer.id}:${layer.visible !== false ? 1 : 0}`).join("|")
      : "single";
    const cacheKey = [
      state.currentTabId || "none",
      state.dataVersion,
      visibilityKey,
      state.editorView,
      frequencyAxisMode(),
      Math.round(effectiveMinFrequency()),
      Math.round(effectiveMaxFrequency()),
      trackColCount(),
      width,
      height
    ].join(":");
    if (state.timelineOverviewCacheKey === cacheKey) {
      return;
    }
    state.timelineOverviewCacheKey = cacheKey;

    const composite = currentRenderLayerState();
    const image = timelineOverviewCtx.createImageData(width, height);
    const pixels = image.data;
    const totalCols = trackColCount();

    for (let col = 0; col < totalCols; col += 1) {
      const x0 = Math.floor((col / totalCols) * width);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) / totalCols) * width));
      for (let row = 0; row < GRID_ROWS; row += 1) {
        const index = gridIndex(col, row);
        const drawValue = composite.drawData[index];
        const bassValue = composite.basslineData[index];
        if (drawValue <= EPSILON && bassValue <= EPSILON) {
          continue;
        }
        const y0 = Math.floor((row / GRID_ROWS) * height);
        const y1 = Math.max(y0 + 1, Math.floor(((row + 1) / GRID_ROWS) * height));
        const [r, g, b, a] = layeredColor(bassValue, drawValue);
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const pixelIndex = (y * width + x) * 4;
            if (a > pixels[pixelIndex + 3]) {
              pixels[pixelIndex] = r;
              pixels[pixelIndex + 1] = g;
              pixels[pixelIndex + 2] = b;
              pixels[pixelIndex + 3] = a;
            }
          }
        }
      }
    }

    for (const note of composite.scoreEvents) {
      const startCol = colFromTime(note.startSec);
      const endCol = colFromTime(note.startSec + Math.max(0.02, note.durationSec));
      const x0 = clamp(Math.floor((startCol / Math.max(1, totalCols - 1)) * width), 0, width - 1);
      const x1 = clamp(Math.max(x0 + 1, Math.ceil((endCol / Math.max(1, totalCols - 1)) * width)), 1, width);
      const topRow = clamp(rowFromFreq(midiToFreq(note.midi + 0.48)), 0, GRID_ROWS - 1);
      const bottomRow = clamp(rowFromFreq(midiToFreq(note.midi - 0.48)), 0, GRID_ROWS - 1);
      const y0 = clamp(Math.min(topRow, bottomRow) / GRID_ROWS * height, 0, height - 1);
      const y1 = clamp(Math.max(topRow, bottomRow) / GRID_ROWS * height, 0, height - 1);
      const yStart = Math.max(0, Math.floor(y0));
      const yEnd = Math.min(height, Math.max(yStart + 1, Math.ceil(y1 + 1)));
      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const pixelIndex = (y * width + x) * 4;
          pixels[pixelIndex] = Math.max(pixels[pixelIndex], 255);
          pixels[pixelIndex + 1] = Math.max(pixels[pixelIndex + 1], 228);
          pixels[pixelIndex + 2] = Math.max(pixels[pixelIndex + 2], 170);
          pixels[pixelIndex + 3] = 255;
        }
      }
    }

    timelineOverviewCtx.putImageData(image, 0, 0);
  }

  function freqFromRow(row) {
    const minFreq = effectiveMinFrequency();
    const maxFreq = Math.max(minFreq + 1, effectiveMaxFrequency());
    return frequencyForRowInRange(row, minFreq, maxFreq, frequencyAxisMode());
  }

  function rowFromFreq(freq) {
    const minFreq = effectiveMinFrequency();
    const maxFreq = Math.max(minFreq + 1, effectiveMaxFrequency());
    return Math.round(rowForFrequencyInRange(freq, minFreq, maxFreq, frequencyAxisMode()));
  }

  function colFromTime(seconds) {
    return clamp(
      (seconds / Math.max(0.001, durationSeconds())) * Math.max(0, trackColCount() - 1),
      0,
      Math.max(0, trackColCount() - 1)
    );
  }

  function timeFromCol(col) {
    return (clamp(col, 0, Math.max(0, trackColCount() - 1)) / Math.max(1, trackColCount() - 1)) * durationSeconds();
  }

  function amplitudeColor(value) {
    const v = clamp(value, 0, 1);
    const c1 = [5, 10, 22];
    const c2 = [29, 72, 130];
    const c3 = [76, 176, 255];
    const c4 = [255, 173, 94];
    const c5 = [255, 246, 216];

    const mix = (a, b, t) => [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t))
    ];

    if (v < 0.18) {
      return mix(c1, c2, v / 0.18);
    }
    if (v < 0.45) {
      return mix(c2, c3, (v - 0.18) / 0.27);
    }
    if (v < 0.8) {
      return mix(c3, c4, (v - 0.45) / 0.35);
    }
    return mix(c4, c5, (v - 0.8) / 0.2);
  }

  function amplitudeAt(layer, col, row) {
    const sampleCol = Math.round(col);
    const sampleRow = Math.round(row);
    if (sampleCol < 0 || sampleRow < 0 || sampleCol >= trackColCount() || sampleRow >= GRID_ROWS) {
      return 0;
    }
    return layer[gridIndex(sampleCol, sampleRow)];
  }

  function combinedAmplitude(col, row) {
    const composite = currentRenderLayerState();
    return clamp(amplitudeAt(composite.drawData, col, row) + amplitudeAt(composite.basslineData, col, row), 0, 1);
  }

  function layeredColor(bassValue, drawValue) {
    const bass = clamp(bassValue, 0, 1);
    const draw = clamp(drawValue, 0, 1);
    const combined = clamp(bass + draw, 0, 1);
    const [r, g, b] = amplitudeColor(combined);
    const bassTint = [76, 160, 255];
    const bassMix = bass * 0.72;
    return [
      Math.round(lerp(r, bassTint[0], bassMix)),
      Math.round(lerp(g, bassTint[1], bassMix)),
      Math.round(lerp(b, bassTint[2], bassMix)),
      255
    ];
  }

  function hasImportedScoreOverlay() {
    return currentRenderLayerState().scoreEvents.length > 0 && isScoreSheetMode();
  }

  function repaintOffscreen() {
    const composite = currentRenderLayerState();
    const pixels = pixelImage.data;
    const startCol = visibleStartCol();
    const span = Math.max(1, visibleColCount() - 1);
    const maxTrackCol = Math.max(0, trackColCount() - 1);
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let viewCol = 0; viewCol < VIEW_COLS; viewCol += 1) {
        const viewRatio = VIEW_COLS > 1 ? viewCol / (VIEW_COLS - 1) : 0;
        const sourceCol = clamp(startCol + viewRatio * span, 0, maxTrackCol);
        const col0 = Math.floor(sourceCol);
        const col1 = Math.min(maxTrackCol, col0 + 1);
        const mix = sourceCol - col0;
        const bass0 = amplitudeAt(composite.basslineData, col0, row);
        const bass1 = amplitudeAt(composite.basslineData, col1, row);
        const draw0 = amplitudeAt(composite.drawData, col0, row);
        const draw1 = amplitudeAt(composite.drawData, col1, row);
        const bass = lerp(bass0, bass1, mix);
        const draw = lerp(draw0, draw1, mix);
        const [r, g, b, a] = layeredColor(bass, draw);
        const pixelRow = row;
        const pixelBase = (pixelRow * VIEW_COLS + viewCol) * 4;
        pixels[pixelBase] = r;
        pixels[pixelBase + 1] = g;
        pixels[pixelBase + 2] = b;
        pixels[pixelBase + 3] = a;
      }
    }
    offCtx.putImageData(pixelImage, 0, 0);
  }

  function isNaturalMidi(midi) {
    const pitchClass = ((midi % 12) + 12) % 12;
    return pitchClass === 0 || pitchClass === 2 || pitchClass === 4 || pitchClass === 5
      || pitchClass === 7 || pitchClass === 9 || pitchClass === 11;
  }

  function currentScoreGuides() {
    const profile = currentScoreProfile();
    if (!profile) {
      return [];
    }
    const anchorMidis = new Set(profile.anchorMidis || []);
    const guides = [];
    for (let midi = profile.minMidi; midi <= profile.maxMidi; midi += 1) {
      const pitchClass = ((midi % 12) + 12) % 12;
      guides.push({
        midi,
        freq: midiToFreq(midi),
        note: noteNameFromMidi(midi),
        natural: isNaturalMidi(midi),
        anchor: anchorMidis.has(midi),
        showLabel: anchorMidis.has(midi)
          || (profile.labelMode === "c-octaves" && pitchClass === 0)
      });
    }
    return guides;
  }

  function drawGridAndAxes() {
    const x0 = margins.left;
    const y0 = margins.top;
    const w = plotWidth();
    const h = plotHeight();

    ctx.save();
    ctx.strokeStyle = "rgba(230, 240, 255, 0.34)";
    ctx.lineWidth = 2.2;
    ctx.strokeRect(x0, y0, w, h);

    if (gridToggle.checked) {
      ctx.strokeStyle = "rgba(148, 177, 220, 0.22)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 1; i < 8; i += 1) {
        const x = x0 + (w * i) / 8;
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y0 + h);
      }
      if (!isScoreSheetMode()) {
        for (let i = 1; i < 6; i += 1) {
          const y = y0 + (h * i) / 6;
          ctx.moveTo(x0, y);
          ctx.lineTo(x0 + w, y);
        }
      }
      ctx.stroke();

      if (isScoreSheetMode()) {
        const guides = currentScoreGuides();
        for (const guide of guides) {
          const y = y0 + (rowFromFreq(guide.freq) / (GRID_ROWS - 1)) * h;
          ctx.save();
          ctx.strokeStyle = guide.anchor
            ? "rgba(255, 208, 138, 0.44)"
            : guide.natural
              ? "rgba(214, 232, 255, 0.28)"
              : "rgba(112, 148, 194, 0.16)";
          ctx.lineWidth = guide.anchor ? 2.1 : guide.natural ? 1.4 : 0.9;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x0 + w, y);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        ctx.strokeStyle = "rgba(214, 232, 255, 0.32)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x0 + w * 0.5, y0);
        ctx.lineTo(x0 + w * 0.5, y0 + h);
        ctx.moveTo(x0, y0 + h * 0.5);
        ctx.lineTo(x0 + w, y0 + h * 0.5);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgba(241, 247, 255, 0.98)";
    ctx.font = "600 15px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const range = visibleTimeRange();
    for (let i = 0; i <= 4; i += 1) {
      const ratio = i / 4;
      const x = x0 + ratio * w;
      const seconds = lerp(range.start, range.end, ratio);
      ctx.fillText(`${seconds.toFixed(1)}s`, x, y0 + h + 12);
    }

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    if (isScoreSheetMode()) {
      const guides = currentScoreGuides().filter((guide) => guide.showLabel || guide.anchor);
      for (const guide of guides) {
        const row = rowFromFreq(guide.freq);
        const y = y0 + (row / (GRID_ROWS - 1)) * h;
        const label = guide.anchor
          ? `${guide.note} (${Math.round(guide.freq)} Hz)`
          : guide.note;
        ctx.fillStyle = guide.anchor ? "rgba(255, 236, 208, 0.98)" : "rgba(241, 247, 255, 0.9)";
        ctx.fillText(label, x0 - 10, y);
      }
    } else {
      const freqTicks = [maxFrequency(), 2000, 1000, 440, 220, minFrequency()]
        .filter((value, index, array) => value >= minFrequency() && value <= maxFrequency() && array.indexOf(value) === index)
        .sort((a, b) => b - a);

      for (const freq of freqTicks) {
        const row = rowFromFreq(freq);
        const y = y0 + (row / (GRID_ROWS - 1)) * h;
        ctx.fillText(`${Math.round(freq)} Hz`, x0 - 10, y);

        if (gridToggle.checked) {
          ctx.save();
          ctx.strokeStyle = "rgba(214, 232, 255, 0.18)";
          ctx.lineWidth = 1.35;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x0 + w, y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    ctx.save();
    ctx.translate(18, y0 + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "700 16px Inter, system-ui, sans-serif";
    ctx.fillText(isScoreSheetMode() ? currentScoreProfile().axisLabel : "Frequency", 0, 0);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = "700 16px Inter, system-ui, sans-serif";
    ctx.fillText("Time", x0 + w / 2, canvas.height - 22);
    ctx.restore();
  }

  function drawPlayhead() {
    if (!state.isPlaying && !state.isPaused && state.playheadRatio <= 0) {
      return;
    }
    const playCol = playheadColumn();
    if (playCol < visibleStartCol() || playCol > visibleEndCol()) {
      return;
    }
    const x = margins.left + ((playCol - visibleStartCol()) / Math.max(1, visibleColCount() - 1)) * plotWidth();
    ctx.save();
    ctx.strokeStyle = state.isPlaying
      ? "rgba(255, 237, 170, 0.95)"
      : "rgba(111, 214, 255, 0.96)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, margins.top);
    ctx.lineTo(x, margins.top + plotHeight());
    ctx.stroke();

    if (state.isPaused) {
      ctx.fillStyle = "rgba(111, 214, 255, 0.96)";
      ctx.beginPath();
      ctx.arc(x, margins.top + 10, 4.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLinePreview() {
    if (!state.lineStart || !state.linePreview || (state.tool !== "line" && state.tool !== "note")) {
      return;
    }
    if (state.tool === "note") {
      const placement = quantizedScoreNotePlacement(state.lineStart, state.linePreview);
      if (!placement) {
        return;
      }
      const startCol = placement.startCol;
      const endCol = placement.endCol;
      const midi = placement.midi;
      const topFreq = midiToFreq(midi + 0.48);
      const bottomFreq = midiToFreq(midi - 0.48);
      const top = gridToCanvas(startCol, rowFromFreq(topFreq));
      const bottom = gridToCanvas(endCol, rowFromFreq(bottomFreq));
      const x = Math.min(top.x, bottom.x);
      const y = Math.min(top.y, bottom.y);
      const width = Math.max(2, Math.abs(bottom.x - top.x));
      const height = Math.max(5, Math.abs(bottom.y - top.y));
      ctx.save();
      ctx.fillStyle = "rgba(121, 214, 255, 0.24)";
      ctx.strokeStyle = "rgba(121, 214, 255, 0.95)";
      ctx.lineWidth = 1.6;
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
      ctx.restore();
      return;
    }
    const from = gridToCanvas(state.lineStart.col, state.lineStart.row);
    const to = gridToCanvas(state.linePreview.col, state.linePreview.row);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 205, 128, 0.95)";
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawImportedScoreOverlay() {
    if (!hasImportedScoreOverlay()) {
      return;
    }
    const scoreEvents = currentRenderLayerState().scoreEvents;

    const startVisibleCol = visibleStartCol();
    const endVisibleCol = visibleEndCol();
    const y0 = margins.top;
    const h = plotHeight();

    ctx.save();
    ctx.rect(margins.left, y0, plotWidth(), h);
    ctx.clip();

    for (const note of scoreEvents) {
      const startCol = colFromTime(note.startSec);
      const endCol = Math.max(startCol + 1, colFromTime(note.startSec + note.durationSec));
      if (endCol < startVisibleCol || startCol > endVisibleCol) {
        continue;
      }

      const clampedStart = Math.max(startVisibleCol, startCol);
      const clampedEnd = Math.min(endVisibleCol, endCol);
      const x1 = margins.left + ((clampedStart - startVisibleCol) / Math.max(1, visibleColCount() - 1)) * plotWidth();
      const x2 = margins.left + ((clampedEnd - startVisibleCol) / Math.max(1, visibleColCount() - 1)) * plotWidth();
      const width = Math.max(2, x2 - x1);

      const topFreq = midiToFreq(note.midi + 0.48);
      const bottomFreq = midiToFreq(note.midi - 0.48);
      const topRow = rowFromFreq(topFreq);
      const bottomRow = rowFromFreq(bottomFreq);
      const topY = y0 + (Math.min(topRow, bottomRow) / (GRID_ROWS - 1)) * h;
      const bottomY = y0 + (Math.max(topRow, bottomRow) / (GRID_ROWS - 1)) * h;
      const rectHeight = Math.max(5, bottomY - topY);
      const rectY = (topY + bottomY) * 0.5 - rectHeight * 0.5;
      const velocity = clamp(note.velocity || 0.78, 0.2, 1);

      ctx.fillStyle = `rgba(${Math.round(96 + velocity * 58)}, ${Math.round(182 + velocity * 24)}, 255, 0.34)`;
      ctx.strokeStyle = `rgba(${Math.round(214 + velocity * 20)}, ${Math.round(236 + velocity * 12)}, 255, 0.84)`;
      ctx.lineWidth = 1.1;
      ctx.fillRect(x1, rectY, width, rectHeight);
      ctx.strokeRect(x1 + 0.5, rectY + 0.5, Math.max(1, width - 1), Math.max(1, rectHeight - 1));
    }

    ctx.restore();
  }

  function drawPointerPreview() {
    if (!state.pointerInside || !state.currentPointer || state.tool === "line" || state.tool === "note" || state.tool === "pointer") {
      return;
    }
    const point = gridToCanvas(state.currentPointer.col, state.currentPointer.row);
    const radius = (brushRadiusCells() / Math.max(1, visibleColCount())) * plotWidth();
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function getDiagnosticsSnapshot() {
    if (!state.showPhaseDiagnostics) {
      return null;
    }
    if (state.diagnosticsCache && state.diagnosticsCache.version === state.dataVersion) {
      return state.diagnosticsCache.snapshot;
    }
    const analysis = analyzeColumns();
    const tracks = extractDrawVoiceTracks(analysis);
    const snapshot = { analysis, tracks };
    state.diagnosticsCache = {
      version: state.dataVersion,
      snapshot
    };
    return snapshot;
  }

  function groupHue(groupId) {
    if (groupId < 0) {
      return 135;
    }
    return (groupId * 67 + 135) % 360;
  }

  function drawPhaseDiagnosticsOverlay(snapshot) {
    if (!snapshot || !snapshot.tracks.length) {
      return;
    }

    const x0 = margins.left;
    const y0 = margins.top;
    const w = plotWidth();
    const h = plotHeight();

    ctx.save();
    ctx.rect(x0, y0, w, h);
    ctx.clip();

    for (const track of snapshot.tracks) {
      const hue = groupHue(track.harmonicGroupId);
      let segmentOpen = false;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let col = Math.max(track.firstCol, visibleStartCol()); col <= Math.min(track.lastCol, visibleEndCol()); col += 1) {
        if (track.activeTrack[col] < 0.1 || track.freqTrack[col] <= 0) {
          segmentOpen = false;
          continue;
        }
        const point = gridToCanvas(col, rowFromFreq(track.freqTrack[col]));
        const coherence = track.coherenceTrack[col];
        const noisiness = track.noisinessTrack[col];
        const lightness = lerp(42, 64, coherence);
        const saturation = lerp(72, 88, 1 - noisiness * 0.4);
        ctx.strokeStyle = `hsla(${lerp(18, hue, coherence)}, ${saturation}%, ${lightness}%, 0.9)`;
        if (!segmentOpen) {
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          segmentOpen = true;
        } else {
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
        }

        if (track.noisinessTrack[col] > 0.58) {
          ctx.fillStyle = `hsla(${lerp(22, 10, Math.min(1, noisiness))}, 88%, 62%, 0.36)`;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 2 + noisiness * 2.8, 0, TAU);
          ctx.fill();
        }
      }
      if (track.phaseResetCols.length) {
        ctx.strokeStyle = `hsla(${hue}, 92%, 72%, 0.95)`;
        ctx.lineWidth = 1.6;
        for (const col of track.phaseResetCols) {
          if (col < visibleStartCol() || col > visibleEndCol()) {
            continue;
          }
          const x = margins.left + ((col - visibleStartCol()) / Math.max(1, visibleColCount() - 1)) * plotWidth();
          ctx.beginPath();
          ctx.moveTo(x, y0 + 5);
          ctx.lineTo(x, y0 + 18);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  function renderCanvas() {
    const diagnostics = getDiagnosticsSnapshot();
    repaintOffscreen();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, "#08111f");
    bg.addColorStop(1, "#03070d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const x = margins.left;
    const y = margins.top;
    const w = plotWidth();
    const h = plotHeight();

    ctx.save();
    ctx.shadowColor = "rgba(79, 164, 255, 0.16)";
    ctx.shadowBlur = 24;
    ctx.imageSmoothingEnabled = !hasImportedScoreOverlay();
    ctx.drawImage(offscreen, x, y, w, h);
    ctx.restore();

    drawGridAndAxes();
    drawImportedScoreOverlay();
    drawPhaseDiagnosticsOverlay(diagnostics);
    drawPlayhead();
    drawLinePreview();
    drawPointerPreview();
  }

  function canvasToGrid(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    const within = x >= margins.left && x <= margins.left + plotWidth() && y >= margins.top && y <= margins.top + plotHeight();
    if (!within) {
      return null;
    }
    // Keep pointer coordinates continuous for freehand drawing so tool behavior
    // stays stable across zoom levels. Note snapping is applied separately only
    // for the dedicated Note tool.
    const viewCol = clamp(((x - margins.left) / plotWidth()) * Math.max(1, visibleColCount() - 1), 0, Math.max(0, visibleColCount() - 1));
    const col = clamp(visibleStartCol() + viewCol, 0, trackColCount() - 1);
    const row = clamp(((y - margins.top) / plotHeight()) * (GRID_ROWS - 1), 0, GRID_ROWS - 1);
    return { col, row };
  }

  function gridToCanvas(col, row) {
    return {
      x: margins.left + ((col - visibleStartCol()) / Math.max(1, visibleColCount() - 1)) * plotWidth(),
      y: margins.top + (row / (GRID_ROWS - 1)) * plotHeight()
    };
  }

  function updateCursorReadout(point) {
    if (!point) {
      cursorReadout.textContent = "t = 0.00 s | f = 440 Hz | a = 0.00";
      return;
    }
    const time = (point.col / Math.max(1, trackColCount() - 1)) * durationSeconds();
    const freq = freqFromRow(point.row);
    const amp = combinedAmplitude(point.col, point.row);
    const noteText = isScoreSheetMode() ? ` | note = ${noteNameFromMidi(freqToMidi(freq))}` : "";
    cursorReadout.textContent = `t = ${time.toFixed(2)} s | f = ${Math.round(freq)} Hz${noteText} | a = ${amp.toFixed(2)}`;
  }

  function setAmplitude(layer, col, row, delta) {
    if (col < 0 || row < 0 || col >= trackColCount() || row >= GRID_ROWS) {
      return;
    }
    const idx = gridIndex(col, row);
    layer[idx] = clamp(layer[idx] + delta, 0, 1);
  }

  function stampBrush(point, amount, exponent, layer = drawData) {
    const radius = brushRadiusCells();
    const left = Math.max(0, Math.floor(point.col - radius));
    const right = Math.min(trackColCount() - 1, Math.ceil(point.col + radius));
    const top = Math.max(0, Math.floor(point.row - radius));
    const bottom = Math.min(GRID_ROWS - 1, Math.ceil(point.row + radius));

    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        const dx = (col - point.col) / radius;
        const dy = (row - point.row) / radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          continue;
        }
        const falloff = Math.pow(1 - dist, exponent);
        setAmplitude(layer, col, row, amount * falloff);
      }
    }
  }

  function stampGaussian(point, amount, widthScale, layer = drawData) {
    const sigma = Math.max(1.2, brushRadiusCells() * widthScale);
    const radius = sigma * 2.8;
    const left = Math.max(0, Math.floor(point.col - radius));
    const right = Math.min(trackColCount() - 1, Math.ceil(point.col + radius));
    const top = Math.max(0, Math.floor(point.row - radius));
    const bottom = Math.min(GRID_ROWS - 1, Math.ceil(point.row + radius));

    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        const dx = col - point.col;
        const dy = row - point.row;
        const distSq = dx * dx + dy * dy;
        const delta = amount * Math.exp(-distSq / (2 * sigma * sigma));
        if (delta > 0.0004) {
          setAmplitude(layer, col, row, delta);
        }
      }
    }
  }

  function stampSpray(point, dtMs, direction, layer = drawData) {
    const radius = brushRadiusCells();
    const particles = Math.max(2, Math.round(currentDensity() * (dtMs / 16)));
    const strength = currentStrength() * 0.14 * direction;

    for (let i = 0; i < particles; i += 1) {
      const angle = Math.random() * TAU;
      const distance = Math.sqrt(Math.random()) * radius;
      const col = Math.round(point.col + Math.cos(angle) * distance);
      const row = Math.round(point.row + Math.sin(angle) * distance);
      setAmplitude(layer, col, row, strength * (0.55 + Math.random() * 0.45));
    }
  }

  function stampLine(from, to, direction, layer = drawData) {
    const dx = to.col - from.col;
    const dy = to.row - from.row;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const amount = currentStrength() * 0.18 * direction;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const point = {
        col: lerp(from.col, to.col, t),
        row: lerp(from.row, to.row, t)
      };
      stampBrush(point, amount, 1.8, layer);
    }
  }

  function hasLayerContentNearPoint(layer, point, radiusCols = brushRadiusCells()) {
    const left = Math.max(0, Math.floor(point.col - radiusCols));
    const right = Math.min(trackColCount() - 1, Math.ceil(point.col + radiusCols));
    const top = Math.max(0, Math.floor(point.row - radiusCols));
    const bottom = Math.min(GRID_ROWS - 1, Math.ceil(point.row + radiusCols));
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        if (amplitudeAt(layer, col, row) > EPSILON) {
          return true;
        }
      }
    }
    return false;
  }

  function removeBassEventsNearPoint(point) {
    const radiusCols = Math.max(3, brushRadiusCells() * 1.1);
    const radiusRows = Math.max(4, brushRadiusCells() * 1.2);
    const originalLength = bassEvents.length;

    function intersectsPercussiveEvent(eventCol, eventRow, colPad, rowPad) {
      return Math.abs(point.col - eventCol) <= radiusCols + colPad
        && Math.abs(point.row - eventRow) <= radiusRows + rowPad;
    }

    const remaining = bassEvents.filter((event) => {
      if (event.type === "kick") {
        return !intersectsPercussiveEvent(colFromTime(event.time), rowFromFreq(event.freq), 8, 8);
      }
      if (event.type === "snare") {
        return !intersectsPercussiveEvent(colFromTime(event.time), rowFromFreq(320), 8, 14);
      }
      if (event.type === "hat") {
        return !intersectsPercussiveEvent(colFromTime(event.time), rowFromFreq(2600), 6, 12);
      }
      if (event.type === "bass") {
        const startCol = colFromTime(event.time);
        const endCol = colFromTime(event.time + event.duration);
        const minRow = Math.min(rowFromFreq(event.startFreq), rowFromFreq(event.endFreq)) - radiusRows - 5;
        const maxRow = Math.max(rowFromFreq(event.startFreq), rowFromFreq(event.endFreq)) + radiusRows + 5;
        const withinCols = point.col >= startCol - radiusCols && point.col <= endCol + radiusCols;
        const withinRows = point.row >= minRow && point.row <= maxRow;
        return !(withinCols && withinRows);
      }
      return true;
    });

    bassEvents.length = 0;
    bassEvents.push(...remaining);
    return remaining.length !== originalLength;
  }

  function eraseAt(point, dtMs) {
    const amount = currentStrength() * 0.13 * (dtMs / 16);
    const touchedDrawVisual = hasLayerContentNearPoint(drawData, point);
    const touchedBassVisual = hasLayerContentNearPoint(basslineData, point);
    stampBrush(point, -amount, 1.3, drawData);
    stampBrush(point, -amount, 1.3, basslineData);
    const removedBassEvents = removeBassEventsNearPoint(point);
    const removedScoreEvents = removeScoreEventsNearPoint(point);
    if (touchedBassVisual || removedBassEvents) {
      state.currentBasslinePreset = "custom";
    }
    return {
      draw: touchedDrawVisual,
      bass: touchedBassVisual || removedBassEvents,
      score: removedScoreEvents
    };
  }

  function applyTool(point, dtMs, options = {}) {
    const direction = options.erase ? -1 : 1;
    if (state.tool === "brush") {
      stampBrush(point, currentStrength() * 0.1 * (dtMs / 16) * direction, 1.6, drawData);
      return { draw: true, bass: false, score: false };
    } else if (state.tool === "erase") {
      return eraseAt(point, dtMs);
    } else if (state.tool === "spray") {
      stampSpray(point, dtMs, direction, drawData);
      return { draw: true, bass: false, score: false };
    } else if (state.tool === "gaussian") {
      const heldSeconds = (performance.now() - state.holdStartMs) / 1000;
      const swell = 0.08 + Math.min(1.4, heldSeconds * 0.85);
      stampGaussian(point, currentStrength() * swell * (dtMs / 16) * 0.08 * direction, 0.55, drawData);
      return { draw: true, bass: false, score: false };
    }
    return { draw: false, bass: false, score: false };
  }

  function paintSegment(from, to, dtMs) {
    const dx = to.col - from.col;
    const dy = to.row - from.row;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const dirtyLayers = { draw: false, bass: false, score: false };
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const point = {
        col: lerp(from.col, to.col, t),
        row: lerp(from.row, to.row, t)
      };
      const layers = applyTool(point, dtMs / steps);
      dirtyLayers.draw = dirtyLayers.draw || layers.draw;
      dirtyLayers.bass = dirtyLayers.bass || layers.bass;
      dirtyLayers.score = dirtyLayers.score || layers.score;
    }
    return dirtyLayers;
  }

  function stopHoldLoop() {
    if (state.animationHoldId) {
      cancelAnimationFrame(state.animationHoldId);
      state.animationHoldId = 0;
    }
  }

  function holdLoop(now) {
    if (!state.drawing || !state.currentPointer || state.tool === "line" || state.tool === "note") {
      stopHoldLoop();
      return;
    }
    const dt = Math.max(8, now - state.lastHoldMs);
    const dirtyLayers = applyTool(state.currentPointer, dt);
    state.lastHoldMs = now;
    markToolEditDirty(dirtyRangeFromPoints(state.currentPointer), dirtyLayers);
    renderCanvas();
    state.animationHoldId = requestAnimationFrame(holdLoop);
  }

  function startHoldLoop() {
    state.holdStartMs = performance.now();
    state.lastHoldMs = state.holdStartMs;
    stopHoldLoop();
    state.animationHoldId = requestAnimationFrame(holdLoop);
  }

  function stopActiveSource() {
    if (!state.sourceNode) {
      return;
    }
    state.sourceNode.onended = null;
    try {
      state.sourceNode.stop();
    } catch (error) {
      // Ignore repeated stops from ended nodes.
    }
    state.sourceNode.disconnect();
    state.sourceNode = null;
  }

  function stopLiveSamplePlayback() {
    if (state.liveSampleGainNode && state.audioContext) {
      try {
        state.liveSampleGainNode.gain.cancelScheduledValues(state.audioContext.currentTime);
        state.liveSampleGainNode.gain.setValueAtTime(0, state.audioContext.currentTime);
      } catch (error) {
        // Ignore gain shutdown races.
      }
    }
    if (state.liveSampleScheduler) {
      try {
        state.liveSampleScheduler.stop();
      } catch (error) {
        // Ignore scheduler shutdown races.
      }
    }
    if (state.liveSampleInstrument) {
      try {
        state.liveSampleInstrument.stop();
      } catch (error) {
        // Ignore instrument stop races.
      }
    }
    if (state.liveSampleStopFns.length) {
      for (const stopFn of state.liveSampleStopFns) {
        try {
          stopFn();
        } catch (error) {
          // Ignore note stop races during transport changes.
        }
      }
    }
    state.liveSampleStopFns = [];
    state.liveSampleInstrument = null;
    state.liveSampleScheduler = null;
    if (state.liveSampleGainNode) {
      try {
        state.liveSampleGainNode.disconnect();
      } catch (error) {
        // Ignore repeated disconnects.
      }
    }
    state.liveSampleGainNode = null;
    state.liveSampleScheduledUntilSec = 0;
    state.liveSampleScoreEvents = [];
    state.liveSampleRenderedWindows = new Set();
    state.liveSampleRenderingWindows = new Set();
    state.liveSampleUsesProgressive = false;
    state.liveSampleSessionId += 1;
    setSampleDebug(`stopped. scheduled ${state.sampleDebugScheduledCount}, started ${state.sampleDebugStartedCount}.`);
  }

  function stopPlayback(statusMessage) {
    cancelPendingTransport();
    stopActiveSource();
    stopLiveSamplePlayback();
    state.isPlaying = false;
    state.isPaused = false;
    state.isScrubbingPlayhead = false;
    state.lastPlaybackLoopIndex = 0;
    state.pausedOffsetSeconds = 0;
    state.playheadRatio = 0;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    if (statusMessage) {
      setStatus(statusMessage);
    }
    updateOutputs();
    renderCanvas();
  }

  function pausePlayback() {
    const pendingStart = state.transportPending === "play";
    const hasLiveTransport = Boolean(state.sourceNode)
      || state.liveSampleUsesProgressive
      || Boolean(state.liveSampleInstrument)
      || Boolean(state.liveSampleGainNode)
      || Boolean(state.rafId);
    if (pendingStart && !state.isPlaying && !hasLiveTransport) {
      cancelPendingTransport("Playback start canceled.");
      renderCanvas();
      return;
    }
    const playbackDuration = Math.max(
      0,
      state.playDurationSeconds
        || (state.renderedBuffer ? state.renderedBuffer.duration : 0)
        || durationSeconds()
    );
    if (!pendingStart && !state.isPlaying && !hasLiveTransport) {
      return;
    }
    let offset = clamp(state.pausedOffsetSeconds, 0, playbackDuration);
    if (state.audioContext && playbackDuration > 0) {
      const currentOffset = clamp(
        state.audioContext.currentTime - state.playStartedAt,
        0,
        playbackDuration
      );
      offset = currentOffset;
      if (state.loopPlayback) {
        offset = ((currentOffset % playbackDuration) + playbackDuration) % playbackDuration;
      }
    } else if (playbackDuration > 0) {
      offset = clamp(state.playheadRatio * playbackDuration, 0, playbackDuration);
    }
    cancelPendingTransport();
    stopActiveSource();
    stopLiveSamplePlayback();
    state.isPlaying = false;
    state.isPaused = true;
    state.pausedOffsetSeconds = offset;
    state.playheadRatio = playbackDuration > 0 ? offset / playbackDuration : 0;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    setStatus(`Paused at ${offset.toFixed(2)} s. Drag the playhead to shift the current time slice.`);
    updateOutputs();
    renderCanvas();
  }

  function animatePlayhead() {
    if (!state.isPlaying || !state.audioContext) {
      state.rafId = 0;
      return;
    }
    const elapsed = state.audioContext.currentTime - state.playStartedAt;
    const duration = Math.max(0, state.playDurationSeconds || (state.renderedBuffer ? state.renderedBuffer.duration : 0));
    if (duration <= 0) {
      state.rafId = 0;
      return;
    }
    if (state.liveSampleUsesProgressive) {
      scheduleLiveSampleNotes();
    }
    if (state.loopPlayback && duration > 0) {
      const wrappedElapsed = ((elapsed % duration) + duration) % duration;
      const loopIndex = Math.floor(Math.max(0, elapsed) / duration);
      state.playheadRatio = wrappedElapsed / duration;
      if (loopIndex !== state.lastPlaybackLoopIndex) {
        state.lastPlaybackLoopIndex = loopIndex;
        followPlaybackViewport({ allowBackward: true });
      } else {
        followPlaybackViewport();
      }
    } else {
      if (elapsed >= duration && (!state.sourceNode || state.liveSampleUsesProgressive)) {
        stopPlayback("Playback finished.");
        return;
      }
      state.playheadRatio = clamp(elapsed / duration, 0, 1);
      followPlaybackViewport();
    }
    renderCanvas();
    state.rafId = requestAnimationFrame(animatePlayhead);
  }

  function columnAmplitude(col, row) {
    const value = amplitudeAt(drawData, col, row);
    const tilt = 0.75 + 0.25 * (1 - row / (GRID_ROWS - 1));
    return Math.pow(value, 1.45) * tilt;
  }

  async function normalizeAudioData(output, maybeYield) {
    let peak = 0;
    for (let i = 0; i < output.length; i += 1) {
      peak = Math.max(peak, Math.abs(output[i]));
      if (maybeYield && i % RENDER_MIX_CHUNK_SIZE === 0 && i > 0) {
        await maybeYield();
      }
    }
    if (peak > 0) {
      const scale = 0.92 / peak;
      for (let i = 0; i < output.length; i += 1) {
        output[i] *= scale;
        if (maybeYield && i % RENDER_MIX_CHUNK_SIZE === 0 && i > 0) {
          await maybeYield();
        }
      }
    }
  }

  async function applyEdgeFade(output, maybeYield) {
    const fadeInSamples = Math.min(Math.floor(RENDER_SAMPLE_RATE * 0.02), output.length);
    const fadeOutSamples = Math.min(Math.floor(RENDER_SAMPLE_RATE * 0.08), output.length);
    for (let i = 0; i < fadeInSamples; i += 1) {
      output[i] *= i / Math.max(1, fadeInSamples - 1);
    }
    for (let i = 0; i < fadeOutSamples; i += 1) {
      const idx = output.length - 1 - i;
      output[idx] *= i / Math.max(1, fadeOutSamples - 1);
    }
    if (maybeYield) {
      await maybeYield();
    }
  }

  function analyzeColumns() {
    const cols = trackColCount();
    const energy = new Float32Array(cols);
    const dominantFreq = new Float32Array(cols);
    const centroidFreq = new Float32Array(cols);
    const confidence = new Float32Array(cols);
    const ridgeFreq = new Float32Array(cols);
    const ridgeAmp = new Float32Array(cols);
    const ridgeCount = new Uint8Array(cols);
    const logFrequencies = new Float64Array(GRID_ROWS);

    for (let row = 0; row < GRID_ROWS; row += 1) {
      logFrequencies[row] = Math.log(freqFromRow(row));
    }

    for (let col = 0; col < cols; col += 1) {
      let sumAmp = 0;
      let sumLogFreq = 0;
      let peak = 0;
      let peakRow = 0;

      for (let row = 0; row < GRID_ROWS; row += 1) {
        const amp = columnAmplitude(col, row);
        if (amp < EPSILON) {
          continue;
        }
        sumAmp += amp;
        sumLogFreq += amp * logFrequencies[row];
        if (amp > peak) {
          peak = amp;
          peakRow = row;
        }
      }

      if (sumAmp < EPSILON) {
        continue;
      }

      const centroidLog = sumLogFreq / sumAmp;
      let variance = 0;
      for (let row = 0; row < GRID_ROWS; row += 1) {
        const amp = columnAmplitude(col, row);
        if (amp < EPSILON) {
          continue;
        }
        const diff = logFrequencies[row] - centroidLog;
        variance += amp * diff * diff;
      }

      const spreadOctaves = Math.sqrt(variance / sumAmp) / Math.log(2);
      const dominance = peak / sumAmp;
      const localRadius = 3;
      let ridgeWeightSum = 0;
      let ridgeLogFreqSum = 0;
      let ridgeEnergy = 0;
      let ridgeVariance = 0;

      for (let row = Math.max(0, peakRow - localRadius); row <= Math.min(GRID_ROWS - 1, peakRow + localRadius); row += 1) {
        const amp = columnAmplitude(col, row);
        if (amp < EPSILON) {
          continue;
        }
        const centeredDistance = Math.abs(row - peakRow);
        const localityWeight = centeredDistance === 0 ? 1 : centeredDistance === 1 ? 0.78 : centeredDistance === 2 ? 0.42 : 0.18;
        const weight = Math.pow(amp, 2.4) * localityWeight;
        ridgeWeightSum += weight;
        ridgeLogFreqSum += logFrequencies[row] * weight;
        ridgeEnergy += amp;
      }

      const ridgeLog = ridgeWeightSum > 0 ? ridgeLogFreqSum / ridgeWeightSum : logFrequencies[peakRow];
      for (let row = Math.max(0, peakRow - localRadius); row <= Math.min(GRID_ROWS - 1, peakRow + localRadius); row += 1) {
        const amp = columnAmplitude(col, row);
        if (amp < EPSILON) {
          continue;
        }
        const centeredDistance = Math.abs(row - peakRow);
        const localityWeight = centeredDistance === 0 ? 1 : centeredDistance === 1 ? 0.78 : centeredDistance === 2 ? 0.42 : 0.18;
        const weight = Math.pow(amp, 2.4) * localityWeight;
        const diff = logFrequencies[row] - ridgeLog;
        ridgeVariance += weight * diff * diff;
      }

      const ridgeSpreadOctaves = ridgeWeightSum > 0
        ? Math.sqrt(ridgeVariance / ridgeWeightSum) / Math.log(2)
        : spreadOctaves;

      let peaks = 0;
      const peakThreshold = Math.max(peak * 0.24, sumAmp * 0.045);
      for (let row = 1; row < GRID_ROWS - 1; row += 1) {
        const center = columnAmplitude(col, row);
        if (center < peakThreshold) {
          continue;
        }
        if (center >= columnAmplitude(col, row - 1) && center >= columnAmplitude(col, row + 1)) {
          peaks += 1;
          row += 1;
        }
      }

      energy[col] = sumAmp;
      dominantFreq[col] = freqFromRow(peakRow);
      centroidFreq[col] = Math.exp(centroidLog);
      ridgeFreq[col] = Math.exp(ridgeLog);
      ridgeAmp[col] = ridgeEnergy;
      ridgeCount[col] = peaks;
      confidence[col] = clamp((dominance - 0.18) / 0.64, 0, 1) * clamp(1 - ridgeSpreadOctaves / 0.18, 0, 1);
    }

    return { energy, dominantFreq, centroidFreq, confidence, ridgeFreq, ridgeAmp, ridgeCount };
  }

  function buildSpectralAudioData() {
    const cols = trackColCount();
    const totalSamples = totalRenderSamples();
    const output = new Float32Array(totalSamples);
    const phases = new Float64Array(GRID_ROWS);
    const omegas = new Float64Array(GRID_ROWS);

    for (let row = 0; row < GRID_ROWS; row += 1) {
      omegas[row] = (TAU * freqFromRow(row)) / RENDER_SAMPLE_RATE;
      phases[row] = deterministicPhase(row * 2.173 + 11.7);
    }

    for (let col = 0; col < cols; col += 1) {
      const sampleStart = Math.floor((col / cols) * totalSamples);
      const sampleEnd = Math.floor(((col + 1) / cols) * totalSamples);
      const segmentLength = Math.max(1, sampleEnd - sampleStart);
      const nextCol = Math.min(cols - 1, col + 1);
      const prevCol = Math.max(0, col - 1);
      const nextNextCol = Math.min(cols - 1, col + 2);

      for (let row = 0; row < GRID_ROWS; row += 1) {
        const a0 = (
          columnAmplitude(prevCol, row)
          + columnAmplitude(col, row) * 2
          + columnAmplitude(nextCol, row)
        ) * 0.25;
        const a1 = (
          columnAmplitude(col, row)
          + columnAmplitude(nextCol, row) * 2
          + columnAmplitude(nextNextCol, row)
        ) * 0.25;
        if (a0 < EPSILON && a1 < EPSILON) {
          phases[row] += omegas[row] * segmentLength;
          phases[row] %= TAU;
          continue;
        }
        let phase = phases[row];
        const omega = omegas[row];
        for (let sample = sampleStart; sample < sampleEnd; sample += 1) {
          const localT = (sample - sampleStart) / segmentLength;
          const amplitude = lerp(a0, a1, localT);
          output[sample] += amplitude * Math.sin(phase);
          phase += omega;
        }
        phases[row] = phase % TAU;
      }
    }

    return output;
  }

  function buildGlideTracks(analysis) {
    const cols = analysis.energy.length;
    const freqTrack = new Float64Array(cols);
    const ampTrack = new Float32Array(cols);
    const activeTrack = new Float32Array(cols);

    for (let col = 0; col < cols; col += 1) {
      if (analysis.energy[col] < EPSILON) {
        continue;
      }
      const ridge = Math.max(analysis.ridgeFreq[col], minFrequency());
      const dominant = Math.max(analysis.dominantFreq[col], minFrequency());
      const centroid = Math.max(analysis.centroidFreq[col], minFrequency());
      const confidence = analysis.confidence[col];
      const ridgeMix = 0.78 + 0.18 * confidence;
      const centerFreq = Math.exp(
        lerp(
          Math.log(ridge),
          lerp(Math.log(dominant), Math.log(centroid), 0.18),
          1 - ridgeMix
        )
      );
      freqTrack[col] = centerFreq;
      ampTrack[col] = Math.pow(Math.max(analysis.ridgeAmp[col], analysis.energy[col] * 0.32), 0.52) * (0.72 + 0.28 * confidence);
      activeTrack[col] = 1;
    }

    function interpolateGaps(track, isLogarithmic) {
      let left = -1;
      for (let col = 0; col < cols; col += 1) {
        if (track[col] > 0) {
          if (left >= 0 && col - left > 1) {
            const start = track[left];
            const end = track[col];
            for (let gapCol = left + 1; gapCol < col; gapCol += 1) {
              const t = (gapCol - left) / (col - left);
              track[gapCol] = isLogarithmic
                ? Math.exp(lerp(Math.log(start), Math.log(end), t))
                : lerp(start, end, t);
            }
          }
          left = col;
        }
      }
    }

    function smoothTrack(track, weights, isLogarithmic) {
      const output = new Float64Array(cols);
      const radius = Math.floor(weights.length / 2);
      for (let col = 0; col < cols; col += 1) {
        let weightSum = 0;
        let valueSum = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sampleCol = clamp(col + offset, 0, cols - 1);
          const value = track[sampleCol];
          if (value <= 0) {
            continue;
          }
          const weight = weights[offset + radius];
          weightSum += weight;
          valueSum += (isLogarithmic ? Math.log(value) : value) * weight;
        }
        output[col] = weightSum > 0
          ? (isLogarithmic ? Math.exp(valueSum / weightSum) : valueSum / weightSum)
          : 0;
      }
      return output;
    }

    interpolateGaps(freqTrack, true);
    interpolateGaps(ampTrack, false);

    const freqWeights = [0.03, 0.06, 0.11, 0.17, 0.22, 0.17, 0.11, 0.06, 0.03];
    const ampWeights = [0.04, 0.08, 0.14, 0.2, 0.24, 0.2, 0.14, 0.08, 0.04];
    const activeWeights = [0.05, 0.12, 0.2, 0.26, 0.32, 0.26, 0.2, 0.12, 0.05];
    const smoothedFreq = smoothTrack(freqTrack, freqWeights, true);
    const smoothedAmp = smoothTrack(ampTrack, ampWeights, false);
    const smoothedActive = smoothTrack(activeTrack, activeWeights, false);

    let firstActiveCol = -1;
    let lastActiveCol = -1;
    for (let col = 0; col < cols; col += 1) {
      if (activeTrack[col] > 0) {
        if (firstActiveCol < 0) {
          firstActiveCol = col;
        }
        lastActiveCol = col;
      }
    }

    let maxAmp = 0;
    for (let col = 0; col < cols; col += 1) {
      maxAmp = Math.max(maxAmp, smoothedAmp[col]);
    }

    const normalizedAmp = new Float32Array(cols);
    const gatedFreq = new Float64Array(cols);
    if (maxAmp > 0) {
      for (let col = 0; col < cols; col += 1) {
        const insideSupport = firstActiveCol >= 0 && col >= firstActiveCol && col <= lastActiveCol;
        const activeLevel = smoothedActive[col];
        if (!insideSupport || activeLevel < 0.18) {
          normalizedAmp[col] = 0;
          gatedFreq[col] = 0;
          continue;
        }
        const normalized = smoothedAmp[col] / maxAmp;
        normalizedAmp[col] = normalized > 0.035 ? (0.88 + 0.12 * normalized) * clamp(activeLevel, 0, 1) : 0;
        gatedFreq[col] = smoothedFreq[col];
      }
    }

    return { freqTrack: gatedFreq, ampTrack: normalizedAmp };
  }

  function buildGlideAudioData(analysis) {
    const cols = trackColCount();
    const totalSamples = Math.max(1, Math.floor(durationSeconds() * RENDER_SAMPLE_RATE));
    const output = new Float32Array(totalSamples);
    const tracks = buildGlideTracks(analysis);
    let phase = 0;
    let lastFreq = 440;

    for (let col = 0; col < cols; col += 1) {
      const sampleStart = Math.floor((col / cols) * totalSamples);
      const sampleEnd = Math.floor(((col + 1) / cols) * totalSamples);
      const segmentLength = Math.max(1, sampleEnd - sampleStart);
      const nextCol = Math.min(cols - 1, col + 1);
      const freq0 = tracks.freqTrack[col] > 0 ? tracks.freqTrack[col] : lastFreq;
      const freq1 = tracks.freqTrack[nextCol] > 0 ? tracks.freqTrack[nextCol] : freq0;
      const amp0 = tracks.ampTrack[col];
      const amp1 = tracks.ampTrack[nextCol];
      const logFreq0 = Math.log(Math.max(freq0, minFrequency()));
      const logFreq1 = Math.log(Math.max(freq1, minFrequency()));

      for (let sample = sampleStart; sample < sampleEnd; sample += 1) {
        const localT = (sample - sampleStart) / segmentLength;
        const freq = Math.exp(lerp(logFreq0, logFreq1, localT));
        const amp = lerp(amp0, amp1, localT);
        phase += (TAU * freq) / RENDER_SAMPLE_RATE;
        output[sample] += amp * Math.sin(phase);
      }

      lastFreq = freq1;
    }

    return output;
  }

  function smoothstep01(t) {
    const clamped = clamp(t, 0, 1);
    return clamped * clamped * (3 - 2 * clamped);
  }

  function safeLogFreq(freq) {
    return Math.log(Math.max(freq, minFrequency()));
  }

  function trackLocalValue(trackArray, col) {
    return trackArray[clamp(col, 0, trackArray.length - 1)] || 0;
  }

  function deterministicPhase(seed) {
    return (((Math.sin(seed * 12.9898 + 78.233) * 43758.5453123) % 1 + 1) % 1) * TAU;
  }

  function estimateLocalBandwidth(col, centerRow) {
    const radius = 10;
    let weightSum = 0;
    let distanceSum = 0;
    for (let row = Math.max(0, centerRow - radius); row <= Math.min(GRID_ROWS - 1, centerRow + radius); row += 1) {
      const amp = columnAmplitude(col, row);
      if (amp < EPSILON) {
        continue;
      }
      const weight = Math.pow(amp, 1.15);
      weightSum += weight;
      distanceSum += weight * Math.abs(row - centerRow);
    }
    return weightSum > 0 ? distanceSum / weightSum : 0;
  }

  function estimateTrackMedianFreq(track) {
    const values = [];
    for (let col = track.firstCol; col <= track.lastCol; col += 1) {
      if (track.activeTrack[col] > 0.1 && track.freqTrack[col] > 0) {
        values.push(track.freqTrack[col]);
      }
    }
    if (!values.length) {
      return 220;
    }
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }

  function detectPhaseResetColumns(track) {
    const cols = track.freqTrack.length;
    const phaseResetMask = new Uint8Array(cols);
    const phaseResetCols = [];
    let lastResetCol = -8;
    if (track.firstCol >= 0) {
      phaseResetMask[track.firstCol] = 1;
      phaseResetCols.push(track.firstCol);
      lastResetCol = track.firstCol;
    }
    for (let col = track.firstCol + 1; col <= track.lastCol; col += 1) {
      if (track.activeTrack[col] < 0.1) {
        continue;
      }
      const amp = track.ampTrack[col];
      const prevAmp = trackLocalValue(track.ampTrack, col - 1);
      const rise = prevAmp > EPSILON ? (amp - prevAmp) / Math.max(prevAmp, 0.001) : amp > 0.06 ? 1 : 0;
      const onset = trackLocalValue(track.activeTrack, col - 1) < 0.1 ? 1 : 0;
      if (track.transientTrack[col] > 0.6 && (rise > 0.18 || onset > 0.5) && col - lastResetCol > 2) {
        phaseResetMask[col] = 1;
        phaseResetCols.push(col);
        lastResetCol = col;
      }
    }
    return { phaseResetCols, phaseResetMask };
  }

  function assignHarmonicGroups(tracks) {
    if (tracks.length < 2) {
      for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].harmonicGroupId = i;
      }
      return;
    }

    const parent = tracks.map((_, index) => index);
    const harmonicNumbers = tracks.map(() => 1);

    function find(index) {
      if (parent[index] !== index) {
        parent[index] = find(parent[index]);
      }
      return parent[index];
    }

    function union(a, b) {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) {
        parent[rootB] = rootA;
      }
    }

    const candidateRatios = [0.25, 1 / 3, 0.5, 2, 3, 4];
    for (let i = 0; i < tracks.length; i += 1) {
      for (let j = i + 1; j < tracks.length; j += 1) {
        const overlapStart = Math.max(tracks[i].firstCol, tracks[j].firstCol);
        const overlapEnd = Math.min(tracks[i].lastCol, tracks[j].lastCol);
        const overlap = overlapEnd - overlapStart + 1;
        if (overlap <= 6) {
          continue;
        }
        const minSpan = Math.min(
          tracks[i].lastCol - tracks[i].firstCol + 1,
          tracks[j].lastCol - tracks[j].firstCol + 1
        );
        if (overlap / Math.max(1, minSpan) < 0.32) {
          continue;
        }
        const ratio = estimateTrackMedianFreq(tracks[j]) / Math.max(estimateTrackMedianFreq(tracks[i]), minFrequency());
        let bestRatio = 0;
        let bestDistance = Infinity;
        for (const candidate of candidateRatios) {
          const distance = Math.abs(ratio - candidate) / candidate;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestRatio = candidate;
          }
        }
        if (bestDistance < 0.06) {
          union(i, j);
          harmonicNumbers[i] = 1;
          harmonicNumbers[j] = bestRatio >= 1 ? Math.round(bestRatio) : 1 / bestRatio;
        }
      }
    }

    const groupMap = new Map();
    let nextGroupId = 0;
    for (let i = 0; i < tracks.length; i += 1) {
      const root = find(i);
      if (!groupMap.has(root)) {
        groupMap.set(root, nextGroupId);
        nextGroupId += 1;
      }
      const groupId = groupMap.get(root);
      tracks[i].harmonicGroupId = groupId;
      const basePhase = deterministicPhase(700 + groupId * 19.17);
      const harmonicNumber = harmonicNumbers[i] || 1;
      const phaseOffset = deterministicPhase(tracks[i].id * 0.37 + harmonicNumber * 0.19) * 0.08;
      tracks[i].initialPhase = (basePhase * harmonicNumber + phaseOffset) % TAU;
    }
  }

  function extractDrawVoiceTracks(analysis) {
    const cols = trackColCount();
    const maxPeaksPerColumn = 4;
    const peakColumns = new Array(cols);
    const sparseTracks = [];

    function smoothDenseTrack(track, weights, isLogarithmic, fallbackValue = 0) {
      const output = new Float64Array(cols);
      const radius = Math.floor(weights.length / 2);
      for (let col = 0; col < cols; col += 1) {
        let weightSum = 0;
        let valueSum = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sampleCol = clamp(col + offset, 0, cols - 1);
          const value = track[sampleCol];
          if (value <= 0) {
            continue;
          }
          const weight = weights[offset + radius];
          weightSum += weight;
          valueSum += (isLogarithmic ? safeLogFreq(value) : value) * weight;
        }
        output[col] = weightSum > 0
          ? (isLogarithmic ? Math.exp(valueSum / weightSum) : valueSum / weightSum)
          : fallbackValue;
      }
      return output;
    }

    for (let col = 0; col < cols; col += 1) {
      const peaks = [];
      let columnPeak = 0;
      for (let row = 0; row < GRID_ROWS; row += 1) {
        columnPeak = Math.max(columnPeak, columnAmplitude(col, row));
      }
      const peakThreshold = Math.max(columnPeak * 0.17, 0.02);
      for (let row = 1; row < GRID_ROWS - 1; row += 1) {
        const center = columnAmplitude(col, row);
        if (center < peakThreshold) {
          continue;
        }
        if (center >= columnAmplitude(col, row - 1) && center >= columnAmplitude(col, row + 1)) {
          let weightSum = 0;
          let logFreqSum = 0;
          let ampSum = 0;
          for (let sampleRow = Math.max(0, row - 1); sampleRow <= Math.min(GRID_ROWS - 1, row + 1); sampleRow += 1) {
            const amp = columnAmplitude(col, sampleRow);
            if (amp < EPSILON) {
              continue;
            }
            const weight = Math.pow(amp, 1.7);
            weightSum += weight;
            logFreqSum += safeLogFreq(freqFromRow(sampleRow)) * weight;
            ampSum += amp;
          }
          peaks.push({
            freq: weightSum > 0 ? Math.exp(logFreqSum / weightSum) : freqFromRow(row),
            row,
            amp: Math.pow(Math.max(center, ampSum), 0.7)
          });
          row += 1;
        }
      }
      peaks.sort((a, b) => b.amp - a.amp);
      peakColumns[col] = peaks.slice(0, maxPeaksPerColumn);
    }

    let activeTrackIds = [];
    for (let col = 0; col < cols; col += 1) {
      const peaks = peakColumns[col];
      activeTrackIds = activeTrackIds.filter((trackId) => col - sparseTracks[trackId].lastCol <= 2);
      const usedTracks = new Set();
      for (const peak of peaks) {
        let bestTrackId = -1;
        let bestScore = Infinity;
        for (const trackId of activeTrackIds) {
          if (usedTracks.has(trackId)) {
            continue;
          }
          const track = sparseTracks[trackId];
          const gap = col - track.lastCol;
          const octaveDistance = Math.abs(safeLogFreq(peak.freq) - safeLogFreq(track.lastFreq)) / Math.log(2);
          const rowDistance = Math.abs(peak.row - track.lastRow);
          const maxOctaveDistance = gap === 1 ? 0.22 : 0.16;
          if (octaveDistance > maxOctaveDistance || rowDistance > 12 + gap * 4) {
            continue;
          }
          const score = octaveDistance * 1.3 + rowDistance * 0.012 + gap * 0.08;
          if (score < bestScore) {
            bestScore = score;
            bestTrackId = trackId;
          }
        }
        if (bestTrackId >= 0) {
          const track = sparseTracks[bestTrackId];
          track.points.push({ col, freq: peak.freq, amp: peak.amp, row: peak.row });
          track.lastCol = col;
          track.lastFreq = peak.freq;
          track.lastRow = peak.row;
          track.totalAmp += peak.amp;
          usedTracks.add(bestTrackId);
        } else if (peak.amp > 0.05) {
          sparseTracks.push({
            points: [{ col, freq: peak.freq, amp: peak.amp, row: peak.row }],
            firstCol: col,
            lastCol: col,
            lastFreq: peak.freq,
            lastRow: peak.row,
            totalAmp: peak.amp
          });
          usedTracks.add(sparseTracks.length - 1);
        }
      }
      activeTrackIds = Array.from(new Set([
        ...activeTrackIds.filter((trackId) => col - sparseTracks[trackId].lastCol <= 2),
        ...usedTracks
      ]));
    }

    const viableTracks = sparseTracks.filter((track) => track.points.length >= 2 && track.totalAmp > 0.22);
    const denseTracks = [];
    for (let index = 0; index < viableTracks.length; index += 1) {
      const track = viableTracks[index];
      const freqTrack = new Float64Array(cols);
      const ampTrack = new Float32Array(cols);
      const activeTrack = new Float32Array(cols);
      for (const point of track.points) {
        freqTrack[point.col] = point.freq;
        ampTrack[point.col] = point.amp;
        activeTrack[point.col] = 1;
      }
      for (let i = 0; i < track.points.length - 1; i += 1) {
        const current = track.points[i];
        const next = track.points[i + 1];
        const gap = next.col - current.col;
        if (gap <= 1 || gap > 3) {
          continue;
        }
        for (let gapCol = current.col + 1; gapCol < next.col; gapCol += 1) {
          const t = (gapCol - current.col) / gap;
          freqTrack[gapCol] = Math.exp(lerp(safeLogFreq(current.freq), safeLogFreq(next.freq), t));
          ampTrack[gapCol] = lerp(current.amp, next.amp, t);
          activeTrack[gapCol] = 1;
        }
      }

      const smoothedFreq = smoothDenseTrack(freqTrack, [0.05, 0.1, 0.16, 0.22, 0.26, 0.22, 0.16, 0.1, 0.05], true, 0);
      const smoothedAmp = smoothDenseTrack(ampTrack, [0.07, 0.13, 0.19, 0.24, 0.28, 0.24, 0.19, 0.13, 0.07], false, 0);
      const coherenceTrack = new Float32Array(cols);
      const noisinessTrack = new Float32Array(cols);
      const transientTrack = new Float32Array(cols);

      for (let col = track.firstCol; col <= track.lastCol; col += 1) {
        if (activeTrack[col] < 0.1 || smoothedFreq[col] <= 0) {
          continue;
        }
        const row = rowFromFreq(smoothedFreq[col]);
        const bandwidth = estimateLocalBandwidth(col, row);
        const confidence = analysis.confidence[col];
        const ridgeCompetition = Math.max(0, analysis.ridgeCount[col] - 1);
        const prevActive = trackLocalValue(activeTrack, col - 1) > 0.1;
        const nextActive = trackLocalValue(activeTrack, col + 1) > 0.1;
        const continuity = prevActive && nextActive ? 1 : prevActive || nextActive ? 0.68 : 0.32;
        const prevFreq = trackLocalValue(smoothedFreq, col - 1) > 0 ? trackLocalValue(smoothedFreq, col - 1) : smoothedFreq[col];
        const nextFreq = trackLocalValue(smoothedFreq, col + 1) > 0 ? trackLocalValue(smoothedFreq, col + 1) : smoothedFreq[col];
        const prevSlope = safeLogFreq(smoothedFreq[col]) - safeLogFreq(prevFreq);
        const nextSlope = safeLogFreq(nextFreq) - safeLogFreq(smoothedFreq[col]);
        const slopeSmoothness = clamp(1 - Math.abs(nextSlope - prevSlope) / 0.12, 0, 1);
        const bandwidthTightness = clamp(1 - bandwidth / 5.5, 0, 1);
        const coherence = clamp(
          (0.34 * confidence + 0.26 * bandwidthTightness + 0.2 * continuity + 0.2 * slopeSmoothness)
            * clamp(1 - ridgeCompetition * 0.22, 0.25, 1),
          0,
          1
        );
        const noisiness = clamp(
          (1 - confidence) * 0.35
            + clamp(bandwidth / 6.5, 0, 1) * 0.35
            + ridgeCompetition * 0.18
            + (1 - continuity) * 0.12,
          0,
          1
        );
        const prevAmp = trackLocalValue(smoothedAmp, col - 1);
        const ampRise = prevAmp > EPSILON ? (smoothedAmp[col] - prevAmp) / Math.max(prevAmp, 0.001) : smoothedAmp[col] > 0.06 ? 1 : 0;
        const onset = prevActive ? 0 : 1;
        const transient = clamp(
          Math.max(0, ampRise) * 0.55 + onset * 0.4 + clamp(bandwidth / 5, 0, 1) * 0.18,
          0,
          1
        );

        coherenceTrack[col] = coherence;
        noisinessTrack[col] = noisiness;
        transientTrack[col] = transient;
      }

      const denseTrack = {
        id: index,
        firstCol: track.firstCol,
        lastCol: track.lastCol,
        freqTrack: smoothedFreq,
        ampTrack: smoothedAmp,
        activeTrack,
        coherenceTrack,
        noisinessTrack,
        transientTrack,
        phaseResetCols: [],
        phaseResetMask: new Uint8Array(cols),
        harmonicGroupId: -1,
        initialPhase: deterministicPhase(
          track.firstCol * 0.73
            + track.lastCol * 1.91
            + estimateTrackMedianFreq({
              firstCol: track.firstCol,
              lastCol: track.lastCol,
              freqTrack: smoothedFreq,
              ampTrack: smoothedAmp,
              activeTrack
            }) * 0.017
        )
      };
      const resetInfo = detectPhaseResetColumns(denseTrack);
      denseTrack.phaseResetCols = resetInfo.phaseResetCols;
      denseTrack.phaseResetMask = resetInfo.phaseResetMask;
      denseTracks.push(denseTrack);
    }

    assignHarmonicGroups(denseTracks);
    return denseTracks;
  }

  // Phase is not painted per pixel. It is inferred from geometry: continuous ridges become
  // coherent oscillators, fuzzy residual energy gets phase diffusion, and sharp vertical
  // onsets reset phase.
  function buildDrawVoiceAudioData(analysis, totalSamples, tracks = extractDrawVoiceTracks(analysis), options = {}) {
    const cols = trackColCount();
    const window = makeRenderWindow(totalSamples, options);
    const columnWindow = sampleRangeToColumnRange(totalSamples, window.rangeStartSample, window.rangeEndSample, 3);

    if (!tracks.length) {
      return window.output;
    }

    const resetRampSamples = Math.max(16, Math.floor(RENDER_SAMPLE_RATE * 0.0025));
    const transientDecaySamples = Math.max(24, Math.floor(RENDER_SAMPLE_RATE * 0.01));

    for (const track of tracks) {
      if (track.lastCol < columnWindow.startCol || track.firstCol > columnWindow.endCol) {
        continue;
      }
      let phase1 = track.initialPhase;
      let phase2 = (track.initialPhase * 2) % TAU;
      let phase3 = (track.initialPhase * 3) % TAU;
      let lastFreq = track.freqTrack[track.firstCol] > 0 ? track.freqTrack[track.firstCol] : 220;
      let smoothedFreq = lastFreq;

      for (let col = track.firstCol; col <= Math.min(track.lastCol, columnWindow.endCol); col += 1) {
        const sampleStart = Math.floor((col / cols) * totalSamples);
        const sampleEnd = Math.floor(((col + 1) / cols) * totalSamples);
        const segmentLength = Math.max(1, sampleEnd - sampleStart);
        const nextCol = Math.min(cols - 1, col + 1);
        const amp0 = track.ampTrack[col];
        const amp1 = track.ampTrack[nextCol];
        if (amp0 < EPSILON && amp1 < EPSILON) {
          continue;
        }

        const freq0 = track.freqTrack[col] > 0 ? track.freqTrack[col] : lastFreq;
        const freq1 = track.freqTrack[nextCol] > 0 ? track.freqTrack[nextCol] : freq0;
        const logFreq0 = safeLogFreq(freq0);
        const logFreq1 = safeLogFreq(freq1);
        const resetHere = track.phaseResetMask[col] > 0;

        let oldPhase1 = phase1;
        let oldPhase2 = phase2;
        let oldPhase3 = phase3;
        let newPhase1 = resetHere ? track.initialPhase : phase1;
        let newPhase2 = resetHere ? (track.initialPhase * 2) % TAU : phase2;
        let newPhase3 = resetHere ? (track.initialPhase * 3) % TAU : phase3;
        const resetRamp = resetHere ? Math.min(resetRampSamples, segmentLength) : 0;

        for (let sample = sampleStart; sample < sampleEnd; sample += 1) {
          const segmentOffset = sample - sampleStart;
          const localT = smoothstep01(segmentOffset / segmentLength);
          const targetFreq = Math.exp(lerp(logFreq0, logFreq1, localT));
          const coherence = lerp(track.coherenceTrack[col], track.coherenceTrack[nextCol], localT);
          const noisiness = lerp(track.noisinessTrack[col], track.noisinessTrack[nextCol], localT);
          const transient = lerp(track.transientTrack[col], track.transientTrack[nextCol], localT);
          const smoothing = lerp(0.08, 0.22, coherence);
          smoothedFreq += (targetFreq - smoothedFreq) * smoothing;

          const diffusion = 0.006 * noisiness * (1 - coherence)
            * deterministicNoise(sample * 0.91 + track.id * 17.11 + col * 0.13);
          const baseIncrement = (TAU * smoothedFreq) / RENDER_SAMPLE_RATE;
          const phaseIncrement = baseIncrement + diffusion;
          const harmonic2Increment = baseIncrement * 2 + diffusion * 1.2;
          const harmonic3Increment = baseIncrement * 3 + diffusion * 1.35;

          oldPhase1 += phaseIncrement;
          oldPhase2 += harmonic2Increment;
          oldPhase3 += harmonic3Increment;
          newPhase1 += phaseIncrement;
          newPhase2 += harmonic2Increment;
          newPhase3 += harmonic3Increment;

          const amp = Math.pow(lerp(amp0, amp1, localT), 1.02) * (0.94 + 0.08 * coherence);
          const transientShape = 1 + transient * 0.18 * Math.exp(-segmentOffset / transientDecaySamples);
          const harmonic2Gain = 0.045 + transient * 0.06 * Math.exp(-segmentOffset / transientDecaySamples);
          const harmonic3Gain = 0.015 + transient * 0.03 * Math.exp(-segmentOffset / transientDecaySamples);

          const coherentBody = Math.sin(newPhase1) * 0.94
            + Math.sin(newPhase2) * harmonic2Gain
            + Math.sin(newPhase3) * harmonic3Gain;

          if (resetRamp > 0 && segmentOffset < resetRamp) {
            const blend = smoothstep01(segmentOffset / Math.max(1, resetRamp - 1));
            const oldBody = Math.sin(oldPhase1) * 0.94
              + Math.sin(oldPhase2) * harmonic2Gain
              + Math.sin(oldPhase3) * harmonic3Gain;
            const body = lerp(oldBody, coherentBody, blend);
            writeRenderSample(window, sample, amp * transientShape * Math.tanh(body * 1.16));
          } else {
            writeRenderSample(window, sample, amp * transientShape * Math.tanh(coherentBody * 1.16));
          }
        }

        phase1 = newPhase1;
        phase2 = newPhase2;
        phase3 = newPhase3;
        lastFreq = freq1;
      }
    }

    return window.output;
  }

  function buildDrawResidualAudioData(analysis, totalSamples, tracks, options = {}) {
    const cols = trackColCount();
    const window = makeRenderWindow(totalSamples, options);
    const output = window.output;
    const phases = new Float64Array(GRID_ROWS);
    const omegas = new Float64Array(GRID_ROWS);
    const columnWindow = sampleRangeToColumnRange(totalSamples, window.rangeStartSample, window.rangeEndSample, 4);
    const renderStartCol = window.partial ? columnWindow.startCol : 0;
    const renderEndCol = window.partial ? columnWindow.endCol : cols - 1;
    const localStartSample = Math.floor((renderStartCol / cols) * totalSamples);

    for (let row = 0; row < GRID_ROWS; row += 1) {
      omegas[row] = (TAU * freqFromRow(row)) / RENDER_SAMPLE_RATE;
      phases[row] = deterministicPhase(row * 1.618) + omegas[row] * localStartSample;
    }

    function residualProfile(col, row) {
      const base = columnAmplitude(col, row);
      if (base < EPSILON) {
        return { amp: 0, diffuseness: 0, stability: 0 };
      }

      let attenuation = 1;
      let coherenceShield = 0;
      for (const track of tracks) {
        if (col < track.firstCol || col > track.lastCol) {
          continue;
        }
        const trackAmp = track.ampTrack[col];
        const trackFreq = track.freqTrack[col];
        const trackCoherence = track.coherenceTrack[col];
        if (trackAmp < 0.02 || trackFreq <= 0) {
          continue;
        }
        const centerRow = rowFromFreq(trackFreq);
        const rowDistance = Math.abs(row - centerRow);
        let proximity = 0;
        if (rowDistance <= 1) {
          attenuation *= 0.03;
          proximity = 1;
        } else if (rowDistance <= 3) {
          attenuation *= 0.16;
          proximity = 0.72;
        } else if (rowDistance <= 5) {
          attenuation *= 0.42;
          proximity = 0.36;
        }
        coherenceShield = Math.max(coherenceShield, trackCoherence * proximity);
      }

      const diffuseBase = clamp(
        (1 - analysis.confidence[col]) * 1.05
          + Math.max(0, analysis.ridgeCount[col] - 1) * 0.12
          + estimateLocalBandwidth(col, row) / 10 * 0.18,
        0,
        0.95
      );
      const diffuseness = clamp(diffuseBase * (1 - coherenceShield * 0.72), 0, 1);
      const amp = Math.pow(base, 1.08) * attenuation * diffuseBase;
      return { amp, diffuseness, stability: coherenceShield };
    }

    for (let col = renderStartCol; col <= renderEndCol; col += 1) {
      const sampleStart = Math.floor((col / cols) * totalSamples);
      const sampleEnd = Math.floor(((col + 1) / cols) * totalSamples);
      const segmentLength = Math.max(1, sampleEnd - sampleStart);
      const nextCol = Math.min(cols - 1, col + 1);

      for (let row = 0; row < GRID_ROWS; row += 1) {
        const profile0 = residualProfile(col, row);
        const profile1 = residualProfile(nextCol, row);
        if (profile0.amp < EPSILON && profile1.amp < EPSILON) {
          phases[row] += omegas[row] * segmentLength;
          phases[row] %= TAU;
          continue;
        }
        let phase = phases[row];
        const baseOmega = omegas[row];
        const rowDetune = 1 + 0.0009 * (1 - analysis.confidence[col])
          * deterministicNoise(row * 31.7 + col * 0.73);
        const omega = baseOmega * rowDetune;
        for (let sample = sampleStart; sample < sampleEnd; sample += 1) {
          const localT = (sample - sampleStart) / segmentLength;
          const amplitude = lerp(profile0.amp, profile1.amp, localT);
          const diffuseness = lerp(profile0.diffuseness, profile1.diffuseness, localT);
          const stability = lerp(profile0.stability, profile1.stability, localT);
          const phaseDiffusion = 0.012 * diffuseness * (1 - stability)
            * deterministicNoise(sample * 0.77 + row * 13.3 + col * 0.41);
          writeRenderSample(window, sample, amplitude * Math.sin(phase));
          phase += omega + phaseDiffusion;
        }
        phases[row] = phase % TAU;
      }
    }

    return output;
  }

  function buildInstrumentTrackAudioData(analysis, totalSamples, tracks, instrument, options = {}) {
    const cols = trackColCount();
    const window = makeRenderWindow(totalSamples, options);
    const output = window.output;
    const columnWindow = sampleRangeToColumnRange(totalSamples, window.rangeStartSample, window.rangeEndSample, 3);
    const isGuitar = instrument === "guitar";
    const isPiano = instrument === "piano";
    const pluckPosControl = clamp(guitarPluckPosition(), 0.08, 0.45);
    const bodyResonanceControl = clamp(guitarBodyResonance(), 0, 1);
    const hammerHardness = clamp(pianoHammerHardness(), 0, 1);
    const stringCoupling = clamp(pianoStringCoupling(), 0, 1);
    const partialCount = isGuitar ? 6 : 8;
    const guitarBodyModes = [
      { freq: 110, decay: 10.5, gain: 0.17 },
      { freq: 205, decay: 12.4, gain: 0.12 },
      { freq: 415, decay: 15.8, gain: 0.08 },
      { freq: 640, decay: 19.6, gain: 0.05 }
    ];
    const pianoBodyModes = [
      { freq: 92, decay: 8.8, gain: 0.12 },
      { freq: 184, decay: 10.3, gain: 0.09 },
      { freq: 368, decay: 12.8, gain: 0.07 },
      { freq: 734, decay: 16.4, gain: 0.045 },
      { freq: 1180, decay: 19.5, gain: 0.028 }
    ];
    const bodyModes = isGuitar ? guitarBodyModes : pianoBodyModes;

    for (const track of tracks) {
      if (track.lastCol < columnWindow.startCol || track.firstCol > columnWindow.endCol) {
        continue;
      }
      const medianFreq = estimateTrackMedianFreq(track);
      const stringCount = isPiano
        ? (medianFreq < 280 ? 3 : medianFreq < 900 ? 2 : 1)
        : 1;
      const stringDetunes = isPiano
        ? [-5.5, 0, 4.4].slice(0, stringCount).map((cents) => Math.pow(2, (cents * (0.35 + stringCoupling * 0.95)) / 1200) - 1)
        : [0];
      const partialPhases = Array.from({ length: stringCount }, () => new Float64Array(partialCount));
      const bodyPhases = new Float64Array(bodyModes.length);
      let lastFreq = track.freqTrack[track.firstCol] > 0 ? track.freqTrack[track.firstCol] : medianFreq;
      let smoothedFreq = lastFreq;
      let onsetAgeSamples = Math.max(1, Math.floor(RENDER_SAMPLE_RATE * 0.02));
      let noiseMemory = 0;
      const pluckPos = isGuitar
        ? clamp(pluckPosControl + deterministicNoise(track.id * 5.17 + medianFreq * 0.0004) * 0.018, 0.08, 0.45)
        : 0.18;

      function resetInstrumentPhases(col) {
        const onsetSeed = track.id * 29.7 + col * 0.83 + (isGuitar ? 11.9 : 23.4);
        for (let stringIndex = 0; stringIndex < stringCount; stringIndex += 1) {
          const offset = deterministicPhase(onsetSeed + stringIndex * 0.37) * (isPiano ? 0.11 : 0.05);
          const basePhase = (track.initialPhase + offset) % TAU;
          for (let harmonic = 0; harmonic < partialCount; harmonic += 1) {
            partialPhases[stringIndex][harmonic] = (basePhase * (harmonic + 1)) % TAU;
          }
        }
        for (let modeIndex = 0; modeIndex < bodyModes.length; modeIndex += 1) {
          bodyPhases[modeIndex] = deterministicPhase(onsetSeed * 0.41 + modeIndex * 2.17);
        }
        onsetAgeSamples = 0;
      }

      resetInstrumentPhases(track.firstCol);

      for (let col = track.firstCol; col <= Math.min(track.lastCol, columnWindow.endCol); col += 1) {
        const sampleStart = Math.floor((col / cols) * totalSamples);
        const sampleEnd = Math.floor(((col + 1) / cols) * totalSamples);
        const segmentLength = Math.max(1, sampleEnd - sampleStart);
        const nextCol = Math.min(cols - 1, col + 1);
        const amp0 = track.ampTrack[col];
        const amp1 = track.ampTrack[nextCol];
        const resetHere = col === track.firstCol || track.phaseResetMask[col] > 0;
        if (resetHere) {
          resetInstrumentPhases(col);
        }
        if (amp0 < EPSILON && amp1 < EPSILON) {
          continue;
        }

        const freq0 = track.freqTrack[col] > 0 ? track.freqTrack[col] : lastFreq;
        const freq1 = track.freqTrack[nextCol] > 0 ? track.freqTrack[nextCol] : freq0;
        const logFreq0 = safeLogFreq(freq0);
        const logFreq1 = safeLogFreq(freq1);

        for (let sample = sampleStart; sample < sampleEnd; sample += 1) {
          const localT = smoothstep01((sample - sampleStart) / segmentLength);
          const targetFreq = Math.exp(lerp(logFreq0, logFreq1, localT));
          const coherence = lerp(track.coherenceTrack[col], track.coherenceTrack[nextCol], localT);
          const noisiness = lerp(track.noisinessTrack[col], track.noisinessTrack[nextCol], localT);
          const transient = lerp(track.transientTrack[col], track.transientTrack[nextCol], localT);
          const smoothing = isGuitar
            ? lerp(0.07, 0.18, coherence)
            : lerp(0.06, 0.14, coherence);
          smoothedFreq += (targetFreq - smoothedFreq) * smoothing;

          const amplitude = Math.pow(lerp(amp0, amp1, localT), 1.01) * (0.9 + 0.1 * coherence);
          const onsetAge = onsetAgeSamples / RENDER_SAMPLE_RATE;
          const attackSeconds = isGuitar ? 0.0024 : lerp(0.0065, 0.0018, hammerHardness);
          const attackEnv = onsetAge < attackSeconds ? onsetAge / Math.max(0.0005, attackSeconds) : 1;
          const highFreqFactor = clamp(smoothedFreq / 1200, 0, 1);
          const bodyDecayRate = isGuitar ? lerp(1.1, 2.4, highFreqFactor) : lerp(0.38, 1.1, highFreqFactor);
          const brightnessDecayRate = isGuitar ? lerp(6.4, 10.6, highFreqFactor) : lerp(5.3, 8.9, highFreqFactor);
          const bodyDecay = Math.exp(-onsetAge * bodyDecayRate);
          const brightnessDecay = Math.exp(-onsetAge * brightnessDecayRate);
          const transientShape = 1 + transient * (isGuitar ? 0.16 : 0.22) * Math.exp(-onsetAge * 42);

          const noise = deterministicNoise((sample + 1) * (isGuitar ? 2.31 : 1.73) + track.id * 7.3);
          noiseMemory = isGuitar
            ? noiseMemory * 0.52 + noise * 0.48
            : noiseMemory * 0.68 + noise * 0.32;
          const attackNoise = (noise - noiseMemory) * Math.exp(-onsetAge * (isGuitar ? 52 : lerp(140, 72, hammerHardness)));
          let stringBody = 0;
          let stringWeight = 0;

          for (let stringIndex = 0; stringIndex < stringCount; stringIndex += 1) {
            const detune = stringDetunes[stringIndex] || 0;
            const stringFreq = smoothedFreq * (1 + detune);
            const stiffness = isGuitar
              ? 0.00008 + 0.00018 * highFreqFactor + (1 - coherence) * 0.00008
              : 0.00022 + 0.00042 * highFreqFactor;
            let localStringBody = 0;
            for (let harmonic = 1; harmonic <= partialCount; harmonic += 1) {
              const harmonicIndex = harmonic - 1;
              const inharmonicMultiple = harmonic * Math.sqrt(1 + stiffness * harmonic * harmonic);
              partialPhases[stringIndex][harmonicIndex] += (TAU * stringFreq * inharmonicMultiple) / RENDER_SAMPLE_RATE;
              const phase = partialPhases[stringIndex][harmonicIndex];
              let partialWeight;
              if (isGuitar) {
                const pluckNotch = Math.pow(Math.abs(Math.sin(Math.PI * harmonic * pluckPos)), 1.7);
                const spectralTilt = 1 / Math.pow(harmonic, 1.28);
                const harmonicDecay = Math.exp(-onsetAge * (0.42 + harmonic * 0.72));
                partialWeight = pluckNotch * spectralTilt * (0.28 + 0.72 * harmonicDecay);
              } else {
                const hammerPeak = lerp(2.2, 6.0, hammerHardness);
                const hammerSlope = lerp(1.18, 0.72, hammerHardness);
                const hammerColor = (1 / Math.pow(harmonic, hammerSlope)) * (1 + 0.38 * Math.exp(-Math.pow((harmonic - hammerPeak) / 1.8, 2)));
                const partialDecay = Math.exp(-onsetAge * (0.08 + harmonic * 0.2));
                partialWeight = hammerColor * (0.24 + 0.76 * partialDecay);
              }
              localStringBody += Math.sin(phase) * partialWeight;
            }
            stringBody += localStringBody;
            stringWeight += 1;
          }

          if (stringWeight > 0) {
            stringBody /= stringWeight;
          }

          let bodyResonance = 0;
          for (let modeIndex = 0; modeIndex < bodyModes.length; modeIndex += 1) {
            const mode = bodyModes[modeIndex];
            bodyPhases[modeIndex] += (TAU * mode.freq) / RENDER_SAMPLE_RATE;
            const bodyScale = isGuitar
              ? lerp(0.22, 1.35, bodyResonanceControl)
              : lerp(0.16, 1.05, stringCoupling);
            bodyResonance += Math.sin(bodyPhases[modeIndex]) * mode.gain * bodyScale * Math.exp(-onsetAge * mode.decay);
          }

          const instrumentBody = isGuitar
            ? Math.tanh(stringBody * 1.08) * (0.84 + 0.12 * brightnessDecay)
              + bodyResonance * (0.6 + 0.16 * transient)
              + attackNoise * (0.1 + 0.06 * transient)
            : Math.tanh(stringBody * 1.42)
              + bodyResonance * (0.34 + 0.12 * transient)
              + attackNoise * (0.03 + 0.08 * transient + hammerHardness * 0.02);
          const envelope = amplitude * attackEnv * (0.18 + 0.82 * bodyDecay) * (0.86 + 0.14 * (1 - noisiness));
          writeRenderSample(window, sample, envelope * transientShape * instrumentBody);
          onsetAgeSamples += 1;
        }

        lastFreq = freq1;
      }
    }

    return output;
  }

  function deterministicNoise(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
    return (x - Math.floor(x)) * 2 - 1;
  }

  function clearSampleRange(output, startSample, endSample) {
    output.fill(0, clamp(startSample, 0, output.length), clamp(endSample, 0, output.length));
  }

  function bassEventEndTime(event) {
    if (event.type === "kick") {
      return event.time + 0.44;
    }
    if (event.type === "snare") {
      return event.time + 0.24;
    }
    if (event.type === "hat") {
      return event.time + 0.11;
    }
    if (event.type === "bass") {
      return event.time + Math.max(0.05, event.duration);
    }
    return event.time;
  }

  function buildBassEventAudioData(totalSamples, options = {}) {
    const output = options.targetOutput || new Float32Array(totalSamples);
    const writeStartSample = clamp(options.rangeStartSample ?? 0, 0, totalSamples);
    const writeEndSample = clamp(options.rangeEndSample ?? totalSamples, writeStartSample, totalSamples);
    if (options.targetOutput) {
      clearSampleRange(output, writeStartSample, writeEndSample);
    }

    function sampleIndexAt(seconds) {
      return clamp(Math.floor(seconds * RENDER_SAMPLE_RATE), 0, Math.max(0, totalSamples - 1));
    }

    for (const event of state.bassEvents) {
      const startSample = sampleIndexAt(event.time);
      const eventEndSample = clamp(Math.ceil(bassEventEndTime(event) * RENDER_SAMPLE_RATE), startSample, totalSamples);
      if (eventEndSample <= writeStartSample || startSample >= writeEndSample) {
        continue;
      }

      if (event.type === "kick") {
        const duration = 0.44;
        const sampleLength = Math.min(totalSamples - startSample, Math.ceil(duration * RENDER_SAMPLE_RATE));
        let phase = 0;
        let clickMemory = 0;
        for (let i = 0; i < sampleLength; i += 1) {
          const time = i / RENDER_SAMPLE_RATE;
          const sweep = Math.exp(lerp(Math.log(event.freq * 3.9), Math.log(event.freq * 0.92), clamp(time / duration, 0, 1)));
          phase += (TAU * sweep) / RENDER_SAMPLE_RATE;
          const bodyEnv = Math.exp(-time * 7.8);
          const clickEnv = Math.exp(-time * 72);
          const clickNoise = deterministicNoise((startSample + i) * 1.37);
          clickMemory = clickMemory * 0.18 + clickNoise * 0.82;
          const body = Math.sin(phase) * 0.9 + Math.sin(phase * 2) * 0.08;
          const click = (clickNoise - clickMemory) * clickEnv * 0.12;
          const outputIndex = startSample + i;
          if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
            output[outputIndex] += event.gain * (body * bodyEnv + click);
          }
        }
        continue;
      }

      if (event.type === "snare") {
        const duration = 0.24;
        const sampleLength = Math.min(totalSamples - startSample, Math.ceil(duration * RENDER_SAMPLE_RATE));
        let phaseA = 0;
        let phaseB = 0;
        let noiseMemory = 0;
        for (let i = 0; i < sampleLength; i += 1) {
          const time = i / RENDER_SAMPLE_RATE;
          const noiseEnv = Math.exp(-time * 24);
          const toneEnv = Math.exp(-time * 13);
          const rawNoise = deterministicNoise((startSample + i) * 2.17);
          noiseMemory = noiseMemory * 0.62 + rawNoise * 0.38;
          const crispNoise = rawNoise - noiseMemory;
          phaseA += (TAU * 196) / RENDER_SAMPLE_RATE;
          phaseB += (TAU * 318) / RENDER_SAMPLE_RATE;
          const body = Math.sin(phaseA) * 0.2 + Math.sin(phaseB) * 0.11;
          const outputIndex = startSample + i;
          if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
            output[outputIndex] += event.gain * (crispNoise * noiseEnv * 0.68 + body * toneEnv);
          }
        }
        continue;
      }

      if (event.type === "hat") {
        const duration = 0.11;
        const sampleLength = Math.min(totalSamples - startSample, Math.ceil(duration * RENDER_SAMPLE_RATE));
        const phases = [0, 0, 0];
        const partials = [4300, 6200, 8100];
        let noiseMemory = 0;
        for (let i = 0; i < sampleLength; i += 1) {
          const time = i / RENDER_SAMPLE_RATE;
          const env = Math.exp(-time * 36);
          const rawNoise = deterministicNoise((startSample + i) * 3.01);
          noiseMemory = noiseMemory * 0.35 + rawNoise * 0.65;
          const brightNoise = rawNoise - noiseMemory;
          let metallic = 0;
          for (let j = 0; j < partials.length; j += 1) {
            phases[j] += (TAU * partials[j]) / RENDER_SAMPLE_RATE;
            metallic += Math.sin(phases[j]) * (j === 0 ? 0.22 : 0.16);
          }
          const outputIndex = startSample + i;
          if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
            output[outputIndex] += event.gain * env * (brightNoise * 0.46 + metallic);
          }
        }
        continue;
      }

      if (event.type === "bass") {
        const duration = Math.max(0.05, event.duration);
        const sampleLength = Math.min(totalSamples - startSample, Math.ceil(duration * RENDER_SAMPLE_RATE));
        let phaseSub = 0;
        let phaseSaw = 0;
        let phaseUpper = 0;
        for (let i = 0; i < sampleLength; i += 1) {
          const time = i / RENDER_SAMPLE_RATE;
          const noteT = sampleLength > 1 ? i / (sampleLength - 1) : 0;
          const currentFreq = Math.exp(lerp(Math.log(event.startFreq), Math.log(event.endFreq), Math.pow(noteT, 0.72)));
          phaseSub += (TAU * currentFreq) / RENDER_SAMPLE_RATE;
          phaseSaw += (TAU * currentFreq * 2) / RENDER_SAMPLE_RATE;
          phaseUpper += (TAU * currentFreq * 3.02) / RENDER_SAMPLE_RATE;

          const attack = Math.min(0.012, duration * 0.18);
          const attackEnv = attack > 0 && time < attack ? time / attack : 1;
          const sustainEnv = 0.94 - noteT * 0.22;
          const releaseEnv = releaseEnvelope(time, duration, Math.min(0.14, duration * 0.28));
          const env = attackEnv * sustainEnv * releaseEnv;
          const sub = Math.sin(phaseSub) * 0.82;
          const sawish = Math.sin(phaseSaw) * 0.28 + Math.sin(phaseUpper) * 0.14;
          const bite = Math.tanh(sub * 1.55 + sawish * 1.4);
          const transient = Math.exp(-time * 65) * Math.sin(phaseSaw * 0.5) * 0.09;
          const outputIndex = startSample + i;
          if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
            output[outputIndex] += event.gain * env * (sub + sawish * 0.65 + bite * 0.32 + transient);
          }
        }
      }
    }

    return output;
  }

  async function ensureSmplrModuleLoaded() {
    if (smplrModuleState.module) {
      return smplrModuleState.module;
    }
    if (smplrModuleState.loadingPromise) {
      return smplrModuleState.loadingPromise;
    }
    smplrModuleState.loadingPromise = import(SMPLR_MODULE_URL)
      .then((module) => {
        smplrModuleState.module = module;
        smplrModuleState.loadingPromise = null;
        return module;
      })
      .catch((error) => {
        smplrModuleState.loadingPromise = null;
        throw error;
      });
    return smplrModuleState.loadingPromise;
  }

  function getOfflineAudioContextClass() {
    return window.OfflineAudioContext || window.webkitOfflineAudioContext || null;
  }

  function createSmplrOfflineScheduler(module, context, renderDurationSec) {
    const lookaheadMs = Math.max(1000, Math.ceil((renderDurationSec + 1) * 1000));
    return new module.Scheduler(context, {
      lookaheadMs,
      intervalMs: lookaheadMs
    });
  }

  async function createSmplrInstrumentForContext(module, context, backend, options = {}) {
    return createSmplrInstrumentInstance(module, context, backend, options).load;
  }

  function createSmplrInstrumentInstance(module, context, backend, options = {}) {
    const definition = SMPLR_NOTE_BACKENDS[backend];
    if (!definition) {
      throw new Error(`Unknown smplr note backend: ${backend}`);
    }
    const sharedOptions = {
      scheduler: options.scheduler || void 0,
      loader: options.loader || void 0,
      destination: options.destination || void 0,
      scheduleLookaheadMs: options.scheduleLookaheadMs || void 0,
      scheduleIntervalMs: options.scheduleIntervalMs || void 0,
      onLoadProgress: options.onLoadProgress || void 0,
      onStart: options.onStart || void 0
    };
    if (definition.kind === "splendid-piano") {
      return module.SplendidGrandPiano(context, {
        volume: 112,
        ...sharedOptions
      });
    }
    if (definition.kind === "soundfont") {
      return module.Soundfont(context, {
        instrument: definition.instrument,
        kit: definition.kit,
        loadLoopData: Boolean(definition.loadLoopData),
        volume: 108,
        ...sharedOptions
      });
    }
    throw new Error(`Unsupported smplr backend kind: ${definition.kind}`);
  }

  function ensureSmplrSharedLoader(module) {
    if (smplrLoaderState.loader && smplrLoaderState.module === module) {
      return smplrLoaderState.loader;
    }
    smplrLoaderState.loader = new module.SampleLoader(createAudioContext());
    smplrLoaderState.module = module;
    return smplrLoaderState.loader;
  }

  async function renderSmplrScoreEvents(totalSamples, backend, options = {}) {
    const writeStartSample = clamp(options.rangeStartSample ?? 0, 0, totalSamples);
    const writeEndSample = clamp(options.rangeEndSample ?? totalSamples, writeStartSample, totalSamples);
    const writeStartSec = writeStartSample / RENDER_SAMPLE_RATE;
    const writeEndSec = writeEndSample / RENDER_SAMPLE_RATE;
    const tailSeconds = SMPLR_RENDER_TAIL_SECONDS;
    const prerollSeconds = SMPLR_RENDER_PREROLL_SECONDS;
    const stitchedSamples = new Float32Array(writeEndSample - writeStartSample);
    const relevantNotes = state.scoreEvents.filter((note) => {
      const noteStart = note.startSec;
      const noteEnd = note.startSec + Math.max(0.02, note.durationSec) + tailSeconds;
      return noteEnd > writeStartSec && noteStart < writeEndSec;
    });
    if (!relevantNotes.length) {
      return {
        samples: stitchedSamples,
        startSample: writeStartSample
      };
    }
    const smplr = await ensureSmplrModuleLoaded();
    const loader = ensureSmplrSharedLoader(smplr);
    const totalSpanSec = Math.max(0.001, writeEndSec - writeStartSec);
    const windowCount = Math.max(1, Math.ceil(totalSpanSec / SMPLR_RENDER_WINDOW_SECONDS));

    for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
      const mainStartSec = writeStartSec + windowIndex * SMPLR_RENDER_WINDOW_SECONDS;
      const mainEndSec = Math.min(writeEndSec, mainStartSec + SMPLR_RENDER_WINDOW_SECONDS);
      const renderStartSec = Math.max(0, mainStartSec - prerollSeconds);
      const renderEndSec = Math.min(durationSeconds(), mainEndSec + tailSeconds);
      const renderDurationSec = Math.max(0.05, renderEndSec - renderStartSec);
      const windowNotes = relevantNotes.filter((note) => {
        const noteStart = note.startSec;
        const noteEnd = note.startSec + Math.max(0.02, note.durationSec) + tailSeconds;
        return noteEnd > renderStartSec && noteStart < renderEndSec;
      });

      if (windowNotes.length) {
        const renderedResult = await smplr.renderOffline(async (context) => {
          // smplr instruments queue note starts through a scheduler. During
          // OfflineAudioContext setup, currentTime does not advance yet, so the
          // scheduler must see the whole render window up front or only the earliest
          // note attacks will get dispatched.
          const scheduler = createSmplrOfflineScheduler(smplr, context, renderDurationSec);
          const instrument = await createSmplrInstrumentForContext(smplr, context, backend, { scheduler, loader });
          for (let i = 0; i < windowNotes.length; i += 1) {
            const note = windowNotes[i];
            const velocity = clamp(Math.round((note.velocity || 0.78) * 127), 1, 127);
            instrument.start({
              note: note.midi,
              velocity,
              time: Math.max(0, note.startSec - renderStartSec),
              duration: Math.max(0.02, note.durationSec)
            });
          }
        }, {
          duration: renderDurationSec,
          sampleRate: RENDER_SAMPLE_RATE,
          channels: 1
        });

        const channelData = renderedResult.audioBuffer.getChannelData(0);
        const targetStart = clamp(Math.floor(mainStartSec * RENDER_SAMPLE_RATE) - writeStartSample, 0, stitchedSamples.length);
        const targetEnd = clamp(Math.ceil(mainEndSec * RENDER_SAMPLE_RATE) - writeStartSample, targetStart, stitchedSamples.length);
        const sourceStart = Math.max(0, Math.floor((mainStartSec - renderStartSec) * RENDER_SAMPLE_RATE));
        const copyLength = targetEnd - targetStart;
        for (let i = 0; i < copyLength; i += 1) {
          const sourceIndex = sourceStart + i;
          if (sourceIndex >= channelData.length) {
            break;
          }
          stitchedSamples[targetStart + i] = channelData[sourceIndex];
        }
      }

      options.onProgress?.(
        (windowIndex + 1) / windowCount,
        `Rendering sampled notes window ${windowIndex + 1}/${windowCount}`,
        `${Math.round(((windowIndex + 1) / windowCount) * 100)}%`
      );
    }
    return {
      samples: stitchedSamples,
      startSample: writeStartSample
    };
  }

  function addGeometryScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample = 0, writeEndSample = output.length) {
    let phase1 = deterministicPhase(note.midi * 0.37 + note.startSec * 1.9);
    const duration = Math.max(0.02, note.durationSec);
    const releaseSeconds = Math.min(0.14, duration * 0.2);
    const attackSeconds = 0.004;
    const gain = 0.22 + velocity * 0.78;

    for (let i = 0; i < sampleLength; i += 1) {
      const time = i / RENDER_SAMPLE_RATE;
      phase1 += (TAU * freq) / RENDER_SAMPLE_RATE;

      const attackEnv = time < attackSeconds ? time / Math.max(0.0005, attackSeconds) : 1;
      const releaseEnv = releaseEnvelope(time, duration, releaseSeconds);
      const env = attackEnv * releaseEnv * gain;
      const body = Math.sin(phase1);
      const outputIndex = startSample + i;
      if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
        output[outputIndex] += env * body;
      }
    }
  }

  function addIndependentScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample = 0, writeEndSample = output.length) {
    let phase1 = deterministicPhase(note.midi * 1.11 + note.startSec * 2.7);
    let phase2 = deterministicPhase(note.midi * 1.47 + note.startSec * 1.9);
    let phase3 = deterministicPhase(note.midi * 1.93 + note.startSec * 1.3);
    let phase4 = deterministicPhase(note.midi * 2.39 + note.startSec * 0.9);
    const duration = Math.max(0.02, note.durationSec);
    const releaseSeconds = Math.min(0.12, duration * 0.22);
    const attackSeconds = 0.003;
    const gain = 0.2 + velocity * 0.8;

    for (let i = 0; i < sampleLength; i += 1) {
      const time = i / RENDER_SAMPLE_RATE;
      phase1 += (TAU * freq) / RENDER_SAMPLE_RATE;
      phase2 += (TAU * freq * 1.997) / RENDER_SAMPLE_RATE;
      phase3 += (TAU * freq * 2.99) / RENDER_SAMPLE_RATE;
      phase4 += (TAU * freq * 4.03) / RENDER_SAMPLE_RATE;

      const attackEnv = time < attackSeconds ? time / Math.max(0.0005, attackSeconds) : 1;
      const releaseEnv = releaseEnvelope(time, duration, releaseSeconds);
      const env = attackEnv * releaseEnv * gain;
      const body = Math.sin(phase1) * 0.72 + Math.sin(phase2) * 0.18 + Math.sin(phase3) * 0.08 + Math.sin(phase4) * 0.04;
      const outputIndex = startSample + i;
      if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
        output[outputIndex] += env * body;
      }
    }
  }

  function addSpectralScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample = 0, writeEndSample = output.length) {
    const harmonicCount = 8;
    const phases = new Float64Array(harmonicCount);
    const detunes = new Float64Array(harmonicCount);
    const duration = Math.max(0.02, note.durationSec);
    const releaseSeconds = Math.min(0.18, duration * 0.26);
    const attackSeconds = 0.0035;
    const gain = 0.24 + velocity * 0.76;

    for (let harmonic = 0; harmonic < harmonicCount; harmonic += 1) {
      phases[harmonic] = deterministicPhase(note.midi * (harmonic + 1) * 0.61 + note.startSec * 7.3 + harmonic * 11.1);
      detunes[harmonic] = 1 + deterministicNoise(note.midi * 3.1 + harmonic * 17.3) * 0.0025;
    }

    for (let i = 0; i < sampleLength; i += 1) {
      const time = i / RENDER_SAMPLE_RATE;
      const attackEnv = time < attackSeconds ? time / Math.max(0.0005, attackSeconds) : 1;
      const releaseEnv = releaseEnvelope(time, duration, releaseSeconds);
      const env = attackEnv * releaseEnv * gain;
      let body = 0;
      for (let harmonic = 0; harmonic < harmonicCount; harmonic += 1) {
        const n = harmonic + 1;
        const drift = 1 + deterministicNoise((startSample + i) * 0.013 + harmonic * 29.7 + note.midi) * 0.0009;
        phases[harmonic] += (TAU * freq * n * detunes[harmonic] * drift) / RENDER_SAMPLE_RATE;
        body += Math.sin(phases[harmonic]) / Math.pow(n, 0.86);
      }
      const outputIndex = startSample + i;
      if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
        output[outputIndex] += env * body * 0.78;
      }
    }
  }

  function addGriffinScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample = 0, writeEndSample = output.length) {
    const harmonicCount = 10;
    const phases = new Float64Array(harmonicCount);
    const detunes = new Float64Array(harmonicCount);
    let noiseMemory = 0;
    const duration = Math.max(0.02, note.durationSec);
    const releaseSeconds = Math.min(0.18, duration * 0.28);
    const attackSeconds = 0.003;
    const gain = 0.28 + velocity * 0.72;

    for (let harmonic = 0; harmonic < harmonicCount; harmonic += 1) {
      phases[harmonic] = deterministicPhase(note.midi * (harmonic + 1) * 0.83 + note.startSec * 9.1 + harmonic * 5.3);
      detunes[harmonic] = 1 + deterministicNoise(note.midi * 7.9 + harmonic * 19.7) * (0.004 + harmonic * 0.0007);
    }

    for (let i = 0; i < sampleLength; i += 1) {
      const time = i / RENDER_SAMPLE_RATE;
      const attackEnv = time < attackSeconds ? time / Math.max(0.0005, attackSeconds) : 1;
      const releaseEnv = releaseEnvelope(time, duration, releaseSeconds);
      let body = 0;
      for (let harmonic = 0; harmonic < harmonicCount; harmonic += 1) {
        const n = harmonic + 1;
        const phaseDrift = deterministicNoise((startSample + i) * 0.021 + harmonic * 37.1 + note.midi * 0.5) * 0.0018;
        phases[harmonic] += (TAU * freq * n * detunes[harmonic]) / RENDER_SAMPLE_RATE + phaseDrift;
        body += Math.sin(phases[harmonic]) / Math.pow(n, 0.74);
      }
      const rawNoise = deterministicNoise((startSample + i) * 0.91 + note.midi * 3.7);
      noiseMemory = noiseMemory * 0.78 + rawNoise * 0.22;
      const airy = (rawNoise - noiseMemory) * Math.exp(-time * 26) * 0.045;
      const outputIndex = startSample + i;
      if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
        output[outputIndex] += attackEnv * releaseEnv * gain * (body * 0.64 + airy);
      }
    }
  }

  function addHybridScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample = 0, writeEndSample = output.length) {
    const harmonicCount = 7;
    const coherentPhases = new Float64Array(harmonicCount);
    const smearedPhases = new Float64Array(harmonicCount);
    const duration = Math.max(0.02, note.durationSec);
    const releaseSeconds = Math.min(0.16, duration * 0.24);
    const attackSeconds = 0.0035;
    const gain = 0.24 + velocity * 0.76;

    for (let harmonic = 0; harmonic < harmonicCount; harmonic += 1) {
      coherentPhases[harmonic] = deterministicPhase(note.midi * (harmonic + 1) * 0.43 + note.startSec * 2.7);
      smearedPhases[harmonic] = deterministicPhase(note.midi * (harmonic + 1) * 1.37 + note.startSec * 8.9 + harmonic * 3.1);
    }

    for (let i = 0; i < sampleLength; i += 1) {
      const time = i / RENDER_SAMPLE_RATE;
      const attackEnv = time < attackSeconds ? time / Math.max(0.0005, attackSeconds) : 1;
      const releaseEnv = releaseEnvelope(time, duration, releaseSeconds);
      const env = attackEnv * releaseEnv * gain;
      let coherent = 0;
      let smeared = 0;
      for (let harmonic = 0; harmonic < harmonicCount; harmonic += 1) {
        const n = harmonic + 1;
        coherentPhases[harmonic] += (TAU * freq * n) / RENDER_SAMPLE_RATE;
        smearedPhases[harmonic] += (TAU * freq * n * (1 + harmonic * 0.0018)) / RENDER_SAMPLE_RATE
          + deterministicNoise((startSample + i) * 0.015 + harmonic * 17.9 + note.midi) * 0.001;
        coherent += Math.sin(coherentPhases[harmonic]) / Math.pow(n, 0.98);
        smeared += Math.sin(smearedPhases[harmonic]) / Math.pow(n, 0.78);
      }
      const outputIndex = startSample + i;
      if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
        output[outputIndex] += env * (coherent * 0.52 + smeared * 0.36);
      }
    }
  }

  function addPianoScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample = 0, writeEndSample = output.length) {
    const duration = Math.max(0.02, note.durationSec);
    const hammerHardness = DEFAULT_PIANO_HAMMER_HARDNESS;
    const stringCoupling = DEFAULT_PIANO_STRING_COUPLING;
    const partialCount = 8;
    const stringCount = freq < 280 ? 3 : freq < 900 ? 2 : 1;
    const stringDetunes = [-5.5, 0, 4.4].slice(0, stringCount).map((cents) => Math.pow(2, (cents * (0.35 + stringCoupling * 0.95)) / 1200) - 1);
    const partialPhases = Array.from({ length: stringCount }, () => new Float64Array(partialCount));
    const bodyModes = [
      { freq: 92, decay: 8.8, gain: 0.12 },
      { freq: 184, decay: 10.3, gain: 0.09 },
      { freq: 368, decay: 12.8, gain: 0.07 },
      { freq: 734, decay: 16.4, gain: 0.045 },
      { freq: 1180, decay: 19.5, gain: 0.028 }
    ];
    const bodyPhases = new Float64Array(bodyModes.length);
    let noiseMemory = 0;
    for (let stringIndex = 0; stringIndex < stringCount; stringIndex += 1) {
      const offset = deterministicPhase(note.midi * 0.7 + note.startSec * 3.1 + stringIndex * 0.37) * 0.11;
      const basePhase = deterministicPhase(note.midi * 0.37 + note.startSec * 1.9 + 23.4 + stringIndex) + offset;
      for (let harmonic = 0; harmonic < partialCount; harmonic += 1) {
        partialPhases[stringIndex][harmonic] = (basePhase * (harmonic + 1)) % TAU;
      }
    }
    for (let modeIndex = 0; modeIndex < bodyModes.length; modeIndex += 1) {
      bodyPhases[modeIndex] = deterministicPhase(note.midi * 0.19 + note.startSec * 0.41 + modeIndex * 2.17);
    }

    for (let i = 0; i < sampleLength; i += 1) {
      const time = i / RENDER_SAMPLE_RATE;
      const noteT = sampleLength > 1 ? i / (sampleLength - 1) : 0;
      const highFreqFactor = clamp(freq / 1200, 0, 1);
      const attackSeconds = lerp(0.0065, 0.0018, hammerHardness);
      const attackEnv = time < attackSeconds ? time / Math.max(0.0005, attackSeconds) : 1;
      const releaseSeconds = Math.min(0.2, duration * 0.22);
      const releaseStart = Math.max(0, duration - releaseSeconds);
      const releaseEnv = time <= releaseStart ? 1 : 1 - (time - releaseStart) / Math.max(0.0001, duration - releaseStart);
      const bodyDecayRate = lerp(0.38, 1.1, highFreqFactor);
      const brightnessDecayRate = lerp(5.3, 8.9, highFreqFactor);
      const bodyDecay = Math.exp(-time * bodyDecayRate);
      const brightnessDecay = Math.exp(-time * brightnessDecayRate);

      const rawNoise = deterministicNoise((startSample + i) * 1.73 + note.midi * 0.61);
      noiseMemory = noiseMemory * 0.68 + rawNoise * 0.32;
      const attackNoise = (rawNoise - noiseMemory) * Math.exp(-time * lerp(140, 72, hammerHardness));

      let stringBody = 0;
      for (let stringIndex = 0; stringIndex < stringCount; stringIndex += 1) {
        const detune = stringDetunes[stringIndex] || 0;
        const stringFreq = freq * (1 + detune);
        const stiffness = 0.00022 + 0.00042 * highFreqFactor;
        let localStringBody = 0;
        for (let harmonic = 1; harmonic <= partialCount; harmonic += 1) {
          const harmonicIndex = harmonic - 1;
          const inharmonicMultiple = harmonic * Math.sqrt(1 + stiffness * harmonic * harmonic);
          partialPhases[stringIndex][harmonicIndex] += (TAU * stringFreq * inharmonicMultiple) / RENDER_SAMPLE_RATE;
          const phase = partialPhases[stringIndex][harmonicIndex];
          const hammerPeak = lerp(2.2, 6.0, hammerHardness);
          const hammerSlope = lerp(1.18, 0.72, hammerHardness);
          const hammerColor = (1 / Math.pow(harmonic, hammerSlope)) * (1 + 0.38 * Math.exp(-Math.pow((harmonic - hammerPeak) / 1.8, 2)));
          const partialDecay = Math.exp(-time * (0.08 + harmonic * 0.2));
          localStringBody += Math.sin(phase) * hammerColor * (0.24 + 0.76 * partialDecay);
        }
        stringBody += localStringBody / stringCount;
      }

      let bodyResonance = 0;
      for (let modeIndex = 0; modeIndex < bodyModes.length; modeIndex += 1) {
        const mode = bodyModes[modeIndex];
        bodyPhases[modeIndex] += (TAU * mode.freq) / RENDER_SAMPLE_RATE;
        bodyResonance += Math.sin(bodyPhases[modeIndex]) * mode.gain * lerp(0.16, 1.05, stringCoupling) * Math.exp(-time * mode.decay);
      }

      const instrumentBody = Math.tanh(stringBody * 1.42) + bodyResonance * 0.42 + attackNoise * (0.03 + hammerHardness * 0.1);
      const env = attackEnv * releaseEnv * (0.18 + 0.82 * bodyDecay) * (0.22 + velocity * 0.78) * (0.9 + 0.1 * brightnessDecay);
      const outputIndex = startSample + i;
      if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
        output[outputIndex] += env * instrumentBody;
      }
    }
  }

  function addGuitarScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample = 0, writeEndSample = output.length) {
    const duration = Math.max(0.02, note.durationSec);
    const partialCount = 6;
    const partialPhases = new Float64Array(partialCount);
    const bodyModes = [
      { freq: 110, decay: 10.5, gain: 0.17 },
      { freq: 205, decay: 12.4, gain: 0.12 },
      { freq: 415, decay: 15.8, gain: 0.08 },
      { freq: 640, decay: 19.6, gain: 0.05 }
    ];
    const bodyPhases = new Float64Array(bodyModes.length);
    const highFreqFactor = clamp(freq / 1200, 0, 1);
    const pluckPos = clamp(
      DEFAULT_GUITAR_PLUCK_POSITION + deterministicNoise(note.midi * 5.17 + freq * 0.0004) * 0.018,
      0.08,
      0.45
    );
    let noiseMemory = 0;
    const basePhase = deterministicPhase(note.midi * 0.37 + note.startSec * 1.9 + 11.9);
    for (let harmonic = 0; harmonic < partialCount; harmonic += 1) {
      partialPhases[harmonic] = (basePhase * (harmonic + 1)) % TAU;
    }
    for (let modeIndex = 0; modeIndex < bodyModes.length; modeIndex += 1) {
      bodyPhases[modeIndex] = deterministicPhase(note.midi * 0.43 + note.startSec * 0.41 + modeIndex * 2.17);
    }

    for (let i = 0; i < sampleLength; i += 1) {
      const time = i / RENDER_SAMPLE_RATE;
      const noteT = sampleLength > 1 ? i / (sampleLength - 1) : 0;
      const attackSeconds = 0.0024;
      const attackEnv = time < attackSeconds ? time / Math.max(0.0005, attackSeconds) : 1;
      const releaseSeconds = Math.min(0.12, duration * 0.24);
      const releaseStart = Math.max(0, duration - releaseSeconds);
      const releaseEnv = time <= releaseStart ? 1 : 1 - (time - releaseStart) / Math.max(0.0001, duration - releaseStart);
      const bodyDecayRate = lerp(1.1, 2.4, highFreqFactor);
      const brightnessDecayRate = lerp(6.4, 10.6, highFreqFactor);
      const bodyDecay = Math.exp(-time * bodyDecayRate);
      const brightnessDecay = Math.exp(-time * brightnessDecayRate);
      const rawNoise = deterministicNoise((startSample + i) * 2.31 + note.midi * 0.49);
      noiseMemory = noiseMemory * 0.52 + rawNoise * 0.48;
      const attackNoise = (rawNoise - noiseMemory) * Math.exp(-time * 52);

      const stiffness = 0.00008 + 0.00018 * highFreqFactor;
      let stringBody = 0;
      for (let harmonic = 1; harmonic <= partialCount; harmonic += 1) {
        const harmonicIndex = harmonic - 1;
        const inharmonicMultiple = harmonic * Math.sqrt(1 + stiffness * harmonic * harmonic);
        partialPhases[harmonicIndex] += (TAU * freq * inharmonicMultiple) / RENDER_SAMPLE_RATE;
        const phase = partialPhases[harmonicIndex];
        const pluckNotch = Math.pow(Math.abs(Math.sin(Math.PI * harmonic * pluckPos)), 1.7);
        const spectralTilt = 1 / Math.pow(harmonic, 1.28);
        const harmonicDecay = Math.exp(-time * (0.42 + harmonic * 0.72));
        const partialWeight = pluckNotch * spectralTilt * (0.28 + 0.72 * harmonicDecay);
        stringBody += Math.sin(phase) * partialWeight;
      }

      let bodyResonance = 0;
      for (let modeIndex = 0; modeIndex < bodyModes.length; modeIndex += 1) {
        const mode = bodyModes[modeIndex];
        bodyPhases[modeIndex] += (TAU * mode.freq) / RENDER_SAMPLE_RATE;
        bodyResonance += Math.sin(bodyPhases[modeIndex]) * mode.gain * lerp(0.22, 1.35, DEFAULT_GUITAR_BODY_RESONANCE) * Math.exp(-time * mode.decay);
      }

      const instrumentBody = Math.tanh(stringBody * 1.08) * (0.84 + 0.12 * brightnessDecay) + bodyResonance * 0.68 + attackNoise * 0.16;
      const env = attackEnv * releaseEnv * (0.18 + 0.82 * bodyDecay) * (0.22 + velocity * 0.78) * (0.98 - noteT * 0.12);
      const outputIndex = startSample + i;
      if (outputIndex >= writeStartSample && outputIndex < writeEndSample) {
        output[outputIndex] += env * instrumentBody;
      }
    }
  }

  async function buildScoreEventAudioData(totalSamples, renderMode = state.renderMode, noteBackend = state.noteBackend, options = {}) {
    const output = options.targetOutput || new Float32Array(totalSamples);
    if (!state.scoreEvents.length) {
      if (options.targetOutput) {
        const emptyStart = clamp(options.rangeStartSample ?? 0, 0, totalSamples);
        const emptyEnd = clamp(options.rangeEndSample ?? totalSamples, emptyStart, totalSamples);
      clearSampleRange(output, emptyStart, emptyEnd);
      }
      return output;
    }
    const {
      onProgress,
      progressStart = 0,
      progressEnd = 1,
      rangeStartSample = 0,
      rangeEndSample = totalSamples
    } = options;
    let effectiveNoteBackend = noteBackend;
    state.noteBackendResolved = effectiveNoteBackend;
    state.noteBackendWarning = "";
    if (SMPLR_NOTE_BACKENDS[effectiveNoteBackend]) {
      const backendLabel = noteBackendName(effectiveNoteBackend);
      onProgress?.(progressStart, `Loading ${backendLabel.toLowerCase()}`, "Preparing smplr note backend");
      try {
        await ensureSmplrModuleLoaded();
      } catch (error) {
        effectiveNoteBackend = "procedural";
        state.noteBackendResolved = effectiveNoteBackend;
        state.noteBackendWarning = `${backendLabel} unavailable, so note playback fell back to the procedural backend (${error && error.message ? error.message : String(error)}).`;
        onProgress?.(progressStart, `${backendLabel} unavailable`, "Using procedural note fallback");
      }
    }
    state.noteBackendResolved = effectiveNoteBackend;
    const writeStartSample = clamp(rangeStartSample, 0, totalSamples);
    const writeEndSample = clamp(rangeEndSample, writeStartSample, totalSamples);
    if (options.targetOutput) {
      clearSampleRange(output, writeStartSample, writeEndSample);
    }
    if (SMPLR_NOTE_BACKENDS[effectiveNoteBackend]) {
      try {
        const rendered = await renderSmplrScoreEvents(totalSamples, effectiveNoteBackend, {
          rangeStartSample: writeStartSample,
          rangeEndSample: writeEndSample,
          onProgress: (ratio, detail, progressText) => {
            const mapped = lerp(progressStart, progressEnd, ratio);
            onProgress?.(mapped, detail, progressText || `${Math.round(mapped * 100)}%`);
          }
        });
        if (options.targetOutput) {
          clearSampleRange(output, writeStartSample, writeEndSample);
        }
        output.set(rendered.samples, rendered.startSample);
        state.noteBackendResolved = effectiveNoteBackend;
        return output;
      } catch (error) {
        const failedBackend = effectiveNoteBackend;
        effectiveNoteBackend = "procedural";
        state.noteBackendResolved = effectiveNoteBackend;
        state.noteBackendWarning = `${noteBackendName(failedBackend)} backend failed, so note playback fell back to ${noteBackendName(effectiveNoteBackend).toLowerCase()} (${error && error.message ? error.message : String(error)}).`;
        onProgress?.(progressStart, `${noteBackendName(failedBackend)} failed`, `Falling back to ${noteBackendName(effectiveNoteBackend).toLowerCase()}`);
      }
    }
    const maybeYield = shouldUseCooperativeRender(totalSamples, state.scoreEvents.length)
      ? createRenderYieldController()
      : null;

    function sampleIndexAt(seconds) {
      return clamp(Math.floor(seconds * RENDER_SAMPLE_RATE), 0, Math.max(0, totalSamples - 1));
    }

    for (let noteIndex = 0; noteIndex < state.scoreEvents.length; noteIndex += 1) {
      const note = state.scoreEvents[noteIndex];
      const startSample = sampleIndexAt(note.startSec);
      const duration = Math.max(0.02, note.durationSec);
      const sampleLength = Math.min(totalSamples - startSample, Math.ceil(duration * RENDER_SAMPLE_RATE));
      if (sampleLength <= 0) {
        continue;
      }
      const endSample = clamp(startSample + sampleLength, startSample, totalSamples);
      if (endSample <= writeStartSample || startSample >= writeEndSample) {
        continue;
      }
      const velocity = clamp(note.velocity || 0.78, 0.18, 1);
      const freq = midiToFreq(note.midi);

      try {
        if (effectiveNoteBackend === "procedural") {
          switch (renderMode) {
            case "independent":
              addIndependentScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample, writeEndSample);
              break;
            case "spectral":
              addSpectralScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample, writeEndSample);
              break;
            case "griffin":
              addGriffinScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample, writeEndSample);
              break;
            case "hybrid":
              addHybridScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample, writeEndSample);
              break;
            case "piano":
              addPianoScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample, writeEndSample);
              break;
            case "guitar":
              addGuitarScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample, writeEndSample);
              break;
            case "geometry":
            default:
              addGeometryScoreNote(output, startSample, sampleLength, note, velocity, freq, writeStartSample, writeEndSample);
              break;
          }
        } else {
          throw new Error(`Unsupported note backend "${effectiveNoteBackend}"`);
        }
      } catch (error) {
        throw new Error(
          `Failed to synthesize score note ${noteIndex + 1}/${state.scoreEvents.length} at ${note.startSec.toFixed(2)} s: ${error && error.message ? error.message : String(error)}`
        );
      }

      if (maybeYield && await maybeYield()) {
        const noteFraction = (noteIndex + 1) / Math.max(1, state.scoreEvents.length);
        onProgress?.(
          lerp(progressStart, progressEnd, noteFraction),
          `Synthesizing score notes ${noteIndex + 1}/${state.scoreEvents.length}`,
          `${Math.round(noteFraction * 100)}% of score notes`
        );
      }
    }

    return output;
  }

  function combineDrawLayers(totalSamples, primarySamples, residualSamples, residualGain, options = {}) {
    const targetOutput = options.targetOutput || null;
    const rangeStartSample = clamp(
      Number.isFinite(options.rangeStartSample) ? options.rangeStartSample : 0,
      0,
      totalSamples
    );
    const rangeEndSample = clamp(
      Number.isFinite(options.rangeEndSample) ? options.rangeEndSample : totalSamples,
      rangeStartSample,
      totalSamples
    );

    if (targetOutput) {
      const rangeLength = sampleWindowLength(rangeStartSample, rangeEndSample);
      const partial = new Float32Array(rangeLength);
      for (let i = 0; i < rangeLength; i += 1) {
        partial[i] = primarySamples[i] + residualSamples[i] * residualGain;
      }
      mixPartialRangeIntoTarget(targetOutput, partial, rangeStartSample, rangeEndSample);
      return targetOutput;
    }

    const output = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i += 1) {
      output[i] = primarySamples[i] + residualSamples[i] * residualGain;
    }
    return output;
  }

  function buildPianoLikeAudioData(analysis, totalSamples, tracks = extractDrawVoiceTracks(analysis), options = {}) {
    const pianoVoices = buildInstrumentTrackAudioData(analysis, totalSamples, tracks, "piano", options);
    const residual = buildDrawResidualAudioData(analysis, totalSamples, tracks, options);
    const output = combineDrawLayers(totalSamples, pianoVoices, residual, 0.16, options);
    return {
      samples: output,
      tracks
    };
  }

  function buildGuitarLikeAudioData(analysis, totalSamples, tracks = extractDrawVoiceTracks(analysis), options = {}) {
    const guitarVoices = buildInstrumentTrackAudioData(analysis, totalSamples, tracks, "guitar", options);
    const residual = buildDrawResidualAudioData(analysis, totalSamples, tracks, options);
    const output = combineDrawLayers(totalSamples, guitarVoices, residual, 0.12, options);
    return {
      samples: output,
      tracks
    };
  }

  function buildGeometryCoherenceAudioData(analysis, totalSamples, tracks = extractDrawVoiceTracks(analysis), options = {}) {
    const drawVoices = buildDrawVoiceAudioData(analysis, totalSamples, tracks, options);
    const drawResidual = buildDrawResidualAudioData(analysis, totalSamples, tracks, options);
    const output = combineDrawLayers(totalSamples, drawVoices, drawResidual, 0.82, options);
    return {
      samples: output,
      tracks
    };
  }

  function buildIndependentOscillatorAudioData(analysis, totalSamples, tracks = extractDrawVoiceTracks(analysis), options = {}) {
    const cols = trackColCount();
    const window = makeRenderWindow(totalSamples, options);
    const output = window.output;
    const columnWindow = sampleRangeToColumnRange(totalSamples, window.rangeStartSample, window.rangeEndSample, 3);

    for (const track of tracks) {
      if (track.lastCol < columnWindow.startCol || track.firstCol > columnWindow.endCol) {
        continue;
      }
      let phase1 = deterministicPhase(track.firstCol * 0.71 + track.id * 13.1 + 0.9);
      let phase2 = deterministicPhase(track.firstCol * 0.31 + track.id * 23.7 + 1.7);
      let phase3 = deterministicPhase(track.firstCol * 0.19 + track.id * 31.3 + 2.1);
      let lastFreq = track.freqTrack[track.firstCol] > 0 ? track.freqTrack[track.firstCol] : 220;

      for (let col = track.firstCol; col <= Math.min(track.lastCol, columnWindow.endCol); col += 1) {
        if (track.activeTrack[col] < 0.1) {
          continue;
        }
        const sampleStart = Math.floor((col / cols) * totalSamples);
        const sampleEnd = Math.floor(((col + 1) / cols) * totalSamples);
        const segmentLength = Math.max(1, sampleEnd - sampleStart);
        const nextCol = Math.min(cols - 1, col + 1);
        const amp0 = track.ampTrack[col];
        const amp1 = track.ampTrack[nextCol];
        if (amp0 < EPSILON && amp1 < EPSILON) {
          continue;
        }
        const freq0 = track.freqTrack[col] > 0 ? track.freqTrack[col] : lastFreq;
        const freq1 = track.freqTrack[nextCol] > 0 ? track.freqTrack[nextCol] : freq0;
        const logFreq0 = safeLogFreq(freq0);
        const logFreq1 = safeLogFreq(freq1);

        for (let sample = sampleStart; sample < sampleEnd; sample += 1) {
          const localT = smoothstep01((sample - sampleStart) / segmentLength);
          const freq = Math.exp(lerp(logFreq0, logFreq1, localT));
          const amp = Math.pow(lerp(amp0, amp1, localT), 1.01);
          phase1 += (TAU * freq) / RENDER_SAMPLE_RATE;
          phase2 += (TAU * freq * 2) / RENDER_SAMPLE_RATE;
          phase3 += (TAU * freq * 3) / RENDER_SAMPLE_RATE;
          writeRenderSample(window, sample, amp * (
            Math.sin(phase1) * 0.94
              + Math.sin(phase2) * 0.085
              + Math.sin(phase3) * 0.025
          ));
        }

        lastFreq = freq1;
      }
    }

    const samples = options.targetOutput
      ? mixPartialRangeIntoTarget(options.targetOutput, output, window.rangeStartSample, window.rangeEndSample)
      : output;
    return {
      samples,
      tracks
    };
  }

  async function buildDrawLayerAudioData(analysis, totalSamples, tracks, options = {}) {
    switch (state.renderMode) {
      case "independent":
        options.onStatus?.("Synthesizing independent oscillators");
        return buildIndependentOscillatorAudioData(analysis, totalSamples, tracks, options);
      case "piano":
        options.onStatus?.("Synthesizing piano-like resonances");
        return buildPianoLikeAudioData(analysis, totalSamples, tracks, options);
      case "guitar":
        options.onStatus?.("Synthesizing guitar-like plucks");
        return buildGuitarLikeAudioData(analysis, totalSamples, tracks, options);
      case "spectral":
        options.onStatus?.("Synthesizing spectral bins");
        return buildSpectralBinAudioData(analysis, totalSamples);
      case "griffin":
        options.onStatus?.("Initializing Griffin-Lim");
        return buildGriffinLimAudioData(analysis, totalSamples, {
          tracks,
          onProgress: options.onProgress
        });
      case "hybrid":
        options.onStatus?.("Building hybrid seed");
        return buildHybridAudioData(analysis, totalSamples, tracks, options.onHybridProgress);
      case "geometry":
      default:
        options.onStatus?.("Synthesizing geometry coherence");
        return buildGeometryCoherenceAudioData(analysis, totalSamples, tracks, options);
    }
  }

  function buildSpectralBinAudioData() {
    return {
      samples: buildSpectralAudioData(),
      tracks: []
    };
  }

  let cachedStftPlan = null;

  function getStftPlan() {
    if (cachedStftPlan) {
      return cachedStftPlan;
    }

    const size = STFT_SIZE;
    const window = new Float32Array(size);
    for (let i = 0; i < size; i += 1) {
      window[i] = 0.5 - 0.5 * Math.cos((TAU * i) / (size - 1));
    }

    const bitReverse = new Uint16Array(size);
    const bits = Math.round(Math.log2(size));
    for (let i = 0; i < size; i += 1) {
      let reversed = 0;
      let value = i;
      for (let bit = 0; bit < bits; bit += 1) {
        reversed = (reversed << 1) | (value & 1);
        value >>= 1;
      }
      bitReverse[i] = reversed;
    }

    cachedStftPlan = {
      size,
      hop: STFT_HOP,
      halfBins: size / 2 + 1,
      window,
      bitReverse
    };
    return cachedStftPlan;
  }

  function fftTransform(real, imag, inverse, bitReverse) {
    const size = real.length;
    for (let i = 0; i < size; i += 1) {
      const j = bitReverse[i];
      if (j > i) {
        const tmpReal = real[i];
        const tmpImag = imag[i];
        real[i] = real[j];
        imag[i] = imag[j];
        real[j] = tmpReal;
        imag[j] = tmpImag;
      }
    }

    for (let step = 2; step <= size; step <<= 1) {
      const halfStep = step >> 1;
      const angle = (inverse ? TAU : -TAU) / step;
      const wMulReal = Math.cos(angle);
      const wMulImag = Math.sin(angle);
      for (let start = 0; start < size; start += step) {
        let wReal = 1;
        let wImag = 0;
        for (let offset = 0; offset < halfStep; offset += 1) {
          const evenIndex = start + offset;
          const oddIndex = evenIndex + halfStep;
          const oddReal = real[oddIndex] * wReal - imag[oddIndex] * wImag;
          const oddImag = real[oddIndex] * wImag + imag[oddIndex] * wReal;
          const evenReal = real[evenIndex];
          const evenImag = imag[evenIndex];
          real[evenIndex] = evenReal + oddReal;
          imag[evenIndex] = evenImag + oddImag;
          real[oddIndex] = evenReal - oddReal;
          imag[oddIndex] = evenImag - oddImag;
          const nextWReal = wReal * wMulReal - wImag * wMulImag;
          const nextWImag = wReal * wMulImag + wImag * wMulReal;
          wReal = nextWReal;
          wImag = nextWImag;
        }
      }
    }

    if (inverse) {
      for (let i = 0; i < size; i += 1) {
        real[i] /= size;
        imag[i] /= size;
      }
    }
  }

  function stftFrameCount(totalSamples, plan = getStftPlan()) {
    return Math.max(1, Math.ceil(Math.max(0, totalSamples - plan.size) / plan.hop) + 1);
  }

  function forwardStft(samples, totalSamples = samples.length, plan = getStftPlan()) {
    const frameCount = stftFrameCount(totalSamples, plan);
    const realFrames = new Array(frameCount);
    const imagFrames = new Array(frameCount);

    for (let frame = 0; frame < frameCount; frame += 1) {
      const startSample = frame * plan.hop;
      const real = new Float64Array(plan.size);
      const imag = new Float64Array(plan.size);
      for (let i = 0; i < plan.size; i += 1) {
        const sampleIndex = startSample + i;
        real[i] = sampleIndex < samples.length ? samples[sampleIndex] * plan.window[i] : 0;
      }
      fftTransform(real, imag, false, plan.bitReverse);
      const positiveReal = new Float32Array(plan.halfBins);
      const positiveImag = new Float32Array(plan.halfBins);
      for (let bin = 0; bin < plan.halfBins; bin += 1) {
        positiveReal[bin] = real[bin];
        positiveImag[bin] = imag[bin];
      }
      realFrames[frame] = positiveReal;
      imagFrames[frame] = positiveImag;
    }

    return {
      frameCount,
      realFrames,
      imagFrames
    };
  }

  function inverseStft(realFrames, imagFrames, totalSamples, plan = getStftPlan()) {
    const outputLength = totalSamples + plan.size;
    const output = new Float32Array(outputLength);
    const weight = new Float32Array(outputLength);

    for (let frame = 0; frame < realFrames.length; frame += 1) {
      const startSample = frame * plan.hop;
      const real = new Float64Array(plan.size);
      const imag = new Float64Array(plan.size);
      for (let bin = 0; bin < plan.halfBins; bin += 1) {
        real[bin] = realFrames[frame][bin];
        imag[bin] = imagFrames[frame][bin];
      }
      for (let bin = 1; bin < plan.halfBins - 1; bin += 1) {
        const mirror = plan.size - bin;
        real[mirror] = realFrames[frame][bin];
        imag[mirror] = -imagFrames[frame][bin];
      }
      fftTransform(real, imag, true, plan.bitReverse);
      for (let i = 0; i < plan.size; i += 1) {
        const sampleIndex = startSample + i;
        if (sampleIndex >= output.length) {
          break;
        }
        const windowed = real[i] * plan.window[i];
        output[sampleIndex] += windowed;
        weight[sampleIndex] += plan.window[i] * plan.window[i];
      }
    }

    const trimmed = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i += 1) {
      trimmed[i] = weight[i] > EPSILON ? output[i] / weight[i] : 0;
    }
    return trimmed;
  }

  function fractionalRowFromFreq(freq) {
    const minFreq = minFrequency();
    const maxFreq = Math.max(minFreq + 1, maxFrequency());
    return rowForFrequencyInRange(freq, minFreq, maxFreq, frequencyAxisMode());
  }

  function setFrequencyAxisMode(nextMode) {
    const normalized = nextMode === "linear" ? "linear" : "log";
    const previous = frequencyAxisMode();
    if (normalized === previous) {
      return;
    }
    const minFreq = effectiveMinFrequency();
    const maxFreq = effectiveMaxFrequency();
    const drawSnapshot = drawData.slice();
    const basslineSnapshot = basslineData.slice();
    remapLayerFrequencyRange(drawSnapshot, drawData, minFreq, maxFreq, minFreq, maxFreq, previous, normalized);
    remapLayerFrequencyRange(basslineSnapshot, basslineData, minFreq, maxFreq, minFreq, maxFreq, previous, normalized);
    state.frequencyAxis = normalized;
    state.frequencyZoomReference = null;
  }

  function drawAmplitudeAtFractional(colF, rowF) {
    const maxCol = Math.max(0, trackColCount() - 1);
    const clampedCol = clamp(colF, 0, maxCol);
    const clampedRow = clamp(rowF, 0, GRID_ROWS - 1);
    const col0 = Math.floor(clampedCol);
    const col1 = Math.min(maxCol, col0 + 1);
    const row0 = Math.floor(clampedRow);
    const row1 = Math.min(GRID_ROWS - 1, row0 + 1);
    const tx = clampedCol - col0;
    const ty = clampedRow - row0;
    const v00 = amplitudeAt(drawData, col0, row0);
    const v10 = amplitudeAt(drawData, col1, row0);
    const v01 = amplitudeAt(drawData, col0, row1);
    const v11 = amplitudeAt(drawData, col1, row1);
    const top = lerp(v00, v10, tx);
    const bottom = lerp(v01, v11, tx);
    const value = lerp(top, bottom, ty);
    const tilt = 0.75 + 0.25 * (1 - clampedRow / (GRID_ROWS - 1));
    return Math.pow(value, 1.45) * tilt;
  }

  function buildTargetMagnitudeSpectrogram(totalSamples, plan = getStftPlan()) {
    const frameCount = stftFrameCount(totalSamples, plan);
    const magnitudes = new Array(frameCount);
    const totalCols = Math.max(1, trackColCount() - 1);
    const totalSampleSpan = Math.max(1, totalSamples - 1);

    for (let frame = 0; frame < frameCount; frame += 1) {
      const frameCenterSample = Math.min(totalSampleSpan, frame * plan.hop + plan.size * 0.5);
      const colF = (frameCenterSample / totalSampleSpan) * totalCols;
      const frameMagnitude = new Float32Array(plan.halfBins);
      for (let bin = 1; bin < plan.halfBins; bin += 1) {
        const freq = (bin * RENDER_SAMPLE_RATE) / plan.size;
        if (freq < minFrequency() || freq > maxFrequency()) {
          continue;
        }
        const rowF = fractionalRowFromFreq(freq);
        const amplitude = (
          drawAmplitudeAtFractional(colF - 0.22, rowF)
          + drawAmplitudeAtFractional(colF, rowF)
          + drawAmplitudeAtFractional(colF + 0.22, rowF)
        ) / 3;
        frameMagnitude[bin] = amplitude;
      }
      magnitudes[frame] = frameMagnitude;
    }

    return magnitudes;
  }

  function phaseFramesFromSeed(seedSamples, totalSamples, plan = getStftPlan()) {
    const seedStft = forwardStft(seedSamples, totalSamples, plan);
    const phases = new Array(seedStft.frameCount);
    for (let frame = 0; frame < seedStft.frameCount; frame += 1) {
      const phaseFrame = new Float32Array(plan.halfBins);
      for (let bin = 0; bin < plan.halfBins; bin += 1) {
        phaseFrame[bin] = Math.atan2(seedStft.imagFrames[frame][bin], seedStft.realFrames[frame][bin]);
      }
      phases[frame] = phaseFrame;
    }
    return phases;
  }

  function deterministicPhaseFrames(frameCount, plan = getStftPlan()) {
    const phases = new Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const phaseFrame = new Float32Array(plan.halfBins);
      for (let bin = 0; bin < plan.halfBins; bin += 1) {
        phaseFrame[bin] = deterministicPhase(frame * 131 + bin * 17);
      }
      phases[frame] = phaseFrame;
    }
    return phases;
  }

  async function reconstructFromMagnitudes(targetMagnitudes, totalSamples, iterations, phaseFrames, onProgress) {
    const plan = getStftPlan();
    const frameCount = targetMagnitudes.length;
    let currentPhases = phaseFrames || deterministicPhaseFrames(frameCount, plan);
    let timeSignal = new Float32Array(totalSamples);

    // Griffin-Lim tries to find STFT phases that are self-consistent with a real signal.
    // It keeps the painted magnitudes fixed, repeatedly inverts to time domain, and then
    // projects back to an STFT with updated phases. Magnitude-only reconstructions often
    // sound metallic or phasey because many different waveforms share similar magnitudes.
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const realFrames = new Array(frameCount);
      const imagFrames = new Array(frameCount);
      for (let frame = 0; frame < frameCount; frame += 1) {
        const real = new Float32Array(plan.halfBins);
        const imag = new Float32Array(plan.halfBins);
        for (let bin = 0; bin < plan.halfBins; bin += 1) {
          const magnitude = targetMagnitudes[frame][bin];
          const phase = currentPhases[frame][bin];
          real[bin] = magnitude * Math.cos(phase);
          imag[bin] = magnitude * Math.sin(phase);
        }
        realFrames[frame] = real;
        imagFrames[frame] = imag;
      }
      timeSignal = inverseStft(realFrames, imagFrames, totalSamples, plan);
      const updated = forwardStft(timeSignal, totalSamples, plan);
      const nextPhases = new Array(frameCount);
      for (let frame = 0; frame < frameCount; frame += 1) {
        const phaseFrame = new Float32Array(plan.halfBins);
        for (let bin = 0; bin < plan.halfBins; bin += 1) {
          phaseFrame[bin] = Math.atan2(updated.imagFrames[frame][bin], updated.realFrames[frame][bin]);
        }
        nextPhases[frame] = phaseFrame;
      }
      currentPhases = nextPhases;
      if (onProgress) {
        onProgress(iteration + 1, iterations);
        await yieldToBrowser();
      }
    }

    const finalRealFrames = new Array(frameCount);
    const finalImagFrames = new Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const real = new Float32Array(plan.halfBins);
      const imag = new Float32Array(plan.halfBins);
      for (let bin = 0; bin < plan.halfBins; bin += 1) {
        const magnitude = targetMagnitudes[frame][bin];
        const phase = currentPhases[frame][bin];
        real[bin] = magnitude * Math.cos(phase);
        imag[bin] = magnitude * Math.sin(phase);
      }
      finalRealFrames[frame] = real;
      finalImagFrames[frame] = imag;
    }

    return inverseStft(finalRealFrames, finalImagFrames, totalSamples, plan);
  }

  async function buildGriffinLimAudioData(analysis, totalSamples, options = {}) {
    const targetMagnitudes = buildTargetMagnitudeSpectrogram(totalSamples);
    const plan = getStftPlan();
    const frameCount = targetMagnitudes.length;
    const phaseSeed = options.phaseSeedSamples
      ? phaseFramesFromSeed(options.phaseSeedSamples, totalSamples, plan)
      : deterministicPhaseFrames(frameCount, plan);
    const samples = await reconstructFromMagnitudes(
      targetMagnitudes,
      totalSamples,
      options.iterations || GRIFFIN_LIM_ITERATIONS,
      phaseSeed,
      options.onProgress
    );
    return {
      samples,
      tracks: options.tracks || [],
      iterations: options.iterations || GRIFFIN_LIM_ITERATIONS
    };
  }

  async function buildHybridAudioData(analysis, totalSamples, tracks = extractDrawVoiceTracks(analysis), onProgress) {
    const geometry = buildGeometryCoherenceAudioData(analysis, totalSamples, tracks);
    if (onProgress) {
      onProgress(0.1, "Geometry seed ready");
      await yieldToBrowser();
    }
    const griffin = await buildGriffinLimAudioData(analysis, totalSamples, {
      iterations: HYBRID_GRIFFIN_LIM_ITERATIONS,
      phaseSeedSamples: geometry.samples,
      tracks,
      onProgress: (iteration, totalIterations) => {
        if (onProgress) {
          onProgress(iteration / totalIterations, `Hybrid refinement ${iteration}/${totalIterations}`);
        }
      }
    });
    return {
      samples: griffin.samples,
      tracks,
      iterations: HYBRID_GRIFFIN_LIM_ITERATIONS
    };
  }

  async function buildAudioData(options = {}) {
    const { onProgress } = options;
    const hasScoreEvents = state.scoreEvents.length > 0;
    const scoreProgressStart = hasScoreEvents ? 0.08 : 0.15;
    const scoreProgressEnd = hasScoreEvents ? 0.8 : 0.15;
    const rendererProgressStart = hasScoreEvents ? 0.83 : 0.34;
    const rendererProgressEnd = 0.94;

    onProgress?.(0.04, "Analyzing drawing");
    const analysis = analyzeColumns();
    const totalSamples = Math.max(1, Math.floor(durationSeconds() * RENDER_SAMPLE_RATE));
    state.playDurationSeconds = durationSeconds();
    onProgress?.(0.07, "Preparing score and bass layers");
    const bass = buildBassEventAudioData(totalSamples);
    const maybeYield = shouldUseCooperativeRender(totalSamples, state.scoreEvents.length)
      ? createRenderYieldController()
      : null;
    const score = await buildScoreEventAudioData(totalSamples, state.renderMode, state.noteBackend, {
      onProgress,
      progressStart: scoreProgressStart,
      progressEnd: scoreProgressEnd
    });
    const mixedRaw = new Float32Array(totalSamples);
    const hasDrawEnergy = hasDrawLayerEnergy(analysis);
    let tracks = hasDrawEnergy ? extractDrawVoiceTracks(analysis) : [];
    let iterations = 0;
    let drawRender = {
      samples: new Float32Array(totalSamples),
      tracks,
      iterations: 0
    };

    if (hasDrawEnergy) {
      drawRender = await buildDrawLayerAudioData(analysis, totalSamples, tracks, {
        onStatus: (detail) => onProgress?.(rendererProgressStart, detail),
        onProgress: (iteration, totalIterations) => {
          onProgress?.(
            lerp(rendererProgressStart, rendererProgressEnd, iteration / totalIterations),
            `Griffin-Lim iteration ${iteration}/${totalIterations}`
          );
        },
        onHybridProgress: (fraction, detail) => {
          onProgress?.(lerp(rendererProgressStart, rendererProgressEnd, fraction), detail);
        }
      });
    } else {
      onProgress?.(rendererProgressStart, "No freehand drawing layer to synthesize");
    }

    iterations = drawRender.iterations || 0;
    onProgress?.(0.94, "Mixing and normalizing");
    for (let i = 0; i < mixedRaw.length; i += 1) {
      mixedRaw[i] = drawRender.samples[i] + score[i] + bass[i];
      if (maybeYield && i % RENDER_MIX_CHUNK_SIZE === 0 && i > 0) {
        onProgress?.(lerp(0.94, 0.975, i / Math.max(1, mixedRaw.length - 1)), "Mixing and normalizing");
        await maybeYield();
      }
    }

    const output = mixedRaw.slice();
    onProgress?.(0.978, "Normalizing output");
    await normalizeAudioData(output, maybeYield);
    onProgress?.(0.992, "Applying output fade");
    await applyEdgeFade(output, maybeYield);
    const scoreModeLabel = state.scoreEvents.length
      ? `${scoreViewLabel()} note events via ${resolvedNoteBackendName()}`
      : "";
    return {
      samples: output,
      rawMix: mixedRaw,
      drawSamples: drawRender.samples,
      scoreSamples: score,
      bassSamples: bass,
      totalSamples,
      iterations,
      modeLabel: scoreModeLabel
        ? `${renderModeName(state.renderMode)} + ${scoreModeLabel}`
        : renderModeName(state.renderMode),
      tracks,
      analysis
    };
  }

  async function buildIncrementalAudioData(options = {}) {
    const { onProgress } = options;
    const cache = state.renderCache;
    if (!cache || state.dirtyRender.full) {
      return buildAudioData(options);
    }

    const totalSamples = totalRenderSamples();
    if (cache.totalSamples !== totalSamples || cache.renderMode !== state.renderMode || cache.noteBackend !== state.noteBackend) {
      state.dirtyRender.full = true;
      return buildAudioData(options);
    }

    const startSample = clamp(state.dirtyRender.startSample, 0, totalSamples);
    const endSample = clamp(state.dirtyRender.endSample, startSample, totalSamples);
    if (endSample <= startSample) {
      return buildAudioData(options);
    }

    let analysis = null;
    let tracks = [];
    let iterations = 0;
    let remixStart = startSample;
    let remixEnd = endSample;
    let fullMixRefresh = false;

    onProgress?.(0.04, "Analyzing drawing");
    if (state.dirtyRender.layers.draw) {
      analysis = analyzeColumns();
      const hasDrawEnergy = hasDrawLayerEnergy(analysis);
      tracks = hasDrawEnergy ? extractDrawVoiceTracks(analysis) : [];
      if (drawLayerCanRenderIncrementally(state.renderMode)) {
        onProgress?.(0.08, "Updating changed drawing section");
        if (hasDrawEnergy) {
          const drawRender = await buildDrawLayerAudioData(analysis, totalSamples, tracks, {
            targetOutput: cache.drawSamples,
            rangeStartSample: startSample,
            rangeEndSample: endSample,
            onStatus: (detail) => onProgress?.(0.08, detail),
            onProgress: (iteration, totalIterations) => {
              onProgress?.(
                lerp(0.08, 0.42, iteration / totalIterations),
                `Griffin-Lim iteration ${iteration}/${totalIterations}`
              );
            },
            onHybridProgress: (fraction, detail) => {
              onProgress?.(lerp(0.08, 0.42, fraction), detail);
            }
          });
          iterations = drawRender.iterations || 0;
        } else {
          clearSampleRange(cache.drawSamples, startSample, endSample);
        }
      } else {
        onProgress?.(0.08, "Refreshing freehand layer");
        if (hasDrawEnergy) {
          const drawRender = await buildDrawLayerAudioData(analysis, totalSamples, tracks, {
            onStatus: (detail) => onProgress?.(0.08, detail),
            onProgress: (iteration, totalIterations) => {
              onProgress?.(
                lerp(0.08, 0.48, iteration / totalIterations),
                `Griffin-Lim iteration ${iteration}/${totalIterations}`
              );
            },
            onHybridProgress: (fraction, detail) => {
              onProgress?.(lerp(0.08, 0.48, fraction), detail);
            }
          });
          cache.drawSamples = drawRender.samples;
          iterations = drawRender.iterations || 0;
        } else {
          cache.drawSamples = new Float32Array(totalSamples);
        }
        fullMixRefresh = true;
        remixStart = 0;
        remixEnd = totalSamples;
      }
    }

    onProgress?.(0.52, "Updating changed section");
    if (state.dirtyRender.layers.score) {
      await buildScoreEventAudioData(totalSamples, state.renderMode, state.noteBackend, {
        targetOutput: cache.scoreSamples,
        rangeStartSample: startSample,
        rangeEndSample: endSample,
        onProgress: (progress, detail, progressText) => {
          onProgress?.(lerp(0.52, 0.78, progress), detail, progressText);
        },
        progressStart: 0,
        progressEnd: 1
      });
    }
    if (state.dirtyRender.layers.bass) {
      onProgress?.(0.8, "Updating bass events");
      buildBassEventAudioData(totalSamples, {
        targetOutput: cache.bassSamples,
        rangeStartSample: startSample,
        rangeEndSample: endSample
      });
    }

    onProgress?.(0.86, fullMixRefresh ? "Remixing updated layers" : "Remixing changed section");
    for (let i = remixStart; i < remixEnd; i += 1) {
      cache.rawMix[i] = cache.drawSamples[i] + cache.scoreSamples[i] + cache.bassSamples[i];
    }

    const output = cache.rawMix.slice();
    onProgress?.(0.94, "Normalizing output");
    await normalizeAudioData(output, shouldUseCooperativeRender(totalSamples, state.scoreEvents.length) ? createRenderYieldController() : null);
    onProgress?.(0.985, "Applying output fade");
    await applyEdgeFade(output, null);

    if (!analysis) {
      analysis = analyzeColumns();
      tracks = hasDrawLayerEnergy(analysis) ? extractDrawVoiceTracks(analysis) : [];
    }
    const scoreModeLabel = state.scoreEvents.length
      ? `${scoreViewLabel()} note events via ${resolvedNoteBackendName()}`
      : "";
    return {
      samples: output,
      rawMix: cache.rawMix,
      drawSamples: cache.drawSamples,
      scoreSamples: cache.scoreSamples,
      bassSamples: cache.bassSamples,
      totalSamples,
      iterations,
      modeLabel: scoreModeLabel
        ? `${renderModeName(state.renderMode)} + ${scoreModeLabel}`
        : renderModeName(state.renderMode),
      tracks,
      analysis
    };
  }

  async function buildPreviewBaseAudioData(options = {}) {
    const { onProgress } = options;
    const totalSamples = Math.max(1, Math.floor(durationSeconds() * RENDER_SAMPLE_RATE));
    const analysis = analyzeColumns();
    const bass = buildBassEventAudioData(totalSamples);
    const hasDrawEnergy = hasDrawLayerEnergy(analysis);
    const tracks = hasDrawEnergy ? extractDrawVoiceTracks(analysis) : [];
    let iterations = 0;
    let drawRender = {
      samples: new Float32Array(totalSamples),
      tracks,
      iterations: 0
    };

    onProgress?.(0.08, "Preparing freehand and bass layers");
    if (hasDrawEnergy) {
      drawRender = await buildDrawLayerAudioData(analysis, totalSamples, tracks, {
        onStatus: (detail) => onProgress?.(0.28, detail),
        onProgress: (iteration, totalIterations) => {
          onProgress?.(lerp(0.28, 0.72, iteration / totalIterations), `Griffin-Lim iteration ${iteration}/${totalIterations}`);
        },
        onHybridProgress: (fraction, detail) => {
          onProgress?.(lerp(0.28, 0.72, fraction), detail);
        }
      });
    }

    iterations = drawRender.iterations || 0;
    const mixedRaw = new Float32Array(totalSamples);
    onProgress?.(0.78, "Mixing freehand and bass layers");
    for (let i = 0; i < mixedRaw.length; i += 1) {
      mixedRaw[i] = drawRender.samples[i] + bass[i];
    }
    const output = mixedRaw.slice();
    onProgress?.(0.9, "Normalizing preview base");
    await normalizeAudioData(output, shouldUseCooperativeRender(totalSamples, 0) ? createRenderYieldController() : null);
    onProgress?.(0.98, "Applying output fade");
    await applyEdgeFade(output, null);
    return {
      samples: output,
      totalSamples,
      iterations,
      analysis,
      tracks,
      drawSamples: drawRender.samples,
      bassSamples: bass
    };
  }

  function createBufferFromSamples(audioContext, samples) {
    const buffer = audioContext.createBuffer(1, samples.length, RENDER_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0, 0);
    return buffer;
  }

  function hasCurrentPreviewBaseBuffer() {
    if (!state.previewBaseBuffer || !state.previewBaseCache) {
      return false;
    }
    if (state.previewBaseCache.totalSamples !== totalRenderSamples()) {
      return false;
    }
    if (state.previewBaseCache.renderMode !== state.renderMode) {
      return false;
    }
    if (state.dirtyRender.full || state.dirtyRender.layers.draw || state.dirtyRender.layers.bass) {
      return false;
    }
    return true;
  }

  async function renderPreviewBaseIfNeeded(reason) {
    if (!hasPreviewBaseLayers()) {
      state.previewBaseBuffer = null;
      state.previewBaseCache = null;
      return null;
    }
    if (hasCurrentPreviewBaseBuffer()) {
      return state.previewBaseBuffer;
    }
    if (state.previewBasePromise) {
      return state.previewBasePromise;
    }
    if (state.renderOverlayHideTimer) {
      window.clearTimeout(state.renderOverlayHideTimer);
      state.renderOverlayHideTimer = 0;
    }
    state.previewBasePromise = (async () => {
      const overlayStartedAt = performance.now();
      setRenderOverlay(true, {
        title: "Preparing playback",
        detail: `Preparing ${reason}`,
        progress: null
      });
      await yieldToBrowser();
      try {
        const renderResult = await withCompositeLayerState(() => buildPreviewBaseAudioData({
          onProgress: (progress, detail) => {
            setRenderOverlay(true, {
              title: "Preparing playback",
              detail,
              progress
            });
          }
        }));
        const audioContext = createAudioContext();
        const buffer = createBufferFromSamples(audioContext, renderResult.samples);
        state.previewBaseBuffer = buffer;
        state.previewBaseCache = {
          totalSamples: renderResult.totalSamples,
          renderMode: state.renderMode
        };
        return buffer;
      } finally {
        const visibleMs = performance.now() - overlayStartedAt;
        if (visibleMs < 240) {
          state.renderOverlayHideTimer = window.setTimeout(() => {
            if (!state.previewBasePromise && !state.renderPromise) {
              setRenderOverlay(false);
            }
            state.renderOverlayHideTimer = 0;
          }, 240 - visibleMs);
        } else {
          setRenderOverlay(false);
        }
        state.previewBasePromise = null;
      }
    })();
    return state.previewBasePromise;
  }

  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    function writeString(offset, text) {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = clamp(samples[i], -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  async function renderIfNeeded(reason) {
    if (hasCurrentRenderedBuffer()) {
      return state.renderedBuffer;
    }
    if (state.renderPromise) {
      return state.renderPromise;
    }
    if (state.renderOverlayHideTimer) {
      window.clearTimeout(state.renderOverlayHideTimer);
      state.renderOverlayHideTimer = 0;
    }
    state.renderPromise = (async () => {
      const token = ++state.renderToken;
      const overlayStartedAt = performance.now();
      setStatus(`Rendering ${reason} using ${renderModeName(state.renderMode).toLowerCase()}...`);
      setRenderOverlay(true, {
        title: "Rendering audio",
        detail: `Preparing ${renderModeName(state.renderMode).toLowerCase()}`,
        progress: null
      });
      await yieldToBrowser();

      try {
        const startedAt = performance.now();
        const renderResult = await withCompositeLayerState(() => (
          state.dirtyRender.full || layersRequireFullRender()
            ? buildAudioData({
              onProgress: (progress, detail, progressText) => {
                if (token !== state.renderToken) {
                  return;
                }
                setRenderOverlay(true, {
                  title: "Rendering audio",
                  detail,
                  progress,
                  progressText
                });
              }
            })
            : buildIncrementalAudioData({
              onProgress: (progress, detail, progressText) => {
                if (token !== state.renderToken) {
                  return;
                }
                setRenderOverlay(true, {
                  title: "Rendering audio",
                  detail,
                  progress,
                  progressText
                });
              }
            })
        ));
        const elapsedMs = performance.now() - startedAt;
        if (token !== state.renderToken) {
          return null;
        }

        const audioContext = createAudioContext();
        const samples = renderResult.samples;
        setRenderOverlay(true, {
          title: "Rendering audio",
          detail: "Creating playback buffer",
          progress: 0.98
        });
        const buffer = audioContext.createBuffer(1, samples.length, RENDER_SAMPLE_RATE);
        buffer.copyToChannel(samples, 0, 0);
        setRenderOverlay(true, {
          title: "Rendering audio",
          detail: "Render complete",
          progress: 1
        });
        await yieldToBrowser();
        state.renderedBuffer = buffer;
        state.playDurationSeconds = buffer.duration;
        state.renderCache = {
          totalSamples: renderResult.totalSamples,
          renderMode: state.renderMode,
          noteBackend: state.noteBackend,
          drawSamples: renderResult.drawSamples,
          scoreSamples: renderResult.scoreSamples,
          bassSamples: renderResult.bassSamples,
          rawMix: renderResult.rawMix
        };
        state.lastRenderedDataVersion = state.dataVersion;
        state.dirtyRender = {
          full: false,
          startSample: 0,
          endSample: 0,
          layers: { draw: false, bass: false, score: false }
        };
        state.latestRenderInfo = {
          mode: renderResult.modeLabel,
          iterations: renderResult.iterations || 0,
          elapsedMs,
          sampleCount: samples.length
        };
        state.diagnosticsCache = {
          version: state.dataVersion,
          snapshot: {
            analysis: renderResult.analysis,
            tracks: renderResult.tracks
          }
        };
        if (state.isPaused) {
          state.pausedOffsetSeconds = clamp(state.pausedOffsetSeconds, 0, buffer.duration);
          state.playheadRatio = buffer.duration > 0 ? state.pausedOffsetSeconds / buffer.duration : 0;
        }
        state.renderedWav = encodeWav(samples, RENDER_SAMPLE_RATE);
        state.dirty = false;
        const modeSummary = renderResult.modeLabel;
        const iterationSummary = renderResult.iterations > 0 ? ` · ${renderResult.iterations} iterations` : "";
        const backendWarning = state.noteBackendWarning ? ` · ${state.noteBackendWarning}` : "";
        setStatus(`Rendered using: ${modeSummary} · ${elapsedMs.toFixed(1)} ms · ${samples.length} samples${iterationSummary}${backendWarning}`);
        return buffer;
      } catch (error) {
        reportBootError(error);
        setStatus(`Render failed: ${error && error.message ? error.message : String(error)}`);
        throw error;
      } finally {
        const visibleMs = performance.now() - overlayStartedAt;
        if (visibleMs < 420) {
          state.renderOverlayHideTimer = window.setTimeout(() => {
            if (state.renderToken === token && !state.renderPromise) {
              setRenderOverlay(false);
            }
            state.renderOverlayHideTimer = 0;
          }, 420 - visibleMs);
        } else {
          setRenderOverlay(false);
        }
        state.renderPromise = null;
      }
    })();
    return state.renderPromise;
  }

  function scheduleLiveSampleStop(stopFn) {
    state.liveSampleStopFns.push(stopFn);
  }

  function liveSampleWindowCount() {
    return Math.max(1, Math.ceil(durationSeconds() / LIVE_SAMPLE_PLAY_WINDOW_SECONDS));
  }

  function liveSampleWindowBounds(windowIndex) {
    const startSec = clamp(windowIndex * LIVE_SAMPLE_PLAY_WINDOW_SECONDS, 0, durationSeconds());
    const endSec = clamp(startSec + LIVE_SAMPLE_PLAY_WINDOW_SECONDS, startSec, durationSeconds());
    return { startSec, endSec };
  }

  function liveSampleWindowHasNotes(windowIndex) {
    const { startSec, endSec } = liveSampleWindowBounds(windowIndex);
    return state.liveSampleScoreEvents.some((note) => {
      const noteStart = note.startSec;
      const noteEnd = note.startSec + Math.max(0.02, note.durationSec) + SMPLR_RENDER_TAIL_SECONDS;
      return noteEnd > startSec && noteStart < endSec;
    });
  }

  async function ensureLiveSampleWindow(windowIndex, options = {}) {
    if (!state.liveSampleUsesProgressive || !state.audioContext || !state.liveSampleGainNode) {
      return;
    }
    if (windowIndex < 0 || windowIndex >= liveSampleWindowCount()) {
      return;
    }
    const key = String(windowIndex);
    if (state.liveSampleRenderedWindows.has(key) || state.liveSampleRenderingWindows.has(key)) {
      return;
    }
    state.liveSampleRenderingWindows.add(key);
    const sessionId = state.liveSampleSessionId;
    try {
      if (!liveSampleWindowHasNotes(windowIndex)) {
        state.liveSampleRenderedWindows.add(key);
        return;
      }
      const { startSec, endSec } = liveSampleWindowBounds(windowIndex);
      const totalSamples = totalRenderSamples();
      const startSample = clamp(Math.floor(startSec * RENDER_SAMPLE_RATE), 0, totalSamples);
      const endSample = clamp(Math.ceil(endSec * RENDER_SAMPLE_RATE), startSample, totalSamples);
      const rendered = await withCompositeLayerState(() => renderSmplrScoreEvents(totalSamples, state.noteBackend, {
        rangeStartSample: startSample,
        rangeEndSample: endSample
      }));
      if (
        sessionId !== state.liveSampleSessionId
        || !state.isPlaying
        || !state.liveSampleUsesProgressive
        || !state.audioContext
        || !state.liveSampleGainNode
      ) {
        return;
      }
      const mixedWindow = rendered.samples.slice();
      if (state.previewBaseBuffer) {
        const previewChannel = state.previewBaseBuffer.getChannelData(0);
        const copyLength = Math.min(mixedWindow.length, Math.max(0, previewChannel.length - startSample));
        for (let i = 0; i < copyLength; i += 1) {
          mixedWindow[i] += previewChannel[startSample + i];
        }
      }
      const buffer = createBufferFromSamples(state.audioContext, mixedWindow);
      const absoluteStartSec = startSec;
      const nowAbs = Math.max(0, state.audioContext.currentTime - state.playStartedAt);
      const offsetSec = options.initialPlaybackOffsetSec != null
        ? Math.max(0, options.initialPlaybackOffsetSec - absoluteStartSec)
        : Math.max(0, nowAbs - absoluteStartSec);
      if (buffer.duration - offsetSec <= 0.02) {
        state.liveSampleRenderedWindows.add(key);
        return;
      }
      const source = state.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(state.liveSampleGainNode);
      const startAt = options.initialSourceStartAt != null
        ? options.initialSourceStartAt
        : Math.max(state.playStartedAt + absoluteStartSec, state.audioContext.currentTime + 0.01);
      source.start(startAt, offsetSec);
      scheduleLiveSampleStop(() => {
        try {
          source.stop();
        } catch (error) {
          // Ignore repeated stops on already-finished window sources.
        }
        try {
          source.disconnect();
        } catch (error) {
          // Ignore repeated disconnects.
        }
      });
      state.liveSampleRenderedWindows.add(key);
    } finally {
      state.liveSampleRenderingWindows.delete(key);
    }
  }

  function scheduleLiveSampleWindows(forceInitial = false) {
    if (!state.liveSampleUsesProgressive || !state.audioContext || !state.isPlaying) {
      return;
    }
    const duration = Math.max(0.001, state.playDurationSeconds || durationSeconds());
    const nowAbs = Math.max(0, state.audioContext.currentTime - state.playStartedAt);
    const startAbs = forceInitial ? clamp(state.pausedOffsetSeconds, 0, duration) : nowAbs;
    const targetAbs = Math.min(duration, startAbs + LIVE_SAMPLE_RENDER_AHEAD_SECONDS);
    const startWindow = clamp(Math.floor(startAbs / LIVE_SAMPLE_PLAY_WINDOW_SECONDS), 0, Math.max(0, liveSampleWindowCount() - 1));
    const endWindow = clamp(Math.floor(Math.max(0, targetAbs - 1e-6) / LIVE_SAMPLE_PLAY_WINDOW_SECONDS), startWindow, Math.max(0, liveSampleWindowCount() - 1));
    for (let windowIndex = startWindow; windowIndex <= endWindow; windowIndex += 1) {
      void ensureLiveSampleWindow(windowIndex);
    }
    state.liveSampleScheduledUntilSec = targetAbs;
  }

  function scheduleLiveNoteEvent(note, startTime, duration) {
    if (!state.liveSampleInstrument || !state.audioContext || duration <= 0.02) {
      return;
    }
    const velocity = clamp(Math.round((note.velocity || 0.78) * 127), 1, 127);
    const safeStartTime = Math.max(startTime, state.audioContext.currentTime + 0.02);
    state.sampleDebugScheduledCount += 1;
    setSampleDebug(`scheduled ${state.sampleDebugScheduledCount}, started ${state.sampleDebugStartedCount}, next midi ${note.midi} at ${safeStartTime.toFixed(2)}s.`);
    const stopFn = state.liveSampleInstrument.start({
      note: note.midi,
      velocity,
      time: safeStartTime,
      duration
    });
    scheduleLiveSampleStop(stopFn);
  }

  function scheduleLiveSampleNotes(forceInitial = false) {
    if (!state.liveSampleUsesProgressive || !state.liveSampleInstrument || !state.audioContext || !state.isPlaying) {
      return;
    }
    const duration = Math.max(0.001, state.playDurationSeconds || durationSeconds());
    const nowAbs = Math.max(0, state.audioContext.currentTime - state.playStartedAt);
    const targetAbs = state.loopPlayback
      ? nowAbs + LIVE_SAMPLE_NOTE_LOOKAHEAD_SECONDS
      : Math.min(duration, nowAbs + LIVE_SAMPLE_NOTE_LOOKAHEAD_SECONDS);
    const startAbs = Math.max(0, state.liveSampleScheduledUntilSec);
    const upcomingNote = nextNoteStartSec(state.liveSampleScoreEvents, startAbs);
    if (!forceInitial && targetAbs <= startAbs + 1e-6) {
      return;
    }

    if (forceInitial) {
      const initialCycle = Math.floor(startAbs / duration);
      const initialWithin = state.loopPlayback ? startAbs - initialCycle * duration : startAbs;
      for (const note of state.liveSampleScoreEvents) {
        const noteEnd = note.startSec + Math.max(0.02, note.durationSec);
        if (note.startSec < initialWithin && noteEnd > initialWithin) {
          scheduleLiveNoteEvent(
            note,
            state.audioContext.currentTime + 0.01,
            Math.max(0.02, noteEnd - initialWithin)
          );
        }
      }
    }

    if (state.loopPlayback) {
      const startCycle = Math.floor(startAbs / duration);
      const endCycle = Math.floor(Math.max(0, targetAbs - 1e-6) / duration);
      for (let cycle = startCycle; cycle <= endCycle; cycle += 1) {
        const cycleOffset = cycle * duration;
        for (const note of state.liveSampleScoreEvents) {
          const eventAbs = cycleOffset + note.startSec;
          if (eventAbs >= startAbs && eventAbs < targetAbs) {
            scheduleLiveNoteEvent(note, state.playStartedAt + eventAbs, Math.max(0.02, note.durationSec));
          }
        }
      }
    } else {
      for (const note of state.liveSampleScoreEvents) {
        if (note.startSec >= startAbs && note.startSec < targetAbs) {
          scheduleLiveNoteEvent(note, state.playStartedAt + note.startSec, Math.max(0.02, note.durationSec));
        }
      }
    }

    state.liveSampleScheduledUntilSec = targetAbs;
    if (state.sampleDebugScheduledCount === 0 && upcomingNote != null && upcomingNote >= targetAbs) {
      setSampleDebug(`no notes in lookahead yet. next note at ${upcomingNote.toFixed(2)}s. active ${state.scoreEvents.length} / composite ${state.liveSampleScoreEvents.length}.`);
    }
  }

  async function playAudioWithProgressiveSampleNotes(audioContext, requestId) {
    const startOffset = preferredPlaybackStartOffset(durationSeconds());
    const compositeScoreEvents = currentRenderLayerState().scoreEvents;
    const progressiveScoreEvents = compositeScoreEvents.length
      ? compositeScoreEvents
      : cloneEventList(state.scoreEvents);
    const baseBuffer = await renderPreviewBaseIfNeeded("playback layers");
    if (requestId !== state.transportRequestId || state.transportPending !== "play") {
      return false;
    }
    const smplr = await ensureSmplrModuleLoaded();
    if (requestId !== state.transportRequestId || state.transportPending !== "play") {
      return false;
    }
    const loader = ensureSmplrSharedLoader(smplr);
    const liveSampleGainNode = audioContext.createGain();
    liveSampleGainNode.gain.value = 1;
    liveSampleGainNode.connect(state.gainNode);
    resetSampleDebug(`loading ${noteBackendName(state.noteBackend).toLowerCase()} module for active ${state.scoreEvents.length} / composite ${compositeScoreEvents.length} notes...`);
    const instrument = createSmplrInstrumentInstance(smplr, audioContext, state.noteBackend, {
      loader,
      scheduleLookaheadMs: Math.ceil((LIVE_SAMPLE_NOTE_LOOKAHEAD_SECONDS + 0.5) * 1000),
      scheduleIntervalMs: 120,
      onLoadProgress: ({ loaded, total }) => {
        setSampleDebug(`loading samples ${loaded}/${total || "?"}.`);
      },
      onStart: (event) => {
        state.sampleDebugStartedCount += 1;
        const noteLabel = event && (event.note ?? event.midi ?? event.pitch ?? "?");
        setSampleDebug(`scheduled ${state.sampleDebugScheduledCount}, started ${state.sampleDebugStartedCount}. last start ${noteLabel}.`);
      },
      destination: liveSampleGainNode
    });
    setRenderOverlay(true, {
      title: "Preparing playback",
      detail: `Loading ${noteBackendName(state.noteBackend).toLowerCase()}`,
      progress: null
    });
    try {
      await instrument.load;
      setSampleDebug(`instrument loaded for active ${state.scoreEvents.length} / composite ${state.liveSampleScoreEvents.length} notes. scheduled ${state.sampleDebugScheduledCount}, started ${state.sampleDebugStartedCount}.`);
    } finally {
      setRenderOverlay(false);
    }
    if (requestId !== state.transportRequestId || state.transportPending !== "play") {
      try {
        instrument.stop();
      } catch (error) {
        // Ignore cancellation races while the instrument is still loading.
      }
      return false;
    }

    stopActiveSource();
    stopLiveSamplePlayback();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }

    state.gainNode.gain.value = Number(gainInput.value);
    state.liveSampleInstrument = instrument;
    state.liveSampleScheduler = null;
    state.liveSampleGainNode = liveSampleGainNode;
    state.liveSampleStopFns = [];
    state.liveSampleScoreEvents = progressiveScoreEvents;
    state.liveSampleUsesProgressive = true;
    state.liveSampleScheduledUntilSec = startOffset;
    state.isPlaying = true;
    state.isPaused = false;
    state.playStartedAt = audioContext.currentTime - startOffset;
    state.playDurationSeconds = durationSeconds();
    state.playheadRatio = state.playDurationSeconds > 0 ? startOffset / state.playDurationSeconds : 0;
    state.lastPlaybackLoopIndex = Math.floor(startOffset / Math.max(0.001, state.playDurationSeconds));
    followPlaybackViewport({ allowBackward: true });
    scheduleLiveSampleNotes(true);
    state.transportPending = "";
    setSampleDebug(`playback started at ${startOffset.toFixed(2)}s for active ${state.scoreEvents.length} / composite ${state.liveSampleScoreEvents.length} notes. scheduled ${state.sampleDebugScheduledCount}, started ${state.sampleDebugStartedCount}.`);
    setStatus(`Playing ${noteBackendName(state.noteBackend).toLowerCase()} with progressive note scheduling.`);
    updateOutputs();
    renderCanvas();
    state.rafId = requestAnimationFrame(animatePlayhead);
    return true;
  }

  async function playAudio() {
    if (state.transportPending === "play" || (state.isPlaying && !state.isPaused)) {
      return;
    }
    const requestId = ++state.transportRequestId;
    state.transportPending = "play";
    updateOutputs();
    setStatus("Starting playback...");
    const audioContext = createAudioContext();
    await audioContext.resume();
    if (requestId !== state.transportRequestId || state.transportPending !== "play") {
      return;
    }
    if (sampleNoteBackendSupportsProgressivePlay()) {
      try {
        const started = await playAudioWithProgressiveSampleNotes(audioContext, requestId);
        if (requestId === state.transportRequestId) {
          state.transportPending = "";
          updateOutputs();
        }
        if (started) {
          return;
        }
      } catch (error) {
        state.noteBackendWarning = `Progressive ${noteBackendName(state.noteBackend).toLowerCase()} playback fell back to offline rendering (${error && error.message ? error.message : String(error)}).`;
        setStatus(state.noteBackendWarning);
      }
    }
    const buffer = await renderIfNeeded("audio");
    if (requestId !== state.transportRequestId || state.transportPending !== "play") {
      return;
    }
    if (!buffer) {
      state.transportPending = "";
      updateOutputs();
      return;
    }
    stopActiveSource();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = state.loopPlayback;
    state.gainNode.gain.value = Number(gainInput.value);
    source.connect(state.gainNode);
    source.onended = () => {
      if (state.sourceNode === source) {
        stopPlayback("Playback finished.");
      }
    };

    state.sourceNode = source;
    const startOffset = preferredPlaybackStartOffset(buffer.duration);
    state.isPlaying = true;
    state.isPaused = false;
    state.playStartedAt = audioContext.currentTime - startOffset;
    state.playheadRatio = buffer.duration > 0 ? startOffset / buffer.duration : 0;
    state.lastPlaybackLoopIndex = 0;
    followPlaybackViewport({ allowBackward: true });
    source.start(0, startOffset);
    state.transportPending = "";
    setStatus(state.loopPlayback ? "Playing rendered audio in loop mode." : "Playing rendered audio.");
    updateOutputs();
    renderCanvas();
    state.rafId = requestAnimationFrame(animatePlayhead);
  }

  async function exportWav() {
    const buffer = await renderIfNeeded("WAV export");
    if (!buffer || !state.renderedWav) {
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(state.renderedWav);
    link.download = "spectrogram-sketch.wav";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setStatus("WAV exported.");
  }

  function clearSpectrogram() {
    drawData.fill(0);
    clearImportedScoreEvents();
    resetUndoHistory();
    markDirty();
    stopPlayback("Drawing layer cleared.");
    resetViewportToEditorDefault();
  }

  function clearBassLine() {
    basslineData.fill(0);
    bassEvents.length = 0;
    state.currentBasslinePreset = "none";
    resetUndoHistory();
    markDirty();
    stopPlayback("Bass line cleared.");
    renderCanvas();
  }

  function setTool(tool) {
    if (tool === "note" && !isScoreNoteToolAvailable()) {
      tool = "brush";
    }
    state.tool = tool;
    scheduleSessionProjectSave();
    updateToolParameterVisibility();
    for (const button of toolButtons) {
      button.classList.toggle("is-active", button.dataset.tool === tool);
    }
    updateCanvasCursor(state.currentPointer);
  }

  function chooseScoreViewForMidiRange(minMidi, maxMidi) {
    const guitar = SCORE_VIEW_PROFILES["guitar-score"];
    if (minMidi >= guitar.minMidi && maxMidi <= guitar.maxMidi) {
      return "guitar-score";
    }
    return "piano-score";
  }

  function parsePitchMidi(noteNode) {
    const pitchNode = noteNode.querySelector("pitch");
    if (!pitchNode) {
      return null;
    }
    const stepNode = pitchNode.querySelector("step");
    const octaveNode = pitchNode.querySelector("octave");
    if (!stepNode || !octaveNode) {
      return null;
    }
    const stepOffsets = {
      C: 0,
      D: 2,
      E: 4,
      F: 5,
      G: 7,
      A: 9,
      B: 11
    };
    const step = stepNode.textContent.trim().toUpperCase();
    const octave = Number(octaveNode.textContent);
    const alterNode = pitchNode.querySelector("alter");
    const alter = alterNode ? Number(alterNode.textContent) : 0;
    if (!Number.isFinite(octave) || !(step in stepOffsets)) {
      return null;
    }
    return (octave + 1) * 12 + stepOffsets[step] + alter;
  }

  function mergeAdjacentNoteEvents(notes) {
    const sorted = notes
      .filter((note) => note.durationSec > 0.015)
      .sort((a, b) => a.midi - b.midi || a.startSec - b.startSec);
    const merged = [];
    for (const note of sorted) {
      const last = merged[merged.length - 1];
      if (
        last
        && last.midi === note.midi
        && note.startSec <= last.startSec + last.durationSec + 0.05
      ) {
        const lastEnd = last.startSec + last.durationSec;
        const noteEnd = note.startSec + note.durationSec;
        last.durationSec = Math.max(lastEnd, noteEnd) - last.startSec;
        last.velocity = Math.max(last.velocity, note.velocity);
      } else {
        merged.push({ ...note });
      }
    }
    return merged.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
  }

  function parseMusicXmlScore(text) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror")) {
      throw new Error("Could not parse MusicXML file.");
    }
    const parts = Array.from(xml.getElementsByTagName("part"));
    if (!parts.length) {
      throw new Error("MusicXML file does not contain any parts.");
    }

    const notes = [];
    let totalDurationSec = 0;

    function durationDivToSeconds(durationDiv, divisions, bpm) {
      return (durationDiv / Math.max(1, divisions)) * (60 / Math.max(1, bpm));
    }

    for (const part of parts) {
      let divisions = 1;
      let bpm = 120;
      let partTimeSec = 0;
      const measures = Array.from(part.children).filter((node) => node.tagName === "measure");

      for (const measure of measures) {
        let measureCursorSec = 0;
        let measureMaxSec = 0;
        let lastChordStartSec = 0;

        for (const child of Array.from(measure.children)) {
          if (child.tagName === "attributes") {
            const divisionsNode = child.querySelector("divisions");
            if (divisionsNode) {
              const nextDivisions = Number(divisionsNode.textContent);
              if (Number.isFinite(nextDivisions) && nextDivisions > 0) {
                divisions = nextDivisions;
              }
            }
            continue;
          }

          if (child.tagName === "direction") {
            const soundTempo = child.querySelector("sound[tempo]");
            if (soundTempo) {
              const nextTempo = Number(soundTempo.getAttribute("tempo"));
              if (Number.isFinite(nextTempo) && nextTempo > 0) {
                bpm = nextTempo;
              }
            } else {
              const perMinute = child.querySelector("metronome per-minute");
              if (perMinute) {
                const nextTempo = Number(perMinute.textContent);
                if (Number.isFinite(nextTempo) && nextTempo > 0) {
                  bpm = nextTempo;
                }
              }
            }
            continue;
          }

          if (child.tagName === "backup" || child.tagName === "forward") {
            const durationNode = child.querySelector("duration");
            const durationDiv = durationNode ? Number(durationNode.textContent) : 0;
            const seconds = durationDivToSeconds(durationDiv, divisions, bpm);
            if (child.tagName === "backup") {
              measureCursorSec = Math.max(0, measureCursorSec - seconds);
            } else {
              measureCursorSec += seconds;
              measureMaxSec = Math.max(measureMaxSec, measureCursorSec);
            }
            continue;
          }

          if (child.tagName !== "note" || child.querySelector("grace")) {
            continue;
          }

          const durationNode = child.querySelector("duration");
          const durationDiv = durationNode ? Number(durationNode.textContent) : 0;
          const durationSec = durationDivToSeconds(durationDiv, divisions, bpm);
          const isChordTone = Boolean(child.querySelector("chord"));
          const isRest = Boolean(child.querySelector("rest"));
          const startSec = partTimeSec + (isChordTone ? lastChordStartSec : measureCursorSec);

          if (!isRest) {
            const midi = parsePitchMidi(child);
            if (midi !== null) {
              notes.push({
                startSec,
                durationSec,
                midi,
                velocity: 0.78
              });
            }
          }

          if (!isChordTone) {
            lastChordStartSec = measureCursorSec;
            measureCursorSec += durationSec;
            measureMaxSec = Math.max(measureMaxSec, measureCursorSec);
          } else {
            measureMaxSec = Math.max(measureMaxSec, lastChordStartSec + durationSec);
          }
        }

        partTimeSec += Math.max(measureMaxSec, measureCursorSec);
      }

      totalDurationSec = Math.max(totalDurationSec, partTimeSec);
    }

    return {
      format: "MusicXML",
      notes: mergeAdjacentNoteEvents(notes),
      totalDurationSec
    };
  }

  function readVarLen(bytes, cursor) {
    let value = 0;
    let next = cursor;
    while (next < bytes.length) {
      const byte = bytes[next];
      value = (value << 7) | (byte & 0x7f);
      next += 1;
      if ((byte & 0x80) === 0) {
        break;
      }
    }
    return { value, next };
  }

  function readUint32BE(bytes, offset) {
    return (
      (bytes[offset] << 24)
      | (bytes[offset + 1] << 16)
      | (bytes[offset + 2] << 8)
      | bytes[offset + 3]
    ) >>> 0;
  }

  function parseMidiScore(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (String.fromCharCode(...bytes.slice(0, 4)) !== "MThd") {
      throw new Error("File is not a standard MIDI file.");
    }
    const headerLength = readUint32BE(bytes, 4);
    const division = (bytes[12] << 8) | bytes[13];
    if (division & 0x8000) {
      throw new Error("SMPTE-timed MIDI files are not supported.");
    }
    const ticksPerQuarter = division;
    const trackCount = (bytes[10] << 8) | bytes[11];
    let offset = 8 + headerLength;
    const notes = [];
    const tempoEvents = [{ tick: 0, usPerQuarter: 500000 }];

    for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
      if (String.fromCharCode(...bytes.slice(offset, offset + 4)) !== "MTrk") {
        throw new Error("Malformed MIDI track header.");
      }
      const trackLength = readUint32BE(bytes, offset + 4);
      const trackEnd = offset + 8 + trackLength;
      let cursor = offset + 8;
      let absoluteTick = 0;
      let runningStatus = 0;
      const activeNotes = new Map();

      while (cursor < trackEnd) {
        const delta = readVarLen(bytes, cursor);
        absoluteTick += delta.value;
        cursor = delta.next;
        let status = bytes[cursor];

        if (status < 0x80) {
          status = runningStatus;
        } else {
          cursor += 1;
          runningStatus = status;
        }

        if (status === 0xff) {
          const metaType = bytes[cursor];
          cursor += 1;
          const lengthInfo = readVarLen(bytes, cursor);
          cursor = lengthInfo.next;
          const dataStart = cursor;
          const dataEnd = cursor + lengthInfo.value;
          if (metaType === 0x51 && lengthInfo.value === 3) {
            const usPerQuarter = (bytes[dataStart] << 16) | (bytes[dataStart + 1] << 8) | bytes[dataStart + 2];
            tempoEvents.push({ tick: absoluteTick, usPerQuarter });
          }
          cursor = dataEnd;
          continue;
        }

        if (status === 0xf0 || status === 0xf7) {
          const sysexLength = readVarLen(bytes, cursor);
          cursor = sysexLength.next + sysexLength.value;
          continue;
        }

        const eventType = status >> 4;
        const channel = status & 0x0f;
        const data1 = bytes[cursor];
        const data2 = eventType === 0xc || eventType === 0xd ? 0 : bytes[cursor + 1];
        cursor += eventType === 0xc || eventType === 0xd ? 1 : 2;

        if (eventType === 0x9 && data2 > 0) {
          const key = `${channel}:${data1}`;
          if (!activeNotes.has(key)) {
            activeNotes.set(key, []);
          }
          activeNotes.get(key).push({ startTick: absoluteTick, velocity: data2 / 127 });
          continue;
        }

        if (eventType === 0x8 || (eventType === 0x9 && data2 === 0)) {
          const key = `${channel}:${data1}`;
          const starts = activeNotes.get(key);
          if (starts && starts.length) {
            const noteOn = starts.pop();
            notes.push({
              startTick: noteOn.startTick,
              endTick: absoluteTick,
              midi: data1,
              velocity: noteOn.velocity
            });
          }
        }
      }

      offset = trackEnd;
    }

    tempoEvents.sort((a, b) => a.tick - b.tick);
    const tempoMap = [];
    let cumulativeSec = 0;
    let lastTick = tempoEvents[0].tick;
    let currentUsPerQuarter = tempoEvents[0].usPerQuarter;
    tempoMap.push({ tick: lastTick, seconds: 0, usPerQuarter: currentUsPerQuarter });
    for (let i = 1; i < tempoEvents.length; i += 1) {
      const event = tempoEvents[i];
      cumulativeSec += ((event.tick - lastTick) * currentUsPerQuarter) / (ticksPerQuarter * 1000000);
      tempoMap.push({ tick: event.tick, seconds: cumulativeSec, usPerQuarter: event.usPerQuarter });
      lastTick = event.tick;
      currentUsPerQuarter = event.usPerQuarter;
    }

    function tickToSeconds(targetTick) {
      let selected = tempoMap[0];
      for (let i = 1; i < tempoMap.length; i += 1) {
        if (tempoMap[i].tick > targetTick) {
          break;
        }
        selected = tempoMap[i];
      }
      return selected.seconds
        + ((targetTick - selected.tick) * selected.usPerQuarter) / (ticksPerQuarter * 1000000);
    }

    const resolvedNotes = notes.map((note) => ({
      startSec: tickToSeconds(note.startTick),
      durationSec: Math.max(0.02, tickToSeconds(note.endTick) - tickToSeconds(note.startTick)),
      midi: note.midi,
      velocity: note.velocity
    }));
    const totalDurationSec = resolvedNotes.reduce(
      (max, note) => Math.max(max, note.startSec + note.durationSec),
      0
    );

    return {
      format: "MIDI",
      notes: mergeAdjacentNoteEvents(resolvedNotes),
      totalDurationSec
    };
  }

  function paintImportedScore(notes) {
    drawData.fill(0);
    void notes;
  }

  function importParsedScore(parsedScore) {
    if (!parsedScore.notes.length) {
      throw new Error("No playable note events were found in the score.");
    }

    const minMidi = parsedScore.notes.reduce((min, note) => Math.min(min, note.midi), Infinity);
    const maxMidi = parsedScore.notes.reduce((max, note) => Math.max(max, note.midi), -Infinity);
    const suggestedView = chooseScoreViewForMidiRange(minMidi, maxMidi);
    state.editorView = suggestedView;
    if (editorViewSelect) {
      editorViewSelect.value = suggestedView;
    }
    applyEditorViewSettings();

    const maxDuration = Number(durationInput.max);
    const importedDuration = Math.max(2, parsedScore.totalDurationSec + 0.5);
    const targetDuration = clamp(Math.ceil(importedDuration * 4) / 4, Number(durationInput.min), maxDuration);
    const wasScaled = importedDuration > maxDuration;
    const scale = wasScaled ? targetDuration / importedDuration : 1;
    const firstStartSec = firstNoteStartSec(parsedScore.notes) || 0;
    const scaledNotes = parsedScore.notes.map((note) => ({
      ...note,
      startSec: Math.max(0, (note.startSec - firstStartSec) * scale),
      durationSec: Math.max(0.02, note.durationSec * scale)
    }));
    durationInput.value = String(targetDuration);
    state.viewOffsetCol = 0;
    updateOutputs();
    state.scoreEvents = scaledNotes;
    paintImportedScore(scaledNotes);
    resetUndoHistory();
    markDirty();
    stopPlayback(
      `Imported ${parsedScore.notes.length} notes from ${parsedScore.format} into ${scoreViewLabel(suggestedView)}${wasScaled ? ` (time-scaled to ${targetDuration} s)` : ""}.`
    );
    renderCanvas();
  }

  async function importScoreFile(file) {
    const lowerName = file.name.toLowerCase();
    let parsedScore;
    if (lowerName.endsWith(".mid") || lowerName.endsWith(".midi")) {
      parsedScore = parseMidiScore(await file.arrayBuffer());
    } else {
      parsedScore = parseMusicXmlScore(await file.text());
    }
    importParsedScore(parsedScore);
  }

  async function importBundledScorePreset(assetPath) {
    if (!assetPath) {
      return;
    }
    const fileName = decodeURIComponent(assetPath.split("/").pop() || assetPath);
    const response = await fetch(assetPath, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Failed to fetch bundled score "${fileName}" (${response.status}).`);
    }
    let parsedScore;
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith(".mid") || lowerName.endsWith(".midi")) {
      parsedScore = parseMidiScore(await response.arrayBuffer());
    } else {
      parsedScore = parseMusicXmlScore(await response.text());
    }
    importParsedScore(parsedScore);
  }

  function applyPreset(name) {
    drawData.fill(0);
    clearImportedScoreEvents();
    resetUndoHistory();
    const cols = trackColCount();

    if (name === "riser") {
      stampLine(
        { col: 8, row: rowFromFreq(440) },
        { col: cols - 18, row: rowFromFreq(660) },
        1,
        drawData
      );
      stampLine(
        { col: 8, row: rowFromFreq(880) },
        { col: cols - 18, row: rowFromFreq(1320) },
        1,
        drawData
      );
      stampGaussian({ col: cols * 0.76, row: rowFromFreq(700) }, 0.52, 0.8, drawData);
    } else if (name === "chord-bloom") {
      const freqs = [220, 277.18, 329.63, 440, 554.37];
      for (let i = 0; i < freqs.length; i += 1) {
        const row = rowFromFreq(freqs[i]);
        for (let col = 30; col < cols - 30; col += 26) {
          stampGaussian({ col, row }, 0.18 + i * 0.016, 0.72, drawData);
        }
      }
    } else if (name === "rain") {
      for (let i = 0; i < 220; i += 1) {
        const point = {
          col: Math.random() * (cols - 1),
          row: Math.random() * (GRID_ROWS - 1)
        };
        stampGaussian(point, 0.1 + Math.random() * 0.18, 0.42, drawData);
      }
      for (let i = 0; i < 4; i += 1) {
        stampLine(
          { col: Math.random() * cols * 0.25, row: rowFromFreq(1500 + i * 300) },
          { col: cols * (0.6 + Math.random() * 0.25), row: rowFromFreq(350 + i * 70) },
          1,
          drawData
        );
      }
    } else if (name === "pulse-lattice") {
      const baseFreqs = [110, 220, 330, 495, 742];
      for (let i = 0; i < baseFreqs.length; i += 1) {
        const row = rowFromFreq(baseFreqs[i]);
        for (let col = 18; col < cols - 18; col += 36) {
          stampBrush({ col, row }, 0.42, 1.85, drawData);
          stampGaussian({ col: col + 3, row }, 0.15, 0.45, drawData);
        }
      }
    }

    markDirty();
    stopPlayback(`Preset "${name}" loaded.`);
    renderCanvas();
  }

  function applyBassLinePreset(name, options = {}) {
    if (!options.preserveBpm && name !== "none") {
      basslineBpmInput.value = String(defaultBasslineBpm(name));
      updateOutputs();
    }
    basslineData.fill(0);
    bassEvents.length = 0;
    state.currentBasslinePreset = name;
    const cols = trackColCount();
    const totalDuration = durationSeconds();
    const presetBpm = basslineBpm();

    function colFromTime(seconds) {
      return clamp((seconds / Math.max(0.001, totalDuration)) * Math.max(0, cols - 1), 0, Math.max(0, cols - 1));
    }

    function beatColSpan(secondsPerBeat) {
      return Math.max(2, (secondsPerBeat / Math.max(0.001, totalDuration)) * Math.max(1, cols - 1));
    }

    function kick(time, fundamental, secondsPerBeat) {
      if (time >= totalDuration) {
        return;
      }
      const centerCol = colFromTime(time);
      const localBeatCols = beatColSpan(secondsPerBeat);
      stampGaussian({ col: centerCol, row: rowFromFreq(fundamental) }, 0.58, 0.5, basslineData);
      stampGaussian({ col: centerCol + 1, row: rowFromFreq(fundamental * 1.8) }, 0.16, 0.4, basslineData);
      stampLine(
        { col: centerCol, row: rowFromFreq(fundamental * 2.2) },
        { col: centerCol + Math.max(2, localBeatCols * 0.18), row: rowFromFreq(fundamental * 1.15) },
        1,
        basslineData
      );
      bassEvents.push({
        type: "kick",
        time,
        freq: fundamental,
        gain: 0.94
      });
    }

    function snare(time) {
      if (time >= totalDuration) {
        return;
      }
      const centerCol = colFromTime(time);
      const freqs = [180, 240, 320, 700, 1200];
      for (let i = 0; i < freqs.length; i += 1) {
        stampGaussian({ col: centerCol + i * 0.35, row: rowFromFreq(freqs[i]) }, 0.13 + i * 0.03, 0.45, basslineData);
      }
      bassEvents.push({
        type: "snare",
        time,
        gain: 0.78
      });
    }

    function hat(time) {
      if (time >= totalDuration) {
        return;
      }
      const centerCol = colFromTime(time);
      const freqs = [1800, 2400, 3200];
      for (let i = 0; i < freqs.length; i += 1) {
        stampGaussian({ col: centerCol + i * 0.2, row: rowFromFreq(freqs[i]) }, 0.08, 0.25, basslineData);
      }
      bassEvents.push({
        type: "hat",
        time,
        gain: 0.34
      });
    }

    function bassNote(startTime, endTime, freq, liftFreq, gain = 0.9) {
      if (startTime >= totalDuration) {
        return;
      }
      const clampedEndTime = Math.min(totalDuration, endTime);
      if (clampedEndTime <= startTime + 0.01) {
        return;
      }
      const startCol = colFromTime(startTime);
      const endCol = colFromTime(clampedEndTime);
      stampLine(
        { col: startCol, row: rowFromFreq(freq) },
        { col: endCol, row: rowFromFreq(freq) },
        1,
        basslineData
      );
      stampLine(
        { col: startCol, row: rowFromFreq(liftFreq) },
        { col: endCol, row: rowFromFreq(freq * 1.03) },
        1,
        basslineData
      );
      bassEvents.push({
        type: "bass",
        time: startTime,
        duration: Math.max(0.06, clampedEndTime - startTime),
        startFreq: Math.max(30, liftFreq),
        endFreq: Math.max(30, freq),
        gain
      });
    }

    function repeatBars(callback, barsPerPhrase = 1) {
      const bpm = presetBpm;
      const secondsPerBeat = 60 / bpm;
      const barDuration = secondsPerBeat * 4;
      const phraseDuration = barDuration * barsPerPhrase;
      for (let phraseStart = 0, phraseIndex = 0; phraseStart < totalDuration; phraseStart += phraseDuration, phraseIndex += 1) {
        callback({
          bpm,
          secondsPerBeat,
          barDuration,
          phraseDuration,
          phraseStart,
          phraseIndex
        });
      }
    }

    if (name === "none") {
      resetUndoHistory();
      markDirty();
      stopPlayback("Bass line cleared.");
      renderCanvas();
      return;
    }

    if (name === "dub-foundation") {
      repeatBars(({ phraseStart, phraseIndex, barDuration, secondsPerBeat }) => {
        const start = phraseStart;
        kick(start + barDuration * 0.04, 46, secondsPerBeat);
        snare(start + barDuration * 0.53);
        hat(start + barDuration * 0.24);
        hat(start + barDuration * 0.74);
        bassNote(start + barDuration * 0.08, start + barDuration * 0.28, 55, 70, 0.88);
        bassNote(start + barDuration * 0.36, start + barDuration * 0.48, 82.41, 98, 0.74);
        bassNote(
          start + barDuration * 0.62,
          start + barDuration * 0.88,
          phraseIndex % 2 === 0 ? 73.42 : 65.41,
          88,
          0.92
        );
      });
    } else if (name === "four-floor") {
      repeatBars(({ phraseStart, barDuration, secondsPerBeat }) => {
        for (let beat = 0; beat < 4; beat += 1) {
          const beatStart = phraseStart + beat * secondsPerBeat;
          kick(beatStart + secondsPerBeat * 0.1, 50, secondsPerBeat);
          hat(beatStart + secondsPerBeat * 0.6);
          if (beat === 1 || beat === 3) {
            snare(beatStart + secondsPerBeat * 0.38);
          }
          const bassFreq = [43.65, 43.65, 49, 55][beat];
          bassNote(
            beatStart + secondsPerBeat * 0.18,
            beatStart + secondsPerBeat * 0.72,
            bassFreq,
            bassFreq * 1.36,
            0.98
          );
        }
      });
    } else if (name === "halfstep-wobble") {
      repeatBars(({ phraseStart, phraseIndex, phraseDuration, secondsPerBeat }) => {
        const start = phraseStart;
        kick(start + phraseDuration * 0.05, 46, secondsPerBeat);
        snare(start + phraseDuration * 0.56);
        hat(start + phraseDuration * 0.28);
        hat(start + phraseDuration * 0.78);
        bassNote(start + phraseDuration * 0.08, start + phraseDuration * 0.2, 46.25, 61.74, 0.94);
        bassNote(start + phraseDuration * 0.26, start + phraseDuration * 0.38, 69.3, 92, 0.78);
        bassNote(start + phraseDuration * 0.44, start + phraseDuration * 0.58, 51.91, 65.41, 0.82);
        bassNote(
          start + phraseDuration * 0.64,
          start + phraseDuration * 0.92,
          phraseIndex % 2 === 0 ? 61.74 : 46.25,
          77.78,
          1.02
        );
      }, 2);
    } else if (name === "electro-break") {
      repeatBars(({ phraseStart, barDuration, secondsPerBeat }) => {
        const stepDuration = barDuration / 6;
        const bassPattern = [43.65, 65.41, 55, 61.74, 49, 55];
        for (let step = 0; step < 6; step += 1) {
          const stepStart = phraseStart + step * stepDuration;
          const center = stepStart + stepDuration * 0.12;
          if (step === 0 || step === 4) {
            kick(center, 48, secondsPerBeat);
          }
          if (step === 3) {
            snare(center + stepDuration * 0.12);
          }
          if (step % 2 === 1) {
            hat(center + stepDuration * 0.35);
          }
          if (step % 3 !== 2) {
            const freq = bassPattern[step % bassPattern.length];
            bassNote(
              center + stepDuration * 0.1,
              center + stepDuration * 0.6,
              freq,
              freq * 1.3,
              step === 0 ? 1.02 : 0.82
            );
          }
        }
      });
    }

    resetUndoHistory();
    markDirty();
    stopPlayback(`Bass line preset "${name}" loaded.`);
    renderCanvas();
  }

  function handlePointerDown(event) {
    const point = canvasToGrid(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    if (state.tool === "pointer") {
      if (state.isPlaying) {
        pausePlayback();
      }
      state.pointerId = event.pointerId;
      state.isScrubbingPlayhead = true;
      state.drawing = false;
      state.currentPointer = point;
      state.pointerInside = true;
      setPlayheadFromColumn(point.col);
      updateCursorReadout(point);
      canvas.setPointerCapture(event.pointerId);
      setStatus(timelinePositionStatus());
      renderCanvas();
      return;
    }
    const scorePoint = state.tool === "note" ? snapPointToScoreMidi(point) : point;
    if (state.tool === "note" && !scorePoint) {
      return;
    }

    if (isNearPlayhead(point)) {
      state.pointerId = event.pointerId;
      state.isScrubbingPlayhead = true;
      state.drawing = false;
      state.currentPointer = point;
      state.pointerInside = true;
      setPlayheadFromColumn(point.col);
      updateCursorReadout(point);
      canvas.setPointerCapture(event.pointerId);
      setStatus(`Paused at ${state.pausedOffsetSeconds.toFixed(2)} s. Drag the playhead to shift the current time slice.`);
      renderCanvas();
      return;
    }

    if (state.isPlaying) {
      stopPlayback("Playback stopped for editing.");
    }

    if (state.tool === "note") {
      const scoreHit = hitTestScoreNote(point);
      if (scoreHit) {
        beginUndoGesture();
        state.pointerId = event.pointerId;
        state.drawing = true;
        state.lastPointer = scorePoint || point;
        state.currentPointer = scorePoint || point;
        state.pointerInside = true;
        state.scoreEditMode = scoreHit.mode;
        state.scoreEditIndex = scoreHit.index;
        state.scoreEditOriginalNote = { ...scoreHit.note };
        state.scoreEditStartPoint = point;
        state.scoreEditStartMidi = nearestScoreMidiForPoint(point);
        updateCursorReadout(scorePoint || point);
        canvas.setPointerCapture(event.pointerId);
        updateCanvasCursor(scorePoint || point);
        renderCanvas();
        return;
      }
    }

    beginUndoGesture();

    state.pointerId = event.pointerId;
    state.drawing = true;
    state.lastPointer = scorePoint;
    state.currentPointer = scorePoint;
    state.pointerInside = true;
    updateCursorReadout(scorePoint);
    canvas.setPointerCapture(event.pointerId);

    if (state.tool === "line" || state.tool === "note") {
      state.lineStart = scorePoint;
      state.linePreview = scorePoint;
      if (state.tool === "note") {
        state.noteDurationUnlocked = false;
        state.noteUnlockCol = null;
        state.scoreEditMode = null;
        state.scoreEditIndex = -1;
        state.scoreEditOriginalNote = null;
        state.scoreEditStartPoint = null;
        state.scoreEditStartMidi = null;
      }
      renderCanvas();
      return;
    }

    const dirtyLayers = applyTool(scorePoint, 16);
    markToolEditDirty(dirtyRangeFromPoints(scorePoint), dirtyLayers);
    renderCanvas();
    startHoldLoop();
  }

  function handlePointerMove(event) {
    const point = canvasToGrid(event.clientX, event.clientY);
    const scorePoint = point && state.tool === "note" ? snapPointToScoreMidi(point) : point;
    state.pointerInside = Boolean(scorePoint || point);
    state.currentPointer = scorePoint || point;
    updateCursorReadout(scorePoint || point);
    updateCanvasCursor(scorePoint || point);

    if (!point) {
      renderCanvas();
      return;
    }

    if (state.isScrubbingPlayhead && state.pointerId === event.pointerId) {
      setPlayheadFromColumn(point.col);
      setStatus(timelinePositionStatus());
    } else if (state.drawing && state.pointerId === event.pointerId) {
      if (state.scoreEditMode) {
        const originalNote = state.scoreEditOriginalNote;
        if (applyScoreNoteEdit(point) && originalNote) {
          const currentNote = state.scoreEvents[state.scoreEditIndex];
          const originalSpan = noteRenderSpan(originalNote);
          const currentSpan = noteRenderSpan(currentNote);
          markDirty({
            full: false,
            layers: ["score"],
            rangeStartSec: Math.min(originalSpan.startSec, currentSpan.startSec),
            rangeEndSec: Math.max(originalSpan.endSec, currentSpan.endSec)
          });
        }
      } else if (state.tool === "line") {
        if (event.shiftKey && state.lineStart) {
          const dx = Math.abs(point.col - state.lineStart.col);
          const dy = Math.abs(point.row - state.lineStart.row);
          state.linePreview = dx > dy
            ? { col: point.col, row: state.lineStart.row }
            : { col: state.lineStart.col, row: point.row };
        } else {
          state.linePreview = point;
        }
      } else if (state.tool === "note") {
        state.linePreview = scorePoint;
      } else if (state.lastPointer) {
        const dirtyLayers = paintSegment(state.lastPointer, point, 20);
        markToolEditDirty(dirtyRangeFromPoints(state.lastPointer, point), dirtyLayers);
      }
      state.lastPointer = scorePoint || point;
    }

    renderCanvas();
  }

  function handlePointerUp(event) {
    if (state.pointerId !== event.pointerId) {
      return;
    }

    if (state.isScrubbingPlayhead) {
      state.isScrubbingPlayhead = false;
      state.pointerId = null;
      updateCanvasCursor(state.currentPointer);
      renderCanvas();
      return;
    }

    if (state.scoreEditMode) {
      state.scoreEvents = mergeAdjacentNoteEvents(state.scoreEvents);
    } else if (state.tool === "line" && state.lineStart && state.linePreview) {
      stampLine(state.lineStart, state.linePreview, 1);
      markToolEditDirty(dirtyRangeFromPoints(state.lineStart, state.linePreview), {
        draw: true,
        bass: false,
        score: false
      });
    } else if (state.tool === "note" && state.lineStart && state.linePreview) {
      const addedNote = addScoreNoteEvent(state.lineStart, state.linePreview);
      if (addedNote) {
        const span = noteRenderSpan(addedNote);
        markDirty({
          full: false,
          layers: ["score"],
          rangeStartSec: span.startSec,
          rangeEndSec: span.endSec
        });
      }
      state.noteDurationUnlocked = false;
      state.noteUnlockCol = null;
    }

    state.drawing = false;
    state.lastPointer = null;
    state.pointerId = null;
    state.lineStart = null;
    state.linePreview = null;
    state.noteDurationUnlocked = false;
    state.noteUnlockCol = null;
    state.scoreEditMode = null;
    state.scoreEditIndex = -1;
    state.scoreEditOriginalNote = null;
    state.scoreEditStartPoint = null;
    state.scoreEditStartMidi = null;
    stopHoldLoop();
    commitUndoGesture();
    updateCanvasCursor(state.currentPointer);
    renderCanvas();
  }

  function handlePointerLeave() {
    state.pointerInside = false;
    updateCursorReadout(null);
    updateCanvasCursor(null);
    renderCanvas();
  }

  function handleCanvasWheel(event) {
    const point = canvasToGrid(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    event.preventDefault();
    if (event.ctrlKey) {
      const zoomFactor = event.deltaY < 0 ? 0.88 : 1.14;
      zoomFrequencyAtRow(point.row, zoomFactor);
      return;
    }
    const zoomFactor = event.deltaY < 0 ? 0.84 : 1.19;
    zoomViewAtColumn(point.col, zoomFactor);
  }

  function setViewOffset(nextOffset, options = {}) {
    const next = clamp(Number(nextOffset) || 0, 0, maxViewOffset());
    const changed = Math.abs(next - state.viewOffsetCol) > 0.0001;
    state.viewOffsetCol = next;
    if (editorViewSelect) {
      state.editorView = editorViewSelect.value || "spectrogram";
    }
    if (renderModeSelect) {
      state.renderMode = renderModeSelect.value || "geometry";
    }
    if (noteBackendSelect) {
      state.noteBackend = noteBackendSelect.value || "procedural";
    }
    if (phaseDiagnosticsToggle) {
      state.showPhaseDiagnostics = phaseDiagnosticsToggle.checked;
    }

    updateOutputs();
    if (options.render !== false || !changed) {
      renderCanvas();
    }
  }

  function followPlaybackViewport(options = {}) {
    const playCol = playheadColumn();
    const halfWindow = Math.max(1, visibleColCount() - 1) * 0.5;
    const targetOffset = clamp(playCol - halfWindow, 0, maxViewOffset());
    const shouldAdvance = targetOffset > state.viewOffsetCol + 0.0001;
    const shouldRealignBackward = options.allowBackward && targetOffset < state.viewOffsetCol - 0.0001;
    if (shouldAdvance || shouldRealignBackward) {
      setViewOffset(targetOffset, { render: false });
    }
  }

  function trackOffsetFromClientX(clientX, thumbOffsetPx) {
    const rect = timelineTrack.getBoundingClientRect();
    const metrics = timelineMetrics(rect.width);
    if (metrics.maxOffset <= 0 || metrics.travel <= 0) {
      return 0;
    }
    const left = clamp(clientX - rect.left - thumbOffsetPx, 0, metrics.travel);
    return (left / metrics.travel) * metrics.maxOffset;
  }

  function handleTimelinePointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const thumbRect = timelineThumb.getBoundingClientRect();
    const hitLeftHandle = event.target === timelineThumbHandleLeft;
    const hitRightHandle = event.target === timelineThumbHandleRight;
    const hitThumb = event.target === timelineThumb
      || hitLeftHandle
      || hitRightHandle
      || (event.clientX >= thumbRect.left && event.clientX <= thumbRect.right
        && event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom);

    if (hitLeftHandle) {
      state.timelineDragMode = "resize-left";
    } else if (hitRightHandle) {
      state.timelineDragMode = "resize-right";
    } else if (hitThumb) {
      state.timelineDragMode = "move";
      state.timelineDragOffsetPx = clamp(event.clientX - thumbRect.left, 0, thumbRect.width || 0);
    } else {
      state.timelineDragMode = "";
      state.timelineDragOffsetPx = thumbRect.width * 0.5;
      setViewOffset(trackOffsetFromClientX(event.clientX, state.timelineDragOffsetPx));
    }

    state.isDraggingTimelineThumb = true;
    timelineThumb.classList.add("is-dragging");
    timelineTrack.setPointerCapture(event.pointerId);
  }

  function handleTimelinePointerMove(event) {
    if (!state.isDraggingTimelineThumb) {
      return;
    }
    const minSpan = Math.min(MIN_VIEW_COLS, trackColCount());
    if (state.timelineDragMode === "resize-left") {
      const rightEdge = state.viewOffsetCol + visibleColCount();
      const nextLeft = clamp(Math.round(trackColFromClientX(event.clientX)), 0, Math.max(0, rightEdge - minSpan));
      setViewWindow(nextLeft, rightEdge - nextLeft);
      return;
    }
    if (state.timelineDragMode === "resize-right") {
      const leftEdge = state.viewOffsetCol;
      const nextRight = clamp(Math.round(trackColFromClientX(event.clientX)), Math.min(trackColCount(), leftEdge + minSpan), trackColCount());
      setViewWindow(leftEdge, nextRight - leftEdge);
      return;
    }
    setViewOffset(trackOffsetFromClientX(event.clientX, state.timelineDragOffsetPx));
  }

  function releaseTimelineThumb(event) {
    if (!state.isDraggingTimelineThumb) {
      return;
    }
    state.isDraggingTimelineThumb = false;
    state.timelineDragMode = "";
    timelineThumb.classList.remove("is-dragging");
    timelineThumb.classList.remove("is-resizing-left", "is-resizing-right");
    if (event && timelineTrack.hasPointerCapture(event.pointerId)) {
      timelineTrack.releasePointerCapture(event.pointerId);
    }
  }

  function handleTimelineKeydown(event) {
    const smallStep = Math.max(4, Math.round(visibleColCount() * 0.08));
    const pageStep = Math.max(12, Math.round(visibleColCount() * 0.9));
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setViewOffset(state.viewOffsetCol - smallStep);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setViewOffset(state.viewOffsetCol + smallStep);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      setViewOffset(state.viewOffsetCol - pageStep);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      setViewOffset(state.viewOffsetCol + pageStep);
    } else if (event.key === "Home") {
      event.preventDefault();
      setViewOffset(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setViewOffset(maxViewOffset());
    }
  }

  function closeOtherMenus(activeMenu) {
    for (const menu of menuDropdowns) {
      if (menu !== activeMenu) {
        menu.removeAttribute("open");
      }
    }
  }

  function closeMenuForElement(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    const menu = element.closest(".menu-dropdown");
    if (menu instanceof HTMLElement) {
      menu.removeAttribute("open");
    }
  }

  function bindControls() {
    const redrawInputs = [
      durationInput,
      minFreqInput,
      maxFreqInput,
      sizeInput,
      strengthInput,
      densityInput,
      guitarPluckInput,
      guitarBodyInput,
      pianoHammerInput,
      pianoCouplingInput
    ].filter(Boolean);
    for (const input of redrawInputs) {
      input.addEventListener("input", () => {
        if (input === minFreqInput || input === maxFreqInput) {
          setFrequencyRange(Number(minFreqInput.value), Number(maxFreqInput.value));
        }
        if (input === durationInput) {
          clampViewSpan();
          clampViewOffset();
        }
        updateOutputs();
        if (input === durationInput && isReloadableBasslinePreset(state.currentBasslinePreset)) {
          applyBassLinePreset(state.currentBasslinePreset, { preserveBpm: true });
          return;
        }
        markDirty({ resetFrequencyReference: input !== minFreqInput && input !== maxFreqInput });
        renderCanvas();
      });
    }

    if (editorViewSelect) {
      editorViewSelect.addEventListener("input", () => {
        if (currentScoreProfile()) {
          state.scoreViewFreqs[state.editorView] = {
            min: effectiveMinFrequency(),
            max: effectiveMaxFrequency()
          };
        } else {
          state.freeMinFreq = effectiveMinFrequency();
          state.freeMaxFreq = effectiveMaxFrequency();
        }
        state.editorView = editorViewSelect.value;
        applyEditorViewSettings();
        updateOutputs();
        markDirty();
        if (state.isPlaying) {
          const viewLabel = currentScoreProfile() ? currentScoreProfile().label : "free spectrogram";
          stopPlayback(`Editor view switched to ${viewLabel}.`);
        } else {
          renderCanvas();
        }
      });
    }

    if (scoreImportButton && scoreImportInput) {
      scoreImportButton.addEventListener("click", () => {
        closeMenuForElement(scoreImportButton);
        scoreImportInput.click();
      });
      scoreImportInput.addEventListener("change", async () => {
        const [file] = Array.from(scoreImportInput.files || []);
        if (!file) {
          return;
        }
        try {
          setStatus(`Importing score from ${file.name}...`);
          await importScoreFile(file);
        } catch (error) {
          reportBootError(error);
          setStatus(`Score import failed: ${error.message || String(error)}`);
        } finally {
          scoreImportInput.value = "";
        }
      });
    }

    if (scorePresetButton && scorePresetSelect) {
      scorePresetButton.addEventListener("click", async () => {
        const assetPath = scorePresetSelect.value;
        if (!assetPath) {
          return;
        }
        closeMenuForElement(scorePresetButton);
        try {
          const presetName = decodeURIComponent(assetPath.split("/").pop() || assetPath);
          setStatus(`Loading bundled score ${presetName}...`);
          await importBundledScorePreset(assetPath);
        } catch (error) {
          reportBootError(error);
          setStatus(`Bundled score load failed: ${error.message || String(error)}`);
        }
      });
    }

    if (projectSaveButton) {
      projectSaveButton.addEventListener("click", () => {
        saveSoundpaintProject();
        closeMenuForElement(projectSaveButton);
      });
    }
    if (projectLoadButton && projectLoadInput) {
      projectLoadButton.addEventListener("click", () => {
        closeMenuForElement(projectLoadButton);
        projectLoadInput.click();
      });
      projectLoadInput.addEventListener("change", async () => {
        const [file] = Array.from(projectLoadInput.files || []);
        if (!file) {
          return;
        }
        try {
          setStatus(`Loading project from ${file.name}...`);
          await loadSoundpaintProject(file);
        } catch (error) {
          reportBootError(error);
          setStatus(`Project load failed: ${error.message || String(error)}`);
        } finally {
          projectLoadInput.value = "";
        }
      });
    }
    if (newTabButton) {
      newTabButton.addEventListener("click", addNewTab);
    }
    if (newLayerButton) {
      newLayerButton.addEventListener("click", addNewLayer);
    }
    if (pasteLayerButton) {
      pasteLayerButton.addEventListener("click", pasteClipboardLayer);
    }

    basslineBpmInput.addEventListener("input", () => {
      updateOutputs();
      if (isReloadableBasslinePreset(state.currentBasslinePreset)) {
        applyBassLinePreset(state.currentBasslinePreset, { preserveBpm: true });
      }
    });

    if (timelineTrack && timelineThumb) {
      timelineTrack.addEventListener("pointerdown", handleTimelinePointerDown);
      timelineTrack.addEventListener("pointermove", handleTimelinePointerMove);
      timelineTrack.addEventListener("pointerup", releaseTimelineThumb);
      timelineTrack.addEventListener("pointercancel", releaseTimelineThumb);
      timelineTrack.addEventListener("keydown", handleTimelineKeydown);
    } else if (timelineInput) {
      timelineInput.addEventListener("input", () => {
        state.viewOffsetCol = Number(timelineInput.value);
        updateOutputs();
        renderCanvas();
      });
    }

    gainInput.addEventListener("input", () => {
      updateOutputs();
      scheduleSessionProjectSave();
      if (state.gainNode) {
        state.gainNode.gain.value = Number(gainInput.value);
      }
    });

    if (loopButton) {
      loopButton.addEventListener("click", () => {
        state.loopPlayback = !state.loopPlayback;
        updateOutputs();
        scheduleSessionProjectSave();
        if (state.sourceNode) {
          state.sourceNode.loop = state.loopPlayback;
        }
        setStatus(state.loopPlayback ? "Loop playback enabled." : "Loop playback disabled.");
      });
    }

    if (renderModeSelect) {
      renderModeSelect.addEventListener("input", () => {
        state.renderMode = renderModeSelect.value;
        updateOutputs();
        markDirty();
        if (state.isPlaying) {
          stopPlayback(`Render mode switched to ${renderModeName(state.renderMode)}.`);
        } else {
          renderCanvas();
        }
      });
    }

    if (noteBackendSelect) {
      noteBackendSelect.addEventListener("input", () => {
        state.noteBackend = noteBackendSelect.value || "procedural";
        updateOutputs();
        markDirty();
        if (state.isPlaying) {
          stopPlayback(`Note backend switched to ${noteBackendName(state.noteBackend)}.`);
        } else {
          renderCanvas();
        }
      });
    }

    if (frequencyAxisSelect) {
      frequencyAxisSelect.addEventListener("input", () => {
        setFrequencyAxisMode(frequencyAxisSelect.value);
        updateOutputs();
        markDirty();
        if (state.isPlaying) {
          stopPlayback(`Frequency axis switched to ${frequencyAxisName()}.`);
        } else {
          renderCanvas();
        }
      });
    }

    if (phaseDiagnosticsToggle) {
      phaseDiagnosticsToggle.addEventListener("change", () => {
        state.showPhaseDiagnostics = phaseDiagnosticsToggle.checked;
        scheduleSessionProjectSave();
        renderCanvas();
      });
    }

    if (sampleDebugToggle) {
      sampleDebugToggle.addEventListener("change", () => {
        state.showSampleDebug = sampleDebugToggle.checked;
        updateOutputs();
        scheduleSessionProjectSave();
      });
    }

    if (drawingToolsToggle) {
      drawingToolsToggle.addEventListener("change", () => {
        state.showDrawingTools = drawingToolsToggle.checked;
        updateOutputs();
        scheduleSessionProjectSave();
      });
    }

    gridToggle.addEventListener("change", () => {
      scheduleSessionProjectSave();
      renderCanvas();
    });

    let playButtonPointerHandled = false;
    const togglePlaybackFromControl = () => {
      if (transportIsActive()) {
        pausePlayback();
      } else {
        playAudio();
      }
    };
    playButton.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      playButtonPointerHandled = true;
      togglePlaybackFromControl();
    });
    playButton.addEventListener("click", () => {
      if (playButtonPointerHandled) {
        playButtonPointerHandled = false;
        return;
      }
      togglePlaybackFromControl();
    });
    stopButton.addEventListener("click", () => {
      stopPlayback("Playback stopped.");
      resetViewportToEditorDefault();
    });
    renderButton.addEventListener("click", () => renderIfNeeded("audio preview"));
    exportButton.addEventListener("click", exportWav);
    if (undoButton) {
      undoButton.addEventListener("click", undoLastGesture);
    }
    clearButton.addEventListener("click", clearSpectrogram);
    presetButton.addEventListener("click", () => applyPreset(presetSelect.value));
    basslineButton.addEventListener("click", () => applyBassLinePreset(basslineSelect.value));
    clearBasslineButton.addEventListener("click", clearBassLine);
    if (toolSettingsButton) {
      toolSettingsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setToolSettingsOpen(!state.toolSettingsOpen);
      });
    }
    if (toolSettingsPopover) {
      toolSettingsPopover.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
    }

    for (const menu of menuDropdowns) {
      menu.addEventListener("toggle", () => {
        if (menu.open) {
          closeOtherMenus(menu);
        }
      });
    }
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!menuDropdowns.some((menu) => menu.contains(target))) {
        closeOtherMenus(null);
      }
    });

    for (const button of toolButtons) {
      button.addEventListener("click", () => setTool(button.dataset.tool));
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("wheel", handleCanvasWheel, { passive: false });
    window.addEventListener("resize", () => {
      updateOutputs();
      renderCanvas();
    });
    window.addEventListener("pagehide", persistSessionProjectNow);
    window.addEventListener("pointerdown", (event) => {
      if (!state.toolSettingsOpen || !toolSettingsWrap) {
        return;
      }
      if (!toolSettingsWrap.contains(event.target)) {
        setToolSettingsOpen(false);
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.toolSettingsOpen) {
        setToolSettingsOpen(false);
        return;
      }
      if (event.key === "F2") {
        const target = event.target;
        if (target && /input|select|textarea/i.test(target.tagName)) {
          return;
        }
        event.preventDefault();
        renameHoveredTarget();
        return;
      }
      if (event.target && /input|select|textarea|button/i.test(event.target.tagName)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoLastGesture();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (transportIsActive()) {
          pausePlayback();
        } else {
          playAudio();
        }
        return;
      }

      if (event.key.toLowerCase() === "v") {
        setTool("pointer");
        return;
      }

      if (event.key >= "1" && event.key <= "6") {
        const index = Number(event.key) - 1;
        const target = ["brush", "spray", "gaussian", "line", "erase", "note"][index];
        setTool(target);
        renderCanvas();
        return;
      }

      if (event.key === "[") {
        sizeInput.value = String(Math.max(Number(sizeInput.min), Number(sizeInput.value) - 2));
        updateOutputs();
        renderCanvas();
        return;
      }

      if (event.key === "]") {
        sizeInput.value = String(Math.min(Number(sizeInput.max), Number(sizeInput.value) + 2));
        updateOutputs();
        renderCanvas();
        return;
      }

      if (event.key === "-") {
        strengthInput.value = String((Math.max(Number(strengthInput.min), Number(strengthInput.value) - 0.05)).toFixed(2));
        updateOutputs();
        return;
      }

      if (event.key === "=" || event.key === "+") {
        strengthInput.value = String((Math.min(Number(strengthInput.max), Number(strengthInput.value) + 0.05)).toFixed(2));
        updateOutputs();
        return;
      }

      if (event.key.toLowerCase() === "c") {
        clearSpectrogram();
        return;
      }

      if (event.key.toLowerCase() === "s") {
        stopPlayback("Playback stopped.");
        return;
      }

      if (event.key.toLowerCase() === "g") {
        gridToggle.checked = !gridToggle.checked;
        renderCanvas();
      }
    });
  }

    if (editorViewSelect) {
      state.editorView = editorViewSelect.value || "spectrogram";
    }
    if (frequencyAxisSelect) {
      state.frequencyAxis = frequencyAxisSelect.value || "log";
    }
    applyEditorViewSettings();
    updateOutputs();
    bindControls();
    const initialTab = createBlankTab("Project-1");
    state.tabs = [initialTab];
    state.currentTabId = initialTab.id;
    bindActiveLayer(initialTab.layers[0]);
    updateWorkspaceUi();
    if (!restoreSessionProjectIfAvailable()) {
      applyPreset("riser");
    }
    setTool("pointer");
    window.__spectrogramBooted = true;
  } catch (error) {
    reportBootError(error);
  }
})();
