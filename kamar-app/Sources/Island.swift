import AppKit

// A panel that can take the keyboard without making Kamar the active app (like Spotlight),
// but only while the search is open.
final class IslandPanel: NSPanel {
    var acceptsKeys = false
    override var canBecomeKey: Bool { acceptsKeys }
}

// The "dynamic island" for a notch-less Mac: a paper tab hanging from the top centre, inked
// by hand. Folded, it shows the time and the battery with whatever is going on between them
// (a song, a timer, a note). Click it to search; it also rings alarms and shows si Oren's
// focus-mode visits.
final class IslandController: NSObject, NSWindowDelegate, NSTextFieldDelegate {
    enum Content: Equatable { case status, music, timer, toast, search, ring, visit }

    let panel: IslandPanel
    let view: IslandView
    let field = NSTextField()
    private var hover = false
    private var toastUntil: Date?
    private var collapseWork: DispatchWorkItem?
    private var tick: Timer?
    private var keyMonitor: Any?
    var nowPlaying: NowPlaying.Track? { didSet { refresh() } }
    var timer: FocusTimer?
    var launcher: Launcher?
    var power = Power.read() { didSet { if power != oldValue { refresh() } } }
    var focusOn = false { didSet { if focusOn != oldValue { refresh() } } }
    var onMenu: ((NSView, NSPoint) -> Void)?
    var actions: (prev: () -> Void, play: () -> Void, next: () -> Void) = ({}, {}, {})

    private(set) var searching = false
    private(set) var results: [Command] = []
    var selected = 0
    private(set) var ringing: (title: String, subtitle: String, action: (label: String, run: () -> Void)?, dismiss: () -> Void)?
    private(set) var visit: (site: String, deadline: Date, seconds: Double, allow: () -> Void)?

    override init() {
        panel = IslandPanel(contentRect: CGRect(x: 0, y: 0, width: 80, height: 30), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 2)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        panel.isMovable = false
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = false
        view = IslandView(frame: panel.contentRect(forFrameRect: panel.frame))
        panel.contentView = view
        super.init()
        panel.delegate = self
        view.controller = self
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.font = Ink.font(16, weight: .semibold)
        field.delegate = self
        field.cell?.isScrollable = true
        field.cell?.wraps = false
        field.isHidden = true
        view.addSubview(field)
    }

    func start() {
        layout(animated: false)
        panel.orderFrontRegardless()
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in self?.layout(animated: false) }
        tick = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.onTick() }
        tick?.tolerance = 0.03
    }

    // When a window covers the top centre (a maximised app), the quiet island steps behind
    // it; anything worth seeing (a new song, a toast, an alarm) brings it forward.
    private let frontLevel = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 2)
    private let backLevel = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
    private func updateLevel() {
        let wantsFront = hover || view.peek || toastUntil != nil || searching || ringing != nil || visit != nil
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
    private var shownMinute = -1
    private func onTick() {
        frameCount += 1
        if frameCount % 10 == 0 {
            updateLevel()
            let m = Calendar.current.component(.minute, from: Date())
            if m != shownMinute { shownMinute = m; view.needsDisplay = true }
        }
        if let until = toastUntil, Date() > until { toastUntil = nil; refresh() }
        // redraw only while something moves: a playing song, a running timer, a countdown
        let moving = (nowPlaying?.playing ?? false) || timer?.running == true || visit != nil
        if moving && !searching && (frameCount % (hover || visit != nil ? 1 : 2) == 0) { view.needsDisplay = true }
    }

    var content: Content {
        if searching { return .search }
        if ringing != nil { return .ring }
        if visit != nil { return .visit }
        if view.toast != nil, toastUntil != nil, view.autoExpand { return .toast }
        if hover, timer?.running == true { return .timer }
        if hover || view.peek, nowPlaying != nil { return .music }
        return .status
    }

    func showToast(icon: String, text: String, seconds: Double = 3.2, expand: Bool = false) {
        view.toast = (icon, text)
        view.autoExpand = expand
        toastUntil = Date().addingTimeInterval(seconds)
        refresh()
    }
    var toastShowing: Bool { toastUntil != nil && view.toast != nil }

    func trackChanged() {
        // a new song: open up for a moment so it registers, then fold back
        guard nowPlaying != nil, !hover, !searching else { refresh(); return }
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

    // ------------------------------------------------------------------ ringing and visits
    func ring(title: String, subtitle: String, action: (label: String, run: () -> Void)?, dismiss: @escaping () -> Void) {
        if searching { closeSearch() }
        ringing = (title, subtitle, action, dismiss)
        refresh()
    }
    func endRing() { ringing = nil; refresh() }

    func showGuard(site: String, seconds: Double, allow: @escaping () -> Void) {
        visit = (site, Date().addingTimeInterval(seconds), seconds, allow)
        refresh()
    }
    func endGuard() { visit = nil; refresh() }

    // ------------------------------------------------------------------ search
    func openSearch() {
        guard !searching, let launcher else { return }
        searching = true
        hover = false
        launcher.enter(.root)
        field.stringValue = ""
        updateResults()
        layout(animated: true)
        field.isHidden = false
        panel.acceptsKeys = true
        panel.level = frontLevel
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(field)
        // ⌘↵ never reaches the text field as a command, so catch it here
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
            guard let self, self.searching, e.keyCode == 36 || e.keyCode == 76, e.modifierFlags.contains(.command) else { return e }
            self.runSelected(alt: true)
            return nil
        }
        view.needsDisplay = true
    }

    func closeSearch() {
        guard searching else { return }
        searching = false
        field.isHidden = true
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        keyMonitor = nil
        panel.acceptsKeys = false
        // hand the keyboard back to the app you were in
        panel.orderOut(nil)
        panel.orderFrontRegardless()
        launcher?.enter(.root)
        refresh()
    }

    func windowDidResignKey(_ notification: Notification) { if searching { closeSearch() } }

    /// For `Kamar --snapshot`: the search as it looks with `q` typed, without taking the keyboard.
    func previewSearch(_ q: String, list: Launcher.List = .root) {
        searching = true
        launcher?.enter(list)
        field.stringValue = q
        field.isHidden = false
        selected = 0
        updateResults()
    }

    func endPreviewSearch() { searching = false; field.isHidden = true; launcher?.enter(.root) }

    func updateResults() {
        results = launcher?.results(field.stringValue) ?? []
        selected = min(selected, max(0, results.count - 1))
        if field.stringValue.isEmpty { selected = 0 }
        view.needsDisplay = true
        layout(animated: true)
    }

    func controlTextDidChange(_ obj: Notification) { selected = 0; updateResults() }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy sel: Selector) -> Bool {
        switch sel {
        case #selector(NSResponder.moveUp(_:)): move(-1); return true
        case #selector(NSResponder.moveDown(_:)), #selector(NSResponder.insertTab(_:)): move(1); return true
        case #selector(NSResponder.insertNewline(_:)): runSelected(alt: false); return true
        case #selector(NSResponder.cancelOperation(_:)):
            if launcher?.list == .claude { launcher?.enter(.root); field.stringValue = ""; updateResults() } else { closeSearch() }
            return true
        default: return false
        }
    }

    func move(_ d: Int) {
        guard !results.isEmpty else { return }
        selected = (selected + d + results.count) % results.count
        view.needsDisplay = true
    }

    func runSelected(alt: Bool) {
        guard selected < results.count else { return }
        let c = results[selected]
        if alt {
            guard let a = c.alt else { return }
            closeSearch(); a(); return
        }
        if c.keepOpen {
            c.run()
            selected = 0
            updateResults()
            panel.makeFirstResponder(field)
            field.currentEditor()?.moveToEndOfDocument(nil)
            return
        }
        closeSearch()
        c.run()
    }

    func fill(_ text: String) {
        field.stringValue = text
        field.currentEditor()?.moveToEndOfDocument(nil)
    }

    // ------------------------------------------------------------------ size and place
    func targetSize() -> CGSize {
        switch content {
        case .search:
            let rows = max(1, results.count)
            return CGSize(width: 560, height: 58 + CGFloat(rows) * 40 + 30)
        case .ring: return CGSize(width: 380, height: 104)
        case .visit: return CGSize(width: 390, height: 96)
        case .toast: return CGSize(width: 340, height: 64)
        case .music: return CGSize(width: 400, height: 116)
        case .timer: return CGSize(width: 300, height: 92)
        case .status: return CGSize(width: view.statusWidth(), height: 30)
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
                ctx.duration = 0.3
                ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.95, 0.25, 1.08)
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
    private var rows: [CGRect] = []
    private let pad: CGFloat = 6

    override var isFlipped: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        if let tracking { removeTrackingArea(tracking) }
        let t = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect], owner: self)
        addTrackingArea(t); tracking = t
    }
    override func mouseEntered(with event: NSEvent) { controller?.setHover(true) }
    override func mouseExited(with event: NSEvent) { controller?.setHover(false) }
    override func mouseMoved(with event: NSEvent) {
        guard let c = controller, c.searching else { return }
        let p = convert(event.locationInWindow, from: nil)
        if let i = rows.firstIndex(where: { $0.contains(p) }), i != c.selected { c.selected = i; needsDisplay = true }
    }

    override func mouseDown(with event: NSEvent) {
        guard let c = controller else { return }
        let p = convert(event.locationInWindow, from: nil)
        for (r, act) in buttons where r.insetBy(dx: -4, dy: -4).contains(p) { act(); needsDisplay = true; return }
        if c.searching {
            if let i = rows.firstIndex(where: { $0.contains(p) }) { c.selected = i; c.runSelected(alt: event.modifierFlags.contains(.command)) }
            return
        }
        if c.ringing != nil || c.visit != nil { return }
        c.openSearch()
    }
    override func rightMouseDown(with event: NSEvent) { controller?.onMenu?(self, convert(event.locationInWindow, from: nil)) }

    var scheme: Scheme { effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? Theme.dark : Theme.light }

    private func width(_ s: String, _ f: NSFont) -> CGFloat { NSAttributedString(string: s, attributes: [.font: f]).size().width }
    private var timeFont: NSFont { Ink.font(13, weight: .bold) }
    private var smallFont: NSFont { Ink.font(12, weight: .semibold) }
    private var monoSmall: NSFont { NSFont(name: Theme.mono, size: 13) ?? NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .bold) }
    private static let hhmm: DateFormatter = { let f = DateFormatter(); f.dateFormat = "HH.mm"; return f }()

    // ------------------------------------------------------------------ the folded status
    private enum Middle { case toast(String, String), timer, music, cat }
    private var middle: Middle {
        guard let c = controller else { return .cat }
        if let t = toast, c.toastShowing, !autoExpand { return .toast(t.0, t.1) }
        if c.timer?.running == true { return .timer }
        if c.nowPlaying != nil { return .music }
        return .cat
    }

    private func middleWidth() -> CGFloat {
        guard let c = controller else { return 18 }
        switch middle {
        case .toast(_, let s): return 22 + min(230, width(s, smallFont))
        case .timer: return 16 + width(Launcher.clock(c.timer?.remaining ?? 0), monoSmall) + 8 + min(90, width(c.timer?.name ?? "", smallFont))
        case .music:
            let t = c.nowPlaying!
            return 22 + min(190, width("\(t.title) — \(t.artist)", smallFont)) + 22
        case .cat: return 18
        }
    }

    func statusWidth() -> CGFloat {
        let time = width("00.00", timeFont)
        let pct = width("100%", smallFont)
        return pad * 2 + 16 + time + 14 + middleWidth() + 14 + 22 + pct + 16
    }

    private func drawStatus(_ ctx: CGContext, _ sc: Scheme) {
        guard let c = controller else { return }
        let y: CGFloat = 6
        let pct = "\(c.power.percent)%"
        let pw = width(pct, smallFont)
        let bx = bounds.width - pad - 16 - pw - 22
        text(IslandView.hhmm.string(from: Date()), timeFont, sc.ink, at: CGPoint(x: pad + 16, y: y - 0.5))
        // whatever is going on sits centred between the time and the battery
        let left = pad + 16 + width("00.00", timeFont)
        let x = left + (bx - left - middleWidth()) / 2
        switch middle {
        case .toast(let icon, let s):
            toastIcon(ctx, icon, CGPoint(x: x + 8, y: 15), sc, small: true)
            text(s, smallFont, sc.ink, at: CGPoint(x: x + 22, y: y), maxWidth: 230)
        case .timer:
            if let t = c.timer {
                hourglass(ctx, CGPoint(x: x + 5, y: 15), 5.5, sc)
                let clock = Launcher.clock(t.remaining)
                text(clock, monoSmall, sc.ink, at: CGPoint(x: x + 16, y: y - 0.5))
                text(t.name, smallFont, sc.inkSoft, at: CGPoint(x: x + 16 + width(clock, monoSmall) + 8, y: y), maxWidth: 90)
            }
        case .music:
            if let t = c.nowPlaying {
                cover(ctx, t.art, in: CGRect(x: x, y: 7, width: 15, height: 15), sc: sc)
                let w = min(190, width("\(t.title) — \(t.artist)", smallFont))
                text("\(t.title) — \(t.artist)", smallFont, sc.ink, at: CGPoint(x: x + 22, y: y), maxWidth: w + 2)
                eq(ctx, at: CGPoint(x: x + 22 + w + 8, y: 20), sc: sc, playing: t.playing, small: true)
            }
        case .cat:
            // awake and watching while focus mode is on
            catDoodle(ctx, center: CGPoint(x: x + 9, y: 15), size: 6.5, color: sc.ink, asleep: !c.focusOn)
        }
        battery(ctx, CGPoint(x: bx + 9, y: 15), sc, state: c.power)
        text(pct, smallFont, c.power.percent <= 20 && !c.power.onAC ? Theme.mutedRed : sc.ink, at: CGPoint(x: bx + 22, y: y))
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
        rows.removeAll()
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
        case .status: drawStatus(ctx, sc)
        case .music: drawMusic(ctx, inner, sc)
        case .timer: drawTimer(ctx, inner, sc)
        case .toast: if let t = toast { drawToast(ctx, inner, sc, icon: t.0, text: t.1) }
        case .search: drawSearch(ctx, inner, sc)
        case .ring: drawRing(ctx, inner, sc)
        case .visit: drawVisit(ctx, inner, sc)
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
                ctx.setFillColor(color.cgColor); ctx.fillEllipse(in: CGRect(x: c.x + dx * s - 1.2, y: c.y - 1.6, width: 2.4, height: 3.2))
            }
        }
    }

    private func pill(_ ctx: CGContext, _ b: CGRect, _ label: String, fill: NSColor, sc: Scheme, seed: Int) {
        let pts = Ink.paperShape(b, radius: 11, seed: seed, jitter: 0.35)
        Ink.fill(pts, fill, in: ctx)
        Ink.stroke(pts + [pts[0]], width: 1.2, color: sc.ink, seed: seed, taper: 0.1, in: ctx)
        let f = Ink.font(12, weight: .bold)
        text(label, f, sc.ink, at: CGPoint(x: b.midX - width(label, f) / 2, y: b.minY + 4))
    }

    private func pillWidth(_ label: String) -> CGFloat { width(label, Ink.font(12, weight: .bold)) + 26 }

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

    private func eq(_ ctx: CGContext, at p: CGPoint, sc: Scheme, playing: Bool, small: Bool = false) {
        let t = Date().timeIntervalSinceReferenceDate
        let k: CGFloat = small ? 0.75 : 1
        for i in 0..<3 {
            let h: CGFloat = playing ? CGFloat(4 + 7 * abs(sin(t * (5.3 + Double(i) * 1.7) + Double(i)))) * k : 3
            Ink.stroke([CGPoint(x: p.x + CGFloat(i) * 5 * k, y: p.y), CGPoint(x: p.x + CGFloat(i) * 5 * k, y: p.y - h)], width: 2.6 * k, color: sc.accent, seed: i, taper: 0.1, in: ctx)
        }
    }

    private func drawMusic(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme) {
        guard let c = controller, let t = c.nowPlaying else { return }
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
        text(total, Ink.font(11, weight: .medium), sc.inkSoft, at: CGPoint(x: r.maxX - width(total, Ink.font(11, weight: .medium)), y: 67))
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

    private func drawTimer(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme) {
        guard let t = controller?.timer else { return }
        let left = max(0, t.remaining)
        let s = Launcher.clock(left)
        let mono = NSFont(name: Theme.mono, size: 30) ?? NSFont.monospacedDigitSystemFont(ofSize: 30, weight: .bold)
        hourglass(ctx, CGPoint(x: r.minX + 10, y: 34), 11, sc)
        text(s, mono, sc.ink, at: CGPoint(x: r.minX + 34, y: 12))
        text(t.name, Ink.font(13, weight: .semibold), sc.inkSoft, at: CGPoint(x: r.minX + 40 + width(s, mono), y: 16), maxWidth: 110)
        // progress rule
        let p = CGFloat(1 - left / max(1, t.total))
        Ink.stroke([CGPoint(x: r.minX, y: 60), CGPoint(x: r.maxX, y: 60)], width: 1.1, color: sc.inkSoft, seed: 61, taper: 0.2, in: ctx)
        Ink.stroke([CGPoint(x: r.minX, y: 60), CGPoint(x: r.minX + r.width * p, y: 60)], width: 3.2, color: t.isRest ? Theme.teal : Theme.terracotta, seed: 62, taper: 0.1, in: ctx)
        let stop = CGRect(x: r.maxX - 80, y: 66, width: 80, height: 22)
        pill(ctx, stop, "berhenti", fill: Theme.mutedRed.withAlphaComponent(0.18), sc: sc, seed: 63)
        buttons.append((stop, { [weak self] in self?.controller?.launcher?.stopTimer() }))
    }

    private func hourglass(_ ctx: CGContext, _ c: CGPoint, _ s: CGFloat, _ sc: Scheme) {
        let pts = [CGPoint(x: c.x - s * 0.7, y: c.y - s), CGPoint(x: c.x + s * 0.7, y: c.y - s), CGPoint(x: c.x, y: c.y),
                   CGPoint(x: c.x + s * 0.7, y: c.y + s), CGPoint(x: c.x - s * 0.7, y: c.y + s), CGPoint(x: c.x, y: c.y)]
        Ink.fill([pts[2], pts[3], pts[4]], Theme.mustard, in: ctx)
        Ink.stroke(pts + [pts[0]], width: 1.3, color: sc.ink, seed: 71, taper: 0, in: ctx)
    }

    private func toastIcon(_ ctx: CGContext, _ icon: String, _ c: CGPoint, _ sc: Scheme, small: Bool) {
        switch icon {
        case "plug": battery(ctx, c, sc, state: Power.State(percent: controller?.power.percent ?? 100, charging: true, onAC: true))
        case "low": battery(ctx, c, sc, state: Power.State(percent: controller?.power.percent ?? 10, charging: false, onAC: false))
        case "bell": bell(ctx, c, small ? 6 : 10, sc)
        default: catDoodle(ctx, center: CGPoint(x: c.x, y: c.y + 1), size: small ? 6.5 : 8, color: sc.ink, asleep: false)
        }
    }

    private func drawToast(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme, icon: String, text s: String) {
        toastIcon(ctx, icon, CGPoint(x: r.minX + 10, y: 28), sc, small: false)
        text(s, Ink.font(16, weight: .bold), sc.ink, at: CGPoint(x: r.minX + 30, y: 17), maxWidth: r.width - 30)
    }

    private func battery(_ ctx: CGContext, _ c: CGPoint, _ sc: Scheme, state: Power.State) {
        let body = CGRect(x: c.x - 9, y: c.y - 5, width: 16, height: 10)
        let pct = CGFloat(state.percent) / 100
        let low = state.percent <= 20 && !state.onAC
        ctx.setFillColor((state.charging || state.onAC ? Theme.olive : low ? Theme.mutedRed : sc.ink.withAlphaComponent(0.75)).cgColor)
        ctx.fill(CGRect(x: body.minX + 1.5, y: body.minY + 1.5, width: max(1, (body.width - 3) * pct), height: body.height - 3))
        let box = [CGPoint(x: body.minX, y: body.minY), CGPoint(x: body.maxX, y: body.minY), CGPoint(x: body.maxX, y: body.maxY), CGPoint(x: body.minX, y: body.maxY), CGPoint(x: body.minX, y: body.minY)]
        Ink.stroke(box, width: 1.3, color: sc.ink, seed: 81, taper: 0, in: ctx)
        Ink.stroke([CGPoint(x: body.maxX + 2, y: c.y - 2), CGPoint(x: body.maxX + 2, y: c.y + 2)], width: 2, color: sc.ink, seed: 82, taper: 0, in: ctx)
        if state.charging {
            let bolt = [CGPoint(x: c.x + 0.5, y: c.y - 6.5), CGPoint(x: c.x - 3, y: c.y + 0.5), CGPoint(x: c.x - 0.2, y: c.y + 0.5),
                        CGPoint(x: c.x - 1.5, y: c.y + 6.5), CGPoint(x: c.x + 3, y: c.y - 0.8), CGPoint(x: c.x + 0.2, y: c.y - 0.8)]
            Ink.fill(bolt, Theme.mustard, in: ctx)
            Ink.stroke(bolt + [bolt[0]], width: 0.9, color: sc.ink, seed: 83, taper: 0, in: ctx)
        }
    }

    // ------------------------------------------------------------------ search
    private func drawSearch(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme) {
        guard let c = controller else { return }
        // the field sits on an inked rule; a breadcrumb inside the Claude list
        let inClaude = c.launcher?.list == .claude
        var fx = r.minX + 26
        if inClaude {
            terminalIcon(ctx, CGPoint(x: r.minX + 9, y: 27), sc)
            let crumb = "Claude Code ›"
            text(crumb, Ink.font(15, weight: .bold), sc.accent, at: CGPoint(x: fx, y: 16))
            fx += width(crumb, Ink.font(15, weight: .bold)) + 8
        } else {
            magnifier(ctx, CGPoint(x: r.minX + 9, y: 27), sc)
        }
        let fieldFrame = CGRect(x: fx, y: 14, width: r.maxX - fx, height: 24)
        if c.field.frame != fieldFrame { c.field.frame = fieldFrame }
        c.field.textColor = sc.ink
        (c.field.currentEditor() as? NSTextView)?.insertionPointColor = sc.ink
        let ph = inClaude ? "pilih project…" : "cari: claude, lagu, project, 10m, alarm 7.30, fokus…"
        c.field.placeholderAttributedString = NSAttributedString(string: ph, attributes: [.font: Ink.font(16, weight: .medium), .foregroundColor: sc.inkSoft.withAlphaComponent(0.8)])
        Ink.stroke([CGPoint(x: r.minX, y: 48), CGPoint(x: r.maxX, y: 48)], width: 1.1, color: sc.inkSoft, seed: 91, taper: 0.2, in: ctx)

        if c.results.isEmpty {
            text("tidak ada yang cocok", Ink.font(13, weight: .medium), sc.inkSoft, at: CGPoint(x: r.minX + 40, y: 64))
        }
        for (i, cmd) in c.results.enumerated() {
            let row = CGRect(x: r.minX - 6, y: 56 + CGFloat(i) * 40, width: r.width + 12, height: 38)
            rows.append(row)
            if i == c.selected {
                // a mustard highlighter pass with a little ink tick at the front
                let band = Ink.paperShape(row.insetBy(dx: 0, dy: 2), radius: 9, seed: 100 + i, jitter: 0.5)
                Ink.fill(band, Theme.mustard.withAlphaComponent(0.26), in: ctx)
                Ink.stroke([CGPoint(x: row.minX + 2, y: row.minY + 9), CGPoint(x: row.minX + 2, y: row.maxY - 9)], width: 2.4, color: sc.accent, seed: 7, taper: 0.1, in: ctx)
            }
            icon(ctx, cmd.icon, CGPoint(x: row.minX + 22, y: row.midY), sc)
            let tx = row.minX + 42
            let hintW = cmd.hint.isEmpty || i != c.selected ? 0 : width(cmd.hint, Ink.font(11, weight: .semibold)) + 12
            if cmd.subtitle.isEmpty {
                text(cmd.title, Ink.font(14, weight: .semibold), sc.ink, at: CGPoint(x: tx, y: row.minY + 9), maxWidth: row.maxX - tx - hintW - 8)
            } else {
                text(cmd.title, Ink.font(14, weight: .semibold), sc.ink, at: CGPoint(x: tx, y: row.minY + 2), maxWidth: row.maxX - tx - hintW - 8)
                text(cmd.subtitle, Ink.font(11.5, weight: .medium), sc.inkSoft, at: CGPoint(x: tx, y: row.minY + 20), maxWidth: row.maxX - tx - hintW - 8)
            }
            if hintW > 0 { text(cmd.hint, Ink.font(11, weight: .semibold), sc.inkSoft, at: CGPoint(x: row.maxX - hintW, y: row.minY + 11)) }
        }
        let foot = inClaude ? "↵ buka terminal  ·  esc kembali" : "↵ jalankan  ·  ↑↓ pilih  ·  esc tutup"
        text(foot, Ink.font(11, weight: .medium), sc.inkSoft, at: CGPoint(x: r.minX, y: bounds.height - pad - 24))
    }

    // ------------------------------------------------------------------ alarm ringing, guard visit
    private func drawRing(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme) {
        guard let c = controller, let ring = c.ringing else { return }
        let t = Date().timeIntervalSinceReferenceDate
        bell(ctx, CGPoint(x: r.minX + 14, y: 30 + CGFloat(sin(t * 18)) * 1.2), 13, sc)
        text(ring.title, Ink.font(17, weight: .bold), sc.ink, at: CGPoint(x: r.minX + 40, y: 14), maxWidth: r.width - 40)
        text(ring.subtitle, Ink.font(12.5, weight: .medium), sc.inkSoft, at: CGPoint(x: r.minX + 40, y: 37), maxWidth: r.width - 40)
        var x = r.maxX
        let off = CGRect(x: x - pillWidth("matikan"), y: 66, width: pillWidth("matikan"), height: 24)
        pill(ctx, off, "matikan", fill: Theme.mutedRed.withAlphaComponent(0.2), sc: sc, seed: 111)
        buttons.append((off, { ring.dismiss() }))
        x = off.minX - 10
        if let action = ring.action {
            let s = CGRect(x: x - pillWidth(action.label), y: 66, width: pillWidth(action.label), height: 24)
            pill(ctx, s, action.label, fill: Theme.mustard.withAlphaComponent(0.28), sc: sc, seed: 112)
            buttons.append((s, { action.run() }))
        }
        needsDisplaySoon()
    }

    private func drawVisit(_ ctx: CGContext, _ r: CGRect, _ sc: Scheme) {
        guard let c = controller, let v = c.visit else { return }
        let left = max(0, v.deadline.timeIntervalSinceNow)
        catDoodle(ctx, center: CGPoint(x: r.minX + 13, y: 30), size: 11, color: sc.ink, asleep: false)
        text("si Oren mau nutup \(v.site)", Ink.font(16, weight: .bold), sc.ink, at: CGPoint(x: r.minX + 36, y: 13), maxWidth: r.width - 36)
        text("fokus dulu ya · \(Int(left.rounded(.up))) detik lagi", Ink.font(12.5, weight: .medium), sc.inkSoft, at: CGPoint(x: r.minX + 36, y: 36))
        let p = CGFloat(left / max(0.1, v.seconds))
        Ink.stroke([CGPoint(x: r.minX, y: 66), CGPoint(x: r.maxX - 100, y: 66)], width: 1.1, color: sc.inkSoft, seed: 121, taper: 0.2, in: ctx)
        Ink.stroke([CGPoint(x: r.minX, y: 66), CGPoint(x: r.minX + (r.maxX - 100 - r.minX) * p, y: 66)], width: 3.2, color: Theme.terracotta, seed: 122, taper: 0.1, in: ctx)
        let b = CGRect(x: r.maxX - 84, y: 55, width: 84, height: 24)
        pill(ctx, b, "biarin", fill: Theme.teal.withAlphaComponent(0.22), sc: sc, seed: 123)
        buttons.append((b, { v.allow() }))
    }

    private var redrawPending = false
    private func needsDisplaySoon() {
        guard !redrawPending else { return }
        redrawPending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { [weak self] in self?.redrawPending = false; self?.needsDisplay = true }
    }

    // ------------------------------------------------------------------ small ink icons
    private func icon(_ ctx: CGContext, _ i: Command.Icon, _ c: CGPoint, _ sc: Scheme) {
        switch i {
        case .terminal: terminalIcon(ctx, c, sc)
        case .music: note(ctx, c, sc)
        case .next: drawNext(ctx, CGRect(x: c.x - 12, y: c.y - 8, width: 24, height: 16), sc)
        case .prev: drawPrev(ctx, CGRect(x: c.x - 12, y: c.y - 8, width: 24, height: 16), sc)
        case .folder: folder(ctx, c, sc)
        case .timer: hourglass(ctx, c, 7.5, sc)
        case .alarm: bell(ctx, c, 9, sc)
        case .focus: catDoodle(ctx, center: CGPoint(x: c.x, y: c.y + 1.5), size: 7.5, color: sc.ink, asleep: false)
        case .cat: catDoodle(ctx, center: CGPoint(x: c.x, y: c.y + 1.5), size: 7.5, color: sc.ink, asleep: true)
        case .search: magnifier(ctx, c, sc)
        case .star: star(ctx, c, sc)
        case .stop:
            let b = CGRect(x: c.x - 6, y: c.y - 6, width: 12, height: 12)
            let pts = [CGPoint(x: b.minX, y: b.minY), CGPoint(x: b.maxX, y: b.minY), CGPoint(x: b.maxX, y: b.maxY), CGPoint(x: b.minX, y: b.maxY)]
            Ink.fill(pts, Theme.mutedRed, in: ctx)
            Ink.stroke(pts + [pts[0]], width: 1.3, color: sc.ink, seed: 131, taper: 0, in: ctx)
        case .home:
            let pts = [CGPoint(x: c.x - 8, y: c.y), CGPoint(x: c.x, y: c.y - 8), CGPoint(x: c.x + 8, y: c.y), CGPoint(x: c.x + 6, y: c.y),
                       CGPoint(x: c.x + 6, y: c.y + 7), CGPoint(x: c.x - 6, y: c.y + 7), CGPoint(x: c.x - 6, y: c.y)]
            Ink.fill(pts, Theme.cream, in: ctx)
            Ink.stroke(pts + [pts[0]], width: 1.3, color: sc.ink, seed: 132, taper: 0, in: ctx)
        }
    }

    private func terminalIcon(_ ctx: CGContext, _ c: CGPoint, _ sc: Scheme) {
        let b = CGRect(x: c.x - 10, y: c.y - 8, width: 20, height: 16)
        let pts = Ink.paperShape(b, radius: 3, seed: 141, jitter: 0.2)
        Ink.fill(pts, Theme.navy, in: ctx)
        Ink.stroke(pts + [pts[0]], width: 1.2, color: sc.ink, seed: 142, taper: 0, in: ctx)
        Ink.stroke([CGPoint(x: b.minX + 4, y: b.minY + 4.5), CGPoint(x: b.minX + 8, y: b.midY), CGPoint(x: b.minX + 4, y: b.maxY - 4.5)], width: 1.5, color: Theme.cream, seed: 143, taper: 0, in: ctx)
        Ink.stroke([CGPoint(x: b.minX + 10, y: b.maxY - 4), CGPoint(x: b.maxX - 4, y: b.maxY - 4)], width: 1.5, color: Theme.cream, seed: 144, taper: 0, in: ctx)
    }

    private func note(_ ctx: CGContext, _ c: CGPoint, _ sc: Scheme) {
        ctx.setFillColor(sc.ink.cgColor)
        ctx.fillEllipse(in: CGRect(x: c.x - 8, y: c.y + 2, width: 7, height: 5.5))
        ctx.fillEllipse(in: CGRect(x: c.x + 2, y: c.y, width: 7, height: 5.5))
        Ink.stroke([CGPoint(x: c.x - 1.6, y: c.y + 4), CGPoint(x: c.x - 1.6, y: c.y - 8)], width: 1.6, color: sc.ink, seed: 151, taper: 0, in: ctx)
        Ink.stroke([CGPoint(x: c.x + 8.4, y: c.y + 2), CGPoint(x: c.x + 8.4, y: c.y - 10)], width: 1.6, color: sc.ink, seed: 152, taper: 0, in: ctx)
        Ink.stroke([CGPoint(x: c.x - 1.6, y: c.y - 8), CGPoint(x: c.x + 8.4, y: c.y - 10)], width: 3, color: sc.ink, seed: 153, taper: 0, in: ctx)
    }

    private func folder(_ ctx: CGContext, _ c: CGPoint, _ sc: Scheme) {
        let pts = [CGPoint(x: c.x - 10, y: c.y - 6), CGPoint(x: c.x - 3, y: c.y - 6), CGPoint(x: c.x - 1, y: c.y - 3.5), CGPoint(x: c.x + 10, y: c.y - 3.5),
                   CGPoint(x: c.x + 10, y: c.y + 7), CGPoint(x: c.x - 10, y: c.y + 7)]
        Ink.fill(pts, Theme.mustard, in: ctx)
        Ink.stroke(pts + [pts[0]], width: 1.3, color: sc.ink, seed: 161, taper: 0, in: ctx)
        Ink.stroke([CGPoint(x: c.x - 10, y: c.y - 0.5), CGPoint(x: c.x + 10, y: c.y - 0.5)], width: 1.1, color: sc.ink, seed: 162, taper: 0, in: ctx)
    }

    private func bell(_ ctx: CGContext, _ c: CGPoint, _ s: CGFloat, _ sc: Scheme) {
        let pts = [CGPoint(x: c.x - s * 0.8, y: c.y + s * 0.55), CGPoint(x: c.x - s * 0.6, y: c.y - s * 0.2), CGPoint(x: c.x - s * 0.35, y: c.y - s * 0.75),
                   CGPoint(x: c.x, y: c.y - s * 0.9), CGPoint(x: c.x + s * 0.35, y: c.y - s * 0.75), CGPoint(x: c.x + s * 0.6, y: c.y - s * 0.2),
                   CGPoint(x: c.x + s * 0.8, y: c.y + s * 0.55)]
        Ink.fill(pts, Theme.mustard, in: ctx)
        Ink.stroke(pts + [pts[0]], width: 1.3, color: sc.ink, seed: 171, taper: 0, in: ctx)
        ctx.setFillColor(sc.ink.cgColor)
        ctx.fillEllipse(in: CGRect(x: c.x - s * 0.17, y: c.y + s * 0.55, width: s * 0.34, height: s * 0.34))
    }

    private func magnifier(_ ctx: CGContext, _ c: CGPoint, _ sc: Scheme) {
        let ring = (0..<20).map { i -> CGPoint in let a = CGFloat(i) / 19 * .pi * 2; return CGPoint(x: c.x - 2 + cos(a) * 6.5, y: c.y - 2 + sin(a) * 6.5) }
        Ink.stroke(ring, width: 1.8, color: sc.ink, seed: 181, taper: 0, in: ctx)
        Ink.stroke([CGPoint(x: c.x + 3, y: c.y + 3), CGPoint(x: c.x + 8.5, y: c.y + 8.5)], width: 2.6, color: sc.ink, seed: 182, taper: 0, in: ctx)
    }

    private func star(_ ctx: CGContext, _ c: CGPoint, _ sc: Scheme) {
        let pts = (0..<10).map { i -> CGPoint in
            let a = -CGFloat.pi / 2 + CGFloat(i) * .pi / 5, r: CGFloat = i % 2 == 0 ? 9 : 4
            return CGPoint(x: c.x + cos(a) * r, y: c.y + sin(a) * r)
        }
        Ink.fill(pts, Theme.mustard, in: ctx)
        Ink.stroke(pts + [pts[0]], width: 1.2, color: sc.ink, seed: 191, taper: 0, in: ctx)
    }
}
