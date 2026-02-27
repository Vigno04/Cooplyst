# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Combined image (nginx + Node.js backend)
FROM node:20-alpine
RUN apk add --no-cache nginx

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
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80
CMD ["/start.sh"]
