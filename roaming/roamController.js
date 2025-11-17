window.addEventListener("DOMContentLoaded", () => {
  console.log("✅ script validated");

  const petManager = window.petManager;
  const tankWindow = document.querySelector(".tank-window");
  const petSprite = document.querySelector("#pet-sprite");

  if (
    !petManager ||
    typeof petManager.subscribeToAnimationChange !== "function" ||
    !tankWindow ||
    !petSprite
  ) {
    console.warn("[RoamController] Missing required elements or manager");
    return;
  }

  const MOVE_DURATION = 2200;
  const ROAM_FADE_DURATION = 320;
  const UI_FADE_DURATION = 280;
  const DEFAULT_TRANSITION = `transform ${MOVE_DURATION}ms ease-in-out, opacity ${ROAM_FADE_DURATION}ms ease`;
  const initialSpriteSrc = petSprite.getAttribute("src") || "";
  const roamSprite = ensureRoamSprite();
  const roamControllerState = { active: false, returning: false, isRoaming: false };
  window.bubblePetRoamState = roamControllerState;
  let roamLoopId = null;
  let roamMode = false;
  let lastX = 0;
  let currentSpriteSrc = initialSpriteSrc;
  let roamSpriteVisible = false;

  function setRoamControllerState(partial = {}) {
    Object.assign(roamControllerState, partial);
  }

  function setState(key, value) {
    if (typeof key !== "string") {
      return;
    }
    setRoamControllerState({ [key]: value });
  }

  function attachRoamSpriteIfNeeded() {
    if (!tankWindow.contains(roamSprite)) {
      tankWindow.appendChild(roamSprite);
    }
    roamSpriteVisible = true;
  }

  function detachRoamSprite() {
    if (tankWindow.contains(roamSprite)) {
      tankWindow.removeChild(roamSprite);
    }
    roamSpriteVisible = false;
  }

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
    const measuredWidth = petSprite.clientWidth || petSprite.naturalWidth || 150;
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
      sprite.src = petSprite.getAttribute("src") || "./assets/swimming.gif";
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

  function hidePetSpriteInstantly() {
    if (!petSprite) return;
    petSprite.style.transition = "none";
    petSprite.style.opacity = "0";
    petSprite.style.display = "none";
  }

  function showPetSpriteInstantly() {
    if (!petSprite) return;
    const previousTransition = petSprite.style.transition;
    petSprite.style.transition = "none";
    petSprite.style.display = "block";
    petSprite.style.opacity = "1";
    void petSprite.offsetWidth;
    petSprite.style.transition = previousTransition || `opacity ${UI_FADE_DURATION}ms ease`;
  }

  function snapRoamOpacity(targetOpacity) {
    const previousTransition = roamSprite.style.transition;
    roamSprite.style.transition = "none";
    roamSprite.style.opacity = targetOpacity;
    void roamSprite.offsetWidth;
    roamSprite.style.transition = previousTransition || DEFAULT_TRANSITION;
  }

  function revealRoamSpriteInstantly() {
    attachRoamSpriteIfNeeded();
    roamSprite.style.visibility = "visible";
    roamSprite.style.display = "block";
    snapRoamOpacity("1");
  }

  function hideRoamSpriteInstantly() {
    const previousTransition = roamSprite.style.transition;
    snapRoamOpacity("0");
    roamSprite.style.transition = "none";
    roamSprite.style.transform = "translate(0px, 0px) scaleX(1)";
    roamSprite.style.visibility = "hidden";
    roamSprite.style.display = "none";
    detachRoamSprite();
    void roamSprite.offsetWidth;
    roamSprite.style.transition = previousTransition || DEFAULT_TRANSITION;
  }

  function stopRoamLoop() {
    if (roamLoopId !== null) {
      clearTimeout(roamLoopId);
      roamLoopId = null;
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
    roamLoopId = setTimeout(() => {
      moveRoamSprite();
      queueNextMove();
    }, delay);
  }

  function enterRoamMode() {
    if (roamMode) return;
    stopRoamLoop();
    roamMode = true;
    setState("isRoaming", true);
    setRoamControllerState({ active: true, returning: false });
    hidePetSpriteInstantly();
    revealRoamSpriteInstantly();
    moveRoamSprite(true);
    queueNextMove();
  }

  function callBackToTank() {
    stopRoamLoop();
    roamMode = false;
    hideRoamSpriteInstantly();
    showPetSpriteInstantly();
    setRoamControllerState({ active: false, returning: false });
    setState("isRoaming", false);
  }

  function ensureRoamSpriteHidden() {
    if (roamSpriteVisible || tankWindow.contains(roamSprite) || roamMode) {
      callBackToTank();
    }
  }

  callBackToTank();

  petManager.subscribeToAnimationChange((animName, state, meta = {}) => {
    const spriteSrc = meta.sprite || currentSpriteSrc;
    const requiresRestart = Boolean(meta.requiresRestart);
    if (spriteSrc) {
      setRoamSpriteSource(spriteSrc, requiresRestart);
    }

    const mode = state && state.mode;
    if (mode === "roam") {
      enterRoamMode();
    } else if (roamMode) {
      callBackToTank();
    } else {
      ensureRoamSpriteHidden();
    }
  });
});
