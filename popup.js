// popup.js - Simplified to work with the new content.js

document.addEventListener('DOMContentLoaded', () => {
    const contentInput = document.getElementById('content');
    const minutesInput = document.getElementById('minutes');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const stopBtn = document.getElementById('stopBtn');
    const progressFill = document.getElementById('progressFill');
    const timeLeftEl = document.getElementById('timeLeft');
    const wordsLeftEl = document.getElementById('wordsLeft');
    const progressContainer = document.getElementById('progressContainer');

    let state = {
        content: '',
        totalMinutes: 5,
        isRunning: false,
        isPaused: false,
        currentIndex: 0,
        wordsTotal: 0
    };

    // Initialize
    init();

    async function init() {
        // Restore saved content
        chrome.storage.local.get(['content', 'totalMinutes', 'typingState'], (data) => {
            if (data.content) {
                contentInput.value = data.content;
                state.content = data.content;
            }
            if (data.totalMinutes) {
                minutesInput.value = data.totalMinutes;
                state.totalMinutes = data.totalMinutes;
            }
            if (data.typingState) {
                state = { ...state, ...data.typingState };
                updateUI();
                if (state.isRunning && !state.isPaused) {
                    startProgressMonitor();
                }
            }
        });
    }

    function updateUI() {
        startBtn.disabled = state.isRunning;
        pauseBtn.disabled = !state.isRunning || state.isPaused;
        resumeBtn.disabled = !state.isRunning || !state.isPaused;
        stopBtn.disabled = !state.isRunning && !state.isPaused;
        
        if (state.isRunning || state.currentIndex > 0) {
            progressContainer.style.display = 'block';
            updateProgressDisplay();
        } else {
            progressContainer.style.display = 'none';
        }
    }

    function updateProgressDisplay() {
        const progress = state.content ? 
            Math.min((state.currentIndex / state.content.length) * 100, 100) : 0;
        
        progressFill.style.width = `${progress}%`;
        
        // Calculate time remaining
        let timeLeft = 0;
        if (state.isRunning && !state.isPaused) {
            const elapsed = Date.now() - state.startTime;
            timeLeft = Math.max(0, state.totalDuration - elapsed);
        } else if (state.isPaused) {
            timeLeft = Math.max(0, state.totalDuration - (state.pauseTime - state.startTime));
        }
        
        const mins = Math.floor(timeLeft / 60000);
        const secs = Math.floor((timeLeft % 60000) / 1000);
        timeLeftEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        // Calculate words left
        const wordsTyped = state.content.substring(0, state.currentIndex)
            .split(/\s+/).filter(word => word.length > 0).length;
        const wordsTotal = state.content.split(/\s+/).filter(word => word.length > 0).length;
        wordsLeftEl.textContent = Math.max(0, wordsTotal - wordsTyped);
    }

    function startProgressMonitor() {
        setInterval(updateProgressDisplay, 1000);
    }

    // Event listeners
    contentInput.addEventListener('input', () => {
        state.content = contentInput.value;
        chrome.storage.local.set({ content: state.content });
        
        // Calculate words
        state.wordsTotal = state.content.split(/\s+/).filter(word => word.length > 0).length;
    });

    minutesInput.addEventListener('input', () => {
        state.totalMinutes = parseInt(minutesInput.value) || 5;
        chrome.storage.local.set({ totalMinutes: state.totalMinutes });
    });

    startBtn.addEventListener('click', async () => {
        if (!state.content) {
            alert('Please paste content first');
            return;
        }
        
        const totalMinutes = parseInt(minutesInput.value) || 5;
        
        // Save state
        state.isRunning = true;
        state.isPaused = false;
        state.currentIndex = 0;
        state.startTime = Date.now();
        state.totalDuration = totalMinutes * 60 * 1000;
        state.wordsTotal = state.content.split(/\s+/).filter(word => word.length > 0).length;
        
        chrome.storage.local.set({ typingState: state });
        updateUI();
        startProgressMonitor();
        
        // Get active Google Doc tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Start typing
        chrome.tabs.sendMessage(tab.id, {
            type: 'START_TYPING',
            text: state.content,
            totalMinutes: totalMinutes
        });
    });

    pauseBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { type: 'PAUSE_TYPING' });
        
        state.isPaused = true;
        state.pauseTime = Date.now();
        chrome.storage.local.set({ typingState: state });
        updateUI();
    });

    resumeBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { type: 'RESUME_TYPING' });
        
        state.isPaused = false;
        chrome.storage.local.set({ typingState: state });
        updateUI();
        startProgressMonitor();
    });

    stopBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { type: 'STOP_TYPING' });
        
        state.isRunning = false;
        state.isPaused = false;
        chrome.storage.local.set({ typingState: state });
        updateUI();
    });

    // Listen for progress updates
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'TYPING_PROGRESS') {
            state.currentIndex = message.currentIndex;
            chrome.storage.local.set({ typingState: state });
            updateProgressDisplay();
        }
        
        if (message.type === 'TYPING_COMPLETE') {
            state.isRunning = false;
            chrome.storage.local.set({ typingState: state });
            updateUI();
            alert('Typing completed successfully!');
        }
    });
});