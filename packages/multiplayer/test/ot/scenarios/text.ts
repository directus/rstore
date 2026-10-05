import type { Scenario } from './types'
import { deleteText, formatText, insertText } from '../harness/edits'
import { BOTH_ORDERS } from './types'

const doc = [{ id: 'p1', content: 'hello world' }]
const link = (href: string) => ({ link: href })

/** E3 scenarios 1–14: concurrent inserts, deletes, formats and mark boundaries in one node. */
export const textScenarios: Scenario[] = [
  {
    name: '1. concurrent inserts at different offsets',
    doc,
    edits: { A: () => [insertText('p1', 6, 'big ')], B: () => [insertText('p1', 11, '!')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello big world!'],
  },
  {
    name: '2. inserts at the same offset: the first sequenced goes first',
    doc,
    edits: { A: () => [insertText('p1', 5, ',')], B: () => [insertText('p1', 5, ' there')] },
    orders: [['A', 'B']],
    expected: ['paragraph#p1: hello, there world'],
  },
  {
    name: '3. inserts at the same offset, other arrival order',
    doc,
    edits: { A: () => [insertText('p1', 5, ',')], B: () => [insertText('p1', 5, ' there')] },
    orders: [['B', 'A']],
    expected: ['paragraph#p1: hello there, world'],
  },
  {
    name: '4. an insert inside a concurrently deleted range survives',
    doc,
    edits: { A: () => [deleteText('p1', 6, 11)], B: () => [insertText('p1', 8, 'X')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello X'],
  },
  {
    name: '5. overlapping deletes remove the union',
    doc,
    edits: { A: () => [deleteText('p1', 2, 7)], B: () => [deleteText('p1', 4, 9)] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: held'],
  },
  {
    name: '6. bold extends over text typed strictly inside the range',
    doc,
    edits: { A: () => [formatText('p1', 0, 11, { bold: true })], B: () => [insertText('p1', 5, '!')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: {hello! world|bold}'],
  },
  {
    name: '7. no expansion for text typed at the edge of the range',
    doc,
    edits: { A: () => [formatText('p1', 0, 5, { bold: true })], B: () => [insertText('p1', 5, 'X')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: {hello|bold}X world'],
  },
  {
    name: '8. links do not extend over concurrently typed text',
    doc,
    edits: { A: () => [formatText('p1', 0, 11, link('https://a'))], B: () => [insertText('p1', 5, '!')] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: {hello|link=https://a}!{ world|link=https://a}'],
  },
  {
    name: '9. conflicting links on the same text: the later sequenced wins',
    doc,
    edits: { A: () => [formatText('p1', 0, 5, link('https://a'))], B: () => [formatText('p1', 0, 5, link('https://b'))] },
    orders: [['A', 'B']],
    expected: ['paragraph#p1: {hello|link=https://b} world'],
  },
  {
    name: '10. overlapping bold and italic ranges combine',
    doc,
    edits: { A: () => [formatText('p1', 0, 7, { bold: true })], B: () => [formatText('p1', 4, 11, { italic: true })] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: {hell|bold}{o w|bold,italic}{orld|italic}'],
  },
  {
    name: '11. removing bold also covers text typed inside it concurrently',
    doc: [{ id: 'p1', content: [{ insert: 'hello world', attributes: { bold: true } }] }],
    edits: { A: () => [formatText('p1', 0, 11, { bold: null })], B: () => [insertText('p1', 5, '!', { bold: true })] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: hello! world'],
  },
  {
    name: '12. formatting concurrently deleted text keeps the survivors formatted',
    doc,
    edits: { A: () => [formatText('p1', 0, 11, { bold: true })], B: () => [deleteText('p1', 0, 6)] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: {world|bold}'],
  },
  {
    name: '13. comment anchors with distinct ids coexist',
    doc,
    edits: { A: () => [formatText('p1', 0, 5, { 'comment:1': true })], B: () => [formatText('p1', 3, 8, { 'comment:2': true })] },
    orders: BOTH_ORDERS,
    expected: ['paragraph#p1: {hel|comment:1}{lo|comment:1,comment:2}{ wo|comment:2}rld'],
  },
  {
    name: '14. an embed and text inserted at the same offset',
    doc,
    edits: { A: () => [insertText('p1', 5, { hardBreak: true })], B: () => [insertText('p1', 5, 'X')] },
    orders: [['A', 'B']],
    expected: ['paragraph#p1: hello<hardBreak>X world'],
  },
]
