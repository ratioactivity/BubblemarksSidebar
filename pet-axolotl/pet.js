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
    fastswim: "assets/fast-swim.gif",
    sleeping: "assets/sleeping.gif",
    munching: "assets/munching.gif",
    petting: "assets/pet.gif",

    // transitions
    rest_to_float: "assets/rest-to-float.gif",
    float_to_swim: "assets/float-to-swim.gif",
    float_to_sleep: "assets/float-to-sleep.gif",
    float_to_rest: "assets/float-to-rest.gif",
    swim_to_float: "assets/swim-to-float.gif",
    rest_to_sleep: "assets/rest-to-sleep.gif",

    // free roam (future)
    roam: "assets/roam.gif"
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
            loop: true,
            allowed: ["resting", "restingbubble", "floating", "swimming", "fastswim", "sleeping", "munching", "petting", "roam"],
            transitionTo: {
                floating: "rest_to_float",
                sleeping: "rest_to_sleep"
            }
        },
        restingbubble: {
            gif: SPRITES.restingbubble,
            loop: true,
            allowed: ["resting", "restingbubble", "floating", "swimming", "fastswim", "sleeping", "munching", "petting", "roam"],
            transitionTo: {
                floating: "rest_to_float",
                sleeping: "rest_to_sleep"
            }
        },
        floating: {
            gif: SPRITES.floating,
            loop: true,
            allowed: ["resting", "restingbubble", "floating", "swimming", "fastswim", "sleeping", "munching", "petting", "roam"],
            transitionTo: {
                swimming: "float_to_swim",
                sleeping: "float_to_sleep",
                resting: "float_to_rest"
            }
        },
        swimming: {
            gif: SPRITES.swimming,
            loop: true,
            allowed: ["resting", "restingbubble", "floating", "swimming", "fastswim", "sleeping", "munching", "petting", "roam"],
            transitionTo: {
                resting: "swim_to_float",
                sleeping: "rest_to_sleep"
            }
        },
        fastswim: {
            gif: SPRITES.fastswim,
            loop: true,
            allowed: ["resting", "restingbubble", "floating", "swimming", "fastswim", "sleeping", "munching", "petting", "roam"],
            transitionTo: {
                resting: "swim_to_float",
                sleeping: "rest_to_sleep"
            }
        },
        sleeping: {
            gif: SPRITES.sleeping,
            loop: true,
            allowed: ["resting", "restingbubble", "floating", "swimming", "fastswim", "sleeping", "munching", "petting", "roam"]
        },
        munching: {
            gif: SPRITES.munching,
            loop: false,
            allowed: ["resting"],
            transitional: true,
            auto: { state: "resting", delay: DEFAULT_TRANSITION_DELAY }
        },
        petting: {
            gif: SPRITES.petting,
            loop: false,
            allowed: ["resting"],
            transitional: true,
            auto: { state: "resting", delay: DEFAULT_TRANSITION_DELAY }
        },
        roam: {
            gif: SPRITES.roam,
            loop: true,
            allowed: ["resting", "restingbubble", "floating", "swimming", "fastswim", "sleeping", "munching", "petting", "roam"]
        },
        rest_to_float: {
            gif: SPRITES.rest_to_float,
            loop: false,
            allowed: ["floating"],
            transitional: true,
            auto: { state: "floating", delay: DEFAULT_TRANSITION_DELAY }
        },
        float_to_swim: {
            gif: SPRITES.float_to_swim,
            loop: false,
            allowed: ["swimming"],
            transitional: true,
            auto: { state: "swimming", delay: DEFAULT_TRANSITION_DELAY }
        },
        float_to_sleep: {
            gif: SPRITES.float_to_sleep,
            loop: false,
            allowed: ["sleeping"],
            transitional: true,
            auto: { state: "sleeping", delay: DEFAULT_TRANSITION_DELAY }
        },
        float_to_rest: {
            gif: SPRITES.float_to_rest,
            loop: false,
            allowed: ["resting"],
            transitional: true,
            auto: { state: "resting", delay: DEFAULT_TRANSITION_DELAY }
        },
        swim_to_float: {
            gif: SPRITES.swim_to_float,
            loop: false,
            allowed: ["resting"],
            transitional: true,
            auto: { state: "resting", delay: DEFAULT_TRANSITION_DELAY }
        },
        rest_to_sleep: {
            gif: SPRITES.rest_to_sleep,
            loop: false,
            allowed: ["sleeping"],
            transitional: true,
            auto: { state: "sleeping", delay: DEFAULT_TRANSITION_DELAY }
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

        const currentConfig = this.currentState ? this.states[this.currentState] : null;
        const nextFromTransition = currentConfig?.transitionTo?.[targetState] || null;

        if (currentConfig && !nextFromTransition) {
            const allowed = currentConfig.allowed || [];
            if (!allowed.includes(targetState) && this.currentState !== targetState) {
                console.warn(`Invalid transition from ${this.currentState} to ${targetState}`);
                return;
            }
        }

        const nextState = nextFromTransition || targetState;
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
    // Transitions handled by state machine
    stateMachine.go("sleeping");
    messageBar.textContent = "Pico is sleeping...";
}

function doSwim() {
    // Transitions handled by state machine
    stateMachine.go("swimming");
    messageBar.textContent = "Pico is swimming!";
}

function doRest() {
    // Transitions handled by state machine
    stateMachine.go("resting");
    messageBar.textContent = "Pico calms down.";
}

function doRoam() {
    stateMachine.go("roam");
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
