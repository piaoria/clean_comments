(function initPopup(document, chrome) {
  const TEXT = Object.freeze({
    appSubtitle: "YouTube \uB313\uAE00 \uD544\uD130",
    settingsSections: "\uC124\uC815 \uC139\uC158",
    tabGeneral: "\uAE30\uBCF8",
    tabLabels: "\uB77C\uBCA8",
    tabWords: "\uB2E8\uC5B4",
    tabStatus: "\uC0C1\uD0DC",
    defaultStyle: "\uAE30\uBCF8 \uD544\uD130 \uD45C\uC2DC \uBC29\uC2DD",
    modeBlur: "\uD750\uB9BC",
    modeBlind: "\uAC00\uB9BC",
    modeDim: "\uC57D\uD654",
    debugBadge: "\uB514\uBC84\uADF8 \uBC30\uC9C0",
    debugBadgeDescription: "\uB77C\uBCA8, \uCD9C\uCC98, \uC2E0\uB8B0\uB3C4, \uC774\uC720 \uD45C\uC2DC",
    labelBehavior: "\uB77C\uBCA8\uBCC4 \uB3D9\uC791",
    customWords: "\uC0AC\uC6A9\uC790 \uB2E8\uC5B4",
    customWordsDescription: "\uD55C \uC904\uC5D0 \uB2E8\uC5B4 \uB610\uB294 \uBB38\uAD6C \uD558\uB098\uC529 \uC785\uB825",
    suggestedTemplates: "\uCD94\uCC9C \uB2E8\uC5B4 \uD15C\uD50C\uB9BF",
    templateHarassment: "\uAD34\uB86D\uD798",
    templateSpam: "\uC2A4\uD338 \uC720\uB3C4",
    templateAdult: "\uC131\uC778 \uC720\uB3C4",
    customWordsPlaceholder: "\uCC28\uB2E8\uD560 \uB2E8\uC5B4\n\uCC28\uB2E8\uD560 \uBB38\uAD6C",
    statusDashboard: "\uC0C1\uD0DC \uB300\uC2DC\uBCF4\uB4DC",
    metricTotal: "\uCD1D \uCC98\uB9AC",
    metricSafe: "\uC815\uC0C1",
    metricFiltered: "\uD544\uD130",
    metricPending: "\uD655\uC778 \uC911",
    metricQueue: "\uB300\uAE30\uC5F4",
    metricBatch: "\uBC30\uCE58",
    bySource: "\uCD9C\uCC98\uBCC4",
    byLabel: "\uB77C\uBCA8\uBCC4",
    recent: "\uCD5C\uADFC",
    none: "\uC5C6\uC74C",
    countSaved: "\uAC1C \uC800\uC7A5\uB428",
    saving: "\uC800\uC7A5 \uC911...",
    aiMissing: "AI \uAE30\uB2A5 \uC5C6\uC74C",
    aiReady: "AI \uAE30\uB2A5 \uC900\uBE44\uB428",
    aiWaiting: "AI \uAE30\uB2A5 \uB300\uAE30 \uC911",
    styleAria: "\uD45C\uC2DC \uBC29\uC2DD",
    filteringAria: "\uD544\uD130\uB9C1"
  });

  const LABELS = Object.freeze([
    {
      id: "spam",
      name: "\uC2A4\uD338",
      description: "\uD64D\uBCF4, \uC774\uBCA4\uD2B8, \uBC18\uBCF5 \uC720\uB3C4 \uB313\uAE00"
    },
    {
      id: "adult_bait",
      name: "\uC131\uC778 \uC720\uB3C4",
      description: "\uC131\uC778\uBB3C, \uB9CC\uB0A8, \uC120\uC815\uC801 \uC720\uB3C4 \uB313\uAE00"
    },
    {
      id: "link_bait",
      name: "\uB9C1\uD06C \uC720\uB3C4",
      description: "\uC758\uC2EC \uB9C1\uD06C, \uD504\uB85C\uD544 \uC774\uB3D9 \uC720\uB3C4"
    },
    {
      id: "meaningless",
      name: "\uBB34\uC758\uBBF8",
      description: "\uBE44\uC5B4 \uC788\uAC70\uB098 \uC9E7\uACE0 \uBC18\uBCF5\uC801\uC778 \uB313\uAE00"
    },
    {
      id: "harassment",
      name: "\uAD34\uB86D\uD798",
      description: "\uC695\uC124, \uC704\uD611, \uD2B9\uC815 \uB300\uC0C1 \uBE44\uB09C"
    },
    {
      id: "user_word",
      name: "\uC0AC\uC6A9\uC790 \uB2E8\uC5B4",
      description: "\uC9C1\uC811 \uC800\uC7A5\uD55C \uB2E8\uC5B4\uC640 \uBB38\uAD6C"
    }
  ]);
  const DASHBOARD_LABELS = Object.freeze([
    ...LABELS,
    {
      id: "safe",
      name: "\uC815\uC0C1",
      description: ""
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
    blur: TEXT.modeBlur,
    blind: TEXT.modeBlind,
    dim: TEXT.modeDim
  });
  const SOURCE_LABELS = Object.freeze({
    prompt_api: "AI",
    rules: "\uB85C\uCEEC \uB8F0",
    user_settings: "\uC0AC\uC6A9\uC790 \uC124\uC815"
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
  const totalStatus = document.getElementById("totalStatus");
  const safeStatus = document.getElementById("safeStatus");
  const filteredStatus = document.getElementById("filteredStatus");
  const pendingStatus = document.getElementById("pendingStatus");
  const queueStatus = document.getElementById("queueStatus");
  const batchStatus = document.getElementById("batchStatus");
  const sourceStatus = document.getElementById("sourceStatus");
  const labelStatus = document.getElementById("labelStatus");
  const lastStatus = document.getElementById("lastStatus");
  let customWordsSaveTimer = 0;
  let currentSettings = { ...DEFAULT_SETTINGS };

  function applyStaticText() {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = TEXT[element.dataset.i18n] || "";
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.setAttribute("placeholder", TEXT[element.dataset.i18nPlaceholder] || "");
    });

    document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
      element.setAttribute("aria-label", TEXT[element.dataset.i18nAria] || "");
    });
  }

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
    customWordsHint.textContent = `${normalizedWords.length}${TEXT.countSaved}`;
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
      mode.setAttribute("aria-label", `${label.name} ${TEXT.styleAria}`);
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
      toggle.setAttribute("aria-label", `${label.name} ${TEXT.filteringAria}`);

      row.append(copy, mode, toggle);
      labelSettings.append(row);
    });
  }

  async function saveCustomWords() {
    const words = parseCustomWords(customFilterWords.value);
    await chrome.storage.sync.set({
      customFilterWords: words
    });
    customWordsHint.textContent = `${words.length}${TEXT.countSaved}`;
  }

  function scheduleCustomWordsSave() {
    customWordsHint.textContent = TEXT.saving;
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
      return TEXT.aiMissing;
    }

    if (classifier.promptApiSessionReady) {
      return `${TEXT.aiReady} (${classifier.promptApiAvailability})`;
    }

    return `${TEXT.aiWaiting} (${classifier.promptApiAvailability || "unknown"})`;
  }

  function upsertStatusRows(container, rows) {
    container.replaceChildren();

    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      const name = document.createElement("span");
      const count = document.createElement("strong");

      row.className = "status-row";
      name.textContent = label;
      count.textContent = String(value);
      row.append(name, count);
      container.append(row);
    });
  }

  function renderStatus(status = {}) {
    const totalProcessed = Number(status.totalProcessed || 0);
    const harmfulFiltered = Number(status.harmfulFiltered || status.harmfulBlurred || 0);
    const pendingCount = Number(status.pendingClassifications || 0);
    const queueLength = Number(status.queueLength || 0);
    const batchesProcessed = Number(status.batchesProcessed || 0);
    const currentBatchSize = Number(status.currentBatchSize || 0);

    totalStatus.textContent = String(totalProcessed);
    safeStatus.textContent = String(Number(status.safeComments || 0));
    filteredStatus.textContent = String(harmfulFiltered);
    pendingStatus.textContent = String(pendingCount);
    queueStatus.textContent = String(queueLength);
    batchStatus.textContent = currentBatchSize > 0
      ? `${batchesProcessed} / ${currentBatchSize}`
      : String(batchesProcessed);
    aiStatus.textContent = describeAiStatus(status.classifier);

    upsertStatusRows(sourceStatus, [
      [SOURCE_LABELS.prompt_api, Number(status.promptApiClassifications || 0)],
      [SOURCE_LABELS.rules, Number(status.ruleFallbackClassifications || 0)],
      [SOURCE_LABELS.user_settings, Number(status.userWordClassifications || 0)]
    ]);

    upsertStatusRows(labelStatus, DASHBOARD_LABELS.map((label) => {
      const labelCount = Number(status.labels?.[label.id] || 0);
      const filteredCount = Number(status.filteredLabels?.[label.id] || 0);
      return [
        label.name,
        filteredCount > 0 ? `${labelCount} / ${filteredCount}` : labelCount
      ];
    }));

    lastStatus.textContent = status.lastLabel && status.lastLabel !== "none"
      ? `${status.lastLabel} (${status.lastSource})`
      : TEXT.none;
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

  applyStaticText();

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
