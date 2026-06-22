/**
 * DOM.fm - The DJ (Dev 2's future home)
 * This script runs in the invisible background tab.
 */

chrome.runtime.onMessage.addListener((message) => {
    if (message.target === "offscreen") {
        // We got the data from Dev 1!
        console.log("🎛️ ROBOT DJ RECEIVED VIBE:", message.data);
        
        // TODO: Dev 2 will take message.data.seed and message.data.colorTheme
        // and plug them into the music synthesizers right here!
    }
});

// Notify service worker that the offscreen document is ready to receive vibe data!
chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }).catch(() => {});