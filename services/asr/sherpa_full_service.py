#!/usr/bin/env python3
"""
Full-featured Sherpa-ONNX Zipformer RU INT8 ASR microservice.
100% compatible drop-in replacement for the Whisper asr-service in System 112.
Supports:
  - GET /health
  - POST /v1/sessions
  - WS /v1/ws/{sessionId} (with Silero VAD silence detection + stop command)
  - POST /transcribe (direct WAV / PCM upload for tester.html)
"""
import os, sys, time, io, wave, json, uuid
import numpy as np
import sherpa_onnx
from aiohttp import web, WSMsgType

MODEL_DIR = os.environ.get("SHERPA_MODEL_DIR", "/root/system112/models/sherpa-onnx-zipformer-ru-int8-2025-04-20")
VAD_MODEL = os.environ.get("SHERPA_VAD_MODEL", "/root/system112/models/silero_vad.onnx")
PORT = int(os.environ.get("SHERPA_PORT", "8787"))
THREADS = int(os.environ.get("SHERPA_THREADS", "6"))
PUBLIC_WS_URL = os.environ.get("WHISPER_PUBLIC_WS_URL", f"ws://127.0.0.1:{PORT}")

print(f"=== Initializing Sherpa-ONNX Zipformer RU INT8 ===")
print(f"Model dir: {MODEL_DIR}")
print(f"VAD model: {VAD_MODEL}")
print(f"Threads:   {THREADS}")

t0 = time.monotonic()
recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
    encoder=f"{MODEL_DIR}/encoder.int8.onnx",
    decoder=f"{MODEL_DIR}/decoder.onnx",
    joiner=f"{MODEL_DIR}/joiner.int8.onnx",
    tokens=f"{MODEL_DIR}/tokens.txt",
    num_threads=THREADS,
    sample_rate=16000,
    feature_dim=80,
    decoding_method="greedy_search",
)
print(f"Recognizer loaded in {(time.monotonic()-t0)*1000:.1f} ms!")

# VAD config
vad_config = sherpa_onnx.VadModelConfig()
vad_config.silero_vad.model = VAD_MODEL
vad_config.silero_vad.threshold = 0.50
vad_config.silero_vad.min_silence_duration = 0.60
vad_config.silero_vad.min_speech_duration = 0.25
vad_config.sample_rate = 16000

# Active sessions: sessionId -> { language, created_at }
sessions = {}

def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    return resp

async def options_handler(request):
    return add_cors(web.Response(status=200))

async def health_handler(request):
    data = {
        "status": "ok",
        "model": "sherpa-onnx-zipformer-ru-int8-2025-04-20",
        "architecture": "Zipformer Transducer INT8",
        "device": "cpu",
        "threads": THREADS,
        "flashAttention": False
    }
    return add_cors(web.json_response(data))

async def create_session_handler(request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    lang = body.get("language", "ru")
    session_id = str(uuid.uuid4())
    sessions[session_id] = {"language": lang, "created_at": time.time()}
    
    ws_base = PUBLIC_WS_URL.rstrip("/")
    res = {
        "sessionId": session_id,
        "wsUrl": f"{ws_base}/v1/ws/{session_id}",
        "sampleRate": 16000,
        "expiresInSeconds": 60,
        "model": "sherpa-onnx-zipformer-ru-int8"
    }
    return add_cors(web.json_response(res))

def decode_audio_to_16k_float32(body_bytes, content_type=""):
    if body_bytes.startswith(b"RIFF") and b"WAVE" in body_bytes[:12]:
        with wave.open(io.BytesIO(body_bytes), "rb") as wf:
            framerate = wf.getframerate()
            nframes = wf.getnframes()
            channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            raw = wf.readframes(nframes)
            
            if sampwidth == 2:
                samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
            else:
                samples = np.frombuffer(raw, dtype=np.float32)
                
            if channels > 1:
                samples = samples[::channels]
                
            if framerate != 16000:
                new_len = int(len(samples) * 16000 / framerate)
                samples = np.interp(np.linspace(0, len(samples), new_len), np.arange(len(samples)), samples)
            return samples
    else:
        return np.frombuffer(body_bytes, dtype=np.int16).astype(np.float32) / 32768.0

async def transcribe_handler(request):
    try:
        body = await request.read()
        if not body:
            return add_cors(web.json_response({"error": "empty body"}, status=400))
        
        samples = decode_audio_to_16k_float32(body, request.content_type)
        duration_sec = len(samples) / 16000.0
        
        t_start = time.monotonic()
        stream = recognizer.create_stream()
        stream.accept_waveform(16000, samples)
        recognizer.decode_stream(stream)
        text = stream.result.text
        proc_ms = (time.monotonic() - t_start) * 1000
        rtf = (proc_ms / 1000.0) / (duration_sec or 0.001)
        
        return add_cors(web.json_response({
            "text": text,
            "processingMs": round(proc_ms, 1),
            "audioDurationSec": round(duration_sec, 2),
            "rtf": round(rtf, 4),
            "model": "sherpa-onnx-zipformer-ru-int8"
        }))
    except Exception as e:
        return add_cors(web.json_response({"error": str(e)}, status=500))

async def ws_handler(request):
    session_id = request.match_info.get("session_id", str(uuid.uuid4()))
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    # Send Ready event
    await ws.send_json({
        "type": "ready",
        "sessionId": session_id,
        "sampleRate": 16000,
        "endpointSilenceMs": 350,
        "model": "sherpa-onnx-zipformer-ru-int8"
    })
    
    # Initialize VAD for this stream
    vad = sherpa_onnx.VoiceActivityDetector(vad_config, buffer_size_in_seconds=30)
    all_accumulated_samples = []
    
    async for msg in ws:
        if msg.type == WSMsgType.BINARY:
            data = msg.data
            if len(data) % 2 != 0:
                continue
            chunk = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            all_accumulated_samples.extend(chunk)
            
            # Feed to VAD
            vad.accept_waveform(chunk)
            
            # Check if speech segment was closed by silence
            while not vad.empty():
                seg = vad.front
                vad.pop()
                seg_samples = seg.samples
                if len(seg_samples) >= 1600: # at least 100ms
                    t_dec0 = time.monotonic()
                    st = recognizer.create_stream()
                    st.accept_waveform(16000, np.array(seg_samples, dtype=np.float32))
                    recognizer.decode_stream(st)
                    txt = st.result.text
                    dec_ms = (time.monotonic() - t_dec0) * 1000
                    audio_ms = int(len(seg_samples) * 1000 / 16000)
                    
                    if txt.strip():
                        await ws.send_json({
                            "type": "final",
                            "transcript": txt.strip(),
                            "audioMs": audio_ms,
                            "processingMs": round(dec_ms),
                            "reason": "silence"
                        })
                        
        elif msg.type == WSMsgType.TEXT:
            try:
                cmd = json.loads(msg.data)
                cmd_type = cmd.get("type")
                if cmd_type in ("stop", "finalize"):
                    vad.flush()
                    final_txt = ""
                    total_dur_ms = 0
                    dec_ms = 0
                    
                    segments_to_decode = []
                    while not vad.empty():
                        segments_to_decode.append(vad.front.samples)
                        vad.pop()
                    
                    if segments_to_decode:
                        combined = np.concatenate(segments_to_decode)
                        t_dec0 = time.monotonic()
                        st = recognizer.create_stream()
                        st.accept_waveform(16000, combined)
                        recognizer.decode_stream(st)
                        final_txt = st.result.text
                        dec_ms = (time.monotonic() - t_dec0) * 1000
                        total_dur_ms = int(len(combined) * 1000 / 16000)
                    elif all_accumulated_samples:
                        # Fallback: decode all samples if VAD didn't segment
                        t_dec0 = time.monotonic()
                        st = recognizer.create_stream()
                        st.accept_waveform(16000, np.array(all_accumulated_samples, dtype=np.float32))
                        recognizer.decode_stream(st)
                        final_txt = st.result.text
                        dec_ms = (time.monotonic() - t_dec0) * 1000
                        total_dur_ms = int(len(all_accumulated_samples) * 1000 / 16000)
                        
                    await ws.send_json({
                        "type": "final",
                        "transcript": final_txt.strip(),
                        "audioMs": total_dur_ms,
                        "processingMs": round(dec_ms),
                        "reason": "stop"
                    })
                    break
                elif cmd_type == "ping":
                    await ws.send_json({"type": "pong"})
            except Exception as e:
                await ws.send_json({"type": "error", "message": str(e)})
        elif msg.type == WSMsgType.ERROR:
            break
            
    await ws.close()
    return ws

def create_app():
    app = web.Application()
    app.router.add_route("OPTIONS", "/{tail:.*}", options_handler)
    app.router.add_get("/health", health_handler)
    app.router.add_post("/v1/sessions", create_session_handler)
    app.router.add_get("/v1/ws/{session_id}", ws_handler)
    app.router.add_post("/transcribe", transcribe_handler)
    app.router.add_get("/ws", ws_handler)
    return app

if __name__ == "__main__":
    app = create_app()
    web.run_app(app, host="0.0.0.0", port=PORT)
