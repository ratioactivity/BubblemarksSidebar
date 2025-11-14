// ===============================
// BUBBLEPET – CLEAN STATE MACHINE
// ===============================

// DOM references assigned on init
let spriteEl = null;
let messageBar = null;

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

const TRANSITION_GRAPH = {
    resting: ["resting", "restingbubble", "rest-to-float", "rest-to-sleep", "munching", "petting"],
    restingbubble: ["restingbubble", "resting"],
    floating: ["floating", "float-to-rest", "float-to-sleep", "float-to-swim"],
    swimming: ["swimming", "fast-swim", "swim-to-float"],
    "fast-swim": ["fast-swim", "swimming"],
    sleeping: ["sleeping", "sleep-to-rest", "sleep-to-float"],
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

const stateMachine = {
    currentState: null,
    previousState: null,
    transitioning: false,
    queue: [],
    autoTimer: null,
    states: {
        resting: {
            gif: SPRITES.resting,
            loop: true
        },
        restingbubble: {
            gif: SPRITES.restingbubble,
            loop: true
        },
        floating: {
            gif: SPRITES.floating,
            loop: true
        },
        swimming: {
            gif: SPRITES.swimming,
            loop: true
        },
        "fast-swim": {
            gif: SPRITES["fast-swim"],
            loop: true
        },
        sleeping: {
            gif: SPRITES.sleeping,
            loop: true
        },
        munching: {
            gif: SPRITES.munching,
            loop: false,
            transitional: true,
            auto: { state: "resting", delay: DEFAULT_TRANSITION_DELAY }
        },
        petting: {
            gif: SPRITES.petting,
            loop: false,
            transitional: true,
            auto: { state: "resting", delay: DEFAULT_TRANSITION_DELAY }
        },
        "rest-to-float": {
            gif: SPRITES["rest-to-float"],
            loop: false,
            transitional: true,
            auto: { state: "floating", delay: DEFAULT_TRANSITION_DELAY }
        },
        "float-to-rest": {
            gif: SPRITES["float-to-rest"],
            loop: false,
            transitional: true,
            auto: { state: "resting", delay: DEFAULT_TRANSITION_DELAY }
        },
        "rest-to-sleep": {
            gif: SPRITES["rest-to-sleep"],
            loop: false,
            transitional: true,
            auto: { state: "sleeping", delay: DEFAULT_TRANSITION_DELAY }
        },
        "float-to-sleep": {
            gif: SPRITES["float-to-sleep"],
            loop: false,
            transitional: true,
            auto: { state: "sleeping", delay: DEFAULT_TRANSITION_DELAY }
        },
        "float-to-swim": {
            gif: SPRITES["float-to-swim"],
            loop: false,
            transitional: true,
            auto: { state: "swimming", delay: DEFAULT_TRANSITION_DELAY }
        },
        "sleep-to-rest": {
            gif: SPRITES["sleep-to-rest"],
            loop: false,
            transitional: true,
            auto: { state: "resting", delay: DEFAULT_TRANSITION_DELAY }
        },
        "sleep-to-float": {
            gif: SPRITES["sleep-to-float"],
            loop: false,
            transitional: true,
            auto: { state: "floating", delay: DEFAULT_TRANSITION_DELAY }
        },
        "swim-to-float": {
            gif: SPRITES["swim-to-float"],
            loop: false,
            transitional: true,
            auto: { state: "floating", delay: DEFAULT_TRANSITION_DELAY }
        }
    },
    go(targetState) {
        if (!this.states[targetState]) {
            console.warn("Unknown state:", targetState);
            return;
        }

        if (this.transitioning) {
            this.queue.push(targetState);
            return;
        }

        if (!this.currentState) {
            this._applyState(targetState);
            if (!this.transitioning) {
                this._flushQueue();
            }
            return;
        }

        if (this.currentState === targetState) {
            this._applyState(targetState);
            if (!this.transitioning) {
                this._flushQueue();
            }
            return;
        }

        const path = this._findPath(this.currentState, targetState);
        if (!path || path.length < 2) {
            console.warn(`No allowed path from ${this.currentState} to ${targetState}`);
            return;
        }

        const nextState = path[1];

        if (nextState !== targetState) {
            this._enqueueFront(targetState);
        }

        this._applyState(nextState);

        if (!this.transitioning) {
            this._flushQueue();
        }
    },
    _applyState(name) {
        const config = this.states[name];
        if (!config) {
            console.warn("State config missing:", name);
            return;
        }

        if (!SPRITES[name] && !config.gif) {
            console.warn("Missing sprite for state:", name);
        }

        clearTimeout(this.autoTimer);

        this.previousState = this.currentState;
        this.currentState = name;
        pet.state = name;
        this.transitioning = Boolean(config.transitional);

        if (spriteEl && config.gif) {
            spriteEl.src = config.gif;
        }

        if (config.auto) {
            const delay = config.auto.delay ?? DEFAULT_TRANSITION_DELAY;
            this.autoTimer = setTimeout(() => {
                this.transitioning = false;
                this.go(config.auto.state);
            }, delay);
        } else if (!config.transitional) {
            this.transitioning = false;
        }
    },
    _flushQueue() {
        if (!this.queue.length) return;
        const next = this.queue.shift();
        this.go(next);
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
    _enqueueFront(state) {
        if (this.queue[0] === state) {
            return;
        }

        this.queue.unshift(state);
    }
};

// -------------------------------
// IDLE BEHAVIOR
// -------------------------------
function startIdleLoop() {
    clearInterval(pet.idleTimer);

    pet.idleTimer = setInterval(() => {

        // 80% = stay resting
        // 10% = resting bubble alt
        // 10% = floating variation

        const roll = Math.random();

        if (roll < 0.10) {
            stateMachine.go("floating");
        } else if (roll < 0.20) {
            stateMachine.go("restingbubble");
        } else {
            stateMachine.go("resting");
        }

    }, 7000);
}

// -------------------------------
// ACTION SYSTEM
// -------------------------------
function performAction(action) {
    if (pet.actionCooldown) return;
    pet.actionCooldown = true;

    setTimeout(() => (pet.actionCooldown = false), 1200);

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
    stateMachine.go("munching");
    messageBar.textContent = "Pico munches happily!";
    pet.hunger = Math.max(0, pet.hunger - 5);
}

function doPet() {
    stateMachine.go("petting");
    messageBar.textContent = "Pico wiggles happily ❤️";
    pet.affection = Math.min(10, pet.affection + 5);
}

function doSleep() {
    // Enforce rest-to-sleep transition chain
    stateMachine.go("rest-to-sleep");
    messageBar.textContent = "Pico is sleeping...";
}

function doSwim() {
    // Float before swimming when necessary
    if (stateMachine.currentState === "floating") {
        stateMachine.go("float-to-swim");
    } else if (stateMachine.currentState === "swimming" || stateMachine.currentState === "fast-swim") {
        stateMachine.go("swimming");
    } else {
        stateMachine.go("float-to-swim");
    }
    messageBar.textContent = "Pico is swimming!";
}

function doRest() {
    // Transitions handled by state machine
    stateMachine.go("resting");
    messageBar.textContent = "Pico calms down.";
}

function doRoam() {
    stateMachine.go("floating");
    messageBar.textContent = "Pico wanders off...";
    clearInterval(pet.idleTimer);
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
