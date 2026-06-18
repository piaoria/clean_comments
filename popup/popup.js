(function initPopup(document, chrome) {
  const LABELS = Object.freeze([
    {
      id: "spam",
      name: "스팸",
      description: "홍보, 이벤트, 반복 유도 댓글"
    },
    {
      id: "adult_bait",
      name: "성인 유도",
      description: "성인물, 만남, 선정적 유도 댓글"
    },
    {
      id: "link_bait",
      name: "링크 유도",
      description: "의심 링크, 프로필 이동 유도"
    },
    {
      id: "meaningless",
      name: "무의미",
      description: "비어 있거나 짧고 반복적인 댓글"
    },
    {
      id: "harassment",
      name: "괴롭힘",
      description: "욕설, 위협, 특정 대상 비난"
    },
    {
      id: "user_word",
      name: "사용자 단어",
      description: "직접 저장한 단어와 문구"
    }
  ]);
  const DEFAULT_LABEL_SETTINGS = Object.freeze({
    spam: { enabled: true, mode: "blur" },
    adult_bait: { enabled: true, mode: "blur" },
    link_bait: { enabled: true, mode: "blur" },
    meaningless: { enabled: true, mode: "blur" },
    harassment: { enabled: true, mode: "blur" },
    user_word: { enabled: true, mode: "blur" }
  });
  const DEFAULT_SETTINGS = Object.freeze({
    showDebugBadges: true,
    moderationMode: "blur",
    customFilterWords: [],
    labelSettings: DEFAULT_LABEL_SETTINGS
  });
  const STATUS_STORAGE_KEY = "cleanCommentsStatus";
  const MODERATION_MODES = new Set(["blur", "blind", "dim"]);
  const MODE_LABELS = Object.freeze({
    blur: "흐림",
    blind: "가림",
    dim: "약화"
  });
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
      "\uBCD1\uC2E0",
      "\uBA4D\uCCAD",
      "\uAEBC\uC838",
      "\uB2E5\uCCD0",
      "\uC8FD\uC5B4",
      "\uADF9\uD610"
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
      "\uBB34\uB8CC",
      "\uC774\uBCA4\uD2B8",
      "\uBD80\uC5C5",
      "\uC218\uC775",
      "\uCF54\uC778",
      "\uC624\uD508\uCC44\uD305"
    ],
    adult: [
      "18+",
      "adult",
      "nsfw",
      "nude",
      "onlyfans",
      "hot girls",
      "19\uAE08",
      "\uC131\uC778",
      "\uC57C\uB3D9",
      "\uC870\uAC74\uB9CC\uB0A8"
    ]
  });

  const debugToggle = document.getElementById("showDebugBadges");
  const modeInputs = Array.from(document.querySelectorAll('input[name="moderationMode"]'));
  const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
  const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
  const labelSettings = document.getElementById("labelSettings");
  const templateButtons = Array.from(document.querySelectorAll(".template-button"));
  const customFilterWords = document.getElementById("customFilterWords");
  const customWordsHint = document.getElementById("customWordsHint");
  const aiStatus = document.getElementById("aiStatus");
  const classificationStatus = document.getElementById("classificationStatus");
  const fallbackStatus = document.getElementById("fallbackStatus");
  const customStatus = document.getElementById("customStatus");
  const lastStatus = document.getElementById("lastStatus");
  let customWordsSaveTimer = 0;
  let currentSettings = { ...DEFAULT_SETTINGS };

  function getModerationMode(mode) {
    return MODERATION_MODES.has(String(mode || "")) ? String(mode) : DEFAULT_SETTINGS.moderationMode;
  }

  function createDefaultLabelSettings(mode) {
    const normalizedMode = getModerationMode(mode);
    const settings = {};

    LABELS.forEach((label) => {
      settings[label.id] = {
        enabled: true,
        mode: normalizedMode
      };
    });

    return settings;
  }

  function normalizeLabelSettings(settings) {
    const normalizedSettings = {};

    LABELS.forEach((label) => {
      const defaults = DEFAULT_LABEL_SETTINGS[label.id];
      const current = settings && typeof settings === "object" ? settings[label.id] : null;
      normalizedSettings[label.id] = {
        enabled: current?.enabled !== false,
        mode: getModerationMode(current?.mode || defaults.mode)
      };
    });

    return normalizedSettings;
  }

  async function loadSettings() {
    const settings = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
    const moderationMode = getModerationMode(settings.moderationMode);
    currentSettings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      moderationMode,
      labelSettings: normalizeLabelSettings(settings.labelSettings || createDefaultLabelSettings(moderationMode))
    };

    debugToggle.checked = Boolean(currentSettings.showDebugBadges);
    renderCustomWords(currentSettings.customFilterWords);
    renderLabelSettings(currentSettings.labelSettings);

    const selectedMode = modeInputs.find((input) => input.value === getModerationMode(currentSettings.moderationMode));
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
    customWordsHint.textContent = `${normalizedWords.length}개 저장됨`;
  }

  function renderLabelSettings(settings) {
    labelSettings.replaceChildren();

    LABELS.forEach((label) => {
      const labelSetting = settings[label.id] || DEFAULT_LABEL_SETTINGS[label.id];
      const row = document.createElement("label");
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      const description = document.createElement("small");
      const mode = document.createElement("select");
      const toggle = document.createElement("input");

      row.className = "label-row";
      title.textContent = label.name;
      description.textContent = label.description;
      copy.append(title, description);

      mode.className = "label-mode";
      mode.dataset.label = label.id;
      mode.setAttribute("aria-label", `${label.name} 표시 방식`);
      ["blur", "blind", "dim"].forEach((modeName) => {
        const option = document.createElement("option");
        option.value = modeName;
        option.textContent = MODE_LABELS[modeName];
        mode.append(option);
      });
      mode.value = getModerationMode(labelSetting.mode);

      toggle.type = "checkbox";
      toggle.role = "switch";
      toggle.dataset.label = label.id;
      toggle.checked = labelSetting.enabled !== false;
      toggle.setAttribute("aria-label", `${label.name} 필터링`);

      row.append(copy, mode, toggle);
      labelSettings.append(row);
    });
  }

  async function saveCustomWords() {
    const words = parseCustomWords(customFilterWords.value);
    await chrome.storage.sync.set({
      customFilterWords: words
    });
    customWordsHint.textContent = `${words.length}개 저장됨`;
  }

  function scheduleCustomWordsSave() {
    customWordsHint.textContent = "저장 중...";
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
    currentSettings.moderationMode = event.currentTarget.value;
  }

  async function saveLabelSetting(labelId, patch) {
    if (!DEFAULT_LABEL_SETTINGS[labelId]) {
      return;
    }

    const nextSettings = normalizeLabelSettings({
      ...currentSettings.labelSettings,
      [labelId]: {
        ...currentSettings.labelSettings[labelId],
        ...patch
      }
    });
    currentSettings.labelSettings = nextSettings;
    await chrome.storage.sync.set({
      labelSettings: nextSettings
    });
  }

  function selectTab(tabName) {
    tabButtons.forEach((button) => {
      const isSelected = button.dataset.tab === tabName;
      button.setAttribute("aria-selected", String(isSelected));
    });

    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tabName;
    });
  }

  function describeAiStatus(classifier = {}) {
    if (!classifier.promptApiDetected) {
      return "Prompt API 없음";
    }

    if (classifier.promptApiSessionReady) {
      return `Prompt API 준비됨 (${classifier.promptApiAvailability})`;
    }

    return `Prompt API 대기 중 (${classifier.promptApiAvailability || "unknown"})`;
  }

  function renderStatus(status = {}) {
    const totalProcessed = Number(status.totalProcessed || 0);
    const promptApiCount = Number(status.promptApiClassifications || 0);
    const fallbackCount = Number(status.ruleFallbackClassifications || 0);
    const customCount = Number(status.userWordClassifications || 0);
    const harmfulFiltered = Number(status.harmfulFiltered || status.harmfulBlurred || 0);
    const pendingCount = Number(status.pendingClassifications || 0);

    aiStatus.textContent = describeAiStatus(status.classifier);
    classificationStatus.textContent = `${totalProcessed} / AI ${promptApiCount} / 필터 ${harmfulFiltered} / 확인 중 ${pendingCount}`;
    fallbackStatus.textContent = `${fallbackCount}`;
    customStatus.textContent = `${customCount}`;
    lastStatus.textContent = status.lastLabel && status.lastLabel !== "none"
      ? `${status.lastLabel} (${status.lastSource})`
      : "없음";
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

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectTab(button.dataset.tab);
    });
  });

  modeInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
      void saveModeSetting(event);
    });
  });

  customFilterWords.addEventListener("input", scheduleCustomWordsSave);

  labelSettings.addEventListener("change", (event) => {
    const target = event.target;
    const labelId = target.dataset.label;

    if (!labelId) {
      return;
    }

    if (target.matches('input[type="checkbox"]')) {
      void saveLabelSetting(labelId, { enabled: target.checked });
    }

    if (target.matches("select")) {
      void saveLabelSetting(labelId, { mode: target.value });
    }
  });

  templateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      addTemplateWords(button.dataset.template);
    });
  });

  void loadSettings();
  void loadStatus();
  observeStatus();
})(document, chrome);
