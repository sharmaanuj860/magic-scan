/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  FileText, 
  Image as ImageIcon, 
  Plus, 
  Trash2, 
  Download, 
  Sparkles, 
  BookOpen, 
  CreditCard, 
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  FileDown,
  FileCheck,
  Type,
  Library,
  Share2,
  Save,
  MoreVertical,
  Crop,
  RefreshCw,
  Maximize2,
  GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ScanMode, ScannedImage, IDCardScan, PageSize, SavedPDF, ColorMode, BookStyle } from './types';
import { enhanceImage, createIDCardLayout, detectEdges, cropImage, perspectiveWarp } from './utils/imageProcessing';
import { generatePDF, generateIDCardPDF } from './services/pdfService';
import { performOCR, advancedEnhance } from './services/geminiService';
import confetti from 'canvas-confetti';

interface SortableScanProps {
  key?: string;
  scan: ScannedImage;
  index: number;
  onDelete: (id: string) => void;
  onPreview: (scan: ScannedImage) => void;
}

function SortableScan({ scan, index, onDelete, onPreview }: SortableScanProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: scan.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      className="group relative aspect-[3/4] bg-white rounded-2xl overflow-hidden shadow-md border border-[#141414]/5 cursor-pointer"
      onClick={() => onPreview(scan)}
    >
      <img src={scan.enhancedUrl} className="w-full h-full object-cover" />
      <div className="absolute top-2 left-2 p-1.5 bg-white/80 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical size={14} className="text-[#141414]/60" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
        <div className="flex items-center justify-between text-white">
          <span className="text-xs font-bold">Page {index + 1}</span>
          <div className="flex gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(scan.id); }}
              className="p-2 bg-red-500/80 hover:bg-red-500 rounded-full transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [mode, setMode] = useState<ScanMode>(ScanMode.SINGLE);
  const [scans, setScans] = useState<ScannedImage[]>([]);
  const [idCardScan, setIdCardScan] = useState<IDCardScan>({});
  const [isScanning, setIsScanning] = useState(false);
  const [activePreview, setActivePreview] = useState<ScannedImage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<string | null>(null);
  const [autoCapture, setAutoCapture] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [useAI, setUseAI] = useState(false);
  const [view, setView] = useState<'scanner' | 'library'>('scanner');
  const [savedDocs, setSavedDocs] = useState<any[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [pdfName, setPdfName] = useState('');
  const [selectedPageSize, setSelectedPageSize] = useState<PageSize>(PageSize.A4);
  const [quality, setQuality] = useState(0.8);
  const [colorMode, setColorMode] = useState<ColorMode>(ColorMode.COLOR);
  const [bookStyle, setBookStyle] = useState<BookStyle>(BookStyle.ONE_BY_ONE);
  const [performBatchOCR, setPerformBatchOCR] = useState(false);
  const [showConfirmDownload, setShowConfirmDownload] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<string>('ALL');
  const [edgeDetection, setEdgeDetection] = useState(false);
  const [edgeOverlay, setEdgeOverlay] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isPerspective, setIsPerspective] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 10, y: 10, w: 80, h: 80 }); // Percentages
  const [corners, setCorners] = useState([
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 90 },
    { x: 10, y: 90 }
  ]);
  const [isDraggingCrop, setIsDraggingCrop] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBtn(false);
    }
    setDeferredPrompt(null);
  };

  const handleResize = async (ratio: number | 'original') => {
    if (!activePreview) return;
    setIsProcessing(true);
    
    const img = new Image();
    img.src = activePreview.enhancedUrl;
    await new Promise(r => img.onload = r);

    let newW = img.width;
    let newH = img.height;

    if (ratio !== 'original') {
      if (img.width / img.height > ratio) {
        newW = img.height * ratio;
      } else {
        newH = img.width / ratio;
      }
    }

    const croppedUrl = await cropImage(activePreview.enhancedUrl, (img.width - newW) / 2, (img.height - newH) / 2, newW, newH);
    
    setScans(prev => prev.map(s => s.id === activePreview.id ? { ...s, enhancedUrl: croppedUrl } : s));
    setActivePreview(prev => prev ? { ...prev, enhancedUrl: croppedUrl } : null);
    setIsResizing(false);
    setIsProcessing(false);
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingCrop) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (isPerspective) {
      const cornerIdx = parseInt(isDraggingCrop);
      if (!isNaN(cornerIdx)) {
        setCorners(prev => {
          const next = [...prev];
          next[cornerIdx] = { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
          return next;
        });
      }
      return;
    }

    setCropBox(prev => {
      if (isDraggingCrop === 'move') {
        return { ...prev, x: Math.max(0, Math.min(100 - prev.w, x - prev.w / 2)), y: Math.max(0, Math.min(100 - prev.h, y - prev.h / 2)) };
      }
      if (isDraggingCrop === 'nw') return { ...prev, x, y, w: prev.w + (prev.x - x), h: prev.h + (prev.y - y) };
      if (isDraggingCrop === 'ne') return { ...prev, y, w: x - prev.x, h: prev.h + (prev.y - y) };
      if (isDraggingCrop === 'sw') return { ...prev, x, w: prev.w + (prev.x - x), h: y - prev.y };
      if (isDraggingCrop === 'se') return { ...prev, w: x - prev.x, h: y - prev.y };
      return prev;
    });
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Persistence
  useEffect(() => {
    const savedScans = localStorage.getItem('magic_scans');
    if (savedScans) {
      try {
        setScans(JSON.parse(savedScans));
      } catch (e) {
        console.error("Failed to load scans", e);
      }
    }
    const savedLibrary = localStorage.getItem('magic_library');
    if (savedLibrary) {
      try {
        setSavedDocs(JSON.parse(savedLibrary));
      } catch (e) {
        console.error("Failed to load library", e);
      }
    }
  }, []);

  useEffect(() => {
    if (scans.length > 0) {
      localStorage.setItem('magic_scans', JSON.stringify(scans));
    } else {
      localStorage.removeItem('magic_scans');
    }
  }, [scans]);

  useEffect(() => {
    localStorage.setItem('magic_library', JSON.stringify(savedDocs));
  }, [savedDocs]);

  // Camera Setup
  useEffect(() => {
    if (isScanning) {
      // Small delay to ensure the video element is mounted
      const timer = setTimeout(() => {
        startCamera();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
    }
  }, [isScanning]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isScanning && autoCapture && !isProcessing) {
      setCountdown(3);
      timer = setInterval(() => {
        setCountdown(prev => {
          if (prev === 1) {
            captureImage();
            return 3;
          }
          return prev ? prev - 1 : 3;
        });
      }, 1000);
    } else {
      setCountdown(null);
    }
    return () => clearInterval(timer);
  }, [isScanning, autoCapture, isProcessing]);

  const startCamera = async () => {
    try {
      // Try environment camera first, fallback to any camera
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
        });
      } catch (e) {
        console.warn("Environment camera failed, falling back to default", e);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Ensure it plays
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.error("Video play failed:", playErr);
        }
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions and ensure you are using HTTPS.");
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn("Video not ready for capture yet");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    if (edgeDetection) {
      const edges = await detectEdges(dataUrl);
      setEdgeOverlay(edges);
      // We'll show the preview first if edge detection is on? 
      // Actually, let's just process it normally but maybe show a quick flash
    }

    await processNewImage(dataUrl);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setScans((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleRetake = () => {
    if (activePreview) {
      deleteScan(activePreview.id);
      setActivePreview(null);
      setIsScanning(true);
    }
  };

  const handleCrop = async () => {
    if (!activePreview) return;
    setIsProcessing(true);
    
    const img = new Image();
    img.src = activePreview.enhancedUrl;
    await new Promise(r => img.onload = r);
    
    let processedUrl: string;

    if (isPerspective) {
      // Convert percentages to pixels
      const pixelCorners = corners.map(c => ({
        x: (c.x / 100) * img.width,
        y: (c.y / 100) * img.height
      }));
      
      // Calculate output dimensions (A4 ratio or similar)
      const outW = 1000;
      const outH = 1414;
      processedUrl = await perspectiveWarp(activePreview.enhancedUrl, pixelCorners, outW, outH);
    } else {
      const x = (cropBox.x / 100) * img.width;
      const y = (cropBox.y / 100) * img.height;
      const w = (cropBox.w / 100) * img.width;
      const h = (cropBox.h / 100) * img.height;
      processedUrl = await cropImage(activePreview.enhancedUrl, x, y, w, h);
    }
    
    setScans(prev => prev.map(s => s.id === activePreview.id ? { ...s, enhancedUrl: processedUrl } : s));
    setActivePreview(prev => prev ? { ...prev, enhancedUrl: processedUrl } : null);
    setIsCropping(false);
    setIsPerspective(false);
    setIsProcessing(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsProcessing(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        await processNewImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
    setIsProcessing(false);
  };

  const processNewImage = async (dataUrl: string) => {
    setIsProcessing(true);
    let enhancedUrl = await enhanceImage(dataUrl);
    
    if (useAI) {
      enhancedUrl = await advancedEnhance(enhancedUrl, mode);
    }
    
    const newScan: ScannedImage = {
      id: Math.random().toString(36).substr(2, 9),
      dataUrl,
      enhancedUrl,
      timestamp: Date.now(),
    };

    if (mode === ScanMode.ID_CARD) {
      if (!idCardScan.front) {
        setIdCardScan(prev => ({ ...prev, front: newScan }));
      } else if (!idCardScan.back) {
        setIdCardScan(prev => ({ ...prev, back: newScan }));
      }
    } else {
      setScans(prev => [...prev, newScan]);
    }

    setIsProcessing(false);
    setIsScanning(false);
    
    // Success feedback
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#3b82f6', '#ffffff']
    });
  };

  const handleOCR = async (scan: ScannedImage) => {
    setIsProcessing(true);
    const text = await performOCR(scan.enhancedUrl);
    setOcrResult(text);
    setIsProcessing(false);
  };

  const handleExportPDF = async () => {
    setSaveModalOpen(true);
  };

  const confirmSave = async () => {
    setIsProcessing(true);
    
    let finalScans = [...scans];
    let finalIdCardScan = { ...idCardScan };

    if (performBatchOCR) {
      if (mode === ScanMode.ID_CARD) {
        if (finalIdCardScan.front) {
          const text = await performOCR(finalIdCardScan.front.enhancedUrl);
          finalIdCardScan.front = { ...finalIdCardScan.front, ocrText: text };
        }
        if (finalIdCardScan.back) {
          const text = await performOCR(finalIdCardScan.back.enhancedUrl);
          finalIdCardScan.back = { ...finalIdCardScan.back, ocrText: text };
        }
      } else {
        finalScans = await Promise.all(scans.map(async (scan) => {
          const text = await performOCR(scan.enhancedUrl);
          return { ...scan, ocrText: text };
        }));
      }
    }

    let blob: Blob;
    let thumbnail: string = '';
    
    if (mode === ScanMode.ID_CARD && finalIdCardScan.front && finalIdCardScan.back) {
      const layout = await createIDCardLayout(finalIdCardScan.front.enhancedUrl, finalIdCardScan.back.enhancedUrl);
      blob = await generateIDCardPDF(layout, quality, colorMode);
      thumbnail = layout;
    } else {
      blob = await generatePDF(finalScans, pdfName, selectedPageSize, quality, colorMode, bookStyle);
      thumbnail = finalScans[0]?.enhancedUrl || '';
    }

    const fileName = `${pdfName || 'MagicScan'}_${new Date().getTime()}.pdf`;
    
    // Save to library
    const newDoc = {
      id: Math.random().toString(36).substr(2, 9),
      name: pdfName || 'Untitled Scan',
      mode,
      timestamp: Date.now(),
      thumbnail,
      scans: mode === ScanMode.ID_CARD ? [finalIdCardScan.front, finalIdCardScan.back] : [...finalScans],
      pageSize: selectedPageSize,
      quality,
      colorMode,
      bookStyle,
      performBatchOCR
    };

    setSavedDocs(prev => [newDoc, ...prev]);
    
    // Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();

    setScans([]);
    setIdCardScan({});
    setSaveModalOpen(false);
    setPdfName('');
    setIsProcessing(false);
    setView('library');
    
    confetti({
      particleCount: 150,
      spread: 100,
      origin: { y: 0.6 }
    });
  };

  const handleShare = async (doc: any) => {
    setIsProcessing(true);
    let blob: Blob;
    if (doc.mode === ScanMode.ID_CARD) {
      const layout = await createIDCardLayout(doc.scans[0].enhancedUrl, doc.scans[1].enhancedUrl);
      blob = await generateIDCardPDF(layout, doc.quality || 0.8, doc.colorMode || ColorMode.COLOR);
    } else {
      blob = await generatePDF(doc.scans, doc.name, doc.pageSize, doc.quality || 0.8, doc.colorMode || ColorMode.COLOR, doc.bookStyle || BookStyle.ONE_BY_ONE);
    }

    const file = new File([blob], `${doc.name}.pdf`, { type: 'application/pdf' });
    
    if (navigator.share) {
      try {
        await navigator.share({
          files: [file],
          title: doc.name,
          text: 'Check out this PDF from MagicScan!'
        });
      } catch (err) {
        console.error("Share failed:", err);
      }
    } else {
      // Fallback: just download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name}.pdf`;
      a.click();
    }
    setIsProcessing(false);
  };

  const deleteScan = (id: string) => {
    setScans(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans selection:bg-emerald-200">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[#141414]/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">MagicScan</h1>
            <p className="text-[10px] uppercase tracking-widest opacity-50 font-semibold">AI PDF Maker</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {showInstallBtn && (
            <button 
              onClick={handleInstallClick}
              className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-md"
            >
              <Plus size={14} />
              <span>Install App</span>
            </button>
          )}
          <button 
            onClick={() => setView(view === 'scanner' ? 'library' : 'scanner')}
            className={`p-2 rounded-full transition-colors ${view === 'library' ? 'bg-emerald-600 text-white' : 'text-emerald-600 hover:bg-emerald-50'}`}
            title={view === 'scanner' ? 'Go to Library' : 'Go to Scanner'}
          >
            {view === 'scanner' ? <Library size={20} /> : <Camera size={20} />}
          </button>
          
          {view === 'scanner' && (
            <>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 hover:bg-emerald-50 rounded-full transition-colors text-emerald-600"
                title="Import from storage"
              >
                <ImageIcon size={20} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                multiple 
                accept="image/*" 
                onChange={handleFileUpload}
              />
            </>
          )}
          
          {view === 'scanner' && (scans.length > 0 || (idCardScan.front && idCardScan.back)) && (
            <>
              <button 
                onClick={() => {
                  if (confirm("Clear all scans?")) {
                    setScans([]);
                    setIdCardScan({});
                    localStorage.removeItem('magic_scans');
                  }
                }}
                className="p-2 hover:bg-red-50 rounded-full transition-colors text-red-500"
                title="Clear all"
              >
                <Trash2 size={20} />
              </button>
              <button 
                onClick={handleExportPDF}
                className="flex items-center gap-2 bg-[#141414] text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-emerald-600 transition-all active:scale-95 shadow-lg"
              >
                <Save size={18} />
                <span>Save PDF</span>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 pb-32">
        {view === 'scanner' ? (
          <>
            {/* Mode Selector */}
        <div className="flex justify-center mb-8">
          <div className="bg-white p-1 rounded-2xl shadow-sm border border-[#141414]/5 flex gap-1">
            {[
              { id: ScanMode.SINGLE, icon: FileText, label: 'Single' },
              { id: ScanMode.BOOK, icon: BookOpen, label: 'Book' },
              { id: ScanMode.ID_CARD, icon: CreditCard, label: 'ID Card' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMode(m.id as ScanMode);
                  setScans([]);
                  setIdCardScan({});
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  mode === m.id 
                    ? 'bg-emerald-600 text-white shadow-md' 
                    : 'text-[#141414]/60 hover:bg-emerald-50 hover:text-emerald-600'
                }`}
              >
                <m.icon size={16} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Empty State */}
        {scans.length === 0 && !idCardScan.front && !isScanning && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl border border-[#141414]/5">
              <Camera size={40} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Ready to scan?</h2>
            <p className="text-[#141414]/50 max-w-xs mx-auto mb-8">
              Capture documents, books, or ID cards and turn them into crystal clear PDFs.
            </p>
            <button 
              onClick={() => setIsScanning(true)}
              className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 active:scale-95 flex items-center gap-3 mx-auto"
            >
              <Plus size={24} />
              <span>Start Scanning</span>
            </button>
          </motion.div>
        )}

        {/* ID Card Mode Specific UI */}
        {mode === ScanMode.ID_CARD && (idCardScan.front || idCardScan.back) && (
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest opacity-40">Front Side</p>
              {idCardScan.front ? (
                <div className="relative group aspect-[1.6/1] rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-lg">
                  <img src={idCardScan.front.enhancedUrl} className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setIdCardScan(prev => ({ ...prev, front: undefined }))}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsScanning(true)}
                  className="aspect-[1.6/1] w-full rounded-2xl border-2 border-dashed border-[#141414]/10 flex flex-col items-center justify-center gap-2 hover:border-emerald-500 hover:bg-emerald-50 transition-all"
                >
                  <Plus size={24} className="text-emerald-600" />
                  <span className="text-sm font-medium">Scan Front</span>
                </button>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest opacity-40">Back Side</p>
              {idCardScan.back ? (
                <div className="relative group aspect-[1.6/1] rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-lg">
                  <img src={idCardScan.back.enhancedUrl} className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setIdCardScan(prev => ({ ...prev, back: undefined }))}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsScanning(true)}
                  className="aspect-[1.6/1] w-full rounded-2xl border-2 border-dashed border-[#141414]/10 flex flex-col items-center justify-center gap-2 hover:border-emerald-500 hover:bg-emerald-50 transition-all"
                >
                  <Plus size={24} className="text-emerald-600" />
                  <span className="text-sm font-medium">Scan Back</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scans Grid */}
        {mode !== ScanMode.ID_CARD && scans.length > 0 && (
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <SortableContext 
                items={scans.map(s => s.id)}
                strategy={rectSortingStrategy}
              >
                <AnimatePresence>
                  {scans.map((scan: ScannedImage, index: number) => (
                    <SortableScan 
                      key={scan.id} 
                      scan={scan} 
                      index={index} 
                      onDelete={deleteScan}
                      onPreview={setActivePreview}
                    />
                  ))}
                  <motion.button
                    layout
                    onClick={() => setIsScanning(true)}
                    className="aspect-[3/4] rounded-2xl border-2 border-dashed border-[#141414]/10 flex flex-col items-center justify-center gap-2 hover:border-emerald-500 hover:bg-emerald-50 transition-all"
                  >
                    <Plus size={32} className="text-emerald-600" />
                    <span className="text-sm font-bold opacity-40">Add Page</span>
                  </motion.button>
                </AnimatePresence>
              </SortableContext>
            </div>
          </DndContext>
        )}
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Your Library</h2>
              <div className="text-sm text-[#141414]/40 font-medium">
                {savedDocs.length} Documents
              </div>
            </div>

            {/* Library Tabs */}
            <div className="flex gap-2 p-1 bg-white rounded-2xl border border-[#141414]/5 shadow-sm overflow-x-auto">
              {['ALL', ScanMode.SINGLE, ScanMode.BOOK, ScanMode.ID_CARD].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setLibraryFilter(tab)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    libraryFilter === tab 
                      ? 'bg-emerald-600 text-white shadow-md' 
                      : 'text-[#141414]/40 hover:bg-emerald-50'
                  }`}
                >
                  {tab === 'ALL' ? 'All Scans' : tab === ScanMode.SINGLE ? 'Single Pages' : tab === ScanMode.BOOK ? 'Books' : 'ID Cards'}
                </button>
              ))}
            </div>

            {savedDocs.filter(d => libraryFilter === 'ALL' || d.mode === libraryFilter).length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-[#141414]/10">
                <Library size={48} className="mx-auto mb-4 text-[#141414]/20" />
                <p className="text-[#141414]/40 font-medium">No documents found in this category.</p>
                <button 
                  onClick={() => setView('scanner')}
                  className="mt-4 text-emerald-600 font-bold hover:underline"
                >
                  Start Scanning
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {savedDocs
                  .filter(d => libraryFilter === 'ALL' || d.mode === libraryFilter)
                  .map((doc) => (
                  <motion.div 
                    key={doc.id}
                    layout
                    className="bg-white p-4 rounded-2xl border border-[#141414]/5 shadow-sm flex gap-4 group"
                  >
                    <div className="w-20 h-28 bg-[#F5F5F0] rounded-lg overflow-hidden flex-shrink-0 border">
                      <img src={doc.thumbnail} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <h3 className="font-bold text-lg line-clamp-1">{doc.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded">
                            {doc.mode}
                          </span>
                          <span className="text-[10px] text-[#141414]/40 font-medium">
                            {new Date(doc.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleShare(doc)}
                          className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors"
                        >
                          <Share2 size={14} />
                          <span>Share</span>
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm("Delete this document?")) {
                              setSavedDocs(prev => prev.filter(d => d.id !== doc.id));
                            }
                          }}
                          className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Save Modal */}
      <AnimatePresence>
        {saveModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold mb-6">Save Document</h3>
              
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest opacity-40 mb-2 block">Document Name</label>
                  <input 
                    type="text" 
                    value={pdfName}
                    onChange={(e) => setPdfName(e.target.value)}
                    placeholder="e.g. My Aadhar Card"
                    className="w-full bg-[#F5F5F0] border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-medium"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest opacity-40 mb-2 block">Page Size</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[PageSize.A4, PageSize.LETTER, PageSize.ORIGINAL].map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedPageSize(size)}
                        className={`py-3 rounded-xl text-xs font-bold border-2 transition-all ${
                          selectedPageSize === size 
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-600' 
                            : 'border-[#141414]/5 text-[#141414]/40 hover:border-emerald-200'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest opacity-40 mb-2 block">Color Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: ColorMode.COLOR, label: 'Color' },
                      { id: ColorMode.GRAYSCALE, label: 'Grayscale' },
                      { id: ColorMode.BLACK_WHITE, label: 'B&W' },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setColorMode(mode.id)}
                        className={`py-3 rounded-xl text-xs font-bold border-2 transition-all ${
                          colorMode === mode.id 
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-600' 
                            : 'border-[#141414]/5 text-[#141414]/40 hover:border-emerald-200'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === ScanMode.BOOK && (
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest opacity-40 mb-2 block">Book Style</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: BookStyle.ONE_BY_ONE, label: 'One by One' },
                        { id: BookStyle.FLIP, label: 'Flip Mode' },
                      ].map((style) => (
                        <button
                          key={style.id}
                          onClick={() => setBookStyle(style.id)}
                          className={`py-3 rounded-xl text-xs font-bold border-2 transition-all ${
                            bookStyle === style.id 
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-600' 
                              : 'border-[#141414]/5 text-[#141414]/40 hover:border-emerald-200'
                          }`}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between bg-[#F5F5F0] p-4 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                      <Type size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Batch OCR</p>
                      <p className="text-[10px] opacity-50">Extract text from all scans</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setPerformBatchOCR(!performBatchOCR)}
                    className={`w-12 h-6 rounded-full transition-all relative ${performBatchOCR ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${performBatchOCR ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-widest opacity-40 block">Image Quality</label>
                    <span className="text-xs font-bold text-emerald-600">{Math.round(quality * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="1.0" 
                    step="0.1"
                    value={quality}
                    onChange={(e) => setQuality(parseFloat(e.target.value))}
                    className="w-full h-2 bg-emerald-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setSaveModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-[#141414]/40 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => setShowConfirmDownload(true)}
                    className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100"
                  >
                    Save & Download
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Bar */}
      {!isScanning && (scans.length > 0 || (mode === ScanMode.ID_CARD && (idCardScan.front || idCardScan.back))) && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
          <button 
            onClick={() => setIsScanning(true)}
            className="bg-emerald-600 text-white p-5 rounded-full shadow-2xl shadow-emerald-200 hover:scale-110 active:scale-95 transition-all"
          >
            <Camera size={32} />
          </button>
        </div>
      )}

      {/* Camera Overlay */}
      <AnimatePresence>
        {isScanning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            <div className="flex items-center justify-between p-6 text-white">
              <button onClick={() => setIsScanning(false)} className="p-2 hover:bg-white/10 rounded-full">
                <X size={24} />
              </button>
              <div className="flex flex-col items-center">
                <div className="text-sm font-bold uppercase tracking-widest">
                  {mode === ScanMode.ID_CARD 
                    ? (!idCardScan.front ? 'Scan Front' : 'Scan Back')
                    : mode === ScanMode.BOOK ? `Scanning Book (Page ${scans.length + 1})` : 'Scanning Document'}
                </div>
                {autoCapture && (
                  <div className="text-[10px] text-emerald-400 font-bold animate-pulse">AUTO-CAPTURE ON</div>
                )}
              </div>
              <button 
                onClick={() => setAutoCapture(!autoCapture)}
                className={`p-2 rounded-full transition-all ${autoCapture ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/60'}`}
                title="Toggle Auto-Capture"
              >
                <Sparkles size={20} />
              </button>
              <button 
                onClick={() => setUseAI(!useAI)}
                className={`p-2 rounded-full transition-all ${useAI ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/60'}`}
                title="Toggle AI Super Enhance"
              >
                <Type size={20} />
              </button>
              <button 
                onClick={() => setEdgeDetection(!edgeDetection)}
                className={`p-2 rounded-full transition-all ${edgeDetection ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/60'}`}
                title="Toggle Edge Detection"
              >
                <Maximize2 size={20} />
              </button>
            </div>

            <div className="flex-1 relative overflow-hidden">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover"
              />
              {edgeDetection && edgeOverlay && (
                <img src={edgeOverlay} className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-50" />
              )}
              {/* Countdown Overlay */}
              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <motion.div 
                    key={countdown}
                    initial={{ scale: 2, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-8xl font-black text-white drop-shadow-2xl"
                  >
                    {countdown}
                  </motion.div>
                </div>
              )}
              {/* Scan Guide Overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`border-2 border-white/30 rounded-2xl transition-all duration-500 ${
                  mode === ScanMode.ID_CARD ? 'w-4/5 aspect-[1.6/1]' : 'w-3/4 aspect-[3/4]'
                }`}>
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-lg" />
                </div>
              </div>
            </div>

            <div className="p-10 flex items-center justify-center gap-12">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-4 text-white/40 hover:text-white transition-colors"
                title="Import from storage"
              >
                <ImageIcon size={28} />
              </button>
              <button 
                onClick={captureImage}
                className="w-20 h-20 rounded-full border-4 border-white p-1 hover:scale-105 active:scale-95 transition-all"
              >
                <div className="w-full h-full bg-white rounded-full" />
              </button>
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white text-xs font-bold">
                {scans.length}
              </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Install Banner */}
      <AnimatePresence>
        {showInstallBtn && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-6 right-6 z-[120] md:left-auto md:right-6 md:w-96"
          >
            <div className="bg-[#141414] text-white p-6 rounded-3xl shadow-2xl flex flex-col gap-4 border border-white/10">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
                  <FileDown size={24} className="text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-lg">Install MagicScan</h4>
                  <p className="text-sm text-white/60">Add to your home screen for a faster, app-like experience.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowInstallBtn(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-white/40 hover:bg-white/5 transition-all"
                >
                  Later
                </button>
                <button 
                  onClick={handleInstallClick}
                  className="flex-[2] bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  Install Now
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirmDownload && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileCheck size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">Ready to Download?</h3>
              <p className="text-sm text-[#141414]/60 mb-6">Please confirm your selection before we generate your PDF.</p>
              
              <div className="bg-[#F5F5F0] rounded-2xl p-4 mb-8 text-left space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="opacity-40 font-bold uppercase">Name</span>
                  <span className="font-bold">{pdfName || 'Untitled'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="opacity-40 font-bold uppercase">Page Size</span>
                  <span className="font-bold">{selectedPageSize}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="opacity-40 font-bold uppercase">Color Mode</span>
                  <span className="font-bold">{colorMode}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="opacity-40 font-bold uppercase">Quality</span>
                  <span className="font-bold">{Math.round(quality * 100)}%</span>
                </div>
                {mode === ScanMode.BOOK && (
                  <div className="flex justify-between text-xs">
                    <span className="opacity-40 font-bold uppercase">Book Style</span>
                    <span className="font-bold">{bookStyle}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="opacity-40 font-bold uppercase">Batch OCR</span>
                  <span className={`font-bold ${performBatchOCR ? 'text-indigo-600' : ''}`}>{performBatchOCR ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirmDownload(false)}
                  className="flex-1 py-4 rounded-2xl font-bold text-[#141414]/40 hover:bg-gray-50 transition-all"
                >
                  Back
                </button>
                <button 
                  onClick={() => {
                    setShowConfirmDownload(false);
                    confirmSave();
                  }}
                  className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {activePreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <button onClick={() => { setActivePreview(null); setOcrResult(null); setIsCropping(false); }} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={24} />
              </button>
              <h3 className="font-bold">Preview & Edit</h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleRetake}
                  className="flex items-center gap-2 text-orange-600 font-bold text-sm px-4 py-2 hover:bg-orange-50 rounded-full transition-all active:scale-95"
                  title="Discard and retake photo"
                >
                  <RefreshCw size={18} />
                  <span>Retake</span>
                </button>
                <button 
                  onClick={() => { setIsCropping(!isCropping); setIsResizing(false); setIsPerspective(false); }}
                  className={`flex items-center gap-2 font-bold text-sm px-4 py-2 rounded-full transition-all active:scale-95 ${isCropping && !isPerspective ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-600 hover:bg-emerald-50'}`}
                >
                  <Crop size={18} />
                  <span>Crop</span>
                </button>
                <button 
                  onClick={() => { setIsCropping(!isCropping); setIsPerspective(true); setIsResizing(false); }}
                  className={`flex items-center gap-2 font-bold text-sm px-4 py-2 rounded-full transition-all active:scale-95 ${isCropping && isPerspective ? 'bg-orange-600 text-white shadow-lg' : 'text-orange-600 hover:bg-orange-50'}`}
                >
                  <Maximize2 size={18} />
                  <span>Perspective</span>
                </button>
                <button 
                  onClick={() => { setIsResizing(!isResizing); setIsCropping(false); setIsPerspective(false); }}
                  className={`flex items-center gap-2 font-bold text-sm px-4 py-2 rounded-full transition-all active:scale-95 ${isResizing ? 'bg-blue-600 text-white shadow-lg' : 'text-blue-600 hover:bg-blue-50'}`}
                >
                  <Maximize2 size={18} />
                  <span>Resize</span>
                </button>
                <button 
                  onClick={() => handleOCR(activePreview)}
                  className="flex items-center gap-2 text-indigo-600 font-bold text-sm px-4 py-2 hover:bg-indigo-50 rounded-full transition-all active:scale-95"
                >
                  <Type size={18} />
                  <span>OCR</span>
                </button>
              </div>
            </div>

            {/* Color Mode Selector in Preview */}
            <div className="bg-white px-6 py-2 border-b flex items-center gap-4 overflow-x-auto">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 whitespace-nowrap">Preview Mode:</span>
              <div className="flex gap-2">
                {[
                  { id: ColorMode.COLOR, label: 'Color' },
                  { id: ColorMode.GRAYSCALE, label: 'Grayscale' },
                  { id: ColorMode.BLACK_WHITE, label: 'B&W' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setColorMode(m.id)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${
                      colorMode === m.id 
                        ? 'bg-emerald-600 text-white border-emerald-600' 
                        : 'text-[#141414]/40 border-[#141414]/10 hover:border-emerald-600'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center bg-[#F0F0EB]">
              {isResizing && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 bg-white p-2 rounded-2xl shadow-xl border border-[#141414]/5 flex gap-2"
                >
                  {[
                    { label: 'Original', value: 'original' },
                    { label: 'A4 (1:1.41)', value: 1/1.414 },
                    { label: '3:4', value: 3/4 },
                    { label: '1:1', value: 1 },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => handleResize(opt.value as any)}
                      className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-50 text-blue-600 transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}

              <div className="relative max-w-md w-full shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] rounded-lg overflow-hidden border-8 border-white transition-all duration-300">
                <img 
                  src={activePreview.enhancedUrl} 
                  className="w-full h-auto transition-all duration-300" 
                  style={{
                    filter: colorMode === ColorMode.GRAYSCALE 
                      ? 'grayscale(100%)' 
                      : colorMode === ColorMode.BLACK_WHITE 
                        ? 'grayscale(100%) contrast(150%) brightness(110%)' 
                        : 'none'
                  }}
                />
                
                {isCropping && (
                  <div 
                    className="absolute inset-0 bg-black/40 cursor-crosshair select-none"
                    onMouseMove={handleCropMouseMove}
                    onMouseUp={() => setIsDraggingCrop(null)}
                    onMouseLeave={() => setIsDraggingCrop(null)}
                  >
                    {!isPerspective ? (
                      <div 
                        className="absolute border-2 border-emerald-400 bg-emerald-400/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move"
                        style={{
                          left: `${cropBox.x}%`,
                          top: `${cropBox.y}%`,
                          width: `${cropBox.w}%`,
                          height: `${cropBox.h}%`
                        }}
                        onMouseDown={() => setIsDraggingCrop('move')}
                      >
                        {/* Grid Lines */}
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                          <div className="border-r border-white/30 border-b" />
                          <div className="border-r border-white/30 border-b" />
                          <div className="border-b border-white/30" />
                          <div className="border-r border-white/30 border-b" />
                          <div className="border-r border-white/30 border-b" />
                          <div className="border-b border-white/30" />
                          <div className="border-r border-white/30" />
                          <div className="border-r border-white/30" />
                          <div className="" />
                        </div>

                        {/* Handles */}
                        {[
                          { id: 'nw', pos: '-top-3 -left-3' },
                          { id: 'ne', pos: '-top-3 -right-3' },
                          { id: 'sw', pos: '-bottom-3 -left-3' },
                          { id: 'se', pos: '-bottom-3 -right-3' },
                        ].map(h => (
                          <div 
                            key={h.id}
                            className={`absolute ${h.pos} w-8 h-8 flex items-center justify-center cursor-pointer group`}
                            onMouseDown={(e) => { e.stopPropagation(); setIsDraggingCrop(h.id); }}
                          >
                            <div className="w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-lg group-hover:scale-125 transition-transform" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="absolute inset-0">
                        <svg className="absolute inset-0 w-full h-full pointer-events-none">
                          <polygon 
                            points={corners.map(c => `${(c.x / 100) * 100}%,${(c.y / 100) * 100}%`).join(' ')} 
                            className="fill-orange-500/20 stroke-orange-500 stroke-2"
                            style={{ vectorEffect: 'non-scaling-stroke' }}
                          />
                          {/* We need to use actual pixel values for the SVG points if we want it to work perfectly, 
                              but percentages in SVG can be tricky. Let's use a simpler approach. */}
                        </svg>
                        {/* Better SVG for polygon */}
                        <div className="absolute inset-0 overflow-hidden">
                           <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none">
                             <polygon 
                               points={corners.map(c => `${c.x},${c.y}`).join(' ')} 
                               className="fill-orange-500/20 stroke-orange-500 stroke-[0.5]"
                             />
                           </svg>
                        </div>

                        {corners.map((c, i) => (
                          <div 
                            key={i}
                            className="absolute w-10 h-10 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer group z-10"
                            style={{ left: `${c.x}%`, top: `${c.y}%` }}
                            onMouseDown={(e) => { e.stopPropagation(); setIsDraggingCrop(i.toString()); }}
                          >
                            <div className="w-5 h-5 bg-orange-500 rounded-full border-2 border-white shadow-xl group-hover:scale-125 transition-transform" />
                            <span className="absolute -top-6 bg-orange-600 text-white text-[8px] px-1 rounded font-bold">P{i+1}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <button 
                      onClick={handleCrop}
                      className={`absolute -bottom-16 left-1/2 -translate-x-1/2 text-white px-8 py-3 rounded-full text-sm font-bold shadow-2xl flex items-center gap-2 whitespace-nowrap active:scale-95 transition-all ${isPerspective ? 'bg-orange-600 hover:bg-orange-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                      <Check size={18} />
                      Apply {isPerspective ? 'Perspective' : 'Selection'}
                    </button>
                  </div>
                )}
              </div>
              
              {ocrResult && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex-1 max-w-md w-full bg-emerald-50 p-6 rounded-3xl border border-emerald-100"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-emerald-800 flex items-center gap-2">
                      <Sparkles size={18} />
                      AI Extracted Text
                    </h4>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(ocrResult);
                        alert("Text copied to clipboard!");
                      }}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Copy All
                    </button>
                  </div>
                  <div className="prose prose-sm max-h-[400px] overflow-auto text-emerald-900/80 font-mono text-xs whitespace-pre-wrap">
                    {ocrResult}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Processing Loader */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center"
          >
            <div className="relative">
              <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
              <Sparkles className="absolute inset-0 m-auto text-emerald-600 animate-pulse" size={24} />
            </div>
            <p className="mt-4 font-bold text-emerald-800 animate-pulse">Magically enhancing...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
