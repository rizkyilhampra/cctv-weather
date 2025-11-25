FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app

COPY package*.json ./

RUN npm ci

# Install Chrome (primary) and Firefox (fallback for HLS streams)
RUN npx playwright install chrome firefox --with-deps

COPY tsconfig.json ./
COPY src ./src

RUN mkdir -p data/snapshots data/captures data/logs

RUN npm run build

RUN npm prune --production

ENV NODE_ENV=production
ENV HEADLESS=true
ENV BROWSER_CHANNEL=chrome
ENV ENABLE_FIREFOX_FALLBACK=true

USER pwuser

CMD ["node", "dist/index.js"]
