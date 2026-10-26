import AppKit

// What's playing in Spotify or Music. State arrives through the players' own distributed
// notifications (no permission needed); play/pause/next go through Apple Events (asks once).
final class NowPlaying {
    struct Track: Equatable {
        var source: String          // "Spotify" | "Music"
        var id: String
        var title: String
        var artist: String
        var playing: Bool
        var duration: Double         // seconds
        var position: Double         // seconds at `stamp`
        var stamp: Date
        var art: CGImage?            // pixel-art cover (16 × 16)
        var artHex: [String]
        var currentPosition: Double { playing ? min(duration, position + Date().timeIntervalSince(stamp)) : position }
        static func == (a: Track, b: Track) -> Bool { a.id == b.id && a.playing == b.playing && a.title == b.title }
    }

    private(set) var track: Track?
    var onChange: ((Track?, _ newTrack: Bool) -> Void)?
    private var artCache: [String: (CGImage, [String])] = [:]

    func start() {
        let dnc = DistributedNotificationCenter.default()
        dnc.addObserver(self, selector: #selector(spotify(_:)), name: NSNotification.Name("com.spotify.client.PlaybackStateChanged"), object: nil)
        dnc.addObserver(self, selector: #selector(music(_:)), name: NSNotification.Name("com.apple.Music.playerInfo"), object: nil)
        if NSRunningApplication.runningApplications(withBundleIdentifier: "com.spotify.client").first != nil { querySpotify() }
    }

    @objc private func spotify(_ n: Notification) {
        let u = n.userInfo ?? [:]
        let state = u["Player State"] as? String ?? "Stopped"
        if state == "Stopped" { update(nil); return }
        let id = u["Track ID"] as? String ?? ""
        let t = Track(source: "Spotify", id: id, title: u["Name"] as? String ?? "", artist: u["Artist"] as? String ?? "",
                      playing: state == "Playing", duration: (u["Duration"] as? Double ?? 0) / 1000,
                      position: u["Playback Position"] as? Double ?? 0, stamp: Date(), art: nil, artHex: [])
        update(t)
    }

    @objc private func music(_ n: Notification) {
        let u = n.userInfo ?? [:]
        let state = u["Player State"] as? String ?? "Stopped"
        if state == "Stopped" { update(nil); return }
        let pid = (u["PersistentID"] as? NSNumber)?.stringValue ?? (u["Name"] as? String ?? "")
        let t = Track(source: "Music", id: "music:" + pid, title: u["Name"] as? String ?? "", artist: u["Artist"] as? String ?? "",
                      playing: state == "Playing", duration: (u["Total Time"] as? Double ?? 0) / 1000,
                      position: 0, stamp: Date(), art: nil, artHex: [])
        update(t)
    }

    private func update(_ t: Track?) {
        let isNew = t?.id != track?.id
        var t = t
        if let id = t?.id, let cached = artCache[id] { t?.art = cached.0; t?.artHex = cached.1 }
        track = t
        onChange?(t, isNew)
        if let t, t.art == nil, t.source == "Spotify", t.id.hasPrefix("spotify:track:") { fetchArt(for: t.id) }
    }

    // ------------------------------------------------------------------ controls
    func playPause() { send("playpause") }
    func play() { send("play") }
    func next() { send("next track") }
    func previous() { send(track?.source == "Music" ? "back track" : "previous track") }

    /// A playlist, album, artist or track URI (from the favourites in the island's search).
    func play(uri: String) {
        let safe = uri.filter { $0.isLetter || $0.isNumber || $0 == ":" }
        AppleScript.run("tell application \"Spotify\" to play track \"\(safe)\"")
    }

    /// Opens Spotify's own search on the query; picking a result stays in Spotify.
    func search(_ q: String) {
        let enc = q.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? q
        if let url = URL(string: "spotify:search:\(enc)") { NSWorkspace.shared.open(url) }
    }

    private func send(_ cmd: String) {
        let app = track?.source ?? "Spotify"
        DispatchQueue.global(qos: .userInitiated).async {
            var err: NSDictionary?
            NSAppleScript(source: "tell application \"\(app)\" to \(cmd)")?.executeAndReturnError(&err)
        }
    }

    private func querySpotify() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let src = """
            tell application "Spotify"
              if player state is stopped then return ""
              set t to current track
              return (name of t) & "\\n" & (artist of t) & "\\n" & (id of t) & "\\n" & (duration of t) & "\\n" & (player position) & "\\n" & (player state as string)
            end tell
            """
            var err: NSDictionary?
            guard let out = NSAppleScript(source: src)?.executeAndReturnError(&err).stringValue, !out.isEmpty else { return }
            let f = out.components(separatedBy: "\n")
            guard f.count >= 6 else { return }
            let t = Track(source: "Spotify", id: f[2], title: f[0], artist: f[1], playing: f[5] == "playing",
                          duration: (Double(f[3]) ?? 0) / 1000, position: Double(f[4].replacingOccurrences(of: ",", with: ".")) ?? 0,
                          stamp: Date(), art: nil, artHex: [])
            DispatchQueue.main.async { self?.update(t) }
        }
    }

    // ------------------------------------------------------------------ cover → pixel art
    private func fetchArt(for id: String) {
        let trackID = id.replacingOccurrences(of: "spotify:track:", with: "")
        guard let url = URL(string: "https://open.spotify.com/oembed?url=https://open.spotify.com/track/\(trackID)") else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data, let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let thumb = obj["thumbnail_url"] as? String, let turl = URL(string: thumb) else { return }
            URLSession.shared.dataTask(with: turl) { data, _, _ in
                guard let data, let img = NSImage(data: data), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil),
                      let (pix, hex) = Pixelate.cover(cg, size: 16, colors: 7) else { return }
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.artCache[id] = (pix, hex)
                    if self.track?.id == id { self.track?.art = pix; self.track?.artHex = hex; self.onChange?(self.track, false) }
                }
            }.resume()
        }.resume()
    }
}

// A cover shrunk to a few pixels and a short palette, the way people-in-pictures are drawn
// in the room. k-means on 256 pixels is instant.
enum Pixelate {
    static func cover(_ img: CGImage, size n: Int, colors k: Int) -> (CGImage, [String])? {
        let cs = CGColorSpace(name: CGColorSpace.sRGB)!
        guard let ctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: n, height: n))
        guard let raw = ctx.data else { return nil }
        let buf = raw.bindMemory(to: UInt8.self, capacity: n * n * 4)
        var px: [[Double]] = []
        for i in 0..<(n * n) { px.append([Double(buf[i * 4]), Double(buf[i * 4 + 1]), Double(buf[i * 4 + 2])]) }
        // k-means++-ish seeding: spread initial centres through the pixel list
        var centres = (0..<k).map { px[($0 * px.count) / k] }
        var assign = [Int](repeating: 0, count: px.count)
        for _ in 0..<8 {
            for (i, p) in px.enumerated() {
                var best = 0, bd = Double.infinity
                for (j, c) in centres.enumerated() {
                    let d = (p[0] - c[0]) * (p[0] - c[0]) + (p[1] - c[1]) * (p[1] - c[1]) + (p[2] - c[2]) * (p[2] - c[2])
                    if d < bd { bd = d; best = j }
                }
                assign[i] = best
            }
            for j in 0..<k {
                let members = px.indices.filter { assign[$0] == j }
                guard !members.isEmpty else { continue }
                var s = [0.0, 0.0, 0.0]
                for m in members { s[0] += px[m][0]; s[1] += px[m][1]; s[2] += px[m][2] }
                centres[j] = s.map { $0 / Double(members.count) }
            }
        }
        // a gentle print fade toward the room's cream so covers sit in the palette
        let cream = [226.0, 209.0, 174.0]
        let faded = centres.map { c in (0..<3).map { c[$0] * 0.86 + cream[$0] * 0.14 } }
        var hex: [String] = []
        for y in 0..<n {
            for x in 0..<n {
                // bitmap memory runs top row first, which is the order the sleeve wants
                let i = y * n + x
                let c = faded[assign[i]]
                hex.append(String(format: "#%02X%02X%02X", Int(c[0]), Int(c[1]), Int(c[2])))
                buf[i * 4] = UInt8(c[0]); buf[i * 4 + 1] = UInt8(c[1]); buf[i * 4 + 2] = UInt8(c[2]); buf[i * 4 + 3] = 255
            }
        }
        guard let out = ctx.makeImage() else { return nil }
        return (out, hex)
    }
}
