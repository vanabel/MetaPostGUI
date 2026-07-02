FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ghostscript \
    python3 \
    python3-pip \
    python3-venv \
    texlive-fonts-recommended \
    texlive-lang-chinese \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-metapost \
    dvisvgm \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN corepack enable \
  && corepack prepare pnpm@11.5.3 --activate \
  && ./scripts/setup-python.sh \
  && pnpm --dir web install --frozen-lockfile \
  && pnpm --dir web build

ENV METAPOSTGUI_API_HOST=127.0.0.1 \
    METAPOSTGUI_API_PORT=18765 \
    METAPOSTGUI_WEB_HOST=0.0.0.0 \
    METAPOSTGUI_WEB_PORT=18080 \
    METAPOSTGUI_PORT_TRIES=1

EXPOSE 18080

CMD ["./scripts/docker-entrypoint.sh"]
