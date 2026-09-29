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
import sentencepiece as spm
import sherpa_onnx


ROOT = Path(__file__).resolve().parent
MODEL_DIR = Path(os.environ.get("KITCHEN_HUB_MODEL_DIR", ROOT / "models" / "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"))
DATA_DIR = Path(os.environ.get("KITCHEN_HUB_DATA_DIR", ROOT))
HUB_WAKE_URL = os.environ.get("KITCHEN_HUB_WAKE_URL", "http://127.0.0.1:8787/api/wake")
LISTENER_HOST = os.environ.get("KITCHEN_HUB_WAKE_HOST", "127.0.0.1")
LISTENER_PORT = int(os.environ.get("KITCHEN_HUB_WAKE_PORT", "8788"))
KEYWORDS_FILE = DATA_DIR / "wake" / "active-keyword.txt"
ACTIVE_PHRASE_FILE = DATA_DIR / "wake" / "wake-phrase.txt"


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
    spotter = sherpa_onnx.KeywordSpotter(
        tokens=model_file("tokens.txt"),
        encoder=model_file("encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        decoder=model_file("decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        joiner=model_file("joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        keywords_file=str(KEYWORDS_FILE),
        num_threads=1,
        max_active_paths=4,
        keywords_score=float(os.environ.get("KITCHEN_HUB_WAKE_SCORE", "1.5")),
        keywords_threshold=float(os.environ.get("KITCHEN_HUB_WAKE_THRESHOLD", "0.35")),
        num_trailing_blanks=1,
        provider="cpu",
    )

    return spotter


def build_keyword(phrase: str) -> None:
    KEYWORDS_FILE.parent.mkdir(parents=True, exist_ok=True)
    processor = spm.SentencePieceProcessor(model_file=model_file("bpe.model"))
    pieces = processor.encode(phrase.upper(), out_type=str)
    if not pieces:
        raise ValueError("The wake phrase could not be tokenized.")
    KEYWORDS_FILE.write_text(f"{' '.join(pieces)} :1.5 #0.35 @WAKE_PHRASE\n", encoding="utf-8")
    ACTIVE_PHRASE_FILE.write_text(phrase, encoding="utf-8")


def main() -> None:
    active_phrase = ACTIVE_PHRASE_FILE.read_text(encoding="utf-8").strip() if ACTIVE_PHRASE_FILE.is_file() else "Kitchen Hub"
    build_keyword(active_phrase)
    spotter_state = {"spotter": create_spotter(), "stream": None, "phrase": active_phrase}
    spotter_state["stream"] = spotter_state["spotter"].create_stream()
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
            payload = json.dumps({"ready": True, "receivedChunks": self.received_chunks, "phrase": spotter_state["phrase"]}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_PUT(self) -> None:
            if self.path != "/keyword":
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8"))
                phrase = " ".join(str(body.get("phrase", "")).strip().split())
                if not phrase or len(phrase) > 32:
                    raise ValueError("Wake phrase must be between 2 and 32 characters.")
                with decoder_lock:
                    build_keyword(phrase)
                    next_spotter = create_spotter()
                    spotter_state.update({"spotter": next_spotter, "stream": next_spotter.create_stream(), "phrase": phrase})
                payload = json.dumps({"phrase": phrase}).encode("utf-8")
                self.send_response(200)
            except (ValueError, OSError) as error:
                payload = json.dumps({"error": str(error)}).encode("utf-8")
                self.send_response(400)
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
                spotter = spotter_state["spotter"]
                stream = spotter_state["stream"]
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
    print(f'Say “{active_phrase}” to open a seven-second command window.', flush=True)
    server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Wake listener stopped.")

