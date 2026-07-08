// src/app/notifications/page.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, Loader2, Cat } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

function timeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return `Just now`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return `${Math.floor(diffInSeconds / 86400)}d ago`
}

export default function NotificationsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
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

        if (error) throw error

        if (data) {
          setNotifications(data)
        }
      } catch (err) {
        console.error('Error fetching notifications:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchNotifications()

    // Mark all as read when opening page
    const markAsRead = async () => {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)
    }
    markAsRead()
  }, [user])

  return (
    <main className="relative flex min-h-screen w-full flex-col bg-zinc-50 dark:bg-zinc-950 overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-[1000] px-6 pt-6 pb-4 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-100 dark:border-zinc-900">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/feed')}
            className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-white text-zinc-900 shadow-sm border border-zinc-100 active:scale-95 transition-transform dark:bg-zinc-900 dark:border-zinc-800 dark:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mt-0.5">
            Notifications<span className="text-orange-500">.</span>
          </h1>
        </div>
      </div>

      <div className="flex-1 p-6 pb-32">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Loading...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-32 text-zinc-400 font-medium flex flex-col items-center">
            <Bell className="w-16 h-16 mb-4 text-zinc-300 dark:text-zinc-700" />
            <p className="text-sm font-black text-zinc-900 dark:text-white uppercase">No notifications yet.</p>
            <p className="text-xs font-medium text-zinc-400 mt-2">When someone interacts with you, it will show up here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map(notif => {
              const className = `flex items-start space-x-4 p-4 rounded-[1.5rem] ${notif.is_read ? 'bg-white dark:bg-zinc-900' : 'bg-orange-50 dark:bg-orange-500/10'} shadow-sm border border-zinc-100 dark:border-zinc-800 block hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors`
              
              const innerContent = (
                <>
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
                </>
              )

              if (notif.encounter_id) {
                return (
                  <Link key={notif.id} href={`/post/${notif.encounter_id}`} className={className}>
                    {innerContent}
                  </Link>
                )
              }

              return (
                <div key={notif.id} className={className}>
                  {innerContent}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
