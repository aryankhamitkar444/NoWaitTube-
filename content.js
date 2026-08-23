(function () {
  let adActive = false;
  let lastSkipAttempt = 0;
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
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  function trySkip() {
    // Cooldown: don't re-dispatch click events every single poll cycle.
    // Repeated synthetic clicks can trigger UI reactions (hover/press
    // states) that themselves count as DOM changes, which previously
    // fed back into re-triggering our own detection -- a runaway loop
    // that pegged the CPU and froze the tab. Once every 500ms is plenty.
    const now = Date.now();
    if (now - lastSkipAttempt < 500) return;

    const skipBtn = document.querySelector(
      ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button, button.ytp-ad-skip-button-slot"
    );
    if (
      skipBtn &&
      !skipBtn.disabled &&
      skipBtn.getAttribute("aria-disabled") !== "true"
    ) {
      lastSkipAttempt = now;
      fireClick(skipBtn);
    }
  }

  function applyAdState(isAd) {
    const video = getVideo();
    if (!video || !settings.enabled) return;

    if (isAd) {
      adActive = true;
      // This is the actual skip: jump the ad's own video straight to its
      // end. Clicking YouTube's skip button is unreliable for a synthetic
      // (script-triggered) click, so we don't rely on it as the primary
      // mechanism -- this direct seek is what actually gets rid of the ad.
      if (isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration;
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

  function hasAdContent() {
    const adModule = document.querySelector(".video-ads.ytp-ad-module");
    return Boolean(adModule && adModule.children.length > 0);
  }

  function checkAdStatus() {
    const player = getPlayer();
    if (!player) return;
    const classSignalsAd =
      player.classList.contains("ad-showing") ||
      player.classList.contains("ad-interrupting");
    const isAd = classSignalsAd && hasAdContent();
    applyAdState(isAd);

    const video = getVideo();
    if (video && !video.dataset.nowaittubeBound) {
      video.dataset.nowaittubeBound = "true";
      video.addEventListener("loadstart", () => {
        adActive = false;
      });
    }
  }

  // A single, lightweight, fixed-interval poll -- no whole-document
  // MutationObserver. YouTube's DOM changes constantly (chat, comments,
  // recommendations, ad animations); observing all of document.body for
  // any change was expensive and, combined with our own synthetic click
  // dispatches, could create a self-triggering loop. A plain interval is
  // predictable, bounded, and can't spiral.
  setInterval(checkAdStatus, 300);
  checkAdStatus();
})();