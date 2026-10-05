import type { Scenario } from './types'
import { insertNodeOp, moveNodeOp, splitNodeOp } from '@rstore/multiplayer/ot'
import { insertText } from '../harness/edits'
import { BOTH_ORDERS } from './types'

const moveDoc = [
  { id: 'p1', content: 'one' },
  { id: 'p2', content: 'two' },
  { id: 'p3', content: 'three' },
  { id: 'list', children: [{ id: 'li1', type: 'listItem', children: [{ id: 'l1', content: 'item' }] }] },
]
const listLines = ['bulletList#list', '  listItem#li1', '    paragraph#l1: item']
const threeDoc = [{ id: 'p1', content: 'hello' }, { id: 'p2', content: 'world' }, { id: 'p3', content: 'end' }]
const paragraph = (text: string) => ({ type: 'paragraph', attrs: {}, content: [{ insert: text }] })

/** E3 scenarios 29–40: moves, deletes/restores, attributes and node inserts during edits. */
export const nodeScenarios: Scenario[] = [
  {
    name: '29. moving a paragraph while someone types in it',
    doc: moveDoc,
    edits: { A: s => [moveNodeOp(s, 'p3', { parentId: null, after: null })], B: () => [insertText('p3', 5, '!')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p3: three!', 'paragraph#p1: one', 'paragraph#p2: two', ...listLines],
  },
  {
    name: '30. concurrent moves of the same node: the later sequenced wins',
    doc: moveDoc,
    edits: { A: s => [moveNodeOp(s, 'p1', { parentId: null, after: 'p3' })], B: s => [moveNodeOp(s, 'p1', { parentId: null, after: 'p2' })] },
    orders: [['A', 'B']],
    expected: ['paragraph#p2: two', 'paragraph#p1: one', 'paragraph#p3: three', ...listLines],
  },
  {
    name: '31. moving a paragraph into a list item while it is edited',
    doc: moveDoc,
    edits: { A: s => [moveNodeOp(s, 'p2', { parentId: 'li1', after: 'l1' })], B: () => [insertText('p2', 3, '!')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: one', 'paragraph#p3: three', ...listLines, '    paragraph#p2: two!'],
  },
  {
    name: '32. concurrent moves that would create a cycle: the later is rejected',
    doc: [
      { id: 'q1', type: 'blockquote', children: [{ id: 'pa', content: 'a' }] },
      { id: 'q2', type: 'blockquote', children: [{ id: 'pb', content: 'b' }] },
    ],
    edits: { A: s => [moveNodeOp(s, 'q1', { parentId: 'q2', after: 'pb' })], B: s => [moveNodeOp(s, 'q2', { parentId: 'q1', after: 'pa' })] },
    orders: [['A', 'B']],
    expected: ['blockquote#q2', '  paragraph#pb: b', '  blockquote#q1', '    paragraph#pa: a'],
  },
  {
    name: '33. typing into a concurrently deleted paragraph is kept hidden and restored with it',
    doc: threeDoc,
    edits: { A: () => [{ t: 'deleteNode', node: 'p2' }], B: () => [insertText('p2', 5, '!')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello', 'paragraph#p3: end'],
    then: { client: 'A', edit: () => [{ t: 'restoreNode', node: 'p2' }], expected: ['paragraph#p1: hello', 'paragraph#p2: world!', 'paragraph#p3: end'] },
  },
  {
    name: '34. deleting a paragraph while it is split hides both parts',
    doc: threeDoc,
    edits: { A: () => [{ t: 'deleteNode', node: 'p2' }], B: s => [splitNodeOp(s, 'p2', 2, 'n1')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello', 'paragraph#p3: end'],
  },
  {
    name: '35. deleting a list while an item gets a new paragraph hides the subtree',
    doc: moveDoc,
    edits: { A: () => [{ t: 'deleteNode', node: 'list' }], B: s => [insertNodeOp(s, { id: 'x', ...paragraph('new') }, { parentId: 'li1', after: 'l1' })] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: one', 'paragraph#p2: two', 'paragraph#p3: three'],
  },
  {
    name: '36. concurrent deletes of the same node, then one restore',
    doc: threeDoc,
    edits: { A: () => [{ t: 'deleteNode', node: 'p2' }], B: () => [{ t: 'deleteNode', node: 'p2' }] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello', 'paragraph#p3: end'],
    then: { client: 'B', edit: () => [{ t: 'restoreNode', node: 'p2' }], expected: ['paragraph#p1: hello', 'paragraph#p2: world', 'paragraph#p3: end'] },
  },
  {
    name: '37. attributes merge per key and the later sequenced value wins',
    doc: threeDoc,
    edits: { A: () => [{ t: 'setAttrs', node: 'p1', attrs: { level: 1, align: 'left' } }], B: () => [{ t: 'setAttrs', node: 'p1', attrs: { level: 2 } }] },
    orders: [['A', 'B']],
    expected: ['paragraph#p1 {"align":"left","level":2}: hello', 'paragraph#p2: world', 'paragraph#p3: end'],
  },
  {
    name: '38. attributes set on a paragraph split concurrently stay on the head',
    doc: threeDoc,
    edits: { A: () => [{ t: 'setAttrs', node: 'p1', attrs: { level: 1 } }], B: s => [splitNodeOp(s, 'p1', 2, 'n1')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1 {"level":1}: he', 'paragraph#n1: llo', 'paragraph#p2: world', 'paragraph#p3: end'],
  },
  {
    name: '39. two paragraphs inserted at the same position are both kept',
    doc: threeDoc,
    edits: {
      A: s => [insertNodeOp(s, { id: 'x2', ...paragraph('from A') }, { parentId: null, after: 'p1' })],
      B: s => [insertNodeOp(s, { id: 'x1', ...paragraph('from B') }, { parentId: null, after: 'p1' })],
    },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello', 'paragraph#x1: from B', 'paragraph#x2: from A', 'paragraph#p2: world', 'paragraph#p3: end'],
  },
  {
    name: '40. a paragraph inserted after one that is split concurrently',
    doc: threeDoc,
    edits: {
      A: s => [splitNodeOp(s, 'p1', 2, 'n1')],
      B: s => [insertNodeOp(s, { id: 'x', ...paragraph('new') }, { parentId: null, after: 'p1' })],
    },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: he', 'paragraph#n1: llo', 'paragraph#x: new', 'paragraph#p2: world', 'paragraph#p3: end'],
  },
]
