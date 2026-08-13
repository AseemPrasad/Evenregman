export const runtime = 'nodejs';

export async function GET() {
  let clientCount = 0;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: unknown) => {
        controller.enqueue(
          `data: ${JSON.stringify(data)}\n\n`
        );
      };

      // Simulate audit events for demo
      const interval = setInterval(() => {
        const actions = ['create', 'update', 'delete', 'cancel'];
        const resources = ['registration', 'event', 'reservation'];
        const userId = ['user1', 'user2', 'host1'][Math.floor(Math.random() * 3)];

        sendEvent({
          _id: Math.random().toString(36).substr(2, 9),
          action: actions[Math.floor(Math.random() * actions.length)],
          userId,
          resourceType: resources[Math.floor(Math.random() * resources.length)],
          resourceId: Math.random().toString(36).substr(2, 9),
          changes: { status: 'updated' },
          timestamp: new Date().toISOString(),
        });
      }, 5000);

      const cleanup = () => {
        clearInterval(interval);
        controller.close();
      };

      // Cleanup on client disconnect
      if (typeof AbortSignal !== 'undefined') {
        // AbortSignal handling would go here
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
