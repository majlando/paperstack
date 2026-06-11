import { FakePlatform } from "@paperstack/engine";

/**
 * A one-shot gate on a platform call: `reached` resolves when the matching
 * call arrives (the test now knows the operation is mid-flight), and the call
 * itself blocks until the test calls `release()`. This makes race tests
 * deterministic — no sleeping and hoping the interleaving happened.
 */
export interface Gate {
  /** Resolves when a matching call has arrived and is now blocked. */
  reached: Promise<void>;
  /** Lets the blocked call proceed. */
  release: () => void;
}

interface PendingGate {
  match: (path: string) => boolean;
  signalReached: () => void;
  blockedUntil: Promise<void>;
}

/**
 * In-memory Platform for store tests, with controllable timing: individual
 * reads/writes can be held open (to interleave keystrokes, section switches,
 * reloads against them) or made to fail (to test error paths).
 */
export class GatedPlatform extends FakePlatform {
  /** Paths of completed writes, in order. */
  writes: string[] = [];
  /** When set, a write to a matching path throws a readable error. */
  failWrites: ((path: string) => boolean) | null = null;

  private writeGates: PendingGate[] = [];
  private readGates: PendingGate[] = [];

  /** Holds the next write to a matching path until released (one-shot). */
  gateNextWrite(match: (path: string) => boolean): Gate {
    return addGate(this.writeGates, match);
  }

  /** Holds the next read of a matching path until released (one-shot). */
  gateNextRead(match: (path: string) => boolean): Gate {
    return addGate(this.readGates, match);
  }

  /** Resets files and all gates/counters between tests. */
  reset(files: Record<string, string>): void {
    this.files.clear();
    for (const [path, content] of Object.entries(files)) this.files.set(path, content);
    this.writes = [];
    this.failWrites = null;
    this.writeGates = [];
    this.readGates = [];
  }

  async readTextFile(path: string): Promise<string> {
    await passGate(this.readGates, path);
    return super.readTextFile(path);
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await passGate(this.writeGates, path);
    if (this.failWrites?.(path)) {
      throw new Error(`The file could not be written: ${path}`);
    }
    this.writes.push(path);
    await super.writeTextFile(path, content);
  }
}

function addGate(gates: PendingGate[], match: (path: string) => boolean): Gate {
  let signalReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((r) => (signalReached = r));
  const blockedUntil = new Promise<void>((r) => (release = r));
  gates.push({ match, signalReached, blockedUntil });
  return { reached, release };
}

async function passGate(gates: PendingGate[], path: string): Promise<void> {
  const i = gates.findIndex((g) => g.match(path));
  if (i === -1) return;
  const [gate] = gates.splice(i, 1);
  gate!.signalReached();
  await gate!.blockedUntil;
}
