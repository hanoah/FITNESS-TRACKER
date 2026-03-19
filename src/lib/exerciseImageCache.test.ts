import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getExerciseImage } from './exerciseImageCache'

const mockGet = vi.fn()
const mockPut = vi.fn()

vi.mock('./db', () => ({
  db: {
    exerciseImages: {
      get: (...args: unknown[]) => mockGet(...args),
      put: (...args: unknown[]) => mockPut(...args),
    },
  },
}))

const fakeBlob = new Blob(['img'], { type: 'image/gif' })
const fakeObjectUrl = 'blob:http://localhost/fake-abc123'

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue(fakeObjectUrl)
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(fakeBlob, {
      status: 200,
      headers: { 'content-type': 'image/gif' },
    })
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exerciseImageCache', () => {
  it('returns null for empty exerciseDbId', async () => {
    expect(await getExerciseImage('', 'https://cdn.example.com/img.gif')).toBeNull()
    expect(await getExerciseImage('  ', 'https://cdn.example.com/img.gif')).toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('returns cached blob URL on cache hit', async () => {
    mockGet.mockResolvedValue({ exerciseDbId: 'ex_1', blob: fakeBlob, fetchedAt: 1 })

    const url = await getExerciseImage('ex_1', 'https://cdn.example.com/img.gif')

    expect(url).toBe(fakeObjectUrl)
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(fakeBlob)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('fetches from CDN on cache miss and writes to cache', async () => {
    mockGet.mockResolvedValue(undefined)
    mockPut.mockResolvedValue(undefined)

    const url = await getExerciseImage('ex_2', 'https://cdn.example.com/img.gif')

    expect(url).toBe(fakeObjectUrl)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://cdn.example.com/img.gif',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(mockPut).toHaveBeenCalledOnce()
    const putArg = mockPut.mock.calls[0][0]
    expect(putArg.exerciseDbId).toBe('ex_2')
    expect(putArg.blob).toBeTruthy()
    expect(putArg.blob.size).toBeGreaterThan(0)
    expect(typeof putArg.fetchedAt).toBe('number')
  })

  it('returns null when no imageUrl provided and not cached', async () => {
    mockGet.mockResolvedValue(undefined)

    expect(await getExerciseImage('ex_3')).toBeNull()
    expect(await getExerciseImage('ex_3', '')).toBeNull()
    expect(await getExerciseImage('ex_3', '  ')).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns null on non-200 response', async () => {
    mockGet.mockResolvedValue(undefined)
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('Not Found', { status: 404 })
    )

    const url = await getExerciseImage('ex_4', 'https://cdn.example.com/img.gif')
    expect(url).toBeNull()
  })

  it('returns null on non-image content-type', async () => {
    mockGet.mockResolvedValue(undefined)
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const url = await getExerciseImage('ex_5', 'https://cdn.example.com/img.gif')
    expect(url).toBeNull()
  })

  it('falls back to direct URL on fetch network error', async () => {
    mockGet.mockResolvedValue(undefined)
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    const url = await getExerciseImage('ex_6', 'https://cdn.example.com/img.gif')
    expect(url).toBe('https://cdn.example.com/img.gif')
  })

  it('falls back to direct URL on fetch timeout', async () => {
    mockGet.mockResolvedValue(undefined)
    const timeoutErr = new DOMException('signal timed out', 'TimeoutError')
    vi.mocked(globalThis.fetch).mockRejectedValue(timeoutErr)

    const url = await getExerciseImage('ex_7', 'https://cdn.example.com/img.gif')
    expect(url).toBe('https://cdn.example.com/img.gif')
  })

  it('still returns image URL when cache write fails', async () => {
    mockGet.mockResolvedValue(undefined)
    mockPut.mockRejectedValue(new Error('QuotaExceeded'))

    const url = await getExerciseImage('ex_8', 'https://cdn.example.com/img.gif')
    expect(url).toBe(fakeObjectUrl)
  })

  it('falls through to CDN when IndexedDB read throws', async () => {
    mockGet.mockRejectedValue(new Error('IndexedDB unavailable'))
    mockPut.mockResolvedValue(undefined)

    const url = await getExerciseImage('ex_9', 'https://cdn.example.com/img.gif')
    expect(url).toBe(fakeObjectUrl)
    expect(globalThis.fetch).toHaveBeenCalled()
  })
})
