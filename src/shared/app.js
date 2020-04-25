const Avalon = require('../games/avalon')
// const panzoom = require('panzoom')
// const Panzoom = require('@panzoom/panzoom')
const ActionBar = require('./ui/action-bar')
const { zoneToSelector } = require('./util')

const PLAYER_HAND_ZONE = /^player\/([^/]+)\/hand/
const TRANSLATE_COORDS = /translate\(([0-9\.\-]+)px, *([0-9\.\-]+)px\)/

let actionBar;

let game, scale;
let app = module.exports
app.game;
app.tableScale = 1
app.currentPlayer = 'p1'

app.sync = sync
app.start = startAvalon
app.findInHand = findInHand

app.playerNames = {
  p1: 'Player 1',
  p2: 'Player 2',
  p3: 'Player 3',
  p4: 'Player 4',
  p5: 'Player 5',
  p6: 'Player 6',
  p7: 'Player 7',
  p8: 'Player 8',
  p9: 'Player 9',
  p10: 'Player 10',
}

async function startAvalon() {
  app.game = (game = Avalon.createGame())
  await game.addPlayer('p1')
  await game.addPlayer('p2')
  await game.addPlayer('p3')
  await game.addPlayer('p4')
  await game.addPlayer('p5')

  await game.addConfig('roles', 'merlin')
  await game.addConfig('roles', 'servant_1')
  await game.addConfig('roles', 'servant_2')
  await game.addConfig('roles', 'assassin')
  await game.addConfig('roles', 'minion_1')

  $table.innerHTML = await Avalon.views.table(app)
  $handBar.innerHTML = await Avalon.views.handBar(app)

  //
  // TODO, SOMEONE: Math here is off, could definitely be more accurate.
  //
  const padding = 100
  scale = app.tableScale = Math.max(
    Math.min(1, (window.innerWidth - padding) / ($tableCanvas.offsetWidth - padding/2)),
    Math.min(1, (window.innerHeight - padding) / ($tableCanvas.offsetHeight - padding/2)),
  )

  $table.style.transform = `scale(${scale})`
  $handBar.style.transform = `scale(${scale}) translateY(100%)`

  $tableCanvas.dataset.originalWidth = $tableCanvas.offsetWidth
  $tableCanvas.dataset.originalHeight = $tableCanvas.offsetHeight
  $tableCanvas.style.width = `${$tableCanvas.offsetWidth * scale + padding/2}px`
  $tableCanvas.style.height = `${$tableCanvas.offsetHeight * scale + padding/2}px`

  await game.start()
  // await game.act('p1', 'nominate', [114, 'p1']) // TEMP
  // await game.act('p1', 'nominate', [117, 'p2']) // TEMP
  // await game.act('p1', 'next_phase', []) // TEMP
  actionBar = ActionBar(app)
  // Put this after the `await` so we don't have a crazy zoom animation on page load
  $handBar.classList.add('initialized')
  sync()
}

async function sync() {
  const state = await game.getState()
  const draggables = await game.getDraggables(app.currentPlayer)

  state.cards.forEach(card => {
    let domId = objectDomId(card.id)
    let elem = document.getElementById(domId)
    if (!elem) {
      elem = document.createElement('div')
      elem.id = domId
      elem.style.transform = `translate(0px, 0px)`
      elem.className = 'card npc'
      elem.dataset.id = card.id
      elem.dataset.type = card.type
      elem.dataset.name = card.name
      elem.dataset.zone = card.zone
      elem.innerHTML = `
        <div class="card-flipper">
          <div class="card-back"></div>
          <div class="card-front"></div>
        </div>
      `
      addToTable(app, elem, card.zone)
    }
    else {
      syncZone(elem, card.zone)
    }

    elem.dataset.face = card.face
    syncDraggable(draggables, elem, card.id)
    syncWithHand(app, elem)
  })

  state.tokens.forEach(token => {
    let domId = objectDomId(token.id)
    let elem = document.getElementById(domId)
    if (!elem) {
      elem = document.createElement('div')
      elem.id = domId
      elem.style.transform = `translate(0px, 0px)`
      elem.className = 'token npc'
      elem.dataset.id = token.id
      elem.dataset.type = token.type
      elem.dataset.zone = token.zone
      addToTable(app, elem, token.zone)
    }
    else {
      syncZone(elem, token.zone)
    }

    syncDraggable(draggables, elem, token.id)
    syncWithHand(app, elem)
  })

  await actionBar.sync()

  const isHandAvailable = Object.keys(draggables).some(id => findInHand(id))
  $handBar.style.transform = `scale(${scale}) translateY(${isHandAvailable ? '0%' : '100%'})`
}

function addToTable(app, elem, zone) {
  const zoneElem = document.querySelector(zoneToSelector(zone))
  zoneElem.appendChild(elem)
}

function syncWithHand(app, elem) {
  const match = elem.dataset.zone.match(PLAYER_HAND_ZONE)
  // if (!match || match[1] !== app.currentPlayer) return

  const existing = findInHand(elem.dataset.id)

  const oldZone = existing && existing.dataset.zone
  const newZone = elem.dataset.zone

  if (existing && oldZone !== newZone) {
    // $handBar only handles one zone.
    // Therefore, if it's not in this zone, we don't care about it.
    existing.remove()
  }
  else if (existing) {
    // Sync state
    if (elem.dataset.face) {
      existing.dataset.face = elem.dataset.face
    }
    if (elem.dataset.draggable) {
      existing.dataset.draggable = elem.dataset.draggable
    }
    else {
      delete existing.dataset.draggable
    }
  }
  else if (match && match[1] === app.currentPlayer) {
    // Add to hand bar
    const clone = elem.cloneNode(true)
    delete clone.id
    $handBar.querySelector(zoneToSelector(elem.dataset.zone)).appendChild(clone)
  }
}

function syncZone (elem, newZone) {
  const oldZone = elem.dataset.zone
  if (newZone === oldZone) return;

  const handElem = findInHand(elem.dataset.id)
  if (handElem) {
    // Moved element is actually a drag & drop from player's hand!
    // Animate from that position instead.
    // elem.classList.remove('npc')

    // ASSUMPTION: Original element is at translate(0,0)
    // Therefore we only need to take the simple difference.
    const elem_bbox = elem.getBoundingClientRect()
    const old_x = elem_bbox.x / scale
    const old_y = elem_bbox.y / scale

    const new_x = handElem.dataset.dropX / scale
    const new_y = handElem.dataset.dropY / scale
    // No need to delete dropX/Y as handElem will soon be removed by syncWithHand()

    elem.classList.remove('npc')
    void elem.offsetWidth; // recalc to avoid transition animation
    elem.style.transform = `translate(${new_x - old_x}px, ${new_y - old_y}px)`
  }

  // Record position before moving element
  const bbox = elem.getBoundingClientRect()
  const old_x = bbox.x / scale
  const old_y = bbox.y / scale
  const oldTranslate = (elem.style.transform || '').match(TRANSLATE_COORDS)

  const newParent = document.querySelector(zoneToSelector(newZone))
  newParent.appendChild(elem)
  elem.dataset.zone = newZone

  if (oldTranslate) {
    const [tx, ty] = oldTranslate.slice(1).map(Number)
    const bbox_2 = elem.getBoundingClientRect()
    const new_x = (bbox_2.x / scale) - tx
    const new_y = (bbox_2.y / scale)  - ty

    elem.style.transform = `translate(${old_x - new_x}px, ${old_y - new_y}px)`
    requestAnimationFrame(() => {
      elem.classList.add('npc')
      elem.style.transform = `translate(0px, 0px)`
    })
  }
}

function syncDraggable (draggables, elem, id) {
  if (draggables[id]) {
    elem.dataset.draggable = draggables[id]
  }
  else if (elem.dataset.draggable) {
    delete elem.dataset.draggable
  }
}

function findInHand (id) {
  return $handBar.querySelector(`[data-id="${id}"]`)
}

function objectDomId(id) {
  return `obj-${id}`
}
