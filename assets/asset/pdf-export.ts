import { markdownToPdf, PdfImage } from './pdf-make';
import { ImageInput } from '../shared/types';

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensurePdfMake(): Promise<typeof import('pdfmake/build/pdfmake')['default']> {
  if (!(window as any).pdfMake) {
    await loadScript('/js/pdfmake.min.js');
    await loadScript('/js/vfs_fonts.js');
  }
  return (window as any).pdfMake;
}

export async function renderPDFAsset(markdown: string, nodes: Map<string, any>, title: string, assetImages: ImageInput[]) {
  const [pdfMake, pdfImages] = await Promise.all([
    ensurePdfMake(),
    Promise.all(
      assetImages.map(async (img) => {
        try {
          const dataUrl = await fetchImageAsDataUrl(img.previewUrl || img.originalUrl);
          return { dataUrl, alt: img.alt, name: img.name } as PdfImage;
        } catch {
          return null;
        }
      })
    ).then(imgs => imgs.filter((img): img is PdfImage => img !== null)),
  ]);

  const pdf = await markdownToPdf(markdown, nodes, title, pdfImages);
  pdfMake.createPdf(pdf).download(`${title}.pdf`);
}
