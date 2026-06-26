/**
 * DOM.fm - The Sandbox DJ (Dev 2's Generative Music Engine)
 * This script runs in the relaxed CSP sandboxed iframe.
 * It is responsible ONLY for loading the Magenta model and generating notes.
 * No audio is played inside this sandbox.
 */

console.log("🤖 Sandbox Generator loaded.");

// --- Magenta.js Setup ---
const model = new mm.MusicRNN("https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn");
let modelInitialized = false;

// Initialize the model immediately on load
async function initModel() {
    console.log("🤖 Sandbox Generator: Initializing Magenta MusicRNN...");
    try {
        await model.initialize();
        modelInitialized = true;
        console.log("🤖 Sandbox Generator: Magenta MusicRNN Initialized successfully!");
        // Let the parent know we are loaded and ready
        window.parent.postMessage({ type: "GENERATOR_READY" }, "*");
    } catch (err) {
        console.error("🤖 Sandbox Generator: Magenta initialization failed:", err);
    }
}
initModel();

// --- Music Hashing & Generation ---
function createSeedSequence(seedNumber) {
    const notes = [];
    for (let i = 0; i < 4; i++) {
        // Deterministic notes from seed
        const pitch = 48 + ((seedNumber >> (i * 5)) & 31);
        notes.push({
            pitch,
            startTime: i * 0.5,
            endTime: (i + 1) * 0.5,
        });
    }
    return {
        notes,
        totalTime: 2,
    };
}

async function generateNextChunk(seedNumber, lastSequence) {
    let seedSeq;
    if (lastSequence && lastSequence.notes && lastSequence.notes.length >= 4) {
        const lastNotes = lastSequence.notes.slice(-4);
        const minTime = lastNotes[0].startTime;
        seedSeq = {
            notes: lastNotes.map(n => ({
                pitch: n.pitch,
                startTime: n.startTime - minTime,
                endTime: n.endTime - minTime
            })),
            totalTime: lastSequence.totalTime - minTime
        };
    } else {
        seedSeq = createSeedSequence(seedNumber);
    }
    
    // Generate 32 steps (8 beats of melody continuation)
    const generated = await model.continueSequence(seedSeq, 32, 1.15);
    
    // Shift generated notes back so they start at 0 (Magenta continues after seedSeq.totalTime)
    const offset = seedSeq.totalTime;
    const shiftedNotes = generated.notes.map(n => ({
        pitch: n.pitch,
        startTime: n.startTime - offset,
        endTime: n.endTime - offset
    }));
    
    const result = {
        notes: shiftedNotes,
        totalTime: generated.totalTime - offset
    };
    
    console.log(`🤖 Sandbox Generator: Generated chunk of ${result.notes.length} notes successfully.`);
    return result;
}

// --- Runtime Communication ---
window.addEventListener("message", async (event) => {
    const data = event.data;
    if (data && data.type === "GENERATE_NEXT") {
        if (!modelInitialized) {
            console.warn("🤖 Sandbox Generator: Model not ready yet.");
            window.parent.postMessage({ type: "GENERATION_FAILED", error: "Model not initialized" }, "*");
            return;
        }
        
        try {
            console.log("🤖 Sandbox Generator: Generating next chunk for seed:", data.seed);
            const chunk = await generateNextChunk(data.seed, data.lastSequence);
            
            // Post the generated notes back to the parent frame
            window.parent.postMessage({
                type: "GENERATED_SEQUENCE",
                sequence: chunk,
                requestId: data.requestId
            }, "*");
        } catch (err) {
            console.error("🤖 Sandbox Generator: Generation error:", err);
            window.parent.postMessage({ type: "GENERATION_FAILED", error: err.message }, "*");
        }
    }
});
