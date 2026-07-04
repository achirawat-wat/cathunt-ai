'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Filter, Check, Loader2, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const MapView = dynamic(() => import('@/components/map-view'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-white dark:bg-zinc-950 flex-col space-y-3">
      <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      <p className="text-[10px] font-black tracking-widest text-zinc-400 uppercase animate-pulse">
        LOADING MAP...
      </p>
    </div>
  ),
})

export default function ExplorePage() {
  const [showFilter, setShowFilter] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [radius, setRadius] = useState(5) // Default 5 KM
  
  const [realCatsData, setRealCatsData] = useState<any[]>([])
  const [nearbyCatsCount, setNearbyCatsCount] = useState(0)

  const filterOptions = [
    { id: 'all', label: 'All Cats' },
    { id: 'active', label: 'Active Cats' },
    { id: 'uncaptured', label: 'Uncaptured' },
  ]

  useEffect(() => {
    const fetchMapData = async () => {
      try {
        const { data, error } = await supabase
          .from('encounters')
          .select(`
            id,
            lat,
            lng,
            image_url,
            created_at,
            cats ( id, name, area )
          `)
          .order('created_at', { ascending: false })
        
        if (error) throw error

        if (data) {
          const uniqueCatsMap = new Map()
          
          data.forEach((encounter: any) => {
            const catInfo = Array.isArray(encounter.cats) ? encounter.cats[0] : encounter.cats;
            if (catInfo && encounter.lat && encounter.lng) {
              if (!uniqueCatsMap.has(catInfo.id)) {
                uniqueCatsMap.set(catInfo.id, {
                  ...encounter,
                  cats: catInfo 
                })
              }
            }
          })
          setRealCatsData(Array.from(uniqueCatsMap.values()))
        }
      } catch (err) {
        console.error('Error fetching map data:', err)
      }
    }
    fetchMapData()
  }, [])

  return (
    <main className="relative flex h-full w-full flex-col bg-white dark:bg-zinc-950 overflow-hidden">
      
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white via-white/70 to-transparent z-[500] pointer-events-none dark:from-zinc-950 dark:via-zinc-950/70"></div>

      {/* 🌟 Floating Header */}
      <div className="absolute top-6 left-0 right-0 z-[1000] px-6 pointer-events-none">
        <div className="relative">
          <div className="flex h-[72px] items-center justify-between rounded-[2rem] bg-white/90 px-6 backdrop-blur-xl border border-zinc-100 shadow-xl shadow-zinc-200/50 pointer-events-auto dark:bg-zinc-900/90 dark:border-zinc-800 dark:shadow-none">
            
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-orange-500 text-white shadow-inner shadow-white/20">
                <MapPin className="h-5 w-5" />
              </div>
              <h1 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mt-0.5">
                Explore<span className="text-orange-500">.</span>
              </h1>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="flex flex-col items-end mr-1 hidden sm:flex">
                <span className="text-[9px] font-black tracking-widest text-orange-500 transition-all">
                  {nearbyCatsCount} CATS
                </span>
                <span className="text-[9px] font-bold tracking-widest text-zinc-400">NEARBY</span>
              </div>
              
              <button 
                onClick={() => setShowFilter(!showFilter)}
                className={`relative flex h-10 w-10 items-center justify-center rounded-[1rem] active:scale-95 transition-all ${
                  showFilter || activeFilter !== 'all' 
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' 
                    : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
                }`}
              >
                <Filter className="h-4 w-4" />
                {activeFilter !== 'all' && (
                  <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-orange-500 border-2 border-zinc-900 dark:border-white"></span>
                )}
              </button>
              
              <button className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-100 text-zinc-900 active:scale-95 transition-transform dark:bg-zinc-800 dark:text-white">
                  <Search className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 🔽 Filter Dropdown Menu */}
          {showFilter && (
            <div className="absolute top-[84px] right-[48px] w-48 bg-white rounded-[1.5rem] shadow-2xl border border-zinc-100 p-2 pointer-events-auto origin-top-right animate-in fade-in zoom-in duration-200 dark:bg-zinc-900 dark:border-zinc-800">
              {filterOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setActiveFilter(opt.id)
                    setShowFilter(false)
                  }}
                  className={`flex w-full items-center justify-between px-4 py-3 rounded-[1rem] text-[10px] font-black tracking-widest transition-colors ${
                    activeFilter === opt.id 
                      ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-500' 
                      : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                  {activeFilter === opt.id && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 🎚️ Horizontal Radar Slider Panel (วางแนวนอน ใต้ Header) */}
      <div className="absolute top-[104px] left-6 right-6 z-[900] pointer-events-auto">
        <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl px-4 py-3 rounded-[1.2rem] shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center space-x-3 transition-all duration-300">
          <span className="text-[10px] font-black tracking-widest text-zinc-400">1 KM</span>
          <input
            type="range"
            min="1"
            max="15"
            step="1"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-orange-500 dark:bg-zinc-800"
          />
          <span className="text-[10px] font-black tracking-widest text-zinc-400">15 KM</span>
          <div className="bg-orange-50 dark:bg-orange-500/10 text-orange-500 px-3 py-1.5 rounded-[0.8rem] text-[10px] font-black tracking-widest shadow-inner shadow-orange-500/10 ml-2 w-16 text-center">
            {radius} KM
          </div>
        </div>
      </div>

      <div className="flex-1 w-full h-full pt-[72px]">
        <MapView radius={radius} data={realCatsData} onUpdateCount={setNearbyCatsCount} />
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-white via-white/80 to-transparent z-[500] pointer-events-none dark:from-zinc-950 dark:via-zinc-950/80"></div>

    </main>
  )
}