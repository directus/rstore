import type {
  RestoreDrizzleConditionModifier,
  RstoreDrizzleBinaryOperator,
  RstoreDrizzleCondition,
  RstoreDrizzleConditionGroup,
  RstoreDrizzleTernaryOperator,
  RstoreDrizzleUnaryOperator,
} from './types'

// @TODO list of fields

export function eq(
  field: string,
  value: any,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'eq',
    field,
    value,
  }
}

export function ne(
  field: string,
  value: any,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'ne',
    field,
    value,
  }
}

export function gt(
  field: string,
  value: any,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'gt',
    field,
    value,
  }
}

export function lt(
  field: string,
  value: any,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'lt',
    field,
    value,
  }
}

export function gte(
  field: string,
  value: any,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'gte',
    field,
    value,
  }
}

export function lte(
  field: string,
  value: any,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'lte',
    field,
    value,
  }
}

export function inArray(
  field: string,
  value: any[],
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'inArray',
    field,
    value,
  }
}

export function notInArray(
  field: string,
  value: any[],
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'notInArray',
    field,
    value,
  }
}

export function like(
  field: string,
  value: string,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'like',
    field,
    value,
  }
}

export function notLike(
  field: string,
  value: string,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'notLike',
    field,
    value,
  }
}

export function ilike(
  field: string,
  value: string,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'ilike',
    field,
    value,
  }
}

export function notIlike(
  field: string,
  value: string,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'notIlike',
    field,
    value,
  }
}

export function arrayContains(
  field: string,
  value: any,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'arrayContains',
    field,
    value,
  }
}

export function arrayContained(
  field: string,
  value: any,
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'arrayContained',
    field,
    value,
  }
}

export function arrayOverlaps(
  field: string,
  value: any[],
): RstoreDrizzleBinaryOperator {
  return {
    operator: 'arrayOverlaps',
    field,
    value,
  }
}

export function between(
  field: string,
  value1: any,
  value2: any,
): RstoreDrizzleTernaryOperator {
  return {
    operator: 'between',
    field,
    value1,
    value2,
  }
}

export function notBetween(
  field: string,
  value1: any,
  value2: any,
): RstoreDrizzleTernaryOperator {
  return {
    operator: 'notBetween',
    field,
    value1,
    value2,
  }
}

export function not(
  condition: RstoreDrizzleCondition,
): RestoreDrizzleConditionModifier {
  return {
    operator: 'not',
    condition,
  }
}

export function isNull(
  field: string,
): RstoreDrizzleUnaryOperator {
  return {
    operator: 'isNull',
    field,
  }
}

export function isNotNull(
  field: string,
): RstoreDrizzleUnaryOperator {
  return {
    operator: 'isNotNull',
    field,
  }
}

export function and(
  ...conditions: RstoreDrizzleCondition[]
): RstoreDrizzleConditionGroup {
  return {
    operator: 'and',
    conditions,
  }
}

export function or(
  ...conditions: RstoreDrizzleCondition[]
): RstoreDrizzleConditionGroup {
  return {
    operator: 'or',
    conditions,
  }
}
