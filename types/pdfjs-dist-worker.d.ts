declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  // pdfjs-dist worker entrypoint exports this handler used by the main thread
  // when running in "fake worker" mode (Node/serverless).
  export const WorkerMessageHandler: any;
}

