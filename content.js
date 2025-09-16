// content.js - Fixed pause/resume with proper state management

// State management
let typingState = {
    isRunning: false,
    isPaused: false,
    text: '',
    currentIndex: 0,
    baseIKI: 200,
    startTime: 0,
    totalDuration: 0,
    pauseTime: 0,
    wordsTotal: 0,
    typingLoop: null  // Track the main typing loop
};

// Find Google Docs editor iframe
function findGoogleDocsEditor() {
    const textFrame = document.querySelector('.docs-texteventtarget-iframe');
    if (!textFrame) return null;
    
    try {
        const frameWindow = textFrame.contentWindow;
        const frameDoc = frameWindow.document;
        const editor = frameDoc.querySelector('[contenteditable="true"]');
        
        // Check if editor is valid and still part of the document
        if (editor && frameDoc.body.contains(editor)) {
            // Ensure the editor is focused for typing
            if (frameDoc.activeElement !== editor) {
                console.log('new condition found, please contact Developer. Please focus the Google Docs editor to enable typing.');
                editor.focus();
            }
            return { frameWindow, frameDoc, editor };
        }
        
        return null;
    } catch (error) {
        console.error("HumanTyperPro: Error finding Google Docs editor:", error);
        return null;
    }
}


// Generate realistic timing
function generateGaussianRandom(mean, standardDeviation) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + standardDeviation * normal;
}

// Type a single character
async function typeCharacter(char, options = {}) {
    const editorInfo = findGoogleDocsEditor();
    if (!editorInfo || !typingState.isRunning || typingState.isPaused) return false;

    const { frameWindow, frameDoc, editor } = editorInfo;

    // Calculate realistic timing
    const baseIKI = options.baseIKI || 200;
    const ikiSD = options.ikiSD || 50;

    // Generate realistic inter-key interval
    let iki = generateGaussianRandom(baseIKI, ikiSD);
    iki = Math.max(60, iki);

    // Wait for the calculated time
    await new Promise(resolve => setTimeout(resolve, iki));

    if (!typingState.isRunning || typingState.isPaused) return false;

    // Ensure editor is focused
    if (frameDoc.activeElement !== editor) {
        editor.focus();
    }

    // Use execCommand for robust text insertion
    if (char === '\n') {
        frameDoc.execCommand('insertLineBreak');
    } else {
        frameDoc.execCommand('insertText', false, char);
    }

    return true;
}


// Main typing function with total time control
async function startTyping(text, totalMinutes, startIndex = 0) {
    if (typingState.isRunning) return;
    
    // Setup state
    typingState = {
        isRunning: true,
        isPaused: false,
        text,
        currentIndex: startIndex,
        baseIKI: (totalMinutes * 60 * 1000) / text.length,
        startTime: Date.now(),
        totalDuration: totalMinutes * 60 * 1000,
        pauseTime: 0,
        wordsTotal: text.split(/\s+/).filter(word => word.length > 0).length,
        typingLoop: null
    };
    
    // Create a function for the typing loop
    const typingLoop = async () => {
        for (let i = startIndex; i < text.length; i++) {
            // Check if we've been paused
            while (typingState.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (!typingState.isRunning) {
                typingState.currentIndex = i;
                return;
            }
            
            await typeCharacter(text[i], { 
                baseIKI: typingState.baseIKI,
                ikiSD: typingState.baseIKI * 0.5 // 50% variation
            });
            
            typingState.currentIndex = i + 1;
            
            // Send progress update to popup
            chrome.runtime.sendMessage({
                type: 'TYPING_PROGRESS',
                progress: (i + 1) / text.length,
                currentIndex: i + 1,
                wordsTyped: text.substring(0, i + 1).split(/\s+/).filter(word => word.length > 0).length
            });
        }
        
        // Finished
        typingState.isRunning = false;
        typingState.typingLoop = null;
        chrome.runtime.sendMessage({
            type: 'TYPING_COMPLETE'
        });
    };
    
    // Start the typing loop
    typingState.typingLoop = typingLoop();
    await typingState.typingLoop;
}

// Pause typing
function pauseTyping() {
    if (typingState.isRunning) {
        typingState.isPaused = true;
        typingState.pauseTime = Date.now();
        
        chrome.runtime.sendMessage({
            type: 'TYPING_PAUSED',
            currentIndex: typingState.currentIndex
        });
    }
}

// Resume typing
function resumeTyping() {
    if (typingState.isRunning && typingState.isPaused) {
        const pauseDuration = Date.now() - typingState.pauseTime;
        typingState.startTime += pauseDuration;
        typingState.isPaused = false;
        
        chrome.runtime.sendMessage({
            type: 'TYPING_RESUMED',
            currentIndex: typingState.currentIndex
        });
    }
}

// Stop typing
function stopTyping() {
    typingState.isRunning = false;
    typingState.isPaused = false;
    
    chrome.runtime.sendMessage({
        type: 'TYPING_STOPPED'
    });
}

// Get current status
function getStatus() {
    return {
        isRunning: typingState.isRunning,
        isPaused: typingState.isPaused,
        currentIndex: typingState.currentIndex,
        startTime: typingState.startTime,
        pauseTime: typingState.pauseTime,
        totalDuration: typingState.totalDuration,
        wordsTotal: typingState.wordsTotal
    };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_TYPING') {
        startTyping(message.text, message.totalMinutes, message.startIndex || 0);
        sendResponse({ 
            status: 'started',
            currentIndex: typingState.currentIndex
        });
        return true;
    }
    
    if (message.type === 'PAUSE_TYPING') {
        pauseTyping();
        sendResponse({ 
            status: 'paused',
            currentIndex: typingState.currentIndex
        });
        return true;
    }
    
    if (message.type === 'RESUME_TYPING') {
        resumeTyping();
        sendResponse({ 
            status: 'resumed',
            currentIndex: typingState.currentIndex
        });
        return true;
    }
    
    if (message.type === 'STOP_TYPING') {
        stopTyping();
        sendResponse({ status: 'stopped' });
        return true;
    }
    
    if (message.type === 'GET_STATUS') {
        sendResponse(getStatus());
        return true;
    }
});