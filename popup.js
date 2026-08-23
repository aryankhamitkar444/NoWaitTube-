const enabledBox = document.getElementById("enabled");
const speedSelect = document.getElementById("speed");

chrome.storage.sync.get({ enabled: true, speed: 16 }, (stored) => {
  enabledBox.checked = stored.enabled;
  speedSelect.value = String(stored.speed);
});

enabledBox.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledBox.checked });
});

speedSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ speed: Number(speedSelect.value) });
});
