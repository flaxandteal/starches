import Swiper from 'swiper/bundle';
import { ImageInput, CarouselProvider } from './shared/types';
import { swiperConfigs } from './swiper-config';

export type { ImageInput } from './shared/types';

function getRandomImages(images: ImageInput[], amount: number): ImageInput[] {
  const sortedImages = images.sort(() => Math.random() - 0.5);
  return sortedImages.slice(0, amount);
}

function createSwiper(config: string): any {
  const carouselConfig = swiperConfigs[config];
  if (!carouselConfig) {
    console.error(`[Swiper] Unknown config: ${config}`);
    return null;
  }
  return new Swiper('.swiper', carouselConfig);
}

function populateSlides(wrapper: Element, images: ImageInput[], config: string): Promise<void> {
  wrapper.innerHTML = '';
  const carouselConfig = swiperConfigs[config] || {};
  return new Promise((resolve) => {
    images.forEach((imageData, index) => {
      const slide = document.createElement('div');
      slide.className = `swiper-slide ${config}`;

      if ('includeAltText' in carouselConfig && carouselConfig.includeAltText) {
        const slideText = document.createElement('div');
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

export const swiperCarouselProvider: CarouselProvider = {
  async init(images, container, config) {
    if (!images.length) return;

    const wrapper = container.querySelector('.swiper-wrapper');
    if (!wrapper) return;

    const carouselConfig = config || container.dataset.config;
    if (!carouselConfig) {
      console.error('[Swiper] No config provided');
      return;
    }

    const { count } = container.dataset;

    let previewImages = images;
    if (count) {
      previewImages = getRandomImages(previewImages, parseInt(count));
    }

    await populateSlides(wrapper, previewImages, carouselConfig);

    const swiper = createSwiper(carouselConfig);
    if (!swiper) return;

    container.classList.add('loaded');
  }
};
