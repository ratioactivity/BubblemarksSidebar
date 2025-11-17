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

  const MOVE_DURATION = 2200;
  const ROAM_FADE_DURATION = 320;
  const UI_FADE_DURATION = 280;
  const RETURN_FAILSAFE = 2600;
  const DEFAULT_TRANSITION = `transform ${MOVE_DURATION}ms ease-in-out, opacity ${ROAM_FADE_DURATION}ms ease`;
  const initialSpriteSrc = uiSprite.getAttribute("src") || "";
  const roamSprite = ensureRoamSprite();
  let roamLoopTimeout = null;
  let roamMode = false;
  let returning = false;
  let revealTimeout = null;
  let fadeTimeout = null;
  let lastX = 0;
  let currentSpriteSrc = initialSpriteSrc;
  let failsafeTimeout = null;

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
    style.display = "none";
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
    uiSprite.style.transition = `opacity ${UI_FADE_DURATION}ms ease`;
    uiSprite.style.opacity = "0";
  }

  function showUISprite() {
    if (!uiSprite) return;
    uiSprite.style.transition = `opacity ${UI_FADE_DURATION}ms ease`;
    uiSprite.style.opacity = "1";
  }

  function snapRoamOpacity(targetOpacity) {
    const previousTransition = roamSprite.style.transition;
    roamSprite.style.transition = "none";
    roamSprite.style.opacity = targetOpacity;
    void roamSprite.offsetWidth;
    roamSprite.style.transition = previousTransition || DEFAULT_TRANSITION;
  }

  function revealRoamSpriteInstantly() {
    roamSprite.style.display = "block";
    snapRoamOpacity("1");
  }

  function hideRoamSpriteInstantly() {
    snapRoamOpacity("0");
    roamSprite.style.display = "none";
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
    if (failsafeTimeout) {
      clearTimeout(failsafeTimeout);
      failsafeTimeout = null;
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
    revealRoamSpriteInstantly();
    moveRoamSprite(true);
    queueNextMove();
  }

  function finishRecallSequence() {
    returning = false;
    roamSprite.style.transition = DEFAULT_TRANSITION;
    roamSprite.style.transform = "translate(0px, 0px) scaleX(1)";
    hideRoamSpriteInstantly();
    showUISprite();
    if (failsafeTimeout) {
      clearTimeout(failsafeTimeout);
      failsafeTimeout = null;
    }
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

    const swimDuration = 1200;
    const fadeDuration = 360;
    const fadeDelay = 820;

    hideUISprite();
    roamSprite.style.transition = `transform ${swimDuration}ms ease-in-out, opacity ${fadeDuration}ms ease-in-out`;
    roamSprite.style.transform = `translate(${targetX}px, ${targetY}px) scaleX(1)`;

    fadeTimeout = setTimeout(() => {
      roamSprite.style.opacity = "0";
    }, fadeDelay);

    revealTimeout = setTimeout(() => {
      finishRecallSequence();
    }, fadeDelay + fadeDuration + 50);

    failsafeTimeout = setTimeout(() => {
      if (returning) {
        finishRecallSequence();
      }
    }, RETURN_FAILSAFE);

    if (!wasRoaming) {
      finishRecallSequence();
    }
  }

  function handleRoamSpriteTransitionEnd(event) {
    if (!returning) return;
    if (event.target !== roamSprite) return;
    if (event.propertyName !== "opacity") return;
    const computedOpacity = window.getComputedStyle(roamSprite).opacity;
    if (Number(computedOpacity) <= 0) {
      finishRecallSequence();
    }
  }

  roamSprite.addEventListener("transitionend", handleRoamSpriteTransitionEnd);

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
    } else if (!roamMode && !returning) {
      hideRoamSpriteInstantly();
    }
  });
});
