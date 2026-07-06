import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY
const JINA_API_KEY = process.env.JINA_API_KEY
const HF_BASE_URL = "https://router.huggingface.co/hf-inference/models"

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) return NextResponse.json({ success: false, error: 'ไม่พบข้อมูลรูปภาพ' }, { status: 400 })

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "")
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // ==========================================
    // 1. ด่านแรก: หาพิกัด (Bounding Box) ของตัวแมว
    // ==========================================
    const detectRes = await fetch(`${HF_BASE_URL}/facebook/detr-resnet-50`, {
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "image/jpeg"
      },
      method: "POST",
      body: imageBuffer,
    })

    // ✅ แก้: ดึง error message จริงออกมาดูก่อน throw
    if (!detectRes.ok) {
      const errText = await detectRes.text()
      console.error("🚨 HF Detect Error:", errText)
      throw new Error(`AI Detect error: ${detectRes.status} - ${errText}`)
    }
    const detectData = await detectRes.json()

    const catDetection = detectData.find((item: any) => item.label === 'cat' && item.score > 0.5)

    if (!catDetection) {
      return NextResponse.json({ success: false, error: 'AI มองไม่เห็นแมวในรูปนี้เลย ลองขยับกล้องดูนะ 😿' }, { status: 400 })
    }

    // ==========================================
    // 2. ด่านสอง: ตัดรูป (Crop) เอาเฉพาะเนื้อแมวล้วนๆ
    // ==========================================
    const { xmin, ymin, xmax, ymax } = catDetection.box

    const cropLeft = Math.max(0, Math.round(xmin))
    const cropTop = Math.max(0, Math.round(ymin))
    const cropWidth = Math.round(xmax - xmin)
    const cropHeight = Math.round(ymax - ymin)

    console.log(`✂️ AI กำลังตัดรูปแมวที่พิกัด: ${cropLeft}, ${cropTop} ขนาด: ${cropWidth}x${cropHeight}`)

    const croppedBuffer = await sharp(imageBuffer)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .toBuffer()

    const croppedBase64 = `data:image/jpeg;base64,${croppedBuffer.toString('base64')}`

    // ==========================================
    // 3. ด่านสาม: สกัด DNA แมวจาก "รูปที่ครอปแล้ว" (Jina AI - 512 มิติ)
    // ==========================================
    if (!JINA_API_KEY) {
      throw new Error("ระบบขาด JINA_API_KEY")
    }

    const embedRes = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${JINA_API_KEY}`
      },
      body: JSON.stringify({
        model: "jina-clip-v1",
        input: [
          { image: croppedBase64 }
        ]
      })
    })

    // ✅ แก้: ดึง error message จริงออกมาดูก่อน throw เหมือนกัน
    if (!embedRes.ok) {
      const errText = await embedRes.text()
      console.error("🚨 Jina Embed Error:", errText)
      throw new Error(`Jina Embedding error: ${embedRes.status} - ${errText}`)
    }
    const embedData = await embedRes.json()
    const catVector = embedData?.data?.[0]?.embedding

    if (!Array.isArray(catVector) || catVector.length !== 768) {
        throw new Error(`Vector Mismatch: ได้ ${catVector?.length || 0} มิติแทนที่จะเป็น 768`);
    }

    // ==========================================
    // 4. ค้นหาแมวใน Database (Vector Search)
    // ==========================================
    const { data: matchedCats, error } = await supabase.rpc('match_cats', {
      query_embedding: catVector,
      match_threshold: 0.3,   // ลด threshold เพื่อดึงผลมาเทียบเยอะขึ้น (โชว์ % ให้ทุกตัว)
      match_count: 50         // ดึงมาให้ครอบคลุมแมวทั้งหมดในระบบ
    })

    if (error) throw error

    const bestMatch = matchedCats?.find((c: any) => c.similarity >= 0.85) || null

    return NextResponse.json({
      success: true,
      matchType: bestMatch ? 'known' : 'new',
      cat: bestMatch,
      matches: matchedCats || [],   // 👈 ส่งลิสต์ทั้งหมดพร้อม similarity
      vector: catVector
    })
  } catch (error: any) {
    console.error('Analyze API Fatal Error:', error)
    return NextResponse.json({ success: false, error: 'ระบบวิเคราะห์ขัดข้องชั่วคราว โปรดลองใหม่อีกครั้ง' }, { status: 503 })
  }
}