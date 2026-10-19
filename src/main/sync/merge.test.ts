import { describe, expect, it } from 'vitest'
import { mergeById } from './merge'

interface Item {
  id: string
  name: string
}

describe('mergeById', () => {
  it('同 id 时以远端为准', () => {
    const local: Item[] = [{ id: 'a', name: '本地 A' }]
    const remote: Item[] = [{ id: 'a', name: '远端 A' }]
    expect(mergeById(local, remote)).toEqual([{ id: 'a', name: '远端 A' }])
  })

  it('本地独有的条目保留', () => {
    const local: Item[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' }
    ]
    const remote: Item[] = [{ id: 'a', name: 'A2' }]
    expect(mergeById(local, remote).map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('远端独有的条目追加在后面', () => {
    const local: Item[] = [{ id: 'a', name: 'A' }]
    const remote: Item[] = [
      { id: 'a', name: 'A' },
      { id: 'c', name: 'C' }
    ]
    expect(mergeById(local, remote).map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('不修改传入的数组', () => {
    const local: Item[] = [{ id: 'a', name: 'A' }]
    const remote: Item[] = [{ id: 'b', name: 'B' }]
    mergeById(local, remote)
    expect(local).toHaveLength(1)
    expect(remote).toHaveLength(1)
  })
})
