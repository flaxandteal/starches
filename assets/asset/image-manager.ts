import { ImageInput } from '../swiper';

export async function extractImageList(imageList: any[]): Promise<ImageInput[]> {
  const images: ImageInput[] = [];
  if (!imageList || imageList.length === 0) return [];

  await Promise.all(imageList.map(async (imageList) => {
    const image = imageList[0];

    if (!image) {
      console.warn("Missing image", imageList);
      return;
    }

    images.push({
      name: await image.name,
      previewUrl: (await imageList._.preview[0]?.url) ?? (await image.url),
      originalUrl: await image.url,
      alt: (await image._file && await image._file.alt_text) || (await image.name),
      caption: (await imageList._.captions.caption)
    });
  }));

  return images;
}
