export interface ImageInput {
  name: string;
  alt: string;
  caption: string;
  previewUrl?: string;
  originalUrl?: string;
}

export interface CarouselProvider {
  init(images: ImageInput[], container: HTMLElement, config?: string): Promise<void>;
}
