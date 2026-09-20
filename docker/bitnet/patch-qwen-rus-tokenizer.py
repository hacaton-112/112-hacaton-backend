from pathlib import Path


source = Path("/app/conversion/base.py")
text = source.read_text()
needle = '''        if chkhsh == "d4540891389ea895b53b399da6ac824becc30f2fba0e9ddbb98f92e55ca0e97c":
            # ref: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
            res = "qwen2"
'''
replacement = needle + '''        if chkhsh == "da72fee22fa7ba12a7777f414c80774c00acbcb0193c52f24a41719bd54c7d1f":
            # ref: https://huggingface.co/alphaedge-ai/Qwen3-0.6B-rus-16384
            res = "qwen2"
'''
if needle not in text:
    raise RuntimeError("Qwen tokenizer insertion point not found")
source.write_text(text.replace(needle, replacement, 1))
