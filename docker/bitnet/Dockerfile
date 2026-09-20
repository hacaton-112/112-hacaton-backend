FROM ubuntu:24.04 AS builder

ARG BITNET_COMMIT=0b341e582afbf9e1011f24744b554c96a3477eb5

RUN sed -i 's|http://archive.ubuntu.com/ubuntu|http://mirror.yandex.ru/ubuntu|; s|http://security.ubuntu.com/ubuntu|http://mirror.yandex.ru/ubuntu|' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get -o Acquire::Retries=5 update \
    && DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
        ca-certificates \
        clang-18 \
        cmake \
        git \
        libomp-18-dev \
        ninja-build \
        python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src/bitnet
RUN git clone --filter=blob:none https://github.com/microsoft/BitNet.git . \
    && git checkout "${BITNET_COMMIT}" \
    && git submodule update --init --recursive --depth 1

# The official setup script generates model-specific x86 lookup kernels before
# compiling. BitNet-b1.58-2B-4T uses the same matrix layout as the 3B preset.
RUN python3 utils/codegen_tl2.py \
        --model bitnet_b1_58-3B \
        --BM 160,320,320 \
        --BK 96,96,96 \
        --bm 32,32,32 \
    && CC=clang-18 CXX=clang++-18 cmake -S . -B build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=OFF \
        -DGGML_NATIVE=ON \
        -DBITNET_X86_TL2=OFF \
        -DLLAMA_BUILD_TESTS=OFF \
        -DLLAMA_BUILD_COMMON=ON \
        -DLLAMA_BUILD_TOOLS=ON \
        -DLLAMA_BUILD_EXAMPLES=OFF \
        -DLLAMA_BUILD_SERVER=ON \
        -DLLAMA_BUILD_UI=OFF \
        -DLLAMA_USE_PREBUILT_UI=OFF \
        -DLLAMA_CURL=OFF \
    && cmake --build build --target llama-server --parallel

FROM ubuntu:24.04

RUN sed -i 's|http://archive.ubuntu.com/ubuntu|http://mirror.yandex.ru/ubuntu|; s|http://security.ubuntu.com/ubuntu|http://mirror.yandex.ru/ubuntu|' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get -o Acquire::Retries=5 update \
    && DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
        ca-certificates \
        curl \
        libgomp1 \
        libomp5-18 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/bitnet/build/bin/llama-server /app/llama-server
COPY bitnet-chat-template.jinja /app/bitnet-chat-template.jinja

EXPOSE 8080
ENTRYPOINT ["/app/llama-server"]
