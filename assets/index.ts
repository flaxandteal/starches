import { initSwiper } from './swiper';
import * as params from '@params';

interface BannerImage {
    name: string;
    alt: string;
}

interface BannerImagesConfig {
    path: string;
    images: BannerImage[];
}

const bannerConfig: BannerImagesConfig | undefined = params.carousel;
if (bannerConfig) {
    bannerConfig.path = bannerConfig.path || 'img';
}

if (bannerConfig?.images) {
    initSwiper(bannerConfig.images, bannerConfig.path).then(() =>
        document.querySelector('.hero-banner')?.classList.add('loaded')
    );
}
