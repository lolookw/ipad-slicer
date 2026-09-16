export class WorkerMeshCache {
  private generation: number | undefined;
  private readonly blobs = new Map<string, Blob>();

  put(generation: number, meshId: string, blob: Blob): void {
    if (this.generation !== generation) { this.blobs.clear(); this.generation = generation; }
    this.blobs.set(meshId, blob);
  }

  release(generation: number, meshId: string): void {
    this.requireGeneration(generation);
    this.blobs.delete(meshId);
  }

  async read(generation: number, meshIds: readonly string[]): Promise<Uint8Array[]> {
    this.requireGeneration(generation);
    return Promise.all(meshIds.map(async meshId => {
      const blob = this.blobs.get(meshId);
      if (!blob) throw new Error(`Missing mesh ${meshId}`);
      return new Uint8Array(await blob.arrayBuffer());
    }));
  }

  get size(): number { return this.blobs.size; }

  private requireGeneration(generation: number): void {
    if (this.generation !== generation) throw new Error(`Stale mesh generation ${generation}; expected ${this.generation ?? 'none'}`);
  }
}
