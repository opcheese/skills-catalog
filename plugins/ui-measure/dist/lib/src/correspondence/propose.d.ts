import type { DesignTree, DomTree, Proposal } from "./types.js";
export type Proposer = {
    kind: "recorded";
    file: string;
} | {
    kind: "command";
    argv: string[];
};
export declare class ProposalError extends Error {
    constructor(message: string);
}
export declare function propose(p: Proposer, design: DesignTree, dom: DomTree): Promise<Proposal>;
