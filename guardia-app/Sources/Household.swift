import AppKit

// Maestro and Maestra together. What goes on around them (rain, music, an empty battery, a hot
// Mac, Claude at work) reaches both; lightning, an alarm and the charger too. Every few seconds,
// when both are on this desktop with nothing to do, they may play: a chase, one grooming the
// other, him swatting her tail while she naps (she jumps, then chases him), sleeping side by side
// once you're away, and a squabble when both want the same window.
final class Household {
    let maestro: PetController
    let maestra: PetController
    var mood = PetController.Mood() { didSet { maestro.mood = mood; maestra.mood = mood } }
    private var timer: Timer?
    private var quietUntil = Date().addingTimeInterval(45)
    private var together = false
    private(set) var lastPlay = "-"

    init(maestro: PetController, maestra: PetController) {
        self.maestro = maestro
        self.maestra = maestra
        for c in [maestro, maestra] { c.onPerch = { [weak self] c in self?.landed(c) } }
    }

    func start() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { [weak self] _ in self?.tick() }
        timer?.tolerance = 1
    }

    private func other(_ c: PetController) -> PetController { c === maestro ? maestra : maestro }
    private var both: Bool { maestro.visible && maestra.visible }

    // ------------------------------------------------------------------ what happens to both
    func thunder() {
        maestro.startle()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in self?.maestra.startle() }
    }

    /// Claude handed the turn back: Maestro says so (Maestra when he's off).
    func handBack(_ name: String) { (maestro.visible ? maestro : maestra).handBack(name) }

    func alert(dismiss: @escaping () -> Void) { maestro.alert(dismiss: dismiss); maestra.alert(dismiss: dismiss) }
    func alertEnd() { maestro.alertEnd(); maestra.alertEnd() }
    func plugged() {
        maestro.plugged()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.maestra.plugged() }
    }

    // ------------------------------------------------------------------ playing together
    private func tick() {
        guard both else { together = false; return }
        sleepTogether()
        guard Date() > quietUntil else { return }
        let r = Double.random(in: 0...1)
        let calm = mood.rain || mood.lowBattery || mood.hot
        if maestra.asleep && maestra.napping && maestro.free && r < 0.12 { swatTail() }
        else if maestro.free && maestra.free {
            if !calm && r < 0.07 { chase() } else if r < 0.13 { groom() }
        }
    }

    /// One runs off; the other runs after and swats on arriving.
    func chase(runner: PetController? = nil) {
        let a = runner ?? (Bool.random() ? maestro : maestra), b = other(a)
        let mid = (NSScreen.screens.first?.frame.midX ?? 720) - a.size.width / 2
        let dir: CGFloat = a.x < mid ? 1 : -1
        let goal = a.go(to: a.x + dir * CGFloat.random(in: 380...620), speed: 2.6)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak b] in
            guard let b else { return }
            b.go(to: goal - dir * b.size.width * 0.75, speed: 2.6) { [weak b] in b?.act(.swipe, for: 0.5, facing: dir) }
        }
        played("chase")
    }

    /// One walks up to the other and licks its head; the other purrs.
    func groom() {
        let g = Bool.random() ? maestro : maestra, o = other(g)
        // the one being groomed stays put
        o.act(.idle, for: 30)
        let side: CGFloat = g.x < o.x ? -1 : 1
        g.go(to: o.x + side * g.size.width * 0.42) { [weak g, weak o] in
            guard let g, let o, o.state == .idle else { return }
            g.act(.groom, for: 6, facing: -side)
            o.act(.purr, for: 6, facing: side)
        }
        played("groom")
    }

    /// She naps; he sneaks up behind her and swats her tail three times. She jumps, then chases him.
    func swatTail() {
        let f = maestra.facing
        // her rear is behind her; his swipe lands about 0.79 of his width ahead of him
        let rear = maestra.x + (f > 0 ? 0.28 : 0.72) * maestra.size.width
        let spot = f > 0 ? rear - 0.79 * maestro.size.width : rear - 0.21 * maestro.size.width
        maestro.go(to: spot) { [weak self] in
            guard let self else { return }
            for k in 0..<3 {
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(k) * 0.62) { [weak self] in
                    guard let self, self.maestra.asleep else { return }
                    self.maestro.act(.swipe, for: 0.5, facing: f)
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.9) { [weak self] in
                guard let self, self.maestra.asleep else { return }
                self.maestra.startle()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in self?.chase(runner: self?.maestro) }
            }
        }
        played("swat")
    }

    /// Both asleep (you're away): she gets up and lies down again by his side, back to back.
    private func sleepTogether() {
        guard maestro.asleep, maestra.asleep, !maestro.napping, !maestra.napping, maestro.perch == nil, maestra.perch == nil else {
            if !maestro.asleep || !maestra.asleep { together = false }
            return
        }
        guard !together else { return }
        together = true
        let side: CGFloat = maestra.x < maestro.x ? -1 : 1
        let spot = maestro.x + side * maestro.size.width * 0.62
        guard abs(maestra.x - spot) > 20 else { return }
        maestra.go(to: spot) { [weak self] in self?.maestra.act(.sleep, for: .infinity, facing: side) }
        lastPlay = "sleep together"
    }

    /// Both on the same window, close: the newcomer pushes the other off.
    private func landed(_ c: PetController) {
        let o = other(c)
        guard let id = c.perch?.id, o.perch?.id == id, abs(o.x - c.x) < c.size.width * 1.1 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak c, weak o] in
            guard let c, let o, c.perch?.id == id, o.perch?.id == id else { return }
            c.act(.swipe, for: 0.5, facing: o.x > c.x ? 1 : -1)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { o.getDown() }
        }
        lastPlay = "squabble"
    }

    private func played(_ what: String) {
        lastPlay = what
        quietUntil = Date().addingTimeInterval(90)
    }

    /// guardia://pet/try/<what>: show one now (thunder, claude, meal, feed, chase, groom, swat, plug, climb, laser).
    func show(_ what: String) {
        switch what {
        case "thunder": thunder()
        case "claude": handBack("DESKTOP")
        case "meal": maestro.askForFood(); maestra.askForFood()
        case "feed": maestro.feedNow(); maestra.feedNow()
        case "climb": maestro.climbNow()
        case "laser": maestro.playLaser(); maestra.playLaser()
        case "chase": chase()
        case "groom": groom()
        case "swat": maestra.nap(for: 60); swatTail()
        case "plug": plugged()
        default: break
        }
    }

    var debugState: [String: Any] { ["lastPlay": lastPlay, "together": together, "quietFor": max(0, quietUntil.timeIntervalSinceNow)] }
}
