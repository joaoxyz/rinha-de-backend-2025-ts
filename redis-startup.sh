    #!/bin/sh

    # Start Redis in the background
    redis-server &

    # Wait for Redis to be ready
    sleep 5

    # Set your keys
    redis-cli SET mykey1 'value1'
    redis-cli SET mykey2 'value2'

    # Keep the container running (important for the Redis server)
    wait