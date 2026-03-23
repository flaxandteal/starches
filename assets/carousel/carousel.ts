import type { ImageInput } from '../shared';
import { getConfig } from '../shared';
import { getCarouselProvider, getRegisteredProviders } from './registry';
import './providers';

export async function initCarousel(images: ImageInput[], options?: { showModal?: boolean }): Promise<void> {
  if (!images.length) return;

  const container = document.querySelector('.carousel') as HTMLElement;
  if (!container) return;

  const config = await getConfig();
  if (config.carousel === false) return;

  const providerName = config.carousel || 'swiper';
  const provider = getCarouselProvider(providerName);

  if (!provider) {
    console.error(`[Carousel] Provider "${providerName}" not registered. Available: ${getRegisteredProviders().join(', ')}`);
    return;
  }

  const carouselConfig = container.dataset.config;
  await provider.init(images, container, carouselConfig);

  const showModal = options?.showModal ?? container.dataset.showModal === 'true';
  if (showModal) {
    const { setupModal } = await import('./image-modal');
    setupModal(images);
  }
}
