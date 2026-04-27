/**
 * Shim per disabilitare il worker di pdfjs-dist in ambiente Netlify/Node.js.
 * Deve essere importato PRIMA di qualsiasi import di pdfjs-dist.
 */

// @ts-ignore - pdfjs-dist potrebbe non avere tipi completi
import * as pdfjsLib from 'pdfjs-dist';

// Disabilita il caricamento del worker (non serve in Node.js/Netlify serverless)
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export default pdfjsLib;
