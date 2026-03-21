import { CarouselProvider } from '../shared/types';

const providers: Map<string, CarouselProvider> = new Map();

export function registerCarouselProvider(name: string, provider: CarouselProvider): void {
  providers.set(name, provider);
}

export function getCarouselProvider(name: string): CarouselProvider | undefined {
  return providers.get(name);
}

export function getRegisteredProviders(): string[] {
  return Array.from(providers.keys());
}
