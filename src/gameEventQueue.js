// Bounded FIFO. Work per real server tick stays bounded even during a burst.
export class GameEventQueue {
  constructor({ maxPending, maxPerTick, reservedGiftSlots, now = Date.now }) {
    this.maxPending = maxPending;
    this.maxPerTick = maxPerTick;
    this.reservedGiftSlots = reservedGiftSlots;
    this.now = now;
    this.items = [];
    this.head = 0;
    this.stats = { processed: 0, dropped: 0, droppedGifts: 0, coalesced: 0, peak: 0 };
  }

  get size() { return this.items.length - this.head; }

  enqueue(type, data, matchId) {
    const last = this.items.at(-1);
    // Only merge adjacent events: never move a like ahead of its team-join chat.
    if (this.size && last.type === type && last.matchId === matchId) {
      if (type === 'viewer_count') {
        last.data = { ...data };
        this.stats.coalesced += 1;
        return true;
      }
      if (type === 'like_received' && last.data.userId === data.userId) {
        const likes = Number(data.likeCount);
        if (Number.isFinite(likes) && likes > 0) {
          last.data.likeCount = Math.min(Number.MAX_SAFE_INTEGER, Number(last.data.likeCount) + likes);
          this.stats.coalesced += 1;
          return true;
        }
      }
    }
    const limit = type === 'gift_received' ? this.maxPending : this.maxPending - this.reservedGiftSlots;
    if (this.size >= limit) {
      this.stats.dropped += 1;
      if (type === 'gift_received') this.stats.droppedGifts += 1;
      return false;
    }
    this.items.push({ type, data: { ...data }, matchId, receivedAt: this.now() });
    this.stats.peak = Math.max(this.stats.peak, this.size);
    return true;
  }

  drain(matchId, handle) {
    let count = 0;
    while (this.size && count < this.maxPerTick) {
      const event = this.items[this.head++];
      if (event.matchId === matchId) handle(event);
      count += 1;
      this.stats.processed += 1;
    }
    if (!this.size) this.clear();
    else if (this.head >= this.maxPending) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return count;
  }

  clear() { this.items = []; this.head = 0; }
  getStats() { return { ...this.stats, pending: this.size }; }
}
