/** Raised when a reply cannot accommodate even the smallest JSON preview. */
export class ProjectionBudgetExceededError extends Error {
  /** Construct a budget failure that callers convert to reply truncation. */
  constructor() {
    super('Projection byte budget exhausted')
    this.name = 'ProjectionBudgetExceededError'
  }
}
