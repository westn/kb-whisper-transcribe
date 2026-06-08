export const MODELS = {
  "kb-whisper-large-q5_0": {
    fileName: "ggml-model-q5_0.bin",
    url: "https://huggingface.co/KBLab/kb-whisper-large/resolve/main/ggml-model-q5_0.bin",
    sha256: "87e1af308ae76d6454ae47ef4c75c9adf61629dad68360c48cbf60023d7aa924",
    sizeBytes: 1081140203,
    languageDefault: "sv"
  }
} as const;

export type ModelName = keyof typeof MODELS;
