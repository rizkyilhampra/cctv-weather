# Use official Playwright image with Chrome support
# This includes Chrome browser with H.264 codec support needed for CCTV streams
FROM mcr.microsoft.com/playwright:v1.56.1-noble

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Create data directories
RUN mkdir -p data/snapshots data/captures

# Build the project
RUN npm run build

# Remove devDependencies after build to reduce image size
RUN npm prune --production

# Set environment variables (can be overridden by docker-compose or docker run)
ENV NODE_ENV=production
ENV HEADLESS=true
ENV BROWSER_CHANNEL=chrome

# Run as non-root user for security (pwuser is created by Playwright image)
USER pwuser

# Command to run the application
CMD ["node", "dist/index.js"]
