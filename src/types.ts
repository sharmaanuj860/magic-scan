/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ScanMode {
  SINGLE = 'SINGLE',
  BOOK = 'BOOK',
  ID_CARD = 'ID_CARD',
}

export enum PageSize {
  A4 = 'A4',
  LETTER = 'LETTER',
  ORIGINAL = 'ORIGINAL',
}

export interface ScannedImage {
  id: string;
  dataUrl: string;
  enhancedUrl: string;
  timestamp: number;
  ocrText?: string;
}

export interface IDCardScan {
  front?: ScannedImage;
  back?: ScannedImage;
}

export interface SavedPDF {
  id: string;
  name: string;
  mode: ScanMode;
  blobUrl: string;
  timestamp: number;
  thumbnail: string;
}
