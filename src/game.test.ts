import { calcDimensions, calculateState, initGame, initProcess } from "./game"

describe("game", () => {
  it("calculates all players disqualified state", () => {
    const t = {
      players: [],
      dimensions: {
        height: 10,
        width: 10,
      },
      tzOffset: 9,
      createdAt: new Date().toISOString(),
      events: [],
    }
    const players = [{ id: "1" }, { id: "2" }]
    const dim = calcDimensions(players.length)
    const g = initGame({
      players,
      dimensions: {
        width: dim,
        height: dim,
      },
      startAt: "2023-09-08T04:00:00.000Z",
      turnInterval: "0 12 * * 1-5",
      turnIntervalTZ: "Asia/Seoul",
    })
    const process = initProcess(g)
    const result = calculateState(new Date("2023-09-11T04:00:00.000Z"), process)
    expect(result.winner).toBe(-1)
  })
})
