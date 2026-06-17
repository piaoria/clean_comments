(function runContentScript(global, document) {
  const { HARMFUL_LABELS } = global.CleanCommentsRules;
  const { classifyComment } = global.CleanCommentsClassifier;

  const COMMENT_SELECTOR = "ytd-comment-thread-renderer";
  const TEXT_SELECTOR = "#content-text";
  const PROCESSED_ATTR = "data-clean-comments-processed";
  const LABEL_ATTR = "data-clean-comments-label";
  const SOURCE_ATTR = "data-clean-comments-source";
  const CONFIDENCE_ATTR = "data-clean-comments-confidence";
  const REASON_ATTR = "data-clean-comments-reason";
  const DEBUG_CLASS = "clean-comments-debug";
  const DEFAULT_SETTINGS = Object.freeze({
    showDebugBadges: true
  });

  const queue = [];
  let settings = { ...DEFAULT_SETTINGS };
  let isProcessing = false;

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

  function removeDebugBadge(commentNode) {
    commentNode.querySelector(`:scope > .${DEBUG_CLASS}`)?.remove();
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

  function applyResult(commentNode, result) {
    commentNode.setAttribute(PROCESSED_ATTR, "true");
    commentNode.setAttribute(LABEL_ATTR, result.label);
    commentNode.setAttribute(SOURCE_ATTR, result.source);
    commentNode.setAttribute(CONFIDENCE_ATTR, String(result.confidence));
    commentNode.setAttribute(REASON_ATTR, result.reason);

    if (HARMFUL_LABELS.has(result.label)) {
      commentNode.classList.add("clean-comments-hidden");
      commentNode.title = `clean_comments: ${result.label} (${result.source})`;

      if (settings.showDebugBadges) {
        upsertDebugBadge(commentNode, result);
      }
    }
  }

  async function processQueue() {
    if (isProcessing) {
      return;
    }

    isProcessing = true;

    while (queue.length > 0) {
      const commentNode = queue.shift();
      if (!commentNode.isConnected || commentNode.hasAttribute(PROCESSED_ATTR)) {
        continue;
      }

      const text = getCommentText(commentNode);
      const result = await classifyComment(text);
      applyResult(commentNode, result);
    }

    isProcessing = false;
  }

  function enqueueComment(commentNode) {
    if (!commentNode || commentNode.hasAttribute(PROCESSED_ATTR)) {
      return;
    }

    queue.push(commentNode);
    void processQueue();
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
      if (areaName !== "sync" || !changes.showDebugBadges) {
        return;
      }

      settings.showDebugBadges = Boolean(changes.showDebugBadges.newValue);
      syncDebugBadges();
    });
  }

  async function init() {
    await loadSettings();
    observeSettings();
    scanComments();
    observeComments();
  }

  void init();
})(globalThis, document);
