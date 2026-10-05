import type { Scenario } from './types'
import { mergeNodeOp, splitNodeOp } from '@rstore/multiplayer/ot'
import { deleteText, formatText, insertText } from '../harness/edits'
import { BOTH_ORDERS } from './types'

const splitDoc = [{ id: 'p1', content: 'hello world' }, { id: 'p9', content: 'next' }]
const mergeDoc = [{ id: 'p1', content: 'hello' }, { id: 'p2', content: 'world' }, { id: 'p3', content: 'end' }]

/** E3 scenarios 15–28: splits and merges during typing. */
export const splitMergeScenarios: Scenario[] = [
  {
    name: '15. split while someone types in the tail',
    doc: splitDoc,
    edits: { A: s => [splitNodeOp(s, 'p1', 6, 'n1')], B: () => [insertText('p1', 8, 'X')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello ', 'paragraph#n1: woXrld', 'paragraph#p9: next'],
  },
  {
    name: '16. text typed exactly at the split point stays in the head',
    doc: splitDoc,
    edits: { A: s => [splitNodeOp(s, 'p1', 6, 'n1')], B: () => [insertText('p1', 6, 'X')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello X', 'paragraph#n1: world', 'paragraph#p9: next'],
  },
  {
    name: '17. split while someone types in the head',
    doc: splitDoc,
    edits: { A: s => [splitNodeOp(s, 'p1', 6, 'n1')], B: () => [insertText('p1', 2, 'X')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: heXllo ', 'paragraph#n1: world', 'paragraph#p9: next'],
  },
  {
    name: '18. a delete across the split point removes text on both sides',
    doc: splitDoc,
    edits: { A: s => [splitNodeOp(s, 'p1', 6, 'n1')], B: () => [deleteText('p1', 4, 8)] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hell', 'paragraph#n1: rld', 'paragraph#p9: next'],
  },
  {
    name: '19. a format across the split point covers both parts',
    doc: splitDoc,
    edits: { A: s => [splitNodeOp(s, 'p1', 6, 'n1')], B: () => [formatText('p1', 0, 11, { bold: true })] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: {hello |bold}', 'paragraph#n1: {world|bold}', 'paragraph#p9: next'],
  },
  {
    name: '20. two splits of the same paragraph keep text order (ids sort against it)',
    doc: splitDoc,
    edits: { A: s => [splitNodeOp(s, 'p1', 3, 'z1')], B: s => [splitNodeOp(s, 'p1', 8, 'a2')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hel', 'paragraph#z1: lo wo', 'paragraph#a2: rld', 'paragraph#p9: next'],
  },
  {
    name: '21. two splits at the same point leave an empty paragraph between',
    doc: splitDoc,
    edits: { A: s => [splitNodeOp(s, 'p1', 6, 'z1')], B: s => [splitNodeOp(s, 'p1', 6, 'a2')] },
    orders: [['A', 'B']],
    expected: ['paragraph#p1: hello ', 'paragraph#z1: ', 'paragraph#a2: world', 'paragraph#p9: next'],
  },
  {
    name: '22. merge while someone types in the merged paragraph',
    doc: mergeDoc,
    edits: { A: s => [mergeNodeOp(s, 'p2', 'p1')], B: () => [insertText('p2', 2, 'X')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hellowoXrld', 'paragraph#p3: end'],
  },
  {
    name: '23. merge while someone types at the end of the target',
    doc: mergeDoc,
    edits: { A: s => [mergeNodeOp(s, 'p2', 'p1')], B: () => [insertText('p1', 5, '!')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello!world', 'paragraph#p3: end'],
  },
  {
    name: '24. merge while the merged paragraph is split',
    doc: mergeDoc,
    edits: { A: s => [mergeNodeOp(s, 'p2', 'p1')], B: s => [splitNodeOp(s, 'p2', 2, 'n1')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hellowo', 'paragraph#n1: rld', 'paragraph#p3: end'],
  },
  {
    name: '25. merging into a paragraph deleted just before revives it',
    doc: mergeDoc,
    edits: { A: s => [mergeNodeOp(s, 'p2', 'p1')], B: () => [{ t: 'deleteNode', node: 'p1' }] },
    orders: [['B', 'A']],
    expected: ['paragraph#p1: helloworld', 'paragraph#p3: end'],
  },
  {
    name: '26. deleting the target right after a merge hides the merged text',
    doc: mergeDoc,
    edits: { A: s => [mergeNodeOp(s, 'p2', 'p1')], B: () => [{ t: 'deleteNode', node: 'p1' }] },
    orders: [['A', 'B']],
    expected: ['paragraph#p3: end'],
  },
  {
    name: '27. chained merges collapse three paragraphs',
    doc: mergeDoc,
    edits: { A: s => [mergeNodeOp(s, 'p2', 'p1')], B: s => [mergeNodeOp(s, 'p3', 'p2')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: helloworldend'],
  },
  {
    name: '28. the same merge made twice applies once',
    doc: mergeDoc,
    edits: { A: s => [mergeNodeOp(s, 'p2', 'p1')], B: s => [mergeNodeOp(s, 'p2', 'p1')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: helloworld', 'paragraph#p3: end'],
  },
]
