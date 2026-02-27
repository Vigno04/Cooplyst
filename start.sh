#!/bin/sh
# Start the Node.js backend in the background
node /app/src/index.js &

# Start nginx in the foreground (keeps the container alive)
nginx -g "daemon off;"
