window.addEventListener("DOMContentLoaded", () => {
  console.log("✅ script validated");

  const petManager = window.petManager;
  const tankWindow = document.querySelector(".tank-window");
  const uiSprite = document.querySelector("#pet-sprite");

  if (
    !petManager ||
    typeof petManager.subscribeToAnimationChange !== "function" ||
    !tankWindow ||
    !uiSprite
  ) {
    console.warn("[RoamController] Missing required elements or manager");
    return;
  }

  const DEFAULT_TRANSITION = "transform 4200ms ease-in-out, opacity 800ms ease";
  const initialSpriteSrc = uiSprite.getAttribute("src") || "";
  const roamSprite = ensureRoamSprite();
  let roamLoopTimeout = null;
  let roamMode = false;
  let returning = false;
  let revealTimeout = null;
  let fadeTimeout = null;
  let lastX = 0;
  let currentSpriteSrc = initialSpriteSrc;

  function ensureRoamSprite() {
    let sprite = tankWindow.querySelector("#pet-roam-sprite");
    if (!sprite) {
      sprite = document.createElement("img");
      sprite.id = "pet-roam-sprite";
      sprite.alt = "Roaming BubblePet";
      tankWindow.appendChild(sprite);
    }

    sprite.setAttribute("aria-hidden", "true");
    const style = sprite.style;
    const measuredWidth = uiSprite.clientWidth || uiSprite.naturalWidth || 150;
    style.position = "absolute";
    style.left = "0";
    style.top = "0";
    style.opacity = "0";
    style.pointerEvents = "none";
    style.transform = "translate(0px, 0px) scaleX(1)";
    style.transition = DEFAULT_TRANSITION;
    style.width = `${measuredWidth}px`;
    style.maxWidth = `${measuredWidth}px`;
    style.filter = "drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35))";
    style.willChange = "transform, opacity";
    if (currentSpriteSrc) {
      sprite.src = currentSpriteSrc;
    } else if (!sprite.getAttribute("src")) {
      sprite.src = uiSprite.getAttribute("src") || "./assets/swimming.gif";
    }
    return sprite;
  }

  function setRoamSpriteSource(src, forceRestart = false) {
    if (!src) return;
    currentSpriteSrc = src;
    if (forceRestart) {
      roamSprite.src = "";
      requestAnimationFrame(() => {
        roamSprite.src = src;
      });
      return;
    }
    if (roamSprite.getAttribute("src") !== src) {
      roamSprite.src = src;
    }
  }

  function hideUISprite() {
    if (!uiSprite) return;
    if (!uiSprite.style.transition) {
      uiSprite.style.transition = "opacity 600ms ease";
    }
    uiSprite.style.opacity = "0";
  }

  function showUISprite() {
    if (!uiSprite) return;
    if (!uiSprite.style.transition) {
      uiSprite.style.transition = "opacity 600ms ease";
    }
    uiSprite.style.opacity = "1";
  }

  function clearTimers() {
    if (roamLoopTimeout) {
      clearTimeout(roamLoopTimeout);
      roamLoopTimeout = null;
    }
    if (revealTimeout) {
      clearTimeout(revealTimeout);
      revealTimeout = null;
    }
    if (fadeTimeout) {
      clearTimeout(fadeTimeout);
      fadeTimeout = null;
    }
  }

  function moveRoamSprite(immediate = false) {
    const bounds = tankWindow.getBoundingClientRect();
    const spriteBounds = roamSprite.getBoundingClientRect();
    const spriteWidth = spriteBounds.width || bounds.width * 0.35;
    const spriteHeight = spriteBounds.height || bounds.height * 0.4;
    const maxX = Math.max(0, bounds.width - spriteWidth);
    const maxY = Math.max(0, bounds.height - spriteHeight);
    const nextX = Math.random() * maxX;
    const nextY = Math.random() * maxY;
    const faceLeft = nextX < lastX ? -1 : 1;

    if (immediate) {
      const prevTransition = roamSprite.style.transition;
      roamSprite.style.transition = "none";
      roamSprite.style.transform = `translate(${nextX}px, ${nextY}px) scaleX(${faceLeft})`;
      void roamSprite.offsetWidth;
      roamSprite.style.transition = prevTransition || DEFAULT_TRANSITION;
    } else {
      roamSprite.style.transform = `translate(${nextX}px, ${nextY}px) scaleX(${faceLeft})`;
    }

    lastX = nextX;
  }

  function queueNextMove() {
    if (!roamMode) return;
    const delay = 1600 + Math.random() * 2600;
    roamLoopTimeout = setTimeout(() => {
      moveRoamSprite();
      queueNextMove();
    }, delay);
  }

  function startRoamLoop() {
    if (roamMode) return;
    clearTimers();
    returning = false;
    roamMode = true;
    hideUISprite();
    roamSprite.style.opacity = "1";
    moveRoamSprite(true);
    queueNextMove();
  }

  function finishRecallSequence() {
    returning = false;
    roamSprite.style.transition = DEFAULT_TRANSITION;
    roamSprite.style.transform = "translate(0px, 0px) scaleX(1)";
    roamSprite.style.opacity = "0";
    showUISprite();
  }

  function recallRoamSprite() {
    if (returning) return;
    clearTimers();
    const wasRoaming = roamMode;
    roamMode = false;
    returning = true;

    const bounds = tankWindow.getBoundingClientRect();
    const spriteBounds = roamSprite.getBoundingClientRect();
    const targetX = Math.max(0, (bounds.width - spriteBounds.width) / 2);
    const targetY = Math.max(0, bounds.height * 0.25);

    const swimDuration = 1800;
    const fadeDuration = 650;
    const fadeDelay = 1500;

    hideUISprite();
    roamSprite.style.transition = `transform ${swimDuration}ms ease-in-out, opacity ${fadeDuration}ms ease-in-out`;
    roamSprite.style.transform = `translate(${targetX}px, ${targetY}px) scaleX(1)`;

    fadeTimeout = setTimeout(() => {
      roamSprite.style.opacity = "0";
    }, fadeDelay);

    revealTimeout = setTimeout(() => {
      finishRecallSequence();
    }, fadeDelay + fadeDuration + 50);

    if (!wasRoaming) {
      finishRecallSequence();
    }
  }

  petManager.subscribeToAnimationChange((animName, state, meta = {}) => {
    const spriteSrc = meta.sprite || currentSpriteSrc;
    const requiresRestart = Boolean(meta.requiresRestart);
    if (spriteSrc) {
      setRoamSpriteSource(spriteSrc, requiresRestart);
    }

    const mode = state && state.mode;
    if (mode === "roam") {
      startRoamLoop();
    } else if (roamMode) {
      recallRoamSprite();
    } else if (returning && mode === "idle") {
      // allow callback animation to complete before showing sprite
    }
  });
});
