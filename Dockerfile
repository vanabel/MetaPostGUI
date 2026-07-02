FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive

ARG DEBIAN_MIRROR=https://mirrors.ustc.edu.cn/debian
ARG DEBIAN_SECURITY_MIRROR=https://mirrors.ustc.edu.cn/debian-security

RUN set -eux; \
  if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
    sed -i \
      -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
      -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
      -e "s|http://security.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
      /etc/apt/sources.list.d/debian.sources; \
  fi; \
  if [ -f /etc/apt/sources.list ]; then \
    sed -i \
      -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
      -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
      -e "s|http://security.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
      /etc/apt/sources.list; \
  fi; \
  apt-get update && apt-get install -y --no-install-recommends \
    curl \
    fonts-arphic-gkai00mp \
    ghostscript \
    latex-cjk-chinese \
    python3 \
    python3-pip \
    python3-venv \
    texlive-fonts-recommended \
    texlive-lang-chinese \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-latex-recommended \
    texlive-metapost \
    dvisvgm \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN corepack enable \
  && corepack prepare pnpm@11.5.3 --activate \
  && bash ./scripts/setup-python.sh \
  && pnpm --dir web install --frozen-lockfile \
  && pnpm --dir web build

ENV METAPOSTGUI_API_HOST=127.0.0.1 \
    METAPOSTGUI_API_PORT=18765 \
    METAPOSTGUI_WEB_HOST=0.0.0.0 \
    METAPOSTGUI_WEB_PORT=18080 \
    METAPOSTGUI_PORT_TRIES=1

EXPOSE 18080

CMD ["bash", "./scripts/docker-entrypoint.sh"]
