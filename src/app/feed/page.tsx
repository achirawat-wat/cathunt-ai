// src/app/feed/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Cat, Loader2, Check, Bell, X } from 'lucide-react'
import FeedCard from '@/components/feed-card'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useFeedStore } from '@/store/feedStore'

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
      area: post.location_name || catInfo?.area || 'Unknown Area',
    },
    image: post.image_url,
    content: post.description,
    time: timeAgo(post.created_at),
    createdAt: post.created_at,
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
  location_name,
  cats ( name, area ),
  profiles ( id, username, avatar_url )
`

// 🔄 Pull-to-refresh tuning
const PULL_THRESHOLD = 70 // ลากเกินระยะนี้แล้วปล่อย = รีเฟรช
const MAX_PULL = 110      // ลากได้สุดแค่นี้ (กันลากยาวเกิน)
const PULL_RESISTANCE = 0.5 // ยิ่งค่าน้อย ยิ่งลากหนืด (ฟีลลิ่งแบบแอพ native)

export default function FeedPage() {
  const { user } = useAuthStore()

  const feeds = useFeedStore(s => s.feeds)
  const hasMore = useFeedStore(s => s.hasMore)
  const initialized = useFeedStore(s => s.initialized)
  
  const [isLoading, setIsLoading] = useState(!initialized)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // 🔔 Notifications state
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)

  // 🔄 Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isPullingRef = useRef(false)
  const touchStartYRef = useRef<number | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const viewObserverRef = useRef<IntersectionObserver | null>(null)

  const isLoadingMoreRef = useRef(false)

  // 🔔 โหลดแจ้งเตือน
  useEffect(() => {
    if (!user) return

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select(`
          *,
          actor:profiles!actor_id(username, avatar_url),
          encounter:encounters!encounter_id(image_url),
          cat:cats!cat_id(name)
        `)
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (data) {
        setNotifications(data)
        setUnreadCount(data.filter((n: any) => !n.is_read).length)
      }
    }

    fetchNotifications()

    let channel: any = null
    try {
      channel = supabase.channel('realtime:notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, () => {
          fetchNotifications()
        })
        .subscribe()
    } catch (err) {
      console.warn("WebSocket not available for realtime:", err)
    }

    return () => { 
      if (channel) {
        try { supabase.removeChannel(channel) } catch (e) {}
      }
    }
  }, [user])

  const markNotificationsAsRead = async () => {
    if (unreadCount === 0 || !user) return
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', user.id).eq('is_read', false)
    setUnreadCount(0)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  useEffect(() => {
    if (!user) return
    if (!initialized) {
      initFeed()
    } else if (scrollContainerRef.current) {
      // Restore scroll position
      scrollContainerRef.current.scrollTop = useFeedStore.getState().scrollPosition
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Track scroll position on unmount / occasionally
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    let scrollTimeout: NodeJS.Timeout | null = null
    const handleScroll = () => {
      if (!scrollTimeout) {
        scrollTimeout = setTimeout(() => {
          useFeedStore.setState({ scrollPosition: container.scrollTop })
          scrollTimeout = null
        }, 150) // Throttle save to avoid lag
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [])

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

  // 🔄 Pull-to-refresh: native touch listeners (ต้อง non-passive เพื่อ preventDefault ตอนลาก)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleTouchStart = (e: TouchEvent) => {
      if (isLoading || isRefreshing) return
      // เริ่มจับได้เฉพาะตอนอยู่บนสุดของฟีดเท่านั้น (เหมือนแอพ native)
      if (container.scrollTop <= 0) {
        touchStartYRef.current = e.touches[0].clientY
        isPullingRef.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || touchStartYRef.current === null) return

      const currentY = e.touches[0].clientY
      const diff = currentY - touchStartYRef.current

      if (diff > 0 && container.scrollTop <= 0) {
        // กันไม่ให้หน้าจอเลื่อน (bounce) ระหว่างลากลงมา
        e.preventDefault()
        const resisted = Math.min(MAX_PULL, diff * PULL_RESISTANCE)
        setPullDistance(resisted)
      } else {
        isPullingRef.current = false
        touchStartYRef.current = null
        setPullDistance(0)
      }
    }

    const handleTouchEnd = () => {
      if (!isPullingRef.current) return
      isPullingRef.current = false
      touchStartYRef.current = null

      setPullDistance((current) => {
        if (current >= PULL_THRESHOLD) {
          triggerRefresh()
        }
        return 0
      })
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd)

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isRefreshing])

  const registerCardRef = (el: HTMLDivElement | null) => {
    if (el && viewObserverRef.current) viewObserverRef.current.observe(el)
  }

  async function markAsSeen(encounterId: string) {
    if (!user) return
    const { seenIds } = useFeedStore.getState()
    if (seenIds.has(encounterId)) return
    
    // optimistic กันยิงซ้ำในรอบเดียวกัน
    const newSeenIds = new Set(seenIds)
    newSeenIds.add(encounterId)
    useFeedStore.setState({ seenIds: newSeenIds })

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

    useFeedStore.setState({
      seenIds: new Set((viewsData || []).map((v: any) => v.encounter_id)),
      followedCatIds: new Set((followsData || []).map((f: any) => f.cat_id).filter(Boolean))
    })
  }

  async function initFeed() {
    setIsLoading(true)
    try {
      await loadUserContext()
      await fetchMore()
      useFeedStore.setState({ initialized: true })
    } catch (err) {
      console.error('initFeed error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function fetchMore() {
    if (!user) return
    const state = useFeedStore.getState()
    if (isLoadingMoreRef.current || !state.hasMore) return

    isLoadingMoreRef.current = true
    setIsLoadingMore(true)

    try {
      let currentBuffer = [...state.buffer]
      let currentAllFetched = [...state.allFetchedRaw]
      let currentOffset = state.offset
      let currentDbExhausted = state.dbExhausted

      // 1. เติม buffer จาก DB ทีละ chunk จนกว่าจะพอสำหรับหน้านี้ หรือดึงจน DB หมด
      while (currentBuffer.length < PAGE_SIZE && !currentDbExhausted) {
        const from = currentOffset
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

        currentOffset += CHUNK_SIZE

        if (!data || data.length === 0) {
          currentDbExhausted = true
          break
        }
        if (data.length < CHUNK_SIZE) {
          currentDbExhausted = true
        }

        currentAllFetched.push(...data)

        const currentState = useFeedStore.getState()
        const unseen = data.filter(
          (row: any) => !currentState.seenIds.has(row.id) && !currentState.shownIds.has(row.id)
        )
        const scored = unseen.map((row: any) => ({ raw: row, score: scorePost(row, currentState.followedCatIds) }))

        currentBuffer = [...currentBuffer, ...scored].sort((a, b) => b.score - a.score)
      }

      // Sync state back
      useFeedStore.setState({
        buffer: currentBuffer,
        allFetchedRaw: currentAllFetched,
        offset: currentOffset,
        dbExhausted: currentDbExhausted
      })
      
      let finalState = useFeedStore.getState()

      if (finalState.buffer.length === 0 && finalState.dbExhausted) {
        const unshownThisSession = finalState.allFetchedRaw.filter(
          (row: any) => !finalState.shownIds.has(row.id)
        )

        if (unshownThisSession.length === 0) {
          useFeedStore.setState({ hasMore: false })
        } else {
          const shuffled = shuffle(unshownThisSession)
          useFeedStore.setState({
            buffer: shuffled.map((row: any) => ({
              raw: row,
              score: scorePost(row, finalState.followedCatIds)
            }))
          })
        }
      }

      // Re-fetch state for next batch processing
      finalState = useFeedStore.getState()
      const nextBatch = finalState.buffer.slice(0, PAGE_SIZE)
      const remainingBuffer = finalState.buffer.slice(PAGE_SIZE)

      if (nextBatch.length > 0) {
        const newShownIds = new Set(finalState.shownIds)
        nextBatch.forEach((item) => newShownIds.add(item.raw.id))
        
        useFeedStore.setState({
          buffer: remainingBuffer,
          shownIds: newShownIds,
          feeds: [...finalState.feeds, ...nextBatch.map((item) => formatPost(item.raw))]
        })
      } else if (finalState.hasMore) {
        useFeedStore.setState({ hasMore: false })
      }
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }

  // 🔄 รีเซ็ต state ภายในทั้งหมดแล้วโหลดฟีดใหม่ตั้งแต่ต้น (เหมือนลากรีเฟรชในแอพโซเชียล)
  async function triggerRefresh() {
    if (isRefreshing) return
    if (navigator.vibrate) navigator.vibrate(30)

    setIsRefreshing(true)

    useFeedStore.getState().resetFeed()

    try {
      await loadUserContext()
      await fetchMore()
    } finally {
      setIsRefreshing(false)
    }
  }

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 🔄 ความสูง/ความโปร่งใส/การหมุนของตัว indicator ตามระยะที่ลาก
  const indicatorHeight = isRefreshing ? 56 : pullDistance
  const indicatorProgress = Math.min(1, indicatorHeight / PULL_THRESHOLD)

  return (
    <main className="relative flex h-full w-full flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">

      {/* 🔔 Notifications Slide-over */}
      {showNotifications && (
        <div className="absolute inset-0 z-[2000] flex flex-col bg-zinc-50 dark:bg-zinc-950 animate-in slide-in-from-right-full duration-300 pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-5 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 shadow-sm">
            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-wide">Notifications</h2>
            <button onClick={() => setShowNotifications(false)} className="w-10 h-10 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center active:scale-95">
              <X className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-4">
            {notifications.length === 0 ? (
              <div className="text-center py-20 text-zinc-400 font-medium flex flex-col items-center">
                <Bell className="w-12 h-12 mb-4 text-zinc-300 dark:text-zinc-700" />
                <p>No notifications yet.</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} className={`flex items-start space-x-4 p-4 rounded-[1.5rem] ${notif.is_read ? 'bg-white dark:bg-zinc-900' : 'bg-orange-50 dark:bg-orange-500/10'} shadow-sm border border-zinc-100 dark:border-zinc-800`}>
                  <img src={notif.actor?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150'} className="w-11 h-11 rounded-full object-cover shrink-0 bg-zinc-200" alt="avatar" />
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm text-zinc-900 dark:text-white leading-snug">
                      <span className="font-black">{notif.actor?.username || 'Someone'}</span>
                      {notif.type === 'like' ? ' liked your post' :
                        notif.type === 'follow_post' ? ` spotted ${notif.cat?.name}` : ' interacted with you'}
                    </p>
                    <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mt-1 inline-block">{timeAgo(notif.created_at)}</span>
                  </div>
                  {notif.encounter?.image_url && (
                    <img src={notif.encounter.image_url} className="w-14 h-14 rounded-[1rem] object-cover shrink-0 border border-zinc-100 dark:border-zinc-800" alt="post" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 🌟 Floating Header — กดแล้วเลื่อนกลับขึ้นบนสุด */}
      <div className="absolute top-6 left-0 right-0 z-[1000] px-6 pointer-events-none">
        <div
          className="flex h-[72px] w-full items-center justify-between rounded-[2rem] bg-white/90 px-6 backdrop-blur-xl border border-zinc-100 shadow-xl shadow-zinc-200/50 pointer-events-auto dark:bg-zinc-900/90 dark:border-zinc-800 dark:shadow-none transition-transform"
        >
          <button onClick={scrollToTop} className="flex items-center space-x-3 active:scale-[0.98] transition-transform text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-900 text-white shadow-inner shadow-white/20 dark:bg-white dark:text-zinc-900 shrink-0">
              <Cat className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mt-0.5">
              Feed<span className="text-orange-500">.</span>
            </h1>
          </button>

          <div className="relative pointer-events-auto shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowNotifications(true)
                markNotificationsAsRead()
              }}
              className="w-10 h-10 bg-zinc-50 hover:bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 active:scale-95"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900 animate-pulse"></span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 📱 Feed Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 px-6 pt-[104px] pb-[120px] space-y-6 overflow-y-auto no-scrollbar overscroll-y-contain"
      >

        {/* 🔄 Pull-to-refresh indicator: ดันเนื้อหาลงตามระยะที่ลาก แล้วสปริงกลับตอนปล่อย */}
        <div
          style={{
            height: indicatorHeight,
            transition: isPullingRef.current ? 'none' : 'height 0.25s ease',
          }}
          className="flex items-center justify-center overflow-hidden"
        >
          <div
            style={{
              opacity: indicatorProgress,
              transform: `scale(${0.6 + indicatorProgress * 0.4}) rotate(${isRefreshing ? 0 : indicatorProgress * 360}deg)`,
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 text-orange-500 animate-spin" />
            ) : (
              <Cat className={`h-4 w-4 ${indicatorProgress >= 1 ? 'text-orange-500' : 'text-zinc-400'}`} />
            )}
          </div>
        </div>

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
        ) : feeds.length === 0 && isRefreshing ? (
          // 🔄 ระหว่างรีเฟรช feeds ถูกเคลียร์เป็น [] ชั่วคราว — โชว์ค่าว่างเปล่าไปก่อน ไม่ต้องมี empty state โผล่มาแป๊บนึง
          <div className="h-10" />
        ) : feeds.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center justify-center space-y-4 opacity-50">
            <Cat className="h-16 w-16 text-zinc-300 dark:text-zinc-700" />
            <p className="text-xs font-black tracking-widest text-zinc-400 uppercase">No cats spotted yet.<br />Go hunt some!</p>
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