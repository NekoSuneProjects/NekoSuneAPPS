'use strict'

// Compatibility controller for YimuQr's BOOTH "OSC Realistic leash system".
// Parameter behavior is derived from its public OSC surface and user-provided mapping;
// no files or implementation code from the paid product are included.

const DIRECTIONS = {
  MOF: { vertical: 1, horizontal: 0, label: 'Forward' },
  MOB: { vertical: -1, horizontal: 0, label: 'Back' },
  MOL: { vertical: 0, horizontal: -1, label: 'Left' },
  MOR: { vertical: 0, horizontal: 1, label: 'Right' },
  MOFL: { vertical: 1, horizontal: -1, label: 'Forward-left' },
  MOFR: { vertical: 1, horizontal: 1, label: 'Forward-right' },
  MOBL: { vertical: -1, horizontal: -1, label: 'Back-left' },
  MOBR: { vertical: -1, horizontal: 1, label: 'Back-right' }
}

class RealisticOscLeashController {
  constructor ({ sendInput, onUpdate = () => {} } = {}) {
    if (typeof sendInput !== 'function') throw new TypeError('Realistic leash controller requires sendInput(address, value, type)')
    this.sendInput = sendInput
    this.onUpdate = onUpdate
    this.config = { strength: 1, run: false, jumpMs: 120, jumpMoveMs: 260, jumpQAction: 'ignore' }
    this.enabled = false
    this.active = new Set()
    this.lastValues = new Map()
    this.direction = 'STOP'
    this.jumpTimer = null
    this.restoreTimer = null
  }

  configure (config = {}) {
    this.config = {
      strength: Math.max(0.1, Math.min(1, Number(config.strength) || 1)),
      run: !!config.run,
      jumpMs: Math.max(50, Math.min(500, Number(config.jumpMs) || 120)),
      jumpMoveMs: Math.max(100, Math.min(1200, Number(config.jumpMoveMs) || 260)),
      jumpQAction: ['ignore', 'jump', 'forward', 'right'].includes(config.jumpQAction) ? config.jumpQAction : 'ignore'
    }
    return this.getState()
  }

  setEnabled (enabled) {
    this.enabled = !!enabled
    if (!this.enabled) this.stop()
    this.emit('enabled')
    return this.getState()
  }

  handleOsc (address, args = []) {
    if (!this.enabled || !String(address).startsWith('/avatar/parameters/')) return false
    const parameter = decodeURIComponent(String(address).slice('/avatar/parameters/'.length))
    const value = this.toBoolean(args[0])
    const previous = this.lastValues.get(parameter) || false
    this.lastValues.set(parameter, value)

    if (DIRECTIONS[parameter]) {
      if (value) {
        this.active.add(parameter)
        this.applyDirection(parameter)
      } else {
        this.active.delete(parameter)
        if (this.direction === parameter) this.applyDirection([...this.active].pop() || 'STOP')
      }
      return true
    }

    if (parameter === 'STOP' && value) {
      this.active.clear()
      this.stop()
      this.emit('stop')
      return true
    }

    if (parameter === 'Realistic leash') {
      if (!value) { this.active.clear(); this.stop() }
      this.emit('master')
      return true
    }

    if (!value || previous) return ['Jump', 'JumpS', 'JumpA', 'JumpQ'].includes(parameter)
    if (parameter === 'Jump') this.jump()
    else if (parameter === 'JumpS') this.jumpWithDirection('MOB')
    else if (parameter === 'JumpA') this.jumpWithDirection('MOL')
    else if (parameter === 'JumpQ') {
      if (this.config.jumpQAction === 'jump') this.jump()
      if (this.config.jumpQAction === 'forward') this.jumpWithDirection('MOF')
      if (this.config.jumpQAction === 'right') this.jumpWithDirection('MOR')
      this.emit('jump-q')
    } else return false
    return true
  }

  toBoolean (value) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value > 0.5
    return /^(true|1|on)$/i.test(String(value || ''))
  }

  applyDirection (name) {
    if (name === 'STOP' || !DIRECTIONS[name]) return this.stop()
    const direction = DIRECTIONS[name]
    this.direction = name
    this.sendInput('/input/Vertical', direction.vertical * this.config.strength, 'float')
    this.sendInput('/input/Horizontal', direction.horizontal * this.config.strength, 'float')
    this.sendInput('/input/Run', this.config.run ? 1 : 0, 'int')
    this.emit('direction')
  }

  stop () {
    this.direction = 'STOP'
    this.sendInput('/input/Vertical', 0, 'float')
    this.sendInput('/input/Horizontal', 0, 'float')
    this.sendInput('/input/Run', 0, 'int')
  }

  jump () {
    if (this.jumpTimer) clearTimeout(this.jumpTimer)
    this.sendInput('/input/Jump', 1, 'int')
    this.jumpTimer = setTimeout(() => {
      this.sendInput('/input/Jump', 0, 'int')
      this.jumpTimer = null
    }, this.config.jumpMs)
    this.emit('jump')
  }

  jumpWithDirection (direction) {
    const restore = this.direction
    this.applyDirection(direction)
    this.jump()
    if (this.restoreTimer) clearTimeout(this.restoreTimer)
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null
      this.applyDirection(restore)
    }, this.config.jumpMoveMs)
  }

  emit (event) { this.onUpdate(this.getState(event)) }

  getState (event = '') {
    return {
      enabled: this.enabled,
      event,
      direction: this.direction,
      directionLabel: DIRECTIONS[this.direction]?.label || 'Stopped',
      active: [...this.active],
      config: { ...this.config }
    }
  }

  destroy () {
    if (this.jumpTimer) clearTimeout(this.jumpTimer)
    if (this.restoreTimer) clearTimeout(this.restoreTimer)
    this.jumpTimer = null
    this.restoreTimer = null
    this.active.clear()
    this.stop()
  }
}

module.exports = { RealisticOscLeashController, DIRECTIONS }
