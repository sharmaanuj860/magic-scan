/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function performOCR(base64Image: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(',')[1],
              },
            },
            {
              text: "Extract all text from this image accurately. Maintain the layout as much as possible. If there is no text, return 'No text found'.",
            },
          ],
        },
      ],
    });

    return response.text || "No text extracted.";
  } catch (error) {
    console.error("OCR Error:", error);
    return "Error extracting text.";
  }
}

export async function advancedEnhance(base64Image: string, mode: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(',')[1],
              },
            },
            {
              text: `This is a ${mode} scan. Please enhance this document image for maximum readability. 
              If it's a book page, flatten the curvature and correct any perspective distortion. 
              Remove shadows, increase contrast, and sharpen the text. 
              IMPORTANT: Preserve the original colors of the document. Do not convert to grayscale or black and white.
              Return ONLY the enhanced image data.`,
            },
          ],
        },
      ],
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return base64Image;
  } catch (error) {
    console.error("Advanced Enhance Error:", error);
    return base64Image;
  }
}
