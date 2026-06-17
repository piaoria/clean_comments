(function runContentScript(global, document) {
  const { HARMFUL_LABELS, classifyByRules } = global.CleanCommentsRules;
  const { classifyComment, getClassifierStatus } = global.CleanCommentsClassifier;

  const COMMENT_SELECTOR = "ytd-comment-thread-renderer";
  const TEXT_SELECTOR = "#content-text";
  const PROCESSED_ATTR = "data-clean-comments-processed";
  const LABEL_ATTR = "data-clean-comments-label";
  const SOURCE_ATTR = "data-clean-comments-source";
  const CONFIDENCE_ATTR = "data-clean-comments-confidence";
  const REASON_ATTR = "data-clean-comments-reason";
  const TEXT_RETRY_ATTR = "data-clean-comments-text-retries";
  const DEBUG_CLASS = "clean-comments-debug";
  const PENDING_CLASS = "clean-comments-pending";
  const PENDING_INDICATOR_CLASS = "clean-comments-pending-indicator";
  const STATUS_STORAGE_KEY = "cleanCommentsStatus";
  const STATUS_WRITE_DELAY_MS = 350;
  const TEXT_RETRY_DELAY_MS = 600;
  const MAX_TEXT_RETRIES = 5;
  const IMMEDIATE_RULE_CONFIDENCE = 0.85;
  const DEFAULT_SETTINGS = Object.freeze({
    showDebugBadges: true,
    moderationMode: "blur"
  });
  const MODERATION_MODE_CLASSES = [
    "clean-comments-mode-blur",
    "clean-comments-mode-blind",
    "clean-comments-mode-dim"
  ];
  const MODERATION_MODES = new Set(["blur", "blind", "dim"]);

  const queue = [];
  const queuedComments = new WeakSet();
  const status = {
    totalProcessed: 0,
    promptApiClassifications: 0,
    ruleFallbackClassifications: 0,
    pendingClassifications: 0,
    harmfulFiltered: 0,
    safeComments: 0,
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
    badge.textContent = `${result.label} | ${result.source} | ${formatConfidence(result.confidence)} | ${result.reason}`;

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
      reason: commentNode.getAttribute(REASON_ATTR) || "no reason stored"
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

  function applyModerationMode(commentNode) {
    commentNode.classList.remove(...MODERATION_MODE_CLASSES);
    commentNode.classList.add(`clean-comments-mode-${getModerationMode(settings.moderationMode)}`);
  }

  function getModerationMode(mode) {
    const normalizedMode = String(mode || "");
    return MODERATION_MODES.has(normalizedMode) ? normalizedMode : DEFAULT_SETTINGS.moderationMode;
  }

  function syncModerationMode() {
    document.querySelectorAll(`${COMMENT_SELECTOR}.clean-comments-hidden`).forEach(applyModerationMode);
  }

  function applyResult(commentNode, result) {
    removePendingIndicator(commentNode);
    commentNode.setAttribute(PROCESSED_ATTR, "true");
    commentNode.setAttribute(LABEL_ATTR, result.label);
    commentNode.setAttribute(SOURCE_ATTR, result.source);
    commentNode.setAttribute(CONFIDENCE_ATTR, String(result.confidence));
    commentNode.setAttribute(REASON_ATTR, result.reason);

    if (HARMFUL_LABELS.has(result.label)) {
      commentNode.classList.add("clean-comments-hidden");
      applyModerationMode(commentNode);
      commentNode.title = `clean_comments: ${result.label} (${result.source})`;

      if (settings.showDebugBadges) {
        upsertDebugBadge(commentNode, result);
      }
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

    if (result.source === "prompt_api") {
      status.promptApiClassifications += 1;
    } else {
      status.ruleFallbackClassifications += 1;
    }

    if (HARMFUL_LABELS.has(result.label)) {
      status.harmfulFiltered += 1;
    } else {
      status.safeComments += 1;
    }

    scheduleStatusWrite();
  }

  function shouldApplyRuleImmediately(result) {
    return HARMFUL_LABELS.has(result.label) && result.confidence >= IMMEDIATE_RULE_CONFIDENCE;
  }

  async function processQueue() {
    if (isProcessing) {
      return;
    }

    isProcessing = true;

    while (queue.length > 0) {
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

      const quickRuleResult = classifyByRules(text);
      if (shouldApplyRuleImmediately(quickRuleResult)) {
        applyResult(commentNode, quickRuleResult);
        recordResult(quickRuleResult);
        continue;
      }

      markPending(commentNode);
      const result = await classifyComment(text);
      applyResult(commentNode, result);
      recordResult(result);
    }

    isProcessing = false;
  }

  function enqueueComment(commentNode) {
    if (!commentNode || commentNode.hasAttribute(PROCESSED_ATTR) || queuedComments.has(commentNode)) {
      return;
    }

    queuedComments.add(commentNode);
    queue.push(commentNode);
    void processQueue();
  }

  function retryWhenTextIsReady(commentNode) {
    const retries = Number(commentNode.getAttribute(TEXT_RETRY_ATTR) || 0);
    if (retries >= MAX_TEXT_RETRIES) {
      return;
    }

    commentNode.setAttribute(TEXT_RETRY_ATTR, String(retries + 1));
    global.setTimeout(() => enqueueComment(commentNode), TEXT_RETRY_DELAY_MS);
  }

  function scanComments(root = document) {
    root.querySelectorAll(COMMENT_SELECTOR).forEach(enqueueComment);
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

    settings = {
      ...DEFAULT_SETTINGS,
      ...(await chrome.storage.sync.get(DEFAULT_SETTINGS))
    };
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

      if (changes.moderationMode) {
        settings.moderationMode = getModerationMode(changes.moderationMode.newValue);
        syncModerationMode();
      }
    });
  }

  function initializeStatus() {
    status.classifier = getClassifierStatus();
    status.lastUpdatedAt = new Date().toISOString();
    scheduleStatusWrite();
  }

  async function init() {
    await loadSettings();
    observeSettings();
    initializeStatus();
    scanComments();
    observeComments();
  }

  void init();
})(globalThis, document);
