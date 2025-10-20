/**
 * Playbook storage and mutation logic for ACE.
 */

import { DeltaBatch, DeltaOperation } from "./delta";

export interface Bullet {
  id: string;
  section: string;
  content: string;
  helpful: number;
  harmful: number;
  neutral: number;
  createdAt: string;
  updatedAt: string;
}

export class Playbook {
  private bullets: Record<string, Bullet> = {};
  private sections: Record<string, string[]> = {};
  private nextId = 0;

  // ------------------------------------------------------------------ //
  // CRUD utils
  // ------------------------------------------------------------------ //
  addBullet(
    section: string,
    content: string,
    bulletId?: string,
    metadata?: Record<string, number>
  ): Bullet {
    bulletId = bulletId || this.generateId(section);
    metadata = metadata || {};
    const bullet: Bullet = {
      id: bulletId,
      section,
      content,
      helpful: metadata["helpful"] || 0,
      harmful: metadata["harmful"] || 0,
      neutral: metadata["neutral"] || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.bullets[bulletId] = bullet;
    if (!this.sections[section]) {
      this.sections[section] = [];
    }
    this.sections[section].push(bulletId);
    return bullet;
  }

  updateBullet(
    bulletId: string,
    content?: string,
    metadata?: Record<string, number>
  ): Bullet | undefined {
    const bullet = this.bullets[bulletId];
    if (!bullet) {
      return undefined;
    }
    if (content) {
      bullet.content = content;
    }
    if (metadata) {
      for (const key in metadata) {
        if (key in bullet) {
          (bullet as any)[key] = metadata[key];
        }
      }
    }
    bullet.updatedAt = new Date().toISOString();
    return bullet;
  }

  tagBullet(
    bulletId: string,
    tag: string,
    increment = 1
  ): Bullet | undefined {
    const bullet = this.bullets[bulletId];
    if (!bullet) {
      return undefined;
    }
    if (tag === "helpful" || tag === "harmful" || tag === "neutral") {
      bullet[tag] += increment;
    } else {
      throw new Error(`Unsupported tag: ${tag}`);
    }
    bullet.updatedAt = new Date().toISOString();
    return bullet;
  }

  removeBullet(bulletId: string): void {
    const bullet = this.bullets[bulletId];
    if (!bullet) {
      return;
    }
    delete this.bullets[bulletId];
    const sectionList = this.sections[bullet.section];
    if (sectionList) {
      this.sections[bullet.section] = sectionList.filter(
        (id) => id !== bulletId
      );
      if (this.sections[bullet.section].length === 0) {
        delete this.sections[bullet.section];
      }
    }
  }

  getBullet(bulletId: string): Bullet | undefined {
    return this.bullets[bulletId];
  }

  getBullets(): Bullet[] {
    return Object.values(this.bullets);
  }

  // ------------------------------------------------------------------ //
  // Serialization
  // ------------------------------------------------------------------ //
  toDict(): Record<string, any> {
    return {
      bullets: this.bullets,
      sections: this.sections,
      nextId: this.nextId,
    };
  }

  static fromDict(payload: Record<string, any>): Playbook {
    const playbook = new Playbook();
    playbook.bullets = payload["bullets"] || {};
    playbook.sections = payload["sections"] || {};
    playbook.nextId = payload["nextId"] || 0;
    return playbook;
  }

  dumps(): string {
    return JSON.stringify(this.toDict(), null, 2);
  }

  static loads(data: string): Playbook {
    return Playbook.fromDict(JSON.parse(data));
  }

  // ------------------------------------------------------------------ //
  // Delta application
  // ------------------------------------------------------------------ //
  applyDelta(delta: DeltaBatch): void {
    for (const operation of delta.operations) {
      this.applyOperation(operation);
    }
  }

  private applyOperation(operation: DeltaOperation): void {
    const opType = operation.type.toUpperCase();
    if (opType === "ADD") {
      this.addBullet(
        operation.section,
        operation.content || "",
        operation.bullet_id,
        operation.metadata
      );
    } else if (opType === "UPDATE") {
      if (!operation.bullet_id) {
        return;
      }
      this.updateBullet(
        operation.bullet_id,
        operation.content,
        operation.metadata
      );
    } else if (opType === "TAG") {
      if (!operation.bullet_id) {
        return;
      }
      for (const tag in operation.metadata) {
        this.tagBullet(operation.bullet_id, tag, operation.metadata[tag]);
      }
    } else if (opType === "REMOVE") {
      if (!operation.bullet_id) {
        return;
      }
      this.removeBullet(operation.bullet_id);
    }
  }

  // ------------------------------------------------------------------ //
  // Presentation helpers
  // ------------------------------------------------------------------ //
  asPrompt(): string {
    const parts: string[] = [];
    for (const section in this.sections) {
      parts.push(`## ${section}`);
      for (const bulletId of this.sections[section]) {
        const bullet = this.bullets[bulletId];
        const counters = `(helpful=${bullet.helpful}, harmful=${bullet.harmful}, neutral=${bullet.neutral})`;
        parts.push(`- [${bullet.id}] ${bullet.content} ${counters}`);
      }
    }
    return parts.join("\n");
  }

  stats(): Record<string, any> {
    return {
      sections: Object.keys(this.sections).length,
      bullets: Object.keys(this.bullets).length,
      tags: {
        helpful: Object.values(this.bullets).reduce(
          (acc, b) => acc + b.helpful,
          0
        ),
        harmful: Object.values(this.bullets).reduce(
          (acc, b) => acc + b.harmful,
          0
        ),
        neutral: Object.values(this.bullets).reduce(
          (acc, b) => acc + b.neutral,
          0
        ),
      },
    };
  }

  // ------------------------------------------------------------------ //
  // Internal helpers
  // ------------------------------------------------------------------ //
  private generateId(section: string): string {
    this.nextId++;
    const sectionPrefix = section.split(" ")[0].toLowerCase();
    return `${sectionPrefix}-${this.nextId.toString().padStart(5, "0")}`;
  }
}
