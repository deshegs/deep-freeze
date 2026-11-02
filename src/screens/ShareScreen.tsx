import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

export function ShareScreen({ onClose }: { onClose: () => void }) {
  const link = window.location.origin
  const image = useMemo(() => {
    const code = qrcode(0, 'M')
    code.addData(link)
    code.make()
    return code.createDataURL(8, 16)
  }, [link])

  return (
    <div className="page">
      <header className="page-header no-print">
        <h1>Share and install</h1>
        <button className="icon-button" aria-label="Back to menu" onClick={onClose}>✕</button>
      </header>

      <section className="print-area">
        <h2>Deep freeze</h2>
        <img className="qr" src={image} alt={`QR code for ${link}`} />
        <p className="share-link">{link}</p>
        <p className="muted">Print this and tape it to the freezer lid.</p>
        <button className="secondary no-print" onClick={() => window.print()}>Print</button>
      </section>

      <section className="no-print">
        <h2>Add it to your home screen</h2>
        <p>It then opens full-screen like any other app.</p>
        <p><strong>iPhone:</strong> open this page in Safari, tap the Share button, then Add to Home Screen.</p>
        <p><strong>Android:</strong> open this page in Chrome, tap the ⋮ menu, then Add to Home screen or Install app.</p>
      </section>
    </div>
  )
}
