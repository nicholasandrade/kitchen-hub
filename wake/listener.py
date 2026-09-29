"""Local Kitchen Hub wake-word listener powered by sherpa-onnx."""

from __future__ import annotations

import json
import os
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import sherpa_onnx


ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models" / "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
HUB_WAKE_URL = os.environ.get("KITCHEN_HUB_WAKE_URL", "http://127.0.0.1:8787/api/wake")
LISTENER_HOST = os.environ.get("KITCHEN_HUB_WAKE_HOST", "127.0.0.1")
LISTENER_PORT = int(os.environ.get("KITCHEN_HUB_WAKE_PORT", "8788"))


def model_file(name: str) -> str:
    path = MODEL_DIR / name
    if not path.is_file():
        raise FileNotFoundError(f"Missing wake model file: {path}")
    return str(path)


def notify_hub(keyword: str) -> None:
    payload = json.dumps({"phrase": keyword}).encode("utf-8")
    request = urllib.request.Request(
        HUB_WAKE_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            delivery = json.loads(response.read().decode("utf-8"))
        print(f"Wake phrase detected; notified {delivery.get('delivered', 0)} Hub client(s).", flush=True)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"Wake phrase detected, but the Hub server is unavailable: {error}", file=sys.stderr, flush=True)


def create_spotter() -> sherpa_onnx.KeywordSpotter:
    keywords = model_file("kitchen-hub-keywords.txt")
    spotter = sherpa_onnx.KeywordSpotter(
        tokens=model_file("tokens.txt"),
        encoder=model_file("encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        decoder=model_file("decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        joiner=model_file("joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        keywords_file=keywords,
        num_threads=1,
        max_active_paths=4,
        keywords_score=float(os.environ.get("KITCHEN_HUB_WAKE_SCORE", "1.5")),
        keywords_threshold=float(os.environ.get("KITCHEN_HUB_WAKE_THRESHOLD", "0.35")),
        num_trailing_blanks=1,
        provider="cpu",
    )

    return spotter


def main() -> None:
    spotter = create_spotter()
    stream = spotter.create_stream()
    decoder_lock = threading.Lock()

    class AudioHandler(BaseHTTPRequestHandler):
        received_chunks = 0

        def end_headers(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Sample-Rate")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            super().end_headers()

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.end_headers()

        def do_GET(self) -> None:
            if self.path != "/health":
                self.send_error(404)
                return
            payload = json.dumps({"ready": True, "receivedChunks": self.received_chunks}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_POST(self) -> None:
            if self.path != "/audio":
                self.send_error(404)
                return
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1024 * 1024:
                self.send_error(400, "Invalid audio payload")
                return
            sample_rate = int(float(self.headers.get("X-Sample-Rate", "16000")))
            samples = np.frombuffer(self.rfile.read(length), dtype="<f4")
            type(self).received_chunks += 1
            detected = ""
            with decoder_lock:
                stream.accept_waveform(sample_rate, samples)
                while spotter.is_ready(stream):
                    spotter.decode_stream(stream)
                    result = spotter.get_result(stream)
                    if result:
                        detected = result
                        spotter.reset_stream(stream)
                        break
            if detected:
                notify_hub(detected)
            self.send_response(204)
            self.end_headers()

        def log_message(self, _format: str, *_args: object) -> None:
            return

    server = ThreadingHTTPServer((LISTENER_HOST, LISTENER_PORT), AudioHandler)
    print(f"Kitchen Hub wake listener ready on http://{LISTENER_HOST}:{LISTENER_PORT}/audio", flush=True)
    print('Say “Kitchen Hub” to open a seven-second command window.', flush=True)
    server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Wake listener stopped.")

