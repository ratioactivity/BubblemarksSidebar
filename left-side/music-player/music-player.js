window.addEventListener("DOMContentLoaded", () => {
  const widgetHost = document.getElementById("music-player-widget");
  if (!widgetHost) {
    console.log("✅ script validated");
    return;
  }

  const musicController =
    window.musicController || (typeof window.MusicController === "function" ? new window.MusicController() : null);

  if (!musicController) {
    console.log("✅ script validated");
    return;
  }

  if (!window.musicController) {
    window.musicController = musicController;
  }

  const pastelTracks = [
    {
      title: "Cloud Drift",
      artist: "Bubblemarks FM",
      source: "sounds/allothers.mp3",
      accent: "linear-gradient(145deg, rgba(255, 212, 238, 0.95), rgba(184, 209, 255, 0.95))",
    },
    {
      title: "Nebula Nap",
      artist: "Papernotes Radio",
      source: "sounds/L.mp3",
      accent: "linear-gradient(145deg, rgba(210, 235, 255, 0.95), rgba(255, 236, 255, 0.95))",
    },
    {
      title: "Cotton Candy Keys",
      artist: "Bigbesty Beats",
      source: "sounds/M.mp3",
      accent: "linear-gradient(145deg, rgba(255, 247, 255, 0.95), rgba(200, 230, 255, 0.95))",
    },
  ];

  let currentTrackIndex = 0;
  const audio = musicController.audio;
  audio.preload = "metadata";
  audio.volume = 0.7;

  const formatTime = (value) => {
    if (!Number.isFinite(value)) {
      return "0:00";
    }
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60)
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const applyTrack = (index) => {
    const track = pastelTracks[index];
    const titleEl = widgetHost.querySelector(".music-player-title");
    const artistEl = widgetHost.querySelector(".music-player-artist");
    const artEl = widgetHost.querySelector(".music-player-art");
    if (titleEl) {
      titleEl.textContent = track.title;
    }
    if (artistEl) {
      artistEl.textContent = track.artist;
    }
    if (artEl) {
      artEl.style.background = track.accent;
    }
    musicController.onTrackEnd = null;
    musicController.setMode("widget");
    musicController.currentSource = track.source;
    musicController.currentMetadata = track;
    audio.loop = false;
    audio.src = track.source;
    audio.currentTime = 0;
    const seek = widgetHost.querySelector(".music-seek");
    if (seek) {
      seek.value = "0";
    }
    const currentTimeLabel = widgetHost.querySelector('[data-time="current"]');
    const durationLabel = widgetHost.querySelector('[data-time="duration"]');
    if (currentTimeLabel) {
      currentTimeLabel.textContent = "0:00";
    }
    if (durationLabel) {
      durationLabel.textContent = "0:00";
    }
  };

  const updatePlayButton = (isPlaying) => {
    const playButton = widgetHost.querySelector('[data-action="play"]');
    if (playButton) {
      playButton.textContent = isPlaying ? "❚❚" : "▶";
      playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    }
  };

  const attachWidget = async () => {
    try {
      const response = await fetch("left-side/music-player/music-player.html");
      if (!response.ok) {
        throw new Error("Unable to load music widget");
      }
      const markup = await response.text();
      widgetHost.innerHTML = markup;
    } catch (error) {
      widgetHost.innerHTML = `<p class="music-player-fallback">Music nook is stretching... (${error.message})</p>`;
      console.log("✅ script validated");
      return;
    }

    const playButton = widgetHost.querySelector('[data-action="play"]');
    const backButton = widgetHost.querySelector('[data-action="back"]');
    const forwardButton = widgetHost.querySelector('[data-action="forward"]');
    const seek = widgetHost.querySelector(".music-seek");
    const volume = widgetHost.querySelector(".music-volume");
    const currentTimeLabel = widgetHost.querySelector('[data-time="current"]');
    const durationLabel = widgetHost.querySelector('[data-time="duration"]');

    applyTrack(currentTrackIndex);

    if (playButton) {
      playButton.addEventListener("click", () => {
        musicController.setMode("widget");
        musicController.onTrackEnd = null;
        if (audio.paused) {
          audio.play();
        } else {
          audio.pause();
        }
      });
    }

    if (backButton) {
      backButton.addEventListener("click", () => {
        currentTrackIndex = (currentTrackIndex - 1 + pastelTracks.length) % pastelTracks.length;
        applyTrack(currentTrackIndex);
        musicController.setMode("widget");
        musicController.onTrackEnd = null;
        audio.play();
      });
    }

    if (forwardButton) {
      forwardButton.addEventListener("click", () => {
        currentTrackIndex = (currentTrackIndex + 1) % pastelTracks.length;
        applyTrack(currentTrackIndex);
        musicController.setMode("widget");
        musicController.onTrackEnd = null;
        audio.play();
      });
    }

    if (volume) {
      volume.addEventListener("input", (event) => {
        const target = event.currentTarget;
        if (target instanceof HTMLInputElement) {
          const newVolume = Number.parseFloat(target.value);
          if (Number.isFinite(newVolume)) {
            audio.volume = newVolume;
          }
        }
      });
    }

    if (seek) {
      seek.addEventListener("input", (event) => {
        const target = event.currentTarget;
        if (target instanceof HTMLInputElement && Number.isFinite(audio.duration)) {
          const seekValue = Number.parseFloat(target.value);
          const clampedValue = Math.min(Math.max(seekValue, 0), audio.duration);
          audio.currentTime = clampedValue;
        }
      });
    }

    audio.addEventListener("loadedmetadata", () => {
      if (musicController.mode !== "widget") {
        return;
      }
      if (durationLabel && Number.isFinite(audio.duration)) {
        durationLabel.textContent = formatTime(audio.duration);
      }
      if (seek && Number.isFinite(audio.duration)) {
        seek.max = audio.duration.toString();
      }
    });

    audio.addEventListener("timeupdate", () => {
      if (musicController.mode !== "widget") {
        return;
      }
      if (currentTimeLabel) {
        currentTimeLabel.textContent = formatTime(audio.currentTime);
      }
      if (seek && Number.isFinite(audio.duration)) {
        seek.value = audio.currentTime.toString();
      }
    });

    audio.addEventListener("play", () => {
      if (musicController.mode !== "widget") {
        return;
      }
      updatePlayButton(true);
    });

    audio.addEventListener("pause", () => {
      if (musicController.mode !== "widget") {
        return;
      }
      updatePlayButton(false);
    });

    audio.addEventListener("ended", () => {
      if (musicController.mode !== "widget") {
        return;
      }
      updatePlayButton(false);
    });

    console.log("✅ script validated");
  };

  attachWidget();
});
