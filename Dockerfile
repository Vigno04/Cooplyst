# Stage 1: Build the React frontend
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Combined image (nginx + Node.js backend)
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# Set up backend
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/src/ ./src/

# Copy assets for backend to serve
COPY src/assets ./assets/

# Copy built frontend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy nginx config
# On Debian, the default site config is at /etc/nginx/sites-available/default
COPY nginx.conf /etc/nginx/sites-available/default
RUN ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80
CMD ["/start.sh"]
