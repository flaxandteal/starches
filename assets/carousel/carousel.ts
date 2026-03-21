import { ImageInput, CarouselProvider } from '../shared/types';

const providers: Map<string, CarouselProvider> = new Map();
let defaultProvider: string | null = null;

export function registerCarouselProvider(name: string, provider: CarouselProvider, isDefault = false): void {
  providers.set(name, provider);
  if (isDefault || !defaultProvider) {
    defaultProvider = name;
  }
}

async function loadDefaultProvider(): Promise<void> {
  if (providers.size > 0) return;

  const { swiperCarouselProvider } = await import('./swiper');
  registerCarouselProvider('swiper', swiperCarouselProvider, true);
}

export async function initCarousel(images: ImageInput[], options?: { showModal?: boolean }): Promise<void> {
  if (!images.length) return;

  const container = document.querySelector('.carousel') as HTMLElement;
  if (!container) return;

  await loadDefaultProvider();

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
    const { setupModal } = await import('./image-modal');
    setupModal(images);
  }
}
