type MediaOwner = "ai-live" | "person-call";

class MediaResourceCoordinator {
  private owner: MediaOwner | null = null;
  private releasers = new Map<MediaOwner, () => Promise<void> | void>();

  register(owner: MediaOwner, release: () => Promise<void> | void) {
    this.releasers.set(owner, release);
    return () => this.releasers.delete(owner);
  }

  async acquire(owner: MediaOwner) {
    if (!this.owner || this.owner === owner) {
      this.owner = owner;
      return;
    }
    if (owner === "ai-live" && this.owner === "person-call") {
      throw new Error("Camera and microphone are currently being used by a call");
    }
    const previous = this.owner;
    await this.releasers.get(previous)?.();
    if (this.owner === previous) this.owner = null;
    this.owner = owner;
  }

  release(owner: MediaOwner) {
    if (this.owner === owner) this.owner = null;
  }

  currentOwner() {
    return this.owner;
  }
}

export const mediaResourceCoordinator = new MediaResourceCoordinator();
