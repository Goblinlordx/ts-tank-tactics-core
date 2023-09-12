import typia from "typia"
import { parseExpression } from "cron-parser"

export interface Player {
  id: string
}

interface GameEventUpgrade {
  type: "UPGRADE"
  submittedAt: string
  player: number
}
interface GameEventPlace {
  type: "PLACE"
  submittedAt: string
  player: number
  row: number
  col: number
}

interface GameEventMove {
  type: "MOVE"
  submittedAt: string
  player: number
  dir: "UP" | "LEFT" | "RIGHT" | "DOWN"
}

interface GameEventFire {
  type: "FIRE"
  submittedAt: string
  player: number
  target: number
}

interface GameEventVote {
  type: "VOTE"
  submittedAt: string
  player: number
  target: number
}

interface GameEventGiftAP {
  type: "GIFT_AP"
  submittedAt: string
  player: number
  target: number
}

interface GameEventGiftHP {
  type: "GIFT_HP"
  submittedAt: string
  player: number
  target: number
}

interface GameEventTick {
  type: "TICK"
  submittedAt: string
}

export type GameEvent =
  | GameEventFire
  | GameEventMove
  | GameEventPlace
  | GameEventVote
  | GameEventGiftAP
  | GameEventGiftHP
  | GameEventUpgrade
  | GameEventTick

export interface GameConfig {
  players: Player[]
  dimensions: {
    height: number
    width: number
  }
  startAt: string
  turnInterval: string
  turnIntervalTZ: string
}

export interface GamePlayerState {
  placed: boolean
  alive: boolean
  disqualified: boolean
  locRow: number
  locCol: number
  range: number
  ap: number
  hp: number
}

export interface GameState {
  config: GameConfig
  playerStates: GamePlayerState[]
  boardState: (number | null)[][]
  votes: (number | null)[]
  winner: null | number
}

export interface GameProcessState {
  state: GameState
  events: GameEvent[]
  updatedAt: string
}

export const calcDimensions = (playerCount: number) => {
  return Math.ceil((14 * playerCount) ** (1 / 2))
}

export const initialPlacement = (n: number, submittedAt: string): GameEvent[] => {
  const SPP = 16
  const dim = Math.ceil(Math.sqrt(SPP * n))
  const arr = new Array(dim ** 2).fill(0).map((_, i) => i)
  for (let i = 0; i < n; i++) {
    const r = i + Math.floor(Math.random() * (arr.length - 1 - i))
    const tmp = arr[i]
    arr[i] = arr[r]
    arr[r] = tmp
  }

  return arr
    .slice(0, n)
    .map((n) => [Math.floor(n / dim), n % dim])
    .map(([row, col], i) => ({
      type: "PLACE",
      submittedAt,
      player: i,
      row,
      col,
    }))
}

export const initGame = (config: GameConfig): GameState => {
  if (!typia.is<GameConfig>(config)) {
    throw new Error("invalid player input")
  }

  const outputConfig = {
    ...config,
    players: config.players.map(({ id }) => ({ id })),
    dimensions: {
      ...config.dimensions,
    },
  } satisfies GameConfig

  const playerStates: GamePlayerState[] = config.players.map(() => ({
    placed: false,
    alive: true,
    disqualified: false,
    locRow: -1,
    locCol: -1,
    range: 2,
    ap: 0,
    hp: 0,
  }))

  const boardState = Array(outputConfig.dimensions.height)
    .fill(null)
    .map(() => Array(outputConfig.dimensions.width))
  const votes = playerStates.map(() => null)

  return {
    config: outputConfig,
    playerStates,
    boardState,
    votes,
    winner: null,
  }
}

const getVector = (v: unknown) =>
  (
    ({
      UP: [-1, 0],
      LEFT: [0, -1],
      RIGHT: [-1, 0],
      DOWN: [1, 0],
    }) as Record<string, [number, number]>
  )[v as string] ?? null

const processEvent = (event: GameEvent, state: GameState): GameState => {
  if (state.winner != null) {
    throw new Error("game already complete")
  } else if (event.submittedAt <= state.config.startAt) {
    throw new Error("game has not yet started")
  }

  const nextState: GameState = {
    config: {
      ...state.config,
      players: state.config.players.map((p) => ({ ...p })),
      dimensions: { ...state.config.dimensions },
    },
    playerStates: state.playerStates.map((s) => ({ ...s })),
    boardState: state.boardState.map((row) => row.map((value) => value)),
    votes: state.votes.map((v) => v),
    winner: null,
  }

  if (event.type === "TICK") {
    nextState.playerStates
      .filter((ps) => !ps.placed)
      .forEach((ps) => {
        ps.alive = false
        ps.disqualified = true
      })
    const voteCounts = nextState.playerStates.map(() => 0)
    nextState.votes.forEach((v, i) => {
      if (
        !nextState.playerStates[i].disqualified &&
        !nextState.playerStates[i].alive &&
        v != null &&
        nextState.playerStates[v].alive
      ) {
        voteCounts[v]++
      }
    })
    nextState.playerStates.forEach((ps, i) => {
      if (!ps.alive || !ps.placed) return

      const juryAP = Math.floor(voteCounts[i] / 3)
      ps.ap += 1 + juryAP
    })
    nextState.votes = nextState.votes.map(() => null)

    const survivors = nextState.playerStates.map((p, i) => (p.alive ? i : null)).filter((x) => x != null)

    if (survivors.length === 1) {
      nextState.winner = survivors[0]
    } else if (survivors.length === 0) {
      nextState.winner = -1
    }

    return nextState
  }

  const pState = state.playerStates[event.player]
  if (pState.disqualified) {
    throw new Error("invalid action: player has been disqualified")
  }
  if (event.type === "PLACE") {
    if (pState.placed) {
      throw new Error("invalid action: player already placed")
    }
    if (pState.ap < 1) {
      throw new Error("invalid action: player does not have sufficient AP")
    }
    const { row, col } = event
    if (
      row >= nextState.config.dimensions.height - 1 ||
      col >= nextState.config.dimensions.width ||
      row < 0 ||
      col < 0
    ) {
      throw new Error("invalid placement: out of bounds")
    }
    if (nextState.boardState[row][col] != null) {
      throw new Error("invalid placement: space already occupied")
    }

    pState.placed = true
    nextState.boardState[row][col] = event.player
  } else if (event.type === "MOVE") {
    if (!pState.placed) {
      throw new Error("invalid movement: player has not yet placed")
    }
    if (!pState.alive) {
      throw new Error("invalid movement: player has already died")
    }
    if (pState.ap < 1) {
      throw new Error("invalid action: player does not have sufficient AP")
    }

    const vector = getVector(event.dir)
    if (vector == null) {
      throw new Error("invalid movement")
    }
    const row = pState.locRow + vector[0]
    const col = pState.locCol + vector[1]
    if (
      row >= nextState.config.dimensions.height - 1 ||
      col >= nextState.config.dimensions.width ||
      row < 0 ||
      col < 0
    ) {
      throw new Error("invalid movement: out of bounds")
    }
    if (nextState.boardState[row][col] != null) {
      throw new Error("invalid movement: space already occupied")
    }
    pState.ap -= 1
    nextState.boardState[pState.locRow][pState.locCol] = null
    nextState.boardState[row][col] = event.player
    pState.locRow = row
    pState.locCol = col
  } else if (event.type === "FIRE") {
    if (pState.ap < 1) {
      throw new Error("invalid action: player does not have sufficient AP")
    }
    const { target } = event
    if (typeof target !== "number" || target < 0 || target > state.playerStates.length - 1) {
      throw new Error("invalid action: invalid player target")
    }

    const t = nextState.playerStates[target]
    const distance = Math.max(Math.abs(t.locCol - pState.locCol), Math.abs(t.locRow - pState.locCol))
    if (distance > pState.range) {
      throw new Error("invalid action: target out of range")
    }

    t.hp--
    pState.ap--

    if (t.hp <= 0) {
      t.alive = false
      nextState.votes.map((v, i) => (i === target || v === target ? null : v))
      pState.ap += t.ap
      t.ap = 0
    }
  } else if (event.type === "GIFT_AP") {
    if (pState.ap < 1) {
      throw new Error("invalid action: player does not have sufficient AP")
    }
    const { target } = event
    if (typeof target !== "number" || target < 0 || target > state.playerStates.length - 1) {
      throw new Error("invalid action: invalid player target")
    }

    const t = nextState.playerStates[target]
    const distance = Math.max(Math.abs(t.locCol - pState.locCol), Math.abs(t.locRow - pState.locCol))
    if (!t.alive) {
      throw new Error("invalid action: target is already dead")
    }
    if (distance > pState.range) {
      throw new Error("invalid action: target out of range")
    }

    t.ap++
    pState.ap--
  } else if (event.type === "GIFT_HP") {
    if (pState.hp < 1) {
      throw new Error("invalid action: player does not have sufficient AP")
    }
    const { target } = event
    if (typeof target !== "number" || target < 0 || target > state.playerStates.length - 1) {
      throw new Error("invalid action: invalid player target")
    }

    const t = nextState.playerStates[target]
    const distance = Math.max(Math.abs(t.locCol - pState.locCol), Math.abs(t.locRow - pState.locCol))
    if (distance > pState.range) {
      throw new Error("invalid action: target out of range")
    }

    t.hp++
    pState.hp--
    if (pState.hp <= 0) {
      pState.alive = false
    }
  } else if (event.type === "UPGRADE") {
    if (pState.ap < 3) {
      throw new Error("invalid action: player does not have sufficient AP")
    }

    pState.ap -= 3
    pState.range++
  } else if (event.type === "VOTE") {
    if (pState.alive) {
      throw new Error("invalid action: you may only vote when dead")
    }
    if (nextState.votes[event.player] != null) {
      throw new Error("invalid action: you may only vote once per round")
    }

    const { target } = event
    if (!Number.isInteger(target) || Number.isNaN(target) || target < 0 || target < state.playerStates.length - 1) {
      throw new Error("invalid action: invalid target player")
    }

    nextState.votes[event.player] = target
  } else {
    throw new Error("invalid action: invalid action type")
  }

  const survivors = nextState.playerStates.map((p, i) => (p.alive ? i : null)).filter((x) => x != null)

  if (survivors.length === 1) {
    nextState.winner = survivors[0]
  } else if (survivors.length === 0) {
    nextState.winner = -1
  }

  return nextState
}

export const initProcess = (state: GameState): GameProcessState => {
  return {
    state,
    events: [],
    updatedAt: state.config.startAt,
  }
}

export const processEvents = (process: GameProcessState, events: GameEvent[]): GameProcessState => {
  if (events.length === 0) {
    return process
  }

  const sorted = [...events].map((e) => ({ ...e })).sort((a, b) => a.submittedAt < b.submittedAt ? -1 : 1)
  if (sorted[0].submittedAt <= process.updatedAt) {
    throw new Error("invalid events: retroactive events detected")
  }

  const nextProcess = {
    ...process,
    events: [...process.events, ...sorted]
  }

  const interval = parseExpression(process.state.config.turnInterval, {
    currentDate: process.updatedAt,
    tz: process.state.config.turnIntervalTZ,
    iterator: true,
  })


  return process
}

export const calculateState = (at: Date, process: GameProcessState) => {
  const interval = parseExpression(process.state.config.turnInterval, {
    currentDate: process.state.config.startAt,
    tz: process.state.config.turnIntervalTZ,
    iterator: true,
  })
  const until = at.toISOString()

  let nextTick = interval.next().value.toISOString()
  let i = 0
  let currentState = process.state
  while (true) {
    let currentEvent
    if (i < process.events.length) {
      currentEvent = process.events[i]
    }
    if (!currentEvent || currentEvent.submittedAt <= nextTick) {
      currentEvent = {
        type: "TICK",
        submittedAt: nextTick,
      } as GameEventTick
      nextTick = interval.next().value.toISOString()
    } else if (currentEvent) {
      i++
    }
    if (process.updatedAt >= currentEvent.submittedAt) {
      continue
    }
    if (currentEvent.submittedAt > until || currentState.winner != null) {
      break
    }
    currentState = processEvent(currentEvent, currentState)
  }

  return currentState
}
