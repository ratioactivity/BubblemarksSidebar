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
    restToSleep: 1820,
    sleeping: 3250,
    sleepToFloat: 2470,
    sleepToRest: 1820,
    swimming: 1440,
    swimToFloat: 960,
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
  const VERY_LOW_HAPPINESS_THRESHOLD = -30;
  const HELP_SOUND_COOLDOWN_MS = 5 * 60 * 1000;
  const HELP_SOUNDS = ["help1", "help2"];
  const IDLE_LOOP_INTERVAL_MS = 7000;
  const IDLE_FRIENDLY_ANIMS = new Set(["resting", "restingBubble", "floating", "swimming"]);
  const ROAM_DURATION_MS = 7000;
  const DEATH_EXTREME_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
  const DEFAULT_STATS = {
    hunger: 4,
    sleepiness: 2,
    boredom: 6,
    overstimulation: 3,
    affection: 5,
  };
  const DEFAULT_MESSAGE = "Pico looks happy today!";

  const petState = {
    mode: "idle",
    currentAnim: "resting",
    busy: false,
    level: 1,
    name: "Pico",
    poseGroup: "rest",
    message: DEFAULT_MESSAGE,
    isDead: false,
    stats: {
      ...DEFAULT_STATS,
    },
    happiness: 0,
  };

  petState.happiness = calculateHappiness(petState.stats);

  const STAT_BOUNDS = {
    hunger: [0, 10],
    sleepiness: [0, 10],
    boredom: [0, 10],
    overstimulation: [0, 10],
    affection: [0, 10],
  };

  let animationTimerId = null;
  let sequenceToken = 0;
  let restingBubbleHasPlayed = false;
  let lastSwimSoundTime = 0;
  let lastHelpSoundTime = 0;
  let sleepLoopWatchdogId = null;
  let sleepLoopToken = 0;
  const HOUR_TICK_MS = 60 * 1000;
  const TEN_MIN = 10 * 60 * 1000;
  let levelUpLocked = false;
  let deathStartTime = null;
  let attentionInterval = null;
  let hourInterval = null;
  let roamReturnTimeout = null;

  function calculateHappiness(stats = petState.stats) {
    if (!stats) return 0;
    const { hunger = 0, sleepiness = 0, boredom = 0, overstimulation = 0, affection = 0 } = stats;
    const needsTotal = hunger + sleepiness + boredom + overstimulation;
    return Math.round(10 - needsTotal + affection);
  }

  function isAtExtremeNeglect(stats = petState.stats) {
    if (!stats) return false;
    const { hunger, sleepiness, boredom, overstimulation, affection } = stats;
    return (
      hunger === 10 &&
      sleepiness === 10 &&
      boredom === 10 &&
      overstimulation === 10 &&
      affection === 0
    );
  }

  function clampStatValue(key, value) {
    const [min, max] = STAT_BOUNDS[key] || [0, 100];
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function updateHappiness() {
    const previous = petState.happiness;
    const next = calculateHappiness(petState.stats);
    petState.happiness = next;
    return { previous, next, changed: previous !== next };
  }

  function resetNeglectCountdown() {
    deathStartTime = null;
  }

  function checkForNeglectCountdown() {
    if (petState.isDead) return;

    if (!isAtExtremeNeglect()) {
      resetNeglectCountdown();
      return;
    }

    const now = Date.now();
    if (deathStartTime === null) {
      deathStartTime = now;
      return;
    }

    if (now - deathStartTime >= DEATH_EXTREME_DURATION_MS) {
      handlePetDeath();
    }
  }

  function attemptLevelUp(happinessValue) {
    const affectionCap = STAT_BOUNDS.affection?.[1] ?? 10;
    const affectionMaxed = petState.stats.affection === affectionCap;
    if (happinessValue < 0 || !affectionMaxed) {
      levelUpLocked = false;
      return false;
    }

    if (levelUpLocked) {
      return false;
    }

    petState.level += 1;
    levelUpLocked = true;
    setMessage(`✨ ${petState.name} grew to level ${petState.level}!`);
    return true;
  }

  function maybePlayHelpSound() {
    if (petState.isDead) {
      return;
    }

    if (petState.happiness > VERY_LOW_HAPPINESS_THRESHOLD) {
      return;
    }

    const now = Date.now();
    if (now - lastHelpSoundTime < HELP_SOUND_COOLDOWN_MS) {
      return;
    }

    lastHelpSoundTime = now;
    const choiceIndex = Math.random() < 0.5 ? 0 : 1;
    const selectedSound = HELP_SOUNDS[choiceIndex] || HELP_SOUNDS[0];
    setMessage(`${petState.name} seems distressed...`, { sound: selectedSound, helpAlert: true });
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
    const { next: happinessNow, changed: happinessChanged } = updateHappiness();
    const leveledUp = attemptLevelUp(happinessNow);
    checkForNeglectCountdown();
    if (changed || happinessChanged || leveledUp) {
      emitState({ statsUpdated: changed, happinessChanged, leveledUp });
    }
  }

  function getPetState() {
    return {
      ...petState,
      stats: { ...petState.stats },
      happiness: petState.happiness,
      deathStartTime,
      timers: { ...timers },
    };
  }

  function notifySubscribers(animName, meta = {}) {
    const payload = {
      sprite: SPRITES[animName] || null,
      pose: petState.poseGroup,
      message: petState.message,
      duration: DURATIONS[animName] ?? null,
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

  function clearRoamReturnTimer() {
    if (roamReturnTimeout !== null) {
      clearTimeout(roamReturnTimeout);
      roamReturnTimeout = null;
      setTimer("roamReturn", null);
    }
  }

  function scheduleRoamReturnToIdle() {
    clearRoamReturnTimer();
    roamReturnTimeout = setTimeout(() => {
      roamReturnTimeout = null;
      setRoamMode(false);
      setMessage(`${petState.name} swims back to the tank.`);
      startIdle();
    }, ROAM_DURATION_MS);
    setTimer("roamReturn", roamReturnTimeout);
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
      clearRoamReturnTimer();
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

  function stopSleepLoop() {
    if (sleepLoopWatchdogId !== null) {
      clearTimeout(sleepLoopWatchdogId);
      sleepLoopWatchdogId = null;
      setTimer("sleepWatchdog", null);
    }
    sleepLoopToken += 1;
  }

  function startIdle() {
    if (petState.isDead) return;
    cancelSequences();
    stopSleepLoop();
    petState.mode = "idle";
    petState.busy = false;
    emitState();
    scheduleIdleCycle();
  }

  function scheduleIdleCycle() {
    if (petState.mode !== "idle") return;

    if (!IDLE_FRIENDLY_ANIMS.has(petState.currentAnim)) {
      setTimeout(() => {
        if (petState.mode === "idle") {
          scheduleIdleCycle();
        }
      }, IDLE_LOOP_INTERVAL_MS);
      return;
    }

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
    if (petState.isDead) return;
    cancelSequences();
    stopSleepLoop();
    petState.mode = "sleep";
    petState.busy = false;
    emitState();
    loopSleep();
  }

  function loopSleep() {
    if (petState.mode !== "sleep") {
      stopSleepLoop();
      return;
    }
    const token = ++sleepLoopToken;
    if (sleepLoopWatchdogId !== null) {
      clearTimeout(sleepLoopWatchdogId);
      sleepLoopWatchdogId = null;
      setTimer("sleepWatchdog", null);
    }
    playAnimation("sleeping", {
      onDone: () => {
        if (petState.mode === "sleep" && token === sleepLoopToken) {
          loopSleep();
        }
      },
    });
    const guardDelay = (DURATIONS.sleeping ?? 1000) + 150;
    sleepLoopWatchdogId = setTimeout(() => {
      sleepLoopWatchdogId = null;
      setTimer("sleepWatchdog", null);
      if (token === sleepLoopToken && petState.mode === "sleep") {
        loopSleep();
      }
    }, guardDelay);
    setTimer("sleepWatchdog", sleepLoopWatchdogId);
  }

  function startSwimLoop() {
    if (petState.isDead) return;
    cancelSequences();
    stopSleepLoop();
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
    if (petState.isDead) return;
    cancelSequences();
    stopSleepLoop();
    clearAnimTimer();
    setRoamMode(true);
    setMessage(`${petState.name} is roaming around Bubblemarks!`);
    scheduleRoamReturnToIdle();
  }

  function recallFromRoam() {
    if (petState.mode === "roam") {
      clearRoamReturnTimer();
      setRoamMode(false);
      setMessage(`${petState.name} swims back to the tank.`);
      startIdle();
    }
  }

  function isRoaming() {
    return petState.mode === "roam";
  }

  function beginAction(description) {
    cancelSequences();
    stopSleepLoop();
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
    if (guardIfDead("eat")) return;
    if (petState.busy || isRoaming()) return;
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
    if (guardIfDead("be pet")) return;
    if (petState.busy || isRoaming()) return;
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
    if (guardIfDead("rest")) return;
    if (petState.busy || isRoaming()) return;
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
    if (guardIfDead("sleep")) return;
    if (petState.busy || isRoaming()) return;
    beginAction(`${petState.name} is getting sleepy...`);

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
    if (guardIfDead("swim")) return;
    if (petState.busy || isRoaming()) return;
    beginAction(`${petState.name} goes for a swim!`);

    const applySwimStats = () => adjustStatsFor("swim");

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
        applySwimStats();
        startSwimLoop();
        return;
      default:
        seq = ["restToSwim"];
        break;
    }

    runSequence(seq, () => {
      applySwimStats();
      setMessage(`${petState.name} is happily swimming.`);
      startSwimLoop();
    });
  }

  function handleRoam() {
    if (guardIfDead("roam")) return;
    if (petState.mode === "roam") {
      recallFromRoam();
      return;
    }
    if (petState.busy) return;
    startRoam();
  }

  const ACTION_STAT_EFFECTS = {
    feed: { hunger: -5 },
    pet: { affection: 5 },
    rest: { overstimulation: -10 },
    swim: { boredom: -5, overstimulation: 1 },
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

  function stopAttentionInterval() {
    if (attentionInterval !== null) {
      clearInterval(attentionInterval);
      attentionInterval = null;
      setTimer("attention", null);
    }
  }

  function startAttentionInterval() {
    stopAttentionInterval();
    attentionInterval = setInterval(() => {
      if (petState.mode === "sleep" || petState.isDead) return;
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
  }

  function stopHourlyInterval() {
    if (hourInterval !== null) {
      clearInterval(hourInterval);
      hourInterval = null;
      setTimer("hourly", null);
    }
  }

  function startHourlyInterval() {
    stopHourlyInterval();
    hourInterval = setInterval(() => {
      tickHourUpdate();
    }, HOUR_TICK_MS);
    setTimer("hourly", hourInterval);
  }

  function stopAllIntervals() {
    stopAttentionInterval();
    stopHourlyInterval();
  }

  function startAllIntervals() {
    startAttentionInterval();
    startHourlyInterval();
  }

  function guardIfDead(actionDescription) {
    if (!petState.isDead) return false;
    setMessage(`${petState.name} can't ${actionDescription} while gone...`);
    return true;
  }

  function handlePetDeath() {
    if (petState.isDead) return;

    petState.isDead = true;
    petState.mode = "dead";
    petState.busy = false;
    cancelSequences();
    stopSleepLoop();
    clearAnimTimer();
    stopAllIntervals();
    setMessage(`${petState.name} has passed away... 💀`);
    emitState({ dead: true });

    setTimeout(() => {
      const revive = window.confirm(
        `Oh no, ${petState.name} died! Click OK to revive at half level, or Cancel to start a new pet.`
      );
      if (revive) {
        revivePet();
      } else {
        resetPet();
      }
    }, 50);
  }

  function revivePet() {
    const revivedLevel = Math.max(1, Math.floor(petState.level / 2));
    petState.level = revivedLevel;
    petState.isDead = false;
    petState.mode = "idle";
    petState.busy = false;
    levelUpLocked = false;
    resetNeglectCountdown();
    lastHelpSoundTime = 0;
    Object.assign(petState.stats, {
      hunger: 5,
      sleepiness: 5,
      boredom: 5,
      overstimulation: 5,
      affection: 5,
    });
    updateHappiness();
    setMessage(`✨ ${petState.name} has been revived at Level ${petState.level}! ✨`);
    emitState({ revived: true });
    startAllIntervals();
    startIdle();
  }

  function resetPet() {
    petState.level = 1;
    petState.isDead = false;
    petState.mode = "idle";
    petState.busy = false;
    levelUpLocked = false;
    resetNeglectCountdown();
    lastHelpSoundTime = 0;
    Object.assign(petState.stats, DEFAULT_STATS);
    updateHappiness();
    setMessage("A new pet has hatched!");
    emitState({ reset: true });
    startAllIntervals();
    startIdle();
  }

  function isSleeping() {
    return petState.mode === "sleep";
  }

  function tickHourUpdate() {
    if (petState.isDead) return;

    const hourlyDeltas = { hunger: 1, affection: -1 };
    if (isSleeping()) {
      hourlyDeltas.sleepiness = -5;
    } else {
      hourlyDeltas.sleepiness = 1;
      if (!isRoaming()) {
        hourlyDeltas.boredom = 1;
      }
    }
    applyStatChanges(hourlyDeltas);
    checkForNeglectCountdown();
    maybePlayHelpSound();
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

  startAllIntervals();

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
