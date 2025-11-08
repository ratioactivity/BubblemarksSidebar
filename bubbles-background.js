if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    console.log("✅ script validated");

    (function () {
      if (typeof document === "undefined") {
        return;
      }

      const motionQuery = window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : { matches: false, addEventListener: () => {}, removeEventListener: () => {} };

  const config = {
    maxBubbles: 120,
    minRadius: 18,
    maxRadius: 86,
    pastelPalette: ["#ffe5f8", "#dff2ff", "#fef4d8", "#e8ffe9", "#f5e3ff"],
    sparklePalette: ["rgba(255, 255, 255, 0.28)", "rgba(255, 255, 255, 0.18)", "rgba(255, 245, 255, 0.35)"],
    baseSpeed: 0.035,
    driftStrength: 0.18,
    pulseStrength: 0.055,
    waveAmplitudeRatio: 0.06,
    waveSpeed: 0.0006,
  };

  let canvas;
  let ctx;
  let width = 0;
  let height = 0;
  let dpr = window.devicePixelRatio || 1;
  let gradientFill = null;
  let bubbles = [];
  let waveOffset = 0;
  let running = true;
  let lastTime = performance.now();

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function createCanvas() {
    canvas = document.createElement("canvas");
    canvas.id = "bubbles-background";
    canvas.setAttribute("aria-hidden", "true");
    ctx = canvas.getContext("2d");
    document.body.prepend(canvas);
  }

  function buildGradient() {
    gradientFill = ctx.createLinearGradient(0, 0, width, height);
    gradientFill.addColorStop(0, "rgba(255, 226, 245, 0.9)");
    gradientFill.addColorStop(0.5, "rgba(222, 242, 255, 0.95)");
    gradientFill.addColorStop(1, "rgba(255, 247, 220, 0.92)");
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    buildGradient();
    seedBubbles();
  }

  function seedBubbles() {
    const density = clamp(Math.floor((width * height) / 16000), 24, config.maxBubbles);
    const next = [];
    for (let i = 0; i < density; i += 1) {
      const radius = config.minRadius + Math.random() * (config.maxRadius - config.minRadius);
      next.push({
        x: Math.random() * width,
        y: Math.random() * height,
        baseRadius: radius,
        radius,
        hue: config.pastelPalette[i % config.pastelPalette.length],
        sparkle: config.sparklePalette[Math.floor(Math.random() * config.sparklePalette.length)],
        drift: (Math.random() * 2 - 1) * config.driftStrength,
        speed: config.baseSpeed + Math.random() * config.baseSpeed,
        pulse: 0.5 + Math.random() * config.pulseStrength,
        phase: Math.random() * Math.PI * 2,
      });
    }
    bubbles = next;
  }

  function update(delta) {
    const reduceMotion = motionQuery.matches;
    const speedScale = reduceMotion ? 0.35 : 1;
    const driftScale = reduceMotion ? 0.4 : 1;

    bubbles.forEach((bubble) => {
      const verticalShift = (bubble.speed * speedScale * delta * height) / 600;
      bubble.y -= verticalShift;
      const horizontalShift = Math.sin(lastTime * 0.0004 + bubble.phase) * bubble.drift * driftScale * delta * 0.6;
      bubble.x += horizontalShift;
      bubble.phase += bubble.pulse * delta * 0.0015;
      bubble.radius = bubble.baseRadius * (1 + Math.sin(bubble.phase) * (config.pulseStrength * 0.6));

      if (bubble.y + bubble.radius < -40) {
        bubble.y = height + bubble.radius + Math.random() * 80;
        bubble.x = Math.random() * width;
        bubble.phase = Math.random() * Math.PI * 2;
      }
      if (bubble.x - bubble.radius > width + 40) {
        bubble.x = -bubble.radius;
      } else if (bubble.x + bubble.radius < -40) {
        bubble.x = width + bubble.radius;
      }
    });

    if (!reduceMotion) {
      waveOffset += delta * config.waveSpeed * width;
    }
  }

  function drawWave() {
    const reduceMotion = motionQuery.matches;
    if (reduceMotion) {
      return;
    }
    const amplitude = height * config.waveAmplitudeRatio;
    const baseline = height * 0.88;
    const wavelength = width * 0.65;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, baseline);
    for (let x = 0; x <= width; x += 6) {
      const y = baseline + Math.sin((x + waveOffset) / wavelength * Math.PI * 2) * amplitude;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, baseline - amplitude, 0, height);
    gradient.addColorStop(0, "rgba(222, 239, 255, 0.35)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.globalCompositeOperation = "lighter";
    ctx.fill();
    ctx.restore();
  }

  function drawBubbles() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    bubbles.forEach((bubble) => {
      const gradient = ctx.createRadialGradient(
        bubble.x - bubble.radius * 0.3,
        bubble.y - bubble.radius * 0.5,
        bubble.radius * 0.1,
        bubble.x,
        bubble.y,
        bubble.radius
      );
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      gradient.addColorStop(0.45, bubble.hue);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0.15)");

      ctx.beginPath();
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.95;
      ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = bubble.sparkle;
      ctx.arc(bubble.x - bubble.radius * 0.35, bubble.y - bubble.radius * 0.45, bubble.radius * 0.25, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function draw(delta) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = gradientFill;
    ctx.fillRect(0, 0, width, height);
    drawWave();
    drawBubbles();
  }

  function loop(time) {
    if (!running) {
      return;
    }
    const delta = clamp((time - lastTime) / (1000 / 60), 0.2, 5);
    lastTime = time;
    update(delta);
    draw(delta);
    window.requestAnimationFrame(loop);
  }

  function handleVisibility() {
    if (document.hidden) {
      running = false;
    } else {
      running = true;
      lastTime = performance.now();
      window.requestAnimationFrame(loop);
    }
  }

  function init() {
    createCanvas();
    resize();
    window.addEventListener("resize", resize);

    if (motionQuery && motionQuery.addEventListener) {
      motionQuery.addEventListener("change", () => {
        lastTime = performance.now();
      });
    } else if (motionQuery && motionQuery.addListener) {
      motionQuery.addListener(() => {
        lastTime = performance.now();
      });
    }

    document.addEventListener("visibilitychange", handleVisibility);
    lastTime = performance.now();
    window.requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
    })();
  });
}

