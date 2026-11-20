/** The environment cannot run the tool (exit code 3): a missing peer dependency or browser. */
export class SetupError extends Error {
    constructor(message) {
        super(message);
        this.name = "SetupError";
    }
}
/** A run that measured only part of the page was offered as a baseline. */
export class PartialRunError extends Error {
    constructor(message) {
        super(message);
        this.name = "PartialRunError";
    }
}
/** A baseline already exists and the caller did not ask to replace it. */
export class BaselineExistsError extends Error {
    constructor(message) {
        super(message);
        this.name = "BaselineExistsError";
    }
}
