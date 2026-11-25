const MAX_OFFSCREEN_DIMENSION = 960;

export function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No fue posible cargar la fotografía seleccionada."));
    };
    img.src = objectUrl;
  });
}

export async function renderFileToOffscreenCanvas(file: File): Promise<HTMLCanvasElement> {
  const img = await loadImageElement(file);
  const rawW = img.naturalWidth || img.width || 640;
  const rawH = img.naturalHeight || img.height || 480;
  const scale = Math.min(1, MAX_OFFSCREEN_DIMENSION / Math.max(rawW, rawH));

  const offscreen = document.createElement("canvas");
  offscreen.width = Math.max(1, Math.round(rawW * scale));
  offscreen.height = Math.max(1, Math.round(rawH * scale));

  const offCtx = offscreen.getContext("2d");
  if (offCtx) {
    offCtx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
  }

  return offscreen;
}
