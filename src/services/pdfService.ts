/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from "jspdf";
import { ScannedImage, PageSize } from "../types";

export async function generatePDF(
  images: ScannedImage[], 
  title: string = "MagicScan_Document",
  pageSize: PageSize = PageSize.A4,
  quality: number = 0.8
): Promise<Blob> {
  const format = pageSize === PageSize.ORIGINAL ? 'a4' : pageSize.toLowerCase();
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: format as any
  });

  for (let i = 0; i < images.length; i++) {
    if (i > 0) doc.addPage();
    
    const img = images[i];
    const imgData = img.enhancedUrl;
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST', 0);
  }

  return doc.output('blob');
}

export async function generateIDCardPDF(layoutDataUrl: string, quality: number = 0.8): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.addImage(layoutDataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST', 0);
  return doc.output('blob');
}
