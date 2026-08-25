// Content scripts can only dispatch synthetic events, which always have
// isTrusted === false. YouTube's ad-skip control appears to ignore those
// (a common anti-automation measure). On Chrome, Input.dispatchMouseEvent
// via the DevTools Protocol sends the click through the same input
// pipeline a real mouse click would take, so the page sees it as trusted.
//
// Firefox has no equivalent debugger API a WebExtension can use, so on
// Firefox we can't produce a trusted click at all. Instead of failing
// silently, we detect that up front and let content.js fall back to a
// tighter burst of untrusted clicks, which is the best available option
// there.

const api = typeof browser !== "undefined" ? browser : chrome;
const HAS_DEBUGGER_API = typeof api.debugger !== "undefined";

const DEBUGGER_PROTOCOL_VERSION = "1.3";
const attachedTabs = new Set();

async function ensureAttached(tabId) {
  if (!HAS_DEBUGGER_API) return false;
  if (attachedTabs.has(tabId)) return true;
  try {
    await api.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION);
    attachedTabs.add(tabId);
    return true;
  } catch (err) {
    console.warn("[NoWaitTube:background] attach failed", err);
    return false;
  }
}

async function trustedClick(tabId, x, y) {
  if (!HAS_DEBUGGER_API) return false;
  try {
    const attached = await ensureAttached(tabId);
    if (!attached) return false;
    const target = { tabId };
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    });
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await api.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    return true;
  } catch (err) {
    console.warn("[NoWaitTube:background] trustedClick failed", err);
    return false;
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message?.type === "nowaittube:capabilities") {
    // Let content.js know up front whether it can rely on a trusted
    // click ever arriving, so it can adjust its retry strategy instead
    // of waiting on a response that will never come usefully.
    sendResponse({ hasDebugger: HAS_DEBUGGER_API });
    return;
  }

  if (message?.type === "nowaittube:prime-debugger") {
    if (HAS_DEBUGGER_API && typeof tabId === "number") {
      ensureAttached(tabId).catch((err) =>
        console.warn("[NoWaitTube:background] prime attach failed", err)
      );
    }
    return; // no response needed
  }

  if (message?.type !== "nowaittube:trusted-click") return; // not ours
  if (!HAS_DEBUGGER_API) {
    sendResponse({ ok: false, error: "no debugger API on this browser" });
    return;
  }
  if (typeof tabId !== "number") {
    sendResponse({ ok: false, error: "no sender tab id" });
    return;
  }
  trustedClick(tabId, message.x, message.y).then((ok) => {
    sendResponse({ ok });
  });
  return true; // keep the message channel open for the async sendResponse
});

if (HAS_DEBUGGER_API) {
  api.tabs.onRemoved.addListener((tabId) => {
    attachedTabs.delete(tabId);
  });

  api.debugger.onDetach.addListener((source) => {
    if (typeof source.tabId === "number") {
      attachedTabs.delete(source.tabId);
    }
  });
}
