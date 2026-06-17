(function initPopup(document, chrome) {
  const DEFAULT_SETTINGS = Object.freeze({
    showDebugBadges: true
  });

  const debugToggle = document.getElementById("showDebugBadges");

  async function loadSettings() {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    debugToggle.checked = Boolean(settings.showDebugBadges);
  }

  async function saveDebugSetting() {
    await chrome.storage.sync.set({
      showDebugBadges: debugToggle.checked
    });
  }

  debugToggle.addEventListener("change", () => {
    void saveDebugSetting();
  });

  void loadSettings();
})(document, chrome);
