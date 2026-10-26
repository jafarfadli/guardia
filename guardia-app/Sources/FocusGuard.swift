import AppKit

// Focus mode. While it's on, Maestro keeps an eye on Chrome: when the tab you're looking at is
// Instagram, TikTok, YouTube or X, he runs over, jumps onto the tab and waits five seconds. The
// island offers "biarin" (that site is fine for ten minutes); otherwise he swipes the tab shut.
// Chrome is only asked while it is the frontmost app, so focus mode never launches it.
final class FocusGuard {
    static let sites: [(host: String, name: String)] = [("instagram.com", "Instagram"), ("tiktok.com", "TikTok"), ("youtube.com", "YouTube"),
                                                        ("youtu.be", "YouTube"), ("x.com", "X"), ("twitter.com", "X")]
    struct Tab { let url: String; let tabID: Int; let windowID: Int; let index: Int; let count: Int; let bounds: CGRect }

    private(set) var on = false
    var onChange: (() -> Void)?
    var timer: FocusTimer?
    weak var pet: PetController?
    weak var island: IslandController?
    var petAround: () -> Bool = { true }

    private var poll: Timer?
    private var allowed: [String: Date] = [:]
    private var visit: (tab: Tab, name: String)?

    func begin(minutes: Int) {
        timer?.start(seconds: Double(minutes) * 60, kind: .focus)
        guard !on else { onChange?(); return }
        on = true
        poll = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in self?.check() }
        poll?.tolerance = 0.3
        onChange?()
    }

    func end() {
        guard on else { return }
        on = false
        poll?.invalidate(); poll = nil
        if visit != nil { finish() }
        if let t = timer, t.running, t.kind == .focus { t.stop() }
        onChange?()
    }

    // ------------------------------------------------------------------ watching
    private static let query = """
    tell application "Google Chrome"
        if (count of windows) is 0 then return ""
        set w to front window
        set t to active tab of w
        set b to bounds of w
        return (URL of t) & linefeed & (id of t) & linefeed & (id of w) & linefeed & (active tab index of w) & linefeed & (count of tabs of w) & linefeed & (item 1 of b) & "," & (item 2 of b) & "," & (item 3 of b) & "," & (item 4 of b)
    end tell
    """

    private func chromeInFront() -> Bool { NSWorkspace.shared.frontmostApplication?.bundleIdentifier == "com.google.Chrome" }

    private func check() {
        guard on, visit == nil, chromeInFront() else { return }
        AppleScript.run(FocusGuard.query) { [weak self] out in
            guard let self, self.on, self.visit == nil, let tab = out.flatMap(FocusGuard.parse), let name = FocusGuard.site(tab.url) else { return }
            if let until = self.allowed[name], until > Date() { return }
            self.start(tab, name)
        }
    }

    static func parse(_ out: String) -> Tab? {
        let f = out.components(separatedBy: "\n")
        guard f.count >= 6, let tid = Int(f[1]), let wid = Int(f[2]), let idx = Int(f[3]), let n = Int(f[4]) else { return nil }
        let b = f[5].split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
        guard b.count == 4 else { return nil }
        return Tab(url: f[0], tabID: tid, windowID: wid, index: idx, count: n, bounds: CGRect(x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1]))
    }

    static func site(_ url: String) -> String? {
        guard let host = URL(string: url)?.host?.lowercased() else { return nil }
        return sites.first { host == $0.host || host.hasSuffix("." + $0.host) }?.name
    }

    /// Where the cat's feet go: on the tab's lower edge, in Cocoa screen coordinates. Chrome
    /// reports its window in top-left coordinates; tabs share the strip between the traffic
    /// lights and the buttons on the right, up to 240 pt each.
    static func feet(on tab: Tab) -> CGPoint? {
        guard let main = NSScreen.screens.first else { return nil }
        let b = tab.bounds
        let left: CGFloat = 80, right: CGFloat = 100
        let w = min(240, max(60, b.width - left - right) / CGFloat(max(1, tab.count)))
        let x = b.minX + left + (CGFloat(tab.index) - 0.5) * w
        return CGPoint(x: x, y: main.frame.height - (b.minY + 38))
    }

    // ------------------------------------------------------------------ the visit
    private func start(_ tab: Tab, _ name: String) {
        visit = (tab, name)
        let countdown = { [weak self] in
            guard let self, self.visit != nil else { return }
            self.island?.showGuard(site: name, seconds: 5, allow: { [weak self] in self?.allow() })
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in self?.strike() }
        }
        if petAround(), let pet, let feet = FocusGuard.feet(on: tab), pet.canReach(feet) {
            pet.investigate(feet, perched: countdown, pulledAway: { [weak self] in self?.allow() })
        } else {
            countdown()
        }
    }

    private func strike() {
        guard let v = visit else { return }
        // only if that tab is still the one in front
        AppleScript.run(FocusGuard.query) { [weak self] out in
            guard let self, let cur = self.visit, cur.tab.tabID == v.tab.tabID else { return }
            guard let now = out.flatMap(FocusGuard.parse), now.tabID == v.tab.tabID, FocusGuard.site(now.url) != nil else { self.finish(); return }
            let close = { [weak self] in
                AppleScript.run("tell application \"Google Chrome\" to close (every tab of (window id \(v.tab.windowID)) whose id is \(v.tab.tabID))")
                self?.finish()
                self?.island?.showToast(icon: "cat", text: "Maestro menutup \(v.name)", seconds: 3.5)
            }
            if let pet = self.pet, pet.isPerched { pet.swipe(then: close) } else { close() }
        }
    }

    private func allow() {
        guard let v = visit else { return }
        allowed[v.name] = Date().addingTimeInterval(600)
        finish()
        island?.showToast(icon: "cat", text: "Oke, \(v.name) boleh 10 menit", seconds: 3.5)
    }

    private func finish() {
        visit = nil
        island?.endGuard()
        pet?.drop()
    }
}
