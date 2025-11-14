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
// HELPER: change sprite
// -------------------------------
function playSprite(name, then = null) {
    if (!SPRITES[name]) {
        console.warn("Missing sprite:", name);
        return;
    }
    spriteEl.src = SPRITES[name];
    pet.state = name;

    // If this is a transition animation, chain it
    if (then) {
        // 1s default transition time unless overridden
        setTimeout(() => {
            playSprite(then);
        }, 1000);
    }
}

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
            playSprite("floating");
        } else if (roll < 0.20) {
            playSprite("restingbubble");
        } else {
            playSprite("resting");
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
    playSprite("munching", "resting");
    messageBar.textContent = "Pico munches happily!";
    pet.hunger = Math.max(0, pet.hunger - 5);
}

function doPet() {
    playSprite("petting", "resting");
    messageBar.textContent = "Pico wiggles happily ❤️";
    pet.affection = Math.min(10, pet.affection + 5);
}

function doSleep() {
    // If floating → float_to_sleep → sleeping
    if (pet.state === "floating") {
        playSprite("float_to_sleep", "sleeping");
    } else {
        playSprite("rest_to_sleep", "sleeping");
    }

    messageBar.textContent = "Pico is sleeping...";
}

function doSwim() {
    // floating → swim
    if (pet.state === "floating") {
        playSprite("float_to_swim", "swimming");
    } else {
        playSprite("swimming");
    }

    messageBar.textContent = "Pico is swimming!";
}

function doRest() {
    // swimming → swim_to_float → rest
    if (pet.state === "swimming" || pet.state === "fastswim") {
        playSprite("swim_to_float", "resting");
    }
    else if (pet.state === "floating") {
        playSprite("float_to_rest", "resting");
    }
    else {
        playSprite("resting");
    }

    messageBar.textContent = "Pico calms down.";
}

function doRoam() {
    playSprite("roam");
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
    playSprite("resting");

    // Start idle cycle
    startIdleLoop();
}

// Expose globally
window.initPetWidget = initPetWidget;

window.addEventListener("DOMContentLoaded", () => {
    initPetWidget(document);
    console.log("✅ script validated");
});
