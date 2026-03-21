interface DialogContent {
  title: string;
  body: string;
}

const dialogs: Map<string, DialogContent> = new Map();

export function registerDialogs(entries: Record<string, DialogContent>): void {
  for (const [id, content] of Object.entries(entries)) {
    dialogs.set(id, content);
  }
}

export function showDialog(dialogId: string): void {
  const content = dialogs.get(dialogId);
  if (!content) {
    console.error(`[Dialog] Unknown dialog: ${dialogId}`);
    return;
  }

  // Try asset-dialog first, fall back to map-dialog
  const dialogEl = (document.getElementById('asset-dialog') || document.getElementById('map-dialog')) as HTMLDialogElement | null;
  if (!dialogEl) return;

  const prefix = dialogEl.id;
  const headingEl = document.getElementById(`${prefix}__heading`);
  const contentEl = document.getElementById(`${prefix}__content`);

  if (headingEl) headingEl.innerHTML = content.title;
  if (contentEl) contentEl.innerHTML = content.body;
  dialogEl.showModal();
}

export function setupDialogLinks(): void {
  const links = document.getElementsByClassName('dialog-link');
  for (const link of links) {
    link.addEventListener('click', function (this: HTMLElement) {
      const dialogId = this.getAttribute('data-dialog-id');
      if (dialogId) showDialog(dialogId);
    });
  }
}
