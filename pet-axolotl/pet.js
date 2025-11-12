window.addEventListener("DOMContentLoaded", () => {
  window.initPetWidget = function initPetWidget(rootElement) {
    if (!rootElement) {
      console.error("[BubblePet] initPetWidget requires a rootElement");
      return;
    }

    const spriteEl = rootElement.querySelector("#pet-sprite");
    const buttons = rootElement.querySelectorAll(".pet-actions button");
    const messageBar = rootElement.querySelector("#message-bar");

    if (!spriteEl) {
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
    const SLEEP_HOURS = { start: 4, end: 12 }; // CST

    function persistState() {
      try {
        const payload = JSON.stringify({
          mode: petState.mode,
          currentAction: petState.currentAction,
          idlePhase: petState.idlePhase,
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
    }

    function applyStatChange(stat, delta, options = {}) {
      const { silent = false } = options;
      if (!(stat in petState.stats)) {
        return false;
      }
      const nextValue = clampStat(petState.stats[stat] + delta);
      if (nextValue === petState.stats[stat]) {
        return false;
      }
      petState.stats[stat] = nextValue;
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

    const SOUND_FILES = [
      "attention-squeak",
      "fastswim-squeak",
      "float-squeak",
      "happy-squeak",
      "munch-squeak",
      "pet-sound",
      "resting-sound",
      "swimming-sound",
    ];

    const soundLibrary = SOUND_FILES.reduce((library, name) => {
      const audio = new Audio(`sounds/${name}.mp3`);
      audio.volume = 0.45;
      audio.preload = "auto";
      audio.load();
      library[name] = audio;
      return library;
    }, {});

    const animations = {
      idleRest: "assets/resting.gif",
      idleFloat: "assets/floating.gif",
      idleSwim: "assets/swimming.gif",
      rest: "assets/resting.gif",
      sleep: "assets/sleeping.gif",
      swim: "assets/swimming.gif",
      fastSwim: "assets/fast-swim.gif",
      pet: "assets/pet.gif",
      eat: "assets/munching.gif",
    };

    function setPetAnimation(name) {
      const src = animations[name];
      if (!src) {
        console.warn(`[BubblePet] Missing animation for "${name}"`);
        return;
      }
      if (spriteEl.getAttribute("src") === src) {
        return;
      }
      spriteEl.src = src;
      petState.currentAnimation = name;
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

    function playSound(name) {
      if (!petState.soundEnabled) {
        return;
      }
      const audio = soundLibrary[name];
      if (!audio) {
        console.warn(`[BubblePet] Missing sound for "${name}"`);
        return;
      }
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch (error) {
        // Some browsers may disallow resetting currentTime before metadata is ready.
        console.warn(`[BubblePet] Unable to reset sound "${name}":`, error);
      }
      audio.play().catch(() => {});
    }

    const IDLE_SEQUENCE = [
      { key: "idleRest", phase: "resting", duration: 9000, sound: "resting-sound" },
      { key: "idleFloat", phase: "floating", duration: 7000, sound: "float-squeak" },
      { key: "idleSwim", phase: "swimming", duration: 8000, sound: "swimming-sound" },
    ];

    const MODE_DURATIONS = {
      pet: 5000,
      eat: 6000,
      rest: 12000,
      sleep: 20000,
      swim: 15000,
    };

    let idleTimeout = null;
    let idleIndex = 0;
    let modeResetTimeout = null;
    let swimBurstInterval = null;
    let swimBurstTimeout = null;
    let attentionInterval = null;

    const SWIM_BURST_INTERVAL = 9000;
    const SWIM_BURST_DURATION = 2500;
    const ATTENTION_INTERVAL = 10 * 60 * 1000;

    function clearIdleCycle() {
      if (idleTimeout) {
        window.clearTimeout(idleTimeout);
        idleTimeout = null;
      }
    }

    function advanceIdleCycle() {
      if (petState.mode !== "idle") {
        return;
      }
      const step = IDLE_SEQUENCE[idleIndex];
      petState.idlePhase = step.phase;
      setPetAnimation(step.key);
      if (step.sound) {
        playSound(step.sound);
      }
      idleTimeout = window.setTimeout(() => {
        idleIndex = (idleIndex + 1) % IDLE_SEQUENCE.length;
        advanceIdleCycle();
      }, step.duration);
    }

    function startIdleCycle(startIndex = 0) {
      clearIdleCycle();
      petState.mode = "idle";
      petState.currentAction = "idle";
      persistState();
      idleIndex = startIndex % IDLE_SEQUENCE.length;
      advanceIdleCycle();
    }

    function stopSwimBursts() {
      if (swimBurstInterval) {
        window.clearInterval(swimBurstInterval);
        swimBurstInterval = null;
      }
      if (swimBurstTimeout) {
        window.clearTimeout(swimBurstTimeout);
        swimBurstTimeout = null;
      }
    }

    function startSwimBursts() {
      stopSwimBursts();
      swimBurstInterval = window.setInterval(() => {
        if (petState.mode !== "swim") {
          return;
        }
        setPetAnimation("fastSwim");
        playSound("fastswim-squeak");
        swimBurstTimeout = window.setTimeout(() => {
          if (petState.mode === "swim") {
            setPetAnimation("swim");
            playSound("swimming-sound");
          }
        }, SWIM_BURST_DURATION);
      }, SWIM_BURST_INTERVAL);
    }

    function cancelModeReset() {
      if (modeResetTimeout) {
        window.clearTimeout(modeResetTimeout);
        modeResetTimeout = null;
      }
    }

    function scheduleModeReset(mode, delay, nextMode = "idle") {
      cancelModeReset();
      if (!delay) {
        startIdleCycle();
        return;
      }
      modeResetTimeout = window.setTimeout(() => {
        if (petState.mode === mode) {
          if (nextMode === "idle") {
            startIdleCycle();
          } else {
            enterMode(nextMode);
          }
        }
      }, delay);
    }

    function enterMode(mode) {
      cancelModeReset();
      if (mode === "idle") {
        stopSwimBursts();
        startIdleCycle();
        return;
      }

      clearIdleCycle();
      if (mode !== "swim") {
        stopSwimBursts();
      }

      petState.mode = mode;
      petState.currentAction = mode;
      persistState();

      switch (mode) {
        case "pet":
          setPetAnimation("pet");
          playSound("pet-sound");
          scheduleModeReset(mode, MODE_DURATIONS.pet);
          break;
        case "eat":
          setPetAnimation("eat");
          playSound("munch-squeak");
          scheduleModeReset(mode, MODE_DURATIONS.eat);
          break;
        case "rest":
          setPetAnimation("rest");
          playSound("resting-sound");
          scheduleModeReset(mode, MODE_DURATIONS.rest);
          break;
        case "sleep":
          setPetAnimation("sleep");
          playSound("resting-sound");
          scheduleModeReset(mode, MODE_DURATIONS.sleep);
          break;
        case "swim":
          setPetAnimation("swim");
          playSound("swimming-sound");
          startSwimBursts();
          scheduleModeReset(mode, MODE_DURATIONS.swim);
          break;
        default:
          startIdleCycle();
          break;
      }
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
      },
      sleep: {
        mode: "sleep",
        deltas: {
          sleepiness: -5,
        },
        cooldown: 12000,
        requireSleepTime: true,
        busyMessage: "Pico isn't sleepy just yet.",
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

      if (sourceButton) {
        sourceButton.blur();
      }

      markActionCooldown(
        action,
        typeof config.cooldown === "number" ? config.cooldown : DEFAULT_ACTION_COOLDOWN
      );

      beginActionLock(config.lockWindow || ACTION_LOCK_WINDOW);

      if (config.mode) {
        enterMode(config.mode);
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

    function startAttentionTimer() {
      if (attentionInterval) {
        window.clearInterval(attentionInterval);
      }
      attentionInterval = window.setInterval(() => {
        if (petState.mode === "sleep") {
          return;
        }
        if (petState.mode === "idle" || petState.mode === "rest") {
          playSound("attention-squeak");
        } else {
          playSound("happy-squeak");
        }
      }, ATTENTION_INTERVAL);
    }

    processBackfill();
    calculateHappiness();
    startIdleCycle();
    startAttentionTimer();
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
