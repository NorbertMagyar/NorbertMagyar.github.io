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
    const playButton = document.getElementById("play-btn");
    const pauseButton = document.getElementById("pause-btn");
    const stopButton = document.getElementById("stop-btn");
    const renderButton = document.getElementById("render-btn");
    const exportButton = document.getElementById("export-btn");
    const clearButton = document.getElementById("clear-btn");
    const presetButton = document.getElementById("preset-btn");
    const presetSelect = document.getElementById("preset-select");
    const basslineButton = document.getElementById("bassline-btn");
    const clearBasslineButton = document.getElementById("clear-bassline-btn");
    const basslineSelect = document.getElementById("bassline-select");
    const basslineBpmInput = document.getElementById("bassline-bpm-input");
    const renderModeSelect = document.getElementById("render-mode-select");
    const renderModeLabel = document.getElementById("render-mode-label");
    const renderModeDescriptionEl = document.getElementById("render-mode-description");
    const phaseDiagnosticsToggle = document.getElementById("phase-diagnostics-toggle");
    const timelineTrack = document.getElementById("timeline-track");
    const timelineThumb = document.getElementById("timeline-thumb");
    const timelineInput = document.getElementById("timeline-input");
    const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));

    const durationInput = document.getElementById("duration-input");
    const minFreqInput = document.getElementById("minfreq-input");
    const maxFreqInput = document.getElementById("maxfreq-input");
    const gainInput = document.getElementById("gain-input");
    const sizeInput = document.getElementById("size-input");
    const strengthInput = document.getElementById("strength-input");
    const densityInput = document.getElementById("density-input");
    const loopToggle = document.getElementById("loop-toggle");
    const gridToggle = document.getElementById("grid-toggle");

    const durationOut = document.getElementById("duration-out");
    const minFreqOut = document.getElementById("minfreq-out");
    const maxFreqOut = document.getElementById("maxfreq-out");
    const gainOut = document.getElementById("gain-out");
    const sizeOut = document.getElementById("size-out");
    const strengthOut = document.getElementById("strength-out");
    const densityOut = document.getElementById("density-out");
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
    const drawData = new Float32Array(GRID_COLS * GRID_ROWS);
    const basslineData = new Float32Array(GRID_COLS * GRID_ROWS);
    const bassEvents = [];
    const margins = { left: 74, right: 28, top: 26, bottom: 54 };

    const state = {
      tool: "brush",
      pointerInside: false,
      drawing: false,
      lastPointer: null,
      currentPointer: null,
      lineStart: null,
      linePreview: null,
      pointerId: null,
      dirty: true,
      renderedBuffer: null,
      renderedWav: null,
      renderToken: 0,
      isPlaying: false,
      isPaused: false,
      playheadRatio: 0,
      pausedOffsetSeconds: 0,
      isScrubbingPlayhead: false,
      isDraggingTimelineThumb: false,
      timelineDragOffsetPx: 0,
      viewOffsetCol: 0,
      rafId: 0,
      animationHoldId: 0,
      holdStartMs: 0,
      lastHoldMs: 0,
      audioContext: null,
      gainNode: null,
      sourceNode: null,
      playStartedAt: 0,
      playDurationSeconds: durationSeconds(),
      bassEvents,
      currentBasslinePreset: "none",
      renderMode: "geometry",
      showPhaseDiagnostics: false,
      loopPlayback: false,
      dataVersion: 0,
      diagnosticsCache: null,
      latestRenderInfo: null,
      lastPlaybackLoopIndex: 0
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
    return Number(minFreqInput.value);
  }

  function maxFrequency() {
    return Number(maxFreqInput.value);
  }

  function brushRadiusCells() {
    return (Number(sizeInput.value) / plotWidth()) * visibleColCount();
  }

  function currentStrength() {
    return Number(strengthInput.value);
  }

  function currentDensity() {
    return Number(densityInput.value);
  }

  function basslineBpm() {
    return Number(basslineBpmInput.value);
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
    return 132;
  }

  function isReloadableBasslinePreset(name) {
    return name !== "none" && name !== "custom";
  }

  function renderModeName(mode) {
    if (mode === "independent") {
      return "Independent oscillators";
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

  function trackColCount() {
    return clamp(Math.round(durationSeconds() * COLS_PER_SECOND), VIEW_COLS, GRID_COLS);
  }

  function visibleColCount() {
    return Math.min(VIEW_COLS, trackColCount());
  }

  function maxViewOffset() {
    return Math.max(0, trackColCount() - visibleColCount());
  }

  function clampViewOffset() {
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
    const minThumbWidth = Math.min(Math.max(36, safeTrackWidth * 0.08), safeTrackWidth || 36);
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

  function transportDuration() {
    if (state.renderedBuffer) {
      return state.renderedBuffer.duration;
    }
    return state.playDurationSeconds || durationSeconds();
  }

  function setPlayheadRatio(ratio) {
    state.playheadRatio = clamp(ratio, 0, 1);
    state.pausedOffsetSeconds = state.playheadRatio * transportDuration();
  }

  function setPlayheadFromColumn(col) {
    setPlayheadRatio(col / Math.max(1, trackColCount() - 1));
  }

  function defaultCanvasCursor() {
    return state.tool === "line" ? "cell" : "crosshair";
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

  function updateCanvasCursor(point) {
    canvas.style.cursor = isNearPlayhead(point) ? "ew-resize" : defaultCanvasCursor();
  }

  function markDirty() {
    state.dirty = true;
    state.renderedBuffer = null;
    state.renderedWav = null;
    state.dataVersion += 1;
    state.diagnosticsCache = null;
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
    minFreqOut.textContent = `${Math.round(minFrequency())} Hz`;
    maxFreqOut.textContent = `${Math.round(maxFrequency())} Hz`;
    gainOut.textContent = Number(gainInput.value).toFixed(2);
    sizeOut.textContent = `${Math.round(Number(sizeInput.value))} px`;
    strengthOut.textContent = currentStrength().toFixed(2);
    densityOut.textContent = `${Math.round(currentDensity())}`;
    basslineBpmOut.textContent = `${Math.round(basslineBpm())}`;
    if (renderModeSelect) {
      renderModeSelect.value = state.renderMode;
      renderModeSelect.title = renderModeDescription(state.renderMode);
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
    if (loopToggle) {
      loopToggle.checked = state.loopPlayback;
    }
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
    const metrics = timelineMetrics();
    const ratio = metrics.maxOffset > 0 ? state.viewOffsetCol / metrics.maxOffset : 0;
    const left = metrics.travel * ratio;
    timelineThumb.style.width = `${metrics.thumbWidth}px`;
    timelineThumb.style.transform = `translateX(${left}px)`;
    timelineTrack.setAttribute("aria-valuemin", "0");
    timelineTrack.setAttribute("aria-valuemax", String(metrics.maxOffset));
    timelineTrack.setAttribute("aria-valuenow", String(Math.round(state.viewOffsetCol)));
    timelineTrack.setAttribute("aria-valuetext", timelineOut.textContent);
  }

  function freqFromRow(row) {
    const minFreq = minFrequency();
    const maxFreq = Math.max(minFreq + 1, maxFrequency());
    const ratio = 1 - row / (GRID_ROWS - 1);
    return minFreq * Math.pow(maxFreq / minFreq, ratio);
  }

  function rowFromFreq(freq) {
    const minFreq = minFrequency();
    const maxFreq = Math.max(minFreq + 1, maxFrequency());
    const clamped = clamp(freq, minFreq, maxFreq);
    const ratio = Math.log(clamped / minFreq) / Math.log(maxFreq / minFreq);
    return clamp(Math.round((1 - ratio) * (GRID_ROWS - 1)), 0, GRID_ROWS - 1);
  }

  function colFromTime(seconds) {
    return clamp(
      (seconds / Math.max(0.001, durationSeconds())) * Math.max(0, trackColCount() - 1),
      0,
      Math.max(0, trackColCount() - 1)
    );
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
    if (col < 0 || row < 0 || col >= trackColCount() || row >= GRID_ROWS) {
      return 0;
    }
    return layer[gridIndex(col, row)];
  }

  function combinedAmplitude(col, row) {
    return clamp(amplitudeAt(drawData, col, row) + amplitudeAt(basslineData, col, row), 0, 1);
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

  function repaintOffscreen() {
    const pixels = pixelImage.data;
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let viewCol = 0; viewCol < VIEW_COLS; viewCol += 1) {
        const col = visibleStartCol() + viewCol;
        const bass = col < trackColCount() ? amplitudeAt(basslineData, col, row) : 0;
        const draw = col < trackColCount() ? amplitudeAt(drawData, col, row) : 0;
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
      for (let i = 1; i < 6; i += 1) {
        const y = y0 + (h * i) / 6;
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + w, y);
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(214, 232, 255, 0.32)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x0 + w * 0.5, y0);
      ctx.lineTo(x0 + w * 0.5, y0 + h);
      ctx.moveTo(x0, y0 + h * 0.5);
      ctx.lineTo(x0 + w, y0 + h * 0.5);
      ctx.stroke();
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

    ctx.save();
    ctx.translate(18, y0 + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "700 16px Inter, system-ui, sans-serif";
    ctx.fillText("Frequency", 0, 0);
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
    if (!state.lineStart || !state.linePreview || state.tool !== "line") {
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

  function drawPointerPreview() {
    if (!state.pointerInside || !state.currentPointer || state.tool === "line") {
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
    ctx.drawImage(offscreen, x, y, w, h);
    ctx.restore();

    drawGridAndAxes();
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
    const viewCol = clamp(Math.round(((x - margins.left) / plotWidth()) * Math.max(1, visibleColCount() - 1)), 0, Math.max(0, visibleColCount() - 1));
    const col = clamp(visibleStartCol() + viewCol, 0, trackColCount() - 1);
    const row = clamp(Math.round(((y - margins.top) / plotHeight()) * (GRID_ROWS - 1)), 0, GRID_ROWS - 1);
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
    cursorReadout.textContent = `t = ${time.toFixed(2)} s | f = ${Math.round(freq)} Hz | a = ${amp.toFixed(2)}`;
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
    const touchedBassVisual = hasLayerContentNearPoint(basslineData, point);
    stampBrush(point, -amount, 1.3, drawData);
    stampBrush(point, -amount, 1.3, basslineData);
    const removedBassEvents = removeBassEventsNearPoint(point);
    if (touchedBassVisual || removedBassEvents) {
      state.currentBasslinePreset = "custom";
    }
  }

  function applyTool(point, dtMs, options = {}) {
    const direction = options.erase ? -1 : 1;
    if (state.tool === "brush") {
      stampBrush(point, currentStrength() * 0.1 * (dtMs / 16) * direction, 1.6, drawData);
    } else if (state.tool === "erase") {
      eraseAt(point, dtMs);
    } else if (state.tool === "spray") {
      stampSpray(point, dtMs, direction, drawData);
    } else if (state.tool === "gaussian") {
      const heldSeconds = (performance.now() - state.holdStartMs) / 1000;
      const swell = 0.08 + Math.min(1.4, heldSeconds * 0.85);
      stampGaussian(point, currentStrength() * swell * (dtMs / 16) * 0.08 * direction, 0.55, drawData);
    }
  }

  function paintSegment(from, to, dtMs) {
    const dx = to.col - from.col;
    const dy = to.row - from.row;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const point = {
        col: lerp(from.col, to.col, t),
        row: lerp(from.row, to.row, t)
      };
      applyTool(point, dtMs / steps);
    }
  }

  function stopHoldLoop() {
    if (state.animationHoldId) {
      cancelAnimationFrame(state.animationHoldId);
      state.animationHoldId = 0;
    }
  }

  function holdLoop(now) {
    if (!state.drawing || !state.currentPointer || state.tool === "line") {
      stopHoldLoop();
      return;
    }
    const dt = Math.max(8, now - state.lastHoldMs);
    applyTool(state.currentPointer, dt);
    state.lastHoldMs = now;
    markDirty();
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

  function stopPlayback(statusMessage) {
    stopActiveSource();
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
    renderCanvas();
  }

  function pausePlayback() {
    if (!state.isPlaying || !state.audioContext || !state.renderedBuffer) {
      return;
    }
    let offset = clamp(
      state.audioContext.currentTime - state.playStartedAt,
      0,
      state.renderedBuffer.duration
    );
    if (state.loopPlayback && state.renderedBuffer.duration > 0) {
      offset = ((offset % state.renderedBuffer.duration) + state.renderedBuffer.duration) % state.renderedBuffer.duration;
    }
    stopActiveSource();
    state.isPlaying = false;
    state.isPaused = true;
    state.pausedOffsetSeconds = offset;
    state.playheadRatio = state.renderedBuffer.duration > 0 ? offset / state.renderedBuffer.duration : 0;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    setStatus(`Paused at ${offset.toFixed(2)} s. Drag the playhead to shift the current time slice.`);
    renderCanvas();
  }

  function animatePlayhead() {
    if (!state.isPlaying || !state.audioContext || !state.renderedBuffer) {
      state.rafId = 0;
      return;
    }
    const elapsed = state.audioContext.currentTime - state.playStartedAt;
    const duration = state.renderedBuffer.duration;
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

  function normalizeAudioData(output) {
    let peak = 0;
    for (let i = 0; i < output.length; i += 1) {
      peak = Math.max(peak, Math.abs(output[i]));
    }
    if (peak > 0) {
      const scale = 0.92 / peak;
      for (let i = 0; i < output.length; i += 1) {
        output[i] *= scale;
      }
    }
  }

  function applyEdgeFade(output) {
    const fadeInSamples = Math.min(Math.floor(RENDER_SAMPLE_RATE * 0.02), output.length);
    const fadeOutSamples = Math.min(Math.floor(RENDER_SAMPLE_RATE * 0.08), output.length);
    for (let i = 0; i < fadeInSamples; i += 1) {
      output[i] *= i / Math.max(1, fadeInSamples - 1);
    }
    for (let i = 0; i < fadeOutSamples; i += 1) {
      const idx = output.length - 1 - i;
      output[idx] *= i / Math.max(1, fadeOutSamples - 1);
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
    const totalSamples = Math.max(1, Math.floor(durationSeconds() * RENDER_SAMPLE_RATE));
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
  function buildDrawVoiceAudioData(analysis, tracks = extractDrawVoiceTracks(analysis)) {
    const cols = trackColCount();
    const totalSamples = Math.max(1, Math.floor(durationSeconds() * RENDER_SAMPLE_RATE));
    const output = new Float32Array(totalSamples);

    if (!tracks.length) {
      return output;
    }

    const resetRampSamples = Math.max(16, Math.floor(RENDER_SAMPLE_RATE * 0.0025));
    const transientDecaySamples = Math.max(24, Math.floor(RENDER_SAMPLE_RATE * 0.01));

    for (const track of tracks) {
      let phase1 = track.initialPhase;
      let phase2 = (track.initialPhase * 2) % TAU;
      let phase3 = (track.initialPhase * 3) % TAU;
      let lastFreq = track.freqTrack[track.firstCol] > 0 ? track.freqTrack[track.firstCol] : 220;
      let smoothedFreq = lastFreq;

      for (let col = track.firstCol; col <= track.lastCol; col += 1) {
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
            output[sample] += amp * transientShape * Math.tanh(body * 1.16);
          } else {
            output[sample] += amp * transientShape * Math.tanh(coherentBody * 1.16);
          }
        }

        phase1 = newPhase1;
        phase2 = newPhase2;
        phase3 = newPhase3;
        lastFreq = freq1;
      }
    }

    return output;
  }

  function buildDrawResidualAudioData(analysis, tracks) {
    const cols = trackColCount();
    const totalSamples = Math.max(1, Math.floor(durationSeconds() * RENDER_SAMPLE_RATE));
    const output = new Float32Array(totalSamples);
    const phases = new Float64Array(GRID_ROWS);
    const omegas = new Float64Array(GRID_ROWS);

    for (let row = 0; row < GRID_ROWS; row += 1) {
      omegas[row] = (TAU * freqFromRow(row)) / RENDER_SAMPLE_RATE;
      phases[row] = deterministicPhase(row * 1.618);
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

    for (let col = 0; col < cols; col += 1) {
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
          output[sample] += amplitude * Math.sin(phase);
          phase += omega + phaseDiffusion;
        }
        phases[row] = phase % TAU;
      }
    }

    return output;
  }

  function deterministicNoise(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
    return (x - Math.floor(x)) * 2 - 1;
  }

  function buildBassEventAudioData(totalSamples) {
    const output = new Float32Array(totalSamples);

    function sampleIndexAt(seconds) {
      return clamp(Math.floor(seconds * RENDER_SAMPLE_RATE), 0, Math.max(0, totalSamples - 1));
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

    for (const event of state.bassEvents) {
      const startSample = sampleIndexAt(event.time);

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
          output[startSample + i] += event.gain * (body * bodyEnv + click);
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
          output[startSample + i] += event.gain * (crispNoise * noiseEnv * 0.68 + body * toneEnv);
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
          output[startSample + i] += event.gain * env * (brightNoise * 0.46 + metallic);
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
          output[startSample + i] += event.gain * env * (sub + sawish * 0.65 + bite * 0.32 + transient);
        }
      }
    }

    return output;
  }

  function buildGeometryCoherenceAudioData(analysis, totalSamples, tracks = extractDrawVoiceTracks(analysis)) {
    const drawVoices = buildDrawVoiceAudioData(analysis, tracks);
    const drawResidual = buildDrawResidualAudioData(analysis, tracks);
    const output = new Float32Array(totalSamples);
    for (let i = 0; i < output.length; i += 1) {
      output[i] = drawVoices[i] + drawResidual[i] * 0.82;
    }
    return {
      samples: output,
      tracks
    };
  }

  function buildIndependentOscillatorAudioData(analysis, totalSamples, tracks = extractDrawVoiceTracks(analysis)) {
    const cols = trackColCount();
    const output = new Float32Array(totalSamples);

    for (const track of tracks) {
      let phase1 = deterministicPhase(track.firstCol * 0.71 + track.id * 13.1 + 0.9);
      let phase2 = deterministicPhase(track.firstCol * 0.31 + track.id * 23.7 + 1.7);
      let phase3 = deterministicPhase(track.firstCol * 0.19 + track.id * 31.3 + 2.1);
      let lastFreq = track.freqTrack[track.firstCol] > 0 ? track.freqTrack[track.firstCol] : 220;

      for (let col = track.firstCol; col <= track.lastCol; col += 1) {
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
          output[sample] += amp * (
            Math.sin(phase1) * 0.94
              + Math.sin(phase2) * 0.085
              + Math.sin(phase3) * 0.025
          );
        }

        lastFreq = freq1;
      }
    }

    return {
      samples: output,
      tracks
    };
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
    const clampedFreq = clamp(freq, minFreq, maxFreq);
    const ratio = Math.log(clampedFreq / minFreq) / Math.log(maxFreq / minFreq);
    return clamp((1 - ratio) * (GRID_ROWS - 1), 0, GRID_ROWS - 1);
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

  function reconstructFromMagnitudes(targetMagnitudes, totalSamples, iterations, phaseFrames) {
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

  function buildGriffinLimAudioData(analysis, totalSamples, options = {}) {
    const targetMagnitudes = buildTargetMagnitudeSpectrogram(totalSamples);
    const plan = getStftPlan();
    const frameCount = targetMagnitudes.length;
    const phaseSeed = options.phaseSeedSamples
      ? phaseFramesFromSeed(options.phaseSeedSamples, totalSamples, plan)
      : deterministicPhaseFrames(frameCount, plan);
    const samples = reconstructFromMagnitudes(
      targetMagnitudes,
      totalSamples,
      options.iterations || GRIFFIN_LIM_ITERATIONS,
      phaseSeed
    );
    return {
      samples,
      tracks: options.tracks || [],
      iterations: options.iterations || GRIFFIN_LIM_ITERATIONS
    };
  }

  function buildHybridAudioData(analysis, totalSamples, tracks = extractDrawVoiceTracks(analysis)) {
    const geometry = buildGeometryCoherenceAudioData(analysis, totalSamples, tracks);
    const griffin = buildGriffinLimAudioData(analysis, totalSamples, {
      iterations: HYBRID_GRIFFIN_LIM_ITERATIONS,
      phaseSeedSamples: geometry.samples,
      tracks
    });
    return {
      samples: griffin.samples,
      tracks,
      iterations: HYBRID_GRIFFIN_LIM_ITERATIONS
    };
  }

  function buildAudioData() {
    const analysis = analyzeColumns();
    const totalSamples = Math.max(1, Math.floor(durationSeconds() * RENDER_SAMPLE_RATE));
    state.playDurationSeconds = durationSeconds();
    const tracks = extractDrawVoiceTracks(analysis);
    let drawRender;

    switch (state.renderMode) {
      case "independent":
        drawRender = buildIndependentOscillatorAudioData(analysis, totalSamples, tracks);
        break;
      case "spectral":
        drawRender = buildSpectralBinAudioData(analysis, totalSamples);
        break;
      case "griffin":
        drawRender = buildGriffinLimAudioData(analysis, totalSamples, { tracks });
        break;
      case "hybrid":
        drawRender = buildHybridAudioData(analysis, totalSamples, tracks);
        break;
      case "geometry":
      default:
        drawRender = buildGeometryCoherenceAudioData(analysis, totalSamples, tracks);
        break;
    }

    const bass = buildBassEventAudioData(totalSamples);
    const output = new Float32Array(totalSamples);
    for (let i = 0; i < output.length; i += 1) {
      output[i] = drawRender.samples[i] + bass[i];
    }

    normalizeAudioData(output);
    applyEdgeFade(output);
    return {
      samples: output,
      iterations: drawRender.iterations || 0,
      tracks,
      analysis
    };
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
    if (!state.dirty && state.renderedBuffer) {
      return state.renderedBuffer;
    }
    const token = ++state.renderToken;
    setStatus(`Rendering ${reason} using ${renderModeName(state.renderMode).toLowerCase()}...`);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const startedAt = performance.now();
    const renderResult = buildAudioData();
    const elapsedMs = performance.now() - startedAt;
    if (token !== state.renderToken) {
      return null;
    }

    const audioContext = createAudioContext();
    const samples = renderResult.samples;
    const buffer = audioContext.createBuffer(1, samples.length, RENDER_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0, 0);
    state.renderedBuffer = buffer;
    state.playDurationSeconds = buffer.duration;
    state.latestRenderInfo = {
      mode: state.renderMode,
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
    const modeSummary = renderModeName(state.renderMode);
    const iterationSummary = renderResult.iterations > 0 ? ` · ${renderResult.iterations} iterations` : "";
    setStatus(`Rendered using: ${modeSummary} · ${elapsedMs.toFixed(1)} ms · ${samples.length} samples${iterationSummary}`);
    return buffer;
  }

  async function playAudio() {
    const audioContext = createAudioContext();
    await audioContext.resume();
    const buffer = await renderIfNeeded("audio");
    if (!buffer) {
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
    state.isPlaying = true;
    state.isPaused = false;
    const startOffset = state.pausedOffsetSeconds >= buffer.duration - 0.01 ? 0 : clamp(state.pausedOffsetSeconds, 0, buffer.duration);
    state.playStartedAt = audioContext.currentTime - startOffset;
    state.playheadRatio = buffer.duration > 0 ? startOffset / buffer.duration : 0;
    state.lastPlaybackLoopIndex = 0;
    followPlaybackViewport({ allowBackward: true });
    source.start(0, startOffset);
    setStatus(state.loopPlayback ? "Playing rendered audio in loop mode." : "Playing rendered audio.");
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
    markDirty();
    stopPlayback("Drawing layer cleared.");
    renderCanvas();
  }

  function clearBassLine() {
    basslineData.fill(0);
    bassEvents.length = 0;
    state.currentBasslinePreset = "none";
    markDirty();
    stopPlayback("Bass line cleared.");
    renderCanvas();
  }

  function setTool(tool) {
    state.tool = tool;
    for (const button of toolButtons) {
      button.classList.toggle("is-active", button.dataset.tool === tool);
    }
    updateCanvasCursor(state.currentPointer);
  }

  function applyPreset(name) {
    drawData.fill(0);
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

    markDirty();
    stopPlayback(`Bass line preset "${name}" loaded.`);
    renderCanvas();
  }

  function handlePointerDown(event) {
    const point = canvasToGrid(event.clientX, event.clientY);
    if (!point) {
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

    state.pointerId = event.pointerId;
    state.drawing = true;
    state.lastPointer = point;
    state.currentPointer = point;
    state.pointerInside = true;
    updateCursorReadout(point);
    canvas.setPointerCapture(event.pointerId);

    if (state.tool === "line") {
      state.lineStart = point;
      state.linePreview = point;
      renderCanvas();
      return;
    }

    applyTool(point, 16);
    markDirty();
    renderCanvas();
    startHoldLoop();
  }

  function handlePointerMove(event) {
    const point = canvasToGrid(event.clientX, event.clientY);
    state.pointerInside = Boolean(point);
    state.currentPointer = point;
    updateCursorReadout(point);
    updateCanvasCursor(point);

    if (!point) {
      renderCanvas();
      return;
    }

    if (state.isScrubbingPlayhead && state.pointerId === event.pointerId) {
      setPlayheadFromColumn(point.col);
      setStatus(`Paused at ${state.pausedOffsetSeconds.toFixed(2)} s. Drag the playhead to shift the current time slice.`);
    } else if (state.drawing && state.pointerId === event.pointerId) {
      if (state.tool === "line") {
        if (event.shiftKey && state.lineStart) {
          const dx = Math.abs(point.col - state.lineStart.col);
          const dy = Math.abs(point.row - state.lineStart.row);
          state.linePreview = dx > dy
            ? { col: point.col, row: state.lineStart.row }
            : { col: state.lineStart.col, row: point.row };
        } else {
          state.linePreview = point;
        }
      } else if (state.lastPointer) {
        paintSegment(state.lastPointer, point, 20);
        markDirty();
      }
      state.lastPointer = point;
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

    if (state.tool === "line" && state.lineStart && state.linePreview) {
      stampLine(state.lineStart, state.linePreview, 1);
      markDirty();
    }

    state.drawing = false;
    state.lastPointer = null;
    state.pointerId = null;
    state.lineStart = null;
    state.linePreview = null;
    stopHoldLoop();
    renderCanvas();
  }

  function handlePointerLeave() {
    state.pointerInside = false;
    updateCursorReadout(null);
    updateCanvasCursor(null);
    renderCanvas();
  }

  function setViewOffset(nextOffset, options = {}) {
    const next = clamp(Math.round(nextOffset), 0, maxViewOffset());
    const changed = next !== state.viewOffsetCol;
    state.viewOffsetCol = next;
    if (renderModeSelect) {
      state.renderMode = renderModeSelect.value || "geometry";
    }
    if (phaseDiagnosticsToggle) {
      state.showPhaseDiagnostics = phaseDiagnosticsToggle.checked;
    }
    if (loopToggle) {
      state.loopPlayback = loopToggle.checked;
    }

    updateOutputs();
    if (options.render !== false || !changed) {
      renderCanvas();
    }
  }

  function followPlaybackViewport(options = {}) {
    const playCol = playheadColumn();
    const halfWindow = visibleColCount() * 0.5;
    const targetOffset = clamp(playCol - halfWindow, 0, maxViewOffset());
    const shouldAdvance = targetOffset > state.viewOffsetCol + 0.5;
    const shouldRealignBackward = options.allowBackward && targetOffset < state.viewOffsetCol - 0.5;
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
    const hitThumb = event.target === timelineThumb
      || (event.clientX >= thumbRect.left && event.clientX <= thumbRect.right
        && event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom);

    if (hitThumb) {
      state.timelineDragOffsetPx = clamp(event.clientX - thumbRect.left, 0, thumbRect.width || 0);
    } else {
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
    setViewOffset(trackOffsetFromClientX(event.clientX, state.timelineDragOffsetPx));
  }

  function releaseTimelineThumb(event) {
    if (!state.isDraggingTimelineThumb) {
      return;
    }
    state.isDraggingTimelineThumb = false;
    timelineThumb.classList.remove("is-dragging");
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

  function bindControls() {
    const redrawInputs = [durationInput, minFreqInput, maxFreqInput, sizeInput, strengthInput, densityInput];
    for (const input of redrawInputs) {
      input.addEventListener("input", () => {
        if (input === durationInput) {
          clampViewOffset();
        }
        updateOutputs();
        if (input === durationInput && isReloadableBasslinePreset(state.currentBasslinePreset)) {
          applyBassLinePreset(state.currentBasslinePreset, { preserveBpm: true });
          return;
        }
        markDirty();
        renderCanvas();
      });
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
      if (state.gainNode) {
        state.gainNode.gain.value = Number(gainInput.value);
      }
    });

    if (loopToggle) {
      loopToggle.addEventListener("change", () => {
        state.loopPlayback = loopToggle.checked;
        if (state.sourceNode) {
          state.sourceNode.loop = state.loopPlayback;
          setStatus(state.loopPlayback ? "Loop playback enabled." : "Loop playback disabled.");
        }
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

    if (phaseDiagnosticsToggle) {
      phaseDiagnosticsToggle.addEventListener("change", () => {
        state.showPhaseDiagnostics = phaseDiagnosticsToggle.checked;
        renderCanvas();
      });
    }

    gridToggle.addEventListener("change", renderCanvas);

    playButton.addEventListener("click", playAudio);
    pauseButton.addEventListener("click", pausePlayback);
    stopButton.addEventListener("click", () => stopPlayback("Playback stopped."));
    renderButton.addEventListener("click", () => renderIfNeeded("audio preview"));
    exportButton.addEventListener("click", exportWav);
    clearButton.addEventListener("click", clearSpectrogram);
    presetButton.addEventListener("click", () => applyPreset(presetSelect.value));
    basslineButton.addEventListener("click", () => applyBassLinePreset(basslineSelect.value));
    clearBasslineButton.addEventListener("click", clearBassLine);

    for (const button of toolButtons) {
      button.addEventListener("click", () => setTool(button.dataset.tool));
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("resize", () => {
      updateOutputs();
      renderCanvas();
    });

    window.addEventListener("keydown", (event) => {
      if (event.target && /input|select|textarea|button/i.test(event.target.tagName)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (state.isPlaying) {
          pausePlayback();
        } else {
          playAudio();
        }
        return;
      }

      if (event.key >= "1" && event.key <= "5") {
        const index = Number(event.key) - 1;
        const target = ["brush", "spray", "gaussian", "line", "erase"][index];
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

    updateOutputs();
    bindControls();
    setTool("brush");
    applyPreset("riser");
    window.__spectrogramBooted = true;
  } catch (error) {
    reportBootError(error);
  }
})();
