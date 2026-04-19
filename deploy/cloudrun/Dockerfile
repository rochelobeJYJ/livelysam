FROM python:3.12-slim

WORKDIR /app

COPY tools /app/tools

ENV PYTHONUNBUFFERED=1
ENV LIVELYSAM_DATA_PROXY_HOST=0.0.0.0
ENV LIVELYSAM_DATA_PROXY_DATA_ROOT=/tmp/livelysam-data-proxy

CMD ["python", "tools/livelysam_data_proxy.py"]
