import AppKit

// Maestro lives on the floor line (the top of the Dock, or the bottom of the screen when the
// Dock hides). Sprites come from pet/ (rendered by scripts/render-assets.mjs).
final class PetController {
    // One sheet per animation; frames are picked with contentsRect so the sheet uploads once.
    struct Anim { let sheet: CGImage; let count: Int; let fps: Double; let loop: Bool }
    enum State { case idle, walk, sleep, tap, purr, dangle, fall, stretch, leap, swipe }

    private let panel: NSPanel
    private let view: PetView
    private let sprite = CALayer()
    private var anims: [String: Anim] = [:]
    private var cell = CGSize(width: 200, height: 160)
    private var cellGround: CGFloat = 150
    private let scale: CGFloat = 0.56
    private(set) var state: State = .idle
    private var anim = "idle"
    private var frame = 0
    private var frameClock: Double = 0
    private var pos = CGPoint(x: 300, y: 0)   // window origin, screen coords
    private var facing: CGFloat = 1
    private var targetX: CGFloat = 300
    private var until = Date().addingTimeInterval(4)
    private var lastKeyIdle: Double = 1e9
    private var vy: CGFloat = 0
    private var loop: Timer?
    private var last = CACurrentMediaTime()
    private var hiddenForFullScreen = false
    private var fullScreenClock: Double = 0
    // focus mode: one leap from where he is onto a Chrome tab, a swipe up there, the fall back
    private var pounce: (from: CGPoint, to: CGPoint, t0: Double, dur: Double)?
    private var onHit: (() -> Void)?
    private var swipingUp = false
    var size: CGSize { CGSize(width: cell.width * scale, height: cell.height * scale) }

    init() {
        panel = NSPanel(contentRect: CGRect(x: 0, y: 0, width: 112, height: 90), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        // every desktop; over an app in full screen he is put away (see checkFullScreen)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        view = PetView(frame: panel.contentRect(forFrameRect: panel.frame))
        view.wantsLayer = true
        panel.contentView = view
        view.layer?.addSublayer(sprite)
        sprite.contentsGravity = .resizeAspect
        sprite.magnificationFilter = .linear
        sprite.minificationFilter = .trilinear
        view.pet = self
        loadSprites()
    }

    private func loadSprites() {
        guard let dir = Bundle.main.resourceURL?.appendingPathComponent("pet"),
              let data = try? Data(contentsOf: dir.appendingPathComponent("pet.json")),
              let meta = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let c = meta["cell"] as? [String: Any], let list = meta["anims"] as? [String: [String: Any]] else { return }
        cell = CGSize(width: c["w"] as? Double ?? 200, height: c["h"] as? Double ?? 160)
        cellGround = CGFloat(c["groundY"] as? Double ?? 150)
        for (name, a) in list {
            guard let img = NSImage(contentsOf: dir.appendingPathComponent("\(name).png"))?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
            anims[name] = Anim(sheet: img, count: max(1, a["frames"] as? Int ?? 1), fps: a["fps"] as? Double ?? 8, loop: a["loop"] as? Bool ?? true)
        }
    }

    // ------------------------------------------------------------------ lifecycle
    private(set) var running = false
    private var watchdog: Timer?

    func start() {
        guard !running else { return }
        running = true
        let s = size
        panel.setContentSize(s)
        view.frame = CGRect(origin: .zero, size: s)
        sprite.frame = view.bounds
        let g = groundOrigin()
        pos = CGPoint(x: (screen.visibleFrame.minX + screen.visibleFrame.maxX) / 2 + 160, y: g)
        place()
        hiddenForFullScreen = false
        panel.orderFrontRegardless()
        checkFullScreen()
        last = CACurrentMediaTime()
        interval = 0
        schedule(1.0 / 20)
        set(.idle, for: 3)
        // if the loop ever stops ticking (it froze once after an off/on), start it again
        watchdog = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            guard let self, self.running, CACurrentMediaTime() - self.last > 2 else { return }
            self.interval = 0
            self.schedule(1.0 / 10)
        }
        watchdog?.tolerance = 1
        if !observingSpaces {
            observingSpaces = true
            let nc = NSWorkspace.shared.notificationCenter
            for name in [NSWorkspace.activeSpaceDidChangeNotification, NSWorkspace.didActivateApplicationNotification] {
                nc.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                    self?.checkFullScreen()
                    // the window list settles a moment after a space switch
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self?.checkFullScreen() }
                }
            }
        }
    }
    private var observingSpaces = false

    func stop() {
        guard running else { return }
        running = false
        loop?.invalidate(); loop = nil
        watchdog?.invalidate(); watchdog = nil
        interval = 0
        landHit()
        panel.orderOut(nil)
    }

    // A panel that doesn't activate its app still shows over full-screen apps, whatever its
    // collection behaviour says. So: when the app in front fills the whole screen, put him away.
    private func checkFullScreen() {
        guard running else { return }
        let full = PetController.fullScreenInFront(on: screen)
        guard full != hiddenForFullScreen else { return }
        hiddenForFullScreen = full
        if full { landHit(); panel.orderOut(nil) } else { panel.orderFrontRegardless() }
    }

    static func fullScreenInFront(on screen: NSScreen) -> Bool {
        guard let app = NSWorkspace.shared.frontmostApplication, app.processIdentifier != ProcessInfo.processInfo.processIdentifier,
              let main = NSScreen.screens.first,
              let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
        // window bounds are in top-left coordinates, measured from the main screen's top
        let target = CGRect(x: screen.frame.minX, y: main.frame.maxY - screen.frame.maxY, width: screen.frame.width, height: screen.frame.height)
        for w in list {
            guard (w[kCGWindowOwnerPID as String] as? Int32) == app.processIdentifier, (w[kCGWindowLayer as String] as? Int) == 0,
                  let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
            let r = CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
            if abs(r.minX - target.minX) < 2 && abs(r.minY - target.minY) < 2 && abs(r.width - target.width) < 2 && abs(r.height - target.height) < 2 { return true }
        }
        return false
    }

    /// For `guardia://status`: what Maestro is doing and when his loop last ticked.
    var debugState: [String: Any] {
        ["running": running, "state": "\(state)", "x": Double(pos.x), "y": Double(pos.y), "lastTickAgo": CACurrentMediaTime() - last,
         "hiddenForFullScreen": hiddenForFullScreen, "visible": panel.isVisible]
    }

    // 20 Hz while moving, 10 Hz otherwise (still quick enough to catch every keypress)
    private var interval: Double = 0
    private func schedule(_ i: Double) {
        guard i != interval else { return }
        interval = i
        loop?.invalidate()
        loop = Timer.scheduledTimer(withTimeInterval: i, repeats: true) { [weak self] _ in self?.step() }
        loop?.tolerance = i * 0.2
        RunLoop.main.add(loop!, forMode: .common)
    }

    private var screen: NSScreen { NSScreen.screens.first ?? NSScreen.main! }
    // asking NSScreen for its frames is a window-server round trip, so the floor is kept and
    // refreshed every couple of seconds (the Dock can move or hide)
    private var floorCache: (ground: CGFloat, bounds: ClosedRange<CGFloat>, at: Double)?
    private func floorInfo() -> (ground: CGFloat, bounds: ClosedRange<CGFloat>) {
        let now = CACurrentMediaTime()
        if let f = floorCache, now - f.at < 2 { return (f.ground, f.bounds) }
        let s = screen
        let floor = s.visibleFrame.minY > s.frame.minY + 8 ? s.visibleFrame.minY : s.frame.minY + 2
        let g = floor - (cell.height - cellGround) * scale
        let b = (s.frame.minX + 8)...max(s.frame.minX + 9, s.frame.maxX - size.width - 8)
        floorCache = (g, b, now)
        return (g, b)
    }
    private func groundOrigin() -> CGFloat { floorInfo().ground }
    private var bounds: ClosedRange<CGFloat> { floorInfo().bounds }

    // ------------------------------------------------------------------ public nudges
    func celebrate() { if state != .dangle { set(.purr, for: 4) } }
    func comeHere() {
        let m = NSEvent.mouseLocation
        targetX = min(max(m.x - size.width / 2, bounds.lowerBound), bounds.upperBound)
        set(.walk, for: 30)
    }

    /// Focus mode closed a tab: a quick paw swipe where he stands.
    func swipeHere() {
        guard running, !hiddenForFullScreen, ![.dangle, .fall].contains(state) else { return }
        set(.swipe, for: anims["swipe"].map { Double($0.count) / $0.fps } ?? 0.5)
    }

    /// Leap onto `feet` (screen coordinates, the bottom of a Chrome tab), swipe, and call `hit`
    /// as the paw lands; then he falls back to the floor. False when nobody would see it (he's
    /// off, put away for a full-screen app, or the tab is on another screen): close it then.
    func pounce(on feet: CGPoint, hit: @escaping () -> Void) -> Bool {
        guard running, !hiddenForFullScreen, panel.isOnActiveSpace, onHit == nil,
              screen.frame.insetBy(dx: 4, dy: 4).contains(feet), ![.dangle, .fall].contains(state) else { return false }
        let to = CGPoint(x: feet.x - size.width / 2, y: feet.y - (cell.height - cellGround) * scale)
        facing = to.x >= pos.x ? 1 : -1
        // quick: a third of a second for a short hop, never much more than half a second
        let dist = Double(hypot(to.x - pos.x, to.y - pos.y))
        pounce = (pos, to, CACurrentMediaTime(), min(0.6, 0.28 + dist / 4000))
        onHit = hit
        swipingUp = false
        set(.leap, for: 3)
        schedule(1.0 / 40)
        return true
    }

    // whatever interrupts the pounce, the tab still goes
    private func landHit() {
        let h = onHit
        onHit = nil; pounce = nil
        h?()
    }

    // ------------------------------------------------------------------ state machine
    private func set(_ s: State, for seconds: Double) {
        state = s
        until = Date().addingTimeInterval(seconds)
        let name: String
        switch s {
        case .idle: name = "idle"
        case .walk: name = "walk"
        case .sleep: name = "sleep"
        case .tap: name = "tap"
        case .purr: name = "purr"
        case .dangle, .fall: name = "dangle"
        case .stretch: name = "stretch"
        case .leap: name = "leap"
        case .swipe: name = "swipe"
        }
        if name != anim { anim = name; frame = 0; frameClock = 0 }
    }

    private func step() {
        let now = CACurrentMediaTime()
        let dt = min(0.3, now - last)
        last = now

        // put away behind a full-screen app: nothing to draw, just look again now and then
        if hiddenForFullScreen {
            fullScreenClock += dt
            if fullScreenClock > 1 { fullScreenClock = 0; checkFullScreen() }
            schedule(1.0 / 2)
            return
        }

        // input: a keypress resets "seconds since last key down" (no Input Monitoring needed)
        let keyIdle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .keyDown)
        let anyIdle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
        let pressed = keyIdle + 0.0005 < lastKeyIdle || keyIdle < 0.02
        lastKeyIdle = keyIdle
        if pressed && keyIdle < 0.5 { onKey() }

        switch state {
        case .idle:
            if anyIdle > 120 { set(.sleep, for: .infinity) }
            else if Date() > until { decide() }
        case .walk:
            let dir: CGFloat = targetX > pos.x ? 1 : -1
            facing = dir
            pos.x += dir * 27 * CGFloat(dt)  // matches the stride of the 12-frame walk
            if abs(targetX - pos.x) < 3 || Date() > until { set(.idle, for: Double.random(in: 4...9)) }
        case .sleep:
            if anyIdle < 0.6 { set(.stretch, for: 1.1) }
        case .tap:
            if Date() > until { set(.idle, for: Double.random(in: 3...6)) }
        case .purr:
            if Date() > until { set(.idle, for: 4) }
        case .stretch:
            if Date() > until { set(.idle, for: 3) }
        case .dangle:
            break
        case .fall:
            vy -= 2200 * CGFloat(dt)
            pos.y += vy * CGFloat(dt)
            let g = groundOrigin()
            if pos.y <= g { pos.y = g; vy = 0; set(.idle, for: 3) }
        case .leap:
            guard let p = pounce else { vy = 0; set(.fall, for: 5); break }
            let t = min(1, (now - p.t0) / p.dur)
            let e = CGFloat(t * t * (3 - 2 * t))
            pos.x = p.from.x + (p.to.x - p.from.x) * e
            pos.y = p.from.y + (p.to.y - p.from.y) * e + CGFloat(sin(t * .pi)) * 60
            frame = min(5, Int(t * 6))
            if t >= 1 {
                pos = p.to
                swipingUp = true
                set(.swipe, for: anims["swipe"].map { Double($0.count) / $0.fps } ?? 0.5)
            }
        case .swipe:
            if swipingUp, let p = pounce { pos = p.to }
            // the paw lands on the swipe's fourth frame: that is when the tab closes
            if swipingUp && frame >= 3 { landHit() }
            if Date() > until {
                if swipingUp { swipingUp = false; landHit(); vy = 60; set(.fall, for: 5) } else { set(.idle, for: 3) }
            }
        }
        let aloft = [.dangle, .fall, .leap].contains(state) || swipingUp
        if !aloft { pos.y = groundOrigin(); pos.x = min(max(pos.x, bounds.lowerBound), bounds.upperBound) }
        fullScreenClock += dt
        if fullScreenClock > 2 { fullScreenClock = 0; checkFullScreen() }

        // animate (taps advance per key instead of by time)
        if let a = anims[anim], state != .tap, state != .leap {
            frameClock += dt
            let step = 1 / a.fps
            while frameClock >= step {
                frameClock -= step
                frame = a.loop ? (frame + 1) % a.count : min(frame + 1, a.count - 1)
            }
        }
        place()
        hitTest()
        // asleep, one tick per breathing frame is enough to notice the first key or mouse move
        schedule(state == .leap ? 1.0 / 40 : [.walk, .dangle, .fall, .swipe].contains(state) ? 1.0 / 20 : state == .sleep ? 1.0 / 4 : 1.0 / 10)
    }

    private func onKey() {
        switch state {
        case .sleep: set(.stretch, for: 1.1)
        case .idle, .walk, .tap:
            if state != .tap { set(.tap, for: 1.3) } else { until = Date().addingTimeInterval(1.3) }
            if let a = anims["tap"] { frame = (frame + 1) % a.count }
        default: break
        }
    }

    private func decide() {
        let m = NSEvent.mouseLocation
        let r = Double.random(in: 0...1)
        if m.y < groundOrigin() + 160, abs(m.x - pos.x) > 80, r < 0.35 {
            // curious about the cursor near the floor
            targetX = min(max(m.x - size.width / 2, bounds.lowerBound), bounds.upperBound)
            set(.walk, for: 20)
        } else if r < 0.7 {
            var t = CGFloat.random(in: bounds)
            if abs(t - pos.x) < 90 { t = pos.x + (t > pos.x ? 160 : -160) }
            targetX = min(max(t, bounds.lowerBound), bounds.upperBound)
            set(.walk, for: 20)
        } else {
            set(.idle, for: Double.random(in: 5...10))
        }
    }

    private var shown: (anim: String, frame: Int, facing: CGFloat, pos: CGPoint) = ("", -1, 0, .zero)
    private func place() {
        // only touch the window server when something actually changed
        let p = CGPoint(x: pos.x.rounded(), y: pos.y.rounded())
        if shown.anim != anim || shown.frame != frame || shown.facing != facing {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            if let a = anims[anim] {
                if shown.anim != anim { sprite.contents = a.sheet }
                let w = 1 / CGFloat(a.count)
                sprite.contentsRect = CGRect(x: CGFloat(min(frame, a.count - 1)) * w, y: 0, width: w, height: 1)
            }
            sprite.setAffineTransform(CGAffineTransform(scaleX: facing, y: 1))
            CATransaction.commit()
        }
        if shown.pos != p { panel.setFrameOrigin(p) }
        shown = (anim, frame, facing, p)
    }

    // For `Guardia --snapshot`: the sprite layer showing one frame, rendered off screen at 2x.
    func snapshot(_ name: String, frame i: Int) -> CGImage? {
        anim = name; frame = i
        sprite.frame = CGRect(origin: .zero, size: size)
        place()
        let k: CGFloat = 2
        guard let ctx = CGContext(data: nil, width: Int(size.width * k), height: Int(size.height * k), bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.scaleBy(x: k, y: k)
        sprite.render(in: ctx)
        return ctx.makeImage()
    }

    // Clicks only land on the cat itself; everywhere else passes through.
    private var passThrough = true
    private func hitTest() {
        var through = false
        if state != .dangle {
            let f = panel.frame
            let body = CGRect(x: f.minX + f.width * 0.18, y: f.minY + f.height * 0.06, width: f.width * 0.66, height: f.height * 0.62)
            through = !body.contains(NSEvent.mouseLocation)
        }
        // each change is a window-server round trip, so only send real changes
        if through != passThrough { passThrough = through; panel.ignoresMouseEvents = through }
    }

    // ------------------------------------------------------------------ mouse (from PetView)
    private var grab: CGPoint?
    private var dragged = false
    func mouseDown(at p: CGPoint) { grab = p; dragged = false }
    func mouseDragged() {
        guard grab != nil else { return }
        if !dragged { dragged = true; swipingUp = false; landHit(); set(.dangle, for: .infinity) }
        let m = NSEvent.mouseLocation
        // held by the scruff: the top of the head stays under the cursor
        pos = CGPoint(x: m.x - size.width / 2, y: m.y - size.height * 0.9)
        place()
    }
    func mouseUp() {
        if dragged { vy = 0; set(.fall, for: 5) } else { set(.purr, for: 3.5) }
        grab = nil; dragged = false
    }
}

final class PetView: NSView {
    weak var pet: PetController?
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with e: NSEvent) { pet?.mouseDown(at: convert(e.locationInWindow, from: nil)) }
    override func mouseDragged(with e: NSEvent) { pet?.mouseDragged() }
    override func mouseUp(with e: NSEvent) { pet?.mouseUp() }
}
