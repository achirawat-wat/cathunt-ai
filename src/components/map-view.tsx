'use client'

import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ChevronRight, MapPin } from 'lucide-react'

const catIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div class="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-orange-500 text-white shadow-xl shadow-orange-500/40 ring-[4px] ring-white active:scale-95 transition-transform dark:ring-zinc-900"><span class="text-2xl drop-shadow-sm">🐱</span></div>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -28],
})

const userIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div class="relative flex h-14 w-14 items-center justify-center">
           <div class="absolute h-full w-full rounded-full bg-zinc-900/20 animate-ping dark:bg-white/20"></div>
           <div class="relative h-5 w-5 rounded-full bg-zinc-900 ring-[4px] ring-white shadow-lg dark:bg-white dark:ring-zinc-900"></div>
         </div>`,
  iconSize: [56, 56],
  iconAnchor: [28, 28],
})

// 🧩 Updater ควบคุมกล้องแบบ Ultra-Smooth
// 🧩 Updater ควบคุมกล้องแบบ Ultra-Smooth (แก้ปัญหาบัคเวลารูด Slider เร็วๆ)
function MapUpdater({ center, radius, isSearchJump }: { center: [number, number], radius: number, isSearchJump: boolean }) {
  const map = useMap()
  const prevCenter = useRef(center)
  const prevRadius = useRef(radius)

  useEffect(() => {
    if (center && radius && map) {
      const latDelta = radius / 111.32
      const lngDelta = radius / (111.32 * Math.cos(center[0] * (Math.PI / 180)))

      const bounds = L.latLngBounds(
        [center[0] - latDelta, center[1] - lngDelta],
        [center[0] + latDelta, center[1] + lngDelta]
      )

      // 1. ปลดล็อคกำแพงก่อน เพื่อให้ซูมได้อย่างอิสระ
      map.setMinZoom(1)

      // @ts-ignore
      map.setMaxBounds(null)

      const targetZoom = map.getBoundsZoom(bounds)

      const isCenterChanged = prevCenter.current[0] !== center[0] || prevCenter.current[1] !== center[1]
      const isRadiusChanged = prevRadius.current !== radius

      // Animate if it's a search jump, OR if only the radius (slider) changed
      const shouldAnimate = isSearchJump || (isRadiusChanged && !isCenterChanged)

      // 2. 🚨 เปลี่ยนจาก flyTo เป็น setView เพื่อไม่ให้กล้องตีโค้งซูมออก
      map.setView(center, targetZoom, {
        animate: shouldAnimate,
        duration: 0.5
      })

      prevCenter.current = center
      prevRadius.current = radius

      // 3. สร้างฟังก์ชันล็อคกำแพงเมื่อกล้องซูมเสร็จ
      const onMoveEnd = () => {
        map.setMinZoom(targetZoom)
        map.setMaxBounds(bounds.pad(0.05))
      }

      map.once('moveend', onMoveEnd)

      // 4. 🚨 สำคัญมาก: ถ้าผู้ใช้รูด Slider ใหม่ก่อนแอนิเมชันเก่าจบ ให้ล้างคำสั่งล็อคกำแพงอันเก่าทิ้ง (กันบัคเด้งกลับ)
      return () => {
        map.off('moveend', onMoveEnd)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], radius, map])

  return null
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

import { useRouter } from 'next/navigation'

interface MapViewProps {
  radius?: number
  selectedCatId?: string
  onRadiusChange?: (newRadius: number) => void
  data?: any[]
  onUpdateCount?: (count: number) => void
  userPosition: [number, number]
}

export default function MapView({
  radius = 5,
  selectedCatId,
  onRadiusChange,
  data = [],
  onUpdateCount,
  userPosition = [13.7465, 100.5327]
}: MapViewProps) {
  const router = useRouter()
  const [customRenderer] = useState(() => L.svg({ padding: 2 }))

  const nearbyCats = data.map(encounter => {
    const distance = calculateDistance(userPosition[0], userPosition[1], encounter.lat, encounter.lng)
    return { ...encounter, distance }
  }).filter(cat => {
    if (selectedCatId && cat.cats?.id === selectedCatId) return true // Bypass radius for the selected cat
    return cat.distance <= radius
  })

  // 🎯 Auto-Zoom & Auto-Adjust Slider when searching
  useEffect(() => {
    if (selectedCatId && nearbyCats.length > 0) {
      const targetCat = nearbyCats.find(c => c.cats?.id === selectedCatId)
      if (targetCat && targetCat.distance > radius && targetCat.distance <= 15 && onRadiusChange) {
        onRadiusChange(Math.ceil(targetCat.distance))
      }
    }
  }, [selectedCatId, nearbyCats, radius, onRadiusChange])

  // Center point logic: center on user, UNLESS searching and found a cat
  const targetCat = selectedCatId ? nearbyCats.find(c => c.cats?.id === selectedCatId) : null
  const mapCenter: [number, number] = targetCat
    ? [targetCat.lat, targetCat.lng]
    : userPosition

  useEffect(() => {
    if (onUpdateCount) {
      onUpdateCount(nearbyCats.length)
    }
  }, [nearbyCats.length, onUpdateCount])



  return (
    <div className="relative h-full w-full z-0 bg-white dark:bg-zinc-950">
      <MapContainer
        center={mapCenter}
        zoom={14}
        zoomControl={false}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        touchZoom={true}
        renderer={customRenderer}
        className="h-full w-full map-smooth-transition"
        style={{
          willChange: 'transform'
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          className="transition-opacity duration-1000 ease-in-out"
          keepBuffer={10}
          updateWhenZooming={false}
        />

        <MapUpdater center={mapCenter} radius={radius} isSearchJump={!!selectedCatId} />

        <Circle
          center={userPosition}
          radius={radius * 1000}
          pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.08, weight: 2, dashArray: '4 8' }}
        />

        <Marker position={userPosition} icon={userIcon} />

        {nearbyCats.map((cat) => (
          <Marker key={cat.id} position={[cat.lat, cat.lng]} icon={catIcon}>
            <Popup className="cat-popup">
              <div className="flex flex-col w-[180px]">

                <div className="w-full h-24 rounded-[1rem] overflow-hidden mb-3 bg-zinc-100">
                  <img
                    src={cat.image_url}
                    className="w-full h-full object-cover"
                    alt={cat.cats?.name || 'Unknown Cat'}
                  />
                </div>

                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col">
                    <span className="font-black text-zinc-900 text-lg leading-none dark:text-white">
                      {cat.cats?.name || 'Unknown Cat'}
                    </span>
                    <div className="flex items-center space-x-1 mt-1 text-orange-500">
                      <MapPin className="h-3 w-3" />
                      <span className="text-[9px] font-bold tracking-widest uppercase truncate max-w-[120px]">
                        {cat.distance < 1 ? `${(cat.distance * 1000).toFixed(0)} M AWAY` : `${cat.distance.toFixed(1)} KM AWAY`}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => router.push(`/cats/${cat.cats?.id}`)}
                  className="flex w-full items-center justify-center space-x-1 rounded-[0.8rem] bg-zinc-900 py-2.5 text-[10px] font-black tracking-widest text-white transition-transform active:scale-95 dark:bg-white dark:text-zinc-900"
                >
                  <span>VIEW PROFILE</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

    </div>
  )
}