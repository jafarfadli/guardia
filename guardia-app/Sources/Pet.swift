import AppKit

// Maestro and Maestra live on the floor line (the top of the Dock, or the bottom of the screen
// when the Dock hides), and now and then on top of a window. Sprites come from pet/ (rendered by
// scripts/render-assets.mjs): one set of poses, two coats. How they rest follows what goes on
// around them (Mood); Household (Household.swift) has the two of them play together.
final class PetController {
    /// Who this is: the sprites, the size, the temper.
    struct Cat {
        let name: String
        let sprites: String
        let scale: CGFloat
        // Maestra: sleeps sooner and naps through typing, walks less, plays no bongo, puts up
        // with petting longer, leaves Claude to Maestro
        let lazy: Bool
        static let maestro = Cat(name: "Maestro", sprites: "pet", scale: 0.56, lazy: false)
        static let maestra = Cat(name: "Maestra", sprites: "maestra", scale: 0.52, lazy: true)
    }
    /// What goes on around them: it changes how they rest, and whether they bother to walk.
    struct Mood: Equatable { var rain = false, music = false, lowBattery = false, hot = false, claude = false }

    // One sheet per animation; frames are picked with contentsRect so the sheet uploads once.
    struct Anim { let sheet: CGImage; let count: Int; let fps: Double; let loop: Bool }
    enum State { case idle, walk, sleep, tap, purr, dangle, fall, stretch, leap, swipe, meow, startle, stalk, bite, beg, eat, groom }
    private enum Jump { case tab, laser, perch(CGWindowID, CGRect) }

    let cat: Cat
    private let panel: NSPanel
    private let view: PetView
    private let sprite = CALayer()
    private let balloon = Balloon()
    private var anims: [String: Anim] = [:]
    private var cell = CGSize(width: 200, height: 160)
    private var cellGround: CGFloat = 150
    private var scale: CGFloat { cat.scale }
    private(set) var state: State = .idle
    private var anim = "idle"
    private var frame = 0
    private var frameClock: Double = 0
    private var pos = CGPoint(x: 300, y: 0)   // window origin, screen coords
    private(set) var facing: CGFloat = 1
    private var targetX: CGFloat = 300
    private var until = Date().addingTimeInterval(4)
    private var lastKeyIdle: Double = 1e9
    private var vy: CGFloat = 0
    // a hop off the floor (thunder)
    private var lift: CGFloat = 0, liftV: CGFloat = 0
    // walking pace: 1, more when running
    private var speed: CGFloat = 1
    // what to do on arriving where the walk goes (Household, mealtime, the alarm)
    private var afterWalk: (() -> Void)?
    private var loop: Timer?
    private var last = CACurrentMediaTime()
    private var hiddenForFullScreen = false
    // over Chrome in full screen he stays (he guards it in focus mode), on the screen's bottom
    // edge: full screen hides the Dock, though the screen still reports room kept for it
    private var noDock = false
    private var fullScreenClock: Double = 0
    // one leap from where he is: onto a Chrome tab (focus mode), at the cursor, onto a window
    private var pounce: (from: CGPoint, to: CGPoint, t0: Double, dur: Double, kind: Jump)?
    private var onHit: (() -> Void)?
    private var swipingUp = false
    // on top of a window: its id and frame (screen coords), while it stays put and uncovered
    private(set) var perch: (id: CGWindowID, rect: CGRect)?
    private var perchClock: Double = 0
    // asleep for a while whatever the keyboard does (a nap, a sleep on a window)
    private(set) var napping = false
    // the alarm rang: he meows until it is dismissed (a click on him dismisses it)
    private var alerting: (() -> Void)?
    private var begging = false
    private var begUntil = Date()
    private var mealKey = ""
    private var mealClock: Double = 25
    private var nextShout: Double = 0
    var mood = Mood() { didSet { if mood != oldValue { moodChanged() } } }
    /// He landed on a window (Household: two cats, one window).
    var onPerch: ((PetController) -> Void)?
    var size: CGSize { CGSize(width: cell.width * scale, height: cell.height * scale) }
    // from the window's bottom edge down to the paws
    private var feet: CGFloat { (cell.height - cellGround) * scale }

    init(cat: Cat = .maestro) {
        self.cat = cat
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
        guard let dir = Bundle.main.resourceURL?.appendingPathComponent(cat.sprites),
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
        // he starts right of the middle, she left of it
        pos = CGPoint(x: (screen.visibleFrame.minX + screen.visibleFrame.maxX) / 2 + (cat.lazy ? -220 : 160), y: g)
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
                    self?.checkPerch()
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
        perch = nil
        begging = false
        alerting = nil
        balloon.hide()
        panel.orderOut(nil)
    }

    // A panel that doesn't activate its app still shows over full-screen apps, whatever its
    // collection behaviour says. So: when an app fills the whole screen, put him away, except
    // over Chrome, where he walks the bottom edge instead (in a full-screen Space, no Dock).
    private func checkFullScreen() {
        guard running else { return }
        let fs = PetController.fullScreen(on: screen)
        seenFullScreen = fs.map { ($0.space ? "space " : "window ") + $0.apps.joined(separator: " ") } ?? "-"
        let stay = fs?.apps.contains("com.google.Chrome") ?? false
        let hide = fs != nil && !stay
        let dockless = stay && fs?.space == true
        if dockless != noDock {
            noDock = dockless
            floorCache = nil
            // a lower floor: he drops to it; a higher one: he is simply there
            if dockless && ![.dangle, .fall, .leap].contains(state) && !swipingUp { perch = nil; vy = 0; set(.fall, for: 5) }
        }
        guard hide != hiddenForFullScreen else { return }
        hiddenForFullScreen = hide
        if hide { landHit(); perch = nil; balloon.hide(); panel.orderOut(nil) } else { panel.orderFrontRegardless() }
    }
    private var seenFullScreen = "-"

    /// What fills the screen: the apps of the full-screen Space showing on it (`space`: macOS
    /// hides the Dock there), or on an ordinary desktop the app in front when one of its windows
    /// covers the whole screen. Nil when neither. Window sizes alone can't tell full screen:
    /// Chrome splits itself there into toolbar windows and a page window below them.
    static func fullScreen(on screen: NSScreen) -> (apps: [String], space: Bool)? {
        if let apps = fullScreenSpaceApps(on: screen) { return (apps, true) }
        return fullScreenApp(on: screen).map { ([$0], false) }
    }

    // SkyLight, the window server's private framework, loaded at run time and only read: its
    // list of Spaces says which one each display shows and whose it is.
    private typealias MainConnection = @convention(c) () -> Int32
    private typealias CopySpaces = @convention(c) (Int32) -> Unmanaged<CFArray>?
    private static let copySpaces: (() -> [[String: Any]]?)? = {
        guard let h = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_NOW),
              let c = dlsym(h, "SLSMainConnectionID") ?? dlsym(h, "CGSMainConnectionID"),
              let s = dlsym(h, "SLSCopyManagedDisplaySpaces") ?? dlsym(h, "CGSCopyManagedDisplaySpaces") else { return nil }
        let connection = unsafeBitCast(c, to: MainConnection.self), copy = unsafeBitCast(s, to: CopySpaces.self)
        return { copy(connection())?.takeRetainedValue() as? [[String: Any]] }
    }()

    /// The bundle ids of the apps in the full-screen Space `screen` shows now (two in Split
    /// View), or nil when it shows an ordinary desktop or the Spaces can't be read.
    private static func fullScreenSpaceApps(on screen: NSScreen) -> [String]? {
        guard let displays = copySpaces?() else { return nil }
        let uuid = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)
            .flatMap { CGDisplayCreateUUIDFromDisplayID($0.uint32Value)?.takeRetainedValue() }
            .map { CFUUIDCreateString(nil, $0) as String } ?? ""
        // one entry per display ("Main" for all of them when displays share their Spaces)
        let display = displays.first { ($0["Display Identifier"] as? String)?.caseInsensitiveCompare(uuid) == .orderedSame } ?? displays.first
        // type 4 is a full-screen Space; its tiles are the apps in it
        guard let space = display?["Current Space"] as? [String: Any], (space["type"] as? Int) == 4 else { return nil }
        let tiles = ((space["TileLayoutManager"] as? [String: Any])?["TileSpaces"] as? [[String: Any]]) ?? []
        let pids = ([space["pid"]] + tiles.map { $0["pid"] }).compactMap { ($0 as? NSNumber)?.int32Value }
        return Set(pids).compactMap { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier }
    }

    /// The bundle id of the app in front when one of its windows covers the whole screen (a
    /// window as big as the screen, no full-screen Space), else nil.
    static func fullScreenApp(on screen: NSScreen) -> String? {
        guard let app = NSWorkspace.shared.frontmostApplication, app.processIdentifier != ProcessInfo.processInfo.processIdentifier,
              let main = NSScreen.screens.first,
              let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
        // window bounds are in top-left coordinates, measured from the main screen's top
        let target = CGRect(x: screen.frame.minX, y: main.frame.maxY - screen.frame.maxY, width: screen.frame.width, height: screen.frame.height)
        for w in list {
            guard (w[kCGWindowOwnerPID as String] as? Int32) == app.processIdentifier, (w[kCGWindowLayer as String] as? Int) == 0,
                  let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
            let r = CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
            if r.minX <= target.minX + 2 && r.minY <= target.minY + 2 && r.maxX >= target.maxX - 2 && r.maxY >= target.maxY - 2 {
                return app.bundleIdentifier ?? "?"
            }
        }
        return nil
    }

    /// For `guardia://status`: what the cat is doing and when its loop last ticked.
    var debugState: [String: Any] {
        ["running": running, "state": "\(state)", "anim": anim, "x": Double(pos.x), "y": Double(pos.y), "lastTickAgo": CACurrentMediaTime() - last,
         "hiddenForFullScreen": hiddenForFullScreen, "noDock": noDock, "fullScreen": seenFullScreen, "visible": panel.isVisible,
         "perch": perch.map { Int($0.id) } ?? 0, "napping": napping, "begging": begging, "alerting": alerting != nil,
         "balloon": balloon.text ?? "-"]
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
        let floor = !noDock && s.visibleFrame.minY > s.frame.minY + 8 ? s.visibleFrame.minY : s.frame.minY + 2
        let g = floor - feet
        let b = (s.frame.minX + 8)...max(s.frame.minX + 9, s.frame.maxX - size.width - 8)
        floorCache = (g, b, now)
        return (g, b)
    }
    // on a window, its top edge is the floor and its width the room to walk
    private func groundOrigin() -> CGFloat { perch.map { $0.rect.maxY - feet } ?? floorInfo().ground }
    private var bounds: ClosedRange<CGFloat> {
        guard let p = perch else { return floorInfo().bounds }
        let lo = p.rect.minX - size.width * 0.2
        return lo...max(lo + 1, p.rect.maxX - size.width * 0.8)
    }

    // ------------------------------------------------------------------ for Household
    var x: CGFloat { pos.x }
    var visible: Bool { running && !hiddenForFullScreen }
    var asleep: Bool { state == .sleep }
    /// Not busy with anything: Household may have him play.
    var free: Bool {
        visible && perch == nil && grab == nil && alerting == nil && !begging && pounce == nil && afterWalk == nil && !swipingUp
            && [.idle, .walk].contains(state)
    }

    /// Walk (or run) to `x`; `then` runs on arriving. Returns where he will stop.
    @discardableResult
    func go(to x: CGFloat, speed: CGFloat = 1, then: (() -> Void)? = nil) -> CGFloat {
        if perch != nil { perch = nil }
        napping = false
        targetX = min(max(x, bounds.lowerBound), bounds.upperBound)
        set(.walk, for: max(20, Double(abs(targetX - pos.x) / (27 * speed)) + 3))
        self.speed = speed
        afterWalk = then
        return targetX
    }

    /// Play one animation for a while, facing `facing` (1 right, −1 left) if given.
    func act(_ s: State, for seconds: Double, facing f: CGFloat? = nil) {
        if let f { facing = f }
        if s != .sleep { napping = false }
        set(s, for: seconds)
    }

    // ------------------------------------------------------------------ what goes on around him
    private func moodChanged() {
        guard running else { return }
        // stop walking in the rain, on an empty battery, in the heat
        if state == .walk && afterWalk == nil && (mood.rain || mood.lowBattery || mood.hot) { set(.idle, for: 4) }
        if state == .idle { set(.idle, for: max(1, until.timeIntervalSinceNow)) }
    }

    // resting looks different with what goes on: the first that holds wins
    private var restAnim: String {
        let pick = mood.lowBattery ? "flop" : mood.hot ? "hot" : mood.rain ? "loaf" : mood.music ? "bob" : mood.claude && !cat.lazy ? "watch" : "idle"
        return anims[pick] != nil ? pick : "idle"
    }

    /// Lightning: a jump in fright.
    func startle() {
        guard visible, ![.dangle, .fall, .leap, .beg, .eat].contains(state), !swipingUp, onHit == nil else { return }
        napping = false
        afterWalk = nil
        set(.startle, for: 0.75)
        liftV = 340
    }

    /// A Claude session handed the turn back after working a while.
    func handBack(_ name: String) {
        guard visible, ![.dangle, .fall, .leap, .beg, .eat, .meow].contains(state), !swipingUp, alerting == nil else { return }
        napping = false
        set(.meow, for: 2.4)
        say("meong! \(name): giliranmu", for: 6)
    }

    /// The charger went in: up and a stretch.
    func plugged() {
        guard visible, [.idle, .walk, .sleep].contains(state), !begging, alerting == nil else { return }
        napping = false
        set(.stretch, for: 1.1)
    }

    /// An alarm or a timer rang: to the middle of the screen, meowing until it is dismissed.
    func alert(dismiss: @escaping () -> Void) {
        guard running, !hiddenForFullScreen else { return }
        alerting = dismiss
        begging = false
        if perch != nil { getDown() } else if ![.dangle, .fall, .leap].contains(state) && !swipingUp { answerAlert() }
    }
    func alertEnd() {
        guard alerting != nil else { return }
        alerting = nil
        balloon.hide()
        if state == .meow || state == .walk { set(.idle, for: 3) }
    }
    private func answerAlert() {
        let mid = screen.frame.midX - size.width / 2 + (cat.lazy ? 70 : -50)
        go(to: mid, speed: 2.4) { [weak self] in self?.set(.meow, for: .infinity) }
    }

    /// A nap: asleep for a while whatever the keyboard does.
    func nap(for seconds: Double) {
        guard visible, perch == nil else { return }
        afterWalk = nil
        napping = true
        set(.sleep, for: seconds)
    }

    /// guardia://pet/try/meal: ask for food now, whatever the time; …/feed: as a click on the bowl.
    func askForFood() { mealKey = "coba"; beg() }
    func feedNow() { if begging { feed() } }
    /// guardia://pet/try/climb: up onto the window in front now, if there is one to sit on.
    func climbNow() { if visible, perch == nil, [.idle, .walk].contains(state) { _ = climb() } }

    // ------------------------------------------------------------------ public nudges
    func celebrate() { if state != .dangle { set(.purr, for: 4) } }
    func comeHere() {
        guard alerting == nil else { return }
        if perch != nil { getDown(); return }
        let m = NSEvent.mouseLocation
        go(to: m.x - size.width / 2)
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
        perch = nil
        lift = 0
        let to = CGPoint(x: feet.x - size.width / 2, y: feet.y - self.feet)
        // quick: a third of a second for a short hop, never much more than half a second
        let dist = Double(hypot(to.x - pos.x, to.y - pos.y))
        leap(to: to, kind: .tab, dur: min(0.6, 0.28 + dist / 4000))
        onHit = hit
        swipingUp = false
        return true
    }

    private func leap(to: CGPoint, kind: Jump, dur: Double? = nil, face: CGFloat? = nil) {
        facing = face ?? (to.x >= pos.x ? 1 : -1)
        let dist = Double(hypot(to.x - pos.x, to.y - pos.y))
        napping = false
        afterWalk = nil
        pounce = (pos, to, CACurrentMediaTime(), dur ?? min(0.9, 0.32 + dist / 2400), kind)
        set(.leap, for: 3)
        schedule(1.0 / 40)
    }

    // whatever interrupts the pounce, the tab still goes
    private func landHit() {
        let h = onHit
        onHit = nil; pounce = nil
        h?()
    }

    // ------------------------------------------------------------------ the balloon
    private func say(_ text: String, for seconds: Double) {
        balloon.show(text, for: seconds)
        placeBalloon()
    }
    private func placeBalloon() {
        guard balloon.shown else { return }
        // the top of the head: about (125, 40) in the cell, mirrored when facing left
        let hx = facing > 0 ? 125 * scale : (cell.width - 125) * scale
        balloon.place(pointingAt: CGPoint(x: pos.x + hx, y: pos.y + (cell.height - 34) * scale), toTheRight: facing > 0)
    }

    // ------------------------------------------------------------------ state machine
    private func set(_ s: State, for seconds: Double) {
        state = s
        until = Date().addingTimeInterval(seconds)
        if s != .walk { speed = 1; afterWalk = nil }
        let name: String
        switch s {
        case .idle: name = restAnim
        case .dangle, .fall: name = "dangle"
        default: name = anims["\(s)"] != nil ? "\(s)" : "idle"
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
        feel(now: now, dt: dt)
        mealClock += dt
        if mealClock > 30 { mealClock = 0; checkMeal(anyIdle) }
        if perch != nil { perchClock += dt; if perchClock > 0.5 { perchClock = 0; checkPerch() } }

        switch state {
        case .idle:
            if alerting != nil { answerAlert() }
            else if begging { if Date() < begUntil { set(.beg, for: begUntil.timeIntervalSinceNow) } else { giveUpMeal() } }
            else if anyIdle > (cat.lazy ? 60 : 120) { napping = false; set(.sleep, for: .infinity) }
            else if Date() > until { decide() }
        case .walk:
            let dir: CGFloat = targetX > pos.x ? 1 : -1
            facing = dir
            pos.x += dir * 27 * speed * CGFloat(dt)  // matches the stride of the 12-frame walk
            if abs(targetX - pos.x) < 3 * speed || (targetX - pos.x) * dir < 0 {
                pos.x = targetX
                let then = afterWalk
                set(.idle, for: Double.random(in: 4...9))
                then?()
            } else if Date() > until { set(.idle, for: 3) }
        case .sleep:
            if napping { if Date() > until { napping = false; set(.stretch, for: 1.1) } }
            else if anyIdle < 0.6 { set(.stretch, for: 1.1) }
        case .tap:
            if Date() > until { set(.idle, for: Double.random(in: 3...6)) }
        case .purr, .stretch, .groom:
            if Date() > until { set(.idle, for: 4) }
        case .eat:
            if Date() > until { set(.purr, for: 3) }
        case .bite:
            if Date() > until { runAway() }
        case .meow:
            if alerting != nil {
                if now > nextShout { nextShout = now + 4; say(cat.lazy ? "meong…" : "MEONG!", for: 2.2) }
            } else if Date() > until { set(.idle, for: 3) }
        case .beg:
            if Date() > until { giveUpMeal() }
            else if now > nextShout { nextShout = now + 60; say("lapar…", for: 5) }
        case .startle:
            liftV -= 2200 * CGFloat(dt)
            lift = max(0, lift + liftV * CGFloat(dt))
            if lift == 0 { liftV = 0 }
            if Date() > until && lift == 0 { set(.idle, for: 3) }
        case .stalk:
            let m = cursor
            facing = m.x >= pos.x + size.width / 2 ? 1 : -1
            if Date() > until { pounceAt(m.x) }
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
                let swipe = anims["swipe"].map { Double($0.count) / $0.fps } ?? 0.5
                switch p.kind {
                case .tab:
                    swipingUp = true
                    set(.swipe, for: swipe)
                case .laser:
                    pounce = nil
                    set(.swipe, for: swipe)
                case .perch(let id, let rect):
                    pounce = nil
                    perch = (id, rect)
                    perchClock = 0
                    set(.idle, for: 3)
                    onPerch?(self)
                }
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
        if !aloft { pos.y = groundOrigin() + lift; pos.x = min(max(pos.x, bounds.lowerBound), bounds.upperBound) }
        fullScreenClock += dt
        if fullScreenClock > 2 { fullScreenClock = 0; checkFullScreen() }

        // animate (taps advance per key instead of by time; running turns the walk faster)
        if let a = anims[anim], state != .tap, state != .leap {
            frameClock += dt * Double(state == .walk ? speed : 1)
            let step = 1 / a.fps
            while frameClock >= step {
                frameClock -= step
                frame = a.loop ? (frame + 1) % a.count : min(frame + 1, a.count - 1)
            }
        }
        place()
        hitTest()
        // asleep, one tick per breathing frame is enough to notice the first key or mouse move
        // and while the cursor plays at the bottom near him, 20 Hz to follow it
        schedule(state == .leap ? 1.0 / 40 : [.walk, .dangle, .fall, .swipe, .startle, .stalk].contains(state) || laserNear ? 1.0 / 20 : state == .sleep ? 1.0 / 4 : 1.0 / 10)
    }

    private func onKey() {
        // bongo is his thing; she sleeps on
        guard !cat.lazy else { return }
        switch state {
        case .sleep where !napping: set(.stretch, for: 1.1)
        case .idle, .walk, .tap:
            guard afterWalk == nil, !begging, alerting == nil else { return }
            if state != .tap { set(.tap, for: 1.3) } else { until = Date().addingTimeInterval(1.3) }
            if let a = anims["tap"] { frame = (frame + 1) % a.count }
        default: break
        }
    }

    private func decide() {
        let m = NSEvent.mouseLocation
        let r = Double.random(in: 0...1)
        // up on a window: a nap, a few steps, or back down
        if perch != nil {
            if r < 0.3 { napping = true; set(.sleep, for: Double.random(in: 60...180)) }
            else if r < 0.55 { getDown() }
            else if r < 0.75 { targetX = CGFloat.random(in: bounds); set(.walk, for: 12) }
            else { set(.idle, for: Double.random(in: 6...12)) }
            return
        }
        let restless = !(mood.rain || mood.lowBattery || mood.hot)
        // she walks less; he walks less while he watches Claude work
        let walky = (cat.lazy ? 0.45 : 1) * (mood.claude && !cat.lazy ? 0.5 : 1)
        if cat.lazy && r < 0.06 {
            napping = true
            set(.sleep, for: Double.random(in: 90...240))
        } else if restless && r > 0.94, climb() {
            // up onto the window in front
        } else if restless && m.y < groundOrigin() + 160, abs(m.x - pos.x) > 80, r < 0.35 * walky {
            // curious about the cursor near the floor
            targetX = min(max(m.x - size.width / 2, bounds.lowerBound), bounds.upperBound)
            set(.walk, for: 20)
        } else if restless && r < 0.7 * walky {
            var t = CGFloat.random(in: bounds)
            if abs(t - pos.x) < 90 { t = pos.x + (t > pos.x ? 160 : -160) }
            targetX = min(max(t, bounds.lowerBound), bounds.upperBound)
            set(.walk, for: 20)
        } else {
            set(.idle, for: Double.random(in: 5...10))
        }
    }

    // ------------------------------------------------------------------ the cursor: petting, the laser game
    private var lastMouse = CGPoint.zero
    private var stroked: CGFloat = 0
    private var petTime: Double = 0
    private var lastStroke: Double = 0
    private var trail: [(t: Double, p: CGPoint)] = []
    private var playAgain: Double = 0

    private var bodyRect: CGRect {
        let f = panel.frame
        return CGRect(x: f.minX + f.width * 0.18, y: f.minY + f.height * 0.06, width: f.width * 0.66, height: f.height * 0.62)
    }

    private func feel(now: Double, dt: Double) {
        let m = cursor
        defer { lastMouse = m }
        // petting: the cursor stroking slowly over him, no button down (a quick wiggle is the laser)
        let over = bodyRect.contains(m) && NSEvent.pressedMouseButtons == 0 && grab == nil
        let moved = hypot(m.x - lastMouse.x, m.y - lastMouse.y)
        if over && moved > 0.5 && moved < 500 * CGFloat(max(dt, 0.02)) { stroked += moved; lastStroke = now }
        if now - lastStroke < 0.6 { petTime += dt } else if now - lastStroke > 1.5 { stroked = 0; petTime = 0 }
        if stroked > 80 && now - lastStroke < 0.15 {
            if state == .purr && petTime > (cat.lazy ? 12 : 7) {
                // enough: a nip, then off
                stroked = 0; petTime = 0
                set(.bite, for: 0.5)
                return
            }
            if [.idle, .walk, .tap].contains(state) && afterWalk == nil { set(.purr, for: 1.6) }
            else if state == .purr { until = Date().addingTimeInterval(1.6) }
        }
        laser(now: now, m: m)
    }

    // The laser game. The strip at the bottom of the screen, from its very edge (over the Dock
    // too) to 160 pt above the floor, is the floor the "dot" runs on. The cursor moving there
    // near a cat: it turns to look. Wiggling, three turns since it came into the strip: the cat
    // crouches and pounces with its paw on it, and again as long as it keeps wiggling. A cat
    // farther off runs over first; a napping one wakes for it. Both play; she is a little slower.
    private var laserNear = false
    // guardia://pet/try/laser: a pretend cursor wiggling in front of him for a moment
    private var dot: CGPoint?
    private var cursor: CGPoint { dot ?? NSEvent.mouseLocation }
    func playLaser() {
        guard visible, perch == nil else { return }
        let x0 = pos.x + size.width / 2 + facing * 150, y = groundOrigin() + feet + 30, t0 = CACurrentMediaTime()
        Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { [weak self] t in
            let e = CACurrentMediaTime() - t0
            guard let self, e < 2.6 else { t.invalidate(); self?.dot = nil; return }
            self.dot = CGPoint(x: x0 + 70 * sin(e * 9), y: y)
        }
    }

    private func laser(now: Double, m: CGPoint) {
        let bottom = screen.frame.minY - 1, top = groundOrigin() + feet + 160
        let inStrip = { (p: CGPoint) in p.y >= bottom && p.y < top }
        trail.append((now, m))
        trail.removeAll { now - $0.t > 1.5 }
        let dist = abs(m.x - (pos.x + size.width / 2))
        laserNear = perch == nil && inStrip(m) && dist < 800
        guard laserNear, alerting == nil, !begging, grab == nil, !mood.lowBattery else { return }
        let resting = [.idle, .tap, .purr].contains(state) && afterWalk == nil
        let moving = trail.count >= 2 && hypot(m.x - trail[trail.count - 2].p.x, m.y - trail[trail.count - 2].p.y) > 2
        // it caught his eye
        if resting && moving && dist > 40 && dist < 420 { facing = m.x >= pos.x + size.width / 2 ? 1 : -1 }
        guard now > playAgain, resting || (state == .walk && afterWalk == nil) || (state == .sleep && napping) else { return }
        // the wiggle: the latest run of positions inside the strip
        var run = 0
        for t in trail.reversed() { if inStrip(t.p) { run += 1 } else { break } }
        let recent = Array(trail.suffix(run))
        guard recent.count >= 6, PetController.wiggles(recent.map(\.p)) else { return }
        napping = false
        if dist > 420 {
            // too far to leap: run over, and look again on the way
            go(to: m.x - size.width / 2, speed: cat.lazy ? 1.8 : 2.6)
            playAgain = now + 0.4
            return
        }
        facing = m.x >= pos.x + size.width / 2 ? 1 : -1
        set(.stalk, for: cat.lazy ? 0.9 : 0.55)
        playAgain = now + 2.5
    }

    /// A wiggle: three turns to and fro, 200 pt of sideways travel.
    static func wiggles(_ pts: [CGPoint]) -> Bool {
        var turns = 0, path: CGFloat = 0, lastDir: CGFloat = 0
        for (a, b) in zip(pts, pts.dropFirst()) {
            let dx = b.x - a.x
            path += abs(dx)
            if abs(dx) > 2 {
                let d: CGFloat = dx > 0 ? 1 : -1
                if lastDir != 0 && d != lastDir { turns += 1 }
                lastDir = d
            }
        }
        return turns >= 3 && path > 200
    }

    // the paw (about x 150 of the cell, facing right) lands on the dot
    private func pounceAt(_ x: CGFloat) {
        let paw = (facing > 0 ? 150 : cell.width - 150) * scale
        let tx = min(max(x - paw, bounds.lowerBound), bounds.upperBound)
        leap(to: CGPoint(x: tx, y: groundOrigin()), kind: .laser, dur: 0.42, face: facing)
    }

    private func runAway() {
        let away: CGFloat = lastMouse.x > pos.x + size.width / 2 ? -1 : 1
        go(to: pos.x + away * 300, speed: 2.4)
    }

    // ------------------------------------------------------------------ up on a window
    private func climb() -> Bool {
        guard let t = PetController.perchTarget(on: screen, size: size, avoidAbove: screen.frame.maxY - size.height - 12) else { return false }
        let x = min(max(pos.x, t.rect.minX + 6), t.rect.maxX - size.width - 6)
        leap(to: CGPoint(x: x, y: t.rect.maxY - feet), kind: .perch(t.id, t.rect))
        return true
    }

    /// Off the window, down to the floor.
    func getDown() {
        guard perch != nil else { return }
        perch = nil
        napping = false
        vy = 0
        set(.fall, for: 5)
    }

    /// The front window of the app in front, when it's an ordinary one with room above it.
    private static func perchTarget(on screen: NSScreen, size: CGSize, avoidAbove top: CGFloat) -> (id: CGWindowID, rect: CGRect)? {
        guard let app = NSWorkspace.shared.frontmostApplication, app.processIdentifier != ProcessInfo.processInfo.processIdentifier,
              let main = NSScreen.screens.first,
              let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
        for w in list where (w[kCGWindowOwnerPID as String] as? Int32) == app.processIdentifier && (w[kCGWindowLayer as String] as? Int) == 0 {
            guard let r = cocoaRect(w, main: main), let id = w[kCGWindowNumber as String] as? CGWindowID else { continue }
            // the app's front window, or none: big enough, on this screen, its top below the screen's
            guard r.width >= 320, r.height >= 200, screen.frame.intersects(r), r.maxY < top, r.maxY > screen.visibleFrame.minY + 140 else { return nil }
            return (id, r)
        }
        return nil
    }

    private static func cocoaRect(_ w: [String: Any], main: NSScreen) -> CGRect? {
        guard let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { return nil }
        let h = b["Height"] ?? 0
        return CGRect(x: b["X"] ?? 0, y: main.frame.maxY - (b["Y"] ?? 0) - h, width: b["Width"] ?? 0, height: h)
    }

    /// Still there, still where it was, nothing in front of where he sits? Otherwise down he goes.
    private func checkPerch() {
        guard let p = perch, let main = NSScreen.screens.first else { return }
        guard let info = (CGWindowListCopyWindowInfo([.optionIncludingWindow], p.id) as? [[String: Any]])?.first,
              (info[kCGWindowIsOnscreen as String] as? Bool) == true, let r = PetController.cocoaRect(info, main: main),
              abs(r.minX - p.rect.minX) < 1, abs(r.maxY - p.rect.maxY) < 1, abs(r.width - p.rect.width) < 1 else { getDown(); return }
        let seat = CGRect(x: pos.x + size.width * 0.2, y: p.rect.maxY, width: size.width * 0.6, height: size.height * 0.6)
        let above = CGWindowListCopyWindowInfo([.optionOnScreenAboveWindow, .excludeDesktopElements], p.id) as? [[String: Any]] ?? []
        let me = ProcessInfo.processInfo.processIdentifier
        for w in above where (w[kCGWindowLayer as String] as? Int) == 0 && (w[kCGWindowOwnerPID as String] as? Int32) != me
            && (w[kCGWindowOwnerName as String] as? String) != "borders" {
            if let wr = PetController.cocoaRect(w, main: main), wr.intersects(seat) { getDown(); return }
        }
    }

    // ------------------------------------------------------------------ mealtime
    // At noon and at seven in the evening, while someone is at the Mac: by the bowl, asking.
    private func checkMeal(_ anyIdle: Double) {
        guard !begging, running, !hiddenForFullScreen, alerting == nil, perch == nil, afterWalk == nil,
              [.idle, .walk].contains(state), anyIdle < 60, !mood.lowBattery else { return }
        let c = Calendar.current.dateComponents([.year, .month, .day, .hour], from: Date())
        guard let meal = c.hour == 12 ? "siang" : c.hour == 19 ? "malam" : nil else { return }
        let key = "\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0) \(meal)"
        guard UserDefaults.standard.string(forKey: "meal.\(cat.name)") != key else { return }
        mealKey = key
        beg()
    }

    private func beg() {
        begging = true
        begUntil = Date().addingTimeInterval(25 * 60)
        nextShout = 0
        // up on a window: down first, and he asks where he lands
        if perch != nil { getDown(); return }
        let spot = screen.frame.midX - size.width / 2 + (cat.lazy ? 90 : -90)
        go(to: spot, speed: 1.6) { [weak self] in
            guard let self, self.begging else { return }
            self.set(.beg, for: self.begUntil.timeIntervalSinceNow)
        }
    }

    private func feed() {
        begging = false
        UserDefaults.standard.set(mealKey, forKey: "meal.\(cat.name)")
        say("nyam nyam", for: 3)
        set(.eat, for: 7)
    }

    private func giveUpMeal() {
        begging = false
        UserDefaults.standard.set(mealKey, forKey: "meal.\(cat.name)")
        balloon.hide()
        set(.idle, for: 4)
    }

    // ------------------------------------------------------------------ drawing
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
        if shown.pos != p || shown.facing != facing { panel.setFrameOrigin(p); placeBalloon() }
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

    // Clicks only land on the cat itself; everywhere else passes through. Begging, or calling
    // for the alarm, the whole of him (and the bowl) takes the click.
    private var passThrough = true
    private func hitTest() {
        var through = false
        if state != .dangle {
            let whole = state == .beg || alerting != nil
            through = !(whole ? panel.frame.insetBy(dx: 4, dy: 4) : bodyRect).contains(NSEvent.mouseLocation)
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
        if !dragged {
            dragged = true; swipingUp = false; landHit()
            perch = nil; napping = false; lift = 0; begging = false
            set(.dangle, for: .infinity)
        }
        let m = NSEvent.mouseLocation
        // held by the scruff: the top of the head stays under the cursor
        pos = CGPoint(x: m.x - size.width / 2, y: m.y - size.height * 0.9)
        place()
    }
    func mouseUp() {
        if dragged { vy = 0; set(.fall, for: 5) }
        else if state == .beg { feed() }
        else if let a = alerting { alerting = nil; balloon.hide(); a(); set(.purr, for: 3) }
        else { set(.purr, for: 3.5) }
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
