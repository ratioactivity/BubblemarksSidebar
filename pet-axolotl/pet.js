window.addEventListener("DOMContentLoaded", () => {
  const STATE = Object.freeze({
    RESTING: "RESTING",
    RESTING_BUBBLE: "RESTING_BUBBLE",
    FLOATING: "FLOATING",
    SLEEPING: "SLEEPING",
    SWIMMING: "SWIMMING",
    FAST_SWIM: "FAST_SWIM",
  });

  const STATE_VALUES = new Set(Object.values(STATE));

  const ANIMATIONS = {
    [STATE.RESTING]: { src: "./assets/resting.gif", hold: 6000 },
    [STATE.RESTING_BUBBLE]: { src: "./assets/restingbubble.gif", hold: 6000 },
    [STATE.FLOATING]: { src: "./assets/floating.gif", hold: 6200 },
    [STATE.SLEEPING]: { src: "./assets/sleeping.gif", hold: 7000 },
    [STATE.SWIMMING]: { src: "./assets/swimming.gif", hold: 5200 },
    [STATE.FAST_SWIM]: { src: "./assets/fast-swim.gif", hold: 4200 },
    REST_TO_FLOAT: { src: "./assets/rest-to-float.gif", duration: 1600 },
    FLOAT_TO_REST: { src: "./assets/float-to-rest.gif", duration: 1600 },
    REST_TO_SLEEP: { src: "./assets/rest-to-sleep.gif", duration: 1800 },
    SLEEP_TO_FLOAT: { src: "./assets/sleep-to-float.gif", duration: 1800 },
    SLEEP_TO_REST: { src: "./assets/sleep-to-rest.gif", duration: 1800 },
    FLOAT_TO_SLEEP: { src: "./assets/float-to-sleep.gif", duration: 1800 },
    FLOAT_TO_SWIM: { src: "./assets/float-to-swim.gif", duration: 1500 },
    SWIM_TO_FLOAT: { src: "./assets/swim-to-float.gif", duration: 1500 },
  };

  const TRANSITIONS = {
    [STATE.RESTING]: {
      [STATE.FLOATING]: "REST_TO_FLOAT",
      [STATE.SLEEPING]: "REST_TO_SLEEP",
    },
    [STATE.RESTING_BUBBLE]: {
      [STATE.FLOATING]: "REST_TO_FLOAT",
      [STATE.SLEEPING]: "REST_TO_SLEEP",
    },
    [STATE.FLOATING]: {
      [STATE.RESTING]: "FLOAT_TO_REST",
      [STATE.SLEEPING]: "FLOAT_TO_SLEEP",
      [STATE.SWIMMING]: "FLOAT_TO_SWIM",
      [STATE.FAST_SWIM]: "FLOAT_TO_SWIM",
    },
    [STATE.SLEEPING]: {
      [STATE.FLOATING]: "SLEEP_TO_FLOAT",
      [STATE.RESTING]: "SLEEP_TO_REST",
    },
    [STATE.SWIMMING]: {
      [STATE.FLOATING]: "SWIM_TO_FLOAT",
    },
    [STATE.FAST_SWIM]: {
      [STATE.FLOATING]: "SWIM_TO_FLOAT",
    },
  };

  const DEFAULT_HOLD = 6000;
  const DEFAULT_TRANSITION_DURATION = 1600;

  const IDLE_PATH = [
    STATE.RESTING_BUBBLE,
    STATE.FLOATING,
    STATE.SLEEPING,
    STATE.FLOATING,
    STATE.SWIMMING,
    STATE.FLOATING,
    STATE.RESTING,
  ];

  let spriteElement = null;
  let CURRENT_STATE = STATE.RESTING;
  let CURRENT_ANIMATION = STATE.RESTING;
  let transitionTimer = null;
  let idleTimer = null;
  let idleIndex = 0;

  function clearTimer(timerId) {
    if (timerId) {
      window.clearTimeout(timerId);
    }
  }

  function getHoldDuration(state) {
    const config = ANIMATIONS[state];
    if (!config || !Number.isFinite(config.hold)) {
      return DEFAULT_HOLD;
    }
    return config.hold;
  }

  function playAnimation(name, options = {}) {
    const config = ANIMATIONS[name];
    if (!config) {
      console.warn(`[BubblePet] Unknown animation: ${name}`);
      return null;
    }
    if (!spriteElement) {
      console.warn("[BubblePet] Cannot play animation without sprite element");
      return null;
    }

    clearTimer(transitionTimer);
    transitionTimer = null;

    spriteElement.setAttribute("src", config.src);
    CURRENT_ANIMATION = name;

    const logicalState =
      options.logicalState ??
      config.state ??
      (STATE_VALUES.has(name) ? name : CURRENT_STATE);
    CURRENT_STATE = logicalState;

    const queueState = options.queueState ?? config.queueState ?? null;
    if (queueState && STATE_VALUES.has(queueState)) {
      const delay = options.delay ?? config.duration ?? DEFAULT_TRANSITION_DURATION;
      transitionTimer = window.setTimeout(() => {
        transitionTimer = null;
        playAnimation(queueState, { logicalState: queueState });
      }, delay);
    }

    return config;
  }

  function transitionToState(targetState) {
    if (!STATE_VALUES.has(targetState)) {
      console.warn(`[BubblePet] Invalid target state: ${targetState}`);
      return DEFAULT_HOLD;
    }

    if (CURRENT_STATE === targetState && STATE_VALUES.has(CURRENT_ANIMATION)) {
      playAnimation(targetState, { logicalState: targetState });
      return getHoldDuration(targetState);
    }

    const available = TRANSITIONS[CURRENT_STATE] || {};
    const transitionKey = available[targetState];

    if (transitionKey && ANIMATIONS[transitionKey]) {
      const transitionConfig = ANIMATIONS[transitionKey];
      const transitionDuration = transitionConfig.duration ?? DEFAULT_TRANSITION_DURATION;
      playAnimation(transitionKey, {
        queueState: targetState,
        delay: transitionDuration,
        logicalState: targetState,
      });
      return transitionDuration + getHoldDuration(targetState);
    }

    playAnimation(targetState, { logicalState: targetState });
    return getHoldDuration(targetState);
  }

  function stopAllTimers() {
    clearTimer(idleTimer);
    clearTimer(transitionTimer);
    idleTimer = null;
    transitionTimer = null;
  }

  function scheduleIdleStep(delayMs) {
    stopIdleTimer();
    const safeDelay = Number.isFinite(delayMs) ? delayMs : DEFAULT_HOLD;
    idleTimer = window.setTimeout(runIdleSequence, safeDelay);
  }

  function stopIdleTimer() {
    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function runIdleSequence() {
    if (!spriteElement) {
      return;
    }
    const nextState = IDLE_PATH[idleIndex];
    idleIndex = (idleIndex + 1) % IDLE_PATH.length;
    const totalDelay = transitionToState(nextState);
    scheduleIdleStep(totalDelay);
  }

  function startIdleCycle() {
    if (!spriteElement) {
      return;
    }
    idleIndex = 0;
    stopAllTimers();
    CURRENT_STATE = STATE.RESTING;
    CURRENT_ANIMATION = STATE.RESTING;
    playAnimation(STATE.RESTING, { logicalState: STATE.RESTING });
    scheduleIdleStep(getHoldDuration(STATE.RESTING));
  }

  function setupDebugAPI() {
    window.BUBBLEPET_DEBUG = {
      STATE,
      get CURRENT_STATE() {
        return CURRENT_STATE;
      },
      get CURRENT_ANIMATION() {
        return CURRENT_ANIMATION;
      },
      playAnimation,
      transitionToState,
      startIdleCycle,
      stopAllTimers,
      runIdleSequence,
    };
  }

  window.initPetWidget = function initPetWidget(rootElement) {
    const scope = rootElement && rootElement.querySelector ? rootElement : document;
    const foundSprite = scope.querySelector("#pet-sprite");

    if (!foundSprite) {
      console.warn("[BubblePet] #pet-sprite not found in provided root");
      return null;
    }

    spriteElement = foundSprite;
    startIdleCycle();
    setupDebugAPI();

    return {
      STATE,
      get currentState() {
        return CURRENT_STATE;
      },
      get currentAnimation() {
        return CURRENT_ANIMATION;
      },
      playAnimation,
      transitionToState,
      startIdleCycle,
      stopAllTimers,
    };
  };

  window.initPetWidget(document.body);
  console.log("✅ script validated");
});
