(function () {
  let adActive = false;
  let settings = { enabled: true, speed: 16 };

  chrome.storage.sync.get(settings, (stored) => {
    settings = stored;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.speed) settings.speed = changes.speed.newValue;
  });

  function getPlayer() {
    return document.querySelector(".html5-video-player");
  }
  function getVideo() {
    return document.querySelector("video");
  }

  function fireClick(el) {
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  function trySkip() {
    const skipBtn = document.querySelector(
      ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button, button.ytp-ad-skip-button-slot"
    );
    if (
      skipBtn &&
      !skipBtn.disabled &&
      skipBtn.getAttribute("aria-disabled") !== "true"
    ) {
      fireClick(skipBtn);
    }
  }

  function applyAdState(isAd) {
    const video = getVideo();
    if (!video || !settings.enabled) return;

    if (isAd) {
      adActive = true;
      // Instantly jump to the end of the ad's own timeline instead of
      // waiting through it at high speed. Falls back to fast playback
      // if the ad blocks seeking (duration not finite/seekable yet).
      if (isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration;
        // Nudge YouTube's player logic in case it doesn't react to the
        // seek alone — some ad formats need an explicit "ended" signal
        video.dispatchEvent(new Event("ended"));
      }
      if (video.playbackRate !== settings.speed) {
        video.playbackRate = settings.speed;
      }
      if (!video.muted) {
        video.muted = true;
      }
      trySkip();
    } else if (adActive) {
      adActive = false;
      video.playbackRate = 1;
      video.muted = false;
    }
  }

  function checkAdStatus() {
    const player = getPlayer();
    if (!player) return;
    const isAd =
      player.classList.contains("ad-showing") ||
      player.classList.contains("ad-interrupting");
    applyAdState(isAd);
  }

  let observedPlayer = null;
  const classObserver = new MutationObserver(checkAdStatus);

  function attachObserver() {
    const player = getPlayer();
    if (player && player !== observedPlayer) {
      observedPlayer = player;
      classObserver.observe(player, {
        attributes: true,
        attributeFilter: ["class"],
      });
      checkAdStatus();
    }
  }

  // YouTube is a single-page app, so watch the whole doc for player re-mounts
  const bodyObserver = new MutationObserver(() => attachObserver());
  bodyObserver.observe(document.body, { childList: true, subtree: true });

  // Fallback poll in case class-change events are missed
  setInterval(checkAdStatus, 100);

  attachObserver();
})();