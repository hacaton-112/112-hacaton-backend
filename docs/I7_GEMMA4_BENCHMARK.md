# Gemma 4 E2B benchmark on Intel Core i7-8700

Date: 2026-09-21. Host: Intel Core i7-8700 (6 cores / 12 threads), 30 GiB RAM.
Runtime: `llama.cpp` server in Docker. This document separates a direct LLM
probe from the backend pipeline; their prompts and therefore their timings are
not interchangeable.

## Direct LLM probe

The probe sends the same six Russian dialogue turns to every model. Its pass
counter is a small heuristic smoke check, not a substitute for a labelled eval.

| Model / configuration | Median response | Smoke pass | Notes |
| --- | ---: | ---: | --- |
| Gemma 4 E2B `Q4_0` | 4341 ms | 5/6 | Original prompt, `max_tokens=160` |
| Gemma 4 E2B QAT `UD-Q4_K_XL` | 4073 ms | 5/6 | Original prompt, `max_tokens=160` |
| Gemma 4 E2B `Q3_K_M` | 5458 ms | 6/6 | Slower prompt evaluation; the crude score is not proof of better quality |
| QAT, fast runtime | 3983 ms | 6/6 | ctx 2048, 6 threads, batch/ubatch 256, flash attention, Q4 KV |
| QAT, fast runtime, `max_tokens=64` | 3953 ms | 5/6 | Token cap barely changes latency because replies stop earlier on their own |
| QAT, fast runtime, compact prompt v2 | **3087 ms** | 5/6; 5/5 meaningful | `max_tokens=64`; the sixth input is deliberately meaningless |

For the winning direct configuration, prompt evaluation was approximately
105-110 tokens/s and generation approximately 20 tokens/s. The compact prompt
reduced the median by 986 ms (24%) against the same QAT quant with the original
prompt. Changing only ctx/threads reduced the compact-prompt median from 3180
to 3087 ms, so prompt size is the larger win.

Selected model: **Gemma 4 E2B QAT `UD-Q4_K_XL`**. `Q3_K_M` is smaller but was
slower on this CPU. The selected server used about 2.43 GiB resident memory.

## Backend pipeline

`pipeline-stage-profiler.ts` starts from operator text, exercises Scenario
Engine, reply generation, validation/recording and Piper TTS, and measures time
to the first audio. ASR, network delivery to the operator and actual playback
are excluded.

Before the deterministic question fast path, the backend called the same LLM
twice for common turns: once to classify the requested fact and once to produce
the reply. Alternating those unrelated prompts also defeated useful prefix/KV
cache reuse.

| Pipeline | Intent calls | Factory time | First audio |
| --- | ---: | ---: | ---: |
| Before, first turn | 1 | 1470-1500 ms | 3680-3700 ms |
| Before, later turns | 1 per turn | about 3790 ms | 7980-8950 ms |
| After, incident question | 0 | 11.8 ms | 4887 ms |
| After, exact address | 0 | 10.4 ms | **4278 ms** |
| After, people/children | 0 | 9.0 ms | 5169 ms |

The optimized three-turn run had a median first-audio latency of **4887 ms**.
All three replies used the model, returned the intended scenario fact and
completed TTS successfully. Compared with the previous late-turn median of
roughly 8.0-9.0 s, the obvious-question fast path removes about 3-4 s. Unknown
or genuinely ambiguous paraphrases still use the semantic classifier. The
guard is tested against false overlap such as `дом` inside `домофон`.

Generation remains the next bottleneck: TTFT was 3003-3378 ms and complete
generation 4218-5044 ms in the final run; Piper took only 41-138 ms. The next
safe optimization target is therefore the actual backend reply prompt, not TTS
or a more aggressive quant.

## Memory and cleanup

After the benchmark, the baseline QAT container was stopped. The selected
Gemma container used 2.43 GiB. The existing production Qwen container still
used 7.61 GiB because it retained an 8192-token context and two slots. Host
memory after cleanup was 13 GiB used, 17 GiB available, and 1.1 MiB swap used.
Unused Docker build cache and dangling images reclaimed about 4.7 GiB of disk;
model volumes were not deleted.

## Verification

The focused Scenario Engine suite passes: 65 tests, 0 failures. The full Jest
suite passes: 124 suites and 1171 tests. `tsc --noEmit` also passes. Benchmark
helpers:

```sh
node test/manual/one-call-probe.mjs
bun run profile:pipeline -- --allow-write --scenario=S-015 --turns=3
```
