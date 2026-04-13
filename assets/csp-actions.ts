// CSP-compliant event delegation for data-action attributes.
// Replaces inline onclick handlers and javascript: URLs.

document.addEventListener('click', (e: Event) => {
  const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!target) return;

  const action = target.getAttribute('data-action');

  switch (action) {
    case 'close-dialog': {
      const dialogId = target.getAttribute('data-target');
      if (dialogId) {
        const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
        dialog?.close();
      }
      break;
    }

    case 'copy-link': {
      navigator.clipboard.writeText(document.location.href);
      break;
    }

    case 'reset-view': {
      e.preventDefault();
      // @ts-expect-error resetView attached in map.ts
      if (typeof window.resetView === 'function') {
        // @ts-expect-error resetView attached in map.ts
        window.resetView();
      }
      break;
    }
  }
});
