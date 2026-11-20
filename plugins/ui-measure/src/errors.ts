/** The environment cannot run the tool (exit code 3): a missing peer dependency or browser. */
export class SetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SetupError"
  }
}
