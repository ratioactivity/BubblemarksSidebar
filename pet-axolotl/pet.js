window.addEventListener("DOMContentLoaded", () => {
  window.initPetWidget = function initPetWidget(rootElement) {
    if (!rootElement) {
      console.error("[BubblePet] initPetWidget requires a rootElement");
      return;
    }

    const spriteEl = rootElement.querySelector("#pet-sprite");
    let overlayEl = rootElement.querySelector("#pet-overlay");
    const buttons = rootElement.querySelectorAll(".pet-actions button");
    const messageBar = rootElement.querySelector("#message-bar");

    if (!spriteEl) {
      console.error("[BubblePet] Missing #pet-sprite element in widget root");
      return;
    }

    if (!overlayEl) {
      overlayEl = document.createElement("img");
      overlayEl.id = "pet-overlay";
      overlayEl.alt = "";
      overlayEl.setAttribute("aria-hidden", "true");
      overlayEl.classList.add("pet-overlay");
      spriteEl.insertAdjacentElement("afterend", overlayEl);
    }

    if (!buttons.length) {
      console.error("[BubblePet] Missing .pet-actions buttons in widget root");
      return;
    }

    const STORAGE_KEY = "bubblepet.state.v1";
    const STAT_LIMIT = 100;
    const DEFAULT_STATS = {
      hunger: 25,
      sleepiness: 20,
      boredom: 30,
      overstim: 15,
      affection: 70,
    };

    function clampStat(value) {
      const numeric = Number.isFinite(value) ? value : 0;
      return Math.max(0, Math.min(STAT_LIMIT, numeric));
    }

    function loadState() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          return null;
        }
        parsed.stats = Object.assign({}, DEFAULT_STATS, parsed.stats || {});
        parsed.stats = Object.keys(parsed.stats).reduce((acc, key) => {
          acc[key] = clampStat(Number(parsed.stats[key]));
          return acc;
        }, {});
        parsed.baseState =
          typeof parsed.baseState === "string" && parsed.baseState.trim().length
            ? parsed.baseState
            : "rest";
        return parsed;
      } catch (error) {
        console.warn("[BubblePet] Failed to load state:", error);
        return null;
      }
    }

    function createDefaultState() {
      return {
        mode: "idle",
        currentAction: "idle",
        idlePhase: "resting",
        baseState: "rest",
        soundEnabled: true,
        attention: 100,
        level: 1,
        name: "Axolotl",
        happiness: 0,
        nextLevelThreshold: 85,
        lastTick: Date.now(),
        stats: Object.assign({}, DEFAULT_STATS),
      };
    }

    const petState = Object.assign(createDefaultState(), loadState() || {});
    petState.stats = Object.assign({}, DEFAULT_STATS, petState.stats || {});
    if (typeof petState.baseState !== "string" || !petState.baseState.trim()) {
      petState.baseState = "rest";
    }
    const SLEEP_HOURS = { start: 4, end: 12 }; // CST

    function persistState() {
      try {
        const payload = JSON.stringify({
          mode: petState.mode,
          currentAction: petState.currentAction,
          idlePhase: petState.idlePhase,
          baseState: petState.baseState,
          soundEnabled: petState.soundEnabled,
          attention: petState.attention,
          level: petState.level,
          name: petState.name,
          happiness: petState.happiness,
          nextLevelThreshold: petState.nextLevelThreshold,
          lastTick: petState.lastTick,
          stats: petState.stats,
        });
        window.localStorage.setItem(STORAGE_KEY, payload);
      } catch (error) {
        console.warn("[BubblePet] Failed to persist state:", error);
      }
    }

    function calculateHappiness() {
      const { hunger, sleepiness, boredom, overstim, affection } = petState.stats;
      const positive =
        STAT_LIMIT - hunger +
        (STAT_LIMIT - sleepiness) +
        (STAT_LIMIT - boredom) +
        (STAT_LIMIT - overstim) +
        affection;
      petState.happiness = clampStat(Math.round(positive / 5));

      let leveledUp = false;
      while (petState.happiness >= petState.nextLevelThreshold) {
        petState.level += 1;
        petState.nextLevelThreshold = Math.min(
          STAT_LIMIT,
          Math.round(petState.nextLevelThreshold + 5 + petState.level * 2)
        );
        petState.stats.affection = clampStat(petState.stats.affection + 5);
        petState.stats.overstim = clampStat(petState.stats.overstim - 5);
        petState.stats.boredom = clampStat(petState.stats.boredom - 5);
        leveledUp = true;
      }

      if (leveledUp) {
        const recalculated =
          STAT_LIMIT - petState.stats.hunger +
          (STAT_LIMIT - petState.stats.sleepiness) +
          (STAT_LIMIT - petState.stats.boredom) +
          (STAT_LIMIT - petState.stats.overstim) +
          petState.stats.affection;
        petState.happiness = clampStat(Math.round(recalculated / 5));
      }

      persistState();
      updateBars();
      scheduleAmbientCue();
    }

    function applyStatChange(stat, delta, options = {}) {
      const { silent = false } = options;
      if (!(stat in petState.stats)) {
        return false;
      }
      const currentValue = petState.stats[stat];
      const nextValue = clampStat(currentValue + delta);
      if (nextValue === currentValue) {
        return false;
      }
      petState.stats[stat] = nextValue;
      if (stat === "affection") {
        const immediateCue =
          nextValue <= AFFECTION_THRESHOLDS.low || nextValue >= AFFECTION_THRESHOLDS.high;
        scheduleAmbientCue({ immediate: immediateCue });
      }
      if (silent) {
        renderStatBar(stat);
        return true;
      }
      calculateHappiness();
      return true;
    }

    function updateHunger(delta, options) {
      return applyStatChange("hunger", delta, options);
    }

    function updateSleepiness(delta, options) {
      return applyStatChange("sleepiness", delta, options);
    }

    function updateBoredom(delta, options) {
      return applyStatChange("boredom", delta, options);
    }

    function updateOverstim(delta, options) {
      return applyStatChange("overstim", delta, options);
    }

    function updateAffection(delta, options) {
      return applyStatChange("affection", delta, options);
    }

    const NATURAL_DRIFT = {
      hunger: 3,
      sleepiness: 2,
      boredom: 3,
      overstim: 1,
      affection: -2,
    };

    const DEFAULT_TICK_MS =
      typeof window.__bubblepetHourMs === "number"
        ? window.__bubblepetHourMs
        : 60 * 60 * 1000;

    let schedulerId = null;

    function applyNaturalDrift(hours = 1, options = {}) {
      const { timestamp = Date.now() } = options;
      let changed = false;
      Object.entries(NATURAL_DRIFT).forEach(([stat, change]) => {
        const delta = change * hours;
        if (!delta) {
          return;
        }
        let result = false;
        switch (stat) {
          case "hunger":
            result = updateHunger(delta, { silent: true });
            break;
          case "sleepiness":
            result = updateSleepiness(delta, { silent: true });
            break;
          case "boredom":
            result = updateBoredom(delta, { silent: true });
            break;
          case "overstim":
            result = updateOverstim(delta, { silent: true });
            break;
          case "affection":
            result = updateAffection(delta, { silent: true });
            break;
          default:
            break;
        }
        changed = changed || result;
      });
      petState.lastTick = timestamp;
      if (changed) {
        calculateHappiness();
      } else {
        persistState();
      }
    }

    function processBackfill() {
      const now = Date.now();
      const elapsed = now - (petState.lastTick || now);
      const hoursElapsed = Math.floor(elapsed / DEFAULT_TICK_MS);
      if (hoursElapsed > 0) {
        applyNaturalDrift(hoursElapsed, { timestamp: now });
      } else {
        petState.lastTick = now;
      }
    }

    function startScheduler(intervalMs = DEFAULT_TICK_MS) {
      if (schedulerId) {
        window.clearInterval(schedulerId);
      }
      schedulerId = window.setInterval(() => {
        if (!isSleepTime()) {
          applyNaturalDrift(1, { timestamp: Date.now() });
          setMessage("Pico is craving a little attention.");
        }
      }, intervalMs);
      return schedulerId;
    }

    function createFallbackAudioManager() {
      const entries = new Map();
      const api = {
        preload(definitions = []) {
          definitions.forEach((definition) => {
            if (!definition || typeof definition !== "object") {
              return;
            }
            const { name, src, volume = 1, allowMultiple = false, loop = false } = definition;
            if (!name || !src) {
              return;
            }
            if (!entries.has(name)) {
              const instance = new Audio(src);
              instance.preload = "auto";
              instance.volume = volume;
              instance.loop = loop;
              try {
                instance.load();
              } catch (error) {
                console.warn(`[BubblePet] Unable to preload fallback sound "${name}":`, error);
              }
              entries.set(name, { src, volume, allowMultiple, instance, loop });
              return;
            }
            const existing = entries.get(name);
            existing.src = src;
            existing.volume = volume;
            existing.allowMultiple = allowMultiple;
            existing.loop = loop;
            if (existing.instance) {
              existing.instance.src = src;
              existing.instance.volume = volume;
              existing.instance.loop = loop;
              try {
                existing.instance.load();
              } catch (error) {
                console.warn(`[BubblePet] Unable to refresh fallback sound "${name}":`, error);
              }
            }
          });
        },
        play(name, options = {}) {
          const entry = entries.get(name);
          if (!entry) {
            return false;
          }
          const allowOverlap = options.allowOverlap ?? entry.allowMultiple ?? false;
          const volume =
            typeof options.volume === "number" && options.volume >= 0 ? options.volume : entry.volume;
          const playbackRate = typeof options.playbackRate === "number" ? options.playbackRate : 1;
          let target = entry.instance;
          if (allowOverlap) {
            target = new Audio(entry.src);
          } else if (target) {
            target.pause();
          }
          target.volume = volume;
          target.playbackRate = playbackRate;
          target.loop = options.loop ?? entry.loop ?? false;
          try {
            target.currentTime = 0;
          } catch (error) {
            console.warn(`[BubblePet] Unable to reset fallback sound "${name}":`, error);
          }
          target.play().catch(() => {});
          return true;
        },
        stop(name) {
          const entry = entries.get(name);
          if (!entry || !entry.instance) {
            return false;
          }
          entry.instance.pause();
          try {
            entry.instance.currentTime = 0;
          } catch (error) {
            console.warn(`[BubblePet] Unable to stop fallback sound "${name}":`, error);
          }
          return true;
        },
        stopAll() {
          entries.forEach((_, key) => {
            api.stop(key);
          });
        },
        has: (name) => entries.has(name),
      };
      return api;
    }

    const audioManager =
      window.BubblemarksAudio?.createManager({ defaultVolume: 0.45 }) ||
      createFallbackAudioManager();

    const SOUND_DEFINITIONS = [
      { name: "attention-squeak", src: "sounds/attention-squeak.mp3", volume: 0.35 },
      { name: "fastswim-squeak", src: "sounds/fastswim-squeak.mp3", volume: 0.5 },
      { name: "float-squeak", src: "sounds/float-squeak.mp3", volume: 0.4 },
      { name: "happy-squeak", src: "sounds/happy-squeak.mp3", volume: 0.45 },
      { name: "munch-squeak", src: "sounds/munch-squeak.mp3", volume: 0.55 },
      { name: "pet-sound", src: "sounds/pet-sound.mp3", volume: 0.5 },
      { name: "resting-sound", src: "sounds/resting-sound.mp3", volume: 0.35 },
      { name: "swimming-sound", src: "sounds/swimming-sound.mp3", volume: 0.45 },
    ];

    audioManager.preload(SOUND_DEFINITIONS);

    const MODE_DURATIONS = {
      pet: 5000,
      eat: 6000,
      rest: 12000,
      sleep: 20000,
      swim: 15000,
    };

    const BASE_TRANSITION_GRAPH = {
      rest: new Set(["float", "idle"]),
      float: new Set(["rest", "sleep", "idle"]),
      sleep: new Set(["float", "swim"]),
      swim: new Set(["sleep", "float", "idle"]),
      idle: new Set(["rest", "float", "swim", "sleep"]),
    };

    function isBaseTransitionAllowed(targetState) {
      if (!targetState || targetState === "idle") {
        return true;
      }
      const current = petState.baseState || "rest";
      if (current === targetState) {
        return true;
      }
      const allowed = BASE_TRANSITION_GRAPH[current];
      return Boolean(allowed && allowed.has(targetState));
    }

    function formatBaseState(state) {
      switch (state) {
        case "float":
          return "floating";
        case "sleep":
          return "sleeping";
        case "swim":
          return "swimming";
        case "rest":
        default:
          return "resting";
      }
    }

    const animationLibrary = {
      restBase: {
        asset: "assets/resting.gif",
        layer: "base",
        baseState: "rest",
      },
      rest: {
        base: "restBase",
        sound: "resting-sound",
        soundOptions: { volume: 0.32 },
      },
      idleRest: {
        base: "restBase",
        sound: "resting-sound",
        soundOptions: { volume: 0.3 },
        duration: 9000,
        next: "idleFloat",
        phase: "resting",
      },
      floatBase: {
        asset: "assets/floating.gif",
        layer: "base",
        baseState: "float",
      },
      idleFloat: {
        base: "floatBase",
        sound: "float-squeak",
        soundOptions: { volume: 0.38 },
        duration: 7000,
        next: "idleSwim",
        phase: "floating",
      },
      sleepBase: {
        asset: "assets/sleeping.gif",
        layer: "base",
        baseState: "sleep",
      },
      sleep: {
        base: "sleepBase",
        sound: "resting-sound",
        soundOptions: { volume: 0.28 },
      },
      swimBase: {
        asset: "assets/swimming.gif",
        layer: "base",
        baseState: "swim",
      },
      idleSwim: {
        base: "swimBase",
        sound: "swimming-sound",
        soundOptions: { volume: 0.42 },
        duration: 8000,
        next: "idleRest",
        phase: "swimming",
      },
      swim: {
        base: "swimBase",
        sound: "swimming-sound",
        soundOptions: { volume: 0.42 },
      },
      fastSwim: {
        asset: "assets/fast-swim.gif",
        layer: "base",
        baseState: "swim",
        duration: 2500,
        next: "swim",
        sound: "fastswim-squeak",
        soundOptions: { volume: 0.55 },
      },
      petting: {
        asset: "assets/pet.gif",
        layer: "overlay",
        duration: MODE_DURATIONS.pet,
        sound: "pet-sound",
        soundOptions: { volume: 0.5 },
        hideOnComplete: true,
      },
      munching: {
        asset: "assets/munching.gif",
        layer: "overlay",
        duration: MODE_DURATIONS.eat,
        sound: "munch-squeak",
        soundOptions: { volume: 0.55 },
        hideOnComplete: true,
      },
    };

    const MODE_CONFIG = {
      idle: { type: "idle" },
      rest: {
        type: "base",
        animation: "rest",
        duration: MODE_DURATIONS.rest,
        baseState: "rest",
      },
      sleep: {
        type: "base",
        animation: "sleep",
        duration: MODE_DURATIONS.sleep,
        baseState: "sleep",
      },
      swim: {
        type: "base",
        animation: "swim",
        duration: MODE_DURATIONS.swim,
        baseState: "swim",
      },
      pet: { type: "overlay", animation: "petting", duration: MODE_DURATIONS.pet },
      eat: { type: "overlay", animation: "munching", duration: MODE_DURATIONS.eat },
    };

    const layerTimers = {
      base: null,
      overlay: null,
    };

    function resolveAnimation(type, visited = new Set()) {
      if (!type || visited.has(type)) {
        return null;
      }
      const config = animationLibrary[type];
      if (!config) {
        return null;
      }
      if (!config.base) {
        return Object.assign({ key: type }, config);
      }
      visited.add(type);
      const parent = resolveAnimation(config.base, visited);
      visited.delete(type);
      if (!parent) {
        return null;
      }
      return Object.assign({}, parent, config, { key: type });
    }

    function clearAnimationLayer(layer) {
      if (layerTimers[layer]) {
        window.clearTimeout(layerTimers[layer]);
        layerTimers[layer] = null;
      }
      if (layer === "overlay" && overlayEl) {
        overlayEl.classList.remove("is-visible");
        overlayEl.removeAttribute("src");
      }
    }

    function playAnimation(type, options = {}) {
      const resolved = resolveAnimation(type);
      if (!resolved) {
        console.warn(`[BubblePet] Missing animation for "${type}"`);
        return;
      }

      const layer = options.layer || resolved.layer || "base";
      const targetEl = layer === "overlay" ? overlayEl : spriteEl;
      if (!targetEl || !resolved.asset) {
        return;
      }

      if (targetEl.getAttribute("src") !== resolved.asset) {
        targetEl.src = resolved.asset;
      }

      if (layer === "overlay") {
        overlayEl.classList.add("is-visible");
      } else {
        petState.currentAnimation = resolved.key || type;
        if (resolved.baseState) {
          petState.baseState = resolved.baseState;
        }
        if (resolved.phase) {
          petState.idlePhase = resolved.phase;
        }
      }

      if (resolved.sound) {
        playSound(resolved.sound, resolved.soundOptions || {});
      }

      if (layerTimers[layer]) {
        window.clearTimeout(layerTimers[layer]);
        layerTimers[layer] = null;
      }

      const duration = options.duration ?? resolved.duration;
      const nextKey = options.next ?? resolved.next;

      if (duration && nextKey) {
        layerTimers[layer] = window.setTimeout(() => {
          layerTimers[layer] = null;
          playAnimation(nextKey, { layer });
        }, duration);
      } else if (layer === "overlay") {
        if (duration) {
          layerTimers[layer] = window.setTimeout(() => {
            layerTimers[layer] = null;
            clearAnimationLayer("overlay");
          }, duration);
        }
      } else if (duration && !nextKey) {
        layerTimers[layer] = window.setTimeout(() => {
          layerTimers[layer] = null;
        }, duration);
      }
    }

    function renderStatBar(stat) {
      const bar = rootElement.querySelector(`#${stat}-bar`);
      if (!bar) {
        return;
      }
      const fill = bar.querySelector(".stat-fill");
      const value = petState.stats[stat];
      const percent = Math.min((value / STAT_LIMIT) * 100, 100);
      if (fill) {
        fill.style.width = `${percent}%`;
      }
    }

    function updateBars() {
      for (const key in petState.stats) {
        renderStatBar(key);
      }
    }

    function isSleepTime() {
      const now = new Date();
      const utcHour = now.getUTCHours();
      const cstHour = (utcHour - 6 + 24) % 24;
      return cstHour >= SLEEP_HOURS.start && cstHour < SLEEP_HOURS.end;
    }

    function playSound(request, options = {}) {
      if (!petState.soundEnabled || !audioManager) {
        return;
      }
      let soundName = request;
      let playbackOptions = options;
      if (request && typeof request === "object") {
        const { name, ...rest } = request;
        soundName = name;
        playbackOptions = Object.assign({}, rest, options);
      }
      if (!soundName) {
        return;
      }
      const played = audioManager.play(soundName, playbackOptions);
      if (!played) {
        console.warn(`[BubblePet] Missing sound for "${soundName}"`);
      }
    }

    function idleStartKeyForState(baseState) {
      switch (baseState) {
        case "float":
          return "idleFloat";
        case "swim":
          return "idleSwim";
        default:
          return "idleRest";
      }
    }

    let modeResetTimeout = null;
    let swimBurstInterval = null;
    let ambientCueTimeout = null;

    const SWIM_BURST_INTERVAL = 9000;
    const AFFECTION_THRESHOLDS = {
      low: 45,
      high: 85,
    };
    const AMBIENT_INTERVALS = {
      low: 4 * 60 * 1000,
      medium: 7 * 60 * 1000,
      high: 12 * 60 * 1000,
    };

    function clearIdleCycle() {
      clearAnimationLayer("base");
    }

    function startIdleCycle(startKey) {
      clearIdleCycle();
      clearAnimationLayer("overlay");
      petState.mode = "idle";
      petState.currentAction = "idle";
      persistState();
      const idleKey = startKey || idleStartKeyForState(petState.baseState);
      playAnimation(idleKey);
    }

    function stopSwimBursts() {
      if (swimBurstInterval) {
        window.clearInterval(swimBurstInterval);
        swimBurstInterval = null;
      }
    }

    function startSwimBursts() {
      stopSwimBursts();
      swimBurstInterval = window.setInterval(() => {
        if (petState.mode !== "swim") {
          return;
        }
        playAnimation("fastSwim");
      }, SWIM_BURST_INTERVAL);
    }

    function clearAmbientCueTimer() {
      if (ambientCueTimeout) {
        window.clearTimeout(ambientCueTimeout);
        ambientCueTimeout = null;
      }
    }

    function evaluateAmbientCue() {
      const affection = petState.stats.affection ?? 0;
      if (affection <= AFFECTION_THRESHOLDS.low) {
        return {
          cue: {
            sound: { name: "attention-squeak", allowOverlap: false, volume: 0.38 },
            message: "Pico is craving a little attention.",
          },
          delay: AMBIENT_INTERVALS.low,
        };
      }
      if (affection >= AFFECTION_THRESHOLDS.high) {
        return {
          cue: {
            sound: { name: "happy-squeak", allowOverlap: false, volume: 0.48 },
            message: "Pico lets out a cheerful chirp!",
          },
          delay: AMBIENT_INTERVALS.high,
        };
      }
      return {
        cue: null,
        delay: AMBIENT_INTERVALS.medium,
      };
    }

    function emitAmbientCue(cue) {
      if (!cue || petState.mode === "sleep") {
        return;
      }
      playSound(cue.sound);
      if (cue.message) {
        setMessage(cue.message);
      }
    }

    function scheduleAmbientCue(options = {}) {
      const { immediate = false } = options;
      clearAmbientCueTimer();
      const evaluation = evaluateAmbientCue();
      if (immediate) {
        emitAmbientCue(evaluation.cue);
      }
      const delay = Math.max(evaluation.delay, 1000);
      ambientCueTimeout = window.setTimeout(() => {
        ambientCueTimeout = null;
        const nextEvaluation = evaluateAmbientCue();
        emitAmbientCue(nextEvaluation.cue);
        scheduleAmbientCue();
      }, delay);
    }

    function cancelModeReset() {
      if (modeResetTimeout) {
        window.clearTimeout(modeResetTimeout);
        modeResetTimeout = null;
      }
    }

    function scheduleModeReset(mode, delay, nextMode = "idle", nextOptions = {}) {
      cancelModeReset();
      if (!delay) {
        enterMode(nextMode, nextOptions);
        return;
      }
      modeResetTimeout = window.setTimeout(() => {
        if (petState.mode === mode) {
          enterMode(nextMode, nextOptions);
        }
      }, delay);
    }

    function enterMode(mode, overrides = {}) {
      cancelModeReset();

      const previousMode = overrides.previousMode || petState.mode;
      const baseConfig = MODE_CONFIG[mode] || {};
      const config = Object.assign({}, baseConfig, overrides);
      const modeType = config.type || "idle";

      if (modeType === "idle") {
        stopSwimBursts();
        const idleKey = typeof config.animation === "string" ? config.animation : undefined;
        startIdleCycle(idleKey);
        scheduleAmbientCue();
        return;
      }

      if (modeType === "overlay") {
        const resumeMode =
          typeof config.resumeMode === "string" ? config.resumeMode : previousMode || "idle";
        petState.mode = mode;
        petState.currentAction = config.actionName || mode;
        persistState();
        playAnimation(config.animation || mode, { layer: "overlay" });
        scheduleAmbientCue();
        if (config.duration) {
          scheduleModeReset(mode, config.duration, resumeMode, {
            previousMode: mode,
          });
        }
        return;
      }

      clearIdleCycle();
      if (mode !== "swim") {
        stopSwimBursts();
      }
      clearAnimationLayer("overlay");

      petState.mode = mode;
      petState.currentAction = config.actionName || mode;
      persistState();

      playAnimation(config.animation || mode);

      if (mode === "swim") {
        startSwimBursts();
      }

      if (config.duration) {
        scheduleModeReset(mode, config.duration, config.nextMode || "idle");
      }
      scheduleAmbientCue();
    }

    const actionMessages = {
      pet: "Pico is soaking up the affection!",
      feed: "Pico happily munches on a treat.",
      swim: "Pico is splashing around the tank!",
      rest: "Pico is taking a calm breather.",
      sleep: "Pico is drifting off to dreamland...",
      roam: "Pico is exploring every nook of the tank!",
    };

    const DEFAULT_ACTION_COOLDOWN = 4000;
    const ACTION_LOCK_WINDOW = 1500;
    const ACTION_RULES = {
      pet: {
        mode: "pet",
        deltas: {
          affection: +2,
          boredom: -5,
        },
        cooldown: 7000,
        blockedModes: new Set(["sleep"]),
        busyMessage: "Pico is still finishing the last cuddle.",
      },
      feed: {
        mode: "eat",
        deltas: {
          hunger: -5,
        },
        cooldown: 8000,
        blockedModes: new Set(["sleep"]),
        busyMessage: "Pico is too sleepy to snack right now.",
      },
      swim: {
        mode: "swim",
        deltas: {
          overstim: +1,
          boredom: -5,
          sleepiness: +5,
        },
        cooldown: 9000,
        blockedModes: new Set(["sleep", "rest"]),
        busyMessage: "Pico needs to wake up before swimming again.",
        targetBaseState: "swim",
        invalidTransitionMessage:
          "Pico wants to float for a moment before diving into a swim.",
      },
      rest: {
        mode: "rest",
        deltas: {
          overstim: -5,
          boredom: +1,
        },
        cooldown: 6000,
        blockedModes: new Set(["sleep"]),
        busyMessage: "Pico is already dozing off.",
        targetBaseState: "rest",
        invalidTransitionMessage:
          "Pico needs to drift down from floating before settling to rest.",
      },
      sleep: {
        mode: "sleep",
        deltas: {
          sleepiness: -5,
        },
        cooldown: 12000,
        requireSleepTime: true,
        busyMessage: "Pico isn't sleepy just yet.",
        targetBaseState: "sleep",
        invalidTransitionMessage:
          "Pico wants to relax through a float before snoozing.",
      },
      roam: {
        mode: "swim",
        deltas: {
          boredom: -5,
          affection: +1,
        },
        cooldown: 9000,
        blockedModes: new Set(["sleep"]),
        busyMessage: "Pico needs a moment before exploring again.",
        targetBaseState: "swim",
        invalidTransitionMessage:
          "Pico needs to glide into a float before roaming the tank.",
      },
    };

    const actionCooldowns = new Map();
    let actionLockUntil = 0;
    let actionUnlockTimeout = null;

    function setMessage(message) {
      if (!messageBar || !message) {
        return;
      }
      messageBar.textContent = message;
    }

    function applyActionDeltas(deltas = {}) {
      let statsChanged = false;
      Object.entries(deltas).forEach(([stat, delta]) => {
        switch (stat) {
          case "hunger":
            statsChanged = updateHunger(delta) || statsChanged;
            break;
          case "sleepiness":
            statsChanged = updateSleepiness(delta) || statsChanged;
            break;
          case "boredom":
            statsChanged = updateBoredom(delta) || statsChanged;
            break;
          case "overstim":
            statsChanged = updateOverstim(delta) || statsChanged;
            break;
          case "affection":
            statsChanged = updateAffection(delta) || statsChanged;
            break;
          default:
            break;
        }
      });
      return statsChanged;
    }

    function setActionButtonsDisabled(disabled) {
      buttons.forEach((btn) => {
        btn.disabled = disabled;
        btn.classList.toggle("is-disabled", disabled);
      });
    }

    function beginActionLock(duration = ACTION_LOCK_WINDOW) {
      if (actionUnlockTimeout) {
        window.clearTimeout(actionUnlockTimeout);
        actionUnlockTimeout = null;
      }
      setActionButtonsDisabled(true);
      actionLockUntil = Date.now() + duration;
      actionUnlockTimeout = window.setTimeout(() => {
        actionUnlockTimeout = null;
        actionLockUntil = 0;
        setActionButtonsDisabled(false);
      }, duration);
    }

    function isActionOnCooldown(actionName, now) {
      const readyAt = actionCooldowns.get(actionName) || 0;
      return readyAt > now;
    }

    function markActionCooldown(actionName, durationMs) {
      const now = Date.now();
      actionCooldowns.set(actionName, now + durationMs);
    }

    function handleButtonClick(action, sourceButton) {
      if (!action) {
        return;
      }

      const config = ACTION_RULES[action];
      if (!config) {
        setMessage("Pico tilts their head, unsure what to do.");
        return;
      }

      const now = Date.now();
      if (actionLockUntil && now < actionLockUntil && petState.mode !== "idle") {
        setMessage("Pico is busy finishing their current activity.");
        return;
      }

      if (isActionOnCooldown(action, now)) {
        setMessage(
          config.cooldownMessage ||
            "Pico needs a moment before trying that again."
        );
        return;
      }

      if (config.blockedModes && config.blockedModes.has(petState.mode)) {
        setMessage(
          config.busyMessage || "Pico can't do that while busy with something else."
        );
        return;
      }

      if (config.requireSleepTime && !isSleepTime()) {
        setMessage(config.busyMessage || "Pico isn't sleepy enough yet.");
        return;
      }

      if (config.targetBaseState && !isBaseTransitionAllowed(config.targetBaseState)) {
        const currentState = formatBaseState(petState.baseState);
        const desiredState = formatBaseState(config.targetBaseState);
        setMessage(
          config.invalidTransitionMessage ||
            `Pico needs to move from ${currentState} before switching to ${desiredState}.`
        );
        return;
      }

      if (sourceButton) {
        sourceButton.blur();
      }

      markActionCooldown(
        action,
        typeof config.cooldown === "number" ? config.cooldown : DEFAULT_ACTION_COOLDOWN
      );

      beginActionLock(config.lockWindow || ACTION_LOCK_WINDOW);

      if (config.mode) {
        const enterOptions = {
          actionName: action,
        };
        if (config.targetBaseState) {
          enterOptions.baseState = config.targetBaseState;
        }
        if (config.resumeMode) {
          enterOptions.resumeMode = config.resumeMode;
        }
        enterMode(config.mode, enterOptions);
      } else {
        enterMode("idle");
      }

      const statsChanged = applyActionDeltas(config.deltas);

      petState.currentAction = action || "idle";
      persistState();
      if (!statsChanged) {
        calculateHappiness();
      }
      setMessage(actionMessages[action] || "Pico is feeling calm and cozy.");
    }

    buttons.forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        handleButtonClick(btn.dataset.action, btn);
      });
    });

    setActionButtonsDisabled(false);

    processBackfill();
    calculateHappiness();
    startIdleCycle();
    scheduleAmbientCue({ immediate: true });
    startScheduler();

    window.__bubblepetState = petState;
    window.__bubblepetControls = {
      startScheduler,
      applyNaturalDrift,
      calculateHappiness,
    };

    console.log("✅ script validated");
  };

  window.initPetWidget(document.body);
});
