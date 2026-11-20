/** The environment cannot run the tool (exit code 3): a missing peer dependency or browser. */
export declare class SetupError extends Error {
    constructor(message: string);
}
/** A requested design or page has nothing that can be measured (exit code 2). */
export declare class NotComparableError extends Error {
    constructor(message: string);
}
/** A run that measured only part of the page was offered as a baseline. */
export declare class PartialRunError extends Error {
    constructor(message: string);
}
/** A baseline already exists and the caller did not ask to replace it. */
export declare class BaselineExistsError extends Error {
    constructor(message: string);
}
