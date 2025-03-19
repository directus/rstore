/* eslint-disable eqeqeq */

import type { QueryFilter } from '@directus/sdk'
import type { ResolvedModel } from '@rstore/shared'
import type { VueStore } from '@rstore/vue'

const DYNAMIC_VARIABLES = {
  $CURRENT_USER: () => {
    // TODO: get current user
    throw new Error('Not implemented')
  },
  $CURRENT_ROLE: () => {
    // TODO: get current role
    throw new Error('Not implemented')
  },
  $NOW: () => new Date(),
}

const FUNCTION_PARAMETERS = {
  year: (date: Date) => date.getFullYear(),
  month: (date: Date) => date.getMonth() + 1,
  week: (date: Date) => {
    const startDate = new Date(date.getFullYear(), 0, 1)
    const days = Math.floor((date.valueOf() - startDate.valueOf()) / (1000 * 60 * 60 * 24))
    return Math.ceil((days + startDate.getDay() + 1) / 7)
  },
  day: (date: Date) => date.getDate(),
  weekday: (date: Date) => date.getDay(),
  hour: (date: Date) => date.getHours(),
  minute: (date: Date) => date.getMinutes(),
  second: (date: Date) => date.getSeconds(),
  count: (value: any) => {
    if (Array.isArray(value)) {
      return value.length
    }
    else if (typeof value === 'object') {
      return Object.keys(value).length
    }
    return 0
  },
}

export function filterItem(store: VueStore, model: ResolvedModel<any, any, any>, item: any, filter: QueryFilter<any, any>): boolean {
  // TODO relation filter
  // TODO user-related dynamic variables
  // TODO $FOLLOW

  for (const key in filter) {
    const filterValue = (filter as any)[key]
    if (key === '_and') {
      if ((filterValue as any[]).every(f => filterItem(store, model, item, f))) {
        return true
      }
    }
    else if (key === '_or') {
      if ((filterValue as any[]).some(f => filterItem(store, model, item, f))) {
        return true
      }
    }
    else if (key in model.relations) {
      throw new Error('Relation filter not implemented yet')
    }

    // Field
    const [operator] = Object.keys(filterValue)
    if (!operator) {
      throw new Error('Invalid filter operator')
    }

    let value = filterValue[operator]

    // Dynamic variables
    if (typeof value === 'string') {
      if (value in DYNAMIC_VARIABLES) {
        value = DYNAMIC_VARIABLES[value as keyof typeof DYNAMIC_VARIABLES]()
      }
      else if (value.startsWith('$NOW(') && value.endsWith(')')) {
        const [, distance] = /\$NOW\((.*)\)/.exec(value) ?? []
        if (distance) {
          const date = new Date()
          const [distanceValue, unit] = distance.split(' ')
          switch (unit) {
            case 'seconds':
              date.setSeconds(date.getSeconds() + Number.parseInt(distanceValue))
              break
            case 'minutes':
              date.setMinutes(date.getMinutes() + Number.parseInt(distanceValue))
              break
            case 'hours':
              date.setHours(date.getHours() + Number.parseInt(distanceValue))
              break
            case 'days':
              date.setDate(date.getDate() + Number.parseInt(distanceValue))
              break
            case 'months':
              date.setMonth(date.getMonth() + Number.parseInt(distanceValue))
              break
            case 'years':
              date.setFullYear(date.getFullYear() + Number.parseInt(distanceValue))
              break
            default:
              throw new Error(`Invalid date unit: ${unit}`)
          }
          value = date
        }
        else {
          throw new Error('Invalid date distance')
        }
      }
    }

    let itemValue

    // Function parameters
    const functionParameterRegResult = /^(\w+)\((.*)\)$/.exec(key) ?? []
    if (functionParameterRegResult?.[1] in FUNCTION_PARAMETERS) {
      const functionName = functionParameterRegResult[1] as keyof typeof FUNCTION_PARAMETERS
      const functionParameter = functionParameterRegResult[2]
      if (functionParameter in item) {
        itemValue = FUNCTION_PARAMETERS[functionName](item[functionParameter])
      }
      else {
        throw new Error(`Invalid filter parameter: ${functionParameter}`)
      }
    }
    else {
      itemValue = item[key]
    }

    switch (operator) {
      case '_eq': {
        if (itemValue == value) {
          return true
        }
        break
      }
      case '_neq': {
        if (itemValue != value) {
          return true
        }
        break
      }
      case '_lt': {
        if (itemValue < value) {
          return true
        }
        break
      }
      case '_lte': {
        if (itemValue <= value) {
          return true
        }
        break
      }
      case '_gt': {
        if (itemValue > value) {
          return true
        }
        break
      }
      case '_gte': {
        if (itemValue >= value) {
          return true
        }
        break
      }
      case '_in': {
        if (Array.isArray(value) && value.includes(itemValue)) {
          return true
        }
        break
      }
      case '_nin': {
        if (Array.isArray(value) && !value.includes(itemValue)) {
          return true
        }
        break
      }
      case '_null': {
        if (itemValue == null) {
          return true
        }
        break
      }
      case '_nnull': {
        if (itemValue != null) {
          return true
        }
        break
      }
      case '_contains': {
        if (typeof itemValue === 'string' && typeof value === 'string' && itemValue.includes(value)) {
          return true
        }
        break
      }
      case '_icontains': {
        if (typeof itemValue === 'string' && typeof value === 'string' && itemValue.toLowerCase().includes(value.toLowerCase())) {
          return true
        }
        break
      }
      case '_ncontains': {
        if (typeof itemValue === 'string' && typeof value === 'string' && !itemValue.includes(value)) {
          return true
        }
        break
      }
      case '_starts_with': {
        if (typeof itemValue === 'string' && typeof value === 'string' && itemValue.startsWith(value)) {
          return true
        }
        break
      }
      case '_istarts_with': {
        if (typeof itemValue === 'string' && typeof value === 'string' && itemValue.toLowerCase().startsWith(value.toLowerCase())) {
          return true
        }
        break
      }
      case '_nstarts_with': {
        if (typeof itemValue === 'string' && typeof value === 'string' && !itemValue.startsWith(value)) {
          return true
        }
        break
      }
      case '_nistarts_with': {
        if (typeof itemValue === 'string' && typeof value === 'string' && !itemValue.toLowerCase().startsWith(value.toLowerCase())) {
          return true
        }
        break
      }
      case '_ends_with': {
        if (typeof itemValue === 'string' && typeof value === 'string' && itemValue.endsWith(value)) {
          return true
        }
        break
      }
      case '_iends_with': {
        if (typeof itemValue === 'string' && typeof value === 'string' && itemValue.toLowerCase().endsWith(value.toLowerCase())) {
          return true
        }
        break
      }
      case '_nends_with': {
        if (typeof itemValue === 'string' && typeof value === 'string' && !itemValue.endsWith(value)) {
          return true
        }
        break
      }
      case '_niends_with': {
        if (typeof itemValue === 'string' && typeof value === 'string' && !itemValue.toLowerCase().endsWith(value.toLowerCase())) {
          return true
        }
        break
      }
      case '_between': {
        if (Array.isArray(value) && value.length === 2 && itemValue >= value[0] && itemValue <= value[1]) {
          return true
        }
        break
      }
      case '_nbetween': {
        if (Array.isArray(value) && value.length === 2 && (itemValue < value[0] || itemValue > value[1])) {
          return true
        }
        break
      }
      case '_empty': {
        if (!itemValue) {
          return true
        }
        break
      }
      case '_nempty': {
        if (itemValue) {
          return true
        }
        break
      }
      case '_regex': {
        if (typeof itemValue === 'string' && typeof value === 'string' && new RegExp(value).test(itemValue)) {
          return true
        }
        break
      }
      default:
        throw new Error(`Filter operator not supported: ${operator}`)
    }
  }

  return false
}
