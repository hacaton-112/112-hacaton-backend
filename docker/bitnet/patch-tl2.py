from pathlib import Path


root = Path("/src/bitnet")
generator = root / "utils/codegen_tl2.py"
generator_text = generator.read_text()
generator_text = generator_text.replace(
    "((int32_t*)C)[i] = (int32_t)(((int32_t*)CBits)[i + bs * BM{0}]);",
    "((int32_t*)C)[i + bs * {3}] = (int32_t)(((int32_t*)CBits)[i + bs * BM{0}]);",
)
generator_text = generator_text.replace(
    "((int32_t*)C)[i] += (int32_t)(((int32_t*)CBits)[i + bs * BM{0}]);",
    "((int32_t*)C)[i + bs * {3}] += (int32_t)(((int32_t*)CBits)[i + bs * BM{0}]);",
)
generator_text = generator_text.replace(
    "((float*)C)[i] = (float)(((int32_t*)C)[i]) / ((float*)LUT_Scales)[bs] * ((float*)Scales)[0];",
    "((float*)C)[i + bs * {3}] = (float)(((int32_t*)C)[i + bs * {3}]) / ((float*)LUT_Scales)[bs] * ((float*)Scales)[0];",
)
generator_text = generator_text.replace(
    '".format(pre, k_list[1], k_list[0])])',
    '".format(pre, k_list[1], k_list[0], pre.split("_")[0])])',
)
generator.write_text(generator_text)

runtime = root / "src/ggml-bitnet-lut.cpp"
runtime_text = runtime.read_text()
needle = """int ggml_bitnet_get_type_bits(enum ggml_type type) {
    switch (type) {
        case GGML_TYPE_TL2:
            return 2;
        case GGML_TYPE_Q4_0:
            return 4;
        default:
            return 0;
    }
}

#endif"""
replacement = needle[:-6] + '#include "tl2-runtime.inc"\n\n#endif'
if needle not in runtime_text:
    raise RuntimeError("x86 TL2 insertion point not found")
runtime.write_text(runtime_text.replace(needle, replacement, 1))

header = root / "include/bitnet-lut-kernels.h"
header_text = header.read_text().replace(
    "is_type_supported(tensor->type) && tensor->backend == GGML_BACKEND_TYPE_CPU && tensor->extra == nullptr",
    "is_type_supported(tensor->type) && tensor->extra == nullptr",
)
header.write_text(header_text)
