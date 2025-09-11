// popup.js - Fixed pause/resume with proper state management

document.addEventListener('DOMContentLoaded', () => {
    const contentInput = document.getElementById('content');
    const minutesInput = document.getElementById('minutes');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const stopBtn = document.getElementById('stopBtn');
    const progressFill = document.getElementById('progressFill');
    const completionPercent = document.getElementById('completionPercent');
    const timeLeftEl = document.getElementById('timeLeft');
    const wordsLeftEl = document.getElementById('wordsLeft');
    const progressContainer = document.getElementById('progressContainer');
    const tabStatusDot = document.getElementById('tabStatusDot');
    const tabStatusText = document.getElementById('tabStatusText');

    let state = {
        content: '',
        totalMinutes: 5,
        isRunning: false,
        isPaused: false,
        currentIndex: 0,
        startTime: 0,
        pauseTime: 0,
        totalDuration: 0,
        wordsTotal: 0,
        tabId: null,
        targetUrl: ''
    };

    let progressInterval = null;

    // Initialize
    init();

    async function init() {
        // Load state from storage
        chrome.storage.local.get(['humanTyperState'], (data) => {
            if (data.humanTyperState) {
                state = { ...state, ...data.humanTyperState };
            }
            
            // Restore content
            if (state.content) {
                contentInput.value = state.content;
            }
            
            // Restore minutes
            if (state.totalMinutes) {
                minutesInput.value = state.totalMinutes;
            }
            
            // Update UI
            updateUI();
            
            // Check active tab status
            checkActiveTab();
        });
    }

    function saveState() {
        chrome.storage.local.set({ 
            humanTyperState: state 
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
        const progress = state.content && state.content.length > 0 ? 
            Math.min((state.currentIndex / state.content.length) * 100, 100) : 0;
        
        progressFill.style.width = `${progress}%`;
        completionPercent.textContent = `${Math.round(progress)}%`;
        
        // Calculate time remaining
        let timeLeft = 0;
        if (state.isRunning && !state.isPaused && state.startTime > 0) {
            const elapsed = Date.now() - state.startTime;
            timeLeft = Math.max(0, state.totalDuration - elapsed);
        } else if (state.isPaused && state.pauseTime > 0) {
            const pauseDuration = Date.now() - state.pauseTime;
            timeLeft = Math.max(0, state.totalDuration - (state.pauseTime - state.startTime) + pauseDuration);
        }
        
        const mins = Math.floor(timeLeft / 60000);
        const secs = Math.floor((timeLeft % 60000) / 1000);
        timeLeftEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        // Calculate words left
        const wordsTyped = state.content ? 
            state.content.substring(0, state.currentIndex)
                .split(/\s+/).filter(word => word.length > 0).length : 0;
        const wordsTotal = state.content ? 
            state.content.split(/\s+/).filter(word => word.length > 0).length : 0;
        wordsLeftEl.textContent = Math.max(0, wordsTotal - wordsTyped);
    }

    function startProgressMonitor() {
        clearInterval(progressInterval);
        progressInterval = setInterval(updateProgressDisplay, 1000);
    }

    function stopProgressMonitor() {
        clearInterval(progressInterval);
    }

    function checkActiveTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            
            if (activeTab && activeTab.url && activeTab.url.includes('docs.google.com/document')) {
                tabStatusDot.className = 'status-dot active';
                tabStatusText.textContent = 'Google Doc active';
                
                // Update state with tab info
                state.tabId = activeTab.id;
                state.targetUrl = activeTab.url;
                saveState();
                
                // If we have a saved state for this tab
                if (state.isRunning) {
                    tabStatusText.textContent = state.isPaused ? 
                        'Typing paused' : 'Typing in progress...';
                }
            } else {
                tabStatusDot.className = 'status-dot inactive';
                tabStatusText.textContent = 'No Google Doc active';
            }
        });
    }

    // Event listeners
    contentInput.addEventListener('input', () => {
        state.content = contentInput.value;
        state.wordsTotal = state.content.split(/\s+/).filter(word => word.length > 0).length;
        saveState();
    });

    minutesInput.addEventListener('input', () => {
        state.totalMinutes = parseInt(minutesInput.value) || 5;
        saveState();
    });

    startBtn.addEventListener('click', async () => {
        if (!state.content || state.content.trim() === '') {
            alert('Please paste content first');
            return;
        }
        
        // Check if we're on a Google Doc
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('docs.google.com/document')) {
            alert('Please open a Google Doc first!');
            return;
        }
        
        const totalMinutes = parseInt(minutesInput.value) || 5;
        const totalDuration = totalMinutes * 60 * 1000;
        
        // Save state
        state.isRunning = true;
        state.isPaused = false;
        state.currentIndex = 0;
        state.startTime = Date.now();
        state.totalDuration = totalDuration;
        state.wordsTotal = state.content.split(/\s+/).filter(word => word.length > 0).length;
        state.tabId = tab.id;
        state.targetUrl = tab.url;
        
        saveState();
        updateUI();
        startProgressMonitor();
        
        // Start typing
        chrome.tabs.sendMessage(tab.id, {
            type: 'START_TYPING',
            text: state.content,
            totalMinutes: totalMinutes
        }, (response) => {
            if (chrome.runtime.lastError) {
                alert('Failed to start typing. Please ensure you\'re on a Google Doc.');
                state.isRunning = false;
                saveState();
                updateUI();
            }
        });
    });

    pauseBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        
        chrome.tabs.sendMessage(tab.id, { type: 'PAUSE_TYPING' }, (response) => {
            if (response && response.status === 'paused') {
                state.isPaused = true;
                state.pauseTime = Date.now();
                saveState();
                updateUI();
                stopProgressMonitor();
            }
        });
    });

    resumeBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        
        chrome.tabs.sendMessage(tab.id, { type: 'RESUME_TYPING' }, (response) => {
            if (response && response.status === 'resumed') {
                state.isPaused = false;
                saveState();
                updateUI();
                startProgressMonitor();
            }
        });
    });

    stopBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        
        chrome.tabs.sendMessage(tab.id, { type: 'STOP_TYPING' }, () => {
            state.isRunning = false;
            state.isPaused = false;
            state.currentIndex = 0;
            saveState();
            updateUI();
            stopProgressMonitor();
        });
    });

    // Listen for progress updates
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'TYPING_PROGRESS') {
            state.currentIndex = message.currentIndex;
            saveState();
            updateProgressDisplay();
        }
        
        if (message.type === 'TYPING_PAUSED') {
            state.isPaused = true;
            state.pauseTime = Date.now();
            saveState();
            updateUI();
            stopProgressMonitor();
        }
        
        if (message.type === 'TYPING_RESUMED') {
            state.isPaused = false;
            saveState();
            updateUI();
            startProgressMonitor();
        }
        
        if (message.type === 'TYPING_COMPLETE' || message.type === 'TYPING_STOPPED') {
            state.isRunning = false;
            state.isPaused = false;
            saveState();
            updateUI();
            stopProgressMonitor();
            
            if (message.type === 'TYPING_COMPLETE') {
                alert('Typing completed successfully!');
            }
        }
    });

    // Check tab status periodically
    setInterval(checkActiveTab, 5000);
    
    // Also check when window gains focus
    window.addEventListener('focus', checkActiveTab);
});