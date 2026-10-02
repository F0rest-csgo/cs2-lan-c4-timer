const { performance } = require('node:perf_hooks');

class BombTimer {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.durationMs = 40_000;
    this.deadline = null;
    this.lastGsiAt = null;
    this.lastTimestamp = null;
    this.roundKey = null;
    this.lastBomb = null;
    this.defusedRemainingMs = null;
    this.endedRemainingMs = null;
    this.lastPhase = null;
    this.mapName = null;
  }

  reset() {
    this.deadline = null;
    this.lastBomb = null;
    this.defusedRemainingMs = null;
    this.endedRemainingMs = null;
  }

  update(payload) {
    const time = this.now();
    const timestamp = payload.provider?.timestamp;
    // Discard delayed snapshots from the same running game.
    if (Number.isFinite(timestamp) && this.lastTimestamp !== null && timestamp < this.lastTimestamp) return;
    if (Number.isFinite(timestamp)) this.lastTimestamp = timestamp;
    this.lastGsiAt = time;
    const map = payload.map;
    const round = payload.round;
    // GSI sends full snapshots; returning to the menu removes map/round.
    if (payload.removed?.map || (payload.provider && !map && !round && !payload.bomb)) {
      this.reset();
      this.roundKey = null;
      this.mapName = null;
      this.lastPhase = null;
      return;
    }
    const bomb = round?.bomb || payload.bomb?.state;
    const phase = round?.phase;
    const key = map && Number.isInteger(map.round) ? `${map.name || ''}:${map.round}` : null;
    // map.round may increase in the same snapshot that announces the result.
    // Preserve the old timer through that snapshot; freezetime starts a new round.
    const result = phase === 'over' || bomb === 'defused' || bomb === 'exploded';
    const mapChanged = map?.name && this.mapName && map.name !== this.mapName;
    const newRound = phase === 'freezetime'
      || (phase === 'live' && this.lastPhase === 'over')
      || (key !== null && key !== this.roundKey && !result);
    if (mapChanged || newRound || (map?.phase && map.phase !== 'live')) this.reset();
    if (key !== null) this.roundKey = key;
    if (map?.name) this.mapName = map.name;
    if (phase) this.lastPhase = phase;
    if (phase === 'freezetime' || (map?.phase && map.phase !== 'live')) return;

    if (bomb === 'defused') {
      if (this.defusedRemainingMs === null) {
        this.defusedRemainingMs = this.deadline === null
          ? (this.endedRemainingMs ?? 0) : Math.max(0, this.deadline - time);
      }
      this.deadline = null;
      this.lastBomb = 'defused';
    } else if (this.defusedRemainingMs !== null) {
      // Keep the frozen result even when subsequent over snapshots omit bomb.
      return;
    } else if (phase === 'over' || bomb === 'exploded') {
      if (this.deadline !== null) this.endedRemainingMs = Math.max(0, this.deadline - time);
      this.deadline = null;
      this.lastBomb = bomb || null;
    } else if (bomb === 'planted' && this.lastBomb !== 'planted') {
      this.deadline = time + this.durationMs;
      this.lastBomb = 'planted';
    } else if (bomb && !['planted', 'defusing'].includes(bomb)) {
      this.deadline = null;
      this.lastBomb = bomb;
    }
  }

  snapshot() {
    const now = this.now();
    return {
      planted: this.deadline !== null,
      defused: this.defusedRemainingMs !== null,
      remainingMs: this.defusedRemainingMs ?? (this.deadline === null ? 0 : Math.max(0, this.deadline - now)),
      durationMs: this.durationMs,
      gsiConnected: this.lastGsiAt !== null && now - this.lastGsiAt < 10_000,
      gsiAgeMs: this.lastGsiAt === null ? null : Math.max(0, now - this.lastGsiAt),
    };
  }
}

module.exports = { BombTimer };
