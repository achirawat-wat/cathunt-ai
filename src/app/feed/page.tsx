// src/app/feed/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Bell, Cat, Loader2, Check } from 'lucide-react' // 👈 เพิ่ม Check ตรงนี้แล้วครับ
import FeedCard from '@/components/feed-card'
import { supabase } from '@/lib/supabase'

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

export default function FeedPage() {
  const [feeds, setFeeds] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    fetchFeeds()
  }, [])

  const fetchFeeds = async () => {
    try {
      const { data, error } = await supabase
        .from('encounters')
        .select(`
          id,
          image_url,
          description,
          likes_count,
          created_at,
          cats ( id, name, area ),
          profiles ( id, username, avatar_url )
        `)
        .eq('is_training', false)
        .order('created_at', { ascending: false })
        .limit(20) 

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }
      
      if (data) {
        const formattedFeeds = data.map((post: any) => {
          const catInfo = Array.isArray(post.cats) ? post.cats[0] : post.cats;
          const profileInfo = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;

          return {
            id: post.id,
            user: {
              name: profileInfo?.username || 'Unknown Hunter',
              avatar: profileInfo?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150',
            },
            cat: {
              id: catInfo?.id,
              name: catInfo?.name || 'Unknown Cat',
              area: catInfo?.area || 'Unknown Area',
            },
            image: post.image_url,
            content: post.description, 
            time: timeAgo(post.created_at), 
            likes: post.likes_count || 0 
          }
        })
        
        setFeeds(formattedFeeds)
      }
    } catch (error) {
      console.error('Error fetching feeds:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleNotification = () => {
    alert('No new notifications right now. 🐱')
  }

  return (
    <main className="relative flex h-full w-full flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      
      {/* 🌟 Floating Header */}
      <div className="absolute top-6 left-0 right-0 z-[1000] px-6 pointer-events-none">
        <div className="flex h-[72px] items-center justify-between rounded-[2rem] bg-white/90 px-6 backdrop-blur-xl border border-zinc-100 shadow-xl shadow-zinc-200/50 pointer-events-auto dark:bg-zinc-900/90 dark:border-zinc-800 dark:shadow-none">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-900 text-white shadow-inner shadow-white/20 dark:bg-white dark:text-zinc-900">
              <Cat className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mt-0.5">
              Feed<span className="text-orange-500">.</span>
            </h1>
          </div>
          
          <button 
            onClick={handleNotification}
            className="relative flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-100 text-zinc-900 active:scale-95 transition-transform hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-orange-500 border-2 border-zinc-100 dark:border-zinc-800 animate-pulse"></span>
          </button>
        </div>
      </div>

      {/* 📱 Feed Content */}
      <div className="flex-1 px-6 pt-[104px] pb-[120px] space-y-6 overflow-y-auto no-scrollbar scroll-smooth">
        
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
          feeds.map((feed) => (
            <FeedCard key={feed.id} feed={feed} />
          ))
        )}
        
        {!isLoading && feeds.length > 0 && (
          <div className="flex justify-center pb-8 pt-4">
            <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-full flex items-center space-x-2 opacity-80">
              <Check className="h-3 w-3 text-zinc-500" />
              <p className="text-[10px] font-black tracking-widest text-zinc-400 uppercase">You're all caught up</p>
            </div>
          </div>
        )}
      </div>

    </main>
  )
}