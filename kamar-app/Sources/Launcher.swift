import AppKit

// The island's search: a short list of things to do, filtered as you type. Rows come from
// Claude Code (a new terminal in a project), Spotify, recent VS Code projects, timers and
// alarms typed in plain Indonesian ("10m", "alarm 7.30 bangun"), and focus mode.
struct Command {
    enum Icon { case terminal, music, next, prev, folder, timer, alarm, focus, cat, search, star, stop, home }
    var title: String
    var subtitle: String = ""
    var icon: Icon
    var keywords: String = ""
    var boost: Double = 0
    var hint: String = ""             // right-aligned, e.g. "⌘↵ claude"
    var alt: (() -> Void)? = nil      // ⌘↵
    var keepOpen = false              // rows that open a sub-list or fill the field
    var run: () -> Void
}

final class Launcher {
    enum List { case root, claude }
    private(set) var list: List = .root
    var fill: ((String) -> Void)?
    var onList: ((List) -> Void)?

    private let music: NowPlaying
    private let timer: FocusTimer
    private let alarms: Alarms
    private let focus: FocusGuard
    private let pet: PetController
    let favorites = Favorites()

    init(music: NowPlaying, timer: FocusTimer, alarms: Alarms, focus: FocusGuard, pet: PetController) {
        self.music = music; self.timer = timer; self.alarms = alarms; self.focus = focus; self.pet = pet
    }

    func enter(_ l: List) { list = l; onList?(l) }

    func stopTimer() { focus.end(); timer.stop() }

    func results(_ raw: String) -> [Command] {
        let q = Launcher.fold(raw.trimmingCharacters(in: .whitespaces))
        let rows = list == .claude ? claudeRows(q) : rootRows(q, raw: raw.trimmingCharacters(in: .whitespaces))
        return Array(rows.prefix(7))
    }

    // ------------------------------------------------------------------ lists
    private func rootRows(_ q: String, raw: String) -> [Command] {
        var dynamic: [Command] = []
        if let uri = Favorites.uri(from: raw) {
            dynamic.append(Command(title: "Simpan ke favorit Spotify", subtitle: uri, icon: .star, boost: 50) { [weak self] in self?.favorites.add(uri) })
        }
        if let a = Launcher.alarm(q) {
            let t = String(format: "%02d.%02d", a.hour, a.minute)
            dynamic.append(Command(title: "Alarm \(t)" + (a.label.isEmpty ? "" : " · \(a.label)"), subtitle: Alarms.when(hour: a.hour, minute: a.minute),
                                   icon: .alarm, boost: 40) { [weak self] in self?.alarms.add(hour: a.hour, minute: a.minute, label: a.label) })
        }
        if let f = Launcher.focusMinutes(q) {
            dynamic.append(Command(title: "Mode fokus \(f) menit", subtitle: "si Oren menjaga Chrome dari Instagram, TikTok, YouTube, X", icon: .focus, boost: 40) { [weak self] in
                self?.focus.begin(minutes: f)
            })
        } else if let d = Launcher.duration(q) {
            dynamic.append(Command(title: "Timer \(Launcher.spell(d.seconds))" + (d.label.isEmpty ? "" : " · \(d.label)"), subtitle: "bunyi di island saat selesai",
                                   icon: .timer, boost: 40) { [weak self] in self?.timer.start(seconds: d.seconds, kind: .timer, label: d.label) })
        }

        var rows: [Command] = []
        // what's happening now comes first
        if let t = music.track {
            rows.append(Command(title: t.playing ? "Jeda" : "Lanjut putar", subtitle: "\(t.title) — \(t.artist)", icon: .music,
                                keywords: "spotify musik lagu putar play pause jeda", boost: q.isEmpty ? 5 : 0) { [weak self] in self?.music.playPause() })
            rows.append(Command(title: "Lagu berikutnya", icon: .next, keywords: "next skip lagu spotify musik", boost: q.isEmpty ? 4 : 0) { [weak self] in self?.music.next() })
            rows.append(Command(title: "Lagu sebelumnya", icon: .prev, keywords: "previous prev lagu spotify musik") { [weak self] in self?.music.previous() })
        } else {
            rows.append(Command(title: "Putar Spotify", subtitle: "lanjutkan lagu terakhir · ketik judul untuk mencari", icon: .music,
                                keywords: "spotify musik lagu putar play", boost: q.isEmpty ? 0.6 : 0) { [weak self] in self?.music.play() })
        }
        if timer.running {
            let left = Launcher.clock(timer.remaining)
            rows.append(Command(title: "Hentikan \(timer.name)", subtitle: "\(left) lagi", icon: .stop, keywords: "stop hentikan berhenti batal timer fokus istirahat",
                                boost: q.isEmpty ? 6 : 0) { [weak self] in self?.stopTimer() })
        }
        if focus.on && !timer.running {
            rows.append(Command(title: "Matikan mode fokus", icon: .stop, keywords: "fokus focus stop matikan berhenti", boost: q.isEmpty ? 6 : 0) { [weak self] in self?.focus.end() })
        }
        rows.append(Command(title: "Claude Code baru…", subtitle: "pilih project, lalu terminal baru menjalankan claude", icon: .terminal,
                            keywords: "claude code cc terminal ghostty ai baru new", boost: q.isEmpty ? 3 : 0, keepOpen: true) { [weak self] in self?.enter(.claude) })
        if !focus.on {
            rows.append(Command(title: "Mode fokus 25 menit", subtitle: "si Oren menjaga Chrome dari Instagram, TikTok, YouTube, X", icon: .focus,
                                keywords: "fokus focus mode kerja belajar 25", boost: q.isEmpty ? 2 : 0) { [weak self] in self?.focus.begin(minutes: 25) })
            rows.append(Command(title: "Mode fokus 50 menit", subtitle: "si Oren menjaga Chrome", icon: .focus, keywords: "fokus focus mode kerja belajar 50") { [weak self] in self?.focus.begin(minutes: 50) })
        }
        rows.append(Command(title: "Istirahat 5 menit", icon: .timer, keywords: "istirahat rehat break rest 5") { [weak self] in self?.timer.start(seconds: 300, kind: .rest) })
        rows.append(Command(title: "Timer atau alarm…", subtitle: "ketik misalnya 10m, 1 jam 30, alarm 7.30 bangun", icon: .alarm,
                            keywords: "timer alarm pengingat bangun jam menit", boost: q.isEmpty ? 1 : 0, keepOpen: true) { [weak self] in self?.fill?("timer ") })
        for a in alarms.list {
            rows.append(Command(title: "Hapus alarm \(Alarms.clock(a.date))" + (a.label.isEmpty ? "" : " · \(a.label)"), subtitle: Alarms.day(a.date), icon: .alarm,
                                keywords: "alarm hapus batal \(a.label)") { [weak self] in self?.alarms.remove(a.id) })
        }
        for f in favorites.items {
            rows.append(Command(title: "Putar \(f.name)", subtitle: "favorit Spotify", icon: .star, keywords: "spotify putar play playlist favorit \(f.name)",
                                boost: q.isEmpty ? 0.5 : 0, hint: "⌘↵ hapus", alt: { [weak self] in self?.favorites.remove(f.uri) }) { [weak self] in self?.music.play(uri: f.uri) })
        }
        rows.append(Command(title: "Panggil si Oren", icon: .cat, keywords: "kucing cat oren panggil sini") { [weak self] in self?.pet.comeHere() })

        // recent projects: the top three when empty, any that match while typing
        let projects = Projects.recent()
        for (i, p) in projects.enumerated() where !q.isEmpty || i < 3 {
            rows.append(Command(title: p.name, subtitle: Launcher.tilde(p.url), icon: .folder, keywords: "vscode code project proyek buka open",
                                boost: q.isEmpty ? 0.2 - Double(i) * 0.01 : 0, hint: "⌘↵ claude",
                                alt: { Projects.claude(in: p.url) }) { Projects.openInCode(p) })
        }
        // "claude <name>" goes straight to a project
        let words = q.split(separator: " ").map(String.init)
        if let first = words.first, ["claude", "cc"].contains(first) {
            let rest = words.dropFirst().joined(separator: " ")
            for p in projects where rest.isEmpty || Launcher.score(rest, Launcher.fold(p.name)) != nil {
                rows.append(Command(title: "Claude Code · \(p.name)", subtitle: Launcher.tilde(p.url), icon: .terminal, boost: 20) { Projects.claude(in: p.url) })
            }
        }

        let scored: [(Double, Command)] = rows.compactMap { c in
            if q.isEmpty { return c.boost > 0 ? (c.boost, c) : nil }
            guard let s = Launcher.score(q, Launcher.fold(c.title + " " + c.keywords)) else { return c.boost >= 20 ? (c.boost, c) : nil }
            return (s + c.boost, c)
        }
        var out = dynamic + scored.sorted { $0.0 > $1.0 }.map { $0.1 }
        // anything else typed: look it up in Spotify
        if q.count >= 2, dynamic.isEmpty {
            let stripped = Launcher.strip(raw, prefixes: ["putar", "play", "lagu", "spotify", "cari"])
            let lead = q.hasPrefix("putar") || q.hasPrefix("play") || q.hasPrefix("lagu") || q.hasPrefix("spotify")
            let search = Command(title: "Cari “\(stripped)” di Spotify", subtitle: "membuka hasil pencarian di Spotify", icon: .search) { [weak self] in self?.music.search(stripped) }
            if lead && !stripped.isEmpty { out.insert(search, at: 0) } else if !stripped.isEmpty { out.append(search) }
        }
        return out
    }

    private func claudeRows(_ q: String) -> [Command] {
        let home = FileManager.default.homeDirectoryForCurrentUser
        var rows = [Command(title: "Home", subtitle: "~", icon: .home, keywords: "home rumah ~") { Projects.claude(in: home) }]
        for p in Projects.recent() {
            rows.append(Command(title: p.name, subtitle: Launcher.tilde(p.url), icon: .folder) { Projects.claude(in: p.url) })
        }
        if q.isEmpty { return rows }
        return rows.compactMap { c in Launcher.score(q, Launcher.fold(c.title + " " + c.keywords)).map { ($0, c) } }
            .sorted { $0.0 > $1.0 }.map { $0.1 }
    }

    // ------------------------------------------------------------------ matching
    static func fold(_ s: String) -> String { s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil).lowercased() }

    /// Every word of the query must appear: as a word start (best), inside a word, or as letters in order.
    static func score(_ q: String, _ hay: String) -> Double? {
        var total = 0.0
        for w in q.split(separator: " ").map(String.init) where !w.isEmpty {
            if hay.hasPrefix(w) { total += 4 }
            else if hay.contains(" " + w) { total += 3 }
            else if hay.contains(w) { total += 1.5 }
            else if inOrder(w, hay) { total += 0.4 }
            else { return nil }
        }
        return total
    }

    private static func inOrder(_ w: String, _ hay: String) -> Bool {
        var it = hay.makeIterator()
        for ch in w { var found = false; while let h = it.next() { if h == ch { found = true; break } }; if !found { return false } }
        return true
    }

    private static func strip(_ raw: String, prefixes: [String]) -> String {
        var words = raw.split(separator: " ").map(String.init)
        while let f = words.first, prefixes.contains(fold(f)) { words.removeFirst() }
        return words.joined(separator: " ")
    }

    // ------------------------------------------------------------------ plain-language parsing
    /// "10", "10m", "10 menit", "1j30", "1 jam 30 menit", "90 detik", "timer 25 masak"
    static func duration(_ q: String) -> (seconds: Double, label: String)? {
        var words = q.split(separator: " ").map(String.init)
        var explicit = false
        if let f = words.first, ["timer", "tmr", "ingatkan", "pengingat"].contains(f) { words.removeFirst(); explicit = true }
        let text = words.joined(separator: " ")
        guard let re = try? NSRegularExpression(pattern: "^((?:\\d+\\s*(?:(?:jam|menit|mnt|min|detik|dtk|j|h|m|d|s)(?![a-z]))?\\s*)+)(.*)$") else { return nil }
        guard let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let r1 = Range(m.range(at: 1), in: text), let r2 = Range(m.range(at: 2), in: text) else { return nil }
        let part = String(text[r1])
        guard let unitRe = try? NSRegularExpression(pattern: "(\\d+)\\s*(jam|j|h|menit|mnt|min|m|detik|dtk|d|s)?(?![a-z])") else { return nil }
        var seconds = 0.0, lastUnit = 3600.0
        for u in unitRe.matches(in: part, range: NSRange(part.startIndex..., in: part)) {
            guard let nr = Range(u.range(at: 1), in: part), let n = Double(part[nr]) else { continue }
            var unit = 60.0
            if let ur = Range(u.range(at: 2), in: part) {
                switch String(part[ur]) {
                case "jam", "j", "h": unit = 3600
                case "detik", "dtk", "d", "s": unit = 1
                default: unit = 60
                }
            } else if lastUnit == 3600 && seconds > 0 { unit = 60 } // "1j30": the bare 30 after hours is minutes
            seconds += n * unit; lastUnit = unit
        }
        let label = String(text[r2]).trimmingCharacters(in: .whitespaces)
        // a bare number is only a timer when nothing else was typed after it
        if !explicit && !label.isEmpty { return nil }
        guard seconds >= 1, seconds <= 24 * 3600 else { return nil }
        return (seconds, label)
    }

    /// "alarm 7", "alarm 7.30 bangun", "bangunin 6.15", "jam 19.00 masak", or a bare "7.30"
    static func alarm(_ q: String) -> (hour: Int, minute: Int, label: String)? {
        guard let re = try? NSRegularExpression(pattern: "^(?:(alarm|bangunin|bangun|jam|ingatkan jam)\\s+)?(\\d{1,2})(?:[.:](\\d{2}))?\\s*(.*)$") else { return nil }
        guard let m = re.firstMatch(in: q, range: NSRange(q.startIndex..., in: q)) else { return nil }
        let hasWord = m.range(at: 1).location != NSNotFound
        let hasMinutes = m.range(at: 3).location != NSNotFound
        guard hasWord || hasMinutes, let hr = Range(m.range(at: 2), in: q), let h = Int(q[hr]), h < 24 else { return nil }
        var minute = 0
        if hasMinutes, let mr = Range(m.range(at: 3), in: q) { minute = Int(q[mr]) ?? 0 }
        guard minute < 60 else { return nil }
        let label = Range(m.range(at: 4), in: q).map { String(q[$0]) } ?? ""
        if !hasWord && !label.isEmpty { return nil }
        return (h, minute, label)
    }

    /// "fokus", "fokus 50", "mode fokus 30", "focus 45"
    static func focusMinutes(_ q: String) -> Int? {
        guard let re = try? NSRegularExpression(pattern: "^(?:mode\\s+)?(?:fokus|focus)(?:\\s+(\\d{1,3}))?(?:\\s*(?:m|menit|mnt))?$") else { return nil }
        guard let m = re.firstMatch(in: q, range: NSRange(q.startIndex..., in: q)) else { return nil }
        if let r = Range(m.range(at: 1), in: q), let n = Int(q[r]) { return max(1, min(240, n)) }
        return 25
    }

    static func spell(_ s: Double) -> String {
        let total = Int(s.rounded())
        let h = total / 3600, m = (total % 3600) / 60, sec = total % 60
        var parts: [String] = []
        if h > 0 { parts.append("\(h) jam") }
        if m > 0 { parts.append("\(m) menit") }
        if sec > 0 { parts.append("\(sec) detik") }
        return parts.joined(separator: " ")
    }

    static func clock(_ s: Double) -> String {
        let t = max(0, Int(s.rounded(.up)))
        return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, (t % 3600) / 60, t % 60) : String(format: "%02d:%02d", t / 60, t % 60)
    }

    static func tilde(_ url: URL) -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return url.path.hasPrefix(home) ? "~" + url.path.dropFirst(home.count) : url.path
    }
}

// Spotify playlists, albums and artists saved by pasting their link into the search.
final class Favorites {
    struct Item: Codable { var name: String; let uri: String }
    private(set) var items: [Item] = []
    private let key = "spotifyFavorites"

    init() {
        if let d = UserDefaults.standard.data(forKey: key), let list = try? JSONDecoder().decode([Item].self, from: d) { items = list }
    }

    /// open.spotify.com/playlist/ID?si=… or spotify:playlist:ID → spotify:playlist:ID
    static func uri(from text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespaces)
        guard let re = try? NSRegularExpression(pattern: "(?:open\\.spotify\\.com/(?:intl-[a-z]+/)?|spotify:)(playlist|album|artist|track)[/:]([A-Za-z0-9]{10,})") else { return nil }
        guard let m = re.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)),
              let a = Range(m.range(at: 1), in: t), let b = Range(m.range(at: 2), in: t) else { return nil }
        return "spotify:\(t[a]):\(t[b])"
    }

    func add(_ uri: String) {
        guard !items.contains(where: { $0.uri == uri }) else { return }
        let parts = uri.split(separator: ":")
        items.append(Item(name: parts.count > 1 ? String(parts[1]) : "Spotify", uri: uri))
        save()
        // the real name from Spotify's public oEmbed endpoint
        guard parts.count == 3, let url = URL(string: "https://open.spotify.com/oembed?url=https://open.spotify.com/\(parts[1])/\(parts[2])") else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let title = j["title"] as? String else { return }
            DispatchQueue.main.async {
                guard let self, let i = self.items.firstIndex(where: { $0.uri == uri }) else { return }
                self.items[i].name = title
                self.save()
            }
        }.resume()
    }

    func remove(_ uri: String) { items.removeAll { $0.uri == uri }; save() }

    private func save() { UserDefaults.standard.set(try? JSONEncoder().encode(items), forKey: key) }
}
