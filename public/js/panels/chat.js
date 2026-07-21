// Ask-AI panel: streams answers from the local gemma4:e4b via the server's
// RAG endpoint. When the model is offline the server returns a structured live
// summary — shown honestly as data, not generated prose.
import { store } from '../state.js?v=2.0.0-saphan1'
import { tr } from '../i18n.js?v=2.0.0-saphan1'
import { el } from '../fmt.js?v=2.0.0-saphan1'

export function initChat() {
  const form = document.getElementById('chat-form')
  const input = document.getElementById('chat-input')
  const log = document.getElementById('chat-log')
  const statusEl = document.getElementById('chat-status')
  let busy = false

  refreshStatus()
  setInterval(refreshStatus, 60_000)

  async function refreshStatus() {
    try {
      const s = await (await fetch('/api/chat/status')).json()
      statusEl.innerHTML = s.reachable && s.hasChat
        ? `<span class="on">●</span> ${s.chatModel} · ${tr('พร้อมตอบจากข้อมูลจริงในระบบ', 'answering from live system data')}`
        : `<span class="off">●</span> ${tr('โมเดลออฟไลน์ — จะแสดงสรุปข้อมูลจริงแทน', 'model offline — live-data summary fallback')}`
    } catch { statusEl.textContent = '…' }
  }

  log.append(el('div', { class: 'chat-msg bot' },
    tr('สวัสดีครับ ถามสถานการณ์ฝุ่นได้เลย เช่น "ค่าฝุ่นเชียงใหม่ตอนนี้เท่าไร" หรือ "จังหวัดไหนเสี่ยงสุด" — ผมตอบจากข้อมูลจริงในระบบเท่านั้น ฟังประกาศ คพ./กรมอุตุฯ เสมอ',
       'Hello! Ask about the air situation — e.g. "PM2.5 in Chiang Mai now" or "which province is most at risk". I only answer from live system data — always follow official PCD / TMD guidance.')))

  // Example questions — shown as clickable chips below the welcome
  // message. Solves the "stuck at the empty chat box" problem: a first-
  // time visitor doesn't know what's possible to ask, and a panicked
  // citizen doesn't have time to think. Clicking a chip asks the
  // question for them.
  const examples = el('div', { class: 'chat-examples' },
    el('div', { class: 'chat-examples-head' },
      tr('ลองถามแบบนี้ · Try asking', 'ลองถามแบบนี้ · Try asking')),
    ...[
      { th: 'จังหวัดไหนเสี่ยงสุดตอนนี้', en: 'Which province is at highest risk right now?' },
      { th: 'ค่าฝุ่นเชียงใหม่ตอนนี้เท่าไร', en: 'What is PM2.5 in Chiang Mai right now?' },
      { th: 'ฝนจะช่วยล้างฝุ่นที่ไหนบ้าง', en: 'Where will rain wash out the dust?' },
      { th: 'อธิบายวิธีคำนวณคะแนนเสี่ยง', en: 'Explain how the risk score is calculated' },
    ].map((ex) => el('button', {
      class: 'chat-example-chip', type: 'button',
      onclick: () => {
        const q = store.lang === 'th' ? ex.th : ex.en
        input.value = q
        // Trigger the form's own submit handler
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      },
    }, tr(ex.th, ex.en))),
  )
  log.append(examples)

  // Thumbs up/down on a completed answer — fires once, then locks so a
  // visitor can't spam-vote the same response.
  function addFeedbackRow(botEl, logId) {
    if (logId == null) return
    let sent = false
    const row = el('div', { class: 'chat-feedback' },
      el('button', { class: 'fb-btn', type: 'button',
        onclick: () => vote(1, row) }, '👍'),
      el('button', { class: 'fb-btn', type: 'button',
        onclick: () => vote(-1, row) }, '👎'),
    )
    function vote(value, rowEl) {
      if (sent) return
      sent = true
      rowEl.classList.add('sent')
      fetch(`/api/chat/logs/${logId}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      }).catch(() => {})
    }
    botEl.append(row)
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const message = input.value.trim()
    if (!message || busy) return
    busy = true
    input.value = ''
    log.append(el('div', { class: 'chat-msg user' }, message))
    const botEl = el('div', { class: 'chat-msg bot' }, '…')
    log.append(botEl)
    log.scrollTop = log.scrollHeight

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, lang: store.lang }),
      })

      if (res.headers.get('content-type')?.includes('application/json')) {
        const j = await res.json()
        if (j.faq) {
          // FAQ-cache hit — a different response shape from the offline
          // fallback below (message, not note_th/note_en/facts).
          botEl.textContent = j.message ?? ''
          botEl.append(el('div', { class: 'chat-source' },
            `⚡ ${tr('จาก FAQ · ' + Math.round((j.faq_score ?? 0) * 100) + '% ตรงกัน · ' + (j.latency_ms ?? 0) + ' มิลลิวินาที',
                          'from FAQ · ' + Math.round((j.faq_score ?? 0) * 100) + '% match · ' + (j.latency_ms ?? 0) + ' ms')}`))
          addFeedbackRow(botEl, j.log_id)
        } else {
          botEl.classList.add('offline')
          botEl.textContent = `${store.lang === 'th' ? j.note_th : j.note_en}\n\n${j.facts ?? j.error ?? ''}`
        }
      } else {
        botEl.textContent = ''
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx); buf = buf.slice(idx + 2)
            const data = frame.split('\n').find((l) => l.startsWith('data: '))?.slice(6)
            if (!data) continue
            try {
              const obj = JSON.parse(data)
              if (obj.delta) { botEl.textContent += obj.delta; log.scrollTop = log.scrollHeight }
              if (obj.done) {
                if (obj.knowledge?.length) {
                  botEl.append(el('div', { class: 'kn' }, `${tr('อ้างอิงความรู้', 'knowledge')}: ${obj.knowledge.join(' · ')}`))
                }
                addFeedbackRow(botEl, obj.log_id)
              }
              if (obj.error) botEl.append(el('div', { class: 'kn' }, obj.error))
            } catch { /* keep buffering */ }
          }
        }
      }
    } catch {
      botEl.textContent = tr('ขออภัย ตอบไม่สำเร็จ ลองอีกครั้ง', 'Sorry — request failed, please retry.')
    } finally {
      busy = false
      log.scrollTop = log.scrollHeight
    }
  })
}
