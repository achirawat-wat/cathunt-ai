import { create } from 'zustand'

interface FeedState {
  feeds: any[]
  hasMore: boolean
  buffer: { raw: any; score: number }[]
  allFetchedRaw: any[]
  offset: number
  dbExhausted: boolean
  shownIds: Set<string>
  seenIds: Set<string>
  followedCatIds: Set<string>
  initialized: boolean
  scrollPosition: number

  setFeeds: (feeds: any[] | ((prev: any[]) => any[])) => void
  setHasMore: (hasMore: boolean) => void
  setBuffer: (buffer: { raw: any; score: number }[]) => void
  setAllFetchedRaw: (raw: any[]) => void
  setOffset: (offset: number) => void
  setDbExhausted: (exhausted: boolean) => void
  setShownIds: (ids: Set<string>) => void
  setSeenIds: (ids: Set<string>) => void
  setFollowedCatIds: (ids: Set<string>) => void
  setInitialized: (initialized: boolean) => void
  setScrollPosition: (pos: number) => void
  resetFeed: () => void
}

export const useFeedStore = create<FeedState>((set) => ({
  feeds: [],
  hasMore: true,
  buffer: [],
  allFetchedRaw: [],
  offset: 0,
  dbExhausted: false,
  shownIds: new Set(),
  seenIds: new Set(),
  followedCatIds: new Set(),
  initialized: false,
  scrollPosition: 0,

  setFeeds: (updater) => set((state) => ({ 
    feeds: typeof updater === 'function' ? updater(state.feeds) : updater 
  })),
  setHasMore: (hasMore) => set({ hasMore }),
  setBuffer: (buffer) => set({ buffer }),
  setAllFetchedRaw: (allFetchedRaw) => set({ allFetchedRaw }),
  setOffset: (offset) => set({ offset }),
  setDbExhausted: (dbExhausted) => set({ dbExhausted }),
  setShownIds: (shownIds) => set({ shownIds }),
  setSeenIds: (seenIds) => set({ seenIds }),
  setFollowedCatIds: (followedCatIds) => set({ followedCatIds }),
  setInitialized: (initialized) => set({ initialized }),
  setScrollPosition: (scrollPosition) => set({ scrollPosition }),
  resetFeed: () => set({
    feeds: [],
    hasMore: true,
    buffer: [],
    allFetchedRaw: [],
    offset: 0,
    dbExhausted: false,
    shownIds: new Set(),
    seenIds: new Set(),
    followedCatIds: new Set(),
    scrollPosition: 0,
    initialized: false
  })
}))
