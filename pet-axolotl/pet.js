function registerResetCommand(target, handler) {
  if (!target || typeof target !== "object") return;

  try {
    target.resetPetLevel = handler;
  } catch (error) {
    console.warn("[BubblePet] Unable to expose resetPetLevel on target", error);
  }
}

function exposeResetCommand(handler) {
  const targets = new Set([window, globalThis]);

  if (typeof window !== "undefined" && window.parent && window.parent !== window) {
    targets.add(window.parent);
  }

  targets.forEach((target) => registerResetCommand(target, handler));
}

function ensurePetLevelUpPlaceholder() {
  const definePlaceholder = () => {
    if (typeof window.petLevelUp !== "function") {
      window.petLevelUp = function () {
        console.warn("petLevelUp is unavailable until the pet widget finishes initializing.");
      };
    }
  };

  if (document.readyState !== "loading") {
    definePlaceholder();
  } else {
    window.addEventListener("DOMContentLoaded", definePlaceholder, { once: true });
  }
}

if (document.readyState !== "loading") {
  ensurePetLevelUpPlaceholder();
} else {
  window.addEventListener("DOMContentLoaded", ensurePetLevelUpPlaceholder, { once: true });
}

let queuedResetRequests = 0;
let performResetCallback = null;

const ACHIEVEMENTS = {
  firstDisc: { unlocked: false, reward: "background-teal.png", label: "First Disc" },
  level10: { unlocked: false, reward: "background-twilight.png", label: "Reach Level 10" },
  level25: { unlocked: false, reward: "background-dusk.png", label: "Reach Level 25" },
  callBack20: { unlocked: false, reward: "background-whimsy.png", label: "Call Back 20 Times" },
  level100: { unlocked: false, reward: "background-meadow.png", label: "Reach Level 100" },
  swim2h: { unlocked: false, reward: "background-wildwest.png", label: "2 Hours Swimming" },
  allDiscs: { unlocked: false, reward: "background-winter.gif", label: "Play All Discs" },
  widget100h: { unlocked: false, reward: "background-sunset.gif", label: "100 Hours With BubblePet" },
};

const cloneAchievements = (data) => JSON.parse(JSON.stringify(data));

let achievements = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem("achievements"));
    if (stored && typeof stored === "object") {
      return { ...cloneAchievements(ACHIEVEMENTS), ...stored };
    }
  } catch {
    // ignore storage errors
  }
  return cloneAchievements(ACHIEVEMENTS);
})();

function saveAchievements() {
  localStorage.setItem("achievements", JSON.stringify(achievements));
}

function unlockAchievement(key) {
  if (!achievements[key].unlocked) {
    achievements[key].unlocked = true;
    saveAchievements();
    if (typeof showAchievementPopup === "function") {
      showAchievementPopup(achievements[key].label);
    }
    if (typeof renderAchievements === "function") {
      renderAchievements();
    }
  }
}

const handleResetRequest = () => {
  if (typeof performResetCallback === "function") {
    performResetCallback();
    return true;
  }

  queuedResetRequests += 1;
  console.warn("[BubblePet] Reset request queued until the widget finishes initializing.");
  return false;
};

const processQueuedResets = () => {
  if (typeof performResetCallback !== "function" || queuedResetRequests === 0) {
    return;
  }

  const pending = queuedResetRequests;
  queuedResetRequests = 0;

  for (let i = 0; i < pending; i += 1) {
    performResetCallback();
  }
};

window.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("message", (event) => {
    const type = event?.data?.type;

    if (type === "bubblepet:reset-level") {
      handleResetRequest();
    }
  });

  if (typeof window.resetPetLevel !== "function") {
    window.resetPetLevel = handleResetRequest;
    exposeResetCommand(window.resetPetLevel);
  }
});

function initPetWidget() {
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
  let xpBarFillEl = null;
  let xpTextEl = null;
  const rewardIconEl = document.getElementById("disc-reward-icon");
  const musicPlayerEl = document.getElementById("music-player");
  const musicSourceEl = document.getElementById("music-source");
  const statBars = Array.from(petContainer.querySelectorAll(".stat-bar"));
  const actionElements = Array.from(petContainer.querySelectorAll("[data-action]"));
  const roamButton = actionElements.find((btn) => btn.dataset.action === "roam");
  const callbackButtons = Array.from(
    document.querySelectorAll('[data-action="call-back"], [data-action="callback"], [data-action="callBack"]')
  ).filter((btn) => !actionElements.includes(btn));
  const buttons = Array.from(new Set([...actionElements, ...callbackButtons]));
  const discModalEl = document.getElementById("disc-player-modal");
  const discModalCloseEl = document.getElementById("disc-modal-close");
  const discPlayerButton = document.getElementById("disc-player-button");
  const discListEl = document.getElementById("disc-list");
  const stopMusicBtn = document.getElementById("stop-music");
  const achievementButton = document.getElementById("achievement-button");
  const achievementModal = document.getElementById("achievement-modal");
  const achievementCloseButton = document.getElementById("ach-close");
  const achievementListEl = document.getElementById("achievement-list");
  const backgroundListEl = document.getElementById("background-list");
  const achievementPopupEl = document.getElementById("achievement-popup");
  const aquariumBgImage = petContainer.querySelector(".aquarium-bg");

  const petManager = window.petManager;
  if (!petManager || typeof petManager.subscribeToAnimationChange !== "function") {
    console.error("[BubblePet] petManager is not available");
    return;
  }

  const initialPetState =
    typeof petManager.getPetState === "function" ? petManager.getPetState() : null;

  let petName = normalizePetName(nameEl ? nameEl.textContent : "");
  let vacationMode = false;
  let lastKnownMode = "idle";
  let lastIsDead = false;
  let lastKnownLevel = Number.isFinite(initialPetState?.level)
    ? initialPetState.level
    : 0;
  let lastRewardedKey = null;
  let happiness = 0;
  let hunger = 0;
  let sleepiness = 0;
  let overstimulation = 0;

  let DISC_POOL = [];
  let DISC_LVL_20 = "Pigstep";
  let DISC_LVL_50 = "Infinite Amethyst";
  let DISC_LVL_100 = "Axolotl";
  let ownedDiscs = [];
  let currentDisc = null;
  let petXP = 0;
  let petLevel = lastKnownLevel;
  let discAudio = null;
  let rewardAudio = null;
  let LEVEL_DISC_REWARDS = {};
  let GENERIC_DISC_POOL = [];
  let selectedBackgroundReward = null;

  try {
    selectedBackgroundReward = localStorage.getItem("selectedBackgroundReward");
  } catch {
    selectedBackgroundReward = null;
  }

  const initializeDiscState = () => {
    DISC_POOL = [
      "11",
      "13",
      "Cat",
      "Mellohi",
      "Strad",
      "Mall",
      "Stal",
      "Far",
      "Blocks",
      "Chirp",
      "Ward",
      "Wait",
    ];

    DISC_LVL_20 = "Pigstep";
    DISC_LVL_50 = "Infinite Amethyst";
    DISC_LVL_100 = "Axolotl";

    LEVEL_DISC_REWARDS = {
      20: DISC_LVL_20,
      50: DISC_LVL_50,
      100: DISC_LVL_100,
    };

    GENERIC_DISC_POOL = [...DISC_POOL];

    try {
      ownedDiscs = JSON.parse(localStorage.getItem("ownedDiscs")) || [];
    } catch {
      ownedDiscs = [];
    }

    try {
      currentDisc = localStorage.getItem("currentDisc");
    } catch {
      currentDisc = null;
    }

    try {
      const storedXP = Number(localStorage.getItem("petXP"));
      petXP = Number.isFinite(storedXP) ? storedXP : 0;
    } catch {
      petXP = 0;
    }

    try {
      const storedLevel = Number(localStorage.getItem("petLevel"));
      if (Number.isFinite(storedLevel) && storedLevel > 0) {
        petLevel = storedLevel;
        lastKnownLevel = storedLevel;
      }
    } catch {
      petLevel = lastKnownLevel;
    }

    if (!discAudio) {
      discAudio = new Audio();
      discAudio.loop = true;
    }
  };

  runAfterDomReady(initializeDiscState);
  ensureXPElements();

  function normalizePetName(name) {
    if (typeof name === "string") {
      const trimmed = name.trim();
      if (trimmed) {
        return trimmed.slice(0, 64);
      }
    }
    return "BubblePet";
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

  const LEVEL_100_REWARD_KEY = "bubblepetAxolotlLevel100RewardGranted";

  let level100RewardGranted = false;
  try {
    level100RewardGranted = localStorage.getItem(LEVEL_100_REWARD_KEY) === "true";
  } catch {
    level100RewardGranted = false;
  }

  const DISC_ASSETS = {
    Pigstep: { icon: "./assets/icon-pigstep.png", sound: "./sounds/Pigstep.mp3" },
    "Infinite Amethyst": {
      icon: "./assets/icon-infinite-amethyst.png",
      sound: "./sounds/Infinite-Amethyst.mp3",
    },
    Axolotl: { icon: "./assets/icon-Axolotl.png", sound: "./sounds/Axolotl.mp3" },
    11: { icon: "./assets/icon-11.png", sound: "./sounds/11.mp3" },
    13: { icon: "./assets/icon-13.png", sound: "./sounds/13.mp3" },
    Cat: { icon: "./assets/icon-cat.png", sound: "./sounds/Cat.mp3" },
    Mellohi: { icon: "./assets/icon-mellohi.png", sound: "./sounds/Mellohi.mp3" },
    Strad: { icon: "./assets/icon-strad.png", sound: "./sounds/Strad.mp3" },
    Mall: { icon: "./assets/icon-mall.png", sound: "./sounds/Mall.mp3" },
    Stal: { icon: "./assets/icon-stal.png", sound: "./sounds/Stal.mp3" },
    Far: { icon: "./assets/icon-far.png", sound: "./sounds/Far.mp3" },
    Blocks: { icon: "./assets/icon-blocks.png", sound: "./sounds/Blocks.mp3" },
    Chirp: { icon: "./assets/icon-chirp.png", sound: "./sounds/Chirp.mp3" },
    Ward: { icon: "./assets/icon-ward.png", sound: "./sounds/Ward.mp3" },
    Wait: { icon: "./assets/icon-wait.png", sound: "./sounds/Wait.mp3" },
  };

  const sounds = {};
  let soundsEnabled = initialPetState?.soundEnabled !== false;
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

  function playDiscSound(src) {
    if (!src || !soundsEnabled) return;
    try {
      const track = new Audio(src);
      track.volume = 0.6;
      track.play().catch(() => {});
    } catch {
      // ignore audio errors
    }
  }

  function setActiveRewardAudio(audioEl) {
    if (!audioEl) return;

    if (rewardAudio && rewardAudio !== audioEl) {
      try {
        rewardAudio.pause();
        rewardAudio.currentTime = 0;
      } catch {
        // ignore audio errors
      }
    }

    rewardAudio = audioEl;
  }

  function playDiscRewardAudio(rewardDetails) {
    if (!rewardDetails?.sound || !soundsEnabled) return;

    try {
      if (musicSourceEl && musicPlayerEl) {
        musicSourceEl.src = rewardDetails.sound;
        musicPlayerEl.load();
        musicPlayerEl.style.display = "block";
        setActiveRewardAudio(musicPlayerEl);
        const playPromise = musicPlayerEl.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
        return;
      }
    } catch {
      // fall back to basic audio playback
    }
    try {
      const rewardTrack = new Audio(rewardDetails.sound);
      rewardTrack.volume = 0.6;
      setActiveRewardAudio(rewardTrack);
      rewardTrack.play().catch(() => {});
    } catch {
      rewardAudio = null;
      playDiscSound(rewardDetails.sound);
    }
  }

  function getDiscRewardDetails(name) {
    if (typeof name !== "string" || !name) return null;
    const details = DISC_ASSETS[name];
    if (!details) return null;
    return { ...details, name };
  }

  function hideRewardIcon() {
    if (!rewardIconEl) return;
    rewardIconEl.style.display = "none";
    rewardIconEl.removeAttribute("src");
    rewardIconEl.removeAttribute("alt");
  }

  function showRewardIcon(iconPath, altText = "Music disc reward") {
    if (!rewardIconEl || !iconPath) {
      hideRewardIcon();
      return;
    }

    rewardIconEl.src = iconPath;
    rewardIconEl.alt = altText;
    rewardIconEl.style.display = "inline-block";
  }

  function renderDiscRewardMessage(rewardDetails, messageText) {
    const safeMessage = typeof messageText === "string" ? messageText : "";
    if (!messageEl) return;

    if (rewardDetails?.icon) {
      const altText = rewardDetails.name
        ? `${rewardDetails.name} music disc`
        : "Music disc reward icon";
      showRewardIcon(rewardDetails.icon, altText);
    } else {
      hideRewardIcon();
    }

    messageEl.textContent = safeMessage;
  }

  function selectRandomDiscName() {
    if (!Array.isArray(GENERIC_DISC_POOL) || GENERIC_DISC_POOL.length === 0) {
      return null;
    }
    const index = Math.floor(Math.random() * GENERIC_DISC_POOL.length);
    return GENERIC_DISC_POOL[index] || null;
  }

  function buildCombinedMessage(base, reward) {
    const baseMessage = (base || "").trim();
    if (baseMessage) {
      return `${baseMessage} ${reward}`;
    }
    return reward;
  }

  function setSoundEnabled(enabled) {
    const nextState = enabled !== false;
    soundsEnabled = nextState;
    if (typeof petManager.setSoundEnabled === "function") {
      petManager.setSoundEnabled(nextState);
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
    hideRewardIcon();
    messageEl.textContent = text;
  }

  function ensureXPElements() {
    const metaRow = petContainer.querySelector(".pet-meta-row");

    const xpContainers = Array.from(petContainer.querySelectorAll(".xp-bar-container"));
    const xpTexts = Array.from(petContainer.querySelectorAll("#xp-text"));
    const xpFills = Array.from(petContainer.querySelectorAll("#xp-bar-fill"));

    const primaryContainer = metaRow?.querySelector(".xp-bar-container") || xpContainers[0] || null;
    const primaryText = metaRow?.querySelector("#xp-text") || xpTexts[0] || null;
    const primaryFill =
      (primaryContainer ? primaryContainer.querySelector("#xp-bar-fill") : null) || xpFills[0] || null;

    xpContainers.forEach((node) => {
      if (node !== primaryContainer) {
        node.remove();
      }
    });

    xpTexts.forEach((node) => {
      if (node !== primaryText) {
        node.remove();
      }
    });

    xpFills.forEach((node) => {
      if (node !== primaryFill) {
        node.remove();
      }
    });

    xpBarFillEl = primaryFill;
    xpTextEl = primaryText;
  }

  function xpNeeded(level) {
    return Math.floor(30 * Math.pow(level, 1.4));
  }

  function updateXPBar() {
    const needed = xpNeeded(petLevel);
    const percent = Math.min(100, (petXP / needed) * 100);

    if (!xpBarFillEl || !xpTextEl) {
      ensureXPElements();
    }

    if (xpBarFillEl) {
      xpBarFillEl.style.width = `${percent}%`;
    }

    if (xpTextEl) {
      xpTextEl.textContent = `${petXP} / ${needed} XP`;
    }
  }

  function persistProgress() {
    try {
      localStorage.setItem("petXP", petXP);
      localStorage.setItem("petLevel", petLevel);
    } catch {
      // ignore storage errors
    }
  }

  function handleDiscRewards(level) {
    if (level % 5 === 0) {
      try {
        const ax = new Audio("sounds/Axolotl.mp3");
        setActiveRewardAudio(ax);
        ax.play().catch(() => {});
      } catch {
        // ignore audio errors
      }
    }

    let rewardDisc = null;

    if (level === 20) rewardDisc = DISC_LVL_20;
    else if (level === 50) rewardDisc = DISC_LVL_50;
    else if (level === 100) rewardDisc = DISC_LVL_100;
    else if (level % 5 === 0) rewardDisc = null;
    else {
      const remaining = DISC_POOL.filter((d) => !ownedDiscs.includes(d));
      if (remaining.length > 0) {
        rewardDisc = remaining[Math.floor(Math.random() * remaining.length)];
      }
    }

    if (rewardDisc) {
      ownedDiscs.push(rewardDisc);
      try {
        localStorage.setItem("ownedDiscs", JSON.stringify(ownedDiscs));
      } catch {
        // ignore storage errors
      }
      renderDiscList();
    }
  }

  function checkLevelUp() {
    let needed = xpNeeded(petLevel);
    let leveled = false;
    while (petXP >= needed) {
      petXP -= needed;
      petLevel += 1;
      leveled = true;
      handleDiscRewards(petLevel);
      persistProgress();
      needed = xpNeeded(petLevel);
    }

    if (leveled) {
      updateLevel(petLevel);
      lastKnownLevel = petLevel;
      if (typeof petManager.setProfile === "function") {
        petManager.setProfile({ level: petLevel });
      }
    }

    updateXPBar();
  }

  function gainXP(amount) {
    if (!Number.isFinite(amount)) return;

    if (happiness < -15) return;
    if (hunger === 10 || sleepiness === 10) return;

    let awarded = amount;
    if (overstimulation > 8) {
      awarded = amount / 2;
    }

    petXP += awarded;
    persistProgress();
    checkLevelUp();
    updateXPBar();
  }

  function playDisc(name) {
    if (!discAudio || typeof name !== "string") return;

    const discSoundPath = getDiscSoundPath(name);
    if (!discSoundPath) return;

    discAudio.src = discSoundPath;
    currentDisc = name;

    try {
      localStorage.setItem("currentDisc", name);
    } catch {
      // ignore storage errors
    }

    discAudio.play().catch(() => {});
  }

  function getDiscSoundPath(discName) {
    const assetSound = DISC_ASSETS?.[discName]?.sound;
    if (assetSound) {
      return assetSound;
    }

    if (typeof discName !== "string" || !discName) {
      return null;
    }

    const safeDiscName = discName.trim().replace(/\s+/g, "-");
    return `./sounds/${safeDiscName}.mp3`;
  }

  function stopMusic() {
    if (discAudio) {
      discAudio.pause();
      discAudio.currentTime = 0;
    }

    if (rewardAudio) {
      try {
        rewardAudio.pause();
        rewardAudio.currentTime = 0;
      } catch {
        // ignore audio errors
      }
      rewardAudio = null;
    }

    if (musicPlayerEl) {
      musicPlayerEl.pause();
      musicPlayerEl.currentTime = 0;
    }
    currentDisc = null;
    try {
      localStorage.removeItem("currentDisc");
    } catch {
      // ignore storage errors
    }
  }

  function renderDiscList() {
    if (!discListEl) return;

    const renderDiscEntry = (discName) => {
      const assets = DISC_ASSETS[discName];
      const iconSrc = assets?.icon || "./assets/icon-player.png";
      const altText = `${discName} disc icon`;

      return `
        <div class="disc-entry">
          <img src="${iconSrc}" alt="${altText}" />
          <div class="disc-meta">
            <div class="disc-title">${discName}</div>
            <div class="disc-subtitle">Minecraft music disc</div>
          </div>
          <button class="disc-play-btn" type="button" data-disc="${discName}">▶️ Play</button>
        </div>
      `;
    };

    discListEl.innerHTML = ownedDiscs.map((disc) => renderDiscEntry(disc)).join("");
  }

  function setBackgroundReward(rewardFile) {
    if (!aquariumBgImage || typeof rewardFile !== "string" || !rewardFile) {
      return;
    }

    const rewardEntry = Object.values(achievements).find((meta) => meta.reward === rewardFile);
    if (rewardEntry && rewardEntry.unlocked === false) {
      return;
    }

    const src = rewardFile.startsWith("./") ? rewardFile : `./assets/${rewardFile}`;
    aquariumBgImage.src = src;

    selectedBackgroundReward = rewardFile;

    try {
      localStorage.setItem("selectedBackgroundReward", rewardFile);
    } catch {
      // ignore storage errors
    }

    if (!backgroundListEl) return;
    backgroundListEl.querySelectorAll(".background-thumb").forEach((thumb) => {
      thumb.classList.toggle("active", thumb.dataset.reward === rewardFile);
    });
  }

  function renderBackgroundRewards() {
    if (!backgroundListEl) return;

    backgroundListEl.innerHTML = "";

    Object.entries(achievements).forEach(([key, meta]) => {
      const rewardFile = meta.reward;
      const thumb = document.createElement("img");
      thumb.src = rewardFile.startsWith("./") ? rewardFile : `./assets/${rewardFile}`;
      thumb.alt = `${meta.label} background reward`;
      thumb.className = "background-thumb";
      thumb.dataset.key = key;
      thumb.dataset.reward = rewardFile;

      if (!meta.unlocked) {
        thumb.classList.add("locked");
        thumb.style.opacity = "0.4";
        thumb.style.cursor = "not-allowed";
      } else {
        thumb.addEventListener("click", () => {
          setBackgroundReward(rewardFile);
        });
      }

      if (selectedBackgroundReward === rewardFile) {
        thumb.classList.add("active");
      }

      backgroundListEl.appendChild(thumb);
    });
  }

  function renderAchievements() {
    if (achievementListEl) {
      achievementListEl.innerHTML = "";

      Object.values(achievements).forEach((entry) => {
        const achievementRow = document.createElement("div");
        achievementRow.className = "achievement-entry";

        if (!entry.unlocked) {
          achievementRow.classList.add("locked");
        }

        const labelSpan = document.createElement("span");
        labelSpan.textContent = entry.label;

        const statusSpan = document.createElement("span");
        statusSpan.textContent = entry.unlocked ? "Unlocked" : "Locked";

        achievementRow.appendChild(labelSpan);
        achievementRow.appendChild(statusSpan);

        achievementListEl.appendChild(achievementRow);
      });
    }

    renderBackgroundRewards();
  }

  function showAchievementPopup(label) {
    if (!achievementPopupEl) return;

    achievementPopupEl.classList.remove("hidden");
    achievementPopupEl.setAttribute("aria-label", label || "Achievement unlocked");

    setTimeout(() => {
      achievementPopupEl.classList.add("hidden");
    }, 1600);
  }

  window.renderAchievements = renderAchievements;
  window.showAchievementPopup = showAchievementPopup;

  const initialBackground =
    selectedBackgroundReward || aquariumBgImage?.getAttribute("src") || "./assets/background.png";
  if (initialBackground) {
    setBackgroundReward(initialBackground);
  }

  function updateLevel(level) {
    if (!levelEl) return;
    const safeLevel = Number.isFinite(level) ? level : 0;
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

    if (typeof stats?.affection === "number") {
      happiness = stats.affection;
    }
    if (typeof stats?.hunger === "number") {
      hunger = stats.hunger;
    }
    if (typeof stats?.sleepiness === "number") {
      sleepiness = stats.sleepiness;
    }
    if (typeof stats?.overstimulation === "number") {
      overstimulation = stats.overstimulation;
    }
  }

  function persistLevel100RewardFlag() {
    try {
      localStorage.setItem(LEVEL_100_REWARD_KEY, "true");
    } catch {
      // ignore storage errors
    }
  }

  function createLevel100Icon() {
    const existing = petContainer.querySelector(".pet-level-100-icon");
    if (existing) return existing;

    const icon = document.createElement("img");
    icon.src = "./assets/icon-Axolotl.png";
    icon.alt = "Level 100 Axolotl reward";
    icon.className = "pet-level-100-icon";

    const header = petContainer.querySelector(".pet-header");
    (header || petContainer).appendChild(icon);
    return icon;
  }

  function clearLevel100Icon() {
    const existing = petContainer.querySelector(".pet-level-100-icon");
    if (existing && existing.parentElement) {
      existing.parentElement.removeChild(existing);
    }
  }

  function playLevel100CelebrationSound() {
    if (!soundsEnabled) return;
    try {
      const celebrationAudio = new Audio("./sounds/Axolotl.mp3");
      celebrationAudio.volume = 0.6;
      setActiveRewardAudio(celebrationAudio);
      celebrationAudio.play().catch(() => {});
    } catch {
      // ignore audio errors
    }
  }

  function handleLevelRewards(level, meta = {}, state = {}, previousLevel = lastKnownLevel) {
    if (!Number.isFinite(level)) return;

    const currentLevel = level;
    const priorLevel = Number.isFinite(previousLevel) ? previousLevel : 0;
    const ascendingLevels = currentLevel > priorLevel ? currentLevel - priorLevel : 0;
    const levelsToInspect = ascendingLevels > 0 ? ascendingLevels : 1;

    let level100Reached = false;
    let selectedReward = null;

    const rewardPriority = {
      level100: 3,
      level50: 2,
      level20: 1,
      generic: 0,
    };

    const considerReward = (levelValue, rewardInfo) => {
      if (!rewardInfo) return;
      const priority = rewardPriority[rewardInfo.type] ?? -1;
      const currentPriority = selectedReward ? selectedReward.priority : -1;
      if (priority > currentPriority || (priority === currentPriority && levelValue > selectedReward.level)) {
        selectedReward = {
          ...rewardInfo,
          level: levelValue,
          priority,
        };
      }
    };

    for (let offset = 0; offset < levelsToInspect; offset += 1) {
      const candidateLevel = ascendingLevels > 0 ? priorLevel + offset + 1 : currentLevel;

      if (candidateLevel === 100) {
        level100Reached = true;
        if (!level100RewardGranted) {
          considerReward(candidateLevel, { type: "level100", discName: LEVEL_DISC_REWARDS[100] });
        }
        continue;
      }

      if (candidateLevel === 50) {
        considerReward(candidateLevel, { type: "level50", discName: LEVEL_DISC_REWARDS[50] });
        continue;
      }

      if (candidateLevel === 20) {
        considerReward(candidateLevel, { type: "level20", discName: LEVEL_DISC_REWARDS[20] });
        continue;
      }

      const eligibleForFiveLevelReward = candidateLevel > 0 && candidateLevel % 5 === 0;
      if (eligibleForFiveLevelReward) {
        considerReward(candidateLevel, { type: "generic" });
      }
    }

    if (level100Reached) {
      createLevel100Icon();
    }

    if (!selectedReward) {
      return;
    }

    const baseMessage = (meta.message ?? state.message ?? "").trim();
    const rewardKey = `${selectedReward.type}-${selectedReward.level}`;
    if (rewardKey && rewardKey === lastRewardedKey) {
      return;
    }
    const finalizeReward = () => {
      lastRewardedKey = rewardKey;
    };

    if (selectedReward.type === "level100") {
      level100RewardGranted = true;
      persistLevel100RewardFlag();

      const celebrationMessage =
        "🐾 Legendary milestone! Pico evolved into a Mythic Axolotl at Level 100!";
      const discName = selectedReward.discName || LEVEL_DISC_REWARDS[100];
      const discReward = discName ? getDiscRewardDetails(discName) : null;
      const rewardLine = discName
        ? `${celebrationMessage} 🎵 Pico unlocked the ${discName} music disc!`
        : celebrationMessage;
      const combinedMessage = buildCombinedMessage(baseMessage, rewardLine);
      renderDiscRewardMessage(discReward, combinedMessage);
      if (discReward) {
        playDiscRewardAudio(discReward);
      } else {
        playLevel100CelebrationSound();
      }
      finalizeReward();
      return;
    }

    if (selectedReward.type === "level50") {
      const discName = selectedReward.discName || LEVEL_DISC_REWARDS[50];
      const discReward = discName ? getDiscRewardDetails(discName) : null;
      const rewardLine = discName
        ? `🌟 Level 50 reached! Pico unlocked the ${discName} music disc!`
        : "🌟 Level 50 reached! Pico earns a legendary reward!";
      const combinedMessage = buildCombinedMessage(baseMessage, rewardLine);
      renderDiscRewardMessage(discReward, combinedMessage);
      if (discReward) {
        playDiscRewardAudio(discReward);
      }
      finalizeReward();
      return;
    }

    if (selectedReward.type === "level20") {
      const discName = selectedReward.discName || LEVEL_DISC_REWARDS[20];
      const discReward = discName ? getDiscRewardDetails(discName) : null;
      const rewardLine = discName
        ? `🎁 Level 20 reward unlocked! Pico found the ${discName} music disc!`
        : "🎁 Level 20 reward unlocked! Enjoy a special treat for Pico!";
      const combinedMessage = buildCombinedMessage(baseMessage, rewardLine);
      renderDiscRewardMessage(discReward, combinedMessage);
      if (discReward) {
        playDiscRewardAudio(discReward);
      }
      finalizeReward();
      return;
    }

    const randomDiscName = selectRandomDiscName();
    if (!randomDiscName) {
      return;
    }

    const randomDiscReward = getDiscRewardDetails(randomDiscName);
    const rewardLine = `✨ Level ${selectedReward.level} reward! Pico discovered the ${randomDiscName} music disc!`;
    const combinedMessage = buildCombinedMessage(baseMessage, rewardLine);
    renderDiscRewardMessage(randomDiscReward, combinedMessage);
    if (randomDiscReward) {
      playDiscRewardAudio(randomDiscReward);
    }
    finalizeReward();
  }

  const CALLBACK_ACTIONS = new Set(["call-back", "callback"]);
  let lastReportedRoamState = null;

  const ACTION_XP_MAP = {
    feed: 5,
    sleep: 5,
    swim: 5,
    rest: 5,
    pet: 3,
    roam: 2,
  };

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
    const vacationActive = vacationMode;
    notifyParentAboutRoamState(isRoaming);
    if (roamButton) {
      roamButton.textContent = vacationActive ? "On Vacation" : isRoaming ? "Call Back" : "Roam";
      roamButton.disabled = vacationActive ? true : isDead ? true : false;
    }

    buttons.forEach((btn) => {
      const action = (btn.dataset.action || "").toLowerCase();
      const isRoamBtn = action === "roam";
      const isCallbackBtn = CALLBACK_ACTIONS.has(action);
      if (vacationActive || isDead) {
        btn.disabled = true;
      } else if (!isRoamBtn && !isCallbackBtn) {
        btn.disabled = isRoaming;
      } else if (!isRoaming) {
        btn.disabled = false;
      }
    });

    callbackButtons.forEach((btn) => {
      btn.disabled = vacationActive ? true : Boolean(isDead);
    });
  }

  function setPetName(name) {
    petName = normalizePetName(name);
    if (nameEl) {
      nameEl.textContent = petName;
    }
    applyProfileFromDom();
  }

  setPetName(petName);
  setPetLevel(petLevel);
  renderDiscList();
  renderAchievements();

  window.playStoredDisc = function () {
    if (currentDisc) {
      playDisc(currentDisc);
    }
  };

  function setPetLevel(level) {
    const numericLevel = Number(level);
    if (!Number.isFinite(numericLevel)) return;

    const safeLevel = Math.max(0, Math.round(numericLevel));
    lastKnownLevel = safeLevel;
    updateLevel(safeLevel);
    if (typeof petManager.setProfile === "function") {
      petManager.setProfile({ level: safeLevel });
    }
  }

  function updateVacationState(isVacation) {
    vacationMode = Boolean(isVacation);
    if (petContainer) {
      petContainer.classList.toggle("vacation-mode", vacationMode);
    }
    updateRoamState(lastKnownMode, lastIsDead);
  }

  function applyProfileFromDom() {
    const details = {};
    if (petName) {
      details.name = petName;
    } else if (nameEl) {
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
    soundsEnabled = state.soundEnabled !== false;

    const currentLevel = Number.isFinite(state.level) ? state.level : lastKnownLevel;

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
    lastKnownMode = state.mode;
    lastIsDead = isDead;
    updateLevel(state.level);
    updateStats(state.stats);
    if (Number.isFinite(currentLevel)) {
      petLevel = currentLevel;
      persistProgress();
    }
    updateDeathState(isDead);
    updateVacationState(state.vacation);
    updateRoamState(state.mode, isDead);

    const leveledUpNow = Boolean(meta.leveledUp) || currentLevel > lastKnownLevel;
    if (leveledUpNow || currentLevel === 100) {
      handleLevelRewards(currentLevel, meta, state, lastKnownLevel);
    }

    lastKnownLevel = currentLevel;

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

  const actionContainer = petContainer.querySelector(".pet-actions");

  const handleActionTrigger = (actionName) => {
    if (!actionName) return;
    const normalized = (actionName || "").toLowerCase();
    if (ACTION_XP_MAP[normalized]) {
      gainXP(ACTION_XP_MAP[normalized]);
    }
    if (petManager.actions && typeof petManager.actions[actionName] === "function") {
      petManager.actions[actionName]();
      return;
    }
    if (typeof petManager.triggerAction === "function") {
      petManager.triggerAction(actionName);
    }
  };

  const delegatedClickHandler = (event) => {
    const target = event.target;
    if (!target) return;

    const actionTrigger = target.closest("[data-action]");
    if (actionTrigger) {
      handleActionTrigger(actionTrigger.dataset.action);
      return;
    }
  };

  petContainer.addEventListener("click", delegatedClickHandler);

  if (actionContainer) {
    actionContainer.addEventListener("click", delegatedClickHandler);
  }

  const setupDiscModalListeners = () => {
    if (discPlayerButton && discModalEl) {
      discPlayerButton.addEventListener("click", () => {
        const wasHidden = discModalEl.classList.contains("hidden");
        discModalEl.classList.toggle("hidden");
        if (wasHidden) {
          renderDiscList();
        }
      });
    }

    if (discModalCloseEl && discModalEl) {
      discModalCloseEl.addEventListener("click", () => {
        discModalEl.classList.add("hidden");
      });
    }

    if (stopMusicBtn) {
      stopMusicBtn.addEventListener("click", () => {
        stopMusic();
      });
    }
  };

  if (document.readyState !== "loading") {
    setupDiscModalListeners();
  } else {
    window.addEventListener("DOMContentLoaded", setupDiscModalListeners, { once: true });
  }

  document.addEventListener("click", (event) => {
    const playTrigger = event.target.closest?.(".disc-play-btn");
    if (playTrigger) {
      const discName = playTrigger.dataset.disc;
      playDisc(discName);
      return;
    }

    if (event.target && event.target.id === "stop-music") {
      stopMusic();
    }
  });

  const HOURLY_XP_INTERVAL_MS = 60 * 60 * 1000;
  setInterval(() => {
    if (happiness > 0) {
      gainXP(2);
    }
  }, HOURLY_XP_INTERVAL_MS);

  const handleConfigMessage = (event) => {
    const data = event.data;
    if (!data || data.source !== "bubblemarks") {
      return;
    }

    if (data.type === "set-vacation-mode") {
      const vacationEnabled = Boolean(data.payload?.vacation);
      if (typeof petManager.setVacationMode === "function") {
        petManager.setVacationMode(vacationEnabled);
      }
      updateVacationState(vacationEnabled);
      return;
    }

    if (data.type === "set-pet-sound-enabled") {
      const soundEnabled = data.payload?.enabled !== false;
      setSoundEnabled(soundEnabled);
      return;
    }

    if (data.type === "set-pet-name") {
      const nextName = typeof data.payload?.name === "string" ? data.payload.name : "";
      setPetName(nextName);
    }

    if (data.type === "set-pet-level") {
      const payloadLevel = data.payload?.level;
      setPetLevel(payloadLevel);
      return;
    }
  };

  window.addEventListener("message", handleConfigMessage);

  const resetPetProgress = () => {
    stopMusic();

    petXP = 0;
    petLevel = 0;
    lastKnownLevel = 0;
    lastRewardedKey = null;
    level100RewardGranted = false;

    clearLevel100Icon();
    hideRewardIcon();
    ownedDiscs = [];
    currentDisc = null;

    renderDiscList();
    updateLevel(petLevel);
    updateXPBar();

    try {
      localStorage.setItem("petXP", petXP);
      localStorage.setItem("petLevel", petLevel);
      localStorage.setItem("ownedDiscs", JSON.stringify(ownedDiscs));
      localStorage.removeItem("currentDisc");
    } catch (err) {
      console.warn("resetPetProgress: failed to update localStorage", err);
    }

    if (petManager && typeof petManager.resetPet === "function") {
      petManager.resetPet();
    } else if (petManager && typeof petManager.setProfile === "function") {
      petManager.setProfile({ level: 0 });
    }

    console.log("🐾 Pet progress fully reset!");
  };

  // ===============================
  // DEBUG: Manual Level-Up Command
  // ===============================
  window.petLevelUp = function (amount = 1) {
    const increments = Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 1;
    let previousLevel = petLevel;

    for (let i = 0; i < increments; i++) {
      petLevel += 1;
      persistProgress();
      updateLevel(petLevel);
      handleLevelRewards(petLevel, {}, {}, previousLevel);
      if (typeof petManager.setProfile === "function") {
        petManager.setProfile({ level: petLevel });
      }
      console.log(`DEBUG: Level is now ${petLevel}`);
      previousLevel = petLevel;
    }

    lastKnownLevel = petLevel;
  };

  const readyResetPetLevel = function () {
    resetPetProgress();
  };

  performResetCallback = readyResetPetLevel;
  window.resetPetLevel = readyResetPetLevel;
  exposeResetCommand(readyResetPetLevel);

  processQueuedResets();

  updateXPBar();

  window.debugReset = function () {
    console.log("🐾 DEBUG: Hard reset triggered");
    resetPetProgress();
  };

}

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 50;
let petWidgetInitialized = false;

function attemptInit(attempt = 1) {
  if (petWidgetInitialized) return;

  if (window.petManager && typeof window.petManager.subscribeToAnimationChange === "function") {
    petWidgetInitialized = true;
    initPetWidget();
    return;
  }

  if (attempt < MAX_ATTEMPTS) {
    setTimeout(() => attemptInit(attempt + 1), RETRY_DELAY_MS);
  } else {
    console.error("[BubblePet] petManager did not become available after DOMContentLoaded");
  }
}

function setupAchievementModalTriggers() {
  const achievementButton = document.getElementById("achievement-button");
  const achievementModal = document.getElementById("achievement-modal");
  const achievementCloseButton = document.getElementById("ach-close");

  const toggleAchievementModal = (show) => {
    if (!achievementModal) return;

    if (show) {
      achievementModal.classList.remove("hidden");
      if (typeof window.renderAchievements === "function") {
        window.renderAchievements();
      }
    } else {
      achievementModal.classList.add("hidden");
    }
  };

  if (achievementButton) {
    achievementButton.addEventListener("click", () => {
      const shouldShow = achievementModal?.classList.contains("hidden");
      toggleAchievementModal(Boolean(shouldShow));
    });
  }

  if (achievementCloseButton) {
    achievementCloseButton.addEventListener("click", () => {
      toggleAchievementModal(false);
    });
  }

  if (achievementModal) {
    achievementModal.addEventListener("click", (event) => {
      if (event.target === achievementModal) {
        toggleAchievementModal(false);
      }
    });
  }
}

function runAfterDomReady(callback) {
  if (typeof callback !== "function") {
    return;
  }

  const invoke = () => {
    callback();
  };

  window.addEventListener("DOMContentLoaded", invoke, { once: true });

  if (document.readyState !== "loading") {
    invoke();
  }
}

runAfterDomReady(() => {
  setupAchievementModalTriggers();
  attemptInit();
});

// Ensure the debug helper is always defined, even if the widget fails early.
runAfterDomReady(() => {
  if (typeof window.petLevelUp !== "function") {
    window.petLevelUp = function () {
      console.warn("petLevelUp is unavailable until the pet widget finishes initializing.");
    };
  }
});

runAfterDomReady(() => {
  let storedDiscName = null;
  try {
    storedDiscName = localStorage.getItem("currentDisc");
  } catch {
    storedDiscName = null;
  }

  if (!storedDiscName) {
    return;
  }

  const tryPlayStoredDisc = () => {
    if (typeof window.playStoredDisc === "function") {
      window.playStoredDisc();
      return true;
    }
    return false;
  };

  if (tryPlayStoredDisc()) {
    return;
  }

  const playbackInterval = setInterval(() => {
    if (tryPlayStoredDisc()) {
      clearInterval(playbackInterval);
    }
  }, RETRY_DELAY_MS);

  setTimeout(() => {
    clearInterval(playbackInterval);
  }, MAX_ATTEMPTS * RETRY_DELAY_MS);
});
