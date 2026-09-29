# Local GGUF models

Both language models download automatically. When `local-llm` or `tools-llm`
starts and its model file is missing, the container fetches it once from the
project's [Google Drive folder](https://drive.google.com/drive/folders/1dVX4nAiCedEf_GF9W5mkmKWmy6c1Jp-C).
The next start reuses the file. The healthcheck allows 30 minutes for the
first download.

| File | Size | Purpose |
| --- | --- | --- |
| `caller.gguf` | 473 MB | Our fine-tuned Qwen3 dialogue model (the virtual caller) |
| `gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf` | 2.4 GB | Tool-use model, from [unsloth/gemma-4-E2B-it-qat-GGUF](https://huggingface.co/unsloth/gemma-4-E2B-it-qat-GGUF/blob/main/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf) |

The download URLs default to the Drive files in `docker-compose.yml`. To use a
mirror, set `LLM_MODEL_URL` and `TOOLS_LLM_MODEL_URL` in `.env`.

By default the models are stored in the `llm_models` Docker volume. To keep
them in this directory instead, set these values in the repository root `.env`:

```
LLM_MODELS_DIR=./models
TOOLS_LLM_MODEL_FILE=gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf
```

In an offline environment, download both files from the Drive folder ahead of
time and place them here. These multi-gigabyte files are excluded from Git.

ASR models (Sherpa-ONNX Zipformer RU and Silero VAD) are baked into the ASR
image at build time and are not needed here.
