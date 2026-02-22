/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorMode } from '../types';

export function enhanceImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original
      ctx.drawImage(img, 0, 0);

      // Apply "Magic" filters
      // 1. Increase contrast
      // 2. Increase brightness
      // 3. Optional: Grayscale + Thresholding for document feel
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Simple Auto-Leveling / Contrast Enhancement
      let min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (avg < min) min = avg;
        if (avg > max) max = avg;
      }

      // Adaptive Thresholding / Local Contrast Enhancement
      const range = max - min;
      const threshold = min + range * 0.5; // Simple global threshold for fallback

      for (let i = 0; i < data.length; i += 4) {
        // Apply enhancement to each channel individually to preserve color
        for (let j = 0; j < 3; j++) {
          let val = data[i + j];
          
          // Contrast stretching
          val = ((val - min) / (range || 1)) * 255;
          
          // Gamma correction for brightness
          val = 255 * Math.pow(val / 255, 0.8);
          
          // Subtle background cleaning (only if very bright)
          if (val > 235) val = 255;
          
          data[i + j] = Math.max(0, Math.min(255, val));
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = dataUrl;
  });
}

export function applyColorMode(dataUrl: string, mode: ColorMode): Promise<string> {
  if (mode === ColorMode.COLOR) return Promise.resolve(dataUrl);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Grayscale conversion (Luminance)
        let gray = 0.299 * r + 0.587 * g + 0.114 * b;

        if (mode === ColorMode.BLACK_WHITE) {
          // Simple thresholding for B&W
          gray = gray > 128 ? 255 : 0;
        }

        data[i] = data[i + 1] = data[i + 2] = gray;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = dataUrl;
  });
}

export function detectEdges(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = imageData.width;
      const height = imageData.height;

      const grayscale = new Uint8ClampedArray(width * height);
      for (let i = 0; i < data.length; i += 4) {
        grayscale[i / 4] = (data[i] + data[i + 1] + data[i + 2]) / 3;
      }

      const sobelData = new Uint8ClampedArray(width * height);
      const kernelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
      const kernelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let pixelX = 0;
          let pixelY = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixel = grayscale[(y + ky) * width + (x + kx)];
              pixelX += pixel * kernelX[ky + 1][kx + 1];
              pixelY += pixel * kernelY[ky + 1][kx + 1];
            }
          }

          const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
          sobelData[y * width + x] = magnitude > 50 ? 255 : 0;
        }
      }

      for (let i = 0; i < data.length; i += 4) {
        const edge = sobelData[i / 4];
        if (edge === 255) {
          data[i] = 16;     // Emerald-500-ish
          data[i + 1] = 185;
          data[i + 2] = 129;
          data[i + 3] = 255;
        } else {
          data[i + 3] = 100; // Semi-transparent original
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

export function cropImage(dataUrl: string, x: number, y: number, width: number, height: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = dataUrl;
  });
}

export function perspectiveWarp(
  dataUrl: string, 
  corners: { x: number, y: number }[], 
  outWidth: number, 
  outHeight: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      canvas.width = outWidth;
      canvas.height = outHeight;

      // We'll use a simple approach: for each pixel in the output, 
      // find the corresponding pixel in the input using the inverse transform.
      // We need the perspective-transform library for this.
      // But since we can't easily import it here without a build step in this tool,
      // I'll implement a basic homography solver or just use the library if I can import it.
      
      // Actually, I'll use the library I just installed.
      import('perspective-transform').then((PerspT) => {
        const srcCorners = [
          corners[0].x, corners[0].y,
          corners[1].x, corners[1].y,
          corners[2].x, corners[2].y,
          corners[3].x, corners[3].y
        ];
        const dstCorners = [
          0, 0,
          outWidth, 0,
          outWidth, outHeight,
          0, outHeight
        ];

        const perspT = (PerspT as any).default(srcCorners, dstCorners);
        const invT = (PerspT as any).default(dstCorners, srcCorners);

        const inputCanvas = document.createElement('canvas');
        inputCanvas.width = img.width;
        inputCanvas.height = img.height;
        const inputCtx = inputCanvas.getContext('2d')!;
        inputCtx.drawImage(img, 0, 0);
        const inputData = inputCtx.getImageData(0, 0, img.width, img.height);
        
        const outputData = ctx.createImageData(outWidth, outHeight);

        for (let y = 0; y < outHeight; y++) {
          for (let x = 0; x < outWidth; x++) {
            const srcPt = invT.transform(x, y);
            const sx = Math.floor(srcPt[0]);
            const sy = Math.floor(srcPt[1]);

            if (sx >= 0 && sx < img.width && sy >= 0 && sy < img.height) {
              const outIdx = (y * outWidth + x) * 4;
              const inIdx = (sy * img.width + sx) * 4;
              outputData.data[outIdx] = inputData.data[inIdx];
              outputData.data[outIdx + 1] = inputData.data[inIdx + 1];
              outputData.data[outIdx + 2] = inputData.data[inIdx + 2];
              outputData.data[outIdx + 3] = inputData.data[inIdx + 3];
            }
          }
        }

        ctx.putImageData(outputData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      });
    };
    img.src = dataUrl;
  });
}

export function createIDCardLayout(front: string, back: string): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve('');

    canvas.width = 2480; // A4 Width at 300 DPI
    canvas.height = 3508; // A4 Height at 300 DPI

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const frontImg = new Image();
    const backImg = new Image();

    let loaded = 0;
    const onLoaded = () => {
      loaded++;
      if (loaded === 2) {
        // Standard ID card ratio is ~1.58
        // We want to fit them nicely on the top half of A4
        const maxWidth = canvas.width * 0.8;
        const maxHeight = (canvas.height / 2) * 0.4;

        // Calculate dynamic dimensions for front
        let frontWidth = maxWidth;
        let frontHeight = (frontImg.height / frontImg.width) * frontWidth;
        
        if (frontHeight > maxHeight) {
          frontHeight = maxHeight;
          frontWidth = (frontImg.width / frontImg.height) * frontHeight;
        }

        // Calculate dynamic dimensions for back
        let backWidth = maxWidth;
        let backHeight = (backImg.height / backImg.width) * backWidth;

        if (backHeight > maxHeight) {
          backHeight = maxHeight;
          backWidth = (backImg.width / backImg.height) * backHeight;
        }

        const centerX = (canvas.width - frontWidth) / 2;
        const startY = 300;

        // Draw Front
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 5;
        ctx.strokeRect(centerX - 5, startY - 5, frontWidth + 10, frontHeight + 10);
        ctx.drawImage(frontImg, centerX, startY, frontWidth, frontHeight);

        // Draw Back
        const backY = startY + frontHeight + 200;
        const backCenterX = (canvas.width - backWidth) / 2;
        ctx.strokeRect(backCenterX - 5, backY - 5, backWidth + 10, backHeight + 10);
        ctx.drawImage(backImg, backCenterX, backY, backWidth, backHeight);

        // Labels
        ctx.fillStyle = '#6b7280';
        ctx.font = 'bold 60px sans-serif';
        ctx.fillText('FRONT SIDE', centerX, startY - 40);
        ctx.fillText('BACK SIDE', backCenterX, backY - 40);

        resolve(canvas.toDataURL('image/jpeg', 0.8));
      }
    };

    frontImg.onload = onLoaded;
    backImg.onload = onLoaded;
    frontImg.src = front;
    backImg.src = back;
  });
}
