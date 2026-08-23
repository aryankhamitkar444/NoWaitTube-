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

  function trySkip() {
    const skipBtn = document.querySelector(
      ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button"
    );
    if (skipBtn) skipBtn.click();
  }

  function applyAdState(isAd) {
    const video = getVideo();
    if (!video || !settings.enabled) return;

    if (isAd && !adActive) {
      adActive = true;
      video.playbackRate = settings.speed;
      video.muted = true;
    } else if (!isAd && adActive) {
      adActive = false;
      video.playbackRate = 1;
      video.muted = false;
    }

    if (isAd) trySkip();
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
  setInterval(checkAdStatus, 400);

  attachObserver();
})();
