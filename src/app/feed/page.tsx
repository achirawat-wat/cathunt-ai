// src/app/feed/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Cat, Loader2, Check } from 'lucide-react'
import FeedCard from '@/components/feed-card'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// 🕒 ฟังก์ชันแปลงเวลาแบบ Social App
function timeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return `Just now`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return `${Math.floor(diffInSeconds / 86400)}d ago`
}

// 🎯 ให้คะแนนโพสต์แบบง่ายๆ ไม่ต้องมี ML
// - ตามแมวตัวนี้อยู่ -> บูสต์แรงสุด
// - ไลก์เยอะ -> engagement สูง
// - โพสต์ใหม่ -> บูสต์ความสดของฟีด (ลดลงเรื่อยๆ จนหมดที่ 48 ชม.)
const FOLLOW_BOOST = 100
const LIKE_WEIGHT = 2
const RECENCY_WINDOW_HOURS = 48

function scorePost(post: any, followedCatIds: Set<string>) {
  const hoursAgo = (Date.now() - new Date(post.created_at).getTime()) / 3600000
  const recencyScore = Math.max(0, RECENCY_WINDOW_HOURS - hoursAgo)
  const likesScore = (post.likes_count || 0) * LIKE_WEIGHT
  const followBoost = post.cat_id && followedCatIds.has(post.cat_id) ? FOLLOW_BOOST : 0
  return followBoost + likesScore + recencyScore
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function formatPost(post: any) {
  const catInfo = Array.isArray(post.cats) ? post.cats[0] : post.cats
  const profileInfo = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles

  return {
    id: post.id,
    user: {
      name: profileInfo?.username || 'Unknown Hunter',
      avatar: profileInfo?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150',
    },
    cat: {
      id: post.cat_id,
      name: catInfo?.name || 'Unknown Cat',
      area: catInfo?.area || 'Unknown Area',
    },
    image: post.image_url,
    content: post.description,
    time: timeAgo(post.created_at),
    likes: post.likes_count || 0
  }
}

const PAGE_SIZE = 8
const CHUNK_SIZE = 30
const ENCOUNTER_SELECT = `
  id,
  cat_id,
  image_url,
  description,
  likes_count,
  created_at,
  cats ( name, area ),
  profiles ( id, username, avatar_url )
`

export default function FeedPage() {
  const { user } = useAuthStore()

  const [feeds, setFeeds] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const viewObserverRef = useRef<IntersectionObserver | null>(null)

  // สถานะภายในที่ต้องอ่าน/เขียนแบบ sync ระหว่าง async loop (ไม่ผูกกับ re-render)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const followedCatIdsRef = useRef<Set<string>>(new Set())
  const bufferRef = useRef<{ raw: any; score: number }[]>([])
  const allFetchedRawRef = useRef<any[]>([])
  const offsetRef = useRef(0)
  const dbExhaustedRef = useRef(false)
  const shownIdsRef = useRef<Set<string>>(new Set()) // กันโพสต์ซ้ำในเซสชั่นนี้ (ทั้ง path ปกติและ path สำรอง)
  const isLoadingMoreRef = useRef(false)
  const hasMoreRef = useRef(true)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!user || initializedRef.current) return
    initializedRef.current = true
    initFeed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // 👀 IntersectionObserver สำหรับมาร์คว่าโพสต์ไหน "เห็นแล้ว"
  useEffect(() => {
    viewObserverRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.feedId
            if (id) markAsSeen(id)
          }
        })
      },
      { threshold: 0.6 }
    )

    return () => viewObserverRef.current?.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // ⬇️ Infinite scroll: สังเกต sentinel ท้ายลิสต์
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchMore()
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds.length, hasMore])

  const registerCardRef = (el: HTMLDivElement | null) => {
    if (el && viewObserverRef.current) viewObserverRef.current.observe(el)
  }

  async function markAsSeen(encounterId: string) {
    if (!user) return
    if (seenIdsRef.current.has(encounterId)) return
    seenIdsRef.current.add(encounterId) // optimistic กันยิงซ้ำในรอบเดียวกัน

    const { error } = await supabase
      .from('post_views')
      .upsert(
        { user_id: user.id, encounter_id: encounterId },
        { onConflict: 'user_id,encounter_id', ignoreDuplicates: true }
      )

    if (error) console.error('markAsSeen error:', error)
  }

  async function loadUserContext() {
    const [{ data: viewsData, error: viewsError }, { data: followsData, error: followsError }] =
      await Promise.all([
        supabase.from('post_views').select('encounter_id').eq('user_id', user!.id),
        supabase.from('follows').select('cat_id').eq('user_id', user!.id)
      ])

    if (viewsError) console.error('load seen posts error:', viewsError)
    if (followsError) console.error('load follows error:', followsError)

    seenIdsRef.current = new Set((viewsData || []).map((v: any) => v.encounter_id))
    followedCatIdsRef.current = new Set(
      (followsData || []).map((f: any) => f.cat_id).filter(Boolean)
    )
  }

  async function initFeed() {
    setIsLoading(true)
    await loadUserContext()
    await fetchMore()
    setIsLoading(false)
  }

  async function fetchMore() {
    if (!user) return
    if (isLoadingMoreRef.current || !hasMoreRef.current) return

    isLoadingMoreRef.current = true
    setIsLoadingMore(true)

    try {
      // 1. เติม buffer จาก DB ทีละ chunk จนกว่าจะพอสำหรับหน้านี้ หรือดึงจน DB หมด
      while (bufferRef.current.length < PAGE_SIZE && !dbExhaustedRef.current) {
        const from = offsetRef.current
        const to = from + CHUNK_SIZE - 1

        const { data, error } = await supabase
          .from('encounters')
          .select(ENCOUNTER_SELECT)
          .eq('is_training', false)
          .order('created_at', { ascending: false })
          .range(from, to)

        if (error) {
          console.error('fetchMore error:', error)
          break
        }

        offsetRef.current += CHUNK_SIZE

        if (!data || data.length === 0) {
          dbExhaustedRef.current = true
          break
        }
        if (data.length < CHUNK_SIZE) {
          dbExhaustedRef.current = true
        }

        allFetchedRawRef.current.push(...data)

        // กันไม่ให้เอาโพสต์ที่เคย "เห็น" มาก่อน (จาก post_views) หรือ "โชว์ไปแล้วในเซสชั่นนี้" กลับเข้า buffer อีก
        const unseen = data.filter(
          (row: any) => !seenIdsRef.current.has(row.id) && !shownIdsRef.current.has(row.id)
        )
        const scored = unseen.map((row: any) => ({ raw: row, score: scorePost(row, followedCatIdsRef.current) }))

        bufferRef.current = [...bufferRef.current, ...scored].sort((a, b) => b.score - a.score)
      }

      // 2. ถ้าดึงจน DB หมดแล้ว buffer ยังว่าง -> ลองหาโพสต์ที่ "ยังไม่เคยโชว์ในเซสชั่นนี้" มาเติมแทน
      //    (เผื่อ user เคยเห็นโพสต์นี้จากทริปก่อนหน้า แต่ยังไม่เห็นในรอบนี้)
      //    ถ้าไม่เหลือจริงๆ (ทุกโพสต์ถูกโชว์ในเซสชั่นนี้ไปหมดแล้ว) ให้จบฟีดตรงนี้ ไม่วนซ้ำ
      if (bufferRef.current.length === 0 && dbExhaustedRef.current) {
        const unshownThisSession = allFetchedRawRef.current.filter(
          (row: any) => !shownIdsRef.current.has(row.id)
        )

        if (unshownThisSession.length === 0) {
          hasMoreRef.current = false
          setHasMore(false)
        } else {
          const shuffled = shuffle(unshownThisSession)
          bufferRef.current = shuffled.map((row: any) => ({
            raw: row,
            score: scorePost(row, followedCatIdsRef.current)
          }))
        }
      }

      // 3. หยิบชุดถัดไปไปแสดงผล
      const nextBatch = bufferRef.current.slice(0, PAGE_SIZE)
      bufferRef.current = bufferRef.current.slice(PAGE_SIZE)

      if (nextBatch.length > 0) {
        nextBatch.forEach((item) => shownIdsRef.current.add(item.raw.id))
        setFeeds((prev) => [...prev, ...nextBatch.map((item) => formatPost(item.raw))])
      } else if (hasMoreRef.current) {
        // เผื่อ edge case: ไม่มีอะไรให้เพิ่มแต่ hasMore ยังไม่ถูก set false (เช่น error กลางทาง)
        hasMoreRef.current = false
        setHasMore(false)
      }
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="relative flex h-full w-full flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">

      {/* 🌟 Floating Header — กดแล้วเลื่อนกลับขึ้นบนสุด */}
      <div className="absolute top-6 left-0 right-0 z-[1000] px-6 pointer-events-none">
        <button
          onClick={scrollToTop}
          className="flex h-[72px] w-full items-center rounded-[2rem] bg-white/90 px-6 backdrop-blur-xl border border-zinc-100 shadow-xl shadow-zinc-200/50 pointer-events-auto dark:bg-zinc-900/90 dark:border-zinc-800 dark:shadow-none active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-900 text-white shadow-inner shadow-white/20 dark:bg-white dark:text-zinc-900">
              <Cat className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mt-0.5">
              Feed<span className="text-orange-500">.</span>
            </h1>
          </div>
        </button>
      </div>

      {/* 📱 Feed Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 px-6 pt-[104px] pb-[120px] space-y-6 overflow-y-auto no-scrollbar scroll-smooth"
      >

        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-white rounded-[2rem] shadow-sm border border-zinc-100 overflow-hidden dark:bg-zinc-900 dark:border-zinc-800 animate-pulse">
              <div className="p-4 flex items-center space-x-3">
                <div className="w-11 h-11 rounded-[1.2rem] bg-zinc-200 dark:bg-zinc-800"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-1/2 bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
                  <div className="h-2 w-1/3 bg-zinc-100 dark:bg-zinc-800 rounded-full"></div>
                </div>
              </div>
              <div className="w-full aspect-square md:aspect-[4/3] bg-zinc-200 dark:bg-zinc-800"></div>
              <div className="p-5 space-y-3">
                <div className="h-3 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
                <div className="h-3 w-1/2 bg-zinc-100 dark:bg-zinc-800 rounded-full"></div>
              </div>
            </div>
          ))
        ) : feeds.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center justify-center space-y-4 opacity-50">
            <Cat className="h-16 w-16 text-zinc-300 dark:text-zinc-700" />
            <p className="text-xs font-black tracking-widest text-zinc-400 uppercase">No cats spotted yet.<br/>Go hunt some!</p>
          </div>
        ) : (
          <>
            {feeds.map((feed) => (
              <div key={feed.id} data-feed-id={feed.id} ref={registerCardRef}>
                <FeedCard feed={feed} />
              </div>
            ))}

            {/* Sentinel สำหรับ infinite scroll */}
            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-6">
                {isLoadingMore && <Loader2 className="h-5 w-5 text-zinc-400 animate-spin" />}
              </div>
            )}

            {!hasMore && (
              <div className="flex justify-center pb-8 pt-4">
                <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-full flex items-center space-x-2 opacity-80">
                  <Check className="h-3 w-3 text-zinc-500" />
                  <p className="text-[10px] font-black tracking-widest text-zinc-400 uppercase">You're all caught up</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </main>
  )
}