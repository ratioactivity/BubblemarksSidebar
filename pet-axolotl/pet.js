// BubblePet Axolotl – clean advanced state machine
// Replace your entire pet.js file with this.

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ script validated");
  const root = document.querySelector(".pet-container");
  if (!root) {
    console.error("[BubblePet] .pet-container not found");
    return;
  }

  const spriteEl = root.querySelector("#pet-sprite");
  const messageEl = root.querySelector(".message-bar");
  const levelEl = root.querySelector(".pet-level");
  const nameEl = root.querySelector(".pet-name");
  const buttons = Array.from(root.querySelectorAll(".pet-actions button"));

  if (!spriteEl || !messageEl || !levelEl || !nameEl || !buttons.length) {
    console.error("[BubblePet] Missing core DOM elements");
    return;
  }

  // --- CONFIG -------------------------------------------------------------

  const SPRITES = {
    resting: "assets/resting.gif",
    restingBubble: "assets/restingbubble.gif",
    restToFloat: "assets/rest-to-float.gif",
    floatToRest: "assets/float-to-rest.gif",
    restToSleep: "assets/rest-to-sleep.gif",
    sleepToRest: "assets/sleep-to-rest.gif",
    floatToSleep: "assets/float-to-sleep.gif",
    sleepToFloat: "assets/sleep-to-float.gif",
    floatToSwim: "assets/float-to-swim.gif",
    swimToFloat: "assets/swim-to-float.gif",
    floating: "assets/floating.gif",
    sleeping: "assets/sleeping.gif",
    swimming: "assets/swimming.gif",
    fastSwim: "assets/fast-swim.gif",
    munching: "assets/munching.gif",
    petting: "assets/pet.gif",
  };

  // Durations in ms – from your chart (seconds × 1000, rounded)
  const DURATIONS = {
    fastSwim: 1080,
    floating: 1680,
    floatToRest: 1430,
    floatToSleep: 2040,
    floatToSwim: 960,
    munching: 960,
    petting: 2340,
    resting: 780,
    restingBubble: 2340,
    restToFloat: 1320,
    restToSleep: 1820,
    sleeping: 1920,
    sleepToFloat: 2470,
    sleepToRest: 1820,
    swimming: 1440,
    swimToFloat: 1440,
  };

  // Animation → sound map
  const ANIM_SOUNDS = {
    resting: "resting-sound",
    restingBubble: "resting-sound",
    floating: "float-squeak",
    swimming: "swimming-sound",
    fastSwim: "fastswim-squeak",
    munching: "munch-squeak",
    petting: "pet-sound",
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

  // --- AUDIO --------------------------------------------------------------

  const sounds = {};
  const BUBBLE_SOUND_COOLDOWN = 2300;
  let lastBubbleSoundTime = 0;
  SOUND_FILES.forEach((name) => {
    const audio = new Audio(`sounds/${name}.mp3`);
    audio.preload = "auto";
    audio.volume = 0.45;
    sounds[name] = audio;
  });

  function playSound(name) {
    const a = sounds[name];
    if (!a) return;
    try {
      a.pause();
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {
      // ignore audio edge cases
    }
  }

  // --- STATE --------------------------------------------------------------

  const petState = {
    mode: "idle", // "idle" | "action" | "sleep" | "swim" | "roam"
    currentAnim: "resting",
    busy: false,
    level: 1,
    name: nameEl.textContent.trim() || "Pico",
  };

  let animTimer = null;

  function setMessage(text) {
    messageEl.textContent = text;
  }

  function updateLevelDisplay() {
    levelEl.textContent = `Lv. ${petState.level}`;
  }

  updateLevelDisplay();

  // --- ANIMATION CORE -----------------------------------------------------

  function clearAnimTimer() {
    if (animTimer !== null) {
      clearTimeout(animTimer);
      animTimer = null;
    }
  }

  /**
   * Play a single animation by key (e.g., "resting", "restToFloat").
   * options:
   *   onDone: callback when the animation is finished.
   */
  function playAnim(key, options = {}) {
    const src = SPRITES[key];
    if (!src) {
      console.warn("[BubblePet] Missing sprite for animation:", key);
      return;
    }

    clearAnimTimer();
    petState.currentAnim = key;
    spriteEl.src = src;

    // sound per animation
    const soundName = ANIM_SOUNDS[key];
    const isRestingBubble = key === "restingBubble";
    if (soundName && !isRestingBubble) {
      playSound(soundName);
    }

    const duration = DURATIONS[key] ?? 1000;
    animTimer = setTimeout(() => {
      animTimer = null;
      if (isRestingBubble) {
        const now = Date.now();
        if (now - lastBubbleSoundTime >= BUBBLE_SOUND_COOLDOWN) {
          lastBubbleSoundTime = now;
          playSound("resting-sound");
        }
      }
      if (typeof options.onDone === "function") {
        options.onDone();
      }
    }, duration);
  }

  /**
   * Run a sequence of animations in order.
   * sequence: [ "restToFloat", "floating", "floatToSwim" ]
   */
  function runSequence(sequence, finalCallback) {
    if (!sequence || sequence.length === 0) {
      if (typeof finalCallback === "function") finalCallback();
      return;
    }

    const [head, ...tail] = sequence;
    playAnim(head, {
      onDone: () => {
        if (tail.length === 0) {
          if (typeof finalCallback === "function") finalCallback();
        } else {
          runSequence(tail, finalCallback);
        }
      },
    });
  }

  function getPoseGroup() {
    const a = petState.currentAnim || "resting";
    if (a.includes("swim")) return "swim";
    if (a.includes("sleep")) return "sleep";
    if (a.includes("float")) return "float";
    return "rest";
  }

  // --- IDLE LOOP ----------------------------------------------------------

  function startIdle() {
    petState.mode = "idle";
    petState.busy = false;
    scheduleIdleCycle();
  }

  function scheduleIdleCycle() {
    if (petState.mode !== "idle") return;

    const r = Math.random();
    // 0.0–0.85 : resting
    // 0.85–0.9 : restingbubble (further reduced chance)
    // 0.9–1.0  : float cycle
    if (r < 0.85) {
      playAnim("resting", {
        onDone: () => {
          if (petState.mode === "idle") scheduleIdleCycle();
        },
      });
    } else if (r < 0.9) {
      playAnim("restingBubble", {
        onDone: () => {
          if (petState.mode === "idle") scheduleIdleCycle();
        },
      });
    } else {
      runSequence(["restToFloat", "floating", "floatToRest"], () => {
        if (petState.mode === "idle") scheduleIdleCycle();
      });
    }
  }

  // --- SLEEP LOOP ---------------------------------------------------------

  function startSleepLoop() {
    petState.mode = "sleep";
    petState.busy = false;
    loopSleep();
  }

  function loopSleep() {
    if (petState.mode !== "sleep") return;
    playAnim("sleeping", {
      onDone: () => {
        if (petState.mode === "sleep") {
          loopSleep();
        }
      },
    });
  }

  // --- SWIM LOOP ----------------------------------------------------------

  function startSwimLoop() {
    petState.mode = "swim";
    petState.busy = false;
    loopSwim();
  }

  function loopSwim() {
    if (petState.mode !== "swim") return;
    const r = Math.random();
    // most of the time: just swim
    // sometimes: swim -> fast-swim -> swim
    if (r < 0.7) {
      playAnim("swimming", {
        onDone: () => {
          if (petState.mode === "swim") loopSwim();
        },
      });
    } else {
      runSequence(["swimming", "fastSwim", "swimming"], () => {
        if (petState.mode === "swim") loopSwim();
      });
    }
  }

  // --- ROAM MODE (placeholder) --------------------------------------------

  function startRoam() {
    petState.mode = "roam";
    petState.busy = false;
    spriteEl.style.opacity = "0";
    setMessage(`${petState.name} is roaming around Bubblemarks!`);
    // In the future, tie this into the main app's roaming axolotl.
  }

  function recallFromRoam() {
    if (petState.mode === "roam") {
      spriteEl.style.opacity = "1";
      setMessage(`${petState.name} swims back to the tank.`);
      petState.mode = "idle";
    }
  }

  // --- ACTION HELPERS -----------------------------------------------------

  function beginAction(description) {
    recallFromRoam();
    petState.busy = true;
    petState.mode = "action";
    clearAnimTimer();
    setMessage(description);
  }

  function endActionToIdle() {
    petState.busy = false;
    startIdle();
  }

  // FEED: follow your transition logic
  function handleFeed() {
    if (petState.busy) return;
    beginAction(`${petState.name} is munching happily.`);

    const pose = getPoseGroup();
    let seq;

    switch (pose) {
      case "float":
        seq = ["floatToRest", "munching", "resting"];
        break;
      case "sleep":
        seq = ["sleepToRest", "munching", "resting"];
        break;
      case "swim":
        seq = ["swimToFloat", "floatToRest", "munching", "resting"];
        break;
      default: // rest
        seq = ["munching", "resting"];
    }

    runSequence(seq, endActionToIdle);
  }

  // PET
  function handlePet() {
    if (petState.busy) return;
    beginAction(`You pet ${petState.name}.`);

    const pose = getPoseGroup();
    let seq;

    switch (pose) {
      case "float":
        seq = ["floatToRest", "petting", "resting"];
        break;
      case "sleep":
        seq = ["sleepToRest", "petting", "resting"];
        break;
      case "swim":
        seq = ["swimToFloat", "floatToRest", "petting", "resting"];
        break;
      default:
        seq = ["petting", "resting"];
    }

    runSequence(seq, endActionToIdle);
  }

  // REST – bring him gently back to chill mode
  function handleRest() {
    if (petState.busy) return;
    beginAction(`${petState.name} is taking a break.`);

    const pose = getPoseGroup();
    let seq;

    switch (pose) {
      case "float":
        seq = ["floatToRest", "resting"];
        break;
      case "sleep":
        seq = ["sleepToRest", "resting"];
        break;
      case "swim":
        seq = ["swimToFloat", "floatToRest", "resting"];
        break;
      default:
        seq = ["resting"];
    }

    runSequence(seq, endActionToIdle);
  }

  // SLEEP
  function handleSleep() {
    if (petState.busy) return;
    beginAction(`${petState.name} is getting sleepy...`);

    const pose = getPoseGroup();
    let seq;

    switch (pose) {
      case "float":
        seq = ["floatToSleep"];
        break;
      case "sleep":
        // already sleeping – just restart sleep loop cleanly
        startSleepLoop();
        return;
      case "swim":
        seq = ["swimToFloat", "floatToSleep"];
        break;
      default: // rest
        seq = ["restToSleep"];
        break;
    }

    runSequence(seq, () => {
      setMessage(`${petState.name} is sleeping.`);
      startSleepLoop();
    });
  }

  // SWIM
  function handleSwim() {
    if (petState.busy) return;
    beginAction(`${petState.name} goes for a swim!`);

    const pose = getPoseGroup();
    let seq;

    switch (pose) {
      case "float":
        seq = ["floatToSwim"];
        break;
      case "sleep":
        seq = ["sleepToFloat", "floatToSwim"];
        break;
      case "swim":
        // already swimming, just restart loop
        startSwimLoop();
        return;
      default: // rest
        seq = ["restToFloat", "floatToSwim"];
        break;
    }

    runSequence(seq, () => {
      setMessage(`${petState.name} is happily swimming.`);
      startSwimLoop();
    });
  }

  // ROAM
  function handleRoam() {
    if (petState.busy) return;
    startRoam();
  }

  // --- BUTTON WIRING ------------------------------------------------------

  const ACTIONS = {
    feed: handleFeed,
    pet: handlePet,
    sleep: handleSleep,
    swim: handleSwim,
    rest: handleRest,
    roam: handleRoam,
  };

  buttons.forEach((btn) => {
    const action = btn.dataset.action;
    const handler = ACTIONS[action];
    if (!handler) return;
    btn.addEventListener("click", () => {
      handler();
    });
  });

  // --- ATTENTION / HAPPY NOISES (simple version) --------------------------

  // Basic attention ping every 10 minutes (can be replaced with full stat logic later)
  const TEN_MIN = 10 * 60 * 1000;
  setInterval(() => {
    if (petState.mode === "sleep") return;
    // For now, just alternate between attention + happy for vibes
    const r = Math.random();
    if (r < 0.5) {
      playSound("attention-squeak");
      setMessage(`${petState.name} wants attention.`);
    } else {
      playSound("happy-squeak");
      setMessage(`${petState.name} chirps happily.`);
    }
  }, TEN_MIN);

  // --- INIT ---------------------------------------------------------------

  // Start with idle loop from resting
  playAnim("resting", {
    onDone: () => {
      startIdle();
    },
  });

  console.log("[BubblePet] Axolotl state machine initialized.");
});
