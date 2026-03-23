import type { ImageInput } from '../shared';

async function downloadImage(e: Event, url: string): Promise<void> {
  e.preventDefault();
  if (!url) return;

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = url.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Download failed:', error);
    window.open(url, '_blank');
  }
}

export function setupModal(imageList: ImageInput[]): void {
  const modal = document.getElementById('image-modal') as HTMLElement;
  const modalImg = document.getElementById('modal-img') as HTMLImageElement;
  const modalCaption = document.getElementById('modal-caption') as HTMLElement;
  const closeModal = document.getElementById('close-modal') as HTMLElement;
  const prevBtn = document.getElementById('modal-prev') as HTMLButtonElement;
  const nextBtn = document.getElementById('modal-next') as HTMLButtonElement;
  const downloadOriginalLink = modal?.querySelector('#download-original-image') as HTMLAnchorElement;
  const downloadReducedLink = modal?.querySelector('#download-reduced-image') as HTMLAnchorElement;

  if (!modal || !modalImg || !closeModal) {
    console.error('Modal elements not found');
    return;
  }

  let currentIndex = 0;

  function showImage(index: number): void {
    if (index < 0) index = imageList.length - 1;
    if (index >= imageList.length) index = 0;
    currentIndex = index;

    const image = imageList[currentIndex];
    modalImg.src = image.previewUrl || '';
    modalImg.alt = image.caption || image.alt || '';
    modalCaption.textContent = modalImg.alt;
  }

  // Handle download button click
  if (downloadOriginalLink) {
    downloadOriginalLink.addEventListener('click', (e) => {
      const originalImageURL = imageList.find(img => img.previewUrl === modalImg.src)?.originalUrl || '';
      downloadImage(e, originalImageURL);
    });
  }

  if (downloadReducedLink) {
    downloadReducedLink.addEventListener('click', (e) => downloadImage(e, modalImg.src));
  }

  document.querySelectorAll('.carousel-slide img').forEach((img, index) => {
    img.addEventListener('click', function () {
      currentIndex = index;
      showImage(currentIndex);
      modal.classList.add('active');
    });
  });

  // Navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showImage(currentIndex - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showImage(currentIndex + 1);
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('active')) return;

    if (e.key === 'ArrowLeft') {
      showImage(currentIndex - 1);
    } else if (e.key === 'ArrowRight') {
      showImage(currentIndex + 1);
    } else if (e.key === 'Escape') {
      modal.classList.remove('active');
    }
  });

  closeModal.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}
