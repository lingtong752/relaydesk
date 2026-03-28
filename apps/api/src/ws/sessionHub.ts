import type { RealtimeEvent } from "@shared";

export class SessionHub {
  private readonly subscriptions = new Map<string, Set<WebSocket>>();

  subscribe(channel: string, socket: WebSocket): void {
    const current = this.subscriptions.get(channel) ?? new Set<WebSocket>();
    current.add(socket);
    this.subscriptions.set(channel, current);
  }

  unsubscribeSocket(socket: WebSocket): void {
    for (const subscribers of this.subscriptions.values()) {
      subscribers.delete(socket);
    }
  }

  publish(channel: string, event: RealtimeEvent): void {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers) {
      return;
    }

    const payload = JSON.stringify(event);
    for (const socket of subscribers) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }
}
