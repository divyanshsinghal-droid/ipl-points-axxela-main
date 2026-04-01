export function showToast(msg, type = 'info') {
  window.dispatchEvent(new CustomEvent('captain-toast', { detail: { msg, type } }));
}
