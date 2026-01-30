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
  readonly toolName: string;
  readonly cause?: unknown;

  constructor(message: string, toolName: string, cause?: unknown) {
    super(message);
    this.name = "AgentToolError";
    this.toolName = toolName;
    this.cause = cause;
  }
}

export class AgentMemoryError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = "AgentMemoryError";
  }
}
