window.addEventListener("DOMContentLoaded", () => {
  console.log("✅ script validated");

  const petContainer = document.querySelector(".pet-container");
  if (!petContainer) {
    console.error("[BubblePet] .pet-container not found");
    return;
  }

  let spriteEl = petContainer.querySelector("#pet-sprite");
  const messageEl = petContainer.querySelector(".message-bar");
  const levelEl = petContainer.querySelector(".pet-level");
  const nameEl = petContainer.querySelector(".pet-name");
  const overlayEl = petContainer.querySelector("#pet-overlay");
  const statBars = Array.from(petContainer.querySelectorAll(".stat-bar"));
  const buttons = Array.from(petContainer.querySelectorAll(".pet-actions button"));
  const roamButton = buttons.find((btn) => btn.dataset.action === "roam");
  const callbackButtons = Array.from(
    document.querySelectorAll('[data-action="call-back"], [data-action="callback"], [data-action="callBack"]')
  ).filter((btn) => !buttons.includes(btn));

  const petManager = window.petManager;
  if (!petManager || typeof petManager.subscribeToAnimationChange !== "function") {
    console.error("[BubblePet] petManager is not available");
    return;
  }

  function isRoamOverlayActive() {
    const roamState = window.bubblePetRoamState;
    if (!roamState) return false;
    return Boolean(roamState.active || roamState.returning);
  }

  const SOUND_FILES = [
    "attention-squeak",
    "fastswim-squeak",
    "float-squeak",
    "happy-squeak",
    "help1",
    "help2",
    "munch-squeak",
    "pet-sound",
    "resting-sound",
    "swimming-sound",
  ];

  const sounds = {};
  let soundsEnabled = true;
  let vacationModeEnabled = false;
  let lastMessageBeforeVacation = null;
  SOUND_FILES.forEach((name) => {
    const audio = new Audio(`sounds/${name}.mp3`);
    audio.preload = "auto";
    audio.volume = 0.45;
    sounds[name] = audio;
  });

  function playSound(name) {
    const clip = sounds[name];
    if (!clip || !soundsEnabled) return;
    try {
      clip.pause();
      clip.currentTime = 0;
      clip.play().catch(() => {});
    } catch {
      // ignore audio errors
    }
  }

  const SPRITES = {
    resting: "assets/resting.gif",
    restingBubble: "assets/restingbubble.gif",
    restToFloat: "assets/rest-to-float.gif",
    restToSwim: "assets/rest-to-swim.gif",
    floatToRest: "assets/float-to-rest.gif",
    restToSleep: "assets/rest-to-sleep.gif",
    sleepToRest: "assets/sleep-to-rest.gif",
    floatToSleep: "assets/float-to-sleep.gif",
    sleepToFloat: "assets/sleep-to-float.gif",
    floatToSwim: "assets/float-to-swim.gif",
    swimToFloat: "assets/swim-to-float.gif",
    swimToRest: "assets/swim-to-rest.gif",
    floating: "assets/floating.gif",
    sleeping: "assets/sleeping.gif",
    swimming: "assets/swimming.gif",
    fastSwim: "assets/fast-swim.gif",
    munching: "assets/munching.gif",
    petting: "assets/pet.gif",
  };

  const preloadedSpriteSources = new Set();
  const RESTARTABLE_SPRITES = new Set([SPRITES.sleeping]);
  const restartableSpritePools = new Map();
  const spriteVariantCounters = new Map();
  const SLEEP_LOOP_BUFFER_MS = 100;
  const SLEEP_LOOP_MIN_DELAY_MS = 350;
  const SLEEP_LOOP_FALLBACK_DURATION = 3200;
  let sleepSpriteLoopHandle = null;
  let sleepSpriteLoopDelay = SLEEP_LOOP_FALLBACK_DURATION;
  let sleepSpriteLoopActive = false;

  function getRestartableState(src) {
    if (!restartableSpritePools.has(src)) {
      restartableSpritePools.set(src, { standby: null, ready: false, loading: false });
    }
    return restartableSpritePools.get(src);
  }

  function copySpriteAttributes(target, source) {
    if (!target || !source) {
      return;
    }
    const currentSrc = target.getAttribute("src");
    Array.from(target.attributes).forEach((attr) => {
      if (attr.name === "src") return;
      target.removeAttribute(attr.name);
    });
    Array.from(source.attributes).forEach((attr) => {
      if (attr.name === "src") return;
      target.setAttribute(attr.name, attr.value);
    });
    if (currentSrc) {
      target.setAttribute("src", currentSrc);
    }
    target.className = source.className;
    target.style.cssText = source.style.cssText;
    target.decoding = source.decoding || "async";
    target.loading = source.loading || "eager";
  }

  function scheduleStandbyRetry(src) {
    const state = restartableSpritePools.get(src);
    if (!state) return;
    if (state.retryHandle) {
      clearTimeout(state.retryHandle);
    }
    state.retryHandle = setTimeout(() => {
      state.retryHandle = null;
      if (!state.loading && !state.ready) {
        prepareStandbySprite(src);
      }
    }, 250);
  }

  function prepareStandbySprite(src, reuseEl = null) {
    if (!RESTARTABLE_SPRITES.has(src)) {
      return;
    }
    const state = getRestartableState(src);
    if (state.loading) {
      return;
    }
    const candidate = reuseEl || new Image();
    candidate.decoding = "async";
    candidate.loading = "eager";
    candidate.removeAttribute("id");
    candidate.removeAttribute("class");
    candidate.removeAttribute("style");
    const cleanup = () => {
      candidate.removeEventListener("load", handleLoad);
      candidate.removeEventListener("error", handleError);
      state.loading = false;
    };
    const handleLoad = () => {
      cleanup();
      state.standby = candidate;
      state.ready = true;
    };
    const handleError = () => {
      cleanup();
      state.standby = null;
      state.ready = false;
      scheduleStandbyRetry(src);
    };
    state.loading = true;
    candidate.addEventListener("load", handleLoad, { once: true });
    candidate.addEventListener("error", handleError, { once: true });
    candidate.src = getNextRestartableVariant(src);
  }

  function takeStandbySprite(src) {
    if (!RESTARTABLE_SPRITES.has(src)) {
      return null;
    }
    const state = restartableSpritePools.get(src);
    if (!state || !state.ready || !state.standby) {
      return null;
    }
    const standbySprite = state.standby;
    state.standby = null;
    state.ready = false;
    return standbySprite;
  }

  function preloadSprite(src) {
    if (!src || preloadedSpriteSources.has(src)) {
      return;
    }
    const image = new Image();
    image.loading = "eager";
    image.decoding = "async";
    image.src = src;
    preloadedSpriteSources.add(src);
  }

  Object.values(SPRITES).forEach((spriteSrc) => preloadSprite(spriteSrc));
  RESTARTABLE_SPRITES.forEach((spriteSrc) => {
    prepareStandbySprite(spriteSrc);
  });

  const STAT_LABEL_MAP = {
    hunger: "hunger",
    sleepiness: "sleepiness",
    boredom: "boredom",
    "overstim.": "overstimulation",
    affection: "affection",
  };

  let lastSpriteSrc = spriteEl ? spriteEl.getAttribute("src") : "";

  function getNextRestartableVariant(src) {
    if (!RESTARTABLE_SPRITES.has(src)) {
      return src;
    }
    const nextCount = (spriteVariantCounters.get(src) || 0) + 1;
    spriteVariantCounters.set(src, nextCount);
    const hashIndex = src.indexOf("#");
    const base = hashIndex >= 0 ? src.slice(0, hashIndex) : src;
    const hash = hashIndex >= 0 ? src.slice(hashIndex) : "";
    const joiner = base.includes("?") ? "&" : "?";
    return `${base}${joiner}__loop=${nextCount}&__t=${Date.now()}${hash}`;
  }

  function hardResetSpriteElement(element, src, useRestartVariant = false) {
    if (!element || !src) {
      return;
    }
    spriteEl = element;
    element.removeAttribute("src");
    void element.offsetWidth;
    const applySource = () => {
      element.src = useRestartVariant ? getNextRestartableVariant(src) : src;
      lastSpriteSrc = src;
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(applySource);
    } else {
      setTimeout(applySource, 16);
    }
  }

  function restartSpriteWithClone(src, useRestartVariant = false) {
    if (!spriteEl) return false;
    const previousSprite = spriteEl;
    const replacement = previousSprite.cloneNode(true);
    let hasSwapped = false;
    let fallbackHandle = null;

    const cleanup = () => {
      if (fallbackHandle) {
        clearTimeout(fallbackHandle);
        fallbackHandle = null;
      }
      replacement.removeEventListener("load", applyReplacement);
      replacement.removeEventListener("error", handleError);
    };

    const applyReplacement = () => {
      if (hasSwapped) return;
      hasSwapped = true;
      cleanup();
      previousSprite.replaceWith(replacement);
      spriteEl = replacement;
      lastSpriteSrc = src;
      prepareStandbySprite(src, previousSprite);
    };

    const handleError = () => {
      if (hasSwapped) return;
      hasSwapped = true;
      cleanup();
      hardResetSpriteElement(previousSprite, src, useRestartVariant);
      prepareStandbySprite(src);
    };

    fallbackHandle = setTimeout(() => {
      if (!hasSwapped) {
        handleError();
      }
    }, 120);

    replacement.addEventListener("load", applyReplacement);
    replacement.addEventListener("error", handleError);
    replacement.src = useRestartVariant ? getNextRestartableVariant(src) : src;

    if (replacement.complete && replacement.naturalWidth > 0) {
      applyReplacement();
    }

    return true;
  }

  function setSpriteSource(src, forceRestart = false) {
    if (!spriteEl || !src) return;
    preloadSprite(src);
    const requiresVariant = forceRestart && RESTARTABLE_SPRITES.has(src);
    if (!requiresVariant) {
      spriteEl.src = src;
      lastSpriteSrc = src;
      return;
    }

    const standbySprite = takeStandbySprite(src);
    if (standbySprite) {
      const previousSprite = spriteEl;
      copySpriteAttributes(standbySprite, previousSprite);
      previousSprite.replaceWith(standbySprite);
      spriteEl = standbySprite;
      lastSpriteSrc = src;
      prepareStandbySprite(src, previousSprite);
      return;
    }

    if (restartSpriteWithClone(src, true)) {
      return;
    }

    hardResetSpriteElement(spriteEl, src, true);
    prepareStandbySprite(src);
  }

  function clearSleepSpriteLoopTimer() {
    if (sleepSpriteLoopHandle !== null) {
      clearTimeout(sleepSpriteLoopHandle);
      sleepSpriteLoopHandle = null;
    }
  }

  function stopSleepSpriteLoopTicker() {
    sleepSpriteLoopActive = false;
    clearSleepSpriteLoopTimer();
  }

  function queueSleepSpriteLoopTick() {
    if (!sleepSpriteLoopActive) return;
    clearSleepSpriteLoopTimer();
    sleepSpriteLoopHandle = setTimeout(() => {
      sleepSpriteLoopHandle = null;
      if (!sleepSpriteLoopActive) {
        return;
      }
      setSpriteSource(SPRITES.sleeping, true);
      queueSleepSpriteLoopTick();
    }, sleepSpriteLoopDelay);
  }

  function armSleepSpriteLoopTicker(durationMs) {
    const numericDuration = Number(durationMs);
    const resolvedDuration =
      Number.isFinite(numericDuration) && numericDuration > 0
        ? numericDuration
        : SLEEP_LOOP_FALLBACK_DURATION;
    sleepSpriteLoopDelay = Math.max(
      SLEEP_LOOP_MIN_DELAY_MS,
      resolvedDuration - SLEEP_LOOP_BUFFER_MS
    );
    sleepSpriteLoopActive = true;
    queueSleepSpriteLoopTick();
  }

  function updateMessage(text) {
    if (!messageEl || typeof text !== "string") return;
    messageEl.textContent = text;
  }

  function updateLevel(level) {
    if (!levelEl) return;
    const safeLevel = Number.isFinite(level) ? level : 1;
    levelEl.textContent = `Lv. ${safeLevel}`;
  }

  function updateStats(stats = {}) {
    statBars.forEach((bar) => {
      const label = (bar.dataset.label || "").toLowerCase();
      const key = STAT_LABEL_MAP[label];
      const fill = bar.querySelector(".stat-fill");
      if (!fill || !key) return;
      const value = stats[key];
      if (typeof value === "number") {
        const clamped = Math.max(0, Math.min(10, value));
        const width = (clamped / 10) * 100;
        fill.style.width = `${width}%`;
      }
    });
  }

  const CALLBACK_ACTIONS = new Set(["call-back", "callback"]);
  let lastReportedRoamState = null;

  function notifyParentAboutRoamState(isRoaming) {
    if (lastReportedRoamState === isRoaming) {
      return;
    }
    lastReportedRoamState = isRoaming;
    if (!window.parent || window.parent === window) {
      return;
    }
    try {
      window.parent.postMessage(
        {
          source: "bubblepet",
          type: "roam-state",
          payload: {
            roaming: isRoaming,
            timestamp: Date.now(),
          },
        },
        "*"
      );
    } catch (error) {
      console.warn("[BubblePet] Unable to notify parent about roam state", error);
    }
  }

  function updateDeathState(isDead) {
    if (spriteEl) {
      spriteEl.style.filter = isDead ? "grayscale(1)" : "";
      spriteEl.style.opacity = isDead ? "0.35" : "1";
    }

    if (overlayEl) {
      overlayEl.src = isDead ? "./assets/whitestars-top-right.png" : "";
      overlayEl.style.display = isDead ? "block" : "none";
      overlayEl.style.opacity = isDead ? "0.7" : "0";
    }
  }

  function updateRoamState(mode, isDead = false) {
    if (spriteEl) {
      if (isDead) {
        spriteEl.style.opacity = "0.35";
      } else if (mode === "roam") {
        spriteEl.style.opacity = "0";
      } else if (!isRoamOverlayActive()) {
        spriteEl.style.opacity = "1";
      }
    }

    const isRoaming = mode === "roam";
    notifyParentAboutRoamState(isRoaming);
    if (roamButton) {
      roamButton.textContent = isRoaming ? "Call Back" : "Roam";
      roamButton.disabled = isDead ? true : false;
    }

    buttons.forEach((btn) => {
      const action = (btn.dataset.action || "").toLowerCase();
      const isRoamBtn = action === "roam";
      const isCallbackBtn = CALLBACK_ACTIONS.has(action);
      if (isDead) {
        btn.disabled = true;
      } else if (!isRoamBtn && !isCallbackBtn) {
        btn.disabled = isRoaming;
      } else if (!isRoaming) {
        btn.disabled = false;
      }
    });

    callbackButtons.forEach((btn) => {
      btn.disabled = Boolean(isDead);
    });
  }

  function applyProfileFromDom() {
    const details = {};
    if (nameEl) {
      details.name = nameEl.textContent.trim();
    }
    if (levelEl) {
      const levelText = levelEl.textContent || "";
      const numeric = parseInt(levelText.replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(numeric)) {
        details.level = numeric;
      }
    }
    if (typeof petManager.setProfile === "function") {
      petManager.setProfile(details);
    }
  }

  applyProfileFromDom();

  function handleAnimationChange(animName, state, meta = {}) {
    const isMessageOnly = Boolean(meta.messageOnly);
    if (!isMessageOnly) {
      const spriteSrc = meta.sprite || SPRITES[animName] || lastSpriteSrc;
      const forceRestart = Boolean(meta.requiresRestart);
      setSpriteSource(spriteSrc, forceRestart);
    }

    if (meta.sound) {
      playSound(meta.sound);
    }

    if (meta.message || state.message) {
      updateMessage(meta.message ?? state.message);
    }

    const isDead = Boolean(state.isDead);
    updateLevel(state.level);
    updateStats(state.stats);
    updateDeathState(isDead);
    updateRoamState(state.mode, isDead);

    const shouldMaintainSleepLoop = animName === "sleeping" && state.mode === "sleep" && !isDead;
    if (shouldMaintainSleepLoop) {
      armSleepSpriteLoopTicker(meta.duration);
    } else {
      stopSleepSpriteLoopTicker();
    }
  }

  petManager.subscribeToAnimationChange(handleAnimationChange);

  function attachActionHandler(button) {
    const action = button.dataset.action;
    if (!action) return;
    button.addEventListener("click", () => {
      if (petManager.actions && typeof petManager.actions[action] === "function") {
        petManager.actions[action]();
        return;
      }
      if (typeof petManager.triggerAction === "function") {
        petManager.triggerAction(action);
      }
    });
  }

  buttons.forEach((btn) => attachActionHandler(btn));
  callbackButtons.forEach((btn) => attachActionHandler(btn));

  const settingsBtn = petContainer.querySelector(".pet-settings");
  const settingsModal = petContainer.querySelector("#pet-settings-modal");
  const settingsCloses = petContainer.querySelectorAll("[data-settings-dismiss]");
  const vacationToggle = petContainer.querySelector("#vacation-mode");
  const nameInput = petContainer.querySelector("#pet-name-input");
  const nameSaveBtn = petContainer.querySelector("#pet-name-save");
  const soundToggle = petContainer.querySelector("#pet-sound-toggle");

  function setVacationMode(enabled, { silent = false } = {}) {
    vacationModeEnabled = Boolean(enabled);
    if (vacationToggle) {
      vacationToggle.checked = vacationModeEnabled;
    }
    window.bubblePetVacationMode = vacationModeEnabled;
    petContainer.classList.toggle("is-on-vacation", vacationModeEnabled);
    if (vacationModeEnabled) {
      if (messageEl) {
        lastMessageBeforeVacation = messageEl.textContent;
      }
      if (!silent) {
        const currentName = nameEl ? nameEl.textContent.trim() || "Your pet" : "Your pet";
        updateMessage(`${currentName} is taking a vacation.`);
      }
    } else if (!silent && lastMessageBeforeVacation) {
      updateMessage(lastMessageBeforeVacation);
      lastMessageBeforeVacation = null;
    }
  }

  function setSoundsEnabled(enabled) {
    soundsEnabled = Boolean(enabled);
    if (soundToggle) {
      soundToggle.checked = soundsEnabled;
    }
    Object.values(sounds).forEach((clip) => {
      clip.muted = !soundsEnabled;
      if (!soundsEnabled) {
        try {
          clip.pause();
        } catch {
          // ignore audio errors
        }
      }
    });
  }

  function syncSettingsUi() {
    if (vacationToggle) {
      vacationToggle.checked = vacationModeEnabled;
    }
    if (soundToggle) {
      soundToggle.checked = soundsEnabled;
    }
    if (nameInput && nameEl) {
      nameInput.value = nameEl.textContent.trim();
    }
  }

  function applyNameChange(nextName) {
    const trimmed = (nextName || "").trim();
    if (!trimmed) return;
    if (nameEl) {
      nameEl.textContent = trimmed;
    }
    if (typeof petManager.setProfile === "function") {
      petManager.setProfile({ name: trimmed });
    }
    syncSettingsUi();
  }

  setVacationMode(false, { silent: true });
  setSoundsEnabled(true);
  syncSettingsUi();

  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener("click", () => {
      syncSettingsUi();
      settingsModal.hidden = false;
    });
  }

  settingsCloses.forEach((el) => {
    el.addEventListener("click", () => {
      if (settingsModal) {
        settingsModal.hidden = true;
      }
    });
  });

  if (vacationToggle) {
    vacationToggle.addEventListener("change", (event) => {
      setVacationMode(event.target.checked);
    });
  }

  if (soundToggle) {
    soundToggle.addEventListener("change", (event) => {
      setSoundsEnabled(event.target.checked);
    });
  }

  if (nameSaveBtn) {
    nameSaveBtn.addEventListener("click", () => {
      applyNameChange(nameInput ? nameInput.value : "");
    });
  }

  if (nameInput) {
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyNameChange(nameInput.value);
      }
    });
  }

});
