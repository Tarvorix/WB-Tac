export enum BehaviorStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  RUNNING = 'running'
}

export interface BehaviorContext {
  deltaTime: number;
}

export interface BehaviorNode {
  tick(context: BehaviorContext): BehaviorStatus;
  reset(): void;
}

export class BehaviorTree {
  private root: BehaviorNode;

  constructor(root: BehaviorNode) {
    this.root = root;
  }

  public tick(context: BehaviorContext): BehaviorStatus {
    return this.root.tick(context);
  }

  public reset(): void {
    this.root.reset();
  }
}

export class SequenceNode implements BehaviorNode {
  private children: BehaviorNode[];
  private currentIndex: number = 0;

  constructor(children: BehaviorNode[]) {
    this.children = children;
  }

  public tick(context: BehaviorContext): BehaviorStatus {
    while (this.currentIndex < this.children.length) {
      const status = this.children[this.currentIndex].tick(context);
      if (status === BehaviorStatus.RUNNING) {
        return BehaviorStatus.RUNNING;
      }
      if (status === BehaviorStatus.FAILURE) {
        this.reset();
        return BehaviorStatus.FAILURE;
      }
      this.currentIndex += 1;
    }
    this.reset();
    return BehaviorStatus.SUCCESS;
  }

  public reset(): void {
    this.currentIndex = 0;
    for (const child of this.children) {
      child.reset();
    }
  }
}

export class SelectorNode implements BehaviorNode {
  private children: BehaviorNode[];
  private currentIndex: number = 0;

  constructor(children: BehaviorNode[]) {
    this.children = children;
  }

  public tick(context: BehaviorContext): BehaviorStatus {
    while (this.currentIndex < this.children.length) {
      const status = this.children[this.currentIndex].tick(context);
      if (status === BehaviorStatus.RUNNING) {
        return BehaviorStatus.RUNNING;
      }
      if (status === BehaviorStatus.SUCCESS) {
        this.reset();
        return BehaviorStatus.SUCCESS;
      }
      this.currentIndex += 1;
    }
    this.reset();
    return BehaviorStatus.FAILURE;
  }

  public reset(): void {
    this.currentIndex = 0;
    for (const child of this.children) {
      child.reset();
    }
  }
}

export class ConditionNode implements BehaviorNode {
  private predicate: () => boolean;

  constructor(predicate: () => boolean) {
    this.predicate = predicate;
  }

  public tick(_context: BehaviorContext): BehaviorStatus {
    return this.predicate() ? BehaviorStatus.SUCCESS : BehaviorStatus.FAILURE;
  }

  public reset(): void {
    // No state to reset
  }
}

export class ActionNode implements BehaviorNode {
  private action: (context: BehaviorContext) => BehaviorStatus;
  private onReset?: () => void;

  constructor(action: (context: BehaviorContext) => BehaviorStatus, onReset?: () => void) {
    this.action = action;
    this.onReset = onReset;
  }

  public tick(context: BehaviorContext): BehaviorStatus {
    return this.action(context);
  }

  public reset(): void {
    if (this.onReset) {
      this.onReset();
    }
  }
}
