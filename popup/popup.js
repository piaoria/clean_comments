(function initPopup(document, chrome) {
  const DEFAULT_SETTINGS = Object.freeze({
    showDebugBadges: true,
    moderationMode: "blur",
    customFilterWords: []
  });
  const STATUS_STORAGE_KEY = "cleanCommentsStatus";
  const MODERATION_MODES = new Set(["blur", "blind", "dim"]);
  const WORD_TEMPLATES = Object.freeze({
    harassment: [
      "idiot",
      "stupid",
      "moron",
      "loser",
      "trash",
      "shut up",
      "kill yourself",
      "kys",
      "병신",
      "멍청",
      "꺼져",
      "닥쳐",
      "죽어",
      "극혐"
    ],
    spam: [
      "free giveaway",
      "subscribe to my channel",
      "earn money",
      "work from home",
      "telegram",
      "whatsapp",
      "crypto",
      "airdrop",
      "부업",
      "수익",
      "코인",
      "리딩방",
      "텔레그램",
      "오픈채팅"
    ],
    adult: [
      "18+",
      "adult",
      "nsfw",
      "nude",
      "onlyfans",
      "hot girls",
      "19금",
      "성인",
      "야동",
      "조건만남"
    ]
  });

  const debugToggle = document.getElementById("showDebugBadges");
  const modeInputs = Array.from(document.querySelectorAll('input[name="moderationMode"]'));
  const templateButtons = Array.from(document.querySelectorAll(".template-button"));
  const customFilterWords = document.getElementById("customFilterWords");
  const customWordsHint = document.getElementById("customWordsHint");
  const aiStatus = document.getElementById("aiStatus");
  const classificationStatus = document.getElementById("classificationStatus");
  const fallbackStatus = document.getElementById("fallbackStatus");
  const customStatus = document.getElementById("customStatus");
  const lastStatus = document.getElementById("lastStatus");
  let customWordsSaveTimer = 0;

  async function loadSettings() {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    debugToggle.checked = Boolean(settings.showDebugBadges);
    renderCustomWords(settings.customFilterWords);

    const selectedMode = modeInputs.find((input) => input.value === settings.moderationMode);
    (selectedMode || modeInputs[0]).checked = true;
  }

  async function saveDebugSetting() {
    await chrome.storage.sync.set({
      showDebugBadges: debugToggle.checked
    });
  }

  function parseCustomWords(rawValue) {
    const uniqueWords = new Set();

    String(rawValue || "")
      .split(/\r?\n|,/)
      .map((word) => word.trim())
      .filter((word) => word.length > 0)
      .slice(0, 100)
      .forEach((word) => uniqueWords.add(word.slice(0, 64)));

    return Array.from(uniqueWords);
  }

  function renderCustomWords(words) {
    const normalizedWords = Array.isArray(words) ? words : [];
    customFilterWords.value = normalizedWords.join("\n");
    customWordsHint.textContent = `${normalizedWords.length} saved`;
  }

  async function saveCustomWords() {
    const words = parseCustomWords(customFilterWords.value);
    await chrome.storage.sync.set({
      customFilterWords: words
    });
    customWordsHint.textContent = `${words.length} saved`;
  }

  function scheduleCustomWordsSave() {
    customWordsHint.textContent = "Saving...";
    clearTimeout(customWordsSaveTimer);
    customWordsSaveTimer = setTimeout(() => {
      void saveCustomWords();
    }, 450);
  }

  function addTemplateWords(templateName) {
    const templateWords = WORD_TEMPLATES[templateName] || [];
    const words = new Set(parseCustomWords(customFilterWords.value));

    templateWords.forEach((word) => words.add(word));
    customFilterWords.value = Array.from(words).slice(0, 100).join("\n");
    void saveCustomWords();
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
    const customCount = Number(status.userWordClassifications || 0);
    const harmfulFiltered = Number(status.harmfulFiltered || status.harmfulBlurred || 0);
    const pendingCount = Number(status.pendingClassifications || 0);

    aiStatus.textContent = describeAiStatus(status.classifier);
    classificationStatus.textContent = `${totalProcessed} / AI ${promptApiCount} / filtered ${harmfulFiltered} / checking ${pendingCount}`;
    fallbackStatus.textContent = `${fallbackCount}`;
    customStatus.textContent = `${customCount}`;
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

  customFilterWords.addEventListener("input", scheduleCustomWordsSave);

  templateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      addTemplateWords(button.dataset.template);
    });
  });

  void loadSettings();
  void loadStatus();
  observeStatus();
})(document, chrome);
