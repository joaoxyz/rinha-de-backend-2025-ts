#!/bin/sh

# Start Redis in the background
redis-server --save "" \
    --protected-mode no \
    --loadmodule /opt/redis-stack/lib/redisearch.so \
    --loadmodule /opt/redis-stack/lib/rejson.so &

# Wait for Redis to be ready
sleep 1

# Set summary keys
# redis-cli HSET summary:default totalRequests 0 totalAmount 0
# redis-cli HSET summary:fallback totalRequests 0 totalAmount 0
redis-cli FT.CREATE defaultByDate ON JSON PREFIX 1 payment:default: SCHEMA

# Keep the container running (important for the Redis server)
wait