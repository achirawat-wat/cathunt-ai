// src/app/cats/[id]/page.tsx
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Share, MapPin, Heart, Calendar, Clock, Image as ImageIcon, Send, MessageSquare, Loader2, Check, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export default function CatProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const catId = resolvedParams.id
  const router = useRouter()
  const { user, profile } = useAuthStore()

  const [cat, setCat] = useState<any>(null)
  const [encounters, setEncounters] = useState<any[]>([])
  
  // States สำหรับระบบ Follow
  const [isFollowing, setIsFollowing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // States สำหรับระบบ Notes (สมุดเยี่ยมแมว)
  const [notes, setNotes] = useState<any[]>([])
  const [noteText, setNoteText] = useState('')
  const [isSendingNote, setIsSendingNote] = useState(false)

  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchCatDetails()
    fetchNotes()
  }, [catId])

  useEffect(() => {
    if (!user) return
    const checkFollow = async () => {
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('cat_id', catId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (data) setIsFollowing(true)
    }
    checkFollow()
  }, [catId, user])

  // 🐈 โหลดข้อมูลแมวและแกลเลอรี
  const fetchCatDetails = async () => {
    setIsLoading(true)
    try {
      const { data: catData, error: catError } = await supabase
        .from('cats')
        .select('*')
        .eq('id', catId)
        .eq('is_training', false)
        .single()

      if (catError) throw catError
      setCat(catData)

      const { data: encData, error: encError } = await supabase
        .from('encounters')
        .select('image_url, created_at, profiles(username, avatar_url), description')
        .eq('cat_id', catId)
        .order('created_at', { ascending: false })

      if (encError) throw encError
      setEncounters(encData || [])
    } catch (error) {
      console.error('Error fetching cat profile:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 📝 โหลด Notes ของแมวตัวนี้
  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from('cat_notes')
      .select('id, text, created_at, profiles(username, avatar_url)')
      .eq('cat_id', catId)
      .order('created_at', { ascending: false }) // เรียงจากใหม่ไปเก่า (เพื่อให้คนพิมล่าสุดอยู่บนสุด)

    if (!error && data) {
      setNotes(data)
    }
  }

  // 🐾 ฟังก์ชัน Follow
  const handleFollow = async () => {
    if (!user) return
    setIsSubmitting(true)
    const currentlyFollowing = isFollowing
    setIsFollowing(!currentlyFollowing) // Optimistic UI

    try {
      if (currentlyFollowing) {
        await supabase.from('follows').delete().eq('cat_id', catId).eq('user_id', user.id)
        await supabase.rpc('decrement_followers', { cat_id: catId })
      } else {
        await supabase.from('follows').insert({ cat_id: catId, user_id: user.id })
        await supabase.rpc('increment_followers', { cat_id: catId })
      }
    } catch (err) {
      console.error('Follow error:', err)
      setIsFollowing(currentlyFollowing)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 📨 ฟังก์ชันส่ง Note
  const handleSendNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteText.trim() || !user) return

    setIsSendingNote(true)
    const textToSubmit = noteText.trim()
    setNoteText('') // Clear input immediately

    // Optimistic UI for Note (แสดงให้เห็นก่อนเซฟเสร็จ)
    const tempNote = {
      id: Date.now().toString(),
      text: textToSubmit,
      created_at: new Date().toISOString(),
      profiles: {
        username: profile?.username || 'You',
        avatar_url: profile?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150'
      }
    }
    setNotes(prev => [tempNote, ...prev])

    try {
      const { error } = await supabase.from('cat_notes').insert({
        cat_id: catId,
        user_id: user.id,
        text: textToSubmit
      })
      if (error) throw error
    } catch (err) {
      console.error('Error saving note:', err)
      // ถ้าพัง โหลดข้อมูลใหม่เพื่อลบอันจำลองออก
      fetchNotes() 
    } finally {
      setIsSendingNote(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950 flex-col space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!cat) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500">Cat not found</p>
      </div>
    )
  }

  const coverImage = encounters.length > 0
    ? encounters[0].image_url
    : 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=800'

  return (
    <main className="relative flex h-full w-full flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      
      {/* 🌟 Floating Top App Bar */}
      <div className="absolute top-6 left-0 right-0 z-[1000] px-6 pointer-events-none">
        <div className="flex h-[72px] items-center justify-between rounded-[2rem] bg-white/90 px-4 backdrop-blur-xl border border-zinc-100 shadow-xl shadow-zinc-200/50 pointer-events-auto dark:bg-zinc-900/90 dark:border-zinc-800 dark:shadow-none">
          <button onClick={() => router.back()} className="w-10 h-10 rounded-[1rem] flex items-center justify-center text-zinc-900 active:scale-95 transition-transform hover:bg-zinc-100 dark:text-white dark:hover:bg-zinc-800">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-black text-lg tracking-wide text-zinc-900 dark:text-white uppercase">
            Cat Profile<span className="text-orange-500">.</span>
          </span>
          <button onClick={() => navigator.share?.({ title: cat.name, url: window.location.href })} className="w-10 h-10 rounded-[1rem] flex items-center justify-center text-zinc-900 active:scale-95 transition-transform hover:bg-zinc-100 dark:text-white dark:hover:bg-zinc-800">
            <Share className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 📱 Scrollable Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar pt-[104px] pb-32 px-6 flex flex-col space-y-6">
        
        {/* 1. Hero Section */}
        <section className="relative w-full h-[400px] shrink-0 rounded-[2rem] overflow-hidden shadow-sm border border-zinc-100 dark:border-zinc-800 group">
          <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url('${coverImage}')` }}></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
          
          <div className="absolute bottom-0 left-0 w-full p-6 flex justify-between items-end pb-8">
            <div className="flex flex-col z-10">
              <h1 className="text-4xl font-black text-white drop-shadow-lg leading-tight">{cat.name}</h1>
              <div className="flex items-center space-x-1.5 mt-2 text-orange-400">
                <MapPin className="h-4 w-4" />
                <span className="text-sm font-bold tracking-wide text-white/90">
                  {cat.area ? cat.area.split(',')[0] : 'Unknown Location'}
                </span>
              </div>
            </div>
            
            <button
              onClick={handleFollow}
              disabled={isSubmitting}
              className={`flex items-center space-x-2 px-5 py-3 rounded-[1.2rem] font-black text-[11px] tracking-widest uppercase transition-all shadow-xl active:scale-95 z-10 disabled:opacity-50 ${isFollowing ? 'bg-zinc-900 text-white shadow-zinc-900/20' : 'bg-orange-500 text-white shadow-orange-500/30'}`}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {isFollowing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{isFollowing ? 'Following' : 'Follow'}</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* 2. Cat Stats */}
        <section className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800">
          <h2 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mb-4">Cat Stats</h2>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-orange-50 p-4 rounded-[1.5rem] flex flex-col items-center justify-center dark:bg-orange-500/10">
              <span className="text-3xl font-black text-orange-500 leading-none">{encounters.length}</span>
              <span className="text-[10px] font-bold tracking-widest text-orange-600/70 uppercase mt-2 dark:text-orange-400/70">Sightings</span>
            </div>
            <div className="bg-zinc-100 p-4 rounded-[1.5rem] flex flex-col items-center justify-center dark:bg-zinc-800">
              <span className="text-3xl font-black text-zinc-900 dark:text-white leading-none">{cat.followers_count || 0}</span>
              <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mt-2">Followers</span>
            </div>
          </div>
          <div className="flex flex-col space-y-4 text-sm font-bold">
            <div className="flex justify-between items-center pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center space-x-2 text-zinc-400">
                <Calendar className="h-5 w-5" />
                <span>FIRST SEEN</span>
              </div>
              <span className="text-zinc-900 dark:text-white">
                {cat.first_seen ? new Date(cat.first_seen).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' }) : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2 text-zinc-400">
                <Clock className="h-5 w-5" />
                <span>LAST SEEN</span>
              </div>
              <span className="text-orange-500">
                {cat.last_seen ? new Date(cat.last_seen).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-'}
              </span>
            </div>
          </div>
        </section>

        {/* 3. Community Gallery */}
        <section className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <ImageIcon className="h-5 w-5 text-zinc-900 dark:text-white" />
              <h2 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase">Gallery</h2>
            </div>
          </div>
          {encounters.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 h-64">
              <div className="col-span-2 row-span-2 rounded-[1.2rem] overflow-hidden relative group bg-zinc-100">
                <img src={encounters[0].image_url} className="w-full h-full object-cover" alt="Gallery 1" />
              </div>
              {encounters[1] && (
                <div className="rounded-[1.2rem] overflow-hidden bg-zinc-100">
                  <img src={encounters[1].image_url} className="w-full h-full object-cover" alt="Gallery 2" />
                </div>
              )}
              {encounters.length > 2 && (
                <div className="rounded-[1.2rem] overflow-hidden bg-zinc-100 flex items-center justify-center flex-col cursor-pointer active:scale-95 transition-transform dark:bg-zinc-800">
                  <span className="text-xl font-black text-zinc-900 dark:text-white">+{encounters.length - 2}</span>
                  <span className="text-[9px] font-bold tracking-widest text-zinc-400 uppercase">MORE</span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center bg-zinc-50 rounded-[1.2rem] dark:bg-zinc-800">
              <span className="text-sm font-bold text-zinc-400">ยังไม่มีรูปถ่าย</span>
            </div>
          )}
        </section>

        {/* 4. Real-time Cat Notes */}
        <section className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 mb-8">
          <div className="flex items-center space-x-2 mb-6">
            <MessageSquare className="h-5 w-5 text-zinc-900 dark:text-white" />
            <h2 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase">Cat Notes</h2>
          </div>
          
          {/* ช่องกรอก Note */}
          <form onSubmit={handleSendNote} className="flex space-x-3 mb-6">
            <div className="w-10 h-10 rounded-[1rem] bg-zinc-200 overflow-hidden shrink-0">
              <img src={profile?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150'} className="w-full h-full object-cover" alt="Me" />
            </div>
            <div className="flex-1 relative">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Leave a note about this cat..."
                className="w-full bg-zinc-50 border-none rounded-[1.2rem] py-3 pl-4 pr-12 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-orange-500/50 dark:bg-zinc-800 dark:text-white"
              />
              <button 
                type="submit"
                disabled={!noteText.trim() || isSendingNote}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50 disabled:scale-90 dark:bg-white dark:text-zinc-900"
              >
                {isSendingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 ml-[-2px] mb-[-2px]" />}
              </button>
            </div>
          </form>

          {/* รายการ Note จาก Database */}
          <div className="flex flex-col space-y-4 max-h-[300px] overflow-y-auto no-scrollbar">
            {notes.length === 0 ? (
              <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase text-center py-4">Be the first to leave a note!</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="flex space-x-3 animate-in fade-in slide-in-from-top-2">
                  <div className="w-10 h-10 rounded-[1rem] bg-zinc-200 overflow-hidden shrink-0 mt-0.5">
                    <img src={note.profiles?.avatar_url || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150'} className="w-full h-full object-cover" alt="Avatar" />
                  </div>
                  <div className="bg-zinc-50 rounded-[1.5rem] rounded-tl-none p-4 flex-1 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-xs text-zinc-900 dark:text-white">
                        {note.profiles?.username || 'Hunter'}
                      </span>
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                        {new Date(note.created_at).toLocaleDateString('th-TH')}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600 leading-relaxed dark:text-zinc-300">
                      {note.text}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </div>
    </main>
  )
}