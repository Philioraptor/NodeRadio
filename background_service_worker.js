/**
 * DOM.fm - The Manager
 * This runs in the background and makes sure the secret DJ booth is open.
 */

let latestVibe = null;

async function ensureOffscreenDocument() {
    // Check if the secret room already exists
    const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (existingContexts.length > 0) return;

    // If not, create it
    await chrome.offscreen.createDocument({
        url: 'the_secret_dj_booth.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'To play continuous procedural radio.'
    });
}

// Listen for the vibe data coming from Dev 1's content scraper
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "NEW_VIBE") {
        latestVibe = message.data;
        // Make sure the room is open, then pass the data inside
        ensureOffscreenDocument().then(() => {
            chrome.runtime.sendMessage({ target: "offscreen", data: message.data }).catch(() => {
                // Ignore error if document isn't fully initialized to receive messages yet
            });
        });
    } else if (message.type === "OFFSCREEN_READY") {
        // When the offscreen receiver loads, send the cached vibe data immediately
        if (latestVibe) {
            chrome.runtime.sendMessage({ target: "offscreen", data: latestVibe }).catch(() => {});
        }
    }
});