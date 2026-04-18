// Suppress benign ResizeObserver loop error before Corva's error overlay catches it
const origError = window.onerror;
window.onerror = (message, ...args) => {
  if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
    return true;
  }
  return origError ? origError(message, ...args) : false;
};
window.addEventListener('error', (e) => {
  if (e.message?.includes('ResizeObserver loop')) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

// Suppress unhandled promise rejections from dc-platform-shared's dev shell
// (e.g. auth flow failures that surface as [object Object] in the error overlay)
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  // Only suppress non-Error rejections (plain objects from Corva API responses)
  if (reason && typeof reason === 'object' && !(reason instanceof Error)) {
    console.warn('[YieldTracker] Suppressed unhandled rejection:', reason);
    e.preventDefault();
  }
}, true);

import App from './App';
import AppSettings from './AppSettings';

export default {
  component: App,
  settings: AppSettings,
};
