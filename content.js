(function () {
  // Flip to true in the console (window.__nowaittubeDebug = true) or here
  // to see what the skip-button finder is doing on each poll cycle.
  const DEBUG = true; // set to false once you're happy with behavior
  const log = (...args) => DEBUG && console.log("[NoWaitTube]", ...args);

  const api = typeof browser !== "undefined" ? browser : chrome;

  // On Chrome, the background worker can escalate to a trusted click via
  // the debugger API. Firefox has no equivalent, so we ask up front
  // whether that path exists at all -- if not, we lean harder on rapid
  // untrusted-click retries instead of expecting a trusted click to
  // eventually land.
  let hasDebugger = false;
  try {
    api.runtime.sendMessage({ type: "nowaittube:capabilities" }, (resp) => {
      hasDebugger = Boolean(resp?.hasDebugger);
      log("capabilities:", { hasDebugger });
    });
  } catch (e) {
    log("could not query capabilities, assuming no debugger", e);
  }

  try {
    api.runtime.sendMessage({ type: "nowaittube:prime-debugger" });
  } catch (e) {
    log("could not prime debugger", e);
  }

  let adActive = false;
  let lastSkipAttempt = 0;
  let settings = { enabled: true, speed: 16 };

  api.storage.sync.get(settings, (stored) => {
    settings = stored;
  });
  api.storage.onChanged.addListener((changes) => {
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
    const events = [
      ["pointerdown", window.PointerEvent, PointerEvent],
      ["mousedown", true, MouseEvent],
      ["pointerup", window.PointerEvent, PointerEvent],
      ["mouseup", true, MouseEvent],
      ["click", true, MouseEvent],
    ];
    for (const [type, supported, Ctor] of events) {
      if (!supported) continue;
      try {
        el.dispatchEvent(new Ctor(type, opts));
      } catch (e) {
        log("fireClick failed for", type, e);
      }
    }
    try {
      el.click();
    } catch (e) {
      log("native .click() failed", e);
    }
  }

  const SKIP_SELECTORS =
    ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button, button.ytp-ad-skip-button-slot";

  function findSkipButton(root) {
    if (!root) return null;

    const direct = root.querySelector(SKIP_SELECTORS);
    if (direct) {
      log("found skip button via direct selector", direct);
      return direct;
    }

    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node.querySelectorAll) continue;
      const found = node.querySelector(SKIP_SELECTORS);
      if (found) {
        log("found skip button inside shadow root", found);
        return found;
      }
      for (const el of node.querySelectorAll("*")) {
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }

    const candidates = root.querySelectorAll('button, [role="button"]');
    for (const el of candidates) {
      const label = (
        el.getAttribute("aria-label") ||
        el.textContent ||
        ""
      ).toLowerCase();
      if (label.includes("skip")) {
        log("found skip button via text fallback", el);
        return el;
      }
    }

    log("no skip button found this cycle");
    return null;
  }

  let firstSeenSkipButton = null;
  let retryTimer = null;

  function requestTrustedClick(el) {
    if (!hasDebugger) return; // don't bother asking on Firefox
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    log("requesting trusted click at", x, y);
    try {
      api.runtime.sendMessage(
        { type: "nowaittube:trusted-click", x, y },
        (resp) => log("trusted click response", resp)
      );
    } catch (e) {
      log("could not reach background for trusted click", e);
    }
  }

  // On browsers without a trusted-click path (Firefox), a single
  // untrusted click may not register with YouTube's control. Rather than
  // one-and-done, burst a handful of retries in quick succession -- cheap,
  // and it's our only lever there.
  function burstUntrustedClicks(el, attempts = 6, intervalMs = 40) {
    let count = 0;
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = setInterval(() => {
      // Stop early if the button's gone (skip succeeded or ad ended).
      if (!document.contains(el) || count >= attempts) {
        clearInterval(retryTimer);
        retryTimer = null;
        return;
      }
      fireClick(el);
      count += 1;
    }, intervalMs);
  }

  function trySkip() {
    const now = Date.now();
    const player = getPlayer();
    const skipBtn = findSkipButton(player || document);

    if (!skipBtn) {
      firstSeenSkipButton = null;
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
      return;
    }

    const isNewButton = skipBtn !== firstSeenSkipButton;
    if (isNewButton) {
      firstSeenSkipButton = skipBtn;
      lastSkipAttempt = now;
      log("new skip button seen, firing click path(s) immediately", {
        hasDebugger,
      });
      fireClick(skipBtn);
      if (hasDebugger) {
        requestTrustedClick(skipBtn);
      } else {
        burstUntrustedClicks(skipBtn);
      }
      return;
    }

    if (now - lastSkipAttempt >= 60) {
      lastSkipAttempt = now;
      fireClick(skipBtn);
      if (hasDebugger) requestTrustedClick(skipBtn);
    }
  }

  function applyAdState(isAd) {
    const video = getVideo();
    if (!video || !settings.enabled) return;

    if (isAd) {
      adActive = true;
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

      // Ensure the video resumes playing after the ad is skipped
      if (video.paused) {
        video.play().catch((e) => {
          log("failed to resume video playback after ad", e);
        });
      }
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

  // Instant reaction: observe the player's class attribute directly.
  // YouTube toggles "ad-showing"/"ad-interrupting" synchronously when an
  // ad starts, so this fires on the same tick instead of waiting for a
  // poll interval to come around. Works identically in Chrome and
  // Firefox -- MutationObserver is a standard DOM API, not a
  // browser-specific extension API.
  let observedPlayer = null;
  function ensureObserver() {
    const player = getPlayer();
    if (!player || player === observedPlayer) return;
    observedPlayer = player;
    const obs = new MutationObserver(() => checkAdStatus());
    obs.observe(player, { attributes: true, attributeFilter: ["class"] });
    log("attached class observer to player");
  }

  // Cheap safety-net poll in case the observer ever misses a transition.
  setInterval(() => {
    ensureObserver();
    checkAdStatus();
  }, 50);

  ensureObserver();
  checkAdStatus();
})();