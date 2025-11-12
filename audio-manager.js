(function registerBubblemarksAudioManager() {
  if (typeof window === "undefined") {
    return;
  }

  function createAudioElement(source, { volume = 1, loop = false } = {}) {
    const audio = new Audio();
    audio.preload = "auto";
    audio.loop = loop;
    audio.volume = volume;
    audio.src = source;
    try {
      audio.load();
    } catch (error) {
      console.warn("[BubblemarksAudio] Unable to preload sound:", source, error);
    }
    return audio;
  }

  function createManager({ defaultVolume = 1 } = {}) {
    const sounds = new Map();

    function preload(definitions = []) {
      definitions.forEach((definition) => {
        if (!definition || typeof definition !== "object") {
          return;
        }
        const { name, src, volume = defaultVolume, loop = false, allowMultiple = false } = definition;
        if (!name || !src) {
          return;
        }
        if (sounds.has(name)) {
          const existing = sounds.get(name);
          existing.audio.volume = volume;
          existing.audio.loop = loop;
          existing.audio.src = src;
          existing.config.allowMultiple = allowMultiple;
          existing.config.volume = volume;
          existing.config.loop = loop;
          try {
            existing.audio.load();
          } catch (error) {
            console.warn(`[BubblemarksAudio] Failed to refresh sound "${name}":`, error);
          }
          return;
        }
        const audio = createAudioElement(src, { volume, loop });
        sounds.set(name, {
          audio,
          config: {
            allowMultiple,
            volume,
            loop,
            src,
          },
        });
      });
    }

    function getEntry(name) {
      return sounds.get(name) || null;
    }

    function stop(name) {
      const entry = getEntry(name);
      if (!entry) {
        return false;
      }
      entry.audio.pause();
      try {
        entry.audio.currentTime = 0;
      } catch (error) {
        console.warn(`[BubblemarksAudio] Unable to reset sound "${name}":`, error);
      }
      return true;
    }

    function stopAll() {
      sounds.forEach((_, name) => {
        stop(name);
      });
    }

    function play(name, options = {}) {
      const entry = getEntry(name);
      if (!entry) {
        return false;
      }
      const { audio, config } = entry;
      const allowOverlap = options.allowOverlap ?? config.allowMultiple ?? false;
      const desiredVolume =
        typeof options.volume === "number" && options.volume >= 0 ? options.volume : config.volume;
      const playbackRate = typeof options.playbackRate === "number" ? options.playbackRate : 1;
      const targetAudio = allowOverlap ? audio.cloneNode(true) : audio;

      try {
        targetAudio.pause();
      } catch (error) {
        /* Some browsers throw if pause is called during play promise rejection */
      }

      targetAudio.volume = desiredVolume;
      targetAudio.loop = options.loop ?? config.loop ?? false;
      targetAudio.playbackRate = playbackRate;

      try {
        targetAudio.currentTime = 0;
      } catch (error) {
        console.warn(`[BubblemarksAudio] Unable to reset sound "${name}":`, error);
      }

      const playPromise = targetAudio.play();
      if (allowOverlap) {
        const cleanup = () => {
          targetAudio.removeEventListener("ended", cleanup);
          targetAudio.removeEventListener("error", cleanup);
          if (typeof targetAudio.remove === "function") {
            try {
              targetAudio.remove();
            } catch (error) {
              /* noop */
            }
          }
        };
        targetAudio.addEventListener("ended", cleanup);
        targetAudio.addEventListener("error", cleanup);
      }
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
      return true;
    }

    return {
      preload,
      play,
      stop,
      stopAll,
      has: (name) => sounds.has(name),
    };
  }

  window.addEventListener("DOMContentLoaded", () => {
    if (!window.BubblemarksAudio) {
      window.BubblemarksAudio = {};
    }
    window.BubblemarksAudio.createManager = createManager;
  });
})();
