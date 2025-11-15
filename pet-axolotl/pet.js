// ===============================
// BUBBLEPET – CLEAN STATE MACHINE
// ===============================

// DOM references assigned on init
let spriteEl = null;
let messageBar = null;
let animationTimer = null;
let isTransitioning = false;
let buttonActionActive = false;

// Core pet state
const pet = {
    state: "resting",      // current animation/state
    level: 1,
    hunger: 4,
    sleepiness: 2,
    boredom: 6,
    overstim: 3,
    affection: 5,
    idleTimer: null,
    actionCooldown: false
};

// -------------------------------
// SPRITE SOURCES (edit freely)
// -------------------------------
const SPRITES = {
    resting: "assets/resting.gif",
    restingbubble: "assets/restingbubble.gif",
    floating: "assets/floating.gif",
    swimming: "assets/swimming.gif",
    "fast-swim": "assets/fast-swim.gif",
    sleeping: "assets/sleeping.gif",
    munching: "assets/munching.gif",
    petting: "assets/pet.gif",
    "rest-to-float": "assets/rest-to-float.gif",
    "float-to-rest": "assets/float-to-rest.gif",
    "rest-to-sleep": "assets/rest-to-sleep.gif",
    "float-to-sleep": "assets/float-to-sleep.gif",
    "float-to-swim": "assets/float-to-swim.gif",
    "sleep-to-rest": "assets/sleep-to-rest.gif",
    "sleep-to-float": "assets/sleep-to-float.gif",
    "swim-to-float": "assets/swim-to-float.gif"
};

const ANIMATION_LENGTHS = {
  "fast-swim": 1.08,
  "floating": 1.68,
  "float-to-rest": 1.43,
  "float-to-sleep": 2.04,
  "float-to-swim": 0.96,
  "munching": 0.96,
  "pet": 2.34,
  "resting": 0.78,
  "restingbubble": 2.34,
  "rest-to-float": 1.32,
  "rest-to-sleep": 1.82,
  "sleeping": 1.92,
  "sleep-to-float": 2.47,
  "sleep-to-rest": 1.82,
  "swimming": 1.44,
  "swim-to-float": 1.44
};

const TRANSITION_GRAPH = {
    resting: ["rest-to-sleep", "rest-to-float", "restingbubble", "munching", "petting"],
    restingbubble: ["resting"],
    floating: ["float-to-rest", "float-to-sleep", "float-to-swim"],
    swimming: ["fast-swim", "swim-to-float", "float-to-sleep"],
    "fast-swim": ["swimming"],
    sleeping: ["sleep-to-rest", "sleep-to-float"],
    "rest-to-float": ["floating"],
    "float-to-rest": ["resting"],
    "rest-to-sleep": ["sleeping"],
    "float-to-sleep": ["sleeping"],
    "float-to-swim": ["swimming"],
    "sleep-to-rest": ["resting"],
    "sleep-to-float": ["floating"],
    "swim-to-float": ["floating"],
    munching: ["resting"],
    petting: ["resting"]
};

// -------------------------------
// STATE MACHINE
// -------------------------------
const DEFAULT_TRANSITION_DELAY = 1000;

const playAnimation = (name, loop = false, onComplete = null) => {
    if (animationTimer) {
        clearTimeout(animationTimer);
        animationTimer = null;
    }

    if (spriteEl) {
        spriteEl.src = `./assets/${name}.gif`;
    }

    if (loop) {
        return;
    }

    const durationSeconds = ANIMATION_LENGTHS[name];
    if (typeof durationSeconds !== "number" || Number.isNaN(durationSeconds)) {
        console.warn(`Missing animation length for ${name}`);
        if (typeof onComplete === "function") {
            onComplete();
        }
        return;
    }

    animationTimer = setTimeout(() => {
        animationTimer = null;
        if (typeof onComplete === "function") {
            onComplete();
        }
    }, durationSeconds * 1000);
};

const stateMachine = {
    currentState: null,
    previousState: null,
    transitioning: false,
    queue: [],
    loopTimers: {},
    priorityMap: {
        transition: 0,
        action: 1,
        normal: 2,
        idle: 3
    },
    states: {
        resting: {
            gif: SPRITES.resting,
            loop: true,
            idleEligible: true,
            durationKey: "resting"
        },
        restingbubble: {
            gif: SPRITES.restingbubble,
            loop: true,
            idleEligible: true,
            durationKey: "restingbubble"
        },
        floating: {
            gif: SPRITES.floating,
            loop: true,
            idleEligible: true,
            durationKey: "floating"
        },
        swimming: {
            gif: SPRITES.swimming,
            loop: true,
            idleEligible: true,
            durationKey: "swimming"
        },
        "fast-swim": {
            gif: SPRITES["fast-swim"],
            loop: true,
            idleEligible: false,
            durationKey: "fast-swim"
        },
        sleeping: {
            gif: SPRITES.sleeping,
            loop: true,
            idleEligible: false,
            durationKey: "sleeping"
        },
        munching: {
            gif: SPRITES.munching,
            loop: false,
            transitional: true,
            durationKey: "munching",
            auto: { state: "resting" }
        },
        petting: {
            gif: SPRITES.petting,
            loop: false,
            transitional: true,
            durationKey: "pet",
            animationName: "pet",
            auto: { state: "resting" }
        },
        "rest-to-float": {
            gif: SPRITES["rest-to-float"],
            loop: false,
            transitional: true,
            durationKey: "rest-to-float",
            auto: { state: "floating" }
        },
        "float-to-rest": {
            gif: SPRITES["float-to-rest"],
            loop: false,
            transitional: true,
            durationKey: "float-to-rest",
            auto: { state: "resting" }
        },
        "rest-to-sleep": {
            gif: SPRITES["rest-to-sleep"],
            loop: false,
            transitional: true,
            durationKey: "rest-to-sleep",
            auto: { state: "sleeping" }
        },
        "float-to-sleep": {
            gif: SPRITES["float-to-sleep"],
            loop: false,
            transitional: true,
            durationKey: "float-to-sleep",
            auto: { state: "sleeping" }
        },
        "float-to-swim": {
            gif: SPRITES["float-to-swim"],
            loop: false,
            transitional: true,
            durationKey: "float-to-swim",
            auto: { state: "swimming" }
        },
        "sleep-to-rest": {
            gif: SPRITES["sleep-to-rest"],
            loop: false,
            transitional: true,
            durationKey: "sleep-to-rest",
            auto: { state: "resting" }
        },
        "sleep-to-float": {
            gif: SPRITES["sleep-to-float"],
            loop: false,
            transitional: true,
            durationKey: "sleep-to-float",
            auto: { state: "floating" }
        },
        "swim-to-float": {
            gif: SPRITES["swim-to-float"],
            loop: false,
            transitional: true,
            durationKey: "swim-to-float",
            auto: { state: "floating" }
        }
    },
    go(targetState, options = {}) {
        const source = options.source || "normal";

        if (!this.states[targetState]) {
            console.warn("Unknown state:", targetState);
            if (source === "action") {
                buttonActionActive = false;
            }
            return;
        }

        if (source === "action") {
            buttonActionActive = true;
        }

        const priorityKey = this._resolvePriorityKey(targetState, options.priority);

        if (this.transitioning) {
            this._enqueue(targetState, priorityKey, source);
            return;
        }

        if (!this.currentState) {
            this._applyState(targetState, source);
            if (!this.transitioning) {
                this._flushQueue();
            }
            return;
        }

        if (this.currentState === targetState) {
            const config = this.states[targetState];
            if (!config?.transitional && config?.loop) {
                if (source === "action") {
                    buttonActionActive = false;
                }
                this._flushQueue();
                return;
            }

            this._applyState(targetState, source);
            if (!this.transitioning) {
                this._flushQueue();
            }
            return;
        }

        const path = this._findPath(this.currentState, targetState);
        if (!path || path.length < 2) {
            console.warn(`No allowed path from ${this.currentState} to ${targetState}`);
            if (source === "action") {
                buttonActionActive = false;
            }
            return;
        }

        const nextState = path[1];

        if (nextState !== targetState) {
            this._enqueue(targetState, priorityKey, source);
        }

        this._applyState(nextState, source);

        if (!this.transitioning) {
            this._flushQueue();
        }
    },
    _applyState(name, source = "normal") {
        const config = this.states[name];
        if (!config) {
            console.warn("State config missing:", name);
            return;
        }

        if (!SPRITES[name] && !config.gif) {
            console.warn("Missing sprite for state:", name);
        }

        this.previousState = this.currentState;
        this.currentState = name;
        pet.state = name;

        this.transitioning = Boolean(config.transitional);
        isTransitioning = this.transitioning;

        this._handleLoopTimers(name, config);

        const animationName = config.animationName || name;
        const shouldLoop = Boolean(config.loop);
        const handleComplete = () => {
            if (this.currentState !== name) {
                return;
            }

            if (config.auto) {
                this.transitioning = false;
                isTransitioning = false;
                this.go(config.auto.state, { priority: "transition", source });
                return;
            }

            if (!config.loop) {
                this.transitioning = false;
                isTransitioning = false;
                this._flushQueue();
            }
        };

        playAnimation(animationName, shouldLoop, shouldLoop ? null : handleComplete);

        if (config.transitional || !config.loop) {
            stopIdleLoop();
        } else if (!this.transitioning) {
            if (config.idleEligible === false) {
                stopIdleLoop();
            } else {
                startIdleLoop();
            }
        }

        if (!config.transitional) {
            this.transitioning = false;
            isTransitioning = false;
        }

        if (
            source === "action" &&
            buttonActionActive &&
            !config.transitional &&
            config.loop
        ) {
            const hasPendingAction = this.queue.some(entry => entry.source === "action");
            if (!hasPendingAction && !this.transitioning) {
                buttonActionActive = false;
            }
        }
    },
    _flushQueue() {
        if (!this.queue.length) return;
        const next = this._dequeue();
        if (!next) return;
        this.go(next.state, { priority: next.priorityKey, source: next.source });
    },
    _findPath(start, target) {
        if (start === target) {
            return [start];
        }

        const visited = new Set([start]);
        const queue = [[start]];

        while (queue.length) {
            const path = queue.shift();
            const current = path[path.length - 1];
            const neighbors = TRANSITION_GRAPH[current] || [];

            for (const neighbor of neighbors) {
                if (visited.has(neighbor)) {
                    continue;
                }

                const nextPath = [...path, neighbor];
                if (neighbor === target) {
                    return nextPath;
                }

                visited.add(neighbor);
                queue.push(nextPath);
            }
        }

        return null;
    },
    _enqueue(state, priorityKey, source = "normal") {
        const key = priorityKey || this._resolvePriorityKey(state);
        this.queue.push({
            state,
            priorityKey: key,
            priorityValue: this._priorityValue(key),
            source
        });
    },
    _dequeue() {
        if (!this.queue.length) {
            return null;
        }

        let bestIndex = 0;
        for (let i = 1; i < this.queue.length; i += 1) {
            if (this.queue[i].priorityValue < this.queue[bestIndex].priorityValue) {
                bestIndex = i;
            }
        }

        const [entry] = this.queue.splice(bestIndex, 1);
        return entry;
    },
    _resolvePriorityKey(state, explicit) {
        if (explicit) {
            return explicit;
        }

        const config = this.states[state];
        if (config?.transitional) {
            return "transition";
        }

        if (!config?.loop) {
            return "action";
        }

        return "normal";
    },
    _priorityValue(key) {
        return this.priorityMap[key] ?? this.priorityMap.normal;
    },
    _durationFor(name) {
        const config = this.states[name];
        const key = config?.durationKey || name;
        const seconds = ANIMATION_LENGTHS[key];
        if (typeof seconds === "number" && !Number.isNaN(seconds)) {
            return seconds * 1000;
        }
        return DEFAULT_TRANSITION_DELAY;
    },
    _handleLoopTimers(name, config) {
        Object.values(this.loopTimers).forEach(timerId => clearTimeout(timerId));
        this.loopTimers = {};

        if (!config.loop || config.transitional) {
            return;
        }

        if (name === "swimming") {
            const checkDelay = this._durationFor(name);
            const scheduleFastSwimCheck = () => {
                if (this.currentState !== "swimming" || this.transitioning || isTransitioning) {
                    return;
                }

                const hasPendingPriority = this.queue.some(entry => {
                    return entry.priorityValue <= this.priorityMap.action;
                });

                if (hasPendingPriority) {
                    this.loopTimers.fastSwimTrigger = setTimeout(scheduleFastSwimCheck, checkDelay);
                    return;
                }

                if (Math.random() < 0.2) {
                    this.go("fast-swim", { priority: "normal" });
                    return;
                }

                this.loopTimers.fastSwimTrigger = setTimeout(scheduleFastSwimCheck, checkDelay);
            };

            this.loopTimers.fastSwimTrigger = setTimeout(scheduleFastSwimCheck, checkDelay);
            return;
        }

        if (name === "fast-swim") {
            const fastSwimDuration = this._durationFor(name) * 2;
            this.loopTimers.returnToSwim = setTimeout(() => {
                if (this.currentState !== "fast-swim" || this.transitioning) {
                    return;
                }
                this.go("swimming", { priority: "normal" });
            }, fastSwimDuration);
        }
    }
};

// -------------------------------
// IDLE BEHAVIOR
// -------------------------------
function startIdleLoop() {
    if (pet.idleTimer) return;
    scheduleIdleCycle();
}

function scheduleIdleCycle() {
    const delay = 6000 + Math.random() * 4000;
    pet.idleTimer = setTimeout(runIdleCycle, delay);
}

function runIdleCycle() {
    pet.idleTimer = null;

    if (stateMachine.transitioning || isTransitioning || buttonActionActive) {
        scheduleIdleCycle();
        return;
    }

    const current = stateMachine.currentState;
    if (current === "sleeping") {
        scheduleIdleCycle();
        return;
    }

    const currentConfig = stateMachine.states[current];

    if (!currentConfig || currentConfig.transitional || !currentConfig.loop) {
        scheduleIdleCycle();
        return;
    }

    const hasPendingPriority = stateMachine.queue.some(entry => {
        return entry.priorityValue <= stateMachine.priorityMap.action;
    });

    if (hasPendingPriority) {
        scheduleIdleCycle();
        return;
    }

    const roll = Math.random();
    let target = null;

    if (roll < 0.65) {
        if (current !== "resting") {
            target = "resting";
        }
    } else if (roll < 0.75) {
        target = "restingbubble";
    } else if (roll < 0.95) {
        target = "floating";
    } else {
        target = "rest-to-float";
    }

    if (target) {
        if (target === "rest-to-float" && current === "floating") {
            target = "floating";
        }

        if (target !== current) {
            stateMachine.go(target, { priority: "idle", source: "idle" });
        }
    }

    scheduleIdleCycle();
}

function stopIdleLoop() {
    if (!pet.idleTimer) return;
    clearTimeout(pet.idleTimer);
    pet.idleTimer = null;
}

function stopIdleLoop() {
    if (!pet.idleTimer) return;
    clearInterval(pet.idleTimer);
    pet.idleTimer = null;
}

// -------------------------------
// ACTION SYSTEM
// -------------------------------
function performAction(action) {
    if (pet.actionCooldown || isTransitioning) return;
    pet.actionCooldown = true;

    setTimeout(() => (pet.actionCooldown = false), 1200);

    stopIdleLoop();

    switch (action) {
        case "feed":
            doFeed();
            break;
        case "pet":
            doPet();
            break;
        case "sleep":
            doSleep();
            break;
        case "swim":
            doSwim();
            break;
        case "rest":
            doRest();
            break;
        case "roam":
            doRoam();
            break;
        default:
            console.warn("Unknown action:", action);
    }
}

// --------------------------------
// ACTION HANDLERS
// --------------------------------

function doFeed() {
    stateMachine.go("munching", { priority: "action", source: "action" });
    messageBar.textContent = "Pico munches happily!";
    pet.hunger = Math.max(0, pet.hunger - 5);
}

function doPet() {
    stateMachine.go("petting", { priority: "action", source: "action" });
    messageBar.textContent = "Pico wiggles happily ❤️";
    pet.affection = Math.min(10, pet.affection + 5);
}

function doSleep() {
    // Enforce rest-to-sleep transition chain
    stateMachine.go("rest-to-sleep", { priority: "action", source: "action" });
    messageBar.textContent = "Pico is sleeping...";
}

function doSwim() {
    // Float before swimming when necessary
    if (stateMachine.currentState === "floating") {
        stateMachine.go("float-to-swim", { priority: "action", source: "action" });
    } else if (stateMachine.currentState === "swimming" || stateMachine.currentState === "fast-swim") {
        stateMachine.go("swimming", { priority: "action", source: "action" });
    } else {
        stateMachine.go("float-to-swim", { priority: "action", source: "action" });
    }
    messageBar.textContent = "Pico is swimming!";
}

function doRest() {
    // Transitions handled by state machine
    stateMachine.go("resting", { priority: "action", source: "action" });
    messageBar.textContent = "Pico calms down.";
}

function doRoam() {
    stateMachine.go("floating", { priority: "action", source: "action" });
    messageBar.textContent = "Pico wanders off...";
    stopIdleLoop();
}

// --------------------------------
// INITIALIZATION
// --------------------------------
function initPetWidget(root) {
    spriteEl = root.querySelector("#pet-sprite");
    messageBar = root.querySelector(".message-bar");

    if (!spriteEl) {
        console.error("Sprite element not found.");
        return;
    }

    // Buttons
    const buttons = root.querySelectorAll("[data-action]");
    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.action;
            performAction(action);
        });
    });

    // Start default animation
    stateMachine.go("resting");

    // Start idle cycle
    startIdleLoop();
}

// Expose globally
window.initPetWidget = initPetWidget;

window.addEventListener("DOMContentLoaded", () => {
    initPetWidget(document);
    console.log("✅ script validated");
});
