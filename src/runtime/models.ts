export const MODELS = {
  "kb-whisper-large-q5_0": {
    fileName: "ggml-model-q5_0.bin",
    url: "https://huggingface.co/KBLab/kb-whisper-large/resolve/main/ggml-model-q5_0.bin",
    // Hugging Face exposes the Xet reconstruction hash separately from the
    // file checksum. Verify the downloaded bytes against the LFS object SHA256
    // (`x-linked-etag`), not the Xet CAS hash (`x-xet-hash`).
    sha256: "6d2863812d7410322bb7d8647a5c7260761300fa946714c9ed66d22bb30bcb19",
    sizeBytes: 1081140203,
    languageDefault: "sv"
  }
} as const;

export type ModelName = keyof typeof MODELS;
