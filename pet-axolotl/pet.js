window.addEventListener("DOMContentLoaded", () => {
  console.log("✅ script validated");

  const petContainer = document.querySelector(".pet-container");
  if (!petContainer) {
    console.error("[BubblePet] .pet-container not found");
    return;
  }

  const spriteEl = petContainer.querySelector("#pet-sprite");
  const messageEl = petContainer.querySelector(".message-bar");
  const levelEl = petContainer.querySelector(".pet-level");
  const nameEl = petContainer.querySelector(".pet-name");
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

  const sounds = {};
  SOUND_FILES.forEach((name) => {
    const audio = new Audio(`sounds/${name}.mp3`);
    audio.preload = "auto";
    audio.volume = 0.45;
    sounds[name] = audio;
  });

  function playSound(name) {
    const clip = sounds[name];
    if (!clip) return;
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

  const STAT_LABEL_MAP = {
    hunger: "hunger",
    sleepiness: "sleepiness",
    boredom: "boredom",
    "overstim.": "overstimulation",
    affection: "affection",
  };

  let lastSpriteSrc = spriteEl ? spriteEl.getAttribute("src") : "";

  function setSpriteSource(src, forceRestart = false) {
    if (!spriteEl || !src) return;
    if (!forceRestart) {
      spriteEl.src = src;
      lastSpriteSrc = src;
      return;
    }
    spriteEl.src = "";
    requestAnimationFrame(() => {
      spriteEl.src = src;
      lastSpriteSrc = src;
    });
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
        fill.style.width = `${value}%`;
      }
    });
  }

  const CALLBACK_ACTIONS = new Set(["call-back", "callback"]);

  function updateRoamState(mode) {
    if (spriteEl) {
      spriteEl.style.opacity = mode === "roam" ? "0" : "1";
    }

    const isRoaming = mode === "roam";
    if (roamButton) {
      roamButton.textContent = isRoaming ? "Call Back" : "Roam";
      roamButton.disabled = false;
    }

    buttons.forEach((btn) => {
      const action = (btn.dataset.action || "").toLowerCase();
      const isRoamBtn = action === "roam";
      const isCallbackBtn = CALLBACK_ACTIONS.has(action);
      if (!isRoamBtn && !isCallbackBtn) {
        btn.disabled = isRoaming;
      } else if (!isRoaming) {
        btn.disabled = false;
      }
    });

    callbackButtons.forEach((btn) => {
      btn.disabled = false;
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

    updateLevel(state.level);
    updateStats(state.stats);
    updateRoamState(state.mode);
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

});
