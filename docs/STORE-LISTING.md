# Store listing — Volume+ (Chrome Web Store and Microsoft Edge Add-ons)

## Name
Volume+

## Short description (manifest `description`, max 132 characters)
Per-tab YouTube volume up to 300%, with a peak limiter, equalizer, editable presets and keyboard shortcuts.

## Category
Chrome: Productivity (alternative: Accessibility). Edge: Productivity.

## Detailed description

Volume+ sets the volume of each YouTube tab separately, from 0% to 300%.

YouTube resets the volume on refresh and when you move to another video. Volume+ keeps the level you set for each tab. Changing one tab does not change another.

Features
- Separate volume for each YouTube tab.
- The level is kept when you refresh or navigate within YouTube.
- Volume above 100%, up to 300%. Boost mode must be turned on first.
- Peak limiter, to reduce peaks when boosting.
- Equalizer with Bass, Mid and Treble, and the profiles Flat, Bass Boost, Vocal and Treble Boost.
- Presets: add, rename, reorder and delete. A preset applies to the current tab.
- Mute, which restores your previous level.
- Keyboard shortcuts: Alt+Up, Alt+Down, Alt+M (mute) and Alt+0 (reset to 100%). Four more slots for presets have no default key. You can change all of them on the browser's extension shortcuts page. In the player, click the video and use the arrow keys.
- A volume control in the YouTube player, and a popup that works on a YouTube tab playing in the background.
- The popup shows whether a level was applied, is still being applied, or failed, and gives the reason.

Privacy
Volume+ does not collect or send any data. It makes no network requests and loads no remote code or fonts. Settings are stored in your browser. It runs only on youtube.com and requests one permission, storage.

Notes
- Volume above 100% can be very loud. The limiter reduces peaks. It does not fix distorted audio and does not protect your hearing.
- After installing or updating, reload YouTube tabs that were already open.
- If the browser blocks audio until you interact with the page, boost starts after you click the page. The popup says when this happens.
- Requires Chrome or Edge 111 or newer. Works on youtube.com only. Not affiliated with YouTube or Google.

## Single purpose (Chrome Web Store field)
Control the playback volume of YouTube videos, per tab, including amplification above 100%.

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings (presets, key step, Boost mode, default volume) in the browser. Nothing is sent anywhere. |
| Host access `https://www.youtube.com/*` | Required to read and set the volume of the YouTube player and to show the volume control inside the YouTube page. No other site is accessed. |
| Content script in the page's main world (`injected.js`) | Needed to stop YouTube from resetting the volume the user chose. It only changes the volume of the page's own video and the saved YouTube volume value. |

No remote code: all scripts are packaged in the extension.

## Privacy practices (dashboard answers)
- Data collected: none. Selecting "does not collect user data" is accurate for v2.3.0; recheck before adding anything.
- Data sold or shared: no. Used for unrelated purposes: no. Used for creditworthiness or lending: no.
- Remote code: no.
- Stored locally: volume and equalizer settings for the current tab (session storage), a default volume number, presets and preferences (extension storage).
- Privacy policy URL: required by some listings even for no-data extensions — publish a one-page policy that repeats the Privacy paragraph above, then paste its URL here.

## Release notes (first listing of 2.3.0)
Adds per-tab volume, a peak limiter, an equalizer, editable presets and keyboard shortcuts, and a redesigned popup. Permissions reduced to storage only. Reload open YouTube tabs after updating.

## Screenshots to capture (1280x800 or 640x400; none exist yet)
1. Popup at 100%, presets visible.
2. Popup boosted (amber zone and the 100% line), status line reading "Boosted to 230%".
3. Sound section open: limiter on, equalizer profile, three bands.
4. Presets editor open.
5. Two YouTube tabs side by side at different levels, with the in-player control visible.
Take them on real YouTube in Chrome and Edge; the test fixture is not suitable.

## Claims deliberately NOT made
No "safe for your ears", "no distortion", "studio quality" or "true limiter": the limiter is a compressor with a soft ceiling and is documented as such. No "works on all sites" and no ratings or user counts.
