window.addEventListener("DOMContentLoaded", () => {
  console.log("✅ script validated");

  const subscribers = new Set();
  const timers = {};
  const petState = {
    mode: "idle",
    currentAnim: "resting",
    busy: false,
    level: 1,
    name: "",
    poseGroup: "rest",
    stats: {
      hunger: 40,
      sleepiness: 20,
      boredom: 60,
      overstimulation: 30,
      affection: 90,
    },
  };

  let animationTimerId = null;

  function notifySubscribers(animName, meta = {}) {
    subscribers.forEach((callback) => {
      try {
        callback(animName, getPetState(), meta);
      } catch (error) {
        console.error("[petManager] subscriber error", error);
      }
    });
  }

  function setAnimation(animName, meta = {}) {
    if (typeof animName !== "string" || !animName) return;
    petState.currentAnim = animName;
    notifySubscribers(animName, meta);
  }

  function setRoamMode(isRoaming) {
    petState.mode = isRoaming ? "roam" : "idle";
    notifySubscribers(petState.currentAnim, { roam: petState.mode });
  }

  function getPetState() {
    return {
      ...petState,
      stats: { ...petState.stats },
      timers: { ...timers },
    };
  }

  function subscribeToAnimationChange(callback) {
    if (typeof callback !== "function") return () => {};
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  }

  function syncState(partial) {
    Object.assign(petState, partial);
  }

  function setTimer(label, value) {
    timers[label] = value;
  }

  function setAnimationTimer(id) {
    animationTimerId = id;
    setTimer("animation", id);
  }

  function getAnimationTimer() {
    return animationTimerId;
  }

  window.petManager = {
    setAnimation,
    setRoamMode,
    getPetState,
    subscribeToAnimationChange,
    _syncState: syncState,
    _setTimer: setTimer,
    _setAnimationTimer: setAnimationTimer,
    _getAnimationTimer: getAnimationTimer,
  };
});
