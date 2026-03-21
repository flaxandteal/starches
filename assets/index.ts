import { initCarousel } from './carousel/carousel';
import { ImageInput } from './shared/types';
import * as params from '@params';

interface BannerImagesConfig {
    path: string;
    images: ImageInput[];
}

const bannerConfig: BannerImagesConfig | undefined = params.carousel;

if (bannerConfig?.images) {
    initCarousel(bannerConfig.images).then(() =>
        document.querySelector('.hero-banner')?.classList.add('loaded')
    );
}
