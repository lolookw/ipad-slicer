const isolationStatus = document.querySelector<HTMLParagraphElement>('#isolation-status');

if (isolationStatus) {
  isolationStatus.textContent = self.crossOriginIsolated
    ? 'Cross-origin isolated: yes (SharedArrayBuffer available)'
    : 'Cross-origin isolated: no (single-thread only)';
}
