window.addEventListener("DOMContentLoaded", () => {
  const STATE = Object.freeze({
    RESTING: "RESTING",
    RESTING_BUBBLE: "RESTING_BUBBLE",
    REST_TO_FLOAT: "REST_TO_FLOAT",
    REST_TO_SLEEP: "REST_TO_SLEEP",
    FLOATING: "FLOATING",
    FLOAT_TO_REST: "FLOAT_TO_REST",
    FLOAT_TO_SLEEP: "FLOAT_TO_SLEEP",
    FLOAT_TO_SWIM: "FLOAT_TO_SWIM",
    SLEEPING: "SLEEPING",
    SLEEP_TO_REST: "SLEEP_TO_REST",
    SLEEP_TO_FLOAT: "SLEEP_TO_FLOAT",
    SWIMMING: "SWIMMING",
    SWIM_TO_FLOAT: "SWIM_TO_FLOAT",
    FAST_SWIM: "FAST_SWIM",
  });

  const STATE_VALUES = new Set(Object.values(STATE));

  const ANIMATIONS = {
    [STATE.RESTING]: { src: "./assets/resting.gif", hold: 6000 },
    [STATE.RESTING_BUBBLE]: { src: "./assets/restingbubble.gif", hold: 6000 },
    [STATE.REST_TO_FLOAT]: {
      src: "./assets/rest-to-float.gif",
      duration: 1600,
      queueState: STATE.FLOATING,
    },
    [STATE.REST_TO_SLEEP]: {
      src: "./assets/rest-to-sleep.gif",
      duration: 1800,
      queueState: STATE.SLEEPING,
    },
    [STATE.FLOATING]: { src: "./assets/floating.gif", hold: 6200 },
    [STATE.FLOAT_TO_REST]: {
      src: "./assets/float-to-rest.gif",
      duration: 1600,
      queueState: STATE.RESTING,
    },
    [STATE.FLOAT_TO_SLEEP]: {
      src: "./assets/float-to-sleep.gif",
      duration: 1800,
      queueState: STATE.SLEEPING,
    },
    [STATE.FLOAT_TO_SWIM]: {
      src: "./assets/float-to-swim.gif",
      duration: 1500,
      queueState: STATE.SWIMMING,
    },
    [STATE.SLEEPING]: { src: "./assets/sleeping.gif", hold: 7000 },
    [STATE.SLEEP_TO_REST]: {
      src: "./assets/sleep-to-rest.gif",
      duration: 1800,
      queueState: STATE.RESTING,
    },
    [STATE.SLEEP_TO_FLOAT]: {
      src: "./assets/sleep-to-float.gif",
      duration: 1800,
      queueState: STATE.FLOATING,
    },
    [STATE.SWIMMING]: { src: "./assets/swimming.gif", hold: 5200 },
    [STATE.SWIM_TO_FLOAT]: {
      src: "./assets/swim-to-float.gif",
      duration: 1500,
      queueState: STATE.FLOATING,
    },
    [STATE.FAST_SWIM]: { src: "./assets/fast-swim.gif", hold: 4200 },
  };

  const ALLOWED_TRANSITIONS = {
    [STATE.RESTING]: [
      STATE.RESTING_BUBBLE,
      STATE.REST_TO_FLOAT,
      STATE.REST_TO_SLEEP,
    ],
    [STATE.RESTING_BUBBLE]: [STATE.RESTING],
    [STATE.REST_TO_FLOAT]: [STATE.FLOATING],
    [STATE.REST_TO_SLEEP]: [STATE.SLEEPING],
    [STATE.FLOATING]: [
      STATE.FLOAT_TO_REST,
      STATE.FLOAT_TO_SLEEP,
      STATE.FLOAT_TO_SWIM,
    ],
    [STATE.FLOAT_TO_REST]: [STATE.RESTING],
    [STATE.FLOAT_TO_SLEEP]: [STATE.SLEEPING],
    [STATE.FLOAT_TO_SWIM]: [STATE.SWIMMING],
    [STATE.SLEEPING]: [STATE.SLEEP_TO_REST, STATE.SLEEP_TO_FLOAT],
    [STATE.SLEEP_TO_REST]: [STATE.RESTING],
    [STATE.SLEEP_TO_FLOAT]: [STATE.FLOATING],
    [STATE.SWIMMING]: [STATE.FAST_SWIM, STATE.SWIM_TO_FLOAT],
    [STATE.SWIM_TO_FLOAT]: [STATE.FLOATING],
    [STATE.FAST_SWIM]: [STATE.SWIMMING],
  };

  const DEFAULT_HOLD = 6000;
  const DEFAULT_TRANSITION_DURATION = 1600;

  const TRANSITION_STATES = new Set([
    STATE.REST_TO_FLOAT,
    STATE.REST_TO_SLEEP,
    STATE.FLOAT_TO_REST,
    STATE.FLOAT_TO_SLEEP,
    STATE.FLOAT_TO_SWIM,
    STATE.SLEEP_TO_REST,
    STATE.SLEEP_TO_FLOAT,
    STATE.SWIM_TO_FLOAT,
  ]);

  const IDLE_PATH = [
    STATE.RESTING_BUBBLE,
    STATE.RESTING,
    STATE.REST_TO_FLOAT,
    STATE.FLOATING,
    STATE.FLOAT_TO_SLEEP,
    STATE.SLEEPING,
    STATE.SLEEP_TO_FLOAT,
    STATE.FLOATING,
    STATE.FLOAT_TO_SWIM,
    STATE.SWIMMING,
    STATE.FAST_SWIM,
    STATE.SWIMMING,
    STATE.SWIM_TO_FLOAT,
    STATE.FLOATING,
    STATE.FLOAT_TO_REST,
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

  function getStateDuration(state) {
    const config = ANIMATIONS[state];
    if (!config) {
      return TRANSITION_STATES.has(state)
        ? DEFAULT_TRANSITION_DURATION
        : DEFAULT_HOLD;
    }
    if (Number.isFinite(config.hold)) {
      return config.hold;
    }
    if (Number.isFinite(config.duration)) {
      return config.duration;
    }
    return TRANSITION_STATES.has(state)
      ? DEFAULT_TRANSITION_DURATION
      : DEFAULT_HOLD;
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

    if (STATE_VALUES.has(name)) {
      CURRENT_STATE = name;
    }

    const queueState = options.queueState ?? config.queueState ?? null;
    if (queueState && STATE_VALUES.has(queueState)) {
      const delay =
        options.delay ?? config.duration ?? getStateDuration(name);
      transitionTimer = window.setTimeout(() => {
        transitionTimer = null;
        transitionToState(queueState, { initiatedByQueue: true });
      }, delay);
    }

    return config;
  }

  function transitionToState(targetState) {
    if (!STATE_VALUES.has(targetState)) {
      console.warn(`[BubblePet] Invalid target state: ${targetState}`);
      return getStateDuration(CURRENT_STATE);
    }

    if (CURRENT_STATE === targetState && STATE_VALUES.has(CURRENT_ANIMATION)) {
      playAnimation(targetState);
      return getStateDuration(targetState);
    }

    const allowedTargets = ALLOWED_TRANSITIONS[CURRENT_STATE] || [];
    if (!allowedTargets.includes(targetState)) {
      console.warn(
        `[BubblePet] Transition from ${CURRENT_STATE} to ${targetState} is not allowed.`
      );
      return getStateDuration(CURRENT_STATE);
    }

    playAnimation(targetState);
    return getStateDuration(targetState);
  }

  function stopAllTimers() {
    clearTimer(idleTimer);
    clearTimer(transitionTimer);
    idleTimer = null;
    transitionTimer = null;
  }

  function performAction(action) {
    stopAllTimers();

    if (performAction._restartTimer) {
      window.clearTimeout(performAction._restartTimer);
      performAction._restartTimer = null;
    }

    let totalDelay = 0;
    let handled = true;

    const scheduleRestart = () => {
      const delay = Math.max(0, totalDelay);
      if (delay <= 0) {
        startIdleCycle();
        return;
      }
      performAction._restartTimer = window.setTimeout(() => {
        performAction._restartTimer = null;
        startIdleCycle();
      }, delay);
    };

    switch (action) {
      case "pet": {
        const target =
          Math.random() < 0.5 && CURRENT_STATE === STATE.RESTING
            ? STATE.RESTING_BUBBLE
            : STATE.RESTING;
        totalDelay += transitionToState(target);
        break;
      }
      case "feed": {
        totalDelay += transitionToState(STATE.RESTING);
        console.log("munching later");
        break;
      }
      case "sleep": {
        totalDelay += transitionToState(STATE.REST_TO_SLEEP);
        break;
      }
      case "swim": {
        totalDelay += transitionToState(STATE.FLOAT_TO_SWIM);
        break;
      }
      case "rest": {
        const allowed = ALLOWED_TRANSITIONS[CURRENT_STATE] || [];
        let target = null;
        if (allowed.includes(STATE.FLOAT_TO_REST)) {
          target = STATE.FLOAT_TO_REST;
        } else if (allowed.includes(STATE.SLEEP_TO_REST)) {
          target = STATE.SLEEP_TO_REST;
        } else {
          target = STATE.RESTING;
        }
        totalDelay += transitionToState(target);
        break;
      }
      case "roam": {
        console.log("roam later");
        break;
      }
      default:
        handled = false;
        break;
    }

    if (!handled) {
      console.warn("Unknown action:", action);
      startIdleCycle();
      return;
    }

    scheduleRestart();
  }

  function scheduleIdleStep(delayMs) {
    stopIdleTimer();
    const safeDelay = Number.isFinite(delayMs) ? delayMs : getStateDuration(CURRENT_STATE);
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
    playAnimation(STATE.RESTING);
    scheduleIdleStep(getStateDuration(STATE.RESTING));
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
      ALLOWED_TRANSITIONS,
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

    const buttons = rootElement.querySelectorAll("[data-action]");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        performAction(action);
      });
    });
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
      ALLOWED_TRANSITIONS,
    };
  };

  console.log("✅ script validated");
});
