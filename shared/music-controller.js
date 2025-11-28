window.addEventListener("DOMContentLoaded", () => {
  class MusicController {
    constructor() {
      this.audio = new Audio();
      this.audio.preload = "metadata";
      this.audio.crossOrigin = "anonymous";
      this.mode = "idle";
      this.currentSource = null;
      this.currentMetadata = null;
      this.onTrackEnd = null;

      this.audio.addEventListener("ended", () => {
        if (typeof this.onTrackEnd === "function") {
          this.onTrackEnd();
        }
      });
    }

    setMode(mode) {
      this.mode = typeof mode === "string" && mode.trim() ? mode : "idle";
    }

    playSource(source, { loop = false, mode = null, metadata = null } = {}) {
      if (!source) {
        return false;
      }

      this.audio.loop = loop === true;
      this.currentSource = source;
      this.currentMetadata = metadata;

      if (mode) {
        this.setMode(mode);
      }

      this.audio.src = source;

      const playPromise = this.audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }

      return true;
    }

    playDisc(source, options = {}) {
      return this.playSource(source, { ...options, mode: "disc" });
    }

    shuffleDiscs(discs = [], { currentId = null, autoPlay = true } = {}) {
      const normalized = discs
        .map((entry) => {
          if (typeof entry === "string") {
            return { id: entry, source: entry };
          }
          if (entry && typeof entry === "object" && entry.source) {
            const id = entry.id || entry.name || entry.title || entry.source;
            return { ...entry, id };
          }
          return null;
        })
        .filter(Boolean);

      if (normalized.length === 0) {
        return null;
      }

      const filtered = normalized.filter(
        (item) => item.id !== currentId && item.source !== this.currentSource
      );
      const pool = filtered.length > 0 ? filtered : normalized;
      const next = pool[Math.floor(Math.random() * pool.length)];

      if (next?.source && autoPlay) {
        this.playDisc(next.source, { loop: false, metadata: next });
      }

      return next || null;
    }

    startSpotify(streamUrl) {
      return this.playSource(streamUrl, { loop: false, mode: "spotify" });
    }

    controlSpotify(action = "toggle") {
      const normalized = typeof action === "string" ? action.toLowerCase() : "toggle";

      if (normalized === "pause") {
        this.audio.pause();
        return true;
      }

      if (normalized === "play") {
        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
        return true;
      }

      if (normalized === "toggle") {
        return this.audio.paused ? this.controlSpotify("play") : this.controlSpotify("pause");
      }

      return false;
    }

    playHydrophone(source) {
      return this.playSource(source, { loop: false, mode: "hydrophone" });
    }

    stop() {
      this.audio.pause();
      try {
        this.audio.currentTime = 0;
      } catch {
        // ignore audio reset errors
      }
      this.currentSource = null;
      this.currentMetadata = null;
      this.onTrackEnd = null;
      this.setMode("idle");
      return true;
    }
  }

  window.MusicController = MusicController;
  if (!window.musicController) {
    window.musicController = new MusicController();
  }

  console.log("✅ script validated");
});
