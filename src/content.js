(function runContentScript(global, document) {
  const { LABELS, HARMFUL_LABELS, classifyByRules } = global.CleanCommentsRules;
  const { classifyCommentsBatch, getClassifierStatus } = global.CleanCommentsClassifier;
  const log = global.CleanCommentsLog
    ? global.CleanCommentsLog.scope("content")
    : { debug() {}, info() {}, warn() {}, error() {} };

  const COMMENT_SELECTOR = "ytd-comment-renderer, ytd-comment-view-model";
  const TEXT_SELECTOR = "#content-text";
  const PROCESSED_ATTR = "data-clean-comments-processed";
  const LABEL_ATTR = "data-clean-comments-label";
  const SOURCE_ATTR = "data-clean-comments-source";
  const CONFIDENCE_ATTR = "data-clean-comments-confidence";
  const REASON_ATTR = "data-clean-comments-reason";
  const TYPE_ATTR = "data-clean-comments-type";
  const TEXT_RETRY_ATTR = "data-clean-comments-text-retries";
  const DEBUG_CLASS = "clean-comments-debug";
  const PENDING_CLASS = "clean-comments-pending";
  const PENDING_INDICATOR_CLASS = "clean-comments-pending-indicator";
  const STATUS_STORAGE_KEY = "cleanCommentsStatus";
  const STATUS_WRITE_DELAY_MS = 350;
  const TEXT_RETRY_DELAY_MS = 600;
  const MAX_TEXT_RETRIES = 5;
  const IMMEDIATE_RULE_CONFIDENCE = 0.85;
  const AI_BATCH_SIZE = 50;
  // AI-only mode: when false, local rule patterns never pre-filter comments
  // before the Prompt API sees them. Every comment (except explicit user words)
  // is judged by the AI. Flip back to true to restore the immediate rule pass.
  const RULE_PREFILTER_ENABLED = false;
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
    verboseLogging: false,
    moderationMode: "blur",
    customFilterWords: [],
    labelSettings: DEFAULT_LABEL_SETTINGS
  });
  const MODERATION_MODE_CLASSES = [
    "clean-comments-mode-blur",
    "clean-comments-mode-blind",
    "clean-comments-mode-dim"
  ];
  const MODERATION_MODES = new Set(["blur", "blind", "dim"]);

  const queue = [];
  const queuedComments = new WeakSet();
  function createLabelCounts() {
    return Object.values(LABELS).reduce((counts, label) => {
      counts[label] = 0;
      return counts;
    }, {});
  }

  const status = {
    totalProcessed: 0,
    promptApiClassifications: 0,
    ruleFallbackClassifications: 0,
    userWordClassifications: 0,
    pendingClassifications: 0,
    harmfulFiltered: 0,
    safeComments: 0,
    labels: createLabelCounts(),
    filteredLabels: createLabelCounts(),
    seenComments: 0,
    retryCount: 0,
    queueLength: 0,
    isProcessing: false,
    currentBatchSize: 0,
    batchesProcessed: 0,
    lastBatchSize: 0,
    lastBatchDurationMs: 0,
    lastBatchStartedAt: "",
    lastBatchCompletedAt: "",
    lastScanAt: "",
    lastEnqueuedAt: "",
    lastLabel: "none",
    lastSource: "none",
    lastReason: "",
    lastUpdatedAt: "",
    classifier: {}
  };
  let settings = { ...DEFAULT_SETTINGS };
  let isProcessing = false;
  let statusWriteTimer = 0;

  function getCommentText(commentNode) {
    const textNode = commentNode.querySelector(TEXT_SELECTOR);
    return textNode ? textNode.textContent.trim() : "";
  }

  function formatConfidence(confidence) {
    return `${Math.round(Number(confidence || 0) * 100)}%`;
  }

  function upsertDebugBadge(commentNode, result) {
    const existingBadge = commentNode.querySelector(`:scope > .${DEBUG_CLASS}`);
    const badge = existingBadge || document.createElement("div");

    badge.className = DEBUG_CLASS;
    badge.textContent = `${result.label} | ${result.type || result.source} | ${result.source} | ${formatConfidence(result.confidence)} | ${result.reason}`;

    if (!existingBadge) {
      commentNode.append(badge);
    }
  }

  function upsertPendingIndicator(commentNode) {
    const existingIndicator = commentNode.querySelector(`:scope > .${PENDING_INDICATOR_CLASS}`);
    if (existingIndicator) {
      return;
    }

    const indicator = document.createElement("div");
    indicator.className = PENDING_INDICATOR_CLASS;
    indicator.textContent = "checking";
    commentNode.append(indicator);
  }

  function removeDebugBadge(commentNode) {
    commentNode.querySelector(`:scope > .${DEBUG_CLASS}`)?.remove();
  }

  function removePendingIndicator(commentNode) {
    commentNode.classList.remove(PENDING_CLASS);
    commentNode.querySelector(`:scope > .${PENDING_INDICATOR_CLASS}`)?.remove();
  }

  function getStoredResult(commentNode) {
    return {
      label: commentNode.getAttribute(LABEL_ATTR) || "safe",
      source: commentNode.getAttribute(SOURCE_ATTR) || "unknown",
      confidence: Number(commentNode.getAttribute(CONFIDENCE_ATTR) || 0),
      reason: commentNode.getAttribute(REASON_ATTR) || "no reason stored",
      type: commentNode.getAttribute(TYPE_ATTR) || "unknown"
    };
  }

  function syncDebugBadges() {
    document.querySelectorAll(`${COMMENT_SELECTOR}.clean-comments-hidden`).forEach((commentNode) => {
      if (settings.showDebugBadges) {
        upsertDebugBadge(commentNode, getStoredResult(commentNode));
      } else {
        removeDebugBadge(commentNode);
      }
    });
  }

  function applyModerationMode(commentNode, result) {
    commentNode.classList.remove(...MODERATION_MODE_CLASSES);
    commentNode.classList.add(`clean-comments-mode-${getResultMode(result)}`);
  }

  function getModerationMode(mode) {
    const normalizedMode = String(mode || "");
    return MODERATION_MODES.has(normalizedMode) ? normalizedMode : DEFAULT_SETTINGS.moderationMode;
  }

  function createDefaultLabelSettings(mode) {
    const normalizedMode = getModerationMode(mode);
    const labelSettings = {};

    Object.keys(DEFAULT_LABEL_SETTINGS).forEach((label) => {
      labelSettings[label] = {
        enabled: true,
        mode: normalizedMode
      };
    });

    return labelSettings;
  }

  function normalizeLabelSettings(labelSettings) {
    const normalizedSettings = {};

    Object.entries(DEFAULT_LABEL_SETTINGS).forEach(([label, defaults]) => {
      const current = labelSettings && typeof labelSettings === "object" ? labelSettings[label] : null;
      normalizedSettings[label] = {
        enabled: current?.enabled !== false,
        mode: getModerationMode(current?.mode || defaults.mode)
      };
    });

    return normalizedSettings;
  }

  function getLabelSetting(label) {
    return settings.labelSettings[label] || {
      enabled: true,
      mode: getModerationMode(settings.moderationMode)
    };
  }

  function shouldFilterLabel(label) {
    return HARMFUL_LABELS.has(label) && getLabelSetting(label).enabled !== false;
  }

  function getResultMode(result) {
    const labelSetting = getLabelSetting(result.label);
    return getModerationMode(labelSetting.mode || settings.moderationMode);
  }

  function syncModerationMode() {
    document.querySelectorAll(`${COMMENT_SELECTOR}.clean-comments-hidden`).forEach((commentNode) => {
      applyModerationMode(commentNode, getStoredResult(commentNode));
    });
  }

  function applyResult(commentNode, result) {
    removePendingIndicator(commentNode);
    commentNode.setAttribute(PROCESSED_ATTR, "true");
    commentNode.setAttribute(LABEL_ATTR, result.label);
    commentNode.setAttribute(SOURCE_ATTR, result.source);
    commentNode.setAttribute(CONFIDENCE_ATTR, String(result.confidence));
    commentNode.setAttribute(REASON_ATTR, result.reason);
    commentNode.setAttribute(TYPE_ATTR, result.type || result.source);

    if (shouldFilterLabel(result.label)) {
      commentNode.classList.add("clean-comments-hidden");
      applyModerationMode(commentNode, result);
      commentNode.title = `clean_comments: ${result.label} (${result.source})`;

      if (settings.showDebugBadges) {
        upsertDebugBadge(commentNode, result);
      }

      log.info(
        `FILTERED [${result.label}] via ${result.source} (${formatConfidence(result.confidence)}): "${getCommentText(commentNode).slice(0, 80)}" — ${result.reason}`
      );
    } else {
      log.debug(
        `kept [${result.label}] via ${result.source}: "${getCommentText(commentNode).slice(0, 80)}"`
      );
    }
  }

  function markPending(commentNode) {
    if (commentNode.classList.contains(PENDING_CLASS)) {
      return;
    }

    commentNode.classList.add(PENDING_CLASS);
    upsertPendingIndicator(commentNode);
    status.pendingClassifications += 1;
    scheduleStatusWrite();
  }

  function scheduleStatusWrite() {
    if (!global.chrome?.storage?.local) {
      return;
    }

    status.queueLength = queue.length;
    status.isProcessing = isProcessing;
    global.clearTimeout(statusWriteTimer);
    statusWriteTimer = global.setTimeout(() => {
      void chrome.storage.local.set({
        [STATUS_STORAGE_KEY]: { ...status }
      });
    }, STATUS_WRITE_DELAY_MS);
  }

  function recordResult(result) {
    status.totalProcessed += 1;
    status.pendingClassifications = Math.max(0, status.pendingClassifications - 1);
    status.lastLabel = result.label;
    status.lastSource = result.source;
    status.lastReason = result.reason;
    status.lastUpdatedAt = new Date().toISOString();
    status.classifier = getClassifierStatus();
    status.labels[result.label] = Number(status.labels[result.label] || 0) + 1;

    if (result.source === "prompt_api") {
      status.promptApiClassifications += 1;
    } else if (result.source === "user_settings") {
      status.userWordClassifications += 1;
    } else {
      status.ruleFallbackClassifications += 1;
    }

    if (shouldFilterLabel(result.label)) {
      status.harmfulFiltered += 1;
      status.filteredLabels[result.label] = Number(status.filteredLabels[result.label] || 0) + 1;
    } else {
      status.safeComments += 1;
    }

    scheduleStatusWrite();
  }

  function shouldApplyRuleImmediately(result) {
    return shouldFilterLabel(result.label) && result.confidence >= IMMEDIATE_RULE_CONFIDENCE;
  }

  function normalizeCustomWords(words) {
    if (!Array.isArray(words)) {
      return [];
    }

    return words
      .map((word) => String(word || "").trim())
      .filter((word) => word.length > 0)
      .slice(0, 100);
  }

  function classifyByUserWords(text) {
    const normalizedText = String(text || "").toLowerCase();
    const matchedWord = settings.customFilterWords.find((word) => {
      return normalizedText.includes(word.toLowerCase());
    });

    if (!matchedWord) {
      return null;
    }

    return {
      label: "user_word",
      confidence: 1,
      source: "user_settings",
      type: "custom_word",
      reason: `matched custom word: ${matchedWord.slice(0, 64)}`
    };
  }

  function takeNextAiBatch() {
    const batch = [];

    while (queue.length > 0 && batch.length < AI_BATCH_SIZE) {
      const commentNode = queue.shift();
      queuedComments.delete(commentNode);

      if (!commentNode.isConnected || commentNode.hasAttribute(PROCESSED_ATTR)) {
        continue;
      }

      const text = getCommentText(commentNode);
      if (!text) {
        retryWhenTextIsReady(commentNode);
        continue;
      }

      const userWordResult = classifyByUserWords(text);
      if (userWordResult && shouldFilterLabel(userWordResult.label)) {
        applyResult(commentNode, userWordResult);
        recordResult(userWordResult);
        continue;
      }

      if (RULE_PREFILTER_ENABLED) {
        const quickRuleResult = classifyByRules(text);
        if (shouldApplyRuleImmediately(quickRuleResult)) {
          applyResult(commentNode, quickRuleResult);
          recordResult(quickRuleResult);
          continue;
        }
      }

      markPending(commentNode);
      batch.push({
        commentNode,
        text
      });
    }

    return batch;
  }

  function applyBatchResults(batch, results) {
    results.forEach((result, index) => {
      const { commentNode } = batch[index];

      if (!commentNode?.isConnected || commentNode.hasAttribute(PROCESSED_ATTR)) {
        status.pendingClassifications = Math.max(0, status.pendingClassifications - 1);
        return;
      }

      applyResult(commentNode, result);
      recordResult(result);
    });

    scheduleStatusWrite();
  }

  async function processQueue() {
    if (isProcessing) {
      return;
    }

    isProcessing = true;
    scheduleStatusWrite();

    try {
      while (queue.length > 0) {
        const batch = takeNextAiBatch();

        if (batch.length === 0) {
          continue;
        }

        const startedAt = Date.now();
        status.currentBatchSize = batch.length;
        status.lastBatchSize = batch.length;
        status.lastBatchStartedAt = new Date(startedAt).toISOString();
        scheduleStatusWrite();

        log.info(`Processing batch of ${batch.length} comment(s) (queue: ${queue.length} remaining)`);
        log.debug("Batch comment texts", batch.map((item) => item.text));
        const results = await classifyCommentsBatch(batch.map((item) => item.text));
        applyBatchResults(batch, results);
        status.batchesProcessed += 1;
        status.currentBatchSize = 0;
        status.lastBatchCompletedAt = new Date().toISOString();
        status.lastBatchDurationMs = Date.now() - startedAt;
        log.info(`Batch #${status.batchesProcessed} done in ${status.lastBatchDurationMs}ms — filtered ${status.harmfulFiltered} total / ${status.totalProcessed} processed`);
        scheduleStatusWrite();
      }
    } finally {
      isProcessing = false;
      status.currentBatchSize = 0;
      scheduleStatusWrite();
    }
  }

  function enqueueComment(commentNode) {
    if (!commentNode || commentNode.hasAttribute(PROCESSED_ATTR) || queuedComments.has(commentNode)) {
      return;
    }

    queuedComments.add(commentNode);
    queue.push(commentNode);
    status.seenComments += 1;
    status.lastEnqueuedAt = new Date().toISOString();
    scheduleStatusWrite();
    void processQueue();
  }

  function retryWhenTextIsReady(commentNode) {
    const retries = Number(commentNode.getAttribute(TEXT_RETRY_ATTR) || 0);
    if (retries >= MAX_TEXT_RETRIES) {
      return;
    }

    commentNode.setAttribute(TEXT_RETRY_ATTR, String(retries + 1));
    status.retryCount += 1;
    scheduleStatusWrite();
    global.setTimeout(() => enqueueComment(commentNode), TEXT_RETRY_DELAY_MS);
  }

  function scanComments(root = document) {
    status.lastScanAt = new Date().toISOString();
    scheduleStatusWrite();
    root.querySelectorAll(COMMENT_SELECTOR).forEach(enqueueComment);
  }

  function resetCommentForRecheck(commentNode) {
    commentNode.removeAttribute(PROCESSED_ATTR);
    commentNode.removeAttribute(LABEL_ATTR);
    commentNode.removeAttribute(SOURCE_ATTR);
    commentNode.removeAttribute(CONFIDENCE_ATTR);
    commentNode.removeAttribute(REASON_ATTR);
    commentNode.removeAttribute(TYPE_ATTR);
    commentNode.classList.remove("clean-comments-hidden", ...MODERATION_MODE_CLASSES);
    removeDebugBadge(commentNode);
    removePendingIndicator(commentNode);
    enqueueComment(commentNode);
  }

  function recheckVisibleComments() {
    document.querySelectorAll(COMMENT_SELECTOR).forEach(resetCommentForRecheck);
  }

  function observeComments() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (node.matches(COMMENT_SELECTOR)) {
            enqueueComment(node);
          } else {
            scanComments(node);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  async function loadSettings() {
    if (!global.chrome?.storage?.sync) {
      return;
    }

    const storedSettings = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
    const moderationMode = getModerationMode(storedSettings.moderationMode);

    settings = {
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      moderationMode
    };
    settings.customFilterWords = normalizeCustomWords(settings.customFilterWords);
    settings.labelSettings = normalizeLabelSettings(
      storedSettings.labelSettings || createDefaultLabelSettings(moderationMode)
    );
    global.CleanCommentsLog?.setVerbose(Boolean(settings.verboseLogging));
  }

  function observeSettings() {
    if (!global.chrome?.storage?.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      if (changes.showDebugBadges) {
        settings.showDebugBadges = Boolean(changes.showDebugBadges.newValue);
        syncDebugBadges();
      }

      if (changes.verboseLogging) {
        settings.verboseLogging = Boolean(changes.verboseLogging.newValue);
        global.CleanCommentsLog?.setVerbose(settings.verboseLogging);
        log.info(`Verbose logging ${settings.verboseLogging ? "enabled" : "disabled"}`);
      }

      if (changes.moderationMode) {
        settings.moderationMode = getModerationMode(changes.moderationMode.newValue);
        syncModerationMode();
      }

      if (changes.labelSettings) {
        settings.labelSettings = normalizeLabelSettings(changes.labelSettings.newValue);
        recheckVisibleComments();
      }

      if (changes.customFilterWords) {
        settings.customFilterWords = normalizeCustomWords(changes.customFilterWords.newValue);
        recheckVisibleComments();
      }
    });
  }

  function initializeStatus() {
    status.classifier = getClassifierStatus();
    status.lastUpdatedAt = new Date().toISOString();
    scheduleStatusWrite();
  }

  async function init() {
    log.info(`Initializing — AI-only mode (rule prefilter ${RULE_PREFILTER_ENABLED ? "ON" : "OFF"}, batch size ${AI_BATCH_SIZE})`);
    await loadSettings();
    log.info("Settings loaded", {
      moderationMode: settings.moderationMode,
      showDebugBadges: settings.showDebugBadges,
      customFilterWords: settings.customFilterWords.length,
      enabledLabels: Object.entries(settings.labelSettings)
        .filter(([, value]) => value.enabled !== false)
        .map(([label]) => label)
    });
    observeSettings();
    initializeStatus();
    scanComments();
    observeComments();
    log.info("Observers attached; watching for comments");
  }

  void init();
})(globalThis, document);
