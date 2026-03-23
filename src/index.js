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

import App from './App';
import AppSettings from './AppSettings';

export default {
  component: App,
  settings: AppSettings,
};
