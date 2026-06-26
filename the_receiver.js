/**
 * DOM.fm - The Receiver Bridge
 * This script runs in the offscreen document.
 * It manages Tone.js audio playback, synths, drums, and speech synthesis,
 * communicating with the sandboxed iframe to generate notes.
 *
 * Upgraded: Website-Specific Musical Fingerprint Engine.
 * Dynamically transposes keys, chord progressions, drum variations, and tempos
 * based on the webpage's URL seed.
 */

console.log("🎛️ Receiver Bridge: Initialized with Website-Specific Composition Engine.");

const iframe = document.getElementById("audio-sandbox");
let iframeLoaded = false;
let generatorReady = false;
let pendingVibe = null;

// --- State Variables ---
let isPlaying = false;
let currentSeed = 12345;
let currentColor = "light";
let currentTextDensity = "low";
let activeGenre = "indian_fusion";
let lastSequence = null;
let nextPlayTime = 0;
let activeParts = [];

// --- Unique Composition States ---
let currentRootTreble = 61; // C#4 default
let currentRootBass = 37;    // C#2 default
let currentChordProgression = [];
let activeDrumPattern = [];
let activeHatStyle = 0; // 0: straight, 1: off-beats, 2: syncopated

// --- Tone.js Master Mix & Effects ---
const limiter = new Tone.Limiter(-1).toDestination();

const masterBus = new Tone.Compressor({
    threshold: -16,
    ratio: 4.0,
    attack: 0.03,
    release: 0.08
}).connect(limiter);

const reverb = new Tone.Freeverb({
    roomSize: 0.85,
    dampening: 2500,
    wet: 0.38
}).connect(masterBus);

const delay = new Tone.FeedbackDelay({
    delayTime: "8n.",
    feedback: 0.33,
    wet: 0.22
}).connect(reverb);

const musicBus = new Tone.Volume(-12).connect(masterBus);
musicBus.connect(delay); // Parallel delay send

const drumBus = new Tone.Volume(-12).connect(masterBus);
const drumReverbSend = new Tone.Volume(-12).connect(reverb); // Drum reverb send

// --- Scale Definitions ---
const SCALES = {
    // Raga scales (Indian Classical Fusion)
    bhairav: { name: "Raga Bhairav", intervals: [0, 1, 4, 5, 7, 8, 11] },
    yaman: { name: "Raga Yaman", intervals: [0, 2, 4, 6, 7, 9, 11] },
    shivaranjani: { name: "Raga Shivaranjani", intervals: [0, 2, 3, 7, 9] },
    bhupali: { name: "Raga Bhupali", intervals: [0, 2, 4, 7, 9] },
    // Modern / Western scales
    dorian: { name: "C# Dorian (Jazzy)", intervals: [0, 2, 3, 5, 7, 9, 10] },
    minor: { name: "C# Minor (Aeolian)", intervals: [0, 2, 3, 5, 7, 8, 10] },
    major: { name: "C# Major (Ionian)", intervals: [0, 2, 4, 5, 7, 9, 11] }
};
let currentScale = SCALES.yaman;

// --- Procedural Generation Helpers ---

// 1. Dynamic Key Selector (transposes root key between C and B based on seed)
function selectKeyFromSeed(seed) {
    const semitoneOffset = seed % 12;
    currentRootTreble = 60 + semitoneOffset; // Transposes C4 (60) to B4 (71)
    currentRootBass = currentRootTreble - 24; // 2 octaves lower
    
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    console.log(`🎛️ Receiver Bridge: Root key set to ${noteNames[semitoneOffset]} (MIDI ${currentRootTreble})`);
}

// 2. Scale Snapping function
function snapToScale(pitch, scaleIntervals, rootNote = 61) {
    let relative = pitch - rootNote;
    let octave = Math.floor(relative / 12);
    let noteInOctave = ((relative % 12) + 12) % 12;
    
    let closest = scaleIntervals[0];
    let minDiff = 12;
    for (const val of scaleIntervals) {
        const diff = Math.abs(val - noteInOctave);
        if (diff < minDiff) {
            minDiff = diff;
            closest = val;
        }
    }
    
    return rootNote + octave * 12 + closest;
}

// 3. Diatonic Chord Generator (Generates diatonic 7th/9th chords for any scale degree)
function generateChord(degree, scaleIntervals, rootBass) {
    const len = scaleIntervals.length;
    
    const rootIdx = degree;
    const thirdIdx = (degree + 2) % len;
    const fifthIdx = (degree + 4) % len;
    const seventhIdx = (degree + 6) % len;
    const ninthIdx = (degree + 8) % len;
    
    const rootOct = Math.floor(rootIdx / len);
    const thirdOct = Math.floor((degree + 2) / len);
    const fifthOct = Math.floor((degree + 4) / len);
    const seventhOct = Math.floor((degree + 6) / len);
    const ninthOct = Math.floor((degree + 8) / len);
    
    const p1 = scaleIntervals[rootIdx % len] + rootOct * 12;
    const p2 = scaleIntervals[thirdIdx] + thirdOct * 12;
    const p3 = scaleIntervals[fifthIdx] + fifthOct * 12;
    const p4 = scaleIntervals[seventhIdx] + seventhOct * 12;
    const p5 = scaleIntervals[ninthIdx] + ninthOct * 12;
    
    // Treble chords connect to padSynth
    const chordNotes = [
        rootBass + 12 + p1,
        rootBass + 12 + p2,
        rootBass + 12 + p3,
        rootBass + 12 + p4,
        rootBass + 12 + p5
    ];
    
    return {
        root: rootBass + p1,
        notes: chordNotes
    };
}

// 4. Procedural Chord Progression Generator (Builds 4 unique chords using seed)
function generateProgressionFromSeed(seed, scaleIntervals, rootBass) {
    // 1st chord is I (0) or vi (5) for harmonic stability
    const firstDegree = (seed % 2 === 0) ? 0 : 5;
    
    // Deterministic selection of other degrees (1 to 6)
    const secondDegree = 1 + ((seed >> 4) % 6);
    const thirdDegree = 1 + ((seed >> 8) % 6);
    const fourthDegree = 1 + ((seed >> 12) % 6);
    
    const degrees = [firstDegree, secondDegree, thirdDegree, fourthDegree];
    currentChordProgression = degrees.map(d => generateChord(d, scaleIntervals, rootBass));
    console.log(`🎛️ Receiver Bridge: Generated chord progression on degrees: [${degrees.join(", ")}]`);
}

// 5. Procedural Drum Pattern Shuffler (Varies beats based on seed)
function generateDrumPatternForSeed(seed, genre) {
    if (genre === "indian_fusion") {
        const base = ["Dha", "Chi", null, "Na", "Dha", "Chi", null, "Tun"];
        base[2] = ((seed >> 2) % 3 === 0) ? "Ge" : null;
        base[3] = ((seed >> 3) % 2 === 0) ? "Na" : "Chi";
        base[6] = ((seed >> 4) % 3 === 0) ? "Ge" : null;
        base[7] = ((seed >> 5) % 2 === 0) ? "Tun" : "Na";
        return base;
    } else if (genre === "lofi_chill") {
        const base = ["Kick", "Hat", null, "Hat", "Snare", "Hat", "Kick", "Hat"];
        base[2] = ((seed >> 6) % 3 === 0) ? "Kick" : null;
        base[3] = ((seed >> 7) % 2 === 0) ? null : "Hat";
        base[5] = ((seed >> 8) % 3 === 0) ? "Kick" : "Hat";
        return base;
    } else if (genre === "synthwave") {
        activeHatStyle = seed % 3; // 0: straight, 1: off-beats, 2: syncopated
        return ["Kick", "Hat", "Kick", "Hat", "Kick", "Hat", "Kick", "Hat"];
    }
    return [];
}


// --- Instrument Definitions ---

// 1. Sitar Synth (Buzzy, plucky lead twang)
const sitarSynth = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: "sawtooth" },
    filter: { Q: 4.5, type: "lowpass", rolloff: -12 },
    envelope: { attack: 0.005, decay: 0.35, sustain: 0.25, release: 0.9 },
    filterEnvelope: {
        attack: 0.002,
        decay: 0.18,
        sustain: 0.1,
        release: 0.8,
        baseFrequency: 180,
        octaves: 4.2,
        exponent: 2
    }
}).connect(musicBus);

const sitarSympathetic = new Tone.FeedbackDelay({
    delayTime: 0.012, // ~12ms metallic resonance
    feedback: 0.45,
    wet: 0.25
}).connect(reverb);
sitarSynth.connect(sitarSympathetic);

// 2. Violin Synth (Detuned fat sawtooth strings)
const violinVibrato = new Tone.Vibrato({
    frequency: 5.6,
    depth: 0.18
}).connect(musicBus);

const violinSynth = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: {
        type: "fatsawtooth",
        count: 3,
        spread: 16
    },
    filter: { Q: 1.2, type: "lowpass", frequency: 1400 },
    envelope: { attack: 0.35, decay: 0.5, sustain: 0.85, release: 1.8 },
    filterEnvelope: { attack: 0.4, decay: 0.6, sustain: 0.8, baseFrequency: 600, octaves: 1.5 }
}).connect(violinVibrato);

// 3. Tambura Drone Synth (Traditional modal backdrop)
const tamburaSynth = new Tone.MonoSynth({
    oscillator: { type: "sawtooth" },
    filter: { Q: 2, type: "lowpass" },
    envelope: { attack: 0.08, decay: 3.5, sustain: 0, release: 3.0 },
    filterEnvelope: { attack: 0.05, decay: 1.8, sustain: 0, release: 2.0, baseFrequency: 160, octaves: 3.2 },
    volume: -18
}).connect(reverb);

// 4. Tabla Drum Synths
const bayanSynth = new Tone.MonoSynth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.38, sustain: 0, release: 0.4 },
    filter: { Q: 1, type: "lowpass", frequency: 350 },
    volume: -8
}).connect(drumBus);

const dayanSynth = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.003, decay: 0.14, sustain: 0, release: 0.14 },
    volume: -12
}).connect(drumBus);
dayanSynth.connect(drumReverbSend);

const manjiraSynth = new Tone.MetalSynth({
    frequency: 1100,
    envelope: { attack: 0.001, decay: 0.7, sustain: 0, release: 0.7 },
    resonance: 7500,
    harmonicity: 5.2,
    volume: -24
}).connect(reverb);

// 5. Backing Synths for modern genres
const kickSynth = new Tone.MembraneSynth({
    envelope: { sustain: 0, attack: 0.01, decay: 0.28 },
    volume: -10
}).connect(drumBus);

const lofiSnare = new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
    volume: -18
}).connect(drumBus);

const synthwaveSnare = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.24, sustain: 0 },
    volume: -16
}).connect(reverb);

const bassSynth = new Tone.MonoSynth({
    oscillator: { type: "triangle" },
    filter: { Q: 1.0, type: "lowpass", frequency: 200 },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.4 },
    volume: -12
}).connect(masterBus);

const padSynth = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: "sine" },
    filter: { Q: 1.0, type: "lowpass", frequency: 600 },
    envelope: { attack: 0.4, decay: 1.0, sustain: 0.7, release: 1.8 }
}).connect(reverb);

// 6. Lead Synths for modern genres
const lofiLeadSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.8 },
    volume: -14
}).connect(musicBus);

const synthwaveLeadSynth = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: "sawtooth" },
    filter: { Q: 2, type: "lowpass", frequency: 1500 },
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.6, release: 0.8 },
    volume: -14
}).connect(musicBus);

const ambientLeadSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.1, decay: 1.2, sustain: 0, release: 1.2 },
    volume: -16
}).connect(reverb);


// --- Tabla / Drum Triggers ---
function playBayan(time, basePitch) {
    const startFreq = Tone.Frequency(basePitch, "midi").toFrequency();
    const endFreq = Tone.Frequency(basePitch + 3, "midi").toFrequency();
    
    bayanSynth.triggerAttack(startFreq, time);
    bayanSynth.oscillator.frequency.setValueAtTime(startFreq, time);
    bayanSynth.oscillator.frequency.exponentialRampToValueAtTime(endFreq, time + 0.22);
}

function playDayan(time, stroke) {
    let pitch = currentRootTreble; // Snapped to treble key
    if (stroke === "Tun") {
        pitch = currentRootTreble + 7;
    }
    const freq = Tone.Frequency(pitch, "midi").toFrequency();
    dayanSynth.triggerAttackRelease(freq, "16n", time);
}

// Master Drum Loop Sequencer (8-step beat clock)
const drumSeq = new Tone.Sequence((time, eventIndex) => {
    if (!isPlaying) return;
    
    const step = eventIndex;
    
    if (activeGenre === "indian_fusion") {
        const stroke = activeDrumPattern[step];
        const rootBass = (currentColor === "dark") ? currentRootBass - 12 : currentRootBass;
        
        switch (stroke) {
            case "Dha":
                playBayan(time, rootBass);
                playDayan(time, "Na");
                break;
            case "Ge":
                playBayan(time, rootBass);
                break;
            case "Na":
                playDayan(time, "Na");
                break;
            case "Tun":
                playDayan(time, "Tun");
                break;
            case "Chi":
                manjiraSynth.triggerAttack(time);
                break;
        }
    } else if (activeGenre === "lofi_chill") {
        const stroke = activeDrumPattern[step];
        
        if (stroke === "Kick") {
            kickSynth.triggerAttackRelease("C1", "8n", time);
        } else if (stroke === "Snare") {
            lofiSnare.triggerAttack(time);
        } else if (stroke === "Hat") {
            manjiraSynth.set({ envelope: { decay: 0.05 } });
            manjiraSynth.triggerAttack(time);
        }
        
        // Lo-fi jazz bass line
        if (stroke === "Kick" || step === 3) {
            bassSynth.triggerAttackRelease(Tone.Frequency(currentRootBass, "midi").toFrequency(), "8n", time);
        }
    } else if (activeGenre === "synthwave") {
        const isKickStep = (step % 2 === 0);
        const isSnareStep = (step === 2 || step === 6);
        
        if (isKickStep) {
            kickSynth.triggerAttackRelease("C1", "8n", time);
        }
        if (isSnareStep) {
            synthwaveSnare.triggerAttack(time);
        }
        
        // Dynamic hi-hat patterns
        let triggerHat = false;
        if (activeHatStyle === 0) {
            triggerHat = true; // straight 8ths
        } else if (activeHatStyle === 1) {
            triggerHat = (step % 2 !== 0); // off-beats only
        } else {
            triggerHat = (step === 1 || step === 3 || step === 5); // syncopated sparse
        }
        
        if (triggerHat) {
            manjiraSynth.set({ envelope: { decay: 0.08 } });
            manjiraSynth.triggerAttack(time);
        }
        
        // Driving octave bassline
        const pitch = (step % 2 === 0) ? currentRootBass : currentRootBass + 12;
        bassSynth.triggerAttackRelease(Tone.Frequency(pitch, "midi").toFrequency(), "8n", time);
    }
}, [0, 1, 2, 3, 4, 5, 6, 7], "8n");


// --- Domain Genre Classifier ---
function classifyGenre(category, url) {
    if (category) {
        if (category === "developer") return "synthwave";
        if (category === "academic") return "indian_fusion";
        if (category === "productivity") return "lofi_chill";
        if (category === "general") return "ambient";
    }
    
    if (url) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            if (host.includes("github") || host.includes("stackoverflow") || host.includes("reddit") || host.includes("localhost") || host.includes("coder") || host.includes("dev")) {
                return "synthwave";
            }
            if (host.includes("wikipedia") || host.includes("news") || host.includes("medium") || host.includes("blog") || host.includes("edu") || host.includes("arxiv") || host.includes("nature")) {
                return "indian_fusion";
            }
            if (host.includes("google") || host.includes("mail") || host.includes("notion") || host.includes("slack") || host.includes("drive") || host.includes("docs")) {
                return "lofi_chill";
            }
        } catch (e) {
            // ignore
        }
    }
    
    const genres = ["indian_fusion", "lofi_chill", "synthwave", "ambient"];
    return genres[currentSeed % genres.length];
}

function getStationName(genre) {
    switch (genre) {
        case "indian_fusion": return "Raga FM";
        case "lofi_chill": return "Chill FM";
        case "synthwave": return "Neon Beats";
        case "ambient": return "Vibe Ambient";
        default: return "DOM.fm";
    }
}


// --- Sandbox Messaging Bridge ---
let requestIdCounter = 0;
const pendingRequests = new Map();

iframe.addEventListener("load", () => {
    console.log("🎛️ Receiver Bridge: Sandbox iframe loaded!");
    iframeLoaded = true;
    if (pendingVibe) {
        processVibeUpdate(pendingVibe);
        pendingVibe = null;
    }
});

function requestNextChunk() {
    return new Promise((resolve, reject) => {
        if (!iframeLoaded) {
            reject(new Error("Sandbox iframe not loaded yet."));
            return;
        }
        
        const requestId = requestIdCounter++;
        const timeoutId = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error("Sandbox generation timed out."));
        }, 5000);
        
        pendingRequests.set(requestId, {
            resolve: (chunk) => {
                clearTimeout(timeoutId);
                resolve(chunk);
            },
            reject: (err) => {
                clearTimeout(timeoutId);
                reject(err);
            }
        });
        
        iframe.contentWindow.postMessage({
            type: "GENERATE_NEXT",
            seed: currentSeed,
            lastSequence: lastSequence,
            requestId: requestId
        }, "*");
    });
}

window.addEventListener("message", (event) => {
    const data = event.data;
    if (data) {
        if (data.type === "GENERATOR_READY") {
            console.log("🎛️ Receiver Bridge: Sandbox generator reported READY.");
            generatorReady = true;
        } else if (data.type === "GENERATED_SEQUENCE") {
            const req = pendingRequests.get(data.requestId);
            if (req) {
                pendingRequests.delete(data.requestId);
                req.resolve(data.sequence);
            }
        } else if (data.type === "GENERATION_FAILED") {
            const req = pendingRequests.get(data.requestId);
            if (req) {
                pendingRequests.delete(data.requestId);
                req.reject(new Error(data.error));
            }
        }
    }
});


// --- Audio Playback Scheduler ---
async function scheduleNextChunk() {
    if (!isPlaying) return;
    
    if (!generatorReady) {
        console.log("🎛️ Receiver Bridge: Waiting for sandbox generator to be ready...");
        setTimeout(scheduleNextChunk, 1000);
        return;
    }
    
    try {
        const chunk = await requestNextChunk();
        if (!isPlaying) return;
        
        const now = Tone.now();
        if (nextPlayTime < now + 0.1) {
            console.log(`🎛️ Receiver Bridge: Latency shift detected, adjusting nextPlayTime from ${nextPlayTime.toFixed(2)} to ${(now + 0.1).toFixed(2)}`);
            nextPlayTime = now + 0.1;
        }
        
        console.log(`🎛️ Receiver Bridge: Scheduling chunk of ${chunk.notes.length} notes at time ${nextPlayTime.toFixed(2)}`);

        const scaleIntervals = currentScale.intervals;

        // Map notes into Tone.Part
        const part = new Tone.Part((time, note) => {
            const originalPitch = note.pitch;
            // Snap note dynamically to the website's unique root key scale
            let pitch = snapToScale(originalPitch, scaleIntervals, currentRootTreble);
            
            // Keep treble leads in a pleasant range (G3 to G5)
            while (pitch < 55) pitch += 12;
            while (pitch > 85) pitch -= 12;
            
            const freq = Tone.Frequency(pitch, "midi").toFrequency();
            const noteDuration = note.endTime - note.startTime;
            
            // Trigger lead instrument based on active website genre
            if (activeGenre === "indian_fusion") {
                sitarSynth.triggerAttackRelease(freq, noteDuration, time);
                
                // Violin swells play lower counter melodies on long notes
                if (noteDuration >= 0.35) {
                    let violinPitch = pitch - 12;
                    while (violinPitch < 43) violinPitch += 12;
                    while (violinPitch > 72) violinPitch -= 12;
                    const violinFreq = Tone.Frequency(violinPitch, "midi").toFrequency();
                    violinSynth.triggerAttackRelease(violinFreq, noteDuration * 1.3, time);
                }
            } else if (activeGenre === "lofi_chill") {
                lofiLeadSynth.triggerAttackRelease(freq, noteDuration, time);
            } else if (activeGenre === "synthwave") {
                synthwaveLeadSynth.triggerAttackRelease(freq, noteDuration, time);
            } else if (activeGenre === "ambient") {
                ambientLeadSynth.triggerAttackRelease(freq, noteDuration * 1.5, time);
            }
        }, chunk.notes.map(n => [n.startTime, n]));
        
        part.start(nextPlayTime);
        activeParts.push(part);
        
        lastSequence = chunk;
        
        const chunkDuration = chunk.totalTime;
        const scheduledTime = nextPlayTime;
        nextPlayTime += chunkDuration;
        
        const leadTime = 1.2;
        Tone.Transport.scheduleOnce(() => {
            scheduleNextChunk();
        }, scheduledTime + chunkDuration - leadTime);
        
        cleanupOldParts();
    } catch (err) {
        console.error("🎛️ Receiver Bridge: Playback scheduling error:", err);
        setTimeout(scheduleNextChunk, 1500);
    }
}

function cleanupOldParts() {
    const now = Tone.now();
    activeParts = activeParts.filter(part => {
        if (part.start < now - 15) {
            part.dispose();
            return false;
        }
        return true;
    });
}


// --- Mapping Control Logic ---
function applyMapping(color, textDensity, category, url) {
    currentColor = color;
    currentTextDensity = textDensity;
    
    // 1. Select website-specific root key offset from seed
    selectKeyFromSeed(currentSeed);
    
    // 2. Classify genre and select scale
    activeGenre = classifyGenre(category, url);
    console.log(`🎛️ Receiver Bridge: Genre classified as ${activeGenre.toUpperCase()}`);
    
    if (activeGenre === "indian_fusion") {
        if (color === "dark") {
            currentScale = (currentSeed % 2 === 0) ? SCALES.shivaranjani : SCALES.bhairav;
        } else {
            currentScale = (currentSeed % 2 === 0) ? SCALES.yaman : SCALES.bhupali;
        }
    } else if (activeGenre === "lofi_chill") {
        currentScale = SCALES.dorian;
    } else if (activeGenre === "synthwave") {
        currentScale = SCALES.minor;
    } else if (activeGenre === "ambient") {
        currentScale = SCALES.major;
    }
    console.log(`🎛️ Receiver Bridge: Scale set to ${currentScale.name}`);
    
    // 3. Generate unique chord progression for this website seed!
    generateProgressionFromSeed(currentSeed, currentScale.intervals, currentRootBass);
    
    // 4. Generate unique drum variation pattern for this website seed!
    activeDrumPattern = generateDrumPatternForSeed(currentSeed, activeGenre);
    
    // 5. Unique BPM calculation (adds seed-based variation)
    let baseBpm = 105;
    if (textDensity === "high") {
        baseBpm = 80;
    } else if (textDensity === "low") {
        baseBpm = 125;
    }
    const bpmVariance = (currentSeed % 17) - 8; // +/- 8 BPM variance
    const finalBpm = baseBpm + bpmVariance;
    Tone.Transport.bpm.rampTo(finalBpm, 0.8);
    console.log(`🎛️ Receiver Bridge: Final BPM set to ${finalBpm} (variance ${bpmVariance})`);
    
    // 6. Dynamic Pad Synth configurations & volume calibrations
    if (activeGenre === "lofi_chill") {
        padSynth.set({
            oscillator: { type: "triangle" },
            filter: { frequency: 600 },
            envelope: { attack: 0.3, release: 1.5 }
        });
        padSynth.volume.rampTo(-18, 0.5);
        musicBus.volume.rampTo(-12, 0.5);
    } else if (activeGenre === "synthwave") {
        padSynth.set({
            oscillator: { type: "sawtooth" },
            filter: { frequency: 950 },
            envelope: { attack: 0.2, release: 1.2 }
        });
        padSynth.volume.rampTo(-16, 0.5);
        musicBus.volume.rampTo(-10, 0.5);
    } else if (activeGenre === "ambient") {
        padSynth.set({
            oscillator: { type: "sine" },
            filter: { frequency: 500 },
            envelope: { attack: 1.5, release: 3.0 }
        });
        padSynth.volume.rampTo(-14, 0.5);
        musicBus.volume.rampTo(-14, 0.5);
    } else {
        padSynth.volume.rampTo(-40, 0.5); // mute pad in Indian Classical
        musicBus.volume.rampTo(color === "dark" ? -10 : -14, 0.5);
        manjiraSynth.set({ envelope: { decay: 0.7 } }); // restore long decay for Manjira bells!
    }
}


// --- Backing Loops Helper ---
let tamburaStep = 0;
let tamburaLoop = null;
let chordLoop = null;
let currentBar = 0;

function startDrone() {
    stopDrone();
    
    currentBar = 0;
    
    if (activeGenre === "indian_fusion") {
        tamburaStep = 0;
        tamburaLoop = new Tone.Loop(time => {
            if (!isPlaying) return;
            
            const root = (currentColor === "dark") ? currentRootBass - 12 : currentRootBass; // C#1 or C#2
            const pitches = [root + 7, root + 12, root + 12, root];
            const pitch = pitches[tamburaStep % 4];
            const freq = Tone.Frequency(pitch, "midi").toFrequency();
            
            tamburaSynth.triggerAttack(freq, time);
            tamburaStep++;
        }, "2n");
        tamburaLoop.start(0);
        console.log(`🎼 Receiver Bridge: Started automated Tambura loop.`);
    } else {
        chordLoop = new Tone.Loop(time => {
            if (!isPlaying) return;
            
            const barIndex = currentBar % 4;
            let chordNotes = [];
            let root = currentRootBass;
            
            if (currentChordProgression.length === 4) {
                const chord = currentChordProgression[barIndex];
                chordNotes = chord.notes;
                root = chord.root;
            }
            
            if (activeGenre === "lofi_chill") {
                padSynth.triggerAttackRelease(chordNotes.map(n => Tone.Frequency(n, "midi").toFrequency()), "2n.", time);
            } else if (activeGenre === "synthwave") {
                padSynth.triggerAttackRelease(chordNotes.map(n => Tone.Frequency(n, "midi").toFrequency()), "2n.", time);
            } else if (activeGenre === "ambient") {
                padSynth.triggerAttackRelease(chordNotes.map(n => Tone.Frequency(n, "midi").toFrequency()), "1m", time);
            }
            
            currentActiveChordNotes = chordNotes;
            currentRootBass = root;
            currentBar++;
        }, "1m");
        chordLoop.start(0);
        console.log(`🎼 Receiver Bridge: Started chord progression loop.`);
    }
}

function stopDrone() {
    if (tamburaLoop) {
        tamburaLoop.stop();
        tamburaLoop.dispose();
        tamburaLoop = null;
    }
    if (chordLoop) {
        chordLoop.stop();
        chordLoop.dispose();
        chordLoop = null;
    }
    console.log("🎼 Receiver Bridge: Cleaned up loops.");
}


// --- TTS (Text to Speech) Helpers ---
function duckMusic() {
    musicBus.volume.rampTo(-28, 0.3);
    drumBus.volume.rampTo(-28, 0.3);
    padSynth.volume.rampTo(-28, 0.3);
    bassSynth.volume.rampTo(-28, 0.3);
    tamburaSynth.volume.rampTo(-28, 0.3);
}

function restoreMusic() {
    if (!isPlaying) return;
    
    drumBus.volume.rampTo(-12, 0.5);
    bassSynth.volume.rampTo(-12, 0.5);
    
    if (activeGenre === "lofi_chill") {
        padSynth.volume.rampTo(-18, 0.5);
        musicBus.volume.rampTo(-12, 0.5);
    } else if (activeGenre === "synthwave") {
        padSynth.volume.rampTo(-16, 0.5);
        musicBus.volume.rampTo(-10, 0.5);
    } else if (activeGenre === "ambient") {
        padSynth.volume.rampTo(-14, 0.5);
        musicBus.volume.rampTo(-14, 0.5);
    } else {
        tamburaSynth.volume.rampTo(-18, 0.5);
        musicBus.volume.rampTo(currentColor === "dark" ? -10 : -14, 0.5);
    }
}

function speak(text) {
    return new Promise(resolve => {
        duckMusic();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.onend = () => {
            restoreMusic();
            resolve();
        };
        utterance.onerror = () => {
            restoreMusic();
            resolve();
        };
        speechSynthesis.speak(utterance);
    });
}


// --- Control Functions ---
async function startRadio() {
    if (isPlaying) return;
    
    console.log("🎼 Receiver Bridge: Starting AudioContext and Playback...");
    await Tone.start();
    isPlaying = true;
    lastSequence = null;
    nextPlayTime = Tone.now() + 0.2;
    
    startDrone();
    drumSeq.start(0);
    
    await scheduleNextChunk();
    await scheduleNextChunk();
    
    Tone.Transport.start();
}

function stopRadio() {
    console.log("🎼 Receiver Bridge: Stopping Playback...");
    isPlaying = false;
    Tone.Transport.stop();
    Tone.Transport.cancel();
    
    stopDrone();
    drumSeq.stop();
    
    activeParts.forEach(p => p.dispose());
    activeParts = [];
}

function processVibeUpdate(data) {
    currentSeed = data.seed || 12345;
    const color = data.color || data.colorTheme || "light";
    const textDensity = data.textDensity || "low";
    const category = data.category || null;
    const url = data.url || "";
    
    stopRadio();
    
    applyMapping(color, textDensity, category, url);
    
    startRadio().then(() => {
        if (url) {
            try {
                const hostname = new URL(url).hostname;
                const station = getStationName(activeGenre);
                speak(`Tuning into ${hostname} on ${station}`);
            } catch (e) {
                speak("Tuning into new station");
            }
        }
    });
}


// --- Runtime Communication ---
chrome.runtime.onMessage.addListener((message) => {
    if (message.target === "offscreen") {
        console.log("🎛️ Receiver Bridge: Received vibe data from Service Worker:", message.data);
        if (iframeLoaded) {
            processVibeUpdate(message.data);
        } else {
            console.log("🎛️ Receiver Bridge: Sandbox not loaded yet, queuing vibe.");
            pendingVibe = message.data;
        }
    }
});

chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }).catch(() => {});