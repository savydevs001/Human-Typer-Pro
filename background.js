// background.js
// Handles storage initialization and state persistence
// Fixes "chrome.storage.local is undefined" error

let state = {
  content: '',
  tabId: null,
  isRunning: false,
  isPaused: false,
  progress: 0,
  currentIndex: 0,
  totalDuration: 0,
  startTime: 0,
  pauseTime: 0,
  targetUrl: ''
};

// Initialize storage
chrome.runtime.onInstalled.addListener(() => {
  saveState();
});

// Listen for state updates from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_STATE') {
    state = { ...state, ...request.payload };
    saveState();
    sendResponse({ success: true });
    return true; // Keep message channel open
  }
  
  if (request.type === 'GET_STATE') {
    sendResponse(state);
    return true;
  }
  
  if (request.type === 'RESET_STATE') {
    state = {
      content: '',
      tabId: null,
      isRunning: false,
      isPaused: false,
      progress: 0,
      currentIndex: 0,
      totalDuration: 0,
      startTime: 0,
      pauseTime: 0,
      targetUrl: ''
    };
    saveState();
    sendResponse({ success: true });
    return true;
  }
});

// Save state to storage
function saveState() {
  chrome.storage.local.set({ state });
}

// Load state from storage
function loadState() {
  chrome.storage.local.get(['state'], (result) => {
    if (result.state) {
      state = result.state;
    }
  });
}

// Initialize on startup
loadState();

// Periodic save to prevent data loss
setInterval(saveState, 5000);