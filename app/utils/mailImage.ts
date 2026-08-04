/** 우편물 대장 이미지 — 원본은 크게 받아도 저장용으로 축소·압축 */

/** 선택 가능한 원본 파일 상한 (압축 전) */
export const MAIL_IMAGE_PICK_MAX_BYTES = 20 * 1024 * 1024;

/** 압축 후 data URL 문자 수 상한 (~3MB 바이너리, base64 오버헤드 포함) */
export const MAIL_IMAGE_DATA_URL_MAX_CHARS = 4_200_000;

const MAX_EDGE = 2000;
const JPEG_QUALITY_STEPS = [0.88, 0.8, 0.72, 0.64, 0.55];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name}: 이미지를 읽지 못했습니다.`));
    };
    img.src = url;
  });
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * 큰 사진을 우편물 저장용 JPEG data URL로 변환.
 * 긴 변 MAX_EDGE 이하로 리사이즈 후, 용량 한도에 맞을 때까지 품질을 낮춥니다.
 */
export async function compressMailImageFile(file: File): Promise<{
  name: string;
  contentType: string;
  dataUrl: string;
}> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name}: 이미지 파일만 올릴 수 있습니다.`);
  }
  if (file.size > MAIL_IMAGE_PICK_MAX_BYTES) {
    throw new Error(`${file.name}: 원본이 너무 큽니다. 장당 20MB 이하로 올려 주세요.`);
  }

  // 이미 충분히 작으면 그대로 (jpeg/png/webp)
  if (file.size <= 2.5 * 1024 * 1024 && file.type === 'image/jpeg') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error(`${file.name}: 이미지를 읽지 못했습니다.`));
      reader.readAsDataURL(file);
    });
    if (dataUrl.length <= MAIL_IMAGE_DATA_URL_MAX_CHARS) {
      return { name: file.name, contentType: file.type, dataUrl };
    }
  }

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`${file.name}: 이미지 압축에 실패했습니다.`);
  ctx.drawImage(img, 0, 0, w, h);

  let dataUrl = '';
  for (const q of JPEG_QUALITY_STEPS) {
    dataUrl = canvasToJpegDataUrl(canvas, q);
    if (dataUrl.length <= MAIL_IMAGE_DATA_URL_MAX_CHARS) {
      const base = file.name.replace(/\.[^.]+$/, '') || 'image';
      return {
        name: `${base}.jpg`,
        contentType: 'image/jpeg',
        dataUrl,
      };
    }
  }

  throw new Error(`${file.name}: 압축 후에도 용량이 큽니다. 해상도가 낮은 사진으로 다시 올려 주세요.`);
}
