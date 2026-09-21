from pathlib import Path


converter = Path("/src/bitnet/utils/convert-hf-to-gguf-bitnet.py")
text = converter.read_text()
needle = '''def transform_to_tl2(x: np.ndarray):
    scale = np.max(np.abs(x))
    # res = np.round(x / scale + 2).astype(np.uint8)
    res = preprocess_weights_tl2(x)
    return res, scale
'''
replacement = '''def transform_to_tl2(x: np.ndarray, override_scale: float = None):
    if override_scale is not None:
        # Offline checkpoints are already exact ternary values and carry the
        # trained absmean scale separately.
        scale = np.float32(override_scale)
        ternary = x
    else:
        # BF16 checkpoints use online absmean quantization.
        scale = np.float32(np.mean(np.abs(x.astype(np.float32))))
        ternary = np.clip(np.round(x.astype(np.float32) / scale), -1, 1)
    res = preprocess_weights_tl2(ternary)
    return res, scale
'''
if needle not in text:
    raise RuntimeError("TL2 converter insertion point not found")
converter.write_text(text.replace(needle, replacement, 1))

text = converter.read_text()
needle = '''                    elif self.ftype == gguf.GGMLQuantizationType.TL2 and suit_i2:
                        data, i2_scale = transform_to_tl2(data)
'''
replacement = '''                    elif self.ftype == gguf.GGMLQuantizationType.TL2 and suit_i2:
                        orig_scale = scale_map.get(name.replace(".weight", ""))
                        override_scale = orig_scale.item() if orig_scale is not None else None
                        data, i2_scale = transform_to_tl2(data, override_scale=override_scale)
'''
if needle not in text:
    raise RuntimeError("TL2 scale call site not found")
converter.write_text(text.replace(needle, replacement))
