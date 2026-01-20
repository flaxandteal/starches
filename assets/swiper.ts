import Swiper from 'swiper/bundle';

interface ImageInput {
  name: string;
  alt: string;
  url?: string;
}

interface ImageData {
  url: string;
  alt: string;
}

function buildImageURLs(imageList: ImageInput[], baseUrl: string, path: string): ImageData[] {
  return imageList.map(image => {
    const lastDot = image.name.lastIndexOf('.');
    const name = image.name.substring(0, lastDot);
    return {
      url: image.url || `${baseUrl}/${path}/${name}_web.jpg`,
      alt: image.alt || 'Heritage site image'
    };
  });
}

function getRandomImages(images: ImageData[], amount: number): ImageData[] {
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
    slideToClickedSlide: true,
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
  }
}

function createSwiper(config: string): any {
  if (!config){
    console.error('No config has been set for Swiper')
  }

  const carouselConfig = swiperConfigs[config]

  return new Swiper('.swiper', carouselConfig);
}

function populateSlides(wrapper: Element, images: ImageData[], config: string): Promise<void> {
  wrapper.innerHTML = '';
  return new Promise((resolve) => {
    images.forEach((imageData, index) => {
      const slide = document.createElement('div');
      slide.className = `swiper-slide ${config}`;
      const img = document.createElement('img');
      img.src = imageData.url;
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

async function downloadImage(e: Event, type: string, extensions: { name: string; ext: string }[] = null): Promise<void> {
    e.preventDefault();
    const img = document.querySelector('#modal-img') as HTMLImageElement;
    let url = img.src.split('_web')[0]

    if(type === 'reduced'){
      url = `${url}_download.jpg`;
    }

    if(type === 'original' && extensions){
      const filename = img.src.split('/').pop();
      const imgName = filename.substring(0, filename.indexOf('_web'));
      const extObj = extensions.find(ext => ext.name === imgName);
      if(extObj){
        url = `${url}.${extObj.ext}`;
      }
    }

    console.log("Downloading from URL:", url)

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

function setupModal(extensions: { name: string; ext: string }[]): void {
  const modal = document.getElementById('image-modal') as HTMLElement;
  const modalImg = document.getElementById('modal-img') as HTMLImageElement;
  const modalCaption = document.getElementById('modal-caption') as HTMLElement;
  const closeModal = document.getElementById('close-modal') as HTMLElement;
  const downloadOriginalLink = modal?.querySelector('#download-original-image') as HTMLAnchorElement;
  const downloadReducedLink = modal?.querySelector('#download-reduced-image') as HTMLAnchorElement;

  if (!modal || !modalImg || !closeModal) {
    console.error('Modal elements not found');
    return;
  }

  // Handle download button click
  if (downloadOriginalLink) {
    downloadOriginalLink.addEventListener('click', (e) => downloadImage(e, 'original', extensions));
  }

  if (downloadReducedLink) {
    downloadReducedLink.addEventListener('click', (e) => downloadImage(e, 'reduced'));
  }

  document.querySelectorAll('.swiper-slide img').forEach(img => {
    img.addEventListener('click', function () {
      const imgSrc = (this as HTMLImageElement).src;
      modalImg.src = imgSrc;
      modalImg.alt = img.getAttribute('alt') || '';
      modal.style.display = 'flex';
      modalCaption.textContent = modalImg.alt;
    });
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

  const { blobUrl, config = 'hero', showModal, count } = container.dataset;
  let images = buildImageURLs(imageList, blobUrl, path);

  // Store the original extensions for download links
  const extensions = imageList.map(image => {
    const lastDot = image.name.lastIndexOf('.');
    return {
      name: image.name.substring(0, lastDot),
      ext: image.name.substring(lastDot + 1)
    };
  });

  if (count) {
    images = getRandomImages(images, parseInt(count));
  }

  await populateSlides(wrapper, images, config);

  // Create swiper AFTER slides are populated
  const swiper = createSwiper(config);
  if (!swiper) return;

  if (showModal === 'true') {
    setupModal(extensions);
  }

  container.classList.add('loaded');
}
