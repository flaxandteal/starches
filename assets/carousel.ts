import { ImageInput, CarouselProvider } from './shared/types';
import { setupModal } from './image-modal';

const providers: Map<string, CarouselProvider> = new Map();
let defaultProvider: string | null = null;

export function registerCarouselProvider(name: string, provider: CarouselProvider, isDefault = false): void {
  providers.set(name, provider);
  if (isDefault || !defaultProvider) {
    defaultProvider = name;
  }
}

export async function initCarousel(images: ImageInput[], options?: { showModal?: boolean }): Promise<void> {
  if (!images.length) return;

  const container = document.querySelector('.swiper') as HTMLElement;
  if (!container) return;

  const providerName = container.dataset.carouselProvider || defaultProvider;
  if (!providerName) {
    console.error('[Carousel] No provider registered');
    return;
  }

  const provider = providers.get(providerName);
  if (!provider) {
    console.error(`[Carousel] Provider "${providerName}" not found`);
    return;
  }

  const config = container.dataset.config;
  await provider.init(images, container, config);

  const showModal = options?.showModal ?? container.dataset.showModal === 'true';
  if (showModal) {
    setupModal(images);
  }
}

// Register swiper as default provider
import { swiperCarouselProvider } from './swiper';
registerCarouselProvider('swiper', swiperCarouselProvider, true);
