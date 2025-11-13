window.addEventListener("DOMContentLoaded", () => {
  window.initPetWidget = function initPetWidget(rootElement) {
    if (!rootElement) {
      console.error("[BubblePet] initPetWidget requires a rootElement");
      return;
    }

    const petEl = rootElement.querySelector("#pet-sprite");
    const buttons = rootElement.querySelectorAll(".pet-actions button");
    const messageBar = rootElement.querySelector("#message-bar");

    if (!petEl) {
      console.error("[BubblePet] Missing #pet-sprite element in widget root");
      return;
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

    const MODE_DURATIONS = {
      pet: 5000,
      eat: 6000,
      rest: 12000,
      sleep: 20000,
      swim: 15000,
    };

    const BASE_TRANSITION_GRAPH = {
      rest: new Set(["rest", "float", "sleep", "swim"]),
      float: new Set(["rest", "float", "sleep", "swim"]),
      sleep: new Set(["rest", "float", "sleep", "swim"]),
      swim: new Set(["rest", "float", "sleep", "swim"]),
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

    const SPRITES = {
      resting: "assets/resting.gif",
      rest_to_float: "assets/rest-to-float.gif",
      floating: "assets/floating.gif",
      float_to_sleep: "assets/float-to-sleep.gif",
      sleeping: "assets/sleeping.gif",
      float_to_swim: "assets/float-to-swim.gif",
      swimming: "assets/swimming.gif",
      fast_swim: "assets/fast-swim.gif",
      swim_to_float: "assets/swim-to-float.gif",
      pet: "assets/pet.gif",
      munching: "assets/munching.gif",
    };

    const ANIMATION_SOUNDS = {
      resting: "resting-sound",
      floating: "float-squeak",
      sleeping: "resting-sound",
      swimming: "swimming-sound",
      fast_swim: "fastswim-squeak",
      pet: "pet-sound",
      munching: "munch-squeak",
    };

    const BASE_STATE_ANIMATIONS = {
      rest: "resting",
      float: "floating",
      sleep: "sleeping",
      swim: "swimming",
    };

    const BASE_ANIM_TO_STATE = {
      resting: "rest",
      floating: "float",
      sleeping: "sleep",
      swimming: "swim",
    };

    const TRANSITIONS = {
      resting: {
        rest: ["resting"],
        float: ["rest_to_float", "floating"],
        sleep: ["rest_to_float", "floating", "float_to_sleep", "sleeping"],
        swim: ["rest_to_float", "floating", "float_to_swim", "swimming"],
      },
      floating: {
        rest: ["float_to_sleep", "sleeping", "resting"],
        float: ["floating"],
        sleep: ["float_to_sleep", "sleeping"],
        swim: ["float_to_swim", "swimming"],
      },
      sleeping: {
        rest: ["sleeping", "resting"],
        float: ["sleeping", "resting", "rest_to_float", "floating"],
        sleep: ["sleeping"],
        swim: [
          "sleeping",
          "resting",
          "rest_to_float",
          "floating",
          "float_to_swim",
          "swimming",
        ],
      },
      swimming: {
        rest: ["swim_to_float", "floating", "float_to_sleep", "sleeping", "resting"],
        float: ["swim_to_float", "floating"],
        sleep: ["swim_to_float", "floating", "float_to_sleep", "sleeping"],
        swim: ["swimming"],
      },
    };

    const MODE_CONFIG = {
      idle: { type: "idle" },
      rest: {
        type: "base",
        duration: MODE_DURATIONS.rest,
        baseState: "rest",
      },
      sleep: {
        type: "base",
        duration: MODE_DURATIONS.sleep,
        baseState: "sleep",
      },
      swim: {
        type: "base",
        duration: MODE_DURATIONS.swim,
        baseState: "swim",
      },
      pet: { type: "overlay", animation: ["pet"], duration: MODE_DURATIONS.pet },
      eat: { type: "overlay", animation: ["munching"], duration: MODE_DURATIONS.eat },
    };

    function normalizeBaseState(state) {
      if (BASE_STATE_ANIMATIONS[state]) {
        return state;
      }
      if (BASE_ANIM_TO_STATE[state]) {
        return BASE_ANIM_TO_STATE[state];
      }
      return "rest";
    }

    function baseAnimationName(state) {
      const normalized = normalizeBaseState(state);
      return BASE_STATE_ANIMATIONS[normalized] || BASE_STATE_ANIMATIONS.rest;
    }

    function playBaseAnimation(state, options = {}) {
      const normalized = normalizeBaseState(
        typeof state === "string" ? state : petState.baseState
      );
      petState.baseState = normalized;
      setAnimation(baseAnimationName(normalized), {
        force: options.force === false ? false : true,
      });
    }

    function transition(fromState, toState, options = {}) {
      const currentBase = normalizeBaseState(
        typeof fromState === "string" ? fromState : petState.baseState
      );
      const targetBase = normalizeBaseState(
        typeof toState === "string" ? toState : petState.baseState
      );
      const fromAnim = baseAnimationName(currentBase);
      const mapping = TRANSITIONS[fromAnim] || TRANSITIONS.resting;
      const sequence =
        (mapping && mapping[targetBase]) || [baseAnimationName(targetBase)];

      const sequenceDelay =
        typeof options.delay === "number"
          ? options.delay
          : options.fastTrack
          ? 900
          : 1500;

      const shouldForce = options.force === false ? false : true;

      transitionAnimation(sequence, {
        delay: sequenceDelay,
        force: shouldForce,
        onFinalStart: (anim) => {
          if (anim === baseAnimationName(targetBase)) {
            petState.baseState = targetBase;
          }
          if (typeof options.onFinalStart === "function") {
            options.onFinalStart(anim);
          }
        },
        onComplete: (finalAnim) => {
          const mapped = BASE_ANIM_TO_STATE[finalAnim];
          if (mapped) {
            petState.baseState = mapped;
          }
          if (typeof options.onComplete === "function") {
            options.onComplete(finalAnim);
          }
        },
      });
    }

    let currentAnim = null;
    let isBusy = false;
    let timers = [];
    let idleActive = false;

    function queueTimer(callback, delay) {
      const timeout = window.setTimeout(() => {
        timers = timers.filter((id) => id !== timeout);
        callback();
      }, Math.max(0, Number(delay) || 0));
      timers.push(timeout);
      return timeout;
    }

    function clearAllTimers() {
      timers.forEach((id) => window.clearTimeout(id));
      timers = [];
      isBusy = false;
    }

    function setAnimation(anim, options = {}) {
      if (!petEl || !SPRITES[anim]) {
        return;
      }
      const force = options.force === true;
      if (!force && isBusy) {
        return;
      }
      if (!force && anim === currentAnim) {
        return;
      }
      petEl.style.width = "var(--pet-sprite-width)";
      if (petEl.getAttribute("src") !== SPRITES[anim]) {
        petEl.setAttribute("src", SPRITES[anim]);
      }
      currentAnim = anim;
      petState.currentAnimation = anim;
      petState.idlePhase = anim;
      const mappedState = BASE_ANIM_TO_STATE[anim];
      if (mappedState) {
        petState.baseState = mappedState;
      }
      const soundKey = ANIMATION_SOUNDS[anim];
      if (soundKey) {
        playSound(soundKey);
      }
    }

    function transitionAnimation(sequence, options = {}) {
      if (!petEl || !Array.isArray(sequence) || !sequence.length) {
        if (typeof options.onComplete === "function") {
          options.onComplete();
        }
        return;
      }

      const force = options.force === true;
      if (!force && isBusy) {
        return;
      }

      const delay =
        typeof options.delay === "number" && options.delay >= 0 ? options.delay : 1500;
      const delays = Array.isArray(options.delays) ? options.delays : null;
      const onFinalStart =
        typeof options.onFinalStart === "function" ? options.onFinalStart : null;
      const onComplete =
        typeof options.onComplete === "function" ? options.onComplete : null;

      clearAllTimers();
      isBusy = true;

      let index = 0;
      const finalIndex = sequence.length - 1;
      const finalKey = sequence[finalIndex];

      const step = () => {
        if (index >= sequence.length) {
          isBusy = false;
          if (onComplete) {
            onComplete(finalKey);
          }
          return;
        }

        const key = sequence[index];
        index += 1;
        if (!SPRITES[key]) {
          step();
          return;
        }

        const wait =
          delays && typeof delays[index - 1] === "number" && delays[index - 1] >= 0
            ? delays[index - 1]
            : delay;

        setAnimation(key, { force: true });

        if (index - 1 === finalIndex && onFinalStart) {
          onFinalStart(key);
        }

        queueTimer(step, wait);
      };

      step();
    }

    function clearIdleCycle() {
      idleActive = false;
      clearAllTimers();
    }

    function startIdleCycle(startState) {
      clearIdleCycle();
      idleActive = true;
      stopSwimBursts();
      const desiredState =
        typeof startState === "string"
          ? normalizeBaseState(startState)
          : normalizeBaseState(petState.baseState);
      petState.mode = "idle";
      petState.currentAction = "idle";
      playBaseAnimation(desiredState, { force: true });
      persistState();
    }

    window.testAnim = (sequence) => {
      if (!Array.isArray(sequence)) {
        return;
      }
      transitionAnimation(sequence, { force: true });
    };

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

    let modeResetTimeout = null;
    let swimBurstInterval = null;
    let attentionInterval = null;

    const SWIM_BURST_INTERVAL = 9000;
    const ATTENTION_INTERVAL = 10 * 60 * 1000;

    function stopSwimBursts() {
      if (swimBurstInterval) {
        window.clearInterval(swimBurstInterval);
        swimBurstInterval = null;
      }
    }

    function startSwimBursts() {
      stopSwimBursts();
      swimBurstInterval = window.setInterval(() => {
        if (
          petState.mode !== "swim" ||
          petState.baseState !== "swim" ||
          petState.currentAnimation !== "swimming"
        ) {
          return;
        }
        transitionAnimation(["fast_swim", "swimming"], {
          force: true,
          delay: 1200,
        });
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
        const idleBaseState =
          typeof config.baseState === "string" && config.baseState.trim().length
            ? config.baseState
            : undefined;
        startIdleCycle(idleBaseState);
        return;
      }

      if (modeType === "overlay") {
        const resumeMode =
          typeof config.resumeMode === "string" ? config.resumeMode : previousMode || "idle";
        const sequence = Array.isArray(config.animation)
          ? config.animation
          : [config.animation || mode];
        const resumeBaseState = normalizeBaseState(petState.baseState);
        clearIdleCycle();
        stopSwimBursts();
        petState.mode = mode;
        petState.currentAction = config.actionName || mode;
        persistState();
        const overlayDelay =
          typeof config.duration === "number" && config.duration > 0 ? config.duration : 1500;
        transitionAnimation(sequence, {
          force: true,
          delay: overlayDelay,
          onComplete: () => {
            if (resumeMode === mode) {
              startIdleCycle(resumeBaseState);
              return;
            }
            if (resumeMode === "idle") {
              startIdleCycle(resumeBaseState);
            } else {
              enterMode(resumeMode, {
                previousMode: mode,
                baseState: resumeBaseState,
              });
            }
          },
        });
        return;
      }

      clearIdleCycle();
      stopSwimBursts();

      petState.mode = mode;
      petState.currentAction = config.actionName || mode;
      persistState();

      const targetBaseState = normalizeBaseState(
        typeof config.baseState === "string" && config.baseState.trim().length
          ? config.baseState
          : petState.baseState || "rest"
      );

      transition(petState.baseState, targetBaseState, {
        fastTrack: true,
        onFinalStart: (anim) => {
          if (mode === "swim" && petState.mode === "swim" && anim === "swimming") {
            startSwimBursts();
          }
        },
      });

      if (config.duration && mode !== "sleep") {
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
