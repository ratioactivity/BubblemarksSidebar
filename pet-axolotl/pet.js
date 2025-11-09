window.addEventListener("DOMContentLoaded", () => {
  const spriteEl = document.getElementById("pet-sprite");
  const buttons = document.querySelectorAll("#pet-buttons button");

  // simple audio helper
  function playSound(name) {
    if (!petState.soundEnabled) return;
    const audio = new Audio(`sounds/${name}.mp3`);
    audio.volume = 0.45;
    audio.play().catch(() => {});
  }

  // state machine
  const petState = {
    mode: "idle", // "idle", "rest", "sleep", "swim", "eat", "pet"
    soundEnabled: true,
    attention: 100,
    level: 1,
    name: "Axolotl",
  };

  const animations = {
    idleRest: "assets/resting.gif",
    idleFloat: "assets/floating.gif",
    idleSwim: "assets/swimming.gif",
    rest: "assets/resting.gif",
    sleep: "assets/sleeping.gif",
    swim: "assets/swimming.gif",
    fastSwim: "assets/fast-swim.gif",
    pet: "assets/pet.gif",
    eat: "assets/munching.gif",
  };

  function setAnimation(key) {
    const src = animations[key];
    if (!src) return;
    spriteEl.src = src;
  }

  // button actions (for now: just switch animations + sounds)
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      switch (action) {
        case "pet":
          petState.mode = "pet";
          setAnimation("pet");
          playSound("pet-sound");
          break;
        case "feed":
          petState.mode = "eat";
          setAnimation("eat");
          playSound("munch-squeak");
          // later: show worms, increase hunger/attention etc
          break;
        case "swim":
          petState.mode = "swim";
          setAnimation("swim");
          playSound("swimming-sound");
          break;
        case "rest":
          petState.mode = "rest";
          setAnimation("rest");
          playSound("resting-sound");
          break;
        case "sleep":
          petState.mode = "sleep";
          setAnimation("sleep");
          break;
      }
    });
  });

  // idle loop: cycle resting / floating / swimming
  const idleCycle = ["idleRest", "idleFloat", "idleSwim"];
  let idleIndex = 0;

  function runIdle() {
    if (["idle", "rest"].includes(petState.mode)) {
      setAnimation(idleCycle[idleIndex]);
      if (idleCycle[idleIndex] === "idleFloat") {
        playSound("float-squeak");
      }
      idleIndex = (idleIndex + 1) % idleCycle.length;
    }
  }

  setInterval(runIdle, 8000); // every 8s if idle

  console.log("✅ script validated");
});
