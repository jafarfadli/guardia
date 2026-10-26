import AppKit

// The "dynamic island" for a notch-less Mac: a paper tab hanging from the top centre,
// inked by hand, that grows to show what's happening (music, a focus timer, charging).
final class IslandController {
    enum Content: Equatable { case idle, music, timer, toast(String, String) } // toast(icon, text)

    let panel: NSPanel
    let view: IslandView
    private var hover = false
    private var toastUntil: Date?
    private var collapseWork: DispatchWorkItem?
    private var tick: Timer?
    var nowPlaying: NowPlaying.Track? { didSet { refresh() } }
    var timer: FocusTimer?
    var onMenu: ((NSView, NSPoint) -> Void)?
    var actions: (prev: () -> Void, play: () -> Void, next: () -> Void, focus: (Int, Bool) -> Void) = ({}, {}, {}, { _, _ in })

    init() {
        panel = NSPanel(contentRect: CGRect(x: 0, y: 0, width: 80, height: 30), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 2)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        panel.isMovable = false
        panel.hidesOnDeactivate = false
        view = IslandView(frame: panel.contentRect(forFrameRect: panel.frame))
        panel.contentView = view
        view.controller = self
    }

    func start() {
        layout(animated: false)
        panel.orderFrontRegardless()
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in self?.layout(animated: false) }
        tick = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.onTick() }
        tick?.tolerance = 0.03
    }

    // When a window covers the top centre (a maximised app), the quiet island steps behind
    // it like the bar does; anything worth seeing (a new song, a toast) brings it forward.
    private let frontLevel = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 2)
    private let backLevel = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
    private func updateLevel() {
        let wantsFront = hover || view.peek || toastUntil != nil
        var covered = false
        if !wantsFront, let screen = NSScreen.main,
           let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
            let zone = CGRect(x: screen.frame.midX - 120, y: 0, width: 240, height: 40) // CG coords: origin top-left
            let me = ProcessInfo.processInfo.processIdentifier
            for w in list {
                guard (w[kCGWindowLayer as String] as? Int) == 0, (w[kCGWindowOwnerPID as String] as? Int32) != me,
                      let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
                let r = CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
                if r.intersects(zone) && r.width > 200 { covered = true; break }
            }
        }
        let level = covered ? backLevel : frontLevel
        if panel.level != level { panel.level = level }
    }

    func stop() { panel.orderOut(nil); tick?.invalidate() }

    private var frameCount = 0
    private func onTick() {
        frameCount += 1
        if frameCount % 10 == 0 { updateLevel() }
        if let until = toastUntil, Date() > until { toastUntil = nil; refresh() }
        // redraw only while something is moving
        let moving = (nowPlaying?.playing ?? false) || timer?.running == true
        if moving && (frameCount % (hover ? 1 : 2) == 0) { view.needsDisplay = true }
    }

    var content: Content {
        if let t = view.toast, toastUntil != nil { return .toast(t.0, t.1) }
        if timer?.running == true { return .timer }
        if nowPlaying != nil { return .music }
        return .idle
    }

    var expanded: Bool { hover || (view.autoExpand && toastUntil != nil) }

    func showToast(icon: String, text: String, seconds: Double = 3.2, expand: Bool = false) {
        view.toast = (icon, text)
        view.autoExpand = expand
        toastUntil = Date().addingTimeInterval(seconds)
        refresh()
    }

    func trackChanged() {
        // a new song: open up for a moment so it registers, then fold back
        guard nowPlaying != nil, !hover else { refresh(); return }
        view.peek = true
        refresh()
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) { [weak self] in self?.view.peek = false; self?.refresh() }
    }

    func refresh() { layout(animated: true); view.needsDisplay = true; updateLevel() }

    func setHover(_ h: Bool) {
        collapseWork?.cancel()
        if h { hover = true; refresh(); return }
        let work = DispatchWorkItem { [weak self] in self?.hover = false; self?.refresh() }
        collapseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    }

    func targetSize() -> CGSize {
        let big = hover || view.peek
        switch content {
        case .idle: return hover ? CGSize(width: 330, height: 92) : CGSize(width: 64, height: 26)
        case .music: return big ? CGSize(width: 400, height: 116) : CGSize(width: min(320, 120 + view.titleWidth()), height: 30)
        case .timer: return hover ? CGSize(width: 300, height: 92) : CGSize(width: 150, height: 30)
        case .toast: return view.autoExpand ? CGSize(width: 320, height: 64) : CGSize(width: max(180, view.toastWidth() + 64), height: 30)
        }
    }

    func layout(animated: Bool) {
        guard let screen = NSScreen.main else { return }
        let s = targetSize()
        let shadowPad: CGFloat = 6
        let f = CGRect(x: screen.frame.midX - s.width / 2 - shadowPad, y: screen.frame.maxY - s.height - shadowPad,
                       width: s.width + shadowPad * 2, height: s.height + shadowPad)
        if f == panel.frame { return }
        if animated {
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.34
                ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.95, 0.25, 1.12)
                panel.animator().setFrame(f, display: true)
            }
        } else {
            panel.setFrame(f, display: true)
        }
    }
}

final class IslandView: NSView {
    weak var controller: IslandController?
    var toast: (String, String)?
    var autoExpand = false
    var peek = false
    private var tracking: NSTrackingArea?
    private var buttons: [(CGRect, () -> Void)] = []
    private let pad: CGFloat = 6

    override var isFlipped: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        if let tracking { removeTrackingArea(tracking) }
        let t = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        addTrackingArea(t); tracking = t
    }
    override func mouseEntered(with event: NSEvent) { controller?.setHover(true) }
    override func mouseExited(with event: NSEvent) { controller?.setHover(false) }

    override func mouseDown(with event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        for (r, act) in buttons where r.insetBy(dx: -4, dy: -4).contains(p) { act(); needsDisplay = true; return }
        if case .idle = controller?.content { controller?.onMenu?(self, p) }
    }
    override func rightMouseDown(with event: NSEvent) { controller?.onMenu?(self, convert(event.locationInWindow, from: nil)) }

    var scheme: Scheme { effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? Theme.dark : Theme.light }

    func titleWidth() -> CGFloat {
        guard let t = controller?.nowPlaying else { return 0 }
        let s = NSAttributedString(string: "\(t.title) — \(t.artist)", attributes: [.font: Ink.font(13, weight: .semibold)])
        return min(220, s.size().width)
    }
    func toastWidth() -> CGFloat {
        guard let t = toast else { return 0 }
        return NSAttributedString(string: t.1, attributes: [.font: Ink.font(13, weight: .semibold)]).size().width
    }

    // ------------------------------------------------------------------ drawing
    // The paper (shadow, fibres, inked edge) only changes with size and appearance: cache it.
    private var paperCache: (key: String, image: CGImage)?
    private func paper(_ sc: Scheme, scale: CGFloat) -> CGImage? {
        let key = "\(Int(bounds.width))x\(Int(bounds.height))@\(scale)-\(sc.paper.description.hashValue)"
        if let c = paperCache, c.key == key { return c.image }
        let w = Int(bounds.width * scale), h = Int(bounds.height * scale)
        guard w > 0, h > 0, let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                               space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.scaleBy(x: scale, y: scale)
        ctx.translateBy(x: 0, y: bounds.height); ctx.scaleBy(x: 1, y: -1) // match the flipped view
        drawPaper(ctx, sc)
        guard let img = ctx.makeImage() else { return nil }
        paperCache = (key, img)
        return img
    }

    private func drawPaper(_ ctx: CGContext, _ sc: Scheme) {
        let tab = CGRect(x: pad, y: -2, width: bounds.width - pad * 2, height: bounds.height - pad + 2)
        // stepped shadow: one hard step, blue-grey, offset down
        let shadowPts = Ink.paperShape(tab.offsetBy(dx: 0, dy: 3.5), radius: 13, seed: 4, jitter: 0.4, squareTop: true)
        Ink.fill(shadowPts, sc.shadow.withAlphaComponent(0.42), in: ctx)
        let shape = Ink.paperShape(tab, radius: 13, seed: 7, jitter: 0.5, squareTop: true)
        Ink.fill(shape, sc.paper, in: ctx)
        // paper fibres
        ctx.saveGState()
        ctx.beginPath(); ctx.move(to: shape[0]); for q in shape.dropFirst() { ctx.addLine(to: q) }; ctx.closePath(); ctx.clip()
        var seed = 11
        for _ in 0..<Int(tab.width * tab.height / 140) {
            seed &+= 1
            let x = tab.minX + CGFloat((Ink.hash(seed) + 1) / 2) * tab.width
            let y = tab.minY + CGFloat((Ink.hash(seed &* 3) + 1) / 2) * tab.height
            ctx.setFillColor(sc.ink.withAlphaComponent(0.06 + 0.06 * CGFloat(abs(Ink.hash(seed &* 7)))).cgColor)
            ctx.fill(CGRect(x: x, y: y, width: 1.1, height: 0.7))
        }
        ctx.restoreGState()
        // ink the sides and bottom (the top is the screen edge)
        let inked = shape.filter { $0.y > tab.minY + 1.5 }
        Ink.stroke(inked + [inked.first ?? .zero], width: 1.7, color: sc.ink, seed: 21, taper: 0.25, in: ctx)
    }

    override func draw(_ dirty: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext, let c = controller else { return }
        buttons.removeAll()
        let sc = scheme
        let tab = CGRect(x: pad, y: -2, width: bounds.width - pad * 2, height: bounds.height - pad + 2)
        let scale = window?.backingScaleFactor ?? 2
        if let img = paper(sc, scale: scale) {
            ctx.saveGState()
            ctx.translateBy(x: 0, y: bounds.height); ctx.scaleBy(x: 1, y: -1)
            ctx.draw(img, in: bounds)
            ctx.restoreGState()
        } else {
            drawPaper(ctx, sc)
        }

        let inner = tab.insetBy(dx: 14, dy: 0)
        switch c.content {
        case .idle: drawIdle(ctx, inner, sc, expanded: bounds.height > 50)
        case .music: drawMusic(ctx, inner, sc, expanded: bounds.height > 60)
        case .timer: drawTimer(ctx, inner, sc, expanded: bounds.height > 50)
        case .toast(let icon, let text): drawToast(ctx, inner, sc, icon: icon, text: text)
        }
    }

    private func text(_ s: String, _ font: NSFont, _ color: NSColor, at p: CGPoint, maxWidth: CGFloat = 1000) {
        let para = NSMutableParagraphStyle(); para.lineBreakMode = .byTruncatingTail
        NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: para])
            .draw(with: CGRect(x: p.x, y: p.y, width: maxWidth, height: font.pointSize * 1.6), options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
    }

    private func catDoodle(_ ctx: CGContext, center c: CGPoint, size s: CGFloat, color: NSColor, asleep: Bool) {
        // two ears, a round head, eyes as ink ticks
        let head = (0..<24).map { i -> CGPoint in let a = CGFloat(i) / 24 * .pi * 2; return CGPoint(x: c.x + cos(a) * s, y: c.y + sin(a) * s * 0.82) }
        Ink.fill(head, Theme.mustard, in: ctx)
        Ink.fill([CGPoint(x: c.x - s * 0.85, y: c.y - s * 0.2), CGPoint(x: c.x - s * 0.7, y: c.y - s * 1.25), CGPoint(x: c.x - s * 0.15, y: c.y - s * 0.75)], Theme.mustard, in: ctx)
        Ink.fill([CGPoint(x: c.x + s * 0.85, y: c.y - s * 0.2), CGPoint(x: c.x + s * 0.7, y: c.y - s * 1.25), CGPoint(x: c.x + s * 0.15, y: c.y - s * 0.75)], Theme.mustard, in: ctx)
        Ink.stroke([CGPoint(x: c.x - s * 0.15, y: c.y - s * 0.75), CGPoint(x: c.x - s * 0.7, y: c.y - s * 1.25), CGPoint(x: c.x - s * 0.9, y: c.y - s * 0.1)], width: 1.4, color: color, seed: 3, in: ctx)
        Ink.stroke([CGPoint(x: c.x + s * 0.15, y: c.y - s * 0.75), CGPoint(x: c.x + s * 0.7, y: c.y - s * 1.25), CGPoint(x: c.x + s * 0.9, y: c.y - s * 0.1)], width: 1.4, color: color, seed: 4, in: ctx)
        Ink.stroke(Array(head[2...22]), width: 1.4, color: color, seed: 5, taper: 0.2, in: ctx)
        for dx in [-0.38, 0.38] as [CGFloat] {
            if asleep {
                Ink.stroke([CGPoint(x: c.x + dx * s - s * 0.18, y: c.y), CGPoint(x: c.x + dx * s, y: c.y + s * 0.14), CGPoint(x: c.x + dx * s + s * 0.18, y: c.y)], width: 1.2, color: color, seed: 6, in: ctx)
            } else {
                ctx.setFillColor(color.cgColor); ctx.fillEllipse(in: CGRect(x: c.x + dx * s - 1.4, y: c.y - 1.8, width: 2.8, height: 3.6))
            }
        }
    }

    private func drawIdle(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme, expanded: Bool) {
        if !expanded {
            catDoodle(ctx, center: CGPoint(x: bounds.midX, y: 14), size: 7, color: sc.ink, asleep: true)
            return
        }
        catDoodle(ctx, center: CGPoint(x: r.minX + 14, y: 22), size: 9, color: sc.ink, asleep: false)
        let df = DateFormatter(); df.locale = Locale(identifier: "id_ID"); df.dateFormat = "EEEE, d MMMM"
        text(df.string(from: Date()), Ink.font(15, weight: .bold), sc.ink, at: CGPoint(x: r.minX + 34, y: 10))
        text("mau fokus berapa lama?", Ink.font(12, weight: .medium), sc.inkSoft, at: CGPoint(x: r.minX + 34, y: 30))
        let items: [(String, Int, Bool)] = [("Fokus 25", 25, false), ("Fokus 50", 50, false), ("Istirahat 5", 5, true)]
        var x = r.minX
        for (label, mins, rest) in items {
            let w = NSAttributedString(string: label, attributes: [.font: Ink.font(12, weight: .bold)]).size().width + 24
            let b = CGRect(x: x, y: 56, width: w, height: 24)
            pill(ctx, b, label, fill: rest ? Theme.teal.withAlphaComponent(0.2) : Theme.mustard.withAlphaComponent(0.28), sc: sc, seed: mins)
            buttons.append((b, { [weak self] in self?.controller?.actions.focus(mins, rest) }))
            x += w + 8
        }
    }

    private func pill(_ ctx: CGContext, _ b: CGRect, _ label: String, fill: NSColor, sc: Scheme, seed: Int) {
        let pts = Ink.paperShape(b, radius: 11, seed: seed, jitter: 0.35)
        Ink.fill(pts, fill, in: ctx)
        Ink.stroke(pts + [pts[0]], width: 1.2, color: sc.ink, seed: seed, taper: 0.1, in: ctx)
        text(label, Ink.font(12, weight: .bold), sc.ink, at: CGPoint(x: b.minX + 12, y: b.minY + 4))
    }

    private func cover(_ ctx: CGContext, _ img: CGImage?, in r: CGRect, sc: Scheme) {
        ctx.saveGState()
        ctx.setFillColor(sc.shadow.withAlphaComponent(0.35).cgColor)
        ctx.fill(r.offsetBy(dx: 2, dy: 2.5))
        if let img {
            ctx.interpolationQuality = .none
            ctx.translateBy(x: r.minX, y: r.maxY); ctx.scaleBy(x: 1, y: -1)
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: r.width, height: r.height))
        } else {
            // no cover: a little ink record
            ctx.setFillColor(Theme.navy.cgColor); ctx.fill(r)
            ctx.setFillColor(sc.ink.cgColor); ctx.fillEllipse(in: r.insetBy(dx: r.width * 0.12, dy: r.height * 0.12))
            ctx.setFillColor(Theme.mutedRed.cgColor); ctx.fillEllipse(in: r.insetBy(dx: r.width * 0.36, dy: r.height * 0.36))
        }
        ctx.restoreGState()
        let box = [CGPoint(x: r.minX, y: r.minY), CGPoint(x: r.maxX, y: r.minY), CGPoint(x: r.maxX, y: r.maxY), CGPoint(x: r.minX, y: r.maxY), CGPoint(x: r.minX, y: r.minY)]
        Ink.stroke(box, width: 1.3, color: sc.ink, seed: 31, taper: 0.1, in: ctx)
    }

    private func eq(_ ctx: CGContext, at p: CGPoint, sc: Scheme, playing: Bool) {
        let t = Date().timeIntervalSinceReferenceDate
        for i in 0..<3 {
            let h: CGFloat = playing ? CGFloat(4 + 7 * abs(sin(t * (5.3 + Double(i) * 1.7) + Double(i)))) : 3
            Ink.stroke([CGPoint(x: p.x + CGFloat(i) * 5, y: p.y), CGPoint(x: p.x + CGFloat(i) * 5, y: p.y - h)], width: 2.6, color: sc.accent, seed: i, taper: 0.1, in: ctx)
        }
    }

    private func drawMusic(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme, expanded: Bool) {
        guard let c = controller, let t = c.nowPlaying else { return }
        if !expanded {
            cover(ctx, t.art, in: CGRect(x: r.minX, y: 6, width: 16, height: 16), sc: sc)
            text("\(t.title) — \(t.artist)", Ink.font(13, weight: .semibold), sc.ink, at: CGPoint(x: r.minX + 24, y: 5), maxWidth: r.width - 46)
            eq(ctx, at: CGPoint(x: r.maxX - 12, y: 20), sc: sc, playing: t.playing)
            return
        }
        let art = CGRect(x: r.minX, y: 14, width: 84, height: 84)
        cover(ctx, t.art, in: art, sc: sc)
        let x = art.maxX + 16, w = r.maxX - x
        text(t.title, Ink.font(16, weight: .bold), sc.ink, at: CGPoint(x: x, y: 12), maxWidth: w - 24)
        text(t.artist, Ink.font(13, weight: .medium), sc.inkSoft, at: CGPoint(x: x, y: 33), maxWidth: w)
        eq(ctx, at: CGPoint(x: r.maxX - 12, y: 28), sc: sc, playing: t.playing)
        // progress: an ink rule with a mustard run and a knot at the playhead
        let y: CGFloat = 62
        let p = t.duration > 0 ? CGFloat(t.currentPosition / t.duration) : 0
        Ink.stroke([CGPoint(x: x, y: y), CGPoint(x: r.maxX, y: y)], width: 1.1, color: sc.inkSoft, seed: 41, taper: 0.2, in: ctx)
        Ink.stroke([CGPoint(x: x, y: y), CGPoint(x: x + w * p, y: y)], width: 3.2, color: Theme.mustard, seed: 42, taper: 0.1, in: ctx)
        ctx.setFillColor(sc.ink.cgColor); ctx.fillEllipse(in: CGRect(x: x + w * p - 3, y: y - 3, width: 6, height: 6))
        let fmt = { (s: Double) -> String in String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
        text(fmt(t.currentPosition), Ink.font(11, weight: .medium), sc.inkSoft, at: CGPoint(x: x, y: 67))
        let total = fmt(t.duration)
        let tw = NSAttributedString(string: total, attributes: [.font: Ink.font(11, weight: .medium)]).size().width
        text(total, Ink.font(11, weight: .medium), sc.inkSoft, at: CGPoint(x: r.maxX - tw, y: 67))
        // controls
        let cy: CGFloat = 92, cx = x + w / 2
        let prev = CGRect(x: cx - 64, y: cy - 10, width: 28, height: 20)
        let play = CGRect(x: cx - 15, y: cy - 12, width: 30, height: 24)
        let next = CGRect(x: cx + 36, y: cy - 10, width: 28, height: 20)
        drawPrev(ctx, prev, sc); drawNext(ctx, next, sc)
        if t.playing { drawPause(ctx, play, sc) } else { drawPlay(ctx, play, sc) }
        buttons.append((prev, { c.actions.prev() }))
        buttons.append((play, { c.actions.play() }))
        buttons.append((next, { c.actions.next() }))
    }

    private func tri(_ ctx: CGContext, _ pts: [CGPoint], _ sc: Scheme, _ seed: Int) {
        Ink.fill(pts, sc.ink, in: ctx)
        Ink.stroke(pts + [pts[0]], width: 1.2, color: sc.ink, seed: seed, taper: 0, in: ctx)
    }
    private func drawPlay(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme) {
        tri(ctx, [CGPoint(x: r.midX - 6, y: r.minY + 3), CGPoint(x: r.midX + 8, y: r.midY), CGPoint(x: r.midX - 6, y: r.maxY - 3)], sc, 51)
    }
    private func drawPause(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme) {
        for dx in [-4.5, 4.5] as [CGFloat] { Ink.stroke([CGPoint(x: r.midX + dx, y: r.minY + 3), CGPoint(x: r.midX + dx, y: r.maxY - 3)], width: 4, color: sc.ink, seed: Int(dx), taper: 0.1, in: ctx) }
    }
    private func drawPrev(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme) {
        tri(ctx, [CGPoint(x: r.midX + 6, y: r.minY + 4), CGPoint(x: r.midX - 5, y: r.midY), CGPoint(x: r.midX + 6, y: r.maxY - 4)], sc, 52)
        Ink.stroke([CGPoint(x: r.midX - 7, y: r.minY + 4), CGPoint(x: r.midX - 7, y: r.maxY - 4)], width: 2.2, color: sc.ink, seed: 53, taper: 0, in: ctx)
    }
    private func drawNext(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme) {
        tri(ctx, [CGPoint(x: r.midX - 6, y: r.minY + 4), CGPoint(x: r.midX + 5, y: r.midY), CGPoint(x: r.midX - 6, y: r.maxY - 4)], sc, 54)
        Ink.stroke([CGPoint(x: r.midX + 7, y: r.minY + 4), CGPoint(x: r.midX + 7, y: r.maxY - 4)], width: 2.2, color: sc.ink, seed: 55, taper: 0, in: ctx)
    }

    private func drawTimer(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme, expanded: Bool) {
        guard let t = controller?.timer else { return }
        let left = max(0, t.remaining)
        let s = String(format: "%02d:%02d", Int(left) / 60, Int(left) % 60)
        let mono = NSFont(name: Theme.mono, size: expanded ? 30 : 14) ?? NSFont.monospacedDigitSystemFont(ofSize: expanded ? 30 : 14, weight: .bold)
        let label = t.isRest ? "istirahat" : "fokus"
        if !expanded {
            hourglass(ctx, CGPoint(x: r.minX + 6, y: 15), 6, sc)
            text(s, mono, sc.ink, at: CGPoint(x: r.minX + 20, y: 5))
            text(label, Ink.font(12, weight: .semibold), sc.inkSoft, at: CGPoint(x: r.minX + 70, y: 7))
            return
        }
        hourglass(ctx, CGPoint(x: r.minX + 10, y: 34), 11, sc)
        text(s, mono, sc.ink, at: CGPoint(x: r.minX + 34, y: 12))
        text(label, Ink.font(13, weight: .semibold), sc.inkSoft, at: CGPoint(x: r.minX + 140, y: 16))
        // progress rule
        let p = CGFloat(1 - left / max(1, t.total))
        Ink.stroke([CGPoint(x: r.minX, y: 60), CGPoint(x: r.maxX, y: 60)], width: 1.1, color: sc.inkSoft, seed: 61, taper: 0.2, in: ctx)
        Ink.stroke([CGPoint(x: r.minX, y: 60), CGPoint(x: r.minX + r.width * p, y: 60)], width: 3.2, color: t.isRest ? Theme.teal : Theme.terracotta, seed: 62, taper: 0.1, in: ctx)
        let stop = CGRect(x: r.maxX - 74, y: 66, width: 74, height: 22)
        pill(ctx, stop, "berhenti", fill: Theme.mutedRed.withAlphaComponent(0.18), sc: sc, seed: 63)
        buttons.append((stop, { [weak self] in self?.controller?.timer?.stop() }))
    }

    private func hourglass(_ ctx: CGContext, _ c: CGPoint, _ s: CGFloat, _ sc: Scheme) {
        let pts = [CGPoint(x: c.x - s * 0.7, y: c.y - s), CGPoint(x: c.x + s * 0.7, y: c.y - s), CGPoint(x: c.x, y: c.y),
                   CGPoint(x: c.x + s * 0.7, y: c.y + s), CGPoint(x: c.x - s * 0.7, y: c.y + s), CGPoint(x: c.x, y: c.y)]
        Ink.fill([pts[2], pts[3], pts[4]], Theme.mustard, in: ctx)
        Ink.stroke(pts + [pts[0]], width: 1.3, color: sc.ink, seed: 71, taper: 0, in: ctx)
    }

    private func drawToast(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme, icon: String, text s: String) {
        let big = bounds.height > 50
        let cy: CGFloat = big ? 28 : 15
        switch icon {
        case "plug": battery(ctx, CGPoint(x: r.minX + 10, y: cy), sc, charging: true)
        case "low": battery(ctx, CGPoint(x: r.minX + 10, y: cy), sc, charging: false)
        case "bell": hourglass(ctx, CGPoint(x: r.minX + 8, y: cy), big ? 10 : 6, sc)
        default: catDoodle(ctx, center: CGPoint(x: r.minX + 9, y: cy + 1), size: 7, color: sc.ink, asleep: false)
        }
        text(s, Ink.font(big ? 16 : 13, weight: .bold), sc.ink, at: CGPoint(x: r.minX + 28, y: cy - (big ? 11 : 9)))
    }

    private func battery(_ ctx: CGContext, _ c: CGPoint, _ sc: Scheme, charging: Bool) {
        let body = CGRect(x: c.x - 9, y: c.y - 5, width: 16, height: 10)
        let pct = CGFloat(Power.read().percent) / 100
        ctx.setFillColor((charging ? Theme.olive : Theme.mutedRed).cgColor)
        ctx.fill(CGRect(x: body.minX + 1.5, y: body.minY + 1.5, width: (body.width - 3) * pct, height: body.height - 3))
        let box = [CGPoint(x: body.minX, y: body.minY), CGPoint(x: body.maxX, y: body.minY), CGPoint(x: body.maxX, y: body.maxY), CGPoint(x: body.minX, y: body.maxY), CGPoint(x: body.minX, y: body.minY)]
        Ink.stroke(box, width: 1.3, color: sc.ink, seed: 81, taper: 0, in: ctx)
        Ink.stroke([CGPoint(x: body.maxX + 2, y: c.y - 2), CGPoint(x: body.maxX + 2, y: c.y + 2)], width: 2, color: sc.ink, seed: 82, taper: 0, in: ctx)
    }
}
