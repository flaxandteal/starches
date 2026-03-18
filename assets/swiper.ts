import Swiper from 'swiper/bundle';

export interface ImageInput {
  name: string;
  alt: string;
  caption: string;
  previewUrl?: string;
  originalUrl?: string;
}

function getRandomImages(images: ImageInput[], amount: number): ImageInput[] {
  const sortedImages = images.sort(() => Math.random() - 0.5);
  return sortedImages.slice(0, amount);
}

const swiperConfigs = {
  coverflow: {
    effect: 'coverflow',
    grabCursor: true,
    direction: 'horizontal',
    coverflowEffect: {
      rotate: 50,
      stretch: 0,
      depth: 100,
      modifier: 1,
      slideShadows: true,
    },
    slidesPerView: 'auto',
    centeredSlides: true,
    pagination: {
      clickable: true,
      el: '.swiper-pagination',
    },
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },
    watchSlidesProgress: true,
    slideToClickedSlide: true
  },
  hero: {
    loop: true,
    autoplay: {
      delay: 6000,
      disableOnInteraction: false,
    },
    pagination: {
      clickable: true,
      el: ".swiper-pagination",
    },
    includeAltText: true,
  }
}

function createSwiper(config: string): any {
  if (!config){
    console.error('No config has been set for Swiper')
  }

  const carouselConfig = swiperConfigs[config]

  return new Swiper('.swiper', carouselConfig);
}

function populateSlides(wrapper: Element, images: ImageInput[], config: string): Promise<void> {
  wrapper.innerHTML = '';
  const carouselConfig = swiperConfigs[config]
  return new Promise((resolve) => { 
    images.forEach((imageData, index) => {
      
      const slide = document.createElement('div');
      slide.className = `swiper-slide ${config}`;
      const slideText = document.createElement('div');
      if ('includeAltText' in carouselConfig && carouselConfig.includeAltText) {
        slideText.className = 'slide-text';
        slideText.textContent = imageData.alt;
        slide.appendChild(slideText);
      }
      const img = document.createElement('img');
      img.src = imageData.previewUrl;
      img.alt = imageData.alt;
      img.style.cursor = 'pointer';

      // Lazy load all images except the first one
      if (index > 0) {
        img.loading = 'lazy';
      }

      if (index === 0) {
        if (img.complete) {
          resolve();
        } else {
          img.addEventListener('load', () => resolve());
          img.addEventListener('error', () => resolve());
        }
      }

      slide.appendChild(img);
      wrapper.appendChild(slide);
    });
  });
}

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

function setupModal(imageList: ImageInput[]): void {
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
      downloadImage(e, originalImageURL)
    });
  }

  if (downloadReducedLink) {
    downloadReducedLink.addEventListener('click', (e) => downloadImage(e, modalImg.src));
  }

  document.querySelectorAll('.swiper-slide img').forEach((img, index) => {
    img.addEventListener('click', function () {
      currentIndex = index;
      showImage(currentIndex);
      modal.style.display = 'flex';
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
    if (modal.style.display !== 'flex') return;

    if (e.key === 'ArrowLeft') {
      showImage(currentIndex - 1);
    } else if (e.key === 'ArrowRight') {
      showImage(currentIndex + 1);
    } else if (e.key === 'Escape') {
      modal.style.display = 'none';
    }
  });

  closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
}

export async function initSwiper(imageList: ImageInput[], path: string): Promise<void> {
  const container = document.querySelector('.swiper') as HTMLElement;
  if (!container) {
    console.error('[Swiper] Swiper container not found');
    return;
  }

  const wrapper = container.querySelector('.swiper-wrapper');
  if (!wrapper) {
    console.error('[Swiper] Swiper wrapper not found');
    return;
  }

  const { config = 'hero', showModal, count } = container.dataset;

  let previewImages = imageList

  if (count) {
    previewImages = getRandomImages(previewImages, parseInt(count));
  }

  await populateSlides(wrapper, previewImages, config);

  // Create swiper AFTER slides are populated
  const swiper = createSwiper(config);
  if (!swiper) return;

  if (showModal === 'true') {
    setupModal(imageList);
  }

  container.classList.add('loaded');
}
