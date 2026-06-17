# clean_comments

YouTube harmful comment filtering Chrome Extension.

This project is designed around Chrome Built-in AI, Gemini Nano, and the Prompt API. When the Prompt API is unavailable, disabled, or returns an unusable result, the extension uses a local rule-based fallback classifier.

## Target Labels

- `spam`
- `adult_bait`
- `link_bait`
- `meaningless`
- `harassment`
- `safe`

## Current Behavior

- Runs as a Manifest V3 content-script extension on YouTube watch pages.
- Watches newly loaded YouTube comments.
- Classifies comment text with Chrome Built-in AI when possible.
- Falls back to rule-based filtering.
- Blurs comments classified as harmful.
- Provides a popup setting to show or hide debug badges next to blurred comments.
- Marks processed comments with `data-clean-comments-*` attributes for debugging.

## Project Structure

```text
manifest.json
popup/
  popup.css
  popup.html
  popup.js
src/
  classifier.js
  content.js
  rules.js
  styles.css
```

## Local Setup

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Select "Load unpacked".
5. Choose this project folder.
6. Open a YouTube video page and scroll to the comments.

## Built-in AI Note

Chrome Built-in AI and the Prompt API may require a compatible Chrome version, local model availability, and browser settings or flags. The code checks for both the current `LanguageModel` style API and older experimental `ai.languageModel` style API before using the fallback classifier.

## Design Principles

- Privacy first: comment text should be classified locally in the browser.
- AI first: use Gemini Nano through Chrome Built-in AI when available.
- Resilient fallback: keep a transparent local rule set for unsupported environments.
- Korean first pass: keep Korean spam, adult bait, link bait, meaningless, and harassment rules strong enough for early testing.
- Small surface area: start with content scripts before adding popup or options UI.
