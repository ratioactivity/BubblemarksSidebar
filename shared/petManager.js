window.addEventListener("DOMContentLoaded", () => {
  console.log("✅ script validated");

  const subscribers = new Set();
  const timers = {};

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

  const DURATIONS = {
    fastSwim: 1080,
    floating: 1680,
    floatToRest: 1430,
    floatToSleep: 2040,
    floatToSwim: 960,
    restToSwim: 2210,
    munching: 960,
    petting: 2340,
    resting: 780,
    restingBubble: 2340,
    restToFloat: 1320,
    restToSleep: 3250,
    sleeping: 3250,
    sleepToFloat: 2470,
    sleepToRest: 3250,
    swimming: 1440,
    swimToFloat: 1440,
    swimToRest: 2210,
  };

  const ANIM_SOUNDS = {
    swimming: "swimming-sound",
    fastSwim: "fastswim-squeak",
    munching: "munch-squeak",
    petting: "pet-sound",
  };

  const POSE_UPDATES = {
    resting: "rest",
    restingBubble: "rest",
    floating: "float",
    munching: "rest",
    petting: "rest",
    sleeping: "sleep",
    swimming: "swim",
    fastSwim: "swim",
  };

  const GIFS_REQUIRING_RESTART = new Set(["sleeping"]);
  const SWIM_SOUND_COOLDOWN = 10000;

  const petState = {
    mode: "idle",
    currentAnim: "resting",
    busy: false,
    level: 1,
    name: "Pico",
    poseGroup: "rest",
    message: "Pico looks happy today!",
    stats: {
      hunger: 40,
      sleepiness: 20,
      boredom: 60,
      overstimulation: 30,
      affection: 90,
    },
  };

  const STAT_BOUNDS = {
    hunger: [0, 100],
    sleepiness: [0, 100],
    boredom: [0, 100],
    overstimulation: [0, 100],
    affection: [0, 100],
  };

  let animationTimerId = null;
  let sequenceToken = 0;
  let restingBubbleHasPlayed = false;
  let lastSwimSoundTime = 0;

  function clampStatValue(key, value) {
    const [min, max] = STAT_BOUNDS[key] || [0, 100];
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function applyStatChanges(deltaMap = {}) {
    let changed = false;
    Object.entries(deltaMap).forEach(([key, delta]) => {
      if (!Object.prototype.hasOwnProperty.call(petState.stats, key)) return;
      if (typeof delta !== "number" || Number.isNaN(delta)) return;
      const current = petState.stats[key];
      const nextValue = clampStatValue(key, current + delta);
      if (nextValue !== current) {
        petState.stats[key] = nextValue;
        changed = true;
      }
    });
    if (changed) {
      emitState({ statsUpdated: true });
    }
  }

  function getPetState() {
    return {
      ...petState,
      stats: { ...petState.stats },
      timers: { ...timers },
    };
  }

  function notifySubscribers(animName, meta = {}) {
    const payload = {
      sprite: SPRITES[animName] || null,
      pose: petState.poseGroup,
      message: petState.message,
      ...meta,
    };
    subscribers.forEach((callback) => {
      try {
        callback(animName, getPetState(), payload);
      } catch (error) {
        console.error("[petManager] subscriber error", error);
      }
    });
  }

  function emitState(meta = {}) {
    notifySubscribers(petState.currentAnim, meta);
  }

  function setTimer(label, value) {
    timers[label] = value;
  }

  function clearAnimTimer() {
    if (animationTimerId !== null) {
      clearTimeout(animationTimerId);
      animationTimerId = null;
      setTimer("animation", null);
    }
  }

  function setAnimation(animName, meta = {}) {
    if (typeof animName !== "string" || !animName) return;
    if (!SPRITES[animName]) {
      console.warn("[petManager] Unknown animation:", animName);
      return;
    }
    petState.currentAnim = animName;
    const poseUpdate = POSE_UPDATES[animName];
    if (poseUpdate) {
      petState.poseGroup = poseUpdate;
    }
    notifySubscribers(animName, meta);
  }

  function setMessage(text, meta = {}) {
    petState.message = text;
    emitState({ ...meta, messageOnly: true, message: text });
  }

  function setRoamMode(isRoaming) {
    petState.mode = isRoaming ? "roam" : "idle";
    if (!isRoaming) {
      petState.busy = false;
    }
    emitState({ roam: petState.mode });
  }

  function subscribeToAnimationChange(callback) {
    if (typeof callback !== "function") return () => {};
    subscribers.add(callback);
    callback(petState.currentAnim, getPetState(), {
      sprite: SPRITES[petState.currentAnim],
      pose: petState.poseGroup,
      message: petState.message,
    });
    return () => {
      subscribers.delete(callback);
    };
  }

  function playAnimation(key, options = {}) {
    if (!SPRITES[key]) {
      console.warn("[petManager] Missing sprite for animation:", key);
      return;
    }

    clearAnimTimer();

    const meta = {};
    const requiresRestart = GIFS_REQUIRING_RESTART.has(key);
    if (requiresRestart) {
      meta.requiresRestart = true;
    }

    if (key === "restingBubble") {
      if (!restingBubbleHasPlayed) {
        meta.sound = "float-squeak";
        restingBubbleHasPlayed = true;
      }
    } else {
      restingBubbleHasPlayed = false;
    }

    if (key === "swimming") {
      const now = Date.now();
      if (now - lastSwimSoundTime >= SWIM_SOUND_COOLDOWN) {
        meta.sound = "swimming-sound";
        lastSwimSoundTime = now;
      }
    } else if (!meta.sound && ANIM_SOUNDS[key]) {
      meta.sound = ANIM_SOUNDS[key];
    }

    setAnimation(key, meta);

    const duration = DURATIONS[key] ?? 1000;
    animationTimerId = setTimeout(() => {
      animationTimerId = null;
      setTimer("animation", null);
      if (typeof options.onDone === "function") {
        options.onDone();
      }
    }, duration);
    setTimer("animation", animationTimerId);
  }

  function cancelSequences() {
    sequenceToken += 1;
  }

  function runSequence(sequence, finalCallback, token = null) {
    if (!sequence || sequence.length === 0) {
      if (token === null || token === sequenceToken) {
        if (typeof finalCallback === "function") finalCallback();
      }
      return;
    }

    const activeToken = token ?? ++sequenceToken;
    const [head, ...tail] = sequence;
    playAnimation(head, {
      onDone: () => {
        if (activeToken !== sequenceToken) return;
        if (tail.length === 0) {
          if (typeof finalCallback === "function") finalCallback();
        } else {
          runSequence(tail, finalCallback, activeToken);
        }
      },
    });
  }

  function getPoseGroup() {
    return petState.poseGroup || "rest";
  }

  function startIdle() {
    cancelSequences();
    petState.mode = "idle";
    petState.busy = false;
    emitState();
    scheduleIdleCycle();
  }

  function scheduleIdleCycle() {
    if (petState.mode !== "idle") return;

    const r = Math.random();
    if (r < 0.85) {
      playAnimation("resting", {
        onDone: () => {
          if (petState.mode === "idle") scheduleIdleCycle();
        },
      });
    } else if (r < 0.9) {
      playAnimation("restingBubble", {
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

  function startSleepLoop() {
    cancelSequences();
    petState.mode = "sleep";
    petState.busy = false;
    emitState();
    loopSleep();
  }

  function loopSleep() {
    if (petState.mode !== "sleep") return;
    playAnimation("sleeping", {
      onDone: () => {
        if (petState.mode === "sleep") {
          loopSleep();
        }
      },
    });
  }

  function startSwimLoop() {
    cancelSequences();
    petState.mode = "swim";
    petState.busy = false;
    emitState();
    loopSwim();
  }

  function loopSwim() {
    if (petState.mode !== "swim") return;
    const r = Math.random();
    if (r < 0.7) {
      playAnimation("swimming", {
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

  function startRoam() {
    cancelSequences();
    clearAnimTimer();
    setRoamMode(true);
    setMessage(`${petState.name} is roaming around Bubblemarks!`);
    adjustStatsFor("roam");
  }

  function recallFromRoam() {
    if (petState.mode === "roam") {
      setRoamMode(false);
      setMessage(`${petState.name} swims back to the tank.`);
      startIdle();
    }
  }

  function beginAction(description) {
    recallFromRoam();
    cancelSequences();
    petState.busy = true;
    petState.mode = "action";
    clearAnimTimer();
    setMessage(description);
    emitState();
  }

  function endActionToIdle() {
    petState.busy = false;
    emitState();
    startIdle();
  }

  function handleFeed() {
    if (petState.busy) return;
    beginAction(`${petState.name} is munching happily.`);
    adjustStatsFor("feed");

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
        seq = ["swimToRest", "munching", "resting"];
        break;
      default:
        seq = ["munching", "resting"];
    }

    runSequence(seq, endActionToIdle);
  }

  function handlePet() {
    if (petState.busy) return;
    beginAction(`You pet ${petState.name}.`);
    adjustStatsFor("pet");

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
        seq = ["swimToRest", "petting", "resting"];
        break;
      default:
        seq = ["petting", "resting"];
    }

    runSequence(seq, endActionToIdle);
  }

  function handleRest() {
    if (petState.busy) return;
    beginAction(`${petState.name} is taking a break.`);
    adjustStatsFor("rest");

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
        seq = ["swimToRest", "resting"];
        break;
      default:
        seq = ["resting"];
    }

    runSequence(seq, endActionToIdle);
  }

  function handleSleep() {
    if (petState.busy) return;
    beginAction(`${petState.name} is getting sleepy...`);
    adjustStatsFor("sleep");

    const pose = getPoseGroup();
    let seq;

    switch (pose) {
      case "float":
        seq = ["floatToSleep"];
        break;
      case "sleep":
        startSleepLoop();
        return;
      case "swim":
        seq = ["swimToRest", "restToSleep"];
        break;
      default:
        seq = ["restToSleep"];
        break;
    }

    runSequence(seq, () => {
      setMessage(`${petState.name} is sleeping.`);
      startSleepLoop();
    });
  }

  function handleSwim() {
    if (petState.busy) return;
    beginAction(`${petState.name} goes for a swim!`);
    adjustStatsFor("swim");

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
        startSwimLoop();
        return;
      default:
        seq = ["restToSwim"];
        break;
    }

    runSequence(seq, () => {
      setMessage(`${petState.name} is happily swimming.`);
      startSwimLoop();
    });
  }

  function handleRoam() {
    if (petState.busy) return;
    startRoam();
  }

  const ACTION_STAT_EFFECTS = {
    feed: { hunger: -35, boredom: -10, affection: 5, overstimulation: 4 },
    pet: { boredom: -15, affection: 8, overstimulation: -5 },
    rest: { overstimulation: -20, boredom: -5 },
    sleep: { sleepiness: -45, overstimulation: -10 },
    swim: { boredom: -25, hunger: 8, overstimulation: 12 },
    roam: { boredom: -18, hunger: 6, sleepiness: 4 },
  };

  function adjustStatsFor(actionName) {
    const delta = ACTION_STAT_EFFECTS[actionName];
    if (delta) {
      applyStatChanges(delta);
    }
  }

  const ACTIONS = {
    feed: handleFeed,
    pet: handlePet,
    sleep: handleSleep,
    swim: handleSwim,
    rest: handleRest,
    roam: handleRoam,
    callBack: recallFromRoam,
    callback: recallFromRoam,
    "call-back": recallFromRoam,
  };

  function triggerAction(actionName) {
    const fn = ACTIONS[actionName];
    if (typeof fn === "function") {
      fn();
    }
  }

  function setProfile(details = {}) {
    if (typeof details.name === "string" && details.name.trim()) {
      petState.name = details.name.trim();
    }
    if (Number.isFinite(details.level)) {
      petState.level = details.level;
    }
    emitState();
  }

  const TEN_MIN = 10 * 60 * 1000;
  const attentionInterval = setInterval(() => {
    if (petState.mode === "sleep") return;
    const r = Math.random();
    if (r < 0.5) {
      setMessage(`${petState.name} wants attention.`);
      emitState({ sound: "attention-squeak" });
    } else {
      setMessage(`${petState.name} chirps happily.`);
      emitState({ sound: "happy-squeak" });
    }
  }, TEN_MIN);
  setTimer("attention", attentionInterval);

  playAnimation("resting", {
    onDone: () => {
      startIdle();
    },
  });

  window.petManager = {
    setAnimation,
    setRoamMode,
    getPetState,
    subscribeToAnimationChange,
    triggerAction,
    actions: ACTIONS,
    setProfile,
  };
});
