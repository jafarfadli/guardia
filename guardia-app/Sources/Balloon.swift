import AppKit

// A comic speech balloon over a cat: paper, a hand-inked edge, a tail down to the head, the words
// in the island's lettering. It fades in, stays a few seconds, and goes.
final class Balloon {
    private let panel: NSPanel
    private let view = BalloonView()
    private var hideWork: DispatchWorkItem?
    private(set) var text: String?
    var shown: Bool { text != nil }

    init() {
        panel = NSPanel(contentRect: CGRect(x: 0, y: 0, width: 80, height: 40), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.contentView = view
    }

    func show(_ text: String, for seconds: Double) {
        self.text = text
        view.text = text
        let size = BalloonView.size(for: text)
        panel.setContentSize(size)
        view.frame = CGRect(origin: .zero, size: size)
        view.needsDisplay = true
        if !panel.isVisible {
            panel.alphaValue = 0
            panel.orderFrontRegardless()
            NSAnimationContext.runAnimationGroup { $0.duration = 0.15; panel.animator().alphaValue = 1 }
        }
        hideWork?.cancel()
        let w = DispatchWorkItem { [weak self] in self?.hide() }
        hideWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: w)
    }

    func hide() {
        hideWork?.cancel()
        text = nil
        panel.orderOut(nil)
    }

    /// The tail's tip on `p` (the top of the cat's head); the balloon reaches off to the right,
    /// the way the cat faces, or to the left.
    func place(pointingAt p: CGPoint, toTheRight: Bool) {
        if view.toTheRight != toTheRight { view.toTheRight = toTheRight; view.needsDisplay = true }
        let w = panel.frame.width
        panel.setFrameOrigin(CGPoint(x: toTheRight ? p.x - BalloonView.tipInset : p.x - w + BalloonView.tipInset, y: p.y))
    }

    /// For `Guardia --snapshot`.
    static func image(_ text: String) -> CGImage? {
        let v = BalloonView()
        v.text = text
        v.frame = CGRect(origin: .zero, size: BalloonView.size(for: text))
        guard let rep = v.bitmapImageRepForCachingDisplay(in: v.bounds) else { return nil }
        v.cacheDisplay(in: v.bounds, to: rep)
        return rep.cgImage
    }
}

final class BalloonView: NSView {
    var text = ""
    var toTheRight = true
    static let tail: CGFloat = 11, pad: CGFloat = 12, tipInset: CGFloat = 6
    static var font: NSFont { Ink.font(13, weight: .bold) }

    static func size(for text: String) -> CGSize {
        let w = (text as NSString).size(withAttributes: [.font: font]).width
        return CGSize(width: ceil(w) + pad * 2 + 8, height: 31 + tail)
    }

    override func draw(_ dirty: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let s = Theme.light
        let body = CGRect(x: 4, y: BalloonView.tail, width: bounds.width - 8, height: bounds.height - BalloonView.tail - 4)
        let shape = Ink.paperShape(body, radius: body.height / 2, seed: text.count + 3, jitter: 0.5)
        // the tail: from the bottom edge near the corner down to the tip
        let bx = toTheRight ? body.minX + 17 : body.maxX - 17
        let tip = CGPoint(x: toTheRight ? BalloonView.tipInset : bounds.width - BalloonView.tipInset, y: 1.5)
        let root = [CGPoint(x: bx - 6.5, y: body.minY + 1), CGPoint(x: bx + 6.5, y: body.minY + 1)]
        Ink.fill(shape, s.paper, in: ctx)
        Ink.fill([root[0], tip, root[1]], s.paper, in: ctx)
        Ink.outline(shape, width: 2, color: s.ink, seed: 7, in: ctx)
        // paper over the edge where the tail joins, then the tail's two sides
        Ink.fill([CGPoint(x: bx - 6, y: body.minY + 4), CGPoint(x: bx + 6, y: body.minY + 4), CGPoint(x: bx + 6.5, y: body.minY - 2), CGPoint(x: bx - 6.5, y: body.minY - 2)], s.paper, in: ctx)
        Ink.stroke([root[0], tip], width: 2, color: s.ink, seed: 3, taper: 0.4, in: ctx)
        Ink.stroke([tip, root[1]], width: 2, color: s.ink, seed: 5, taper: 0.4, in: ctx)
        let attrs: [NSAttributedString.Key: Any] = [.font: BalloonView.font, .foregroundColor: s.ink]
        let ts = (text as NSString).size(withAttributes: attrs)
        (text as NSString).draw(at: CGPoint(x: body.midX - ts.width / 2, y: body.midY - ts.height / 2 + 0.5), withAttributes: attrs)
    }
}
