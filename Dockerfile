FROM mcr.microsoft.com/playwright:v1.63.0-noble
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip postgresql-client fontconfig poppler-utils tesseract-ocr tesseract-ocr-ara && rm -rf /var/lib/apt/lists/* \
 && pip3 install --break-system-packages --no-cache-dir pdfplumber openpyxl xlrd pillow pypdfium2
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --include=dev
COPY . .
RUN npm run build && FONT_DIR=/usr/local/share/fonts/abusamir ./scripts/install-fonts.sh && npm prune --omit=dev && date -u +%Y-%m-%dT%H:%M:%SZ > /app/BUILD_TIME && (python3 -c "import PIL, pypdfium2" && echo python-ok >> /app/BUILD_TIME || echo python-missing >> /app/BUILD_TIME)
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
