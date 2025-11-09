window.addEventListener("DOMContentLoaded", () => {
  const spriteEl = document.getElementById("pet-sprite");
  const buttons = document.querySelectorAll("#pet-buttons button");

  const petState = {
    mode: "idle",
    idlePhase: "resting",
    soundEnabled: true,
    attention: 100,
    level: 1,
    name: "Axolotl",
  };

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

  function handleButtonClick(action) {
    switch (action) {
      case "pet":
        enterMode("pet");
        break;
      case "feed":
        enterMode("eat");
        break;
      case "swim":
        enterMode("swim");
        break;
      case "rest":
        enterMode("rest");
        break;
      case "sleep":
        enterMode("sleep");
        break;
      default:
        enterMode("idle");
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      handleButtonClick(btn.dataset.action);
    });
  });

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

  startIdleCycle();
  startAttentionTimer();

  console.log("✅ script validated");
});
