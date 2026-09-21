from pathlib import Path


generator = Path("/src/bitnet/utils/codegen_tl2.py")
text = generator.read_text()
needle = '''        "bitnet_b1_58-3B"                   : [[3200, 8640],
                                               [3200, 3200],
                                               [8640, 3200]],
'''
replacement = needle + '''        "BitNet-b1.58-2B-4T"                : [[2560, 6912],
                                               [2560, 2560],
                                               [6912, 2560],
                                               [640, 2560]],
'''
if needle not in text:
    raise RuntimeError("TL2 model table insertion point not found")
generator.write_text(text.replace(needle, replacement, 1))
