import AppKit

// Hand-inked drawing for native surfaces, matching wallpaper/src/ink.js: strokes are filled
// ribbons whose width breathes and wobbles a little, so nothing looks machine-drawn.
enum Ink {
    static func hash(_ n: Int) -> Double {
        var x = UInt32(truncatingIfNeeded: n)
        x = (x ^ (x >> 16)) &* 0x45d9f3b
        x = (x ^ (x >> 16)) &* 0x45d9f3b
        x ^= x >> 16
        return Double(x) / Double(UInt32.max) * 2 - 1
    }

    static func noise(_ x: Double, seed: Int) -> Double {
        let i = Int(floor(x)), f = x - floor(x)
        let u = f * f * (3 - 2 * f)
        return hash(i &+ seed &* 7919) * (1 - u) + hash(i &+ 1 &+ seed &* 7919) * u
    }

    /// Fill a ribbon along a polyline. `width` in points.
    static func stroke(_ pts: [CGPoint], width: CGFloat, color: NSColor, seed: Int = 1, taper: CGFloat = 0.5, wobble: CGFloat = 0.35, in ctx: CGContext) {
        guard pts.count > 1 else { return }
        var p: [CGPoint] = [pts[0]]
        for i in 1..<pts.count {
            let a = pts[i - 1], b = pts[i]
            let d = hypot(b.x - a.x, b.y - a.y)
            let n = max(1, Int(ceil(d / 2.0)))
            for k in 1...n { let t = CGFloat(k) / CGFloat(n); p.append(CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)) }
        }
        var s: [CGFloat] = [0]
        for i in 1..<p.count { s.append(s[i - 1] + hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y)) }
        let L = s.last ?? 0
        guard L > 0.3 else { return }
        let tl = min(L * 0.35, 6)
        var left: [CGPoint] = [], right: [CGPoint] = []
        for i in 0..<p.count {
            let a = p[max(0, i - 1)], b = p[min(p.count - 1, i + 1)]
            var tx = b.x - a.x, ty = b.y - a.y
            let l = max(0.0001, hypot(tx, ty)); tx /= l; ty /= l
            let nx = -ty, ny = tx
            var w = width * CGFloat(1 + 0.28 * noise(Double(s[i]) * 0.09 + Double(seed) * 1.37, seed: seed))
            if taper > 0 {
                let e = min(1, min(s[i], L - s[i]) / tl)
                w *= 1 - taper + taper * (0.2 + 0.8 * pow(e, 0.7))
            }
            let j = wobble * CGFloat(noise(Double(s[i]) * 0.06 + Double(seed) * 5.11, seed: seed + 3))
            let x = p[i].x + nx * j, y = p[i].y + ny * j
            left.append(CGPoint(x: x + nx * w / 2, y: y + ny * w / 2))
            right.append(CGPoint(x: x - nx * w / 2, y: y - ny * w / 2))
        }
        ctx.beginPath()
        ctx.move(to: left[0])
        for q in left.dropFirst() { ctx.addLine(to: q) }
        for q in right.reversed() { ctx.addLine(to: q) }
        ctx.closePath()
        ctx.setFillColor(color.cgColor)
        ctx.fillPath()
    }

    /// Points around a rounded rectangle, nudged by low-frequency noise (a hand-cut shape).
    static func paperShape(_ r: CGRect, radius: CGFloat, seed: Int, jitter: CGFloat = 0.6, squareTop: Bool = false) -> [CGPoint] {
        var pts: [CGPoint] = []
        let rr = min(radius, r.height / 2, r.width / 2)
        func arc(_ c: CGPoint, _ a0: CGFloat, _ a1: CGFloat, _ rad: CGFloat) {
            for i in 0...8 { let a = a0 + (a1 - a0) * CGFloat(i) / 8; pts.append(CGPoint(x: c.x + cos(a) * rad, y: c.y + sin(a) * rad)) }
        }
        let topR = squareTop ? 1.5 : rr
        arc(CGPoint(x: r.maxX - rr, y: r.minY + rr), -.pi / 2, 0, rr)
        arc(CGPoint(x: r.maxX - topR, y: r.maxY - topR), 0, .pi / 2, topR)
        arc(CGPoint(x: r.minX + topR, y: r.maxY - topR), .pi / 2, .pi, topR)
        arc(CGPoint(x: r.minX + rr, y: r.minY + rr), .pi, 1.5 * .pi, rr)
        // densify the straight runs and jitter everything a touch
        var out: [CGPoint] = []
        for i in 0..<pts.count {
            let a = pts[i], b = pts[(i + 1) % pts.count]
            let d = hypot(b.x - a.x, b.y - a.y)
            let n = max(1, Int(d / 6))
            for k in 0..<n {
                let t = CGFloat(k) / CGFloat(n)
                let q = CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
                let s = Double(out.count) * 0.15
                out.append(CGPoint(x: q.x + jitter * CGFloat(noise(s, seed: seed)), y: q.y + jitter * CGFloat(noise(s + 40, seed: seed + 9))))
            }
        }
        return out
    }

    static func fill(_ pts: [CGPoint], _ color: NSColor, in ctx: CGContext) {
        guard let f = pts.first else { return }
        ctx.beginPath(); ctx.move(to: f)
        for q in pts.dropFirst() { ctx.addLine(to: q) }
        ctx.closePath()
        ctx.setFillColor(color.cgColor)
        ctx.fillPath()
    }

    /// Ink a closed outline edge-by-edge in a few long strokes (overshooting a little at joins).
    static func outline(_ pts: [CGPoint], width: CGFloat, color: NSColor, seed: Int, in ctx: CGContext) {
        let n = pts.count
        guard n > 3 else { return }
        let parts = 4
        for k in 0..<parts {
            let a = k * n / parts, b = (k + 1) * n / parts + 2
            var run: [CGPoint] = []
            for i in a...b { run.append(pts[i % n]) }
            stroke(run, width: width, color: color, seed: seed + k * 17, taper: 0.35, in: ctx)
        }
    }

    static func font(_ size: CGFloat, weight: NSFont.Weight = .bold) -> NSFont {
        let base = NSFont(name: Theme.lettering, size: size) ?? NSFont.systemFont(ofSize: size, weight: weight)
        // Shantell Sans is variable: ask for the weight through the descriptor
        let desc = base.fontDescriptor.addingAttributes([.traits: [NSFontDescriptor.TraitKey.weight: weight]])
        return NSFont(descriptor: desc, size: size) ?? base
    }
}
