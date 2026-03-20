import { ImageInput } from 'swiper';

export interface ImageRef {
  image: any;
  index: number;
}

export interface Dialog {
  title: string;
  body: string;
}

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

export function categorizeExternalReferences(nonstaticAsset: any): {
  images: ImageRef[];
  files: any[];
  otherEcrs: any[];
} {
  const images: ImageRef[] = [];
  const files: any[] = [];
  const otherEcrs: any[] = [];

  const ecrs = nonstaticAsset.external_cross_references;
  if (!ecrs?.length) {
    return { images, files, otherEcrs };
  }

  ecrs.forEach((ecr: any, index: number) => {
    const type = ecr.external_cross_reference_notes?.external_cross_reference_description?.toLowerCase();

    if (ecr.url && type === 'image') {
      images.push({ image: ecr, index });
    } else if (ecr.url && ['pdf', 'doc', 'docx'].includes(type)) {
      files.push(ecr);
    } else {
      otherEcrs.push(ecr);
    }
  });

  return { images, files, otherEcrs };
}

export async function buildImageDialogs(images: ImageRef[], assetTitle: string): Promise<Record<string, Dialog>> {
  const dialogs: Record<string, Dialog> = {};

  for (const { image, index } of images) {
    dialogs[`image_${index}`] = {
      title: `<h3>Image for ${assetTitle}</h3>\n<h4>${await image.external_cross_reference}</h4>`,
      body: `<img src='${image.url.__clean}' />`
    };
  }

  return dialogs;
}
