# Local GGUF models

Place these two large model files in this directory before starting the local
Compose stack:

- `caller.gguf` — our fine-tuned Qwen3 dialogue model. Obtain the approved
  training export from the project maintainers.
- `gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf` — the tool-use model from the
  [unsloth/gemma-4-E2B-it-qat-GGUF repository on Hugging Face](https://huggingface.co/unsloth/gemma-4-E2B-it-qat-GGUF/blob/main/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf).

Set `LLM_MODELS_DIR=./models` in the repository root `.env` to mount this
folder into both local LLM containers. Set
`TOOLS_LLM_MODEL_FILE=gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf` so Compose finds
the tool-use model at the top level of the folder. These multi-gigabyte files
are excluded from Git.
