FROM ghcr.io/puppeteer/puppeteer:latest

# Set working directory
WORKDIR /app

# Force clean cache to avoid permission issue
ENV NPM_CONFIG_CACHE=/tmp/.npm

# Copy package info and install dependencies
COPY package*.json ./
RUN npm install --no-optional --legacy-peer-deps

# Copy remaining files
COPY . .

CMD ["npm", "start"]
