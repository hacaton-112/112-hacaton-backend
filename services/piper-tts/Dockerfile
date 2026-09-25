FROM python:3.12-slim

ARG PIPER_VERSION=1.8.0
ARG PIPER_VOICES="ru_RU-dmitri-medium ru_RU-irina-medium"

RUN pip install --no-cache-dir "piper-tts[http]==${PIPER_VERSION}"
RUN mkdir -p /voices \
    && python -m piper.download_voices --data-dir /voices ${PIPER_VOICES} \
    && python -c 'p = "/usr/local/lib/python3.12/site-packages/piper/http_server.py"; c = open(p).read().replace("app = Flask(__name__, static_folder=\"img\", static_url_path=\"/img\")", "app = Flask(__name__, static_folder=\"img\", static_url_path=\"/img\")\n    @app.after_request\n    def add_cors(r):\n        r.headers[\"Access-Control-Allow-Origin\"] = \"*\"\n        r.headers[\"Access-Control-Allow-Headers\"] = \"*\"\n        r.headers[\"Access-Control-Allow-Methods\"] = \"*\"\n        return r"); open(p, "w").write(c)'

EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/info', timeout=4)"

ENTRYPOINT ["python", "-m", "piper.http_server"]
CMD ["--host", "0.0.0.0", "--port", "5000", "--data-dir", "/voices", "-m", "ru_RU-irina-medium"]
