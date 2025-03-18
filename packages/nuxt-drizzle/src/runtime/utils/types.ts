export interface RestoreDrizzleConditionModifier {
  operator: 'not'
  condition: RstoreDrizzleCondition
}

export interface RstoreDrizzleUnaryOperator {
  operator: 'isNull' | 'isNotNull'
  field: string
}

export interface RstoreDrizzleBinaryOperator {
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'inArray' | 'notInArray' | 'like' | 'notLike' | 'ilike' | 'notIlike' | 'arrayContains' | 'arrayContained' | 'arrayOverlaps'
  field: string
  value: any
}

export interface RstoreDrizzleTernaryOperator {
  operator: 'between' | 'notBetween'
  field: string
  value1: any
  value2: any
}

export interface RstoreDrizzleConditionGroup {
  operator: 'and' | 'or'
  conditions: Array<RstoreDrizzleCondition>
}

export type RstoreDrizzleCondition = RestoreDrizzleConditionModifier |
  RstoreDrizzleUnaryOperator |
  RstoreDrizzleBinaryOperator |
  RstoreDrizzleTernaryOperator |
  RstoreDrizzleConditionGroup |
  undefined
