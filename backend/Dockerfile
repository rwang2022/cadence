# Cadence backend — bundles yt-dlp + ffmpeg so deploys "just work".
FROM node:20-slim

# ffmpeg from apt; yt-dlp as a static binary (newest, self-updating capable).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
