// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import {
  type QueryState,
  terminalQueryStates,
} from "./types.ts";

const allowedTransitions: Readonly<Record<QueryState, readonly QueryState[]>> = {
  QUEUED: ["RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionQueryState(
  from: QueryState,
  to: QueryState,
): boolean {
  if (from === to) {
    return true;
  }
  return allowedTransitions[from].includes(to);
}

export function assertQueryStateTransition(
  from: QueryState,
  to: QueryState,
): void {
  if (!canTransitionQueryState(from, to)) {
    throw new Error(`Invalid query state transition: ${from} -> ${to}`);
  }
}

export function recoverStateAfterRestart(state: QueryState): {
  readonly state: QueryState;
  readonly stateReason?: string;
} {
  if (terminalQueryStates.has(state)) {
    return { state };
  }

  return {
    state: "FAILED",
    stateReason: "Query did not reach a terminal state before local service restart.",
  };
}
