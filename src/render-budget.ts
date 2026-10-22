export type RenderQuality = 'full' | 'balanced' | 'light';

/** Adapts particle drawing cost without changing the selected preset or camera pixels. */
export class RenderBudget {
  private level = 0;
  private slowFrames = 0;
  private fastFrames = 0;

  get quality(): RenderQuality { return (['full', 'balanced', 'light'] as const)[this.level]; }

  observe(renderMilliseconds: number): void {
    if (!Number.isFinite(renderMilliseconds) || renderMilliseconds < 0) return;
    if (renderMilliseconds > 20) {
      this.fastFrames = 0;
      if (++this.slowFrames >= 3) {
        this.level = Math.min(2, this.level + 1);
        this.slowFrames = 0;
      }
    } else if (renderMilliseconds < 10) {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      if (++this.fastFrames >= 90) {
        this.level = Math.max(0, this.level - 1);
        this.fastFrames = 0;
      }
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.fastFrames = 0;
    }
  }

  particleCount(available: number): number {
    if (!Number.isFinite(available) || available <= 0) return 0;
    return Math.max(1, Math.floor(available * [1, 0.6, 0.3][this.level]));
  }
}
