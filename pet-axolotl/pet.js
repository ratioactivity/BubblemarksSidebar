window.addEventListener("DOMContentLoaded", () => {
  window.initPetWidget = function initPetWidget(rootElement) {
    if (!rootElement) {
      console.error("[BubblePet] initPetWidget requires a rootElement");
      return;
    }

    const spriteEl = rootElement.querySelector("#pet-sprite");
    const buttons = rootElement.querySelectorAll("#pet-buttons button");
    const messageBar = rootElement.querySelector("#message-bar");

    if (!spriteEl) {
      console.error("[BubblePet] Missing #pet-sprite element in widget root");
      return;
    }

    if (!buttons.length) {
      console.error("[BubblePet] Missing #pet-buttons buttons in widget root");
      return;
    }

    const petState = {
      mode: "idle",
      idlePhase: "resting",
      soundEnabled: true,
      attention: 100,
      level: 1,
      name: "Axolotl",
    };

    const stats = {
      hunger: 5,
      sleepiness: 3,
      boredom: 4,
      overstim: 2,
      affection: 8,
    };

    const STAT_LIMIT = 10;
    const SLEEP_HOURS = { start: 4, end: 12 }; // CST

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

    function updateBars() {
      for (const key in stats) {
        const bar = rootElement.querySelector(`#${key}-bar`);
        if (!bar) continue;
        const fill = bar.querySelector(".fill");
        const value = stats[key];
        const percent = Math.min((value / STAT_LIMIT) * 100, 100);
        if (fill) {
          fill.style.width = `${percent}%`;
        }
      }
    }

    function modifyStat(stat, amount) {
      if (!(stat in stats)) return;
      stats[stat] = Math.min(STAT_LIMIT, Math.max(0, stats[stat] + amount));
      updateBars();
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

    const actionMessages = {
      pet: "Pico is soaking up the affection!",
      feed: "Pico happily munches on a treat.",
      swim: "Pico is splashing around the tank!",
      rest: "Pico is taking a calm breather.",
      sleep: "Pico is drifting off to dreamland...",
      roam: "Pico is exploring every nook of the tank!",
    };

    function setMessage(message) {
      if (!messageBar || !message) {
        return;
      }
      messageBar.textContent = message;
    }

    function handleButtonClick(action) {
      switch (action) {
        case "pet":
          enterMode("pet");
          modifyStat("affection", +2);
          modifyStat("boredom", -5);
          break;
        case "feed":
          enterMode("eat");
          modifyStat("hunger", -5);
          break;
        case "swim":
          enterMode("swim");
          modifyStat("overstim", +1);
          modifyStat("boredom", -5);
          modifyStat("sleepiness", +5);
          break;
        case "rest":
          enterMode("rest");
          modifyStat("overstim", -5);
          modifyStat("boredom", +1);
          break;
        case "sleep":
          enterMode("sleep");
          modifyStat("sleepiness", -5);
          break;
        case "roam":
          enterMode("swim");
          modifyStat("boredom", -5);
          modifyStat("affection", +1);
          break;
        default:
          enterMode("idle");
      }

      updateBars();
      setMessage(actionMessages[action] || "Pico is feeling calm and cozy.");
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

    function hourlyUpdate() {
      if (isSleepTime()) return;
      modifyStat("hunger", +1);
      modifyStat("boredom", +1);
      modifyStat("affection", -1);
      setMessage("Pico is craving a little attention.");
    }

    setInterval(hourlyUpdate, 3600000); // every hour

    startIdleCycle();
    updateBars();
    startAttentionTimer();

    console.log("✅ script validated");
  };

  window.initPetWidget(document.body);
});
