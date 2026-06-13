/**
 * AI Voice Chat — Background Service Worker
 *
 * Handles extension-level events: keyboard shortcuts, icon badges,
 * and keeps the extension alive for reconnection.
 */

// ── Installation ──────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log('AI Voice Chat extension installed:', details.reason);

  // Set initial badge
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
});

// ── Keyboard Commands ─────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    // Default behavior — opens the popup
  }
});

// ── Message relay from popup ──────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received:', message);

  if (message.type === 'update_badge') {
    if (message.count > 0) {
      chrome.action.setBadgeText({ text: String(message.count) });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }

  sendResponse({ received: true });
  return true;
});

// ── Health check (optional). ──────────────────────────────────────

console.log('AI Voice Chat background service worker active');
