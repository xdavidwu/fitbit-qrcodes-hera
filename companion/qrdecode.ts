import { Decoder, Detector, binarize, grayscale } from '@nuintun/qrcode';

export const qrdecode = async (uri: string): Promise<string> => {
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.addEventListener('error', reject);
    image.addEventListener('load', () => {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, image.width, image.height);

      const detectData = binarize(grayscale(imageData), image.width, image.height);
      const detector = new Detector();
      const detection = detector.detect(detectData);

      const decoder = new Decoder();
      for (const candidate of detection) {
        console.log('candidate at', candidate.alignment);
        try {
          const result = decoder.decode(candidate.matrix);
          resolve(result.content);
        } catch {
        }
      }
      reject(new Error('No QR code detected'));
    });

    image.src = uri;
  });
};
