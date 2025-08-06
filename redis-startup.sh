#!/bin/sh

# Start Redis in the background
redis-server --save "" &

# Wait for Redis to be ready
sleep 5

# Set summary keys
redis-cli HSET summary:default totalRequests 0 totalAmount 0
redis-cli HSET summary:fallback totalRequests 0 totalAmount 0

# Keep the container running (important for the Redis server)
wait