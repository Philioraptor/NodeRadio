# DOM.fm - Split Generative Audio Extension

An integrated Manifest V3 Chrome Extension that extracts the visual and textual "vibe" of any website you visit and converts it into a continuous, infinite generative soundtrack in the background!

This extension implements a **Split Audio/Sandbox Architecture** to seamlessly solve the two biggest constraints of modern Chrome extension design:
1. **Manifest V3 CSP Restrictions**: Machine learning libraries like Magenta.js / TensorFlow.js require `eval()` and `new Function()` to compile model weights, which Chrome blocks by default in extension files.
2. **Audio Autoplay Restrictions**: Chrome blocks sandboxed frames from starting an `AudioContext` without a direct user gesture (even with `allow="autoplay"`), treating them as untrusted cross-origin frames.

---

## 🛠️ The Architecture

```
+------------------------------------+
|       Background Service Worker    |
+------------------------------------+
                  |
        NEW_VIBE (Runtime Msg)
                  v
+-------------------------------------------------------+
|  Offscreen Document (the_secret_dj_booth.html)        |
|  - Runs in Extension Origin (Allowed Autoplay Audio)  |
|  - Loads Tone.js & the_receiver.js                    |
|                                                       |
|   +-----------------------------------------------+   |
|   |  Sandbox Iframe (sandbox.html)                |   |
|   |  - Runs in relaxed CSP (Allowed unsafe-eval)  |   |
|   |  - Loads Magenta.js & sandbox.js              |   |
|   +-----------------------------------------------+   |
+-------------------------------------------------------+
```

1. **Content Script (`content.js`)**: Runs on page load, scrapes URL, text density, and color theme. Hashes the URL into a 32-bit integer seed and sends it to the service worker.
2. **Background Manager (`background_service_worker.js`)**: Spins up the offscreen document and forwards the vibe payload.
3. **Offscreen Page (`the_secret_dj_booth.html` / `the_receiver.js`)**:
   - Runs in the extension origin with the `AUDIO_PLAYBACK` reason, granting it **full autoplay permissions** to create/play Tone.js synths, drums, and Speech Synthesis.
   - Embeds an invisible sandboxed iframe pointing to `sandbox.html`.
   - Sends the vibe seed to the sandbox iframe via `postMessage`.
   - Receives generated note sequences from the sandbox via `message` events, playing them gaplessly.
4. **Sandbox Iframe (`sandbox.html` / `sandbox.js`)**:
   - Runs in a sandboxed context which relaxes Chrome's CSP to allow `unsafe-eval`.
   - Loads **Magenta.js** and its neural network model checkpoint.
   - Listens for requests from the parent offscreen page, generates 32-step phrase continuations, shifts note times to `0` (ensuring gapless phrase looping), and posts the notes back as JSON.

---

## 📥 How to Install and Run

1. **Download/Clone** this directory to your local computer.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. In the top-left corner, click **Load unpacked**.
5. Select this folder (`dom-fm-extension`).

---

## 🔍 How to Test and Hear the Music

1. Open any public website in a new tab (e.g., [https://wikipedia.org](https://wikipedia.org) or [https://example.com](https://example.com)).
2. Make sure your speaker volume is up!
3. The browser will speak: *"Tuning into [domain name]"*, and a continuous, generative ambient house track will start playing in the background.
4. Go to `chrome://extensions/` and click the **`the_secret_dj_booth.html`** inspect views link. Open the console tab to see the handshake and communication logs:
   ```text
   🎛️ Receiver Bridge: Initialized.
   🎛️ Receiver Bridge: Sandbox iframe loaded!
   🤖 Sandbox Generator: Initializing Magenta MusicRNN...
   🤖 Sandbox Generator: Magenta MusicRNN Initialized successfully!
   🎛️ Receiver Bridge: Sandbox generator reported READY.
   🎛️ Receiver Bridge: Received vibe data from Service Worker...
   🎼 Receiver Bridge: Starting AudioContext and Radio Playback...
   🤖 Sandbox Generator: Generating next chunk for seed: 3412943457
   🎛️ Receiver Bridge: Forwarding vibe to sandbox...
   ```
5. Navigate to different pages (e.g. a dark-themed page vs a light-themed page) and listen to how the synthesizers transpose and change sound, and how the drum elements and tempo change dynamically!
