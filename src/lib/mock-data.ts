// src/lib/mock-data.ts

export const mockCats = [
  { id: 'c1', name: 'Mochi', lat: 13.7798, lng: 100.5447, area: 'Ari, Bangkok', seen: '15m ago' },
  { id: 'c2', name: 'Shadow', lat: 13.7367, lng: 100.5610, area: 'Asok, Bangkok', seen: '2h ago' },
  { id: 'c3', name: 'Garfield', lat: 13.7465, lng: 100.5327, area: 'Siam, Bangkok', seen: '5h ago' },
  { id: 'c4', name: 'Luna', lat: 13.7329, lng: 100.5827, area: 'Thong Lo, Bangkok', seen: '1d ago' },
]

export const mockFeeds = [
  {
    id: 'f1',
    user: { name: 'Sarah J.', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop' },
    cat: mockCats[0], // เชื่อมกับ Mochi (Ari)
    image: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=800&auto=format&fit=crop',
    likes: 124,
    comments: 18,
    isLiked: false,
    isFollowing: false,
  },
  {
    id: 'f2',
    user: { name: 'Mark D.', avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150&auto=format&fit=crop' },
    cat: mockCats[1], // เชื่อมกับ Shadow (Asok)
    image: 'https://images.unsplash.com/photo-1513360371669-4adf3dd7dff8?q=80&w=800&auto=format&fit=crop',
    likes: 89,
    comments: 5,
    isLiked: true,
    isFollowing: true, // คนนี้เราเคยกดติดตามแมวไว้แล้ว
  },
]