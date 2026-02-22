/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from "jspdf";
import { ScannedImage, PageSize, ColorMode, BookStyle } from "../types";
import { applyColorMode } from "../utils/imageProcessing";

export async function generatePDF(
  images: ScannedImage[], 
  title: string = "MagicScan_Document",
  pageSize: PageSize = PageSize.A4,
  quality: number = 0.8,
  colorMode: ColorMode = ColorMode.COLOR,
  bookStyle: BookStyle = BookStyle.ONE_BY_ONE
): Promise<Blob> {
  const format = pageSize === PageSize.ORIGINAL ? 'a4' : pageSize.toLowerCase();
  
  const isFlip = bookStyle === BookStyle.FLIP;
  
  const doc = new jsPDF({
    orientation: isFlip ? 'landscape' : 'portrait',
    unit: 'mm',
    format: format as any
  });

  if (isFlip) {
    // Two images per page
    for (let i = 0; i < images.length; i += 2) {
      if (i > 0) doc.addPage();
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const halfWidth = pageWidth / 2;

      // Left Image
      const img1 = images[i];
      const imgData1 = await applyColorMode(img1.enhancedUrl, colorMode);
      doc.addImage(imgData1, 'JPEG', 0, 0, halfWidth, pageHeight, undefined, 'FAST', 0);

      // Right Image (if exists)
      if (images[i + 1]) {
        const img2 = images[i + 1];
        const imgData2 = await applyColorMode(img2.enhancedUrl, colorMode);
        doc.addImage(imgData2, 'JPEG', halfWidth, 0, halfWidth, pageHeight, undefined, 'FAST', 0);
      }
    }
  } else {
    // One image per page
    for (let i = 0; i < images.length; i++) {
      if (i > 0) doc.addPage();
      
      const img = images[i];
      const imgData = await applyColorMode(img.enhancedUrl, colorMode);
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST', 0);
    }
  }

  return doc.output('blob');
}

export async function generateIDCardPDF(
  layoutDataUrl: string, 
  quality: number = 0.8,
  colorMode: ColorMode = ColorMode.COLOR
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const processedLayout = await applyColorMode(layoutDataUrl, colorMode);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.addImage(processedLayout, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST', 0);
  return doc.output('blob');
}
