# Changelog

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
