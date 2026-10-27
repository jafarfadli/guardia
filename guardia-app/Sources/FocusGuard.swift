import AppKit

// Focus mode. While it's on, Maestro keeps an eye on Chrome: the moment the tab you're looking
// at is Instagram, TikTok, YouTube or X, it is closed, he swipes his paw where he stands, and
// the island says what happened. Chrome is only asked while it is the frontmost app, so focus
// mode never launches it.
final class FocusGuard {
    static let sites: [(host: String, name: String)] = [("instagram.com", "Instagram"), ("tiktok.com", "TikTok"), ("youtube.com", "YouTube"),
                                                        ("youtu.be", "YouTube"), ("x.com", "X"), ("twitter.com", "X")]
    struct Tab { let url: String; let tabID: Int; let windowID: Int }

    private(set) var on = false
    var onChange: (() -> Void)?
    var timer: FocusTimer?
    weak var pet: PetController?
    weak var island: IslandController?

    private var poll: Timer?
    private var busy = false

    func begin(minutes: Int) {
        timer?.start(seconds: Double(minutes) * 60, kind: .focus)
        guard !on else { onChange?(); return }
        on = true
        poll = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in self?.check() }
        poll?.tolerance = 0.2
        onChange?()
    }

    func end() {
        guard on else { return }
        on = false
        poll?.invalidate(); poll = nil
        if let t = timer, t.running, t.kind == .focus { t.stop() }
        onChange?()
    }

    // ------------------------------------------------------------------ watching
    private static let query = """
    tell application "Google Chrome"
        if (count of windows) is 0 then return ""
        set w to front window
        set t to active tab of w
        return (URL of t) & linefeed & (id of t) & linefeed & (id of w)
    end tell
    """

    private func check() {
        guard on, !busy, NSWorkspace.shared.frontmostApplication?.bundleIdentifier == "com.google.Chrome" else { return }
        busy = true
        AppleScript.run(FocusGuard.query) { [weak self] out in
            guard let self else { return }
            self.busy = false
            guard self.on, let tab = out.flatMap(FocusGuard.parse), let name = FocusGuard.site(tab.url) else { return }
            AppleScript.run("tell application \"Google Chrome\" to close (every tab of (window id \(tab.windowID)) whose id is \(tab.tabID))")
            self.pet?.swipeHere()
            self.island?.showToast(icon: "cat", text: "Maestro menutup \(name)", seconds: 3)
        }
    }

    static func parse(_ out: String) -> Tab? {
        let f = out.components(separatedBy: "\n")
        guard f.count >= 3, let tid = Int(f[1]), let wid = Int(f[2]) else { return nil }
        return Tab(url: f[0], tabID: tid, windowID: wid)
    }

    static func site(_ url: String) -> String? {
        guard let host = URL(string: url)?.host?.lowercased() else { return nil }
        return sites.first { host == $0.host || host.hasSuffix("." + $0.host) }?.name
    }
}
