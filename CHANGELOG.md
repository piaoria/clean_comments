# Changelog

## 0.2.0 - 2026-06-23

- Switched to AI-only judgment: the local rule classifier no longer pre-filters comments or acts as a filtering fallback (toggle via `RULE_PREFILTER_ENABLED` in `content.js` and `RULES_FALLBACK_ENABLED` in `classifier.js`).
- Left comments visible (treated as safe) when the Prompt API is unavailable or returns low-confidence harmful guesses, instead of filtering them with local rules — reduces false positives on innocent comments.
- Increased the AI classification batch size from 10 to 50 comments per request.
- Raised Prompt API timeouts (session 30s, single 12s, batch scaled by size up to 90s) so Gemini Nano actually has time to respond instead of always timing out.
- Made batch response parsing tolerant: results are matched by id, and out-of-order, missing, or unparseable items default to safe instead of discarding the whole batch.
- Hardened Prompt API session creation: uses the current `initialPrompts` system-role shape with a legacy `systemPrompt` retry, reports model download progress, accepts `downloadable`/`after-download` availability, and resets so a failed session can retry.
- Added a shared structured logger (`src/logger.js`) with level-styled console output covering Prompt API detection/availability/session timing, model download progress, batch send/parse timing and label summaries, every filtered comment (label, source, confidence, reason, text snippet), and init/settings lifecycle.
- Added a "verbose log" toggle in the popup (and a `localStorage.cleanCommentsVerbose` page flag) to turn on detailed per-comment debug logs on demand.
- Refreshed the popup UI with a card-based layout, refined palette, segmented controls, a header AI-status pill (green ready / amber waiting / red missing), and a clearer status dashboard with the filtered count highlighted.

## 0.1.0 - 2026-06-18

- Added initial Chrome Extension scaffold for YouTube comment filtering.
- Added Chrome Built-in AI / Gemini Nano Prompt API classifier path.
- Added rule-based fallback classifier.
- Added stronger Korean rule-based detection patterns.
- Added visible debug badges for blurred comments.
- Added popup setting to turn debug badges on or off.
- Added popup moderation style control: blur, blind, or dim.
- Added user-defined custom word and phrase filters.
- Added clickable starter templates for custom word filters.
- Added separate custom filter source/type reporting in debug and popup status.
- Excluded casual Korean laughter and crying reactions from the default meaningless rule.
- Added repository `.gitignore` for local, dependency, build, and packaged extension artifacts.
- Added a tabbed popup layout with per-label enable and moderation style settings.
- Added Prompt API timeout handling and low-confidence harmful result fallback.
- Added batched Prompt API classification for ambiguous comments and individual reply comment processing.
- Localized popup settings and status labels to Korean.
- Expanded the popup status tab into a debugging dashboard with queue, batch, source, and label counters.
- Added extension icon assets and manifest icon declarations.
- Added lightweight Node regression tests for rules, Prompt API fallback, and popup template encoding.
- Replaced corrupted popup starter template strings with stable escaped Korean terms.
- Added popup status for Prompt API availability and fallback usage.
- Added validation for moderation style settings before applying CSS classes.
- Added safer comment queueing to avoid duplicate work and empty-text false positives.
- Added async review flow: high-confidence rules blur immediately, while ambiguous comments stay visible with a subtle checking marker.
- Added comment blurring styles and YouTube comment observer.
- Added project guidance in `AGENTS.md`.
