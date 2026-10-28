import AppKit
import Carbon.HIToolbox

final class AppDelegate: NSObject, NSApplicationDelegate {
    let wallpaper = WallpaperController()
    let island = IslandController()
    let pet = PetController()
    let maestra = PetController(cat: .maestra)
    // the two cats together: their moods, the things that happen to both, their games
    lazy var household = Household(maestro: pet, maestra: maestra)
    let music = NowPlaying()
    let power = Power()
    let focus = FocusTimer()
    let alarms = Alarms()
    let focusGuard = FocusGuard()
    let ringer = Ringer()
    let folderIcons = FolderIcons()
    // what the room shows: notes, GitHub, Claude's sessions, batteries, the Mac's load, weather
    let widgets = Widgets()
    let notes = Notes()
    let photos = Photos()
    let sessions = ClaudeSessions()
    let github = GitHubStreak()
    let load = SystemLoad()
    let batteries = Batteries()
    let weather = Weather()
    lazy var launcher = Launcher(music: music, timer: focus, alarms: alarms, focus: focusGuard, pet: pet)
    private var status: NSStatusItem!
    private var searchKey: Hotkey?
    private var iconCheck: Timer?
    private let prefs = UserDefaults.standard

    private var wallpaperOn: Bool { get { prefs.object(forKey: "wallpaper") as? Bool ?? true } set { prefs.set(newValue, forKey: "wallpaper") } }
    private var petOn: Bool { get { prefs.object(forKey: "pet") as? Bool ?? true } set { prefs.set(newValue, forKey: "pet") } }
    private var maestraOn: Bool { get { prefs.object(forKey: "maestra") as? Bool ?? true } set { prefs.set(newValue, forKey: "maestra") } }
    private var islandOn: Bool { get { prefs.object(forKey: "island") as? Bool ?? true } set { prefs.set(newValue, forKey: "island") } }

    func applicationDidFinishLaunching(_ note: Notification) {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--set-wallpaper"), i + 1 < args.count {
            DesktopPicture.set(URL(fileURLWithPath: args[i + 1]))
            exit(0)
        }
        if args.contains("--restore-wallpaper") { DesktopPicture.restore(); exit(0) }
        if let i = args.firstIndex(of: "--set-icons"), i + 1 < args.count { exit(AppIcons.apply(args[i + 1]) ? 0 : 1) }
        if let i = args.firstIndex(of: "--restore-icons"), i + 1 < args.count { exit(AppIcons.restore(args[i + 1]) ? 0 : 1) }
        if let i = CommandLine.arguments.firstIndex(of: "--snapshot"), i + 1 < CommandLine.arguments.count {
            island.timer = focus
            island.launcher = launcher
            island.notes = notes
            launcher.notes = notes
            launcher.photos = photos
            Snapshot.run(into: CommandLine.arguments[i + 1], delegate: self)
            return
        }
        power.start()
        wallpaper.lowPower = !power.state.onAC
        // the room is always there: live, or a still of itself when "Wallpaper hidup" is off
        wallpaper.start(live: wallpaperOn)

        island.timer = focus
        island.launcher = launcher
        island.power = power.state
        island.notes = notes
        launcher.notes = notes
        launcher.openNotes = { [weak self] in self?.island.openNotes() }
        launcher.photos = photos
        launcher.maestra = maestra
        startWidgets()
        launcher.fill = { [weak self] t in self?.island.fill(t) }
        island.actions = (
            prev: { [weak self] in self?.music.previous() },
            play: { [weak self] in self?.music.playPause() },
            next: { [weak self] in self?.music.next() }
        )
        focusGuard.timer = focus
        focusGuard.pet = pet
        focusGuard.island = island
        focusGuard.onChange = { [weak self] in guard let self else { return }; self.island.focusOn = self.focusGuard.on }
        alarms.onRing = { [weak self] a in
            guard let self else { return }
            self.ring(title: "Alarm \(Alarms.clock(a.date))", subtitle: a.label.isEmpty ? "sudah waktunya" : a.label,
                      action: ("tunda 5 menit", { [weak self] in self?.alarms.snooze(a) }))
        }
        alarms.onMissed = { [weak self] a in self?.island.showToast(icon: "bell", text: "Alarm \(Alarms.clock(a.date)) terlewat saat Mac tidur", seconds: 8) }
        alarms.onChange = { [weak self] in self?.island.refresh() }
        alarms.start()
        island.onMenu = { [weak self] view, p in
            guard let self else { return }
            self.buildMenu().popUp(positioning: nil, at: p, in: view)
        }
        if islandOn { island.start() }
        if petOn { pet.start() }
        if maestraOn { maestra.start() }
        household.mood.lowBattery = !power.state.onAC && power.state.percent <= 20
        household.start()
        wallpaper.onThunder = { [weak self] in self?.household.thunder() }
        // ⌃Space opens (and closes) the island's search from anywhere, full-screen apps too
        searchKey = Hotkey(keyCode: kVK_Space, modifiers: controlKey, id: 1) { [weak self] in
            guard let self else { return }
            if self.island.searching { self.island.closeSearch() } else { self.openSearch() }
        }

        var lastArt = 0
        music.onChange = { [weak self] t, isNew in
            guard let self else { return }
            self.island.nowPlaying = t
            self.household.mood.music = t?.playing ?? false
            if isNew { self.island.trackChanged() }
            let artKey = (t?.id.hashValue ?? 0) ^ (t?.artHex.count ?? 0)
            if isNew || artKey != lastArt { lastArt = artKey; self.wallpaper.setNowPlaying(t) }
        }
        music.start()

        power.onChange = { [weak self] old, new in
            guard let self else { return }
            self.island.power = new
            self.wallpaper.lowPower = !new.onAC
            self.batteries.publish()
            self.household.mood.lowBattery = !new.onAC && new.percent <= 20
            if new.onAC && !old.onAC { self.island.showToast(icon: "plug", text: "Ngecas · \(new.percent)%"); self.household.plugged() }
            if !new.onAC && new.percent <= 15 && old.percent > 15 { self.island.showToast(icon: "low", text: "Baterai tinggal \(new.percent)%", seconds: 5) }
        }
        focus.onChange = { [weak self] in self?.island.refresh() }
        focus.onFinish = { [weak self] kind, name in
            guard let self else { return }
            switch kind {
            case .focus:
                self.focusGuard.end()
                self.ring(title: "Fokus selesai", subtitle: "Maestro bangga. Istirahat sebentar?",
                          action: ("istirahat 5 menit", { [weak self] in self?.focus.start(seconds: 300, kind: .rest) }))
            case .rest:
                self.ring(title: "Istirahat selesai", subtitle: "lanjut yuk", action: ("fokus 25 menit", { [weak self] in self?.focusGuard.begin(minutes: 25) }))
            case .timer:
                self.ring(title: "Timer selesai", subtitle: name, action: ("tambah 5 menit", { [weak self] in self?.focus.start(seconds: 300, kind: .timer, label: name == "timer" ? "" : name) }))
            }
        }

        // app updates bring original icons back: say so now and then (the island's search fixes it)
        let checkIcons = { [weak self] in
            let lost = AppIcons.missing()
            guard let self, !lost.isEmpty else { return }
            self.island.showToast(icon: "cat", text: "\(lost.count) ikon app kembali ke asli · klik island → Pasang ulang ikon", seconds: 8)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: checkIcons)
        folderIcons.start()
        iconCheck = Timer.scheduledTimer(withTimeInterval: 6 * 3600, repeats: true) { _ in checkIcons() }

        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        status.button?.image = AppDelegate.catIcon()
        status.menu = buildMenu()
    }

    /// Every source of the room's widgets reports to `widgets`, which hands the changes to the page.
    private func startWidgets() {
        widgets.wallpaper = wallpaper
        notes.onChange = { [weak self] t in self?.widgets.set("notes", t) }
        widgets.set("notes", notes.text)
        let frames = { (urls: [String?]) -> [Any] in urls.map { $0 ?? NSNull() } }
        photos.onChange = { [weak self] urls in self?.widgets.set("photos", frames(urls)) }
        widgets.set("photos", frames(photos.urls))
        sessions.onChange = { [weak self] list in self?.widgets.set("sessions", list.map { ["name": $0.name, "running": $0.running] }) }
        // the cats watch Claude work, and hear when a session hands the turn back
        sessions.onWork = { [weak self] busy, done in
            guard let self else { return }
            self.household.mood.claude = busy
            if let done { self.household.handBack(done) }
        }
        sessions.start()
        github.onChange = { [weak self] card in self?.widgets.set("github", card) }
        github.start()
        load.onChange = { [weak self] level in
            self?.widgets.set("load", level)
            self?.household.mood.hot = level == "red"
        }
        load.start()
        batteries.onChange = { [weak self] dials in self?.widgets.set("batteries", dials) }
        batteries.start()
        weather.onLocation = { [weak self] lat, lon in self?.wallpaper.setLocation(lat, lon) }
        weather.onWeather = { [weak self] w in self?.showWeather(w) }
        weather.start()
    }

    /// The window shows it; the cats curl up when it rains.
    private func showWeather(_ w: [String: Any]) {
        widgets.set("weather", w)
        let kind = w["kind"] as? String
        household.mood.rain = kind == "rain" || kind == "storm"
    }

    /// The island rings with a bell until dismissed (a minute at most); the cats come running to
    /// the middle and meow until it is (a click on either dismisses it).
    private var ringID = 0
    private func ring(title: String, subtitle: String, action: (String, () -> Void)?) {
        ringID += 1
        let id = ringID
        let stop = { [weak self] in
            guard let self, self.ringID == id else { return }
            self.ringer.stop(); self.island.endRing(); self.household.alertEnd()
        }
        ringer.start()
        household.alert(dismiss: stop)
        island.ring(title: title, subtitle: subtitle, action: action.map { a in (a.0, { stop(); a.1() }) }, dismiss: stop)
        DispatchQueue.main.asyncAfter(deadline: .now() + 62) { stop() }
    }

    // guardia://focus/25 · guardia://rest/5 · guardia://stop · guardia://pet/come · guardia://maestra/off ·
    // guardia://pet/try/thunder (claude, meal, chase, groom, swat, plug) · guardia://weather/rain
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            let parts = ([url.host ?? ""] + url.pathComponents.filter { $0 != "/" })
            switch parts.first {
            case "focus": focusGuard.begin(minutes: Int(parts.dropFirst().first ?? "25") ?? 25)
            case "rest": focus.start(minutes: Int(parts.dropFirst().first ?? "5") ?? 5, rest: true)
            case "stop": launcher.stopTimer()
            case "search": openSearch()
            case "pet":
                switch parts.dropFirst().first {
                case "on": setPet(true)
                case "off": setPet(false)
                case "try": household.show(parts.dropFirst(2).first ?? "")
                default: callPet()
                }
            case "maestra":
                switch parts.dropFirst().first {
                case "on": setMaestra(true)
                case "off": setMaestra(false)
                default: callMaestra()
                }
            case "wallpaper":
                switch parts.dropFirst().first {
                case "on": setWallpaper(true)
                case "off": setWallpaper(false)
                default: wallpaper.verify()
                }
            case "island":
                switch parts.dropFirst().first {
                case "off": setIsland(false)
                default: setIsland(true)
                }
            case "playpause": music.playPause()
            case "icons":
                // guardia://icons/apply · guardia://icons/restore: run the icon script in a terminal of
                // the user's own (only a terminal they allow may change other apps)
                let verb = parts.dropFirst().first == "restore" ? "restore" : "apply"
                if let repo = AppIcons.repo { Projects.terminal(in: repo, run: "./scripts/app-icons.sh \(verb)") }
            case "status": writeStatus()
            case "weather":
                // guardia://weather/rain (clear, partly, cloudy, rain, storm, fog): try a sky until
                // the next real report, at most twenty minutes later
                if let kind = parts.dropFirst().first { showWeather(["kind": kind, "amount": 0.7]) }
            default: break
            }
        }
    }

    private func buildMenu() -> NSMenu {
        let m = NSMenu()
        func item(_ title: String, _ sel: Selector, _ tag: Int = 0, on: Bool? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: sel, keyEquivalent: "")
            i.target = self; i.tag = tag
            if let on { i.state = on ? .on : .off }
            return i
        }
        let search = item("Cari…", #selector(openSearch))
        search.keyEquivalent = " "; search.keyEquivalentModifierMask = [.control] // shown only: the hot key does the work
        m.addItem(search)
        m.addItem(.separator())
        m.addItem(item("Mode fokus 25 menit", #selector(startFocus(_:)), 25))
        m.addItem(item("Mode fokus 50 menit", #selector(startFocus(_:)), 50))
        m.addItem(item("Istirahat 5 menit", #selector(startRest(_:)), 5))
        if focus.running || focusGuard.on { m.addItem(item("Hentikan timer dan mode fokus", #selector(stopTimer))) }
        m.addItem(.separator())
        m.addItem(item("Panggil Maestro", #selector(callPet)))
        m.addItem(item("Panggil Maestra", #selector(callMaestra)))
        m.addItem(item("Maestro", #selector(togglePet), on: petOn))
        m.addItem(item("Maestra", #selector(toggleMaestra), on: maestraOn))
        m.addItem(item("Dynamic island", #selector(toggleIsland), on: islandOn))
        m.addItem(item("Wallpaper hidup", #selector(toggleWallpaper), on: wallpaperOn))
        m.addItem(.separator())
        m.addItem(item("Keluar dari Guardia", #selector(quit)))
        m.delegate = self
        return m
    }

    @objc private func openSearch() {
        if !islandOn { setIsland(true) }
        island.openSearch()
    }
    @objc private func startFocus(_ s: NSMenuItem) { focusGuard.begin(minutes: s.tag) }
    @objc private func startRest(_ s: NSMenuItem) { focus.start(minutes: s.tag, rest: true) }
    @objc private func stopTimer() { launcher.stopTimer() }
    @objc private func callPet() { if petOn { pet.comeHere() } }
    @objc private func togglePet() { setPet(!petOn) }
    @objc private func callMaestra() { if maestraOn { maestra.comeHere() } }
    @objc private func toggleMaestra() { setMaestra(!maestraOn) }
    @objc private func toggleIsland() { setIsland(!islandOn) }
    @objc private func toggleWallpaper() { setWallpaper(!wallpaperOn) }

    private func setPet(_ on: Bool) { petOn = on; on ? pet.start() : pet.stop() }
    private func setMaestra(_ on: Bool) { maestraOn = on; on ? maestra.start() : maestra.stop() }
    private func setIsland(_ on: Bool) { islandOn = on; on ? island.start() : island.stop() }
    private func setWallpaper(_ on: Bool) {
        wallpaperOn = on
        wallpaper.setLive(on)
        if on { wallpaper.setNowPlaying(music.track) }
    }

    /// guardia://status writes what each part is doing to ~/.guardia/status.json (for checking from a terminal).
    private func writeStatus() {
        let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".guardia")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let mood = household.mood
        let s: [String: Any] = ["time": ISO8601DateFormatter().string(from: Date()), "pet": pet.debugState, "maestra": maestra.debugState,
                                "household": household.debugState.merging(["mood": ["rain": mood.rain, "music": mood.music, "lowBattery": mood.lowBattery,
                                                                                      "hot": mood.hot, "claude": mood.claude]]) { a, _ in a },
                                "wallpaper": wallpaper.debugState,
                                "island": ["running": island.running, "searching": island.searching, "notes": island.editingNotes], "folders": folderIcons.debugState,
                                "focus": focusGuard.on, "timer": focus.running, "alarms": alarms.list.count,
                                "widgets": widgets.debugState, "load": load.debug, "weather": weather.debug, "hotkey": searchKey?.registered ?? false]
        if let d = try? JSONSerialization.data(withJSONObject: s, options: [.prettyPrinted, .sortedKeys]) { try? d.write(to: dir.appendingPathComponent("status.json")) }
    }
    @objc private func quit() { notes.flush(); NSApp.terminate(nil) }

    static func catIcon() -> NSImage {
        let img = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { r in
            guard let ctx = NSGraphicsContext.current?.cgContext else { return false }
            let c = CGPoint(x: 9, y: 10.5), s: CGFloat = 6.2
            var head: [CGPoint] = []
            for i in 0..<20 { let a = CGFloat(i) / 20 * .pi * 2; head.append(CGPoint(x: c.x + cos(a) * s, y: c.y + sin(a) * s * 0.82)) }
            let ear1 = [CGPoint(x: c.x - s * 0.9, y: c.y - s * 0.1), CGPoint(x: c.x - s * 0.72, y: c.y - s * 1.3), CGPoint(x: c.x - s * 0.1, y: c.y - s * 0.75)]
            let ear2 = [CGPoint(x: c.x + s * 0.9, y: c.y - s * 0.1), CGPoint(x: c.x + s * 0.72, y: c.y - s * 1.3), CGPoint(x: c.x + s * 0.1, y: c.y - s * 0.75)]
            for shape in [head, ear1, ear2] { Ink.fill(shape, .black, in: ctx) }
            ctx.setBlendMode(.clear)
            ctx.fillEllipse(in: CGRect(x: c.x - 3.4, y: c.y - 1.2, width: 1.8, height: 2.6))
            ctx.fillEllipse(in: CGRect(x: c.x + 1.6, y: c.y - 1.2, width: 1.8, height: 2.6))
            return true
        }
        img.isTemplate = true
        return img
    }
}

extension AppDelegate: NSMenuDelegate {
    func menuNeedsUpdate(_ menu: NSMenu) {
        let fresh = buildMenu()
        menu.removeAllItems()
        for i in fresh.items { fresh.removeItem(i); menu.addItem(i) }
    }
}

// The still of the room as the system desktop picture (lock screen, Mission Control),
// remembering what was there before so uninstall can put it back.
enum DesktopPicture {
    static let key = "previousDesktopPictures"
    static func set(_ url: URL) {
        let ws = NSWorkspace.shared
        var previous = UserDefaults.standard.dictionary(forKey: key) as? [String: String] ?? [:]
        for screen in NSScreen.screens {
            let id = String(screen.displayID ?? 0)
            if previous[id] == nil, let cur = ws.desktopImageURL(for: screen), cur != url { previous[id] = cur.path }
            try? ws.setDesktopImageURL(url, for: screen, options: [.imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue, .allowClipping: true])
        }
        UserDefaults.standard.set(previous, forKey: key)
    }
    static func restore() {
        let ws = NSWorkspace.shared
        let previous = UserDefaults.standard.dictionary(forKey: key) as? [String: String] ?? [:]
        for screen in NSScreen.screens {
            guard let path = previous[String(screen.displayID ?? 0)] ?? previous.values.first else { continue }
            try? ws.setDesktopImageURL(URL(fileURLWithPath: path), for: screen, options: [:])
        }
        UserDefaults.standard.removeObject(forKey: key)
    }
}
