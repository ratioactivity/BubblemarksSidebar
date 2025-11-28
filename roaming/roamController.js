window.addEventListener("DOMContentLoaded", () => {
  console.log("✅ script validated");

  const petManager = window.petManager;
  const tankWindow = document.querySelector(".tank-window");
  let uiSprite = document.querySelector("#pet-sprite");

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
  const DEFAULT_TRANSITION = `transform ${MOVE_DURATION}ms ease-in-out, opacity ${ROAM_FADE_DURATION}ms ease`;
  const initialSpriteSrc = refreshUiSprite()?.getAttribute("src") || "";
  let currentSpriteSrc = initialSpriteSrc;
  let roamSpriteVisible = false;
  let roamSpriteReady = false;
  let pendingRoamStart = false;
  let roamMode = false;
  let returning = false;
  let lastX = 0;
  let roamLoopTimeout = null;
  const roamSpritePreloadHost = ensureRoamSpritePreloadHost();
  const roamSprite = ensureRoamSprite();
  const roamSpriteVariantCounters = new Map();
  const roamControllerState = { active: false, returning: false };

  window.bubblePetRoamState = roamControllerState;

  function refreshUiSprite() {
    if (!uiSprite || !document.body.contains(uiSprite)) {
      uiSprite = document.querySelector("#pet-sprite");
    }
    if (uiSprite && !uiSprite.style.transition) {
      uiSprite.style.transition = `opacity ${UI_FADE_DURATION}ms ease`;
    }
    return uiSprite;
  }

  refreshUiSprite();

  const spriteObserver = new MutationObserver(() => {
    refreshUiSprite();
  });
  spriteObserver.observe(tankWindow, { childList: true });

  refreshUiSprite();

  function ensureRoamSpritePreloadHost() {
    let host = document.querySelector("#pet-roam-preload");
    if (!host) {
      host = document.createElement("div");
      host.id = "pet-roam-preload";
      host.setAttribute("aria-hidden", "true");
      const hostStyle = host.style;
      hostStyle.position = "absolute";
      hostStyle.left = "-9999px";
      hostStyle.top = "0";
      hostStyle.width = "1px";
      hostStyle.height = "1px";
      hostStyle.overflow = "hidden";
      document.body.appendChild(host);
    }
    return host;
  }

  function handleRoamSpriteLoad() {
    roamSpriteReady = true;
    if (pendingRoamStart && roamMode) {
      beginRoamDisplay();
    }
  }

  function moveSpriteToPreloadHost() {
    if (!roamSpritePreloadHost || !roamSprite) {
      return;
    }
    roamSprite.classList.remove("ready");
    if (roamSprite.parentElement !== roamSpritePreloadHost) {
      roamSpritePreloadHost.appendChild(roamSprite);
    }
  }

  function setRoamControllerState(partial = {}) {
    Object.assign(roamControllerState, partial);
  }

  function attachRoamSpriteIfNeeded() {
    if (!roamSpriteReady) {
      pendingRoamStart = true;
      return false;
    }
    if (!tankWindow.contains(roamSprite)) {
      tankWindow.appendChild(roamSprite);
    }
    roamSpriteVisible = true;
    return true;
  }

  function detachRoamSprite() {
    if (tankWindow.contains(roamSprite)) {
      tankWindow.removeChild(roamSprite);
    }
    moveSpriteToPreloadHost();
    roamSpriteVisible = false;
  }

  function ensureRoamSprite() {
    let sprite = tankWindow.querySelector("#pet-roam-sprite");
    if (!sprite) {
      sprite = document.createElement("img");
      sprite.id = "pet-roam-sprite";
      sprite.alt = "Roaming BubblePet";
    }

    sprite.setAttribute("aria-hidden", "true");
    sprite.loading = "eager";
    sprite.decoding = "async";
    sprite.classList.add("roaming-axolotl");
    const style = sprite.style;
    const measuredSource = refreshUiSprite();
    const measuredWidth = measuredSource
      ? measuredSource.clientWidth || measuredSource.naturalWidth || 150
      : 150;
    style.position = "absolute";
    style.left = "0";
    style.top = "0";
    style.pointerEvents = "none";
    style.transform = "translate(0px, 0px) scaleX(1)";
    style.transition = DEFAULT_TRANSITION;
    style.width = `${measuredWidth}px`;
    style.maxWidth = `${measuredWidth}px`;
    style.filter = "drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35))";
    style.willChange = "transform, opacity";
    sprite.addEventListener("load", handleRoamSpriteLoad);

    if (sprite.parentElement !== roamSpritePreloadHost) {
      roamSpritePreloadHost.appendChild(sprite);
    }

    if (currentSpriteSrc) {
      sprite.src = currentSpriteSrc;
    } else if (!sprite.getAttribute("src")) {
      const currentUiSprite = refreshUiSprite();
      sprite.src = (currentUiSprite && currentUiSprite.getAttribute("src")) || "./assets/swimming.gif";
    }

    if (sprite.complete && sprite.naturalWidth > 0) {
      handleRoamSpriteLoad();
    }

    return sprite;
  }

  function getNextRoamSpriteVariant(src) {
    if (!src) {
      return src;
    }
    const nextCount = (roamSpriteVariantCounters.get(src) || 0) + 1;
    roamSpriteVariantCounters.set(src, nextCount);
    const hashIndex = src.indexOf("#");
    const base = hashIndex >= 0 ? src.slice(0, hashIndex) : src;
    const hash = hashIndex >= 0 ? src.slice(hashIndex) : "";
    const joiner = base.includes("?") ? "&" : "?";
    return `${base}${joiner}__loop=${nextCount}&__t=${Date.now()}${hash}`;
  }

  function setRoamSpriteSource(src, forceRestart = false) {
    if (!src) return;
    currentSpriteSrc = src;
    const appliedSrc = forceRestart ? getNextRoamSpriteVariant(src) : src;
    const existingSrc = roamSprite.getAttribute("src");
    if (!forceRestart && existingSrc === src) {
      if (roamSprite.complete && roamSprite.naturalWidth > 0) {
        handleRoamSpriteLoad();
      }
      return;
    }

    roamSpriteReady = false;
    pendingRoamStart = pendingRoamStart || roamMode;
    detachRoamSprite();

    const applySrc = () => {
      roamSprite.src = appliedSrc;
      if (roamSprite.complete && roamSprite.naturalWidth > 0) {
        handleRoamSpriteLoad();
      }
    };

    if (forceRestart) {
      roamSprite.removeAttribute("src");
      requestAnimationFrame(applySrc);
      return;
    }

    applySrc();
  }

  function revealRoamSpriteInstantly() {
    if (!attachRoamSpriteIfNeeded()) {
      return;
    }
    void roamSprite.offsetWidth;
    roamSprite.classList.add("ready");
  }

  function hideRoamSpriteInstantly() {
    roamSprite.classList.remove("ready");
    roamSprite.style.transform = "translate(0px, 0px) scaleX(1)";
    detachRoamSprite();
    pendingRoamStart = false;
  }

  function clearTimers() {
    if (roamLoopTimeout) {
      clearTimeout(roamLoopTimeout);
      roamLoopTimeout = null;
    }
  }

  function moveRoamSprite(immediate = false) {
    if (!roamSpriteReady || !roamSpriteVisible) {
      return;
    }

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
      const previousTransition = roamSprite.style.transition;
      roamSprite.style.transition = "none";
      roamSprite.style.transform = `translate(${nextX}px, ${nextY}px) scaleX(${faceLeft})`;
      void roamSprite.offsetWidth;
      roamSprite.style.transition = previousTransition || DEFAULT_TRANSITION;
    } else {
      roamSprite.style.transform = `translate(${nextX}px, ${nextY}px) scaleX(${faceLeft})`;
    }

    lastX = nextX;
  }

  function queueNextMove() {
    clearTimers();
    if (!roamMode) {
      return;
    }

    const delay = 1600 + Math.random() * 2600;
    roamLoopTimeout = setTimeout(() => {
      moveRoamSprite();
      queueNextMove();
    }, delay);
  }

  function beginRoamDisplay() {
    if (!roamSpriteReady) {
      pendingRoamStart = true;
      return;
    }
    pendingRoamStart = false;
    revealRoamSpriteInstantly();
    moveRoamSprite(true);
    queueNextMove();
  }

  function hideUISprite() {
    const sprite = refreshUiSprite();
    if (sprite) {
      sprite.style.opacity = "0";
    }
  }

  function showUISprite() {
    const sprite = refreshUiSprite();
    if (sprite) {
      sprite.style.opacity = "1";
    }
  }

  function enterRoamMode() {
    if (roamMode) {
      return;
    }
    roamMode = true;
    returning = false;
    clearTimers();
    hideRoamSpriteInstantly();
    hideUISprite();
    setRoamControllerState({ active: true, returning: false });
  }

  function finishRecallSequence() {
    returning = false;
    hideRoamSpriteInstantly();
    showUISprite();
    setRoamControllerState({ active: false, returning: false });
  }

  function callBackToTank() {
    if (returning) {
      return;
    }

    clearTimers();
    roamMode = false;
    returning = true;
    pendingRoamStart = false;
    setRoamControllerState({ active: false, returning: true });

    if (!roamSpriteVisible) {
      finishRecallSequence();
      return;
    }

    const handleFadeOut = () => {
      if (!returning) {
        return;
      }
      roamSprite.removeEventListener("transitionend", handleFadeOut);
      finishRecallSequence();
    };

    roamSprite.addEventListener("transitionend", handleFadeOut);
    roamSprite.classList.remove("ready");
    setTimeout(handleFadeOut, ROAM_FADE_DURATION + 50);
  }

  function ensureRoamSpriteHidden() {
    if (!roamMode && !returning && (roamSpriteVisible || tankWindow.contains(roamSprite))) {
      hideRoamSpriteInstantly();
      showUISprite();
      setRoamControllerState({ active: false, returning: false });
    }
  }

  setRoamControllerState({ active: false, returning: false });
  hideRoamSpriteInstantly();

  petManager.subscribeToAnimationChange((animName, state, meta = {}) => {
    const spriteSrc = meta.sprite || currentSpriteSrc;
    const requiresRestart = Boolean(meta.requiresRestart);
    if (spriteSrc) {
      setRoamSpriteSource(spriteSrc, requiresRestart);
    }

    const mode = state && state.mode;
    if (mode === "roam") {
      enterRoamMode();
    } else if (roamMode || roamSpriteVisible) {
      callBackToTank();
    } else {
      ensureRoamSpriteHidden();
      pendingRoamStart = false;
    }
  });
});
