/**
 * The JEV policy gate: the availability/enforce switch, read defensively.
 *
 * Why a module: three collaborators ask the same question (is JEV on, is it
 * enforcing) and the answer comes from a provider that can throw while settings
 * load. One place normalises it.
 */

/** When to use: declaring the optional JEV gate; wired by index.ts to the settings store + decision status. */
export interface JevPolicy {
  available: boolean;
  enforce: boolean;
}

const OFF: JevPolicy = { available: false, enforce: false };

/** When to use: `JevController` — own the policy provider and its normalisation. */
export class JevPolicyGate {
  private provider: () => JevPolicy = () => OFF;

  /** When to use: startup — point the gate at the live settings. */
  set(provider: () => JevPolicy): void {
    this.provider = provider;
  }

  /** The normalised policy: enforcement only counts when the gate is available. */
  get(): JevPolicy {
    try {
      const policy = this.provider();
      const available = policy?.available === true;
      return { available, enforce: available && policy?.enforce === true };
    } catch {
      return { available: false, enforce: false };
    }
  }

  enabled(): boolean {
    return this.get().available;
  }

  enforced(): boolean {
    return this.get().enforce;
  }
}
