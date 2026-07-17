type SseReservation =
  | { allowed: false; retryAfterSeconds: number }
  | { allowed: true; release: () => void };

const maxConnectionsPerUserTask = 2;
const maxConnectionsPerUser = 20;
const maxConnectionsPerInstance = 500;
const userTaskConnections = new Map<string, number>();
const userConnections = new Map<string, number>();
const activeConnectionClosers = new Set<() => void>();
let totalConnections = 0;

export function reserveSseConnection(userId: string, taskId: string): SseReservation {
  const userTaskKey = `${userId}\u0000${taskId}`;
  const taskCount = userTaskConnections.get(userTaskKey) || 0;
  const userCount = userConnections.get(userId) || 0;
  if (taskCount >= maxConnectionsPerUserTask || userCount >= maxConnectionsPerUser || totalConnections >= maxConnectionsPerInstance) {
    return { allowed: false, retryAfterSeconds: 30 };
  }
  userTaskConnections.set(userTaskKey, taskCount + 1);
  userConnections.set(userId, userCount + 1);
  totalConnections += 1;
  let released = false;
  return {
    allowed: true,
    release: () => {
      if (released) return;
      released = true;
      decrement(userTaskConnections, userTaskKey);
      decrement(userConnections, userId);
      totalConnections = Math.max(0, totalConnections - 1);
    }
  };
}

export function getSseConnectionMetrics() {
  return { totalConnections, activeUsers: userConnections.size, activeUserTasks: userTaskConnections.size };
}

export function registerSseConnectionCloser(close: () => void) {
  activeConnectionClosers.add(close);
  return () => activeConnectionClosers.delete(close);
}

export function closeAllSseConnections() {
  for (const close of [...activeConnectionClosers]) close();
}

export function resetSseConnectionLimits() {
  userTaskConnections.clear();
  userConnections.clear();
  activeConnectionClosers.clear();
  totalConnections = 0;
}

function decrement(map: Map<string, number>, key: string) {
  const next = (map.get(key) || 1) - 1;
  if (next <= 0) map.delete(key);
  else map.set(key, next);
}
