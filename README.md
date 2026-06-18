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

- Runs as a Manifest V3 content-script extension on YouTube pages and processes comment threads when present.
- Watches newly loaded YouTube comments and replies.
- Classifies comment text with Chrome Built-in AI when possible.
- Sends ambiguous AI-reviewed comments in small batches instead of one request per comment.
- Falls back to rule-based filtering.
- Falls back to local rules when Prompt API session creation or response generation times out.
- Uses local rules instead of low-confidence harmful Prompt API results.
- Applies user-defined custom word and phrase filters before rule or AI review.
- Offers clickable starter templates for harassment, spam bait, and adult bait custom filters.
- Filters harmful comments with a user-selected style: blur, blind, or dim.
- Provides a tabbed popup with general settings, label-specific behavior, custom words, and live status.
- Lets users enable or disable filtering per label and choose blur, blind, or dim per label.
- Keeps casual Korean reactions like repeated laughter or crying expressions out of the default meaningless filter.
- Immediately filters high-confidence rule matches, while ambiguous comments stay visible during async AI review.
- Provides a popup setting to show or hide debug badges next to filtered comments.
- Shows Prompt API availability, AI/rule fallback counts, and last classification in the popup.
- Separates filter sources as Prompt API, local rules, or user settings in debug/status output.
- Marks processed comments with `data-clean-comments-*` attributes for debugging.

## Project Structure

```text
manifest.json
package.json
assets/
  icons/
popup/
  popup.css
  popup.html
  popup.js
src/
  classifier.js
  content.js
  rules.js
  styles.css
tests/
  run-tests.js
```

## Local Setup

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Select "Load unpacked".
5. Choose this project folder.
6. Open a YouTube video page and scroll to the comments.

## Verification

Run the lightweight regression checks with:

```bash
npm test
```

The tests cover local rule labels, Korean reaction exceptions, low-confidence Prompt API fallback, high-confidence Prompt API results, batched Prompt API classification, and popup template encoding.

## Built-in AI Note

Chrome Built-in AI and the Prompt API may require a compatible Chrome version, local model availability, and browser settings or flags. The code checks for both the current `LanguageModel` style API and older experimental `ai.languageModel` style API before using the fallback classifier.

## Security Notes

- Comment text is classified locally in the browser by Chrome Built-in AI or local rules.
- The extension does not send comment text to an external server.
- Popup status stores counters and the last label/source/reason, not raw comment text.
- Custom filter words are stored in Chrome sync storage so the user's own browser profile can apply them.
- Per-label behavior settings are stored in Chrome sync storage with the rest of the user's preferences.
- DOM labels and badges use `textContent`, not HTML injection.
- User settings are validated before they affect CSS class names.
- Prompt API calls are time-limited and fall back to local rules to avoid blocking comment processing indefinitely.

## Design Principles

- Privacy first: comment text should be classified locally in the browser.
- AI first: use Gemini Nano through Chrome Built-in AI when available.
- Resilient fallback: keep a transparent local rule set for unsupported environments.
- Korean first pass: keep Korean spam, adult bait, link bait, meaningless, and harassment rules strong enough for early testing.
- Small surface area: start with content scripts before adding popup or options UI.
