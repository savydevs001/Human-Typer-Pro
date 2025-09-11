// background.js
// Handles storage initialization and state persistence

// Initialize storage
chrome.runtime.onInstalled.addListener(() => {
  // Create initial state if needed
  const initialState = {
    content: '',
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
  
  chrome.storage.local.set({ humanTyperState: initialState });
});

// Listen for state updates from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_STATE') {
    chrome.storage.local.set({ humanTyperState: request.payload }, () => {
      sendResponse({ success: true });
    });
    return true; // Keep message channel open
  }
  
  if (request.type === 'GET_STATE') {
    chrome.storage.local.get(['humanTyperState'], (result) => {
      sendResponse(result.humanTyperState || {});
    });
    return true;
  }
});

// Periodic save to prevent data loss
setInterval(() => {
  chrome.storage.local.get(['humanTyperState'], (result) => {
    if (result.humanTyperState) {
      chrome.storage.local.set({ humanTyperState: result.humanTyperState });
    }
  });
}, 5000);