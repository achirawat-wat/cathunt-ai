// src/app/post/[id]/page.tsx
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Cat } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import FeedCard from '@/components/feed-card'

function timeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return `Just now`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return `${Math.floor(diffInSeconds / 86400)}d ago`
}

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const encounterId = resolvedParams.id
  const router = useRouter()
  
  const [post, setPost] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const { data, error: err } = await supabase
          .from('encounters')
          .select(`
            id,
            cat_id,
            image_url,
            description,
            likes_count,
            created_at,
            location_name,
            cats ( id, name, area ),
            profiles ( id, username, avatar_url )
          `)
          .eq('id', encounterId)
          .single()

        if (err || !data) throw err

        const catInfo = Array.isArray(data.cats) ? data.cats[0] : data.cats
        const profileInfo = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles

        setPost({
          id: data.id,
          user: {
            name: profileInfo?.username || 'Unknown Hunter',
            avatar: profileInfo?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150',
          },
          cat: {
            id: data.cat_id,
            name: catInfo?.name || 'Unknown Cat',
            area: data.location_name || catInfo?.area || 'Unknown Area',
          },
          image: data.image_url,
          content: data.description,
          time: timeAgo(data.created_at),
          createdAt: data.created_at,
          likes: data.likes_count || 0,
        })
      } catch (err) {
        console.error('Error fetching post:', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchPost()
  }, [encounterId])

  return (
    <main className="relative flex min-h-screen w-full flex-col bg-zinc-50 dark:bg-zinc-950 overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-[1000] px-6 pt-6 pb-4 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-100 dark:border-zinc-900">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-white text-zinc-900 shadow-sm border border-zinc-100 active:scale-95 transition-transform dark:bg-zinc-900 dark:border-zinc-800 dark:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mt-0.5">
            Post<span className="text-orange-500">.</span>
          </h1>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 pb-32">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Loading post...</p>
          </div>
        ) : error || !post ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4 text-center">
            <div className="h-16 w-16 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-2">
              <Cat className="h-8 w-8 text-zinc-300 dark:text-zinc-700" />
            </div>
            <p className="text-sm font-black text-zinc-900 dark:text-white uppercase">Post Not Found</p>
            <p className="text-xs font-medium text-zinc-400">This post may have been deleted or doesn't exist.</p>
          </div>
        ) : (
          <div className="-mx-2 sm:mx-0">
            <FeedCard feed={post} />
          </div>
        )}
      </div>
    </main>
  )
}
