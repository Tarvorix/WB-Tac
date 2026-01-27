export interface SquadWorldState {
  hasEnemyContact: boolean;
  hasOrderTarget: boolean;
  isUnderFire: boolean;
}

export type PrimitiveTaskType =
  | 'ENGAGE'
  | 'FALLBACK'
  | 'RECON'
  | 'SECURE'
  | 'PATROL';

export class HTNPrimitiveTask {
  public name: PrimitiveTaskType;

  constructor(name: PrimitiveTaskType) {
    this.name = name;
  }
}

export class HTNMethod {
  public name: string;
  public preconditions: (world: SquadWorldState) => boolean;
  public subtasks: HTNTask[];

  constructor(
    name: string,
    preconditions: (world: SquadWorldState) => boolean,
    subtasks: HTNTask[]
  ) {
    this.name = name;
    this.preconditions = preconditions;
    this.subtasks = subtasks;
  }
}

export class HTNTask {
  public name: string;
  public methods: HTNMethod[] = [];
  public primitive: HTNPrimitiveTask | null = null;

  constructor(name: string, methods?: HTNMethod[]) {
    this.name = name;
    if (methods) {
      this.methods = methods;
    }
  }

  public static primitive(name: PrimitiveTaskType): HTNTask {
    const task = new HTNTask(`primitive:${name}`);
    task.primitive = new HTNPrimitiveTask(name);
    return task;
  }
}

export class HTNPlanner {
  public plan(task: HTNTask, world: SquadWorldState): HTNPrimitiveTask[] | null {
    const plan: HTNPrimitiveTask[] = [];
    const success = this.decompose(task, world, plan);
    return success ? plan : null;
  }

  private decompose(task: HTNTask, world: SquadWorldState, plan: HTNPrimitiveTask[]): boolean {
    if (task.primitive) {
      plan.push(task.primitive);
      return true;
    }

    for (const method of task.methods) {
      if (!method.preconditions(world)) {
        continue;
      }
      const snapshotLength = plan.length;
      let allSucceeded = true;
      for (const subtask of method.subtasks) {
        if (!this.decompose(subtask, world, plan)) {
          allSucceeded = false;
          break;
        }
      }
      if (allSucceeded) {
        return true;
      }
      plan.splice(snapshotLength);
    }
    return false;
  }
}
