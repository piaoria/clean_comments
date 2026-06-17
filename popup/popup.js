(function initPopup(document, chrome) {
  const DEFAULT_SETTINGS = Object.freeze({
    showDebugBadges: true,
    moderationMode: "blur"
  });
  const STATUS_STORAGE_KEY = "cleanCommentsStatus";
  const MODERATION_MODES = new Set(["blur", "blind", "dim"]);

  const debugToggle = document.getElementById("showDebugBadges");
  const modeInputs = Array.from(document.querySelectorAll('input[name="moderationMode"]'));
  const aiStatus = document.getElementById("aiStatus");
  const classificationStatus = document.getElementById("classificationStatus");
  const fallbackStatus = document.getElementById("fallbackStatus");
  const lastStatus = document.getElementById("lastStatus");

  async function loadSettings() {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    debugToggle.checked = Boolean(settings.showDebugBadges);

    const selectedMode = modeInputs.find((input) => input.value === settings.moderationMode);
    (selectedMode || modeInputs[0]).checked = true;
  }

  async function saveDebugSetting() {
    await chrome.storage.sync.set({
      showDebugBadges: debugToggle.checked
    });
  }

  async function saveModeSetting(event) {
    if (!MODERATION_MODES.has(event.currentTarget.value)) {
      return;
    }

    await chrome.storage.sync.set({
      moderationMode: event.currentTarget.value
    });
  }

  function describeAiStatus(classifier = {}) {
    if (!classifier.promptApiDetected) {
      return "Prompt API missing";
    }

    if (classifier.promptApiSessionReady) {
      return `Prompt API ready (${classifier.promptApiAvailability})`;
    }

    return `Prompt API waiting (${classifier.promptApiAvailability || "unknown"})`;
  }

  function renderStatus(status = {}) {
    const totalProcessed = Number(status.totalProcessed || 0);
    const promptApiCount = Number(status.promptApiClassifications || 0);
    const fallbackCount = Number(status.ruleFallbackClassifications || 0);
    const harmfulFiltered = Number(status.harmfulFiltered || status.harmfulBlurred || 0);
    const pendingCount = Number(status.pendingClassifications || 0);

    aiStatus.textContent = describeAiStatus(status.classifier);
    classificationStatus.textContent = `${totalProcessed} / AI ${promptApiCount} / filtered ${harmfulFiltered} / checking ${pendingCount}`;
    fallbackStatus.textContent = `${fallbackCount}`;
    lastStatus.textContent = status.lastLabel && status.lastLabel !== "none"
      ? `${status.lastLabel} (${status.lastSource})`
      : "None";
  }

  async function loadStatus() {
    const stored = await chrome.storage.local.get(STATUS_STORAGE_KEY);
    renderStatus(stored[STATUS_STORAGE_KEY]);
  }

  function observeStatus() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STATUS_STORAGE_KEY]) {
        return;
      }

      renderStatus(changes[STATUS_STORAGE_KEY].newValue);
    });
  }

  debugToggle.addEventListener("change", () => {
    void saveDebugSetting();
  });

  modeInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
      void saveModeSetting(event);
    });
  });

  void loadSettings();
  void loadStatus();
  observeStatus();
})(document, chrome);
