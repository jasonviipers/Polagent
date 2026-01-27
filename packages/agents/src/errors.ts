export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

export class AgentConfigError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigError";
  }
}

export class AgentToolError extends AgentError {
  constructor(
    message: string,
    readonly toolName: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "AgentToolError";
  }
}

export class AgentMemoryError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = "AgentMemoryError";
  }
}
