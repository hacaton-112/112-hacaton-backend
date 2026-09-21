void ggml_bitnet_mul_mat(const struct ggml_compute_params * params, struct ggml_tensor * dst) {
    struct ggml_tensor * src0 = dst->src[0];
    const struct ggml_tensor * src1 = dst->src[1];

    const int64_t k = src0->ne[0];
    const int64_t rows = src0->ne[1];
    const int64_t batch = src1->ne[1];
    const int ith = params->ith;
    const int nth = params->nth;

    if (ith == 0 && src0->extra == nullptr) {
        ggml_bitnet_transform_tensor(src0);
    }
    if (nth > 1) {
        ggml_barrier(params->threadpool);
    }

    struct bitnet_tensor_extra * weights = (struct bitnet_tensor_extra *) src0->extra;
    GGML_ASSERT(weights != nullptr);
    GGML_ASSERT(weights->BK > 0);

    const int three_k = (int) (k / weights->BK) * weights->BK;
    const int two_k = (int) k - three_k;
    char * workspace = (char *) params->wdata;
    int8_t * three_qlut = (int8_t *) workspace;
    bitnet_float_type * lut_scales = (bitnet_float_type *)
        (three_qlut + batch * three_k / 3 * 32);
    int8_t * two_qlut = (int8_t *) (lut_scales + batch);

    if (ith == 0) {
        GGML_ASSERT(src1->type == GGML_TYPE_F32);
        ggml_preprocessor(
            (int) batch,
            (int) rows,
            three_k,
            two_k,
            src1->data,
            lut_scales,
            three_qlut,
            two_qlut);
    }
    if (nth > 1) {
        ggml_barrier(params->threadpool);
    }

    const int tile_count = weights->n_tile_num;
    GGML_ASSERT(tile_count > 0);
    GGML_ASSERT(rows % tile_count == 0);

    const int weight_size = three_k * (int) rows / 6;
    const int weight_tile_size = weight_size / tile_count;
    const int sign_size = three_k * (int) rows / 24;
    const int sign_tile_size = sign_size / tile_count;
    const int output_tile_size = (int) rows / tile_count;
    const int two_weight_size = (int) rows * two_k / 4;
    const int two_weight_tile_size = two_weight_size / tile_count;

    uint8_t * signs = weights->qweights + weight_size;
    uint8_t * two_weights = signs + sign_size;
    const int tiles_per_thread = (tile_count + nth - 1) / nth;
    const int tile_begin = ith * tiles_per_thread;
    const int tile_end_candidate = tile_begin + tiles_per_thread;
    const int tile_end = tile_end_candidate < tile_count ? tile_end_candidate : tile_count;

    int remaining = (int) batch;
    int batch_offset = 0;
    const int block_sizes[] = {512, 256, 128, 32, 8, 1};
    for (int block_size : block_sizes) {
        while (remaining >= block_size) {
            for (int tile = tile_begin; tile < tile_end; ++tile) {
                const int output_offset = batch_offset * (int) rows + tile * output_tile_size;
                ggml_qgemm_lut(
                    block_size,
                    (int) rows,
                    (int) k,
                    three_k,
                    weights->qweights + tile * weight_tile_size,
                    signs + tile * sign_tile_size,
                    three_qlut + batch_offset * three_k / 3 * 32,
                    weights->scales,
                    lut_scales + batch_offset,
                    (float *) dst->data + output_offset);

                ggml_qgemm_lut(
                    block_size,
                    (int) rows,
                    (int) k,
                    two_k,
                    two_weights + tile * two_weight_tile_size,
                    nullptr,
                    two_qlut + batch_offset * two_k / 2 * 32,
                    weights->scales,
                    lut_scales + batch_offset,
                    (float *) dst->data + output_offset);
            }
            batch_offset += block_size;
            remaining -= block_size;
        }
    }
}
