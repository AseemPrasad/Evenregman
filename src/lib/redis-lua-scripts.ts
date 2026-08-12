import "server-only";

export const LUA_SCRIPTS = {
  checkAndDecrement: `
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local eventId = tostring(ARGV[2])

    local current = redis.call('GET', key)
    if not current then
      redis.call('SET', key, tostring(capacity))
      current = capacity
    else
      current = tonumber(current)
    end

    if current <= 0 then
      return {err = "SOLD_OUT"}
    end

    local newCount = redis.call('DECR', key)
    if newCount < 0 then
      redis.call('INCR', key)
      return {err = "SOLD_OUT"}
    end

    return {ok = newCount}
  `,

  rollbackIncrement: `
    local key = KEYS[1]
    local newCount = redis.call('INCR', key)
    return {ok = newCount}
  `,

  seedCapacity: `
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local eventId = tostring(ARGV[2])

    local current = redis.call('GET', key)
    if not current then
      redis.call('SET', key, tostring(capacity))
      return {ok = capacity}
    end

    return {ok = tonumber(current)}
  `
} as const;

export const LUA_SCRIPT_HASHES = {
  checkAndDecrement: "check-and-decrement-v1",
  rollbackIncrement: "rollback-increment-v1",
  seedCapacity: "seed-capacity-v1"
} as const;
