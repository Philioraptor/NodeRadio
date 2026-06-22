/**
 * DOM.fm - Vibe Scraper (Dev 1)
 * This script is injected into every website the user visits.
 */

// 1. Convert the URL into a consistent mathematical seed using SHA-256
async function generateUrlSeed(url) {
    const msgBuffer = new TextEncoder().encode(url);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    
    // Convert the first 4 bytes of the hash into a 32-bit unsigned integer seed
    const view = new DataView(hashBuffer);
    return view.getUint32(0, true);
}

// 2. Figure out if the page is for reading or looking (Text Density)
function getTextDensity() {
    // Grab all visible text on the page
    const text = document.body.innerText || "";
    // Count the words
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    
    // Categorize the vibe based on word count
    if (wordCount > 1500) return "high";   // e.g., Wikipedia, Medium articles
    if (wordCount > 300) return "medium";  // e.g., Standard blogs, news homepages
    return "low";                          // e.g., Image galleries, landing pages
}

// 3. Figure out if the site is dark mode or light mode
function getColorTheme() {
    let bgColor = window.getComputedStyle(document.body).backgroundColor;
    
    // If the body background is transparent, check the documentElement (html)
    if (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)" || bgColor === "rgba(0,0,0,0)") {
        bgColor = window.getComputedStyle(document.documentElement).backgroundColor;
    }
    
    // Fallback if still transparent or empty (default browser background is white/light)
    if (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)" || bgColor === "rgba(0,0,0,0)") {
        return "light";
    }
    
    // Extract the RGB/RGBA values using regex
    const rgb = bgColor.match(/\d+/g);
    
    if (rgb && rgb.length >= 3) {
        // If it has an alpha channel and it is completely transparent, treat as light fallback
        if (rgb.length === 4 && parseFloat(rgb[3]) === 0) {
            return "light";
        }
        
        // Standard formula to calculate visual brightness from RGB values
        const brightness = Math.round(((parseInt(rgb[0]) * 299) +
                                       (parseInt(rgb[1]) * 587) +
                                       (parseInt(rgb[2]) * 114)) / 1000);
        return brightness > 125 ? "light" : "dark";
    }
    return "light"; // Default fallback
}

// 4. The Master Function: Package it all up!
async function scrapeVibe() {
    const currentUrl = window.location.href;
    
    // Wait for the math to finish hashing the URL
    const seedHash = await generateUrlSeed(currentUrl);
    
    // Grab our visual/textual metrics
    const textDensity = getTextDensity();
    const colorTheme = getColorTheme();

    // The Payload (This is what you will eventually hand to Dev 2)
    const vibeData = {
        url: currentUrl,
        seed: seedHash,
        color: colorTheme, // Deliverable format requires 'color'
        colorTheme: colorTheme, // For backward compatibility
        textDensity: textDensity,
        timestamp: new Date().toISOString()
    };

    // Print it to the console so we can see it working!
    console.log("%c 🎧 DOM.fm Vibe Extracted!", "color: #00ff00; font-weight: bold; font-size: 14px;");
    console.log("Vibe Data:", vibeData);
    chrome.runtime.sendMessage({ type: "NEW_VIBE", data: vibeData });
}

// Kick off the scraper when the script loads
scrapeVibe();